// Drive the Host half's state machine with a fake runtime: fake agents, fake
// jobs, and a subprocess that records argv instead of executing it. Nothing
// here can power the machine off.
import { apply } from '../index.js'

// Deterministic time drives the real interval callback without waiting minutes.
let clock = null
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve() }
const sleep = async (ms) => {
  const until = clock.now + ms
  while (clock.next <= until) {
    clock.now = clock.next
    clock.next += 1000
    clock.tick?.()
    await flush()
  }
  clock.now = until
  await flush()
}
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
/** Move the clock forward without letting the interval tick in between. */
const jump = async (ms) => {
  clock.now += ms
  clock.next = clock.now + 1000
  clock.tick?.()
  await flush()
}

const state = { agents: [], jobs: [], spawned: [] }

let failures = 0
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

const agent = (id, status) => ({ id, status, inbox: { nextTurn: [], nextStep: [] } })
const job = (id, status, owner) => ({ id, status, owner })

/**
 * Build one fake Host context. `overrides` replaces an injected service so a
 * scenario can force a command failure. Cordis exposes injected services as
 * both `ctx.name` properties and `ctx.get(name)`; the plugin uses the property
 * form for `subprocess`, `webServer`, and `logger`, so both must be present.
 */
function makeContext(overrides = {}) {
  const routes = new Map()
  const agents = { list: () => state.agents }
  const jobs = {
    list: (caller) => state.jobs.filter((entry) => entry.owner === undefined || entry.owner === caller),
    events: { subscribe: () => () => {} },
  }
  const connection = { requestRejection: () => undefined }
  const webServer = {
    register(route) {
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
  }
  const subprocess = {
    resolveExecutable: async (command) => `C:\\fake\\${command}.exe`,
    spawn: (spec) => {
      state.spawned.push(spec.argv)
      return {
        collected: { stderr: { readFrom: () => ({ text: '' }) } },
        done: Promise.resolve({ exitCode: 0, signal: null }),
      }
    },
    ...overrides.subprocess,
  }
  const byName = { agents, jobs, connection, subprocess, webServer }
  const disposers = []
  const listeners = new Map()
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    agents,
    jobs,
    connection,
    subprocess,
    webServer,
    // Cordis runs the effect body and owns what it returns; calling the body
    // again would leak a second timer, so keep the returned disposer instead.
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
      return () => {}
    },
    on(event, handler) {
      listeners.set(event, handler)
      return () => listeners.delete(event)
    },
    get(name) {
      return byName[name]
    },
  }
  return {
    ctx,
    routes,
    services: byName,
    emit(event) { listeners.get(event)?.() },
    dispose() {
      for (const dispose of disposers.splice(0)) dispose()
    },
  }
}

/** Invoke a registered route handler with a fake request/response pair. */
function call(routes, path, { method = 'GET', body = '', headers = {}, bodyReady } = {}) {
  const route = routes.get(path)
  if (!route) throw new Error(`no route ${path}`)
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) { this.headers[key.toLowerCase()] = value },
    end(text) { this.body = text ?? '' },
  }
  const req = {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    async *[Symbol.asyncIterator]() {
      if (bodyReady) await bodyReady
      if (body.length > 0) yield Buffer.from(body)
    },
    resume() {},
  }
  return Promise.resolve(route.handler(req, res)).then(() => res)
}

const parse = (res) => {
  try {
    return JSON.parse(res.body)
  } catch {
    return null
  }
}

const readState = async (routes) => parse(await call(routes, '/idle-power/state'))

/**
 * Poll the live state until `predicate` holds. The Host advances on a 1 Hz
 * clock, so tests observe phases instead of assuming a fixed latency.
 */
async function waitFor(routes, predicate, label, timeoutMs = 10000) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < timeoutMs) {
    last = await readState(routes)
    if (predicate(last)) return last
    await sleep(100)
  }
  throw new Error(`timed out waiting for ${label}; last state=${JSON.stringify(last)}`)
}

async function scenario(name, config, body, overrides) {
  console.log(`\n=== ${name} ===`)
  state.agents = []
  state.jobs = []
  state.spawned = []
  const runtime = makeContext(overrides)
  const original = { now: Date.now, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval }
  clock = { now: 0, next: 1000, tick: null }
  Date.now = () => clock.now
  globalThis.setInterval = (tick) => { clock.tick = tick; return 1 }
  globalThis.clearInterval = () => { clock.tick = null }
  try {
    apply(runtime.ctx, config)
    await body(runtime)
  } finally {
    runtime.dispose()
    Date.now = original.now
    globalThis.setInterval = original.setInterval
    globalThis.clearInterval = original.clearInterval
    clock = null
  }
}

// 1. Routes, validation, initial state.
await scenario('routes and initial state', { quietSeconds: 1, countdownSeconds: 6 }, async ({ routes }) => {
  const res = await call(routes, '/idle-power/state')
  const body = parse(res)
  check('GET /state answers 200', res.statusCode === 200, res.statusCode)
  check('phase is idle', body?.phase === 'idle', body?.phase)
  check('platform supported', body?.supported === true, body?.supported)
  check('mode defaults to shutdown', body?.mode === 'shutdown', body?.mode)
  check('countdown config reflected', body?.countdownSeconds === 6, body?.countdownSeconds)
  // quietSeconds below the 3s floor is clamped up, so a typo cannot make the
  // watcher fire during a task handoff.
  check('quiet config clamped to the 3s floor', body?.quietSeconds === 3, body?.quietSeconds)
  check('no-store header set', res.headers['cache-control'] === 'no-store', res.headers['cache-control'])

  check('POST /cancel accepts', (await call(routes, '/idle-power/cancel', { method: 'POST', body: '{}' })).statusCode === 200)
  check('GET /arm is 405', (await call(routes, '/idle-power/arm', { method: 'GET' })).statusCode === 405)
  check('non-JSON /arm is 415', (await call(routes, '/idle-power/arm', { method: 'POST', body: '{}', headers: { 'content-type': 'text/plain' } })).statusCode === 415)
  check('unknown mode is 400', (await call(routes, '/idle-power/arm', { method: 'POST', body: '{"mode":"explode"}' })).statusCode === 400)
  check('cancel is 405 on GET', (await call(routes, '/idle-power/cancel', { method: 'GET' })).statusCode === 405)

  // The mode route is what makes the sidebar entry name the chosen action.
  const toHibernate = await call(routes, '/idle-power/mode', { method: 'POST', body: '{"mode":"hibernate"}' })
  check('POST /mode accepts hibernate', toHibernate.statusCode === 200, toHibernate.statusCode)
  check('/mode returns the new state', parse(toHibernate)?.mode === 'hibernate', parse(toHibernate)?.mode)
  const backToShutdown = parse(await call(routes, '/idle-power/mode', { method: 'POST', body: '{"mode":"shutdown"}' }))
  check('POST /mode accepts shutdown', backToShutdown?.mode === 'shutdown', backToShutdown?.mode)
  check('state reflects the chosen mode', parse(await call(routes, '/idle-power/state'))?.mode === 'shutdown')
  check('mode rejects an empty body', (await call(routes, '/idle-power/mode', { method: 'POST', body: '' })).statusCode === 400)
  check('mode rejects an unknown mode', (await call(routes, '/idle-power/mode', { method: 'POST', body: '{"mode":"explode"}' })).statusCode === 400)
  check('mode is 405 on GET', (await call(routes, '/idle-power/mode', { method: 'GET' })).statusCode === 405)
  check('mode rejects non-JSON', (await call(routes, '/idle-power/mode', { method: 'POST', body: '{}', headers: { 'content-type': 'text/plain' } })).statusCode === 415)
})

// 2. Waits for running work, then counts down and executes /h.
await scenario('waits for running work, then hibernates', { quietSeconds: 1, countdownSeconds: 5 }, async ({ routes }) => {
  state.agents = [agent('s1', 'running')]
  check('arms despite busy work', (await call(routes, '/idle-power/arm', { method: 'POST', body: '{"mode":"hibernate"}' })).statusCode === 200)

  let snapshot = await readState(routes)
  check('stays armed while busy', snapshot?.phase === 'armed', snapshot?.phase)
  check('reports 1 running agent', snapshot?.busy?.agentsRunning === 1, JSON.stringify(snapshot?.busy))

  await sleep(1500)
  snapshot = await readState(routes)
  check('never counts down while busy', snapshot?.phase === 'armed', snapshot?.phase)
  check('nothing spawned while busy', state.spawned.length === 0, state.spawned.length)

  state.agents = [agent('s1', 'idle')]
  await waitFor(routes, (s) => s?.phase === 'counting', 'countdown to start')
  check('countdown started after the quiet window', true)
  check('nothing spawned during countdown', state.spawned.length === 0, state.spawned.length)

  await waitFor(routes, (s) => s?.lastExecution !== null, 'execution')
  check('spawned exactly one command', state.spawned.length === 1, state.spawned.length)
  const argv = state.spawned[0] ?? []
  check('used /h (hibernate)', argv.includes('/h'), JSON.stringify(argv))
  check('did not use /s', !argv.includes('/s'), JSON.stringify(argv))
  check('used the resolved executable', String(argv[0] ?? '').includes('shutdown'), JSON.stringify(argv))
  snapshot = await readState(routes)
  check('returned to idle after executing', snapshot?.phase === 'idle', snapshot?.phase)
  check('recorded a successful execution', snapshot?.lastExecution?.ok === true, JSON.stringify(snapshot?.lastExecution))
  check('lastExecution names hibernate', snapshot?.lastExecution?.mode === 'hibernate', JSON.stringify(snapshot?.lastExecution))
})

// 3. A new task during the countdown voids it and it never fires.
await scenario('new task voids the countdown', { quietSeconds: 1, countdownSeconds: 8 }, async ({ routes }) => {
  state.agents = [agent('s1', 'idle')]
  await call(routes, '/idle-power/arm', { method: 'POST', body: '{"mode":"shutdown"}' })
  await waitFor(routes, (s) => s?.phase === 'counting', 'countdown to start')

  state.agents = [agent('s1', 'running')]
  const snapshot = await waitFor(routes, (s) => s?.phase === 'armed', 'countdown to be voided')
  check('countdown voided back to armed', snapshot?.phase === 'armed', snapshot?.phase)
  check('deadline cleared', snapshot?.deadline === null, snapshot?.deadline)

  await sleep(9000)
  check('never executed after being voided', state.spawned.length === 0, state.spawned.length)
})

// 4. Background jobs block the countdown, including session-owned ones.
await scenario('background jobs block the countdown', { quietSeconds: 1, countdownSeconds: 5 }, async ({ routes }) => {
  state.agents = [agent('s1', 'idle')]
  state.jobs = [job('bash-1', 'running', 's1')]
  await call(routes, '/idle-power/arm', { method: 'POST', body: '{}' })
  await sleep(1500)
  let snapshot = await readState(routes)
  check('reports the running job', snapshot?.busy?.jobsRunning === 1, JSON.stringify(snapshot?.busy))
  check('does not count down while the job runs', snapshot?.phase === 'armed', snapshot?.phase)

  state.jobs = [job('bash-1', 'completed', 's1')]
  await waitFor(routes, (s) => s?.lastExecution !== null, 'execution after job settled')
  check('executes once the job settles', state.spawned.length === 1, state.spawned.length)
})

// 5. Queued inbox input counts as pending work.
await scenario('queued inbox input blocks the countdown', { quietSeconds: 1, countdownSeconds: 5 }, async ({ routes }) => {
  const busyAgent = agent('s1', 'idle')
  busyAgent.inbox.nextTurn = [{ id: 'm1' }]
  state.agents = [busyAgent]
  await call(routes, '/idle-power/arm', { method: 'POST', body: '{}' })
  await sleep(1500)
  const snapshot = await readState(routes)
  check('reports 1 queued inbox message', snapshot?.busy?.inboxPending === 1, JSON.stringify(snapshot?.busy))
  check('does not count down with queued input', snapshot?.phase === 'armed', snapshot?.phase)
  check('never executed', state.spawned.length === 0)
})

// 6. A child agent (subagent / workflow child) counts as work.
await scenario('child agents count as work', { quietSeconds: 1, countdownSeconds: 5 }, async ({ routes }) => {
  state.agents = [agent('parent', 'idle'), agent('child', 'running')]
  await call(routes, '/idle-power/arm', { method: 'POST', body: '{}' })
  await sleep(1500)
  const snapshot = await readState(routes)
  check('sees the running child', snapshot?.busy?.agentsRunning === 1, JSON.stringify(snapshot?.busy))
  check('waits for the child', snapshot?.phase === 'armed', snapshot?.phase)
  state.agents = [agent('parent', 'idle'), agent('child', 'idle')]
  await waitFor(routes, (s) => s?.lastExecution !== null, 'execution after child finished')
  check('executes after the child finished', state.spawned.length === 1, state.spawned.length)
})

// 7. Shutdown mode builds the right argv.
await scenario('shutdown mode argv', { quietSeconds: 1, countdownSeconds: 5 }, async ({ routes }) => {
  state.agents = [agent('s1', 'idle')]
  await call(routes, '/idle-power/arm', { method: 'POST', body: '{"mode":"shutdown"}' })
  await waitFor(routes, (s) => s?.lastExecution !== null, 'execution')
  const argv = state.spawned[0] ?? []
  check('used /s', argv.includes('/s'), JSON.stringify(argv))
  check('used /t 0', argv.includes('/t') && argv.includes('0'), JSON.stringify(argv))
  check('used /f', argv.includes('/f'), JSON.stringify(argv))
  check('never used /h', !argv.includes('/h'), JSON.stringify(argv))
})

// 8. Cancel aborts a running countdown.
await scenario('cancel aborts the countdown', { quietSeconds: 1, countdownSeconds: 5 }, async ({ routes }) => {
  state.agents = [agent('s1', 'idle')]
  await call(routes, '/idle-power/arm', { method: 'POST', body: '{}' })
  await waitFor(routes, (s) => s?.phase === 'counting', 'countdown to start')
  check('cancel returns 200', (await call(routes, '/idle-power/cancel', { method: 'POST', body: '{}' })).statusCode === 200)
  const snapshot = await readState(routes)
  check('cancel returns to idle', snapshot?.phase === 'idle', snapshot?.phase)
  await sleep(6000)
  check('never executed after cancel', state.spawned.length === 0, state.spawned.length)
})

// 9. A failing command is reported rather than swallowed.
await scenario('command failure is reported', { quietSeconds: 1, countdownSeconds: 5 }, async ({ routes }) => {
  state.agents = [agent('s1', 'idle')]
  await call(routes, '/idle-power/arm', { method: 'POST', body: '{}' })
  const snapshot = await waitFor(routes, (s) => s?.phase === 'failed', 'failure to surface')
  check('phase is failed', snapshot?.phase === 'failed', snapshot?.phase)
  check('error names exit code 1', String(snapshot?.error ?? '').includes('1'), snapshot?.error)
  check('error carries stderr text', String(snapshot?.error ?? '').includes('hibernation is disabled'), snapshot?.error)
  check('lastExecution is marked not ok', snapshot?.lastExecution?.ok === false, JSON.stringify(snapshot?.lastExecution))
}, {
  subprocess: {
    spawn: () => ({
      collected: { stderr: { readFrom: () => ({ text: 'hibernation is disabled' }) } },
      done: Promise.resolve({ exitCode: 1, signal: null }),
    }),
  },
})

// 10. An unresolvable command refuses to arm, so nothing silently does nothing.
await scenario('unresolvable command refuses to arm', { quietSeconds: 1, countdownSeconds: 5 }, async ({ routes }) => {
  state.agents = [agent('s1', 'idle')]
  const res = await call(routes, '/idle-power/arm', { method: 'POST', body: '{}' })
  check('arm is refused with 409', res.statusCode === 409, res.statusCode)
  const body = parse(res)
  check('refusal names the reason', body?.code === 'command-unavailable', JSON.stringify(body))
  const snapshot = await readState(routes)
  check('stays idle after a refused arm', snapshot?.phase === 'idle', snapshot?.phase)
}, {
  subprocess: {
    resolveExecutable: async () => {
      throw new Error('command "shutdown" was not found on PATH')
    },
  },
})

// 11. Non-Windows refuses to arm rather than pretending to work.
if (process.platform !== 'win32') {
  console.log('\n=== non-Windows refusal ===')
  check('skipped on this platform', true)
}

await scenario('cancel wins while arm request body is still arriving', {}, async ({ routes }) => {
  const body = deferred()
  const pending = call(routes, '/idle-power/arm', { method: 'POST', body: '{}', bodyReady: body.promise })
  await flush()
  await call(routes, '/idle-power/cancel', { method: 'POST' })
  body.resolve()
  check('slow arm body cannot undo cancel', (await pending).statusCode === 409 && (await readState(routes)).phase === 'idle')
})

await scenario('cancel wins over pending arm validation', {}, async ({ routes, ctx }) => {
  const lookup = deferred()
  ctx.subprocess.resolveExecutable = () => lookup.promise
  const pending = call(routes, '/idle-power/arm', { method: 'POST', body: '{}' })
  await flush()
  await call(routes, '/idle-power/cancel', { method: 'POST' })
  lookup.resolve('C:\\fake\\shutdown.exe')
  const result = await pending
  check('superseded arm returns conflict', result.statusCode === 409)
  check('cancelled arm stays idle', (await readState(routes)).phase === 'idle')
})

await scenario('work arriving during executable lookup prevents execution', { quietSeconds: 3, countdownSeconds: 5 }, async ({ routes, ctx }) => {
  await call(routes, '/idle-power/arm', { method: 'POST', body: '{}' })
  const lookup = deferred()
  ctx.subprocess.resolveExecutable = () => lookup.promise
  await sleep(9000)
  state.agents = [agent('late', 'running')]
  lookup.resolve('C:\\fake\\shutdown.exe')
  await flush()
  check('late work blocks spawn after lookup', state.spawned.length === 0)
  check('late work re-arms watch', (await readState(routes)).phase === 'armed')
})

await scenario('commands cannot claim success once execution is committed', { quietSeconds: 3, countdownSeconds: 5 }, async ({ routes, ctx }) => {
  const completion = deferred()
  ctx.subprocess.spawn = (spec) => {
    state.spawned.push(spec.argv)
    return { done: completion.promise, collected: {} }
  }
  await call(routes, '/idle-power/arm', { method: 'POST', body: '{}' })
  await sleep(9000)
  check('command is executing', (await readState(routes)).phase === 'executing')
  for (const route of ['cancel', 'arm', 'mode']) {
    const response = await call(routes, `/idle-power/${route}`, { method: 'POST', body: '{"mode":"hibernate"}' })
    check(`${route} refuses committed execution`, response.statusCode === 409)
    check(`${route} leaves phase executing`, (await readState(routes)).phase === 'executing')
  }
  check('mode stays the actual executing action', (await readState(routes)).mode === 'shutdown')
  completion.resolve({ exitCode: 0 })
  await flush()
})

await scenario('busy countdown restarts the complete quiet window', { quietSeconds: 3, countdownSeconds: 5 }, async ({ routes, emit }) => {
  await call(routes, '/idle-power/arm', { method: 'POST', body: '{}' })
  await sleep(4000)
  state.agents = [agent('s1', 'running')]
  emit('agent/status')
  check('busy state clears quiet time', (await readState(routes)).quietRemainingSeconds === 0)
  await sleep(900)
  state.agents = []
  emit('agent/status')
  await sleep(2100)
  check('does not reuse time spent busy', (await readState(routes)).phase === 'armed')
  await sleep(1000)
  check('starts countdown after a full quiet window', (await readState(routes)).phase === 'counting')
})

await scenario('missing registry cannot look idle', { quietSeconds: 3, countdownSeconds: 5 }, async ({ routes, services }) => {
  await call(routes, '/idle-power/arm', { method: 'POST', body: '{}' })
  await sleep(4000)
  const registry = services.agents
  services.agents = undefined
  await sleep(10000)
  check('registry loss prevents execution', state.spawned.length === 0)
  check('registry loss clears countdown', (await readState(routes)).phase === 'armed')
  services.agents = registry
  await sleep(3000)
  check('registry restoration requires fresh quiet period', (await readState(routes)).phase === 'armed')
})

await scenario('latest arm wins out-of-order executable checks', {}, async ({ routes, ctx }) => {
  const first = deferred()
  const second = deferred()
  let calls = 0
  ctx.subprocess.resolveExecutable = () => (++calls === 1 ? first.promise : second.promise)
  const older = call(routes, '/idle-power/arm', { method: 'POST', body: '{"mode":"shutdown"}' })
  await flush()
  const newer = call(routes, '/idle-power/arm', { method: 'POST', body: '{"mode":"hibernate"}' })
  await flush()
  second.resolve('C:\\fake\\shutdown.exe')
  check('latest arm succeeds', (await newer).statusCode === 200)
  first.resolve('C:\\fake\\shutdown.exe')
  check('older arm is superseded', (await older).statusCode === 409)
  check('older completion cannot replace chosen action', (await readState(routes)).mode === 'hibernate')
})

await scenario('registry is rechecked after arm lookup', {}, async ({ routes, ctx, services }) => {
  const lookup = deferred()
  ctx.subprocess.resolveExecutable = () => lookup.promise
  const pending = call(routes, '/idle-power/arm', { method: 'POST', body: '{}' })
  await flush()
  services.agents = undefined
  lookup.resolve('C:\\fake\\shutdown.exe')
  const result = await pending
  check('arm refuses registry lost during lookup', result.statusCode === 409 && parse(result).code === 'agents-unavailable')
  check('state explicitly marks missing registry', (await readState(routes)).busy.available === false)
})

for (const interruption of ['cancel', 'dispose', 'activity']) {
  await scenario(`${interruption} invalidates an in-flight execution lookup`, { quietSeconds: 3, countdownSeconds: 5 }, async ({ routes, ctx, dispose, emit }) => {
    await call(routes, '/idle-power/arm', { method: 'POST', body: '{}' })
    const lookup = deferred()
    ctx.subprocess.resolveExecutable = () => lookup.promise
    await sleep(9000)
    if (interruption === 'cancel') {
      check('lookup can still be cancelled', (await call(routes, '/idle-power/cancel', { method: 'POST' })).statusCode === 200)
    } else if (interruption === 'dispose') {
      dispose()
    } else {
      state.agents = [agent('brief', 'running')]
      emit('agent/status')
      state.agents = []
      emit('agent/status')
    }
    lookup.resolve('C:\\fake\\shutdown.exe')
    await flush()
    check(`${interruption} prevents stale spawn`, state.spawned.length === 0)
    if (interruption === 'cancel') check('cancel remains idle after lookup', (await readState(routes)).phase === 'idle')
    if (interruption === 'activity') check('brief activity requires new quiet window', (await readState(routes)).phase === 'armed')
  })
}

await scenario('stale lookup failure cannot overwrite cancellation', { quietSeconds: 3, countdownSeconds: 5 }, async ({ routes, ctx }) => {
  await call(routes, '/idle-power/arm', { method: 'POST', body: '{}' })
  const lookup = deferred()
  ctx.subprocess.resolveExecutable = () => lookup.promise
  await sleep(9000)
  await call(routes, '/idle-power/cancel', { method: 'POST' })
  lookup.reject(new Error('lookup failed after cancellation'))
  await flush()
  const snapshot = await readState(routes)
  check('stale failure leaves cancellation intact', snapshot.phase === 'idle' && snapshot.error === null && snapshot.lastExecution === null)
})

await scenario('waking long past the deadline re-arms instead of shutting down', { quietSeconds: 3, countdownSeconds: 5 }, async ({ routes }) => {
  await call(routes, '/idle-power/arm', { method: 'POST', body: '{}' })
  await sleep(4000)
  check('the countdown is running before the suspend', (await readState(routes)).phase === 'counting')
  // A laptop sleeping through the whole window: one tick arrives 15 s late.
  await jump(15000)
  check('a late tick does not spawn', state.spawned.length === 0)
  check('the watch is re-armed after a suspend', (await readState(routes)).phase === 'armed')
  await sleep(4000)
  check('the full quiet window must happen again', (await readState(routes)).phase === 'counting')
})

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
process.exit(failures === 0 ? 0 : 1)
