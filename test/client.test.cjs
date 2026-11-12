// Render the Client half's components with a minimal React stand-in to prove
// each render path produces the expected tree. Hook state is keyed per
// component instance so components cannot leak state into each other, which is
// what a real React tree guarantees. This does not replace looking at the real
// page; it catches crashes and wrong branch selection.
const fs = require('node:fs')
const vm = require('node:vm')

const source = fs.readFileSync(process.argv[2] ?? require('node:path').join(__dirname, '..', 'client.js'), 'utf8')

// --- hook runtime ---------------------------------------------------------
let cursor = 0
let slots = []

function beginComponent() {
  cursor = 0
  slots = []
}

const React = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity).filter((c) => c !== undefined) }
  },
  useState(init) {
    const i = cursor++
    if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init
    return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }]
  },
  useEffect(fn) { cursor++; const cleanup = fn(); return typeof cleanup === 'function' ? cleanup : undefined },
  useCallback(fn) { cursor++; return fn },
  useMemo(fn) { cursor++; return fn() },
  useRef(v) { cursor++; return { current: v } },
}

const requireStub = (spec) => {
  if (spec === 'react') return React
  throw new Error('unexpected require: ' + spec)
}

let factory = null
const listeners = { keydown: [], pointerdown: [] }
const windowStub = {
  __ModuleLoader__: { load: (entry) => { factory = entry.factory } },
  addEventListener(type, fn) { (listeners[type] ??= []).push(fn) },
  removeEventListener(type, fn) {
    const list = listeners[type]
    if (list === undefined) return
    const at = list.indexOf(fn)
    if (at >= 0) list.splice(at, 1)
  },
  innerWidth: 1440,
  innerHeight: 900,
}
/** Fire every captured listener of one type with a synthetic event. */
function fire(type, event) {
  for (const fn of [...(listeners[type] ?? [])]) fn(event)
}
const documentStub = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, remove() {} }),
  head: { appendChild() {} },
}
const fetchStub = async () => ({ ok: true, status: 200, json: async () => ({}) })

const context = vm.createContext({
  window: windowStub,
  document: documentStub,
  fetch: fetchStub,
  console,
  setInterval: () => 1,
  clearInterval() {},
  setTimeout: () => 1,
  clearTimeout() {},
  Date,
  JSON,
})
vm.runInContext(source, context, { filename: 'client.js' })
const moduleObj = factory(requireStub)

// --- capture the plugin's registrations ----------------------------------
const registered = []
const ctx = {
  effect(fn) { const d = fn(); if (typeof d === 'function') d(); return () => {} },
  get: () => undefined,
  locale: { register: () => () => {}, bind: () => (key) => `t(${key})` },
  slots: {
    inject(name, callback) { callback(); return () => {} },
    register(options, component) {
      registered.push({ name: options.name, id: options.id, component })
      return () => {}
    },
  },
}
moduleObj.apply(ctx)

/** Render one element tree, invoking function components with fresh hooks. */
function renderNode(node) {
  if (node === null || node === undefined || node === false || node === true) return null
  if (typeof node === 'string' || typeof node === 'number') return { kind: 'text', text: String(node) }
  if (Array.isArray(node)) return node.map(renderNode).filter(Boolean)
  if (typeof node.type === 'function') {
    beginComponent()
    return renderNode(node.type({ ...node.props, children: node.children }))
  }
  const element = {
    kind: 'element',
    tag: node.type,
    props: node.props,
    children: node.children.map(renderNode).filter(Boolean),
    /** Support the `contains` check an outside-press handler relies on. */
    contains(target) {
      if (target === element) return true
      const seek = (candidate) => {
        if (candidate === null || candidate === undefined) return false
        if (Array.isArray(candidate)) return candidate.some(seek)
        if (candidate === target) return true
        return candidate.kind === 'element' ? candidate.children.some(seek) : false
      }
      return seek(element.children)
    },
  }
  // A real DOM node is reachable through a ref prop; mirror that so ref-based
  // logic runs in tests the way it does in the app.
  if (node.props.ref !== undefined && node.props.ref !== null && typeof node.props.ref === 'object') {
    node.props.ref.current = element
  }
  return element
}

/** Depth-first collect text from a rendered tree. */
function textsOf(tree, out = []) {
  if (tree === null) return out
  if (Array.isArray(tree)) { for (const child of tree) textsOf(child, out); return out }
  if (tree.kind === 'text') { out.push(tree.text); return out }
  for (const child of tree.children) textsOf(child, out)
  return out
}

/** Depth-first collect class names and tags from a rendered tree. */
function classesOf(tree, out = []) {
  if (tree === null) return out
  if (Array.isArray(tree)) { for (const child of tree) classesOf(child, out); return out }
  if (tree.kind !== 'element') return out
  if (typeof tree.props.className === 'string') out.push(tree.props.className)
  for (const child of tree.children) classesOf(child, out)
  return out
}

/** Find the first rendered element whose tag or class matches. */
function findElement(tree, predicate) {
  if (tree === null) return undefined
  if (Array.isArray(tree)) {
    for (const child of tree) { const hit = findElement(child, predicate); if (hit !== undefined) return hit }
    return undefined
  }
  if (tree.kind !== 'element') return undefined
  if (predicate(tree)) return tree
  for (const child of tree.children) { const hit = findElement(child, predicate); if (hit !== undefined) return hit }
  return undefined
}

const baseState = {
  supported: true,
  platform: 'win32',
  phase: 'idle',
  mode: 'hibernate',
  countdownSeconds: 60,
  quietSeconds: 20,
  remainingSeconds: 0,
  quietRemainingSeconds: 0,
  deadline: null,
  busy: { agentsRunning: 0, inboxPending: 0, jobsRunning: 0, total: 0 },
  error: null,
  lastExecution: null,
}

let failures = 0
function check(label, condition, detail) {
  if (condition) console.log(`  PASS  ${label}`)
  else { failures += 1; console.log(`  FAIL  ${label}${detail === undefined ? '' : ` — ${detail}`}`) }
}

const byId = (id) => registered.find((entry) => entry.id === id)

/** Render one registered entry with its injected props. */
function renderEntry(entry, storeValue, actions = {}, ownerProps = {}) {
  const props = {
    usePower: (selector) => (selector ? selector(storeValue) : storeValue),
    t: (key) => key,
    open: () => {},
    close: () => {},
    arm: async () => true,
    cancel: async () => true,
    setMode: async () => true,
    ...ownerProps,
    ...actions,
  }
  beginComponent()
  const root = entry.component(props)
  return { root, tree: renderNode(root) }
}

const button = byId('dsh-idle-power')
const panel = byId('dsh-idle-power.panel')
const countdown = byId('dsh-idle-power.countdown')

console.log('=== registrations ===')
for (const entry of registered) console.log(' ', entry.name, '|', entry.id)
check('sidebar button registered', button?.name === 'sidebar.footer.action', button?.name)
check('panel registered in shell.overlay', panel?.name === 'shell.overlay', panel?.name)
check('countdown registered in shell.overlay', countdown?.name === 'shell.overlay', countdown?.name)

console.log('\n=== sidebar button: expanded (wide) ===')
{
  // The expanded sidebar must show a readable row, not a bare glyph: the glyph
  // alone was invisible next to the plugin button.
  const idle = renderEntry(button, { data: baseState, offline: false }, {}, { wide: true })
  const idleTree = renderNode(idle.root)
  check('wide renders a row, not the icon', idle.root.props.className === 'ipa-entry', idle.root.props.className)
  // The label must name hibernate, not shutdown: shutdown is not the default.
  check('row names hibernate by default', textsOf(idleTree).join('|').includes('mode.hibernate.short'), textsOf(idleTree).join('|'))
  check('row never says plain shutdown while hibernate is selected', !textsOf(idleTree).join('|').includes('mode.shutdown.short'), textsOf(idleTree).join('|'))
  check('row offers to schedule', textsOf(idleTree).join('|').includes('entry.schedulePrefix'))
  check('row still renders the power glyph', findElement(idleTree, (n) => n.tag === 'svg') !== undefined)
  check('row exposes the same label to a11y', idle.root.props['aria-label'] === 'entry.schedulePrefixmode.hibernate.short', idle.root.props['aria-label'])

  const shutdownIdle = renderEntry(button, { data: { ...baseState, mode: 'shutdown' }, offline: false }, {}, { wide: true })
  const shutdownText = textsOf(renderNode(shutdownIdle.root)).join('|')
  check('row names shutdown once that mode is chosen', shutdownText.includes('mode.shutdown.short'), shutdownText)
  check('row drops hibernate wording then', !shutdownText.includes('mode.hibernate.short'), shutdownText)

  const armed = renderEntry(button, { data: { ...baseState, phase: 'armed', busy: { ...baseState.busy, total: 3 } }, offline: false }, {}, { wide: true })
  const armedText = textsOf(renderNode(armed.root)).join('|')
  check('row reports waiting', armedText.includes('status.waiting'), armedText)
  check('row reports the task count', armedText.includes('3'), armedText)
  check('row is marked active', armed.root.props['data-active'] === true, String(armed.root.props['data-active']))

  const counting = renderEntry(button, { data: { ...baseState, phase: 'counting', remainingSeconds: 42, deadline: Date.now() + 42000 }, offline: false }, {}, { wide: true })
  const countingText = textsOf(renderNode(counting.root)).join('|')
  check('row shows remaining seconds', countingText.includes('42'), countingText)
  check('countdown names the action', countingText.includes('mode.hibernate.short'), countingText)
  check('row carries the phase attribute', counting.root.props['data-phase'] === 'counting')
  const countingShutdown = renderEntry(button, { data: { ...baseState, phase: 'counting', mode: 'shutdown', remainingSeconds: 30 }, offline: false }, {}, { wide: true })
  check('countdown names shutdown when that mode is chosen', textsOf(renderNode(countingShutdown.root)).join('|').includes('mode.shutdown.short'), textsOf(renderNode(countingShutdown.root)).join('|'))
}

console.log('\n=== sidebar button: collapsed (rail) ===')
{
  const idle = renderEntry(button, { data: baseState, offline: false }, {}, { wide: false })
  check('rail renders the compact icon', idle.root.props.className === 'ipa-fab', idle.root.props.className)
  const tree = renderNode(idle.root)
  check('rail renders a button element', findElement(tree, (n) => n.tag === 'button') !== undefined || idle.root.type === 'button')
  check('no status dot when idle', !classesOf(tree).some((c) => c.includes('ipa-dot')), classesOf(tree).join(','))
  check('rail aria-label is the schedule hint', idle.root.props['aria-label'] === 'button.tip', idle.root.props['aria-label'])
  check('rail renders the power glyph as svg', findElement(tree, (n) => n.tag === 'svg') !== undefined)

  const armed = renderEntry(button, { data: { ...baseState, phase: 'armed', busy: { ...baseState.busy, total: 2 } }, offline: false }, {}, { wide: false })
  check('rail status dot shows', classesOf(renderNode(armed.root)).some((c) => c.includes('ipa-dot')), classesOf(renderNode(armed.root)).join(','))
  check('rail marked active', armed.root.props['data-active'] === true, String(armed.root.props['data-active']))
  check('rail aria-label reports waiting', armed.root.props['aria-label'] === 'status.waiting', armed.root.props['aria-label'])
}

console.log('\n=== sidebar button: offline and unsupported ===')
{
  const offlineWide = renderEntry(button, { data: baseState, offline: true }, {}, { wide: true })
  check('offline label surfaces when wide', textsOf(renderNode(offlineWide.root)).join('|').includes('status.offline'), textsOf(renderNode(offlineWide.root)).join('|'))

  const unsupportedWide = renderEntry(button, { data: { ...baseState, supported: false, platform: 'linux' }, offline: false }, {}, { wide: true })
  check('unsupported label surfaces when wide', textsOf(renderNode(unsupportedWide.root)).join('|').includes('status.unsupported'))

  const offlineRail = renderEntry(button, { data: baseState, offline: true }, {}, { wide: false })
  check('offline label surfaces in the rail', offlineRail.root.props['aria-label'] === 'status.offline', offlineRail.root.props['aria-label'])

  const unsupportedRail = renderEntry(button, { data: { ...baseState, supported: false }, offline: false }, {}, { wide: false })
  check('unsupported label surfaces in the rail', unsupportedRail.root.props['aria-label'] === 'status.unsupported', unsupportedRail.root.props['aria-label'])
}

console.log('\n=== panel: closed ===')
{
  const { root } = renderEntry(panel, { data: baseState, panelOpen: false })
  check('closed panel renders null', root === null, String(root))
}

console.log('\n=== panel: open ===')
{
  const open = { data: baseState, ready: true, offline: false, busy: false, note: null, panelOpen: true }
  const { tree } = renderEntry(panel, open)
  const dialog = findElement(tree, (n) => n.props.role === 'dialog')
  check('renders a dialog', dialog !== undefined)
  check('labels the dialog', dialog?.props['aria-label'] === 'panel.title', dialog?.props['aria-label'])
  check('has a radiogroup', findElement(tree, (n) => n.props.role === 'radiogroup') !== undefined)
  const texts = textsOf(tree)
  check('offers hibernate', texts.includes('panel.hibernate'), texts.join('|'))
  check('offers shutdown', texts.includes('panel.shutdown'), texts.join('|'))
  check('describes hibernate', texts.includes('panel.hibernateDesc'), texts.join('|'))
  check('status reads idle', texts.includes('status.idle'), texts.join('|'))
  check('shows the arm button', texts.includes('panel.arm'), texts.join('|'))
  const radios = []
  ;(function walk(node) {
    if (node === null) return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (node.kind !== 'element') return
    if (node.props.role === 'radio') radios.push(node)
    node.children.forEach(walk)
  })(tree)
  check('renders two mode radios', radios.length === 2, radios.length)
  check('hibernate is checked by default', radios[0]?.props['aria-checked'] === true, String(radios[0]?.props['aria-checked']))
}

console.log('\n=== panel: armed ===')
{
  const armed = { data: { ...baseState, phase: 'armed', quietRemainingSeconds: 12 }, ready: true, offline: false, busy: false, note: null, panelOpen: true }
  const { tree } = renderEntry(panel, armed)
  const texts = textsOf(tree)
  const joined = texts.join('|')
  check('shows the quiet countdown copy', joined.includes('status.quietPrefix'), joined)
  check('shows the remaining quiet seconds', joined.includes('12'), joined)
  check('offers cancel when armed', texts.includes('panel.cancel'), joined)
  // Regression: showing 预约 and 取消预约 together made an armed reservation
  // look like nothing had happened.
  check('does NOT still offer 预约 while armed', !texts.includes('panel.arm'), joined)
  const primary = findElement(tree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-cancel'))
  check('cancel is the primary action', primary !== undefined)
  check('only one action button is rendered', texts.filter((s) => s === 'panel.arm' || s === 'panel.cancel').length === 1, joined)
}

console.log('\n=== panel: armed with running work ===')
{
  const armed = { data: { ...baseState, phase: 'armed', busy: { agentsRunning: 3, inboxPending: 0, jobsRunning: 2, total: 5 } }, ready: true, offline: false, busy: false, note: null, panelOpen: true }
  const { tree } = renderEntry(panel, armed)
  const texts = textsOf(tree)
  const joined = texts.join('|')
  check('reports how many tasks are running', joined.includes('5'), joined)
  check('still offers cancel, not 预约', texts.includes('panel.cancel') && !texts.includes('panel.arm'), joined)
}

console.log('\n=== panel: idle still offers 预约 ===')
{
  const idle = { data: baseState, ready: true, offline: false, busy: false, note: null, panelOpen: true }
  const { tree } = renderEntry(panel, idle)
  const texts = textsOf(tree)
  check('shows 预约 when idle', texts.includes('panel.arm'), texts.join('|'))
  check('does not show cancel when idle', !texts.includes('panel.cancel'), texts.join('|'))
}

console.log('\n=== panel: placement above the trigger ===')
{
  // Regression: the panel used a fixed bottom offset and opened ON TOP of the
  // foot row, hiding the very entry it belongs to.
  const anchored = {
    data: baseState, ready: true, offline: false, busy: false, note: null, panelOpen: true,
    anchor: { top: 840, bottom: 876, left: 10, right: 340 },
  }
  const { tree } = renderEntry(panel, anchored)
  const card = findElement(tree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-panel'))
  check('panel renders', card !== undefined)
  // window.innerHeight (900) - anchor.top (840) + 8 = 68px from the bottom,
  // which puts the card's lower edge above the trigger's upper edge.
  check('panel sits above the trigger top', card?.props.style?.bottom === '68px', JSON.stringify(card?.props.style))
  check('panel aligns to the trigger left edge', card?.props.style?.left === '10px', JSON.stringify(card?.props.style))

  const nearEdge = {
    data: baseState, ready: true, offline: false, busy: false, note: null, panelOpen: true,
    anchor: { top: 500, bottom: 536, left: 1200, right: 1400 },
  }
  const edgeTree = renderEntry(panel, nearEdge).tree
  const edgeCard = findElement(edgeTree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-panel'))
  check('panel stays inside the viewport on the right', parseInt(edgeCard?.props.style?.left ?? '9999', 10) <= 1104, edgeCard?.props.style?.left)

  // Without a captured rect the panel must still be usable.
  const noAnchor = { data: baseState, ready: true, offline: false, busy: false, note: null, panelOpen: true, anchor: null }
  const fbTree = renderEntry(panel, noAnchor).tree
  const fbCard = findElement(fbTree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-panel'))
  check('falls back to a sane position without an anchor', fbCard !== undefined && fbCard.props.style.bottom === '150px', JSON.stringify(fbCard?.props.style))
}

console.log('\n=== panel: dismissal ===')
{
  const open = {
    data: baseState, ready: true, offline: false, busy: false, note: null, panelOpen: true,
    anchor: { top: 840, bottom: 876, left: 10, right: 340 },
  }
  let closes = 0
  listeners.keydown.length = 0
  listeners.pointerdown.length = 0
  const rendered = renderEntry(panel, open, { close: () => { closes += 1 } })
  check('registers a keydown listener', listeners.keydown.length === 1, listeners.keydown.length)
  check('registers an outside-press listener', listeners.pointerdown.length === 1, listeners.pointerdown.length)

  fire('keydown', { key: 'Escape' })
  check('Escape dismisses the panel', closes === 1, closes)

  closes = 0
  fire('keydown', { key: 'a' })
  check('other keys do not dismiss', closes === 0, closes)

  // A press inside the card must not dismiss it.
  const card = findElement(rendered.tree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-panel'))
  fire('pointerdown', { target: card })
  check('press inside the card keeps it open', closes === 0, closes)

  // A press on the trigger must not dismiss it, or the click would close and
  // immediately reopen the panel.
  const triggerTarget = { closest: (selector) => (selector === '[data-ipa-trigger]' ? {} : null) }
  fire('pointerdown', { target: triggerTarget })
  check('press on the trigger keeps it open', closes === 0, closes)

  // A press anywhere else dismisses it.
  fire('pointerdown', { target: { closest: () => null } })
  check('outside press dismisses the panel', closes === 1, closes)
}

console.log('\n=== panel: choosing a mode reaches the Host ===')
{
  // Regression: the mode used to be component-local, so clicking 关机 left the
  // sidebar entry still naming 预约休眠.
  const open = { data: { ...baseState, mode: 'hibernate' }, ready: true, offline: false, busy: false, note: null, panelOpen: true }
  const calls = { setMode: [], arm: [] }
  const { tree } = renderEntry(panel, open, {
    setMode: async (m) => { calls.setMode.push(m); return true },
    arm: async (m) => { calls.arm.push(m); return true },
  })
  const radios = []
  ;(function walk(node) {
    if (node === null) return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (node.kind !== 'element') return
    if (node.props.role === 'radio') radios.push(node)
    node.children.forEach(walk)
  })(tree)
  check('two mode radios render', radios.length === 2, radios.length)
  // radios[0] is hibernate, radios[1] is shutdown.
  radios[1].props.onClick()
  check('selecting shutdown asks the Host to store it', calls.setMode.length === 1 && calls.setMode[0] === 'shutdown', JSON.stringify(calls.setMode))
  check('selecting a mode while idle does not arm', calls.arm.length === 0, JSON.stringify(calls.arm))

  const sameCalls = { setMode: [], arm: [] }
  const sameRender = renderEntry(panel, open, {
    setMode: async (m) => { sameCalls.setMode.push(m); return true },
    arm: async (m) => { sameCalls.arm.push(m); return true },
  })
  const sameRadios = []
  ;(function walk(node) {
    if (node === null) return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (node.kind !== 'element') return
    if (node.props.role === 'radio') sameRadios.push(node)
    node.children.forEach(walk)
  })(sameRender.tree)
  sameRadios[0].props.onClick()
  check('clicking the already-selected mode is a no-op', sameCalls.setMode.length === 0 && sameCalls.arm.length === 0, JSON.stringify(sameCalls))
}

console.log('\n=== panel: mode change while armed re-arms ===')
{
  const armed = { data: { ...baseState, phase: 'armed', mode: 'hibernate' }, ready: true, offline: false, busy: false, note: null, panelOpen: true }
  const calls = { setMode: [], arm: [] }
  const { tree } = renderEntry(panel, armed, {
    setMode: async (m) => { calls.setMode.push(m); return true },
    arm: async (m) => { calls.arm.push(m); return true },
  })
  const radios = []
  ;(function walk(node) {
    if (node === null) return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (node.kind !== 'element') return
    if (node.props.role === 'radio') radios.push(node)
    node.children.forEach(walk)
  })(tree)
  radios[1].props.onClick()
  check('armed mode change re-arms with the new mode', calls.arm.length === 1 && calls.arm[0] === 'shutdown', JSON.stringify(calls.arm))
  check('armed mode change does not use the idle path', calls.setMode.length === 0, JSON.stringify(calls.setMode))
}

console.log('\n=== panel: failure ===')
{
  const failed = { data: { ...baseState, phase: 'failed', error: 'shutdown exited 1' }, ready: true, offline: false, busy: false, note: null, panelOpen: true }
  const { tree } = renderEntry(panel, failed)
  const texts = textsOf(tree)
  check('shows failure text', texts.some((s) => s.includes('status.failed')), texts.join('|'))
  check('includes the error detail', texts.some((s) => s.includes('shutdown exited 1')), texts.join('|'))
  const errorTone = findElement(tree, (n) => n.props['data-tone'] === 'error')
  check('marks the status as an error', errorTone !== undefined)
}

console.log('\n=== panel: arm refusal note ===')
{
  const refused = { data: baseState, ready: true, offline: false, busy: false, note: 'command not found', panelOpen: true }
  const { tree } = renderEntry(panel, refused)
  check('surfaces the refusal note', textsOf(tree).some((s) => s.includes('command not found')), textsOf(tree).join('|'))

  // A known Host error code is shown in the reader's language, not as raw server text.
  const coded = {
    data: baseState, ready: true, offline: false, busy: false,
    note: 'the power command is already executing', noteCode: 'execution-in-progress', panelOpen: true,
  }
  const codedT = (key) => (key === 'error.execution-in-progress' ? '电源操作已经开始执行，无法再取消。' : key)
  const codedTexts = textsOf(renderEntry(panel, coded, { t: codedT }).tree)
  check('localizes a known Host error code', codedTexts.some((s) => s.includes('无法再取消')), codedTexts.join('|'))
  check('does not leak the raw message for a known code', !codedTexts.some((s) => s.includes('already executing')), codedTexts.join('|'))
}

console.log('\n=== panel: loading and offline states ===')
{
  const loading = { data: baseState, ready: false, offline: false, busy: false, note: null, panelOpen: true }
  const loadingTree = renderEntry(panel, loading).tree
  check('says it is still loading before the first state', textsOf(loadingTree).includes('status.loading'), textsOf(loadingTree).join('|'))
  const loadingPrimary = findElement(loadingTree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-primary'))
  check('cannot arm before the first state arrives', loadingPrimary?.props.disabled === true, String(loadingPrimary?.props.disabled))

  const offline = { data: baseState, ready: true, offline: true, busy: false, note: null, panelOpen: true }
  const offlineTree = renderEntry(panel, offline).tree
  check('surfaces the offline status', textsOf(offlineTree).includes('status.offline'), textsOf(offlineTree).join('|'))
  check('marks offline as an error tone', findElement(offlineTree, (n) => n.props['data-tone'] === 'error') !== undefined)
  const offlinePrimary = findElement(offlineTree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-primary'))
  check('cannot arm while offline', offlinePrimary?.props.disabled === true, String(offlinePrimary?.props.disabled))
}

console.log('\n=== panel: missing agent registry cannot look idle ===')
{
  const unavailable = {
    data: { ...baseState, busy: { available: false, agentsRunning: 0, inboxPending: 0, jobsRunning: 0, total: 0 } },
    ready: true, offline: false, busy: false, note: null, panelOpen: true,
  }
  const { tree } = renderEntry(panel, unavailable)
  check('explains the paused countdown', textsOf(tree).includes('status.registryUnavailable'), textsOf(tree).join('|'))
  const primary = findElement(tree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-primary'))
  check('refuses to arm without a registry', primary?.props.disabled === true, String(primary?.props.disabled))
}

console.log('\n=== panel: busy breakdown ===')
{
  const armed = {
    data: { ...baseState, phase: 'armed', busy: { available: true, agentsRunning: 2, inboxPending: 1, jobsRunning: 3, total: 6 } },
    ready: true, offline: false, busy: false, note: null, panelOpen: true,
  }
  const { tree } = renderEntry(panel, armed)
  const texts = textsOf(tree)
  check('names running agents', texts.includes('status.agents'), texts.join('|'))
  check('names queued messages', texts.includes('status.inbox'), texts.join('|'))
  check('names background jobs', texts.includes('status.jobs'), texts.join('|'))
  check('shows every count', ['2', '1', '3'].every((n) => texts.includes(n)), texts.join('|'))
  const details = findElement(tree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-details'))
  check('renders the breakdown list', details !== undefined)
}

console.log('\n=== panel: scheduling flow is stated ===')
{
  const { tree } = renderEntry(panel, { data: baseState, ready: true, offline: false, busy: false, note: null, panelOpen: true })
  const flow = findElement(tree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-flow'))
  check('renders the flow block', flow !== undefined)
  const joined = textsOf(tree).join('|')
  check('states the quiet window and the countdown', joined.includes('panel.quiet') && joined.includes('panel.countdown'), joined)
  check('states what is not monitored', joined.includes('panel.scope'), joined)
}

console.log('\n=== countdown: cancel failure is visible ===')
{
  const failedCancel = {
    data: { ...baseState, phase: 'counting', remainingSeconds: 30, countdownSeconds: 60, deadline: Date.now() + 30000 },
    offline: true, busy: false, note: null,
  }
  const { tree } = renderEntry(countdown, failedCancel)
  const alert = findElement(tree, (n) => n.props.role === 'alert')
  check('renders the failure alert', alert !== undefined)
  check('does not claim cancellation succeeded', textsOf(tree).includes('countdown.offline'), textsOf(tree).join('|'))

  const withNote = renderEntry(countdown, {
    data: failedCancel.data, offline: false, busy: false, note: 'HTTP 409',
  })
  check('surfaces the rejection detail', textsOf(withNote.tree).some((s) => s.includes('HTTP 409')), textsOf(withNote.tree).join('|'))

  const busyCancel = renderEntry(countdown, { data: failedCancel.data, offline: false, busy: true, note: null })
  const cta = findElement(busyCancel.tree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-cta'))
  check('marks cancel busy while the request runs', cta?.props['aria-disabled'] === true, String(cta?.props['aria-disabled']))
  check('labels the pending cancel', textsOf(busyCancel.tree).includes('countdown.cancelling'), textsOf(busyCancel.tree).join('|'))
}

console.log('\n=== countdown: shutdown warns about unsaved work ===')
{
  const shutdown = { data: { ...baseState, phase: 'counting', mode: 'shutdown', remainingSeconds: 30, countdownSeconds: 60, deadline: null } }
  const { tree } = renderEntry(countdown, shutdown)
  check('repeats the unsaved-work warning', textsOf(tree).includes('panel.shutdownNote'), textsOf(tree).join('|'))
  const hibernate = { data: { ...baseState, phase: 'counting', mode: 'hibernate', remainingSeconds: 30, countdownSeconds: 60, deadline: null } }
  check('does not show it for hibernate', !textsOf(renderEntry(countdown, hibernate).tree).includes('panel.shutdownNote'))
}

console.log('\n=== trigger: expanded state is exposed ===')
{
  const wide = renderEntry(button, { data: baseState, offline: false, panelOpen: true }, {}, { wide: true })
  check('wide trigger advertises the dialog', wide.root.props['aria-haspopup'] === 'dialog')
  check('wide trigger reports expanded', wide.root.props['aria-expanded'] === true, String(wide.root.props['aria-expanded']))
  const rail = renderEntry(button, { data: baseState, offline: false, panelOpen: false }, {}, { wide: false })
  check('rail trigger reports collapsed', rail.root.props['aria-expanded'] === false, String(rail.root.props['aria-expanded']))
}

console.log('\n=== countdown: hidden unless counting ===')
{
  check('null when idle', renderEntry(countdown, { data: baseState }).root === null)
  check('null when armed', renderEntry(countdown, { data: { ...baseState, phase: 'armed' } }).root === null)
  check('null when failed', renderEntry(countdown, { data: { ...baseState, phase: 'failed' } }).root === null)
}

console.log('\n=== countdown: visible ===')
{
  const counting = { data: { ...baseState, phase: 'counting', mode: 'hibernate', remainingSeconds: 45, countdownSeconds: 60, deadline: null } }
  const { tree } = renderEntry(countdown, counting)
  const classes = classesOf(tree)
  check('renders the scrim', classes.some((c) => c.includes('ipa-scrim')), classes.join(','))
  check('renders a card inside the scrim', classes.some((c) => c.includes('ipa-card')), classes.join(','))
  const dialog = findElement(tree, (n) => n.props['aria-modal'] === true)
  check('is an alert dialog', dialog?.props.role === 'alertdialog', String(dialog?.props.role))
  const texts = textsOf(tree)
  const numeric = texts.filter((s) => /^\d+$/.test(s))
  check('shows a numeric countdown', numeric.length > 0, texts.join('|'))
  check('countdown is a real number, not NaN', numeric.every((s) => Number.isFinite(Number(s))), numeric.join(','))
  check('countdown is within range', numeric.every((s) => Number(s) >= 0 && Number(s) <= 60), numeric.join(','))
  check('names the action', texts.includes('countdown.hibernate'), texts.join('|'))
  check('offers cancel', texts.includes('countdown.cancel'), texts.join('|'))
  check('shows the Esc affordance', texts.includes('Esc'), texts.join('|'))
  check('explains auto-void', texts.includes('countdown.hint'), texts.join('|'))

  // The dial must be a real progress indicator, not decoration.
  const value = findElement(tree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-ringValue'))
  check('renders the progress ring', value !== undefined)
  const circumference = 2 * Math.PI * 54
  check('ring circumference matches the radius', Math.abs(Number(value?.props['stroke-dasharray']) - circumference) < 0.01, String(value?.props['stroke-dasharray']))
  // 45s of 60s left => the arc shows 75% remaining.
  const expected = circumference * (1 - 45 / 60)
  check('ring sweep reflects time remaining', Math.abs(Number(value?.props['stroke-dashoffset']) - expected) < 0.01, `${value?.props['stroke-dashoffset']} vs ${expected}`)
}

console.log('\n=== countdown: ring edge cases ===')
{
  const circumference = 2 * Math.PI * 54
  const dialValue = (data) => {
    const { tree } = renderEntry(countdown, { data })
    const el = findElement(tree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-ringValue'))
    return Number(el?.props['stroke-dashoffset'])
  }
  const full = dialValue({ ...baseState, phase: 'counting', remainingSeconds: 60, countdownSeconds: 60, deadline: null })
  check('full time leaves an empty offset', Math.abs(full) < 0.01, String(full))
  const empty = dialValue({ ...baseState, phase: 'counting', remainingSeconds: 0, countdownSeconds: 60, deadline: null })
  check('zero time sweeps the whole ring', Math.abs(empty - circumference) < 0.01, String(empty))
  const over = dialValue({ ...baseState, phase: 'counting', remainingSeconds: 90, countdownSeconds: 60, deadline: null })
  check('never overshoots when remaining exceeds the window', over >= 0, String(over))
  const zeroTotal = dialValue({ ...baseState, phase: 'counting', remainingSeconds: 30, countdownSeconds: 0, deadline: null })
  check('a zero-length window does not produce NaN', Number.isFinite(zeroTotal), String(zeroTotal))

  // A live deadline must move the ring by fractions, not whole seconds, or the
  // sweep visibly steps once a second.
  const live = dialValue({ ...baseState, phase: 'counting', remainingSeconds: 60, countdownSeconds: 60, deadline: Date.now() + 59900 })
  check('a live deadline advances the ring fractionally', live > 0.01 && live < circumference, String(live))
}

console.log('\n=== countdown: motion hooks ===')
{
  const counting = { data: { ...baseState, phase: 'counting', remainingSeconds: 47, countdownSeconds: 60, deadline: null } }
  const { tree } = renderEntry(countdown, counting)
  const digit = findElement(tree, (n) => typeof n.props.className === 'string' && n.props.className === 'ipa-count')
  check('the digit carries a re-keying hook', digit?.props.key === 47, String(digit?.props.key))
  const now = new Date().getTime()
  const later = renderEntry(countdown, { data: { ...baseState, phase: 'counting', remainingSeconds: 46, countdownSeconds: 60, deadline: null } }).tree
  const digit2 = findElement(later, (n) => typeof n.props.className === 'string' && n.props.className === 'ipa-count')
  check('the key changes when the second changes', digit2?.props.key === 46, String(digit2?.props.key))
  check('the countdown card still renders', findElement(tree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-card')) !== undefined)
  check('ring still present', findElement(tree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-ringValue')) !== undefined)
}

console.log('\n=== motion: reduced-motion coverage in CSS ===')
{
  // The stylesheet is a plain string, so assert on its text directly.
  const fs = require('node:fs')
  const css = fs.readFileSync(process.argv[2] ?? require('node:path').join(__dirname, '..', 'client.js'), 'utf8')
  check('respects prefers-reduced-motion', css.includes('prefers-reduced-motion:reduce'))
  const reduceBlock = css.slice(css.lastIndexOf('prefers-reduced-motion:reduce'))
  for (const sel of ['ipa-panel', 'ipa-count', 'ipa-ringValue', 'ipa-entry']) {
    check(`reduced motion disables ${sel}`, reduceBlock.includes(sel), sel)
  }
  check('animations declare keyframes', css.includes('@keyframes ipa-pop') && css.includes('@keyframes ipa-tick'))
}

console.log('\n=== countdown: urgent near zero ===')
{
  const urgent = { data: { ...baseState, phase: 'counting', mode: 'shutdown', remainingSeconds: 4, countdownSeconds: 60, deadline: Date.now() + 4000 } }
  const { tree } = renderEntry(countdown, urgent)
  const urgentNode = findElement(tree, (n) => typeof n.props['data-urgent'] !== 'undefined')
  check('urgent flag set under 10s', urgentNode !== undefined)
  check('names shutdown', textsOf(tree).includes('countdown.shutdown'), textsOf(tree).join('|'))
  const calm = renderEntry(countdown, { data: { ...baseState, phase: 'counting', remainingSeconds: 40, countdownSeconds: 60, deadline: null } })
  check('no urgent flag when there is time', findElement(calm.tree, (n) => typeof n.props['data-urgent'] !== 'undefined') === undefined)
}

console.log('\n=== countdown: expired deadline clamps at zero ===')
{
  const expired = { data: { ...baseState, phase: 'counting', deadline: Date.now() - 5000, countdownSeconds: 60 } }
  const { tree } = renderEntry(countdown, expired)
  const numeric = textsOf(tree).filter((s) => /^\d+$/.test(s))
  check('never renders a negative number', numeric.every((s) => Number(s) >= 0), numeric.join(','))
  check('renders zero', numeric.includes('0'), numeric.join(','))
  const value = findElement(tree, (n) => typeof n.props.className === 'string' && n.props.className.includes('ipa-ringValue'))
  check('ring is fully swept at zero', Math.abs(Number(value?.props['stroke-dashoffset']) - 2 * Math.PI * 54) < 0.01)
}

console.log('\n=== countdown: no deadline falls back to the server value ===')
{
  const fallback = { data: { ...baseState, phase: 'counting', remainingSeconds: 42, countdownSeconds: 60, deadline: null } }
  const { tree } = renderEntry(countdown, fallback)
  check('uses the server remainingSeconds', textsOf(tree).includes('42'), textsOf(tree).join('|'))
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
process.exit(failures === 0 ? 0 : 1)
