/**
 * Host half of the dsh-idle-power bundle.
 *
 * Watches every live agent and every background job in THIS Host process. Once
 * the whole process has stayed quiet for the configured grace period, it runs a
 * visible countdown in the browser half and then hibernates or powers off.
 *
 * The reservation lives in this process only and is never written to a Session
 * log: a reservation that does not survive a Host restart is the safe default,
 * because a restart means somebody is at the machine.
 */

export const name = 'dsh-idle-power'

/** `agents` is resolved lazily so a profile without the job registry still works. */
export const inject = ['webServer', 'connection', 'subprocess']

const STATE_PATH = '/idle-power/state'
const ARM_PATH = '/idle-power/arm'
const CANCEL_PATH = '/idle-power/cancel'
const MODE_PATH = '/idle-power/mode'

const PHASE_IDLE = 'idle'
const PHASE_ARMED = 'armed'
const PHASE_COUNTING = 'counting'
const PHASE_EXECUTING = 'executing'
const PHASE_FAILED = 'failed'

const MODE_HIBERNATE = 'hibernate'
const MODE_SHUTDOWN = 'shutdown'

const DEFAULT_COUNTDOWN_SECONDS = 60
const DEFAULT_QUIET_SECONDS = 20
const MAX_BODY_BYTES = 64 * 1024
/**
 * A gap this large between the deadline and the next tick means this process was
 * frozen or the machine was suspended, not that a timer merely ran late. Firing
 * a shutdown at the exact moment a laptop wakes is a surprise, so the watch is
 * re-armed instead and the whole quiet window has to happen again.
 */
const RESUME_GAP_MS = 5 * 1000

/** Clamp a configured integer into range, falling back to the default. */
function boundedInteger(value, fallback, min, max) {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
	return Math.min(max, Math.max(min, Math.round(value)))
}

/** One plain-JSON reply. Live state is never cached. */
function sendJson(res, status, payload) {
	res.statusCode = status
	res.setHeader('content-type', 'application/json; charset=utf-8')
	res.setHeader('cache-control', 'no-store')
	res.end(JSON.stringify(payload))
}

/** Refuse a method the route does not serve. */
function sendMethodNotAllowed(res, allow) {
	res.statusCode = 405
	res.setHeader('allow', allow)
	res.end()
}

/** Bound one request body in memory; null means the ceiling was passed. */
async function readBoundedBody(req) {
	const chunks = []
	let size = 0
	for await (const chunk of req) {
		size += chunk.byteLength
		if (size > MAX_BODY_BYTES) {
			req.resume()
			return null
		}
		chunks.push(chunk)
	}
	return Buffer.concat(chunks, size).toString('utf8')
}

/** Parse an optional `{ mode }` body; `{}` means "keep the current mode". */
function parseModeBody(text, currentMode) {
	if (text.trim() === '') return { mode: currentMode }
	let body
	try {
		body = JSON.parse(text)
	} catch {
		return undefined
	}
	if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined
	if (body.mode === undefined) return { mode: currentMode }
	if (body.mode !== MODE_HIBERNATE && body.mode !== MODE_SHUTDOWN) return undefined
	return { mode: body.mode }
}

export function apply(ctx, config) {
	const options = {
		countdownSeconds: boundedInteger(config?.countdownSeconds, DEFAULT_COUNTDOWN_SECONDS, 5, 3600),
		quietSeconds: boundedInteger(config?.quietSeconds, DEFAULT_QUIET_SECONDS, 3, 3600),
		// Default is a real power-off: 关机 unless hibernate is asked for.
		defaultMode: config?.defaultMode === MODE_HIBERNATE ? MODE_HIBERNATE : MODE_SHUTDOWN,
		shutdownCommand:
			typeof config?.shutdownCommand === 'string' && config.shutdownCommand.length > 0
				? config.shutdownCommand
				: 'shutdown',
	}
	const supported = process.platform === 'win32'

	let phase = PHASE_IDLE
	let mode = options.defaultMode
	let quietSince = null
	let deadline = null
	let error = null
	let lastExecution = null
	let executing = false
	let revision = 0
	let disposed = false

	const executionConflict = () => ({ ok: false, code: 'execution-in-progress', message: 'the power command is already executing' })
	const superseded = () => ({ ok: false, code: 'reservation-changed', message: 'the reservation changed while the command was being checked' })

	/**
	 * Count everything this Host is still doing: agent turns, queued inbox work,
	 * and background jobs. Workflow children and subagents are ordinary agents in
	 * `agents.list()`, so they are covered without a separate ledger. Mirrors the
	 * shipped `hasDesktopActiveTasks` predicate in `dsh-desktop-host`.
	 */
	function countBusy() {
		const agents = ctx.get('agents')
		const jobs = ctx.get('jobs')
		const live = agents === undefined ? [] : agents.list()
		let agentsRunning = 0
		let inboxPending = 0
		for (const agent of live) {
			if (agent.status === 'running') agentsRunning += 1
			const inbox = agent.inbox
			inboxPending += (inbox?.nextTurn?.length ?? 0) + (inbox?.nextStep?.length ?? 0)
		}
		let jobsRunning = 0
		if (jobs !== undefined) {
			const seen = new Set()
			for (const owner of [undefined, ...live.map((agent) => agent.id)]) {
				for (const job of jobs.list(owner)) {
					if (seen.has(job.id)) continue
					seen.add(job.id)
					if (job.status === 'running' || job.status === 'stopping') jobsRunning += 1
				}
			}
		}
		return {
			available: agents !== undefined,
			agentsRunning,
			inboxPending,
			jobsRunning,
			total: agentsRunning + inboxPending + jobsRunning,
		}
	}

	/** Snapshot for the browser half. `deadline` lets it tick locally between polls. */
	function stateSnapshot() {
		const busy = countBusy()
		const now = Date.now()
		return {
			supported,
			platform: process.platform,
			phase,
			mode,
			countdownSeconds: options.countdownSeconds,
			quietSeconds: options.quietSeconds,
			remainingSeconds: deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000)),
			quietRemainingSeconds:
				quietSince === null ? 0 : Math.max(0, Math.ceil((quietSince + options.quietSeconds * 1000 - now) / 1000)),
			deadline,
			busy,
			error,
			lastExecution,
		}
	}

	/** Leave every waiting phase and forget the reservation. */
	function reset() {
		revision += 1
		phase = PHASE_IDLE
		quietSince = null
		deadline = null
		error = null
	}

	/**
	 * Advance the state machine. Called once a second and again on every activity
	 * event, so a new task cancels a running countdown promptly instead of one
	 * tick later.
	 */
	function evaluate(now = Date.now()) {
		if (disposed || (phase !== PHASE_ARMED && phase !== PHASE_COUNTING)) return
		const busy = countBusy()
		// Missing registries are unknown activity, never proof of idleness.
		if (!busy.available || busy.total > 0) {
			if (phase === PHASE_COUNTING) revision += 1
			phase = PHASE_ARMED
			deadline = null
			quietSince = null
			return
		}
		if (phase === PHASE_ARMED) {
			if (quietSince === null) {
				quietSince = now
				return
			}
			if (now - quietSince >= options.quietSeconds * 1000) {
				phase = PHASE_COUNTING
				deadline = now + options.countdownSeconds * 1000
				quietSince = null
			}
			return
		}
		if (now >= deadline) {
			if (now - deadline > RESUME_GAP_MS) {
				revision += 1
				phase = PHASE_ARMED
				deadline = null
				quietSince = now
				ctx.logger.info('dsh-idle-power: woke past the countdown deadline; re-armed instead of executing')
				return
			}
			void execute()
		}
	}

	/** Run the reserved power action. A non-zero exit or a spawn failure is reported. */
	async function execute() {
		if (executing || disposed) return
		executing = true
		const attempt = revision
		const actionMode = mode
		try {
			const executable = await ctx.subprocess.resolveExecutable(options.shutdownCommand)
			if (disposed || revision !== attempt || phase !== PHASE_COUNTING) return
			// Resolving PATH may yield while new work arrives. Recheck immediately
			// before spawn, with no asynchronous boundary after this check.
			const busy = countBusy()
			if (!busy.available || busy.total > 0) {
				evaluate()
				return
			}
			phase = PHASE_EXECUTING
			deadline = null
			const argv =
				actionMode === MODE_HIBERNATE
					? [executable, '/h', '/f']
					: [executable, '/s', '/t', '0', '/f', '/c', 'DeepSeek Harness: all tasks finished']
			const handle = ctx.subprocess.spawn({
				argv,
				cwd: process.cwd(),
				stdio: {
					stdin: 'ignore',
					stdout: { maxBytes: 16 * 1024 },
					stderr: { maxBytes: 16 * 1024 },
				},
				graceMs: 5000,
			})
			const outcome = await handle.done
			const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
			if (outcome.exitCode !== 0) {
				const detail = stderr.trim()
				phase = PHASE_FAILED
				error = `${options.shutdownCommand} exited ${String(outcome.exitCode)}${detail.length > 0 ? `: ${detail}` : ''}`
				lastExecution = { mode: actionMode, at: Date.now(), ok: false }
				return
			}
			ctx.logger.info(`dsh-idle-power: ${actionMode} command accepted`)
			phase = PHASE_IDLE
			error = null
			lastExecution = { mode: actionMode, at: Date.now(), ok: true }
		} catch (failure) {
			if (disposed || revision !== attempt) return
			deadline = null
			phase = PHASE_FAILED
			error = failure instanceof Error ? failure.message : String(failure)
			lastExecution = { mode: actionMode, at: Date.now(), ok: false }
			ctx.logger.warn(`dsh-idle-power: ${actionMode} failed: ${error}`)
		} finally {
			executing = false
		}
	}

	/**
	 * Arm a reservation, refusing a machine or command that cannot honour it.
	 * `entryRevision` is the revision observed when the request arrived: if the
	 * reservation changed while the body was still uploading, this request is
	 * stale and must not recreate it after a later cancel.
	 */
	async function arm(requestedMode, entryRevision) {
		if (entryRevision !== undefined && revision !== entryRevision) return superseded()
		if (phase === PHASE_EXECUTING) return executionConflict()
		if (disposed) return superseded()
		if (!supported) {
			return { ok: false, code: 'unsupported-platform', message: `unsupported platform: ${process.platform}` }
		}
		if (ctx.get('agents') === undefined) {
			return { ok: false, code: 'agents-unavailable', message: 'the agent registry is unavailable' }
		}
		const attempt = ++revision
		try {
			await ctx.subprocess.resolveExecutable(options.shutdownCommand)
		} catch (failure) {
			if (disposed || revision !== attempt) return superseded()
			return {
				ok: false,
				code: 'command-unavailable',
				message: failure instanceof Error ? failure.message : String(failure),
			}
		}
		if (disposed || revision !== attempt) return superseded()
		if (phase === PHASE_EXECUTING) return executionConflict()
		if (ctx.get('agents') === undefined) {
			return { ok: false, code: 'agents-unavailable', message: 'the agent registry is unavailable' }
		}
		// Invalidate any countdown lookup that started while validation yielded.
		revision += 1
		mode = requestedMode
		phase = PHASE_ARMED
		quietSince = null
		deadline = null
		error = null
		ctx.logger.info(`dsh-idle-power: armed for ${mode} after ${options.quietSeconds}s quiet`)
		return { ok: true }
	}

	/** The one fence every route runs first: Host/Origin trust plus browser authentication. */
	function rejected(req, res) {
		const connection = ctx.get('connection')
		const rejection = connection === undefined ? undefined : connection.requestRejection(req)
		if (rejection === undefined) return false
		res.statusCode = rejection
		res.end()
		return true
	}

	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: STATE_PATH,
		handler: (req, res) => {
			if (rejected(req, res)) return
			if (req.method !== 'GET') {
				sendMethodNotAllowed(res, 'GET')
				return
			}
			sendJson(res, 200, stateSnapshot())
		},
	}), `dsh-idle-power: GET ${STATE_PATH}`)

	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: ARM_PATH,
		handler: async (req, res) => {
			if (rejected(req, res)) return
			if (req.method !== 'POST') {
				sendMethodNotAllowed(res, 'POST')
				return
			}
			// Take the revision before the awaited body read: a cancel that lands
			// while the body is still arriving must win over this arm.
			const entryRevision = revision
			const essence = String(req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
			if (essence !== 'application/json') {
				sendJson(res, 415, { code: 'unsupported-media-type', message: 'content-type must be application/json' })
				return
			}
			const text = await readBoundedBody(req)
			if (text === null) {
				sendJson(res, 413, { code: 'payload-too-large', message: 'request body is too large' })
				return
			}
			const parsed = parseModeBody(text, mode)
			if (parsed === undefined) {
				sendJson(res, 400, { code: 'bad-request', message: 'body must be {"mode":"hibernate"|"shutdown"}' })
				return
			}
			const outcome = await arm(parsed.mode, entryRevision)
			if (!outcome.ok) {
				sendJson(res, 409, { code: outcome.code, message: outcome.message })
				return
			}
			sendJson(res, 200, stateSnapshot())
		},
	}), `dsh-idle-power: POST ${ARM_PATH}`)

	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: MODE_PATH,
		handler: async (req, res) => {
			if (rejected(req, res)) return
			if (req.method !== 'POST') {
				sendMethodNotAllowed(res, 'POST')
				return
			}
			const essence = String(req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
			if (essence !== 'application/json') {
				sendJson(res, 415, { code: 'unsupported-media-type', message: 'content-type must be application/json' })
				return
			}
			const text = await readBoundedBody(req)
			if (text === null) {
				sendJson(res, 413, { code: 'payload-too-large', message: 'request body is too large' })
				return
			}
			// A mode change must be explicit: an empty body would otherwise read
			// as "keep the current mode" and do nothing.
			let parsed
			try {
				parsed = JSON.parse(text)
			} catch {
				parsed = undefined
			}
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
				sendJson(res, 400, { code: 'bad-request', message: 'body must be {"mode":"hibernate"|"shutdown"}' })
				return
			}
			if (parsed.mode !== MODE_HIBERNATE && parsed.mode !== MODE_SHUTDOWN) {
				sendJson(res, 400, { code: 'bad-request', message: 'mode must be "hibernate" or "shutdown"' })
				return
			}
			if (phase === PHASE_EXECUTING) {
				sendJson(res, 409, executionConflict())
				return
			}
			revision += 1
			mode = parsed.mode
			sendJson(res, 200, stateSnapshot())
		},
	}), `dsh-idle-power: POST ${MODE_PATH}`)

	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: CANCEL_PATH,
		handler: (req, res) => {
			if (rejected(req, res)) return
			if (req.method !== 'POST') {
				sendMethodNotAllowed(res, 'POST')
				return
			}
			if (phase === PHASE_EXECUTING) {
				sendJson(res, 409, executionConflict())
				return
			}
			reset()
			sendJson(res, 200, stateSnapshot())
		},
	}), `dsh-idle-power: POST ${CANCEL_PATH}`)

	// The one authoritative clock, plus event nudges so a countdown is voided as
	// soon as work reappears rather than up to a second later.
	ctx.effect(() => {
		const timer = setInterval(() => evaluate(), 1000)
		return () => {
			disposed = true
			revision += 1
			clearInterval(timer)
		}
	}, 'dsh-idle-power: watcher')

	const nudge = () => {
		if (phase === PHASE_ARMED || phase === PHASE_COUNTING) evaluate()
	}
	ctx.on('agent/status', nudge)
	ctx.on('agent/inbox/inserted', nudge)
	ctx.on('agent/created', nudge)
	ctx.on('agent/disposed', nudge)

	ctx.effect(() => {
		const jobs = ctx.get('jobs')
		if (jobs === undefined) return () => {}
		return jobs.events.subscribe({ owners: 'all' }, nudge)
	}, 'dsh-idle-power: job events')
}
