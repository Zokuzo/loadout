import { expect, mock, test as timed } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { AgentInfo, On, SessionUsage, UiPane } from 'claude-code'

import { ASSUMED, CLEAR, blank, coloursOf, mirrored, paint, pixelsOf as pixelsIn, scaled, sourceOf } from '../hooks/canvas'
import type { Canvas } from '../hooks/canvas'
import { BLEND_MS, CALM_MS, CYCLE_MS, FLOURISH_NAMES, HERO_ROWS, beatAfter, flourishAt, flourishOf, heroCanvas, heroGrid, heroPose, isAtRest } from '../hooks/cyber'
import type { Beat, Moment, Who } from '../hooks/cyber'
import { FAMILIES, GROUNDS, familyOf, frameOf, framesOf, groundOf, isLightOf, nameOf, pixelsOf, themed, wantedOf } from '../hooks/families'
import type { Look, SpriteFamily, TextFamily } from '../hooks/families'
import { INKS } from '../hooks/gamesprites'
import { HI, clawdMini, kirbyMini } from '../hooks/hires'
import { CAST, FEED_SHAPE, SLOTS, frameAt, reelOf, slotOf } from '../hooks/reel'
import type { Slot } from '../hooks/reel'
import { MASK_COLUMNS, MASK_LEAST, MASK_ROWS, NONE, SKINS, TAGS, agentRows, blockRowsOf, hex, maskFrame, modelTag, stateOf, textOf } from '../hooks/hud'
import type { Grid, Runner, Skin, State } from '../hooks/hud'
import { sheen } from '../hooks/hudpane'
import { OBJECT_ROWS, chromeFrame, isChrome } from '../hooks/chrome'
import { cueOf, haloFrame, haloLive, isHalo } from '../hooks/halo'
import type { Pose as HiPose } from '../hooks/hires'
import { CHROME_ROWS, laidOut, laidOutArt, laidOutText, mascotBlocks } from '../hooks/layout'
import { FORMS, formOf } from '../hooks/look'
import type { Form } from '../hooks/look'
import { CLAWD, CLAWD_BLEND_MS, CLAWD_LOOP_MS, clawdFrame, isClawdAtRest } from '../hooks/clawd'
import { norm, packFiles, packOf, packsOf, resolve } from '../hooks/packs'
import type { Pack } from '../hooks/packs'
import { BUILT_IN, askOf, liveSource, liveText, pinLines, settingOf, withTheme } from '../hooks/themes'
import type { Family } from '../hooks/look'
import { HEADROOM, mascotFrame, shakeAt } from '../hooks/mascot'
import type { Mood } from '../hooks/mascot'
import { GROUND_PX, NARROWEST_PX, REACH_PX, STAGE_PX, capOf as capArt, stageFrame, stagedOf as stagedArt } from '../hooks/scene'
import { CYAN, GOLD, HAT_INKS, IMPACT, MARKER, MINI_WIDTH, STREAK, SWAPS, colorOf, miniOf } from '../hooks/minis'
import { KIRBY } from '../hooks/sprite'
import type { Pose } from '../hooks/minis'
import { LEAVE_MS, NARROWEST, SKY, STAGE_ROWS, TICK_MS, actOf, capOf, sceneOf, stagedOf } from '../hooks/stage'
import type { Agent } from '../hooks/stage'

// A test's limit is wall-clock time, and what these tests do is compute: frames, scenes, layouts. On a
// machine busy with something else the same work takes several times as long, and the kit's default
// of five seconds, which the longest of them once came within a factor of two of, was crossed (three
// tests failed whenever a run took over twice its usual time). So no test's work is near any limit:
// the long ones are cut to a fraction of a second each, and the limit every test runs under is one no
// load reaches, there only to end a test that hangs.
const test = (name: string, body: TestBody) => timed(name, { timeoutMs: 60_000 }, body)

const NOW = Date.parse('2026-10-07T10:00:00Z')
const USAGE: SessionUsage = {
  startedAt: NOW,
  context: { tokens: 40_000, window: 200_000, percent: 20 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-07T12:14:30Z' },
    { kind: 'seven_day', percentUsed: 90, resetsAt: '2026-10-10T14:00:00Z' },
  ],
  cost: { usd: 1.234 },
}
const BAND = {
  plugin: 'loadout',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const
const KIRBY_PANE = {
  plugin: 'loadout',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'kirby',
  props: {
    title: 'Kirby',
    isFocused: false,
    bodyColumns: 22,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const SPAWN = {
  tool_use_id: 'spawn-1',
  prompt: 'look around',
  description: 'scout',
  subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-sonnet-5-5',
  background: false,
  fork: false,
} as const

/** A call as a subagent's loop makes it: the engine stamps `agentId`, which a test's call does not spell. */
const inAgent = <T extends object>(agentId: string, call: T): T => ({ ...call, agentId })

/** Tool calls that stay running until the test finishes them, by their summary. */
function pendingCalls(on: On) {
  const running = new Map<string, () => void>()
  on('tool.call', (_$, e) => new Promise(done => {
    const fields = e as { command?: string; file_path?: string }
    running.set(fields.command ?? fields.file_path ?? '', () => done({ result: 'ok' }))
  }))

  return (summary: string) => running.get(summary)?.()
}

// What `$.agent.list()` answers, for a test to change.
let agents: AgentInfo[] = []
// What `$.ui.panes()` answers: the pane shown, until a test hides it.
const SHOWN: UiPane[] = [{ id: 'kirby', title: 'Kirby', isShown: true, isFocused: false, isPlaced: true }]
let panes: UiPane[] = SHOWN
// What `$.session.model()` answers, and what the settings name as the theme.
let sessionModel = 'claude-sonnet-5-5'
let sessionTheme = 'custom:kirby'

/** The engine beneath the mod: the session's events, and `$.store` from a map the test can read. */
function store(on: On, entries: Record<string, unknown> = {}, theme = 'custom:kirby', model = 'claude-sonnet-5-5') {
  const kept = new Map(Object.entries(entries))
  sessionTheme = theme
  on('config.list', () => ({
    value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: sessionTheme, provider: { plugin: 'engine', tier: 'core' }, isLocked: false }],
  }))
  agents = []
  panes = SHOWN
  sessionModel = model
  on('agent.list', () => ({ value: agents }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.panes', () => ({ value: panes }))
  on('session.model', () => ({ value: sessionModel }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'test' } }))
  on('store.get', (_$, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_$, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })

  return kept
}

test('the pane draws Kirby, cost, limits and context; a pet persists', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const kept = store(on, { pets: 2 }, 'custom:kirby', 'claude-opus-5-5')
  let live: SessionUsage = USAGE
  on('session.usage', () => ({ value: live }))
  const blits: string[] = []
  on('ui.blit', (_$, e) => {
    blits.push('cells' in e ? e.cells : '')

    return { value: {} }
  })

  const finish = pendingCalls(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(KIRBY_PANE)
  const text = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')

  // Kirby is one Raster of little-endian [glyph, fg, bg] u32 triplets;
  // its first cell is empty: a space on the pane's own background, the Kirby theme's.
  const kirby = await ui.find({ type: 'Raster' })
  expect(kirby?.props.columns).toBe(22)
  expect(kirby?.props.rows).toBe(10)
  const bytes = atob(String(kirby?.props.cells))
  expect(bytes.length).toBe(22 * 10 * 12)
  expect([...bytes.slice(0, 12)].map(c => c.charCodeAt(0))).toEqual([0x20, 0, 0, 0, 0x14, 0x24, 0x1b, 0, 0x14, 0x24, 0x1b, 0])

  expect(await text()).toContain('$1.23')
  expect(await text()).toContain('resets in 2h14')
  expect(await text()).toContain('resets in 3d04h')
  expect(await text()).toContain('40k / 200k')
  expect(await text()).toContain('almost used up')

  // The bubble is four rows whatever it says: a running call is named in it, and leaves when it ends.
  const bubbleRows = async () => (await ui.findAll({ type: 'Text' })).filter(t => /[╭│╰]/.test(String(t.text))).length
  const idleRows = await bubbleRows()
  expect(idleRows).toBeGreaterThan(3)
  const call = $.tool.call({ tool: 'Bash', command: 'npm run build' })
  await clock.advance(1)
  expect(await text()).toContain('Bash')
  expect(await text()).toContain('npm run build')
  expect(await text()).not.toContain('almost used up')
  expect(await bubbleRows()).toBe(idleRows)

  // Two overlapping calls: the newer is shown, and when it ends first the older one is shown again.
  const newer = $.tool.call({ tool: 'Read', file_path: '/tmp/notes.md' })
  await clock.advance(1)
  expect(await text()).toContain('/tmp/notes.md')
  finish('/tmp/notes.md')
  await newer
  expect(await text()).not.toContain('/tmp/notes.md')
  expect(await text()).toContain('npm run build')
  finish('npm run build')
  await call
  expect(await text()).not.toContain('npm run build')
  expect(await text()).toContain('almost used up')

  // Petting makes Kirby happy for a few seconds and counts, across sessions.
  const worried = (await ui.find({ type: 'Raster' }))?.props.cells
  await ui.press({ key: 'pet' })
  expect(await text()).toContain('poyo~')
  expect(await text()).toContain('♥ 3')
  expect((await ui.find({ type: 'Raster' }))?.props.cells).not.toBe(worried)
  expect(kept.get('pets')).toBe(3)

  // The animation repaints the mounted Raster frame by frame.
  await clock.advance(4400)
  expect(blits.length).toBeGreaterThan(5)
  expect(new Set(blits).size).toBeGreaterThan(1)

  // A full context says so; a /clear raises no measurement, the next tick re-reads.
  live = { ...USAGE, context: { tokens: 150_000, window: 200_000, percent: 75 } }
  await clock.advance(4400)
  expect(await text()).toContain('time to /clear')
  live = { ...USAGE, context: { window: 200_000 } }
  await clock.advance(4400)
  expect(await text()).not.toContain('time to /clear')

  // The model picks the copy ability where the pane holds it. Too narrow for Sword Kirby, he is never squeezed
  // into it: plain Kirby is drawn, whole, under his own name.
  sessionModel = 'claude-sonnet-5-5'
  await clock.advance(4400)
  expect(await text()).not.toContain('Sword Kirby')
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toContain('Kirby')
  const small = await ui.find({ type: 'Raster' })
  expect([small?.props.columns, small?.props.rows]).toEqual([22, 10])
  await ui.unmount()

  // On a pane wide and tall enough he is whole.
  const wide = await $.ui.mount({ ...KIRBY_PANE, props: { ...KIRBY_PANE.props, bodyColumns: 34, scroll: { offset: 0, bodyRows: 60 } } })
  expect((await wide.findAll({ type: 'Text' })).map(t => t.text)).toContain('Sword Kirby')
  const sword = await wide.find({ type: 'Raster' })
  expect([sword?.props.columns, sword?.props.rows]).toEqual([33, 25])
  expect(atob(String(sword?.props.cells)).length).toBe(33 * 25 * 12)
  await wide.unmount()
})

/** The colours a Raster's cells paint, foregrounds and backgrounds. */
function colours(cells: unknown): Set<number> {
  const bytes = atob(String(cells))
  const found = new Set<number>()
  for (let i = 0; i + 12 <= bytes.length; i += 12) {
    for (const at of [i + 4, i + 8]) found.add(bytes.charCodeAt(at) | (bytes.charCodeAt(at + 1) << 8) | (bytes.charCodeAt(at + 2) << 16))
  }

  return found
}

const TALL = { ...KIRBY_PANE, props: { ...KIRBY_PANE.props, bodyColumns: 34, scroll: { offset: 0, bodyRows: 60 } } }
const LEFT_MS = LEAVE_MS + 100

// An agent's legend line is its dot, in its mini's colour, then what it does, in the theme's text colours.
const isDot = (t: { text: unknown }) => /^[●○] $/.test(String(t.text))
const isLine = (t: { text: unknown }) => /^[●○] ./.test(String(t.text))

test('subagents play on a stage above the mascot while they live, each in its own colour', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on)
  on('session.usage', () => ({ value: USAGE }))
  const blits: { key: string; cells: string }[] = []
  on('ui.blit', (_$, e) => {
    blits.push({ key: e.key, cells: 'cells' in e ? e.cells : '' })

    return { value: {} }
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('classic.SubagentStop', () => ({}))
  const finish = pendingCalls(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  const text = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  const legend = async () => (await ui.findAll({ type: 'Text' })).filter(isLine).filter(t => String(t.text).startsWith('●'))
  const stage = () => ui.find({ key: 'stage' })
  expect(await stage()).toBeUndefined()
  expect((await ui.findAll({ type: 'Raster' })).length).toBe(1)

  // A spawned agent gets a legend line with its task and, under it, the stage, above the bubble and the mascot.
  await $.agent.spawn({ ...SPAWN, description: 'scout the repo' })
  expect((await ui.findAll({ type: 'Raster' })).map(r => r.key)).toEqual(['stage', 'kirby'])
  expect(flow(under(await ui.drawn())).slice(0, 3).map(line => line.slice(0, 2))).toEqual(['● ', '<R', '╭─'])
  const first = await stage()
  expect([first?.props.columns, first?.props.rows]).toEqual([33, STAGE_ROWS])
  expect(atob(String(first?.props.cells)).length).toBe(33 * STAGE_ROWS * 12)
  expect(await text()).toContain('scout the repo')
  expect((await legend()).length).toBe(1)

  // The animation repaints it frame by frame, always at that size.
  await clock.advance(4000)
  const frames = blits.filter(b => b.key === 'stage').map(b => b.cells)
  expect([...new Set(blits.map(b => b.key))].sort()).toEqual(['kirby', 'stage'])
  expect(new Set(frames).size).toBeGreaterThan(3)
  for (const cells of frames) expect(atob(cells).length).toBe(33 * STAGE_ROWS * 12)

  // Its running call is named on its legend line, never in the main loop's bubble.
  const call = $.tool.call(inAgent('a1', { tool: 'Bash', command: 'ls -la' }))
  await clock.advance(1)
  expect(await text()).toContain('ls -la')
  expect((await ui.findAll({ type: 'Text' })).filter(t => /│/.test(String(t.text)) && /ls -la/.test(String(t.text)))).toEqual([])

  // A second agent, known only by its calls, gets another colour, on stage and in the legend.
  const other = $.tool.call(inAgent('a2', { tool: 'Read', file_path: '/tmp/todo.md' }))
  await clock.advance(1)
  const lines = await legend()
  expect(lines.length).toBe(2)
  expect((await ui.findAll({ type: 'Text' })).filter(isDot).map(t => t.props.color)).toEqual([colorOf(0), colorOf(1)])
  expect(lines[1]?.text).toContain('/tmp/todo.md')
  // It drops in with a twinkle: a moment later its mini stands beside the first.
  expect(colours((await stage())?.props.cells).has(SWAPS[1]![0])).toBe(false)
  await clock.advance(4400) // past the next redraw: between two, the frames are blits
  const painted = colours((await stage())?.props.cells)
  expect(painted.has(SWAPS[0]![0])).toBe(true)
  expect(painted.has(SWAPS[1]![0])).toBe(true)

  // A finished agent stays for its dance, then leaves and its legend line goes: by its turn, or by the classic stop event.
  finish('ls -la')
  await call
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false, turnId: 't1' })
  expect((await legend())[0]?.text).toContain('done')
  expect((await legend()).length).toBe(2)
  await clock.advance(LEFT_MS)
  expect(await text()).not.toContain('scout the repo')
  expect((await legend()).length).toBe(1)
  expect(colours((await stage())?.props.cells).has(SWAPS[0]![0])).toBe(false)
  finish('/tmp/todo.md')
  await other
  await $.classic.SubagentStop({ agent_id: 'a2', agent_type: 'general-purpose', agent_transcript_path: '', stop_hook_active: false })
  expect(await stage()).toBeDefined()
  await clock.advance(LEFT_MS)
  expect(await stage()).toBeUndefined()
  expect((await legend()).length).toBe(0)
  await ui.unmount()
})

test('a failed call hurts its mini; more agents than the stage holds are counted', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on)
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  on('tool.call', (_$, e) => ((e as { command?: string }).command === 'false' ? { deny: 'no' } : { result: 'ok' }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  const painted = async () => colours((await ui.find({ key: 'stage' }))?.props.cells)
  const texts = async () => (await ui.findAll({ type: 'Text' })).map(t => String(t.text))

  await $.tool.call(inAgent('a1', { tool: 'Bash', command: 'true' }))
  await clock.advance(2000) // its mini has dropped in
  expect((await painted()).has(IMPACT)).toBe(false)
  await $.tool.call(inAgent('a1', { tool: 'Bash', command: 'false' }))
  expect((await painted()).has(IMPACT)).toBe(true)
  expect((await painted()).has(MARKER)).toBe(false)
  // Between calls, its line says why its mini sits dazed.
  expect((await texts()).some(t => t.startsWith('●') && t.includes('a call failed'))).toBe(true)

  // Five agents: three have a mini on 33 columns, the stage queues the others; the legend names all five.
  const dots = async (dot: string) => (await texts()).filter(t => t === `${dot} `).length
  for (const id of ['a2', 'a3', 'a4', 'a5']) await $.tool.call(inAgent(id, { tool: 'Read', file_path: `/tmp/${id}` }))
  await clock.advance(1)
  expect((await painted()).has(MARKER)).toBe(true)
  expect([await dots('●'), await dots('○')]).toEqual([3, 2])
  expect((await texts()).some(t => t.includes('more'))).toBe(false)

  // Six: still five lines of agents, never a sixth; the last line counts the other.
  await $.tool.call(inAgent('a6', { tool: 'Read', file_path: '/tmp/a6' }))
  await clock.advance(1)
  expect((await dots('●')) + (await dots('○'))).toBe(5)
  expect(await texts()).toContain('+1 more')

  // An agent interrupted, or ended by an error, gets no victory dance: its line says it was stopped, and it leaves.
  await $.turn.complete({ agentId: 'a2', reason: 'aborted', answer: '', durationMs: 1, isAborted: true, turnId: 't2' })
  await $.turn.complete({ agentId: 'a3', reason: 'error', answer: '', durationMs: 1, isAborted: false, turnId: 't3' })
  expect((await texts()).filter(t => /^[●○] ./.test(t) && t.includes('stopped')).length).toBe(2)
  expect((await texts()).some(t => t.includes('done'))).toBe(false)
  await clock.advance(LEFT_MS)
  expect((await texts()).some(t => t.includes('stopped'))).toBe(false)
  expect(await texts()).not.toContain('+1 more')
  await ui.unmount()
})

test('agents alive together wear different colours, up to as many as there are', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on)
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  const lines = async () => (await ui.findAll({ type: 'Text' })).filter(isDot).map(t => t.props.color)

  // As many agents as colours; all but the first and the last finish: the two left side by side differ.
  const ids = SWAPS.map((_swap, i) => `a${i + 1}`)
  for (const id of ids) await $.tool.call(inAgent(id, { tool: 'Read', file_path: `/tmp/${id}` }))
  for (const id of ids.slice(1, -1)) await $.turn.complete({ agentId: id, reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: id })
  await clock.advance(LEFT_MS)
  expect(await lines()).toEqual([colorOf(0), colorOf(SWAPS.length - 1)])
  expect(new Set(SWAPS.map((_swap, slot) => colorOf(slot))).size).toBe(SWAPS.length)

  // The next takes a colour nobody wears, not the one after the last.
  await $.tool.call(inAgent('late', { tool: 'Read', file_path: '/tmp/late' }))
  await clock.advance(1)
  expect(await lines()).toEqual([colorOf(0), colorOf(SWAPS.length - 1), colorOf(1)])
  await ui.unmount()
})

test('the mascot holds still as the stage comes and goes; a short pane keeps the legend alone', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on)
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  const pane = (bodyRows: number) => ({ ...KIRBY_PANE, props: { ...KIRBY_PANE.props, bodyColumns: 34, scroll: { offset: 0, bodyRows } } })
  const CHROME = 14

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(pane(60))
  const mascot = async () => {
    const raster = await ui.find({ key: 'kirby' })

    return [raster?.props.columns, raster?.props.rows, raster?.props.cells]
  }
  const names = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text)

  // 60 rows: Sword Kirby, whole, is the same raster before, with and after the stage, which has the rows he leaves.
  const alone = await mascot()
  expect(alone.slice(0, 2)).toEqual([33, 25])
  expect((await ui.findAll({ type: 'Raster' })).length).toBe(1)
  expect(await names()).toContain('Sword Kirby')
  await $.agent.spawn({ ...SPAWN, description: 'scout the repo' })
  const stage = await ui.find({ key: 'stage' })
  expect(stage?.props.rows).toBe(STAGE_ROWS)
  expect(await mascot()).toEqual(alone)
  expect(await names()).toContain('Sword Kirby')
  expect(CHROME + Number(alone[1]) + Number(stage?.props.rows) + 1).toBeLessThan(61)
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false, turnId: 't1' })
  expect(await mascot()).toEqual(alone)
  await clock.advance(LEFT_MS)
  expect(await ui.find({ key: 'stage' })).toBeUndefined()
  expect((await mascot()).slice(0, 2)).toEqual(alone.slice(0, 2))
  await ui.unmount()

  // 45 rows hold Sword Kirby whole and no stage beside him: he is not shrunk to make it room, the stage gives up its
  // rows, and the agent is a line of legend.
  await $.agent.spawn({ ...SPAWN, description: 'scout the repo' })
  const middle = await $.ui.mount(pane(45))
  const whole = await middle.findAll({ type: 'Raster' })
  expect(whole.map(r => [r.key, r.props.columns, r.props.rows])).toEqual([['kirby', 33, 25]])
  expect((await middle.findAll({ type: 'Text' })).map(t => t.text).join('\n')).toContain('scout the repo')
  await middle.unmount()

  // 30 rows hold neither: plain Kirby is drawn, whole, under his own name; the column stays inside the pane.
  const short = await $.ui.mount(pane(30))
  const rasters = await short.findAll({ type: 'Raster' })
  expect(rasters.map(r => [r.key, r.props.rows])).toEqual([['kirby', 10]])
  expect(CHROME + Number(rasters[0]?.props.rows) + 1).toBeLessThan(31)
  const said = (await short.findAll({ type: 'Text' })).map(t => t.text)
  expect(said.join('\n')).toContain('scout the repo')
  expect([said.includes('Kirby'), said.includes('Sword Kirby')]).toEqual([true, false])
  await short.unmount()
})

test('a mini acts out what its agent does: a tool kind, a failure, the end', () => {
  const agent = (tool?: string): Agent => ({ slot: 0, calls: tool === undefined ? [] : [{ tool }] })
  const acts = { Read: 'inhale', Grep: 'inhale', Edit: 'sword', Bash: 'dash', WebFetch: 'ride', mcp__chrome__click: 'ride', Agent: 'call', Skill: 'sparkle', AskUserQuestion: 'ask', mcp__db__query: 'hop' }
  for (const [tool, act] of Object.entries(acts)) expect(actOf(agent(tool), NOW)).toBe(act)
  expect(actOf(agent(), NOW)).toBe('idle')
  // The newest running call is the one acted out.
  expect(actOf({ slot: 0, calls: [{ tool: 'Read' }, { tool: 'Edit' }] }, NOW)).toBe('sword')

  // A failed call: the hurt tumble for a moment, whatever runs, then back to work.
  const hurt = { ...agent('Read'), hurtAt: NOW }
  expect(actOf(hurt, NOW)).toBe('hurt')
  expect(actOf(hurt, NOW + 3 * TICK_MS)).toBe('hurt')
  expect(actOf(hurt, NOW + 4 * TICK_MS)).toBe('inhale')
  // Between calls it stays dazed, so the failure still shows, until a call ends well.
  const shaken = { ...agent(), hurtAt: NOW }
  expect(actOf(shaken, NOW + 60_000)).toBe('dazed')
  expect(actOf({ ...shaken, hitAt: NOW + 30_000 }, NOW + 60_000)).toBe('idle')
  expect(actOf({ ...shaken, hitAt: NOW - 1 }, NOW + 60_000)).toBe('dazed')

  // The end: about three seconds of dance, then off stage until LEAVE_MS; an agent stopped short faints instead.
  const done = { ...agent(), hurtAt: NOW, doneAt: NOW }
  expect(actOf(done, NOW)).toBe('dance')
  expect(actOf(done, NOW + 3000)).toBe('dance')
  expect(actOf(done, NOW + 3600)).toBe('exit')
  expect(LEAVE_MS).toBeGreaterThan(3600)
  const lost = { ...agent(), doneAt: NOW, isLost: true }
  expect(actOf(lost, NOW)).toBe('faint')
  expect(actOf(lost, NOW + 3000)).toBe('faint')
  expect(actOf(lost, NOW + 3600)).toBe('exit')

  // Each act is its own picture, in both families and in a zone with no room ahead, and the scene is a function of its inputs.
  for (const family of ['kirby', 'clawd'] as Family[]) {
    for (const crowd of [0, 2]) {
      const others: Agent[] = Array.from({ length: crowd }, (_a, i) => ({ slot: i + 1, calls: [] }))
      // Two frames of each: one frame of a hop is one of a thinking mini's hops.
      const drawn = (a: Agent, frame = 1, now = NOW) => JSON.stringify([frame, frame + 1].map(at => sceneOf(family, [a, ...others], at, now, 33)))
      const pictures = ['Read', 'Edit', 'Bash', 'WebFetch', 'Agent', 'Skill', 'AskUserQuestion', 'mcp__db__query'].map(tool => drawn(agent(tool)))
      const more = [drawn(agent()), drawn(hurt), drawn(done), drawn(lost), drawn(shaken, 1, NOW + 60_000)]
      expect(new Set([...pictures, ...more]).size).toBe(pictures.length + more.length)
      expect(drawn(agent('Edit'), 7)).toBe(drawn(agent('Edit'), 7))
    }
  }
})

type Span4 = { left: number; right: number; top: number; bottom: number }
const SLOT_OF = new Map<number, number>(SWAPS.flatMap((swap, slot) => swap.map(color => [color, slot] as const)))

/** Every mini's box on a cell-block scene, by its colours, from the sky down: one pass over the scene. */
function boxesOf(scene: ReturnType<typeof sceneOf>): Map<number, Span4> {
  const boxes = new Map<number, Span4>()
  for (let y = SKY; y < scene.length; y++) {
    scene[y]!.forEach((color, x) => {
      const slot = color === null ? undefined : SLOT_OF.get(color)
      if (slot === undefined) return
      const box = boxes.get(slot)
      boxes.set(slot, box === undefined ? { left: x, right: x, top: y, bottom: y } : { left: Math.min(box.left, x), right: Math.max(box.right, x), top: box.top, bottom: y })
    })
  }

  return boxes
}

test('the stage is always columns by rows, minis never overlap, and the queue is in the sky', () => {
  const tools = [undefined, 'Read', 'Edit', 'Bash', 'WebFetch', 'Agent', 'Skill', 'AskUserQuestion', 'Other']
  const lights = new Set(SWAPS.map(swap => swap[0]))
  // The pixels of a queued agent's head in its colour: all of it, or all but its crown where its model's hat is.
  const headLights = (a: Agent) => (formOf(a.model ?? '') === 'opus' ? 14 : 11)
  const models = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-fable-5']
  // What is wrong with any scene, said once: nothing.
  const wrong: string[] = []
  for (const family of ['kirby', 'clawd'] as Family[]) {
    for (const columns of [NARROWEST, 21, 33, 56]) {
      for (const count of [0, 1, 2, 4, 6]) {
        for (let frame = 0; frame < 48; frame += 1) {
          const now = NOW + frame * TICK_MS
          const where = `${family} ${columns} columns, ${count} agents, frame ${frame}`
          // One fails, one joins late, one finishes, one is stopped short; both are forgotten once they have left. Each wears its model's hat.
          const crew: Agent[] = Array.from({ length: count }, (_a, i): Agent => ({
            slot: i,
            model: models[i % models.length]!,
            calls: [tools[(i * 2 + (frame >> 3)) % tools.length]].flatMap(tool => (tool === undefined ? [] : [{ tool }])),
            ...(i === 1 ? { hurtAt: NOW } : {}),
            ...(i === 2 ? { joinedAt: NOW + 6 * TICK_MS } : {}),
            ...(i === 0 && count > 1 ? { doneAt: NOW + 4 * TICK_MS } : {}),
            ...(i === 3 ? { doneAt: NOW + 9 * TICK_MS, isLost: true, hitAt: NOW + 2 * TICK_MS } : {}),
          })).filter(a => (a.joinedAt ?? 0) <= now && (a.doneAt === undefined || a.doneAt > now || now - a.doneAt < LEAVE_MS))
            .map(a => (a.doneAt !== undefined && a.doneAt > now ? { ...a, doneAt: undefined, isLost: undefined } : a))
          const scene = sceneOf(family, crew, frame, now, columns)
          if (scene.length !== STAGE_ROWS * 2 || scene.some(row => row.length !== columns)) wrong.push(`${where}: not columns by rows`)

          // Each mini's body in a box of its own, inside the stage's margins: no two boxes ever meet.
          const boxes = [...boxesOf(scene).values()]
          if (boxes.some(box => box.left < 1 || box.right > columns - 2 || box.bottom >= STAGE_ROWS * 2 - 2)) wrong.push(`${where}: a mini outside the margins`)
          if (boxes.some((a, i) => boxes.slice(i + 1).some(b => !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top)))) wrong.push(`${where}: two minis meet`)

          // The sky holds the queue: its count, and as many heads as fit before the enemy's corner. No mini reaches into it.
          const staged = stagedOf(crew, now, columns)
          const waiting = crew.filter(a => actOf(a, now) !== 'exit' && !staged.includes(a))
          const queued = waiting.length
          const sky = scene.slice(0, SKY).flat()
          const room = (staged.length > 1 ? columns - 13 : columns) - 4 - 4 * String(queued).length
          if (sky.includes(MARKER) !== queued > 0) wrong.push(`${where}: the queue's count`)
          const heads = waiting.slice(0, Math.max(0, Math.floor(room / 6))).reduce((sum, a) => sum + headLights(a), 0)
          if (sky.filter(color => color !== null && lights.has(color)).length !== heads) wrong.push(`${where}: the queue's heads`)
          if (scene.slice(SKY).some(row => row.includes(MARKER))) wrong.push(`${where}: a count out of the sky`)
        }
      }
    }
  }
  expect(wrong).toEqual([])
})

test('a freed place on the stage is taken at once, nobody jumps a zone, the enemy comes for two, and a colour swaps body and feet alone', () => {
  const boxOf = (scene: ReturnType<typeof sceneOf>, slot: number) => boxesOf(scene).get(slot)
  // As many minis as have ten columns each, four at most: three on the default pane.
  expect(capOf(33, 6)).toBe(3)
  expect(capOf(56, 6)).toBe(4)
  expect(capOf(21, 6)).toBe(1)
  expect(capOf(33, 2)).toBe(2)

  // A freed place is taken at once: the first in the queue drops in while the one that finished flies off.
  const five: Agent[] = [0, 1, 2, 3, 4].map(slot => ({ slot, calls: [], ...(slot === 0 ? { doneAt: NOW } : {}) }))
  const has = (scene: ReturnType<typeof sceneOf>, slot: number) => boxOf(scene, slot) !== undefined
  const dancing = sceneOf('kirby', five, 3, NOW + 3 * TICK_MS, 33)
  expect([0, 1, 2, 3].map(slot => has(dancing, slot))).toEqual([true, true, true, false])
  expect(stagedOf(five, NOW + 9 * TICK_MS, 33).map(a => a.slot)).toEqual([1, 2, 3])
  const landed = sceneOf('kirby', five, 13, NOW + 13 * TICK_MS, 33)
  expect([0, 1, 2, 3, 4].map(slot => has(landed, slot))).toEqual([false, true, true, true, false])
  const forgotten = LEAVE_MS / TICK_MS
  expect(JSON.stringify(sceneOf('kirby', five.slice(1), forgotten, NOW + LEAVE_MS, 33))).toBe(JSON.stringify(sceneOf('kirby', five, forgotten, NOW + LEAVE_MS, 33)))

  // Comings and goings that overlap: two finish a few ticks apart, one joins meanwhile. Nobody jumps a zone: a mini at work walks over, less than a body's width a tick.
  for (const family of ['kirby', 'clawd'] as Family[]) {
    for (let gap = 1; gap <= 8; gap++) {
      const crew = (now: number): Agent[] => [
        { slot: 0, calls: [], doneAt: NOW },
        { slot: 1, calls: [], doneAt: NOW + gap * TICK_MS },
        { slot: 2, calls: [{ tool: 'Read' }] },
        { slot: 3, calls: [{ tool: 'Read' }], joinedAt: NOW + 12 * TICK_MS },
      ].filter(a => (a.joinedAt ?? 0) <= now && (a.doneAt === undefined || now - a.doneAt < LEAVE_MS))
      let before: number | undefined
      for (let tick = 0; tick < 40; tick++) {
        const left = boxOf(sceneOf(family, crew(NOW + tick * TICK_MS), tick, NOW + tick * TICK_MS, 33), 2)?.left
        expect(left).toBeDefined()
        if (before !== undefined && left !== undefined) expect(Math.abs(left - before)).toBeLessThan(6)
        before = left
      }
    }
  }

  // With two or more at it there is an enemy in the sky, and none for one alone; it flinches when a call lands and pops when an agent finishes.
  const FLYER = 0xff6fa8
  const skyOf = (crew: Agent[], tick: number, family: Family = 'kirby') => new Set(sceneOf(family, crew, tick, NOW + tick * TICK_MS, 33).slice(0, SKY).flat())
  const trio: Agent[] = [0, 1, 2].map(slot => ({ slot, calls: [{ tool: 'Edit' }] }))
  expect(skyOf(trio, 5).has(FLYER)).toBe(true)
  expect(skyOf(trio, 5, 'clawd').has(FLYER)).toBe(true)
  expect(skyOf(trio.slice(0, 1), 5).has(FLYER)).toBe(false)
  const hit = trio.map(a => (a.slot === 1 ? { ...a, hitAt: NOW } : a))
  expect(skyOf(hit, 1).has(IMPACT)).toBe(false)
  expect(skyOf(hit, 2).has(IMPACT)).toBe(true)
  expect(skyOf(hit, 2).has(FLYER)).toBe(false)
  const won = trio.map(a => (a.slot === 1 ? { ...a, calls: [], doneAt: NOW } : a))
  expect(skyOf(won, 2).has(FLYER)).toBe(false)
  expect(skyOf(won, 20).has(FLYER)).toBe(true)
  const stopped = won.map(a => ({ ...a, isLost: a.doneAt !== undefined }))
  expect(skyOf(stopped, 2).has(FLYER)).toBe(true)

  // Players two to four are yellow, blue and green: the swap turns body, shine and feet, all of them, and nothing else.
  for (const family of ['kirby', 'clawd'] as Family[]) {
    const [one, two] = [miniOf(family, 0), miniOf(family, 1)]
    for (const pose of Object.keys(one) as Pose[]) {
      const [a, b] = [one[pose].flat(), two[pose].flat()]
      expect(a.length).toBe(b.length)
      expect(one[pose].every(row => row.length === MINI_WIDTH[family])).toBe(true)
      a.forEach((color, i) => {
        const at = color === null ? -1 : SWAPS[0]!.indexOf(color)
        expect(b[i]).toBe(at < 0 ? color : SWAPS[1]![at]!)
      })
      expect(a.filter(color => color === SWAPS[0]![0]).length).toBeGreaterThan(5)
    }
  }
  expect(colorOf(1)).toBe('#7cc4ff')
})

test('a built-in theme draws Clawd, hat by model, and his minis', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on, {}, 'dark')
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  on('agent.spawn', () => ({ model: 'opus', agentId: 'a1' }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(KIRBY_PANE)
  const texts = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(await texts()).toContain('Poet Clawd')
  expect(await texts()).not.toContain('Kirby')
  const clawd = await ui.find({ type: 'Raster' })
  expect([clawd?.props.columns, clawd?.props.rows]).toEqual([22, 10])
  expect(atob(String(clawd?.props.cells)).length).toBe(22 * 10 * 12)

  await $.agent.spawn(SPAWN)
  expect((await ui.findAll({ type: 'Raster' })).length).toBe(2)
  // Clawd's pane is laid out as Kirby's: the legend, the stage under it, the bubble, the mascot.
  expect(flow(under(await ui.drawn())).slice(0, 3).map(line => line.slice(0, 2))).toEqual(['● ', '<R', '╭─'])
  // A task too long for its line is cut with an ellipsis, never mid-word without one.
  await $.agent.spawn({ ...SPAWN, description: 'map the hud module again' })
  expect(flow(under(await ui.drawn()))[0]).toBe('● map the hud mod… thinking…')

  // An agent whose end no event told leaves once the engine lists it as ended.
  agents = [{ id: 'a1', description: 'scout', type: 'general-purpose', status: 'completed' }]
  await clock.advance(4400)
  expect((await ui.findAll({ type: 'Raster' })).length).toBe(1)
  await ui.unmount()
})

test('the band is one line of meters while no pane shows, and never a fake 0%', async ($, on) => {
  mock.clock(on, { now: NOW })
  store(on)
  panes = []
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
  on('ui.blit', () => ({ value: {} }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount(BAND)
  expect(await band.find({ type: 'Raster' })).toBeUndefined()
  expect((await band.findAll({ text: 'n/a' })).length).toBeGreaterThan(0)
  expect(await band.find({ text: /0%/ })).toBeUndefined()
  expect(await band.find({ type: 'Button' })).toBeDefined()
  await band.unmount()

  const pane = await $.ui.mount(KIRBY_PANE)
  expect((await pane.findAll({ text: /unavailable/ })).length).toBeGreaterThan(0)
  await pane.unmount()
})

// --- true pixels -------------------------------------------------------------

/** A terminal that draws pictures, its cells 9 by 21 device pixels: kitty. */
function kitty(on: On, size = '46 209 1881 966') {
  mock.env(on, { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1' })
  on('process.run', () => ({ value: { exitCode: 0, stdout: `${size}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
}

type Node = { type?: unknown; props?: Record<string, unknown>; children?: unknown }

/** The drawing's pictures and lines of text, top to bottom: a picture by its key, a line by its text. */
function flow(node: unknown): string[] {
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(flow)
  if (typeof node !== 'object' || node === null) return []
  const { type, props, children } = node as Node
  if (type === 'Image' || type === 'Raster') return [`<${String(type)} ${String(props?.key ?? (node as { key?: unknown }).key)}>`]
  const inner = flow(children ?? props?.children)

  return type === 'Text' || type === 'Button' ? [inner.join('')] : inner
}

/** The pane under the Loadouts line (picker.tsx; given up where it would cost the mascot): the avatar's own tree, the pane's last child, as these tests read it. */
const under = (root: unknown): unknown => ((root as { children?: unknown[] }).children ?? []).filter(kid => kid !== null && kid !== undefined && kid !== false).at(-1)

const rgbaOf = (source: unknown) => atob(String((source as { rgba: string }).rgba))

test('in true pixels the pane is the legend, the stage under it, the bubble, then the mascot right under it', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on, {}, 'custom:kirby', 'claude-opus-5-5')
  kitty(on)
  on('session.usage', () => ({ value: USAGE }))
  const blits: { key: string; width: number; height: number; rgba: string }[] = []
  on('ui.blit', (_$, e) => {
    if ('source' in e && 'rgba' in e.source) blits.push({ key: e.key, width: e.source.width, height: e.source.height, rgba: e.source.rgba })

    return { value: {} }
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  const order = async () => flow(under(await ui.drawn()))
  const mascot = async () => (await ui.find({ key: 'kirby' }))?.props

  // Alone: the bubble's tail is the line right above the mascot's picture, his name right under it. No Raster anywhere.
  const alone = await order()
  const at = alone.indexOf('<Image kirby>')
  expect(alone[at - 1]).toMatch(/^╰─+▼─+╯$/)
  expect(alone[at + 1]).toBe('Kirby')
  expect(alone.some(line => line.startsWith('<Raster'))).toBe(false)
  expect(alone).not.toContain('<Image stage>')

  // The picture: 23 by 9 cells of 9 by 21 device pixels is 69 by 63 art pixels of 3 device pixels each way, square; clear around him.
  // 23 columns, not the 22 he needs: as many off the bubble's 33 as centres him under its tail.
  const before = await mascot()
  expect([before?.columns, before?.rows]).toEqual([23, 9])
  expect(before?.source).toMatchObject({ width: 69, height: 63 })
  expect(rgbaOf(before?.source).length).toBe(69 * 63 * 4)
  expect(rgbaOf(before?.source).charCodeAt(3)).toBe(0)
  expect([(23 * 9) / 69, (9 * 21) / 63]).toEqual([3, 3])

  // An agent: its legend line and, under it, the stage come in above the bubble; the bubble and the mascot are as they were.
  await $.agent.spawn({ ...SPAWN, description: 'scout the repo' })
  const busy = await order()
  const [stageAt, legendAt, bubbleAt, mascotAt] = [busy.indexOf('<Image stage>'), busy.findIndex(line => line.startsWith('●')), busy.findIndex(line => line.startsWith('╭')), busy.indexOf('<Image kirby>')]
  expect(legendAt).toBe(0)
  expect(stageAt).toBe(1)
  expect(bubbleAt).toBe(2)
  expect(busy[mascotAt - 1]).toMatch(/^╰─+▼─+╯$/)
  expect(busy.slice(bubbleAt)).toEqual(alone.slice(alone.findIndex(line => line.startsWith('╭'))))
  const after = await mascot()
  expect([after?.columns, after?.rows]).toEqual([23, 9])
  const stage = (await ui.find({ key: 'stage' }))?.props
  expect([stage?.columns, stage?.rows]).toEqual([33, 10])
  expect(stage?.source).toMatchObject({ width: 99, height: 70 })
  expect(14 + 9 + 10 + 1).toBeLessThan(60)

  // Two seconds of frames: each picture always its mounted size, the stage moving at about eleven frames a second.
  await clock.advance(2000)
  const frames = blits.filter(b => b.key === 'stage')
  expect(frames.length).toBeGreaterThan(15)
  expect(frames.length).toBeLessThan(24)
  expect(new Set(frames.map(b => b.rgba)).size).toBe(frames.length)
  for (const b of frames) expect([b.width, b.height, atob(b.rgba).length]).toEqual([99, 70, 99 * 70 * 4])
  for (const b of blits.filter(b => b.key === 'kirby')) expect([b.width, b.height]).toEqual([69, 63])
  expect([...new Set(blits.map(b => b.key))].sort()).toEqual(['kirby', 'stage'])

  // The agent leaves: the stage goes, the column from the bubble down has not moved.
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false, turnId: 't1' })
  await clock.advance(LEFT_MS)
  const left = await order()
  expect(left).not.toContain('<Image stage>')
  expect(left.indexOf('<Image kirby>')).toBe(at)
  await ui.unmount()
})

test('idle and alone the frames slow down; a blit that hangs holds the next back; no pictures, the cell blocks take over', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on, {}, 'custom:kirby', 'claude-opus-5-5')
  kitty(on, '') // nothing measured: a cell is taken for one wide by two tall
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  let answer: 'take' | 'hang' | 'refuse' = 'take'
  let asked = 0
  const held: (() => void)[] = []
  on('ui.blit', () => {
    asked += 1
    if (answer === 'hang') return new Promise(done => held.push(() => done({ value: {} })))

    return { value: answer === 'refuse' ? { deny: 'the Image draws its alt here: no placeholder images' } : {} }
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  // 23 columns of 9 by 18: 69 art pixels by 11 rows of 6.
  expect((await ui.find({ key: 'kirby' }))?.props.source).toMatchObject({ width: 69, height: 66 })

  // Idle, nobody on stage: he only breathes, a frame in three is drawn and only those that differ are sent.
  await clock.advance(3000)
  expect(asked).toBeGreaterThan(2)
  expect(asked).toBeLessThan(13)

  // A blit that never answers: the frames after it are skipped, not queued behind it.
  await $.agent.spawn({ ...SPAWN, description: 'scout the repo' })
  // (A stage is seventy art pixels at the least: twelve rows of six.)
  expect((await ui.find({ key: 'stage' }))?.props.source).toMatchObject({ width: 99, height: 72 })
  answer = 'hang'
  asked = 0
  await clock.advance(1500)
  expect(asked).toBe(1)
  answer = 'take'
  for (const release of held) release()
  await clock.advance(500)
  expect(asked).toBeGreaterThan(3)

  // The terminal turns out to draw the alt: the pane goes back to Rasters, same order, by itself.
  answer = 'refuse'
  await clock.advance(500)
  const kinds = flow(under(await ui.drawn())).filter(line => line.startsWith('<'))
  expect(kinds).toEqual(['<Raster stage>', '<Raster kirby>'])

  // Not for good: the engine says the same while it is still asking the terminal. Pictures are tried again a little later.
  answer = 'take'
  await clock.advance(21_000)
  expect(flow(under(await ui.drawn())).filter(line => line.startsWith('<'))).toEqual(['<Image stage>', '<Image kirby>'])
  await ui.unmount()
})

test('a refused frame is not sent again until the pane is drawn anew; a hidden pane gets no frames', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on, {}, 'custom:kirby', 'claude-opus-5-5')
  kitty(on)
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  let deny: string | undefined
  let asked = 0
  on('ui.blit', () => {
    asked += 1

    return { value: deny === undefined ? {} : { deny } }
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  await $.agent.spawn({ ...SPAWN, description: 'scout the repo' })
  await clock.advance(1000)
  expect(asked).toBeGreaterThan(10)

  // "Not mounted": each picture is tried again only now and then, more and more sparsely, the pictures staying Images; the next draw (the slow tick's) starts them again.
  deny = 'nothing of this plugin is mounted there'
  asked = 0
  await clock.advance(2000)
  expect(asked).toBeGreaterThan(2)
  expect(asked).toBeLessThan(8)
  expect(flow(under(await ui.drawn())).filter(line => line.startsWith('<'))).toEqual(['<Image stage>', '<Image kirby>'])
  deny = undefined
  await clock.advance(4400)
  asked = 0
  await clock.advance(1000)
  expect(asked).toBeGreaterThan(10)

  // Refused for a moment only (a frame that came before the engine had mounted the picture): the frames
  // come back by themselves, well before any redraw.
  await clock.advance(3700) // just past a slow tick's redraw: none is due for four seconds
  deny = 'nothing of this plugin is mounted there'
  await clock.advance(300)
  deny = undefined
  asked = 0
  await clock.advance(1500)
  expect(asked).toBeGreaterThan(8)

  // Behind another tab: once the slow tick has seen it, no frame is composed or sent, however long it lasts.
  panes = []
  await clock.advance(4400)
  asked = 0
  await clock.advance(10_000)
  expect(asked).toBe(0)

  // Shown again, the engine draws it: the frames resume.
  panes = SHOWN
  await ui.press({ key: 'pet' })
  await clock.advance(1000)
  expect(asked).toBeGreaterThan(5)
  await ui.unmount()
})

test('a theme picks the family: kirby, the cyber one in red for Ghostrunner or in yellow for Cyberpunk Edgerunners, Clawd for the rest', () => {
  expect(['custom:kirby', 'Kirby Dream Land', ''].map(wantedOf)).toEqual(['kirby', 'kirby', 'kirby'])
  expect(['custom:ghostrunner', 'Ghostrunner', 'Ghostrunner II'].map(wantedOf)).toEqual(['ghostrunner', 'ghostrunner', 'ghostrunner'])
  expect(['custom:cyberpunk-edgerunners', 'Cyberpunk Edgerunners', 'edgerunners night'].map(wantedOf)).toEqual(['cyberpunk-edgerunners', 'cyberpunk-edgerunners', 'cyberpunk-edgerunners'])
  // No rule reads the word "soft": it turns no theme yellow, and the names from before the rename are nobody's.
  expect(['soft ghostrunner', 'custom:ghostrunner-soft', 'custom:cyberpunk-soft', 'custom:cyberpunk', 'Cyberpunk Soft'].map(wantedOf)).toEqual(['ghostrunner', 'ghostrunner', 'clawd', 'clawd', 'clawd'])
  expect(['dark', 'light', 'dark-daltonized', 'custom:solarized', 'custom:vaporwave-soft'].map(wantedOf)).toEqual(['clawd', 'clawd', 'clawd', 'clawd', 'clawd'])
  // One skin in two palettes and two worlds: red and the Ghostrunner world for the one, yellow and Edgerunners for the other; the other families have none and look as they did.
  expect(['custom:ghostrunner', 'custom:cyberpunk-edgerunners'].map(theme => {
    const family = familyOf(theme)

    return 'skin' in family ? family.world : undefined
  })).toEqual(['ghostrunner', 'edgerunners'])
  const variantOf = (theme: string) => {
    const family = familyOf(theme)

    return 'skin' in family ? family.skin.variant : undefined
  }
  expect(['custom:ghostrunner', 'custom:cyberpunk-edgerunners', 'custom:kirby', 'dark'].map(variantOf)).toEqual(['red', 'yellow', undefined, undefined])
  expect([SKINS.red.primary, SKINS.yellow.primary]).toEqual([0xff6158, 0xfcee0a])
  // An alarm is red on the yellow skin; on the red one, which is red, dark red and light blue and nothing else, a hotter red
  // (told by its stripes and its filled tag as well). A plain value is never in the alarm's colour.
  expect([SKINS.red.alert, SKINS.yellow.alert]).toEqual([0xff1f47, 0xff3d3d])
  for (const skin of Object.values(SKINS)) expect(new Set([skin.primary, skin.alert, skin.value, skin.cyan]).size).toBe(4)
  expect(SKINS.red.cyan).toBe(SKINS.yellow.cyan)
  // (A world with cars is a text family too: its cars are sprites as any.)
  for (const one of Object.values(FAMILIES)) {
    const family = 'skin' in one ? one.cars : one
    if (family === undefined) continue
    for (const form of FORMS) expect(family.forms[form].frames.length).toBeGreaterThan(0)
    expect(Object.keys(family.mini(0).poses).length).toBe(20)
  }
  expect(Object.values(FAMILIES).map(family => ('skin' in family ? family.cars?.blocks ?? 'text' : family.blocks))).toEqual(['kirby', 'clawd', 'text', 'text', 'clawd', 'text', 'text', 'text', 'text'])
})

const MOODS: Mood[] = ['idle', 'working', 'happy', 'worried']

test('the ghostrunner mascot is Raijin, a mask in text: one size whatever it does, a loop per mood, a crown and a mouth per model', () => {
  const family = familyOf('custom:ghostrunner')
  const print = (grid: Grid) => grid.words.join(',')

  // The model gives the form, the form its name and its crown: four masks told apart by their top rows alone.
  const names = { 'claude-opus-5-5': 'Raijin', 'claude-sonnet-5-5': 'Raijin Tachi', 'claude-haiku-4-5': 'Raijin Ping', 'claude-fable-5': 'Raijin Oracle' }
  for (const [model, name] of Object.entries(names)) expect(nameOf({ family, form: formOf(model) })).toBe(name)
  expect(new Set(FORMS.map(form => textOf(maskFrame(SKINS.red, form, 'idle', NOW)).slice(0, 5).join('\n'))).size).toBe(4)
  // Ping alone has one optic where the others have two eyes.
  const visor = (form: (typeof FORMS)[number]) => textOf(maskFrame(SKINS.red, form, 'idle', NOW + 1800))[7]!
  expect(visor('haiku')).not.toBe(visor('opus'))
  expect(visor('sonnet')).toBe(visor('opus'))
  // Below the visor each has its own mouth: locked teeth and tusks, a grille, a mesh, two rows of needles.
  expect(new Set(FORMS.map(form => textOf(maskFrame(SKINS.red, form, 'idle', NOW + 1800)).slice(10, 12).join('\n'))).size).toBe(4)
  // Teeth are solid triangles, an upper row and a lower one, in one colour; no letter or thin stroke among them.
  const jaws = maskFrame(SKINS.red, 'opus', 'idle', NOW + 1800)
  const teeth = textOf(jaws).slice(10, 12).map(row => row.slice(9, 20))
  expect([/^[▼ ]+$/.test(teeth[0]!) && teeth[0]!.includes('▼'), /^[▲ ]+$/.test(teeth[1]!) && teeth[1]!.includes('▲')]).toEqual([true, true])
  const inkAt = (grid: Grid, x: number, y: number) => grid.words[(y * grid.columns + x) * 3 + 1]
  expect(new Set([10, 12, 14, 16, 18].map(x => inkAt(jaws, x, 10))).size).toBe(1)

  for (const form of FORMS) {
    const loops = MOODS.map(mood => Array.from({ length: 48 }, (_f, i) => maskFrame(SKINS.red, form, mood, NOW + i * 90)))
    for (const loop of loops) {
      // Its cells are columns by rows, every frame: 28 to 32 columns, 14 to 18 rows.
      for (const grid of loop) expect([grid.columns, grid.rows, grid.words.length]).toEqual([MASK_COLUMNS, MASK_ROWS, MASK_COLUMNS * MASK_ROWS * 3])
      // Every glyph is one a cell can hold, every colour a colour or the terminal's own.
      for (const grid of loop) expect(grid.words.every((word, i) => (i % 3 === 0 ? word >= 0x20 && word <= 0xffff : word <= 0xffffff || word === NONE))).toBe(true)
      // It never holds still: most of a mood's frames are their own drawing.
      expect(new Set(loop.map(print)).size).toBeGreaterThan(40)
    }
    // Each mood is its own loop, and reads differently in its glyphs too, not only its colours.
    expect(new Set(loops.flatMap(loop => loop.map(print))).size).toBe(4 * 48)
    expect(new Set(MOODS.map(mood => textOf(maskFrame(SKINS.red, form, mood, NOW + 450)).join('\n'))).size).toBe(4)
  }
  expect([MASK_COLUMNS >= 28 && MASK_COLUMNS <= 32, MASK_ROWS >= 14 && MASK_ROWS <= 18]).toEqual([true, true])
  // A frame is a function of its moment; its outline is symmetric, row by row.
  expect(print(maskFrame(SKINS.red, 'opus', 'working', NOW + 777))).toBe(print(maskFrame(SKINS.red, 'opus', 'working', NOW + 777)))
  const outline = (rows: string[]) => rows.map(row => row.replace(/[^ ]/g, '#'))
  const rest = outline(textOf(maskFrame(SKINS.red, 'opus', 'working', NOW)))
  for (const row of rest) expect([...row].reverse().join('')).toBe(row)
  // It is shaded, not flat: lit from the upper left. The same plane of armour is lighter on the left cheek than on the right,
  // the armour's full blocks are in four tones or more, and where two meet a cell is a shade of one on the other.
  const still = maskFrame(SKINS.red, 'opus', 'idle', NOW + 1800)
  const lightOf = (color: number | undefined) => ((color ?? 0) >> 16) & 255
  expect(lightOf(inkAt(still, 6, 9))).toBeGreaterThan(lightOf(inkAt(still, 22, 9)) + 30)
  const helmet = new Set<number>()
  for (let y = 2; y < 16; y++) for (let x = 0; x < 29; x++) if (y !== 10 && y !== 11 && String.fromCodePoint(still.words[(y * 29 + x) * 3]!) === '█') helmet.add(inkAt(still, x, y)!)
  expect(helmet.size).toBeGreaterThan(3)
  expect(textOf(still).join('')).toContain('▒')

  // The two palettes draw the same glyphs in other colours: the red one in Ghostrunner's red, the Edgerunners one in yellow.
  const [red, yellow] = [maskFrame(SKINS.red, 'opus', 'idle', NOW), maskFrame(SKINS.yellow, 'opus', 'idle', NOW)]
  expect(textOf(red)).toEqual(textOf(yellow))
  expect(print(red)).not.toBe(print(yellow))
  // Idle the eyes are cyan and blink; worried a "!" shows, glad they narrow to arcs, at work hex streams over the visor.
  const said = (mood: Mood, ms = 450) => textOf(maskFrame(SKINS.red, 'opus', mood, NOW + ms)).join('\n')
  expect(red.words.some((word, i) => i % 3 === 1 && word !== NONE && ((word >> 16) & 255) + 60 < (word & 255))).toBe(true) // cyan, among the reds
  expect([said('worried').includes('!'), said('happy').includes('▗▄▄▄▖'), /[0-9A-F]{5}/.test(said('working')), /!|▗▄▄▄▖|[0-9A-F]{2}/.test(said('idle'))]).toEqual([true, true, true, false])
  // The hex runs between the eyes alone, on one row, a cell clear of each eye: nothing else is written on the visor.
  expect(said('working').match(/[0-9A-F]/g)?.length).toBe(5)
  expect(textOf(maskFrame(SKINS.red, 'opus', 'working', NOW + 450))[7]).toMatch(/ [0-9A-F]{5} /)
  // The mouth tells the mood too: a grin baring every upper tooth when glad, a jaw that chatters when worried, a cyan pulse in it at work.
  const mouthOf = (mood: Mood, ms = 450) => textOf(maskFrame(SKINS.red, 'opus', mood, NOW + ms)).slice(10, 12).join('\n')
  expect(mouthOf('happy')).not.toBe(mouthOf('idle'))
  expect(mouthOf('happy')).toContain('▼▼▼▼▼▼▼▼▼▼▼')
  expect(new Set(Array.from({ length: 12 }, (_f, i) => mouthOf('worried', i * 90))).size).toBe(2)
  expect(new Set(Array.from({ length: 12 }, (_f, i) => mouthOf('idle', i * 90))).size).toBe(1)
  const groundAt = (grid: Grid, x: number, y: number) => grid.words[(y * grid.columns + x) * 3 + 2]
  expect(groundAt(maskFrame(SKINS.red, 'opus', 'working', NOW + 450), 14, 10)).not.toBe(groundAt(maskFrame(SKINS.red, 'opus', 'idle', NOW + 450), 14, 10))
  // Glad, a flare lights the edges and the teeth, never the armour: its planes keep their shading. Sparks stay between the horns, over the crown.
  for (let ms = 1440; ms < 2880; ms += 90) {
    const glad = maskFrame(SKINS.red, 'opus', 'happy', NOW + ms)
    expect(inkAt(glad, 6, 9)).toBe(inkAt(maskFrame(SKINS.red, 'opus', 'idle', NOW + ms), 6, 9))
    textOf(glad).forEach((row, y) => [...row].forEach((glyph, x) => {
      if (glyph === '+' || glyph === '*') expect(y < 2 && x >= 3 && x <= 25).toBe(true)
    }))
  }
  expect(inkAt(maskFrame(SKINS.red, 'opus', 'happy', NOW), 14, 5)).not.toBe(inkAt(maskFrame(SKINS.red, 'opus', 'idle', NOW), 14, 5))
  const blink = 4000 - (NOW % 4000)
  expect(said('idle', blink - 180)).toContain('▔▔▔▔▔')
  expect(said('idle', 1000)).not.toContain('▔▔▔▔▔')
  // A band of rows tears aside now and then, for one frame: three rows together when idle, four and twice as often when
  // worried, the rest of the mask where it was. Never the frame a loop opens on, and it opens no hole: every cell of the
  // mask is still drawn on (the eyes' and the mouth's rows aside, which move by themselves).
  const filledOf = (grid: Grid) => Array.from({ length: grid.columns * grid.rows }, (_c, i) => grid.words[i * 3] !== 0x20 || grid.words[i * 3 + 2] !== NONE)
  const tears = (mood: Mood) => Array.from({ length: 128 }, (_f, i) => {
    const grid = maskFrame(SKINS.red, 'opus', mood, NOW + i * 90)
    const moved = outline(textOf(grid)).flatMap((row, y) => (![6, 7, 10, 11].includes(y) && row !== rest[y] ? [y] : []))
    if (moved.length > 0) filledOf(maskFrame(SKINS.red, 'opus', mood, NOW + (i - 1) * 90)).forEach((isFilled, at) => expect(!isFilled || filledOf(grid)[at]).toBe(true))

    return moved
  })
  const [idleTears, worriedTears] = [tears('idle'), tears('worried')]
  expect([idleTears.filter(rows => rows.length > 0).length, worriedTears.filter(rows => rows.length > 0).length]).toEqual([2, 4])
  expect([idleTears[0], worriedTears[0]]).toEqual([[], []])
  for (const [found, most] of [[idleTears, 3], [worriedTears, 4]] as const) {
    for (const rows of found) if (rows.length > 0) expect(rows[rows.length - 1]! - rows[0]!).toBeLessThan(most)
    found.forEach((rows, i) => expect(rows.length === 0 || found[i + 1] === undefined || found[i + 1]!.length === 0).toBe(true))
  }
  // An alarm does not repaint the armour: worried, the helmet's planes keep the colours they have idle (the edges and the eyes take the alert's).
  expect(inkAt(maskFrame(SKINS.red, 'opus', 'worried', NOW + 1800), 6, 9)).toBe(inkAt(still, 6, 9))
  // In the margins one digit changes at a time, well under once a frame.
  const margins = Array.from({ length: 48 }, (_f, i) => textOf(maskFrame(SKINS.red, 'opus', 'idle', NOW + i * 90, 33, 16)).map(row => row[0]! + row[32]!).join(''))
  margins.slice(1).forEach((now, i) => expect([...now].filter((ch, at) => ch !== margins[i]![at]).length).toBeLessThan(2))
  expect(new Set(margins).size).toBeLessThan(8)

  // In a wider or shorter box it is the same mask: centred, binary digits and plus marks in the margins, cropped about its visor.
  const wide = maskFrame(SKINS.red, 'opus', 'idle', NOW, 33, 16)
  expect([wide.columns, wide.rows, wide.words.length]).toEqual([33, 16, 33 * 16 * 3])
  expect(textOf(wide).map(row => row.slice(2, 31))).toEqual(textOf(red))
  for (const row of textOf(wide)) expect(/^[01+] .* [01+]$/.test(row)).toBe(true)
  const short = maskFrame(SKINS.red, 'opus', 'idle', NOW, 33, MASK_LEAST)
  expect([short.rows, short.words.length]).toEqual([MASK_LEAST, 33 * MASK_LEAST * 3])
  expect(textOf(short).join('\n')).toContain('▀▀▀▀▀')
  // A shorter box is a bust drawn for its height, never a slice: the visor always, the mouth whole or not there, and from
  // thirteen rows down the last row is the jaw, closed. Raijin's horns keep their tips down to ten rows.
  for (const form of FORMS) {
    const whole = textOf(maskFrame(SKINS.red, form, 'idle', NOW)).map(row => row.trimEnd())
    for (let rows = MASK_LEAST; rows < MASK_ROWS; rows++) {
      const bust = textOf(maskFrame(SKINS.red, form, 'idle', NOW, 33, rows)).map(row => row.slice(2, 31).trimEnd())
      expect(bust.length).toBe(rows)
      expect([bust.includes(whole[6]!), bust.includes(whole[7]!)]).toEqual([true, true])
      expect(bust.includes(whole[10]!)).toBe(bust.includes(whole[11]!))
      if (rows >= 7) expect(bust.includes(whole[10]!)).toBe(true)
      if (rows <= 13) expect(bust[rows - 1]).toMatch(/^ {8}▜[█▒]{11}▛$/)
      if (form === 'opus' && rows >= 10) expect(bust[0]).toBe(whole[0])
    }
  }
})

test('the ghostrunner agents are HUD blocks that follow what the agents really do, and leave', () => {
  const runner = (more: Partial<Runner> = {}, tool?: string): Runner => ({ slot: 0, label: 'scout the repo', calls: tool === undefined ? [] : [{ tool, summary: 'src/main.ts' }], ...more })
  const tags = { Read: 'SCAN', Grep: 'SCAN', Edit: 'EDIT', Bash: 'EXEC', WebFetch: 'NET', mcp__chrome__click: 'NET', Agent: 'CALL', Skill: 'LOAD', AskUserQuestion: 'ASK', mcp__db__query: 'TOOL' }
  const block = (one: Runner, now = NOW, rows = 2) => textOf(agentRows(SKINS.red, [one], now, 33, rows))
  for (const [tool, tag] of Object.entries(tags)) {
    const rows = block(runner({}, tool))
    expect(rows[0]).toContain(`[${tag}] scout the repo`)
    expect(rows[1]).toContain(`${tool.replace(/^mcp__/, '')} src/main.ts`)
  }
  expect(block(runner())[0]).toContain('[THNK]')
  // A failed call, whatever runs, and until one ends well; then how it ended: stopped is not finished.
  const failed = runner({ hurtAt: NOW })
  expect([stateOf({ ...runner({}, 'Read'), hurtAt: NOW }, NOW), stateOf(failed, NOW + 60_000), stateOf({ ...failed, hitAt: NOW + 1 }, NOW + 60_000)]).toEqual(['fail', 'fail', 'think'])
  expect(block(failed)[0]).toContain('[FAIL]')
  const [done, lost] = [runner({ doneAt: NOW }), runner({ doneAt: NOW, isLost: true })]
  expect([block(done, NOW + 900)[0]!.includes('[DONE]'), block(lost, NOW + 900)[0]!.includes('[HALT]')]).toEqual([true, true])
  expect([stateOf(done, NOW + LEAVE_MS - 1), stateOf(lost, NOW + LEAVE_MS - 1)]).toEqual(['done', 'halt'])
  expect(block(done, NOW + 900)[0]).toContain('✓')

  // Each state is its own figure, three cells that move; the bar down the left edge is the agent's colour.
  const states: Runner[] = [runner(), ...['Read', 'Edit', 'Bash', 'WebFetch', 'Agent', 'Skill', 'AskUserQuestion', 'mcp__db__query'].map(tool => runner({}, tool)), failed, lost, { ...done, doneAt: NOW - 5000 }]
  const figure = (one: Runner, now: number) => block(one, now)[0]!.slice(2, 5)
  const loops = states.map(one => Array.from({ length: 16 }, (_f, i) => figure(one, NOW + i * 180)).join('|'))
  expect(new Set(loops).size).toBe(states.length)
  for (const [i, loop] of loops.entries()) if (i < states.length - 1) expect(new Set(loop.split('|')).size).toBeGreaterThan(1)
  expect(new Set(Object.values(TAGS)).size).toBe(12)
  // The bar down the left edge says the state, as the tag does (live, failed, stopped, finished), whoever the agent is:
  // no colour of an agent's own that could be read as one. The agent is told by its number, under its figure.
  const { cyan, alert, dim, value } = SKINS.yellow
  for (const [one, tone] of [[runner({ slot: 2 }), cyan], [runner({ slot: 6 }, 'Bash'), cyan], [failed, alert], [lost, dim], [done, value]] as const) {
    const grid = agentRows(SKINS.yellow, [one], NOW, 33, 2)
    expect([String.fromCodePoint(grid.words[0]!), grid.words[1], String.fromCodePoint(grid.words[33 * 3]!), grid.words[33 * 3 + 1]]).toEqual(['▌', tone, '▌', tone])
    expect(textOf(grid)[1]!.slice(2, 4)).toBe(String(one.slot + 1).padStart(2, '0'))
  }
  // One row a block: the tools are a column at the right edge, and no figure fills its cell top to bottom.
  const tight = textOf(agentRows(SKINS.red, [runner({ label: 'find references' }, 'WebFetch'), runner({ slot: 1 }, 'Read'), runner({ slot: 2 })], NOW, 33, 3))
  expect(tight.map(line => line.trimEnd().length)).toEqual([33, 33, tight[2]!.trimEnd().length])
  expect([tight[0]!.endsWith(' WebFetch'), tight[1]!.endsWith(' Read'), tight[2]!.length]).toEqual([true, true, 33])
  for (let ms = 0; ms < 3000; ms += 180) for (const one of states) expect(/[█▓▒░▌▐▍]/.test(figure(one, NOW + ms))).toBe(false)
  // No frame of a figure is blank, and a figure's anchor keeps its cell: the prompt, the signal's dot, the question mark.
  for (let ms = 0; ms < 3000; ms += 90) {
    for (const one of states) expect(figure(one, NOW + ms).trim()).not.toBe('')
    expect([figure(states[3]!, NOW + ms)[0], figure(states[7]!, NOW + ms)[1], '·•'.includes(figure(states[4]!, NOW + ms)[0]!)]).toEqual(['>', '?', true])
  }
  // On one row each agent keeps its number, before its figure, and its task has all the row its own tool leaves:
  // a task is never cut for the length of another agent's tool, nor at all where no tool runs.
  expect(tight.map(line => line.slice(2, 4))).toEqual(['01', '02', '03'])
  const roomy = textOf(agentRows(SKINS.red, [runner({ label: 'find references' }, 'WebFetch'), runner({ slot: 1, label: 'read the source' }, 'Read'), runner({ slot: 2, label: 'thinking it over' })], NOW, 33, 3))
  expect([roomy[0]!.includes('find ref… WebFetch'), roomy[1]!.includes('read the so… Read'), roomy[2]!.trimEnd().endsWith('[THNK] thinking it over')]).toEqual([true, true, true])

  // Always columns by rows: two rows a block where the room allows, one otherwise, and past five agents (or the rows) a count.
  const crew = (count: number): Runner[] => Array.from({ length: count }, (_a, i) => runner({ slot: i, label: `agent ${i + 1}` }, i % 2 === 0 ? 'Bash' : undefined))
  expect([blockRowsOf(1, 20), blockRowsOf(3, 20), blockRowsOf(3, 5), blockRowsOf(5, 9), blockRowsOf(6, 20), blockRowsOf(7, 3), blockRowsOf(2, 0)]).toEqual([2, 6, 3, 5, 6, 3, 0])
  for (const [count, room] of [[1, 20], [3, 20], [3, 5], [5, 9], [6, 20], [7, 3], [9, 1]] as const) {
    for (const columns of [33, 20, 60]) {
      const rows = blockRowsOf(count, room)
      const grid = agentRows(SKINS.red, crew(count), NOW, columns, rows)
      expect([grid.columns, grid.rows, grid.words.length]).toEqual([columns, rows, columns * rows * 3])
      const lines = textOf(grid)
      const named = lines.filter(line => /\[[A-Z]+\]/.test(line)).length
      // (A single row names the first agent rather than only count them: the rule over the blocks has the count.)
      expect(named).toBe(rows >= 2 * count && count <= 5 ? count : count > 5 || count > rows ? Math.max(1, rows - 1) : count)
      expect(lines.some(line => line.includes(`+${count - named} MORE`))).toBe(named < count && rows > 1)
    }
  }
  // A task or a command in characters a cell cannot hold is still told, those characters aside.
  const odd = block(runner({ label: 'fix \u{1f525} 日本 tab\there' }))
  expect(odd[0]).toContain('fix ? ?? tab here')
})

/** A Raster's cells as rows of text. */
function written(raster: { props: Record<string, unknown> } | undefined): string[] {
  const bytes = atob(String(raster?.props.cells))
  const columns = Number(raster?.props.columns)
  const glyphs = Array.from({ length: bytes.length / 12 }, (_c, i) => String.fromCodePoint(bytes.charCodeAt(i * 12) | (bytes.charCodeAt(i * 12 + 1) << 8)))

  return Array.from({ length: glyphs.length / columns }, (_r, y) => glyphs.slice(y * columns, (y + 1) * columns).join(''))
}

/** How many columns the widest line of a drawing takes: a row's children side by side, a column's one under the other. */
function widest(node: unknown): number {
  if (typeof node === 'string' || typeof node === 'number') return String(node).length
  if (Array.isArray(node)) return Math.max(0, ...node.map(widest))
  if (typeof node !== 'object' || node === null) return 0
  const { type, props, children } = node as Node
  const kids = [children ?? props?.children].flat(Infinity).filter(kid => kid !== null && kid !== undefined && typeof kid !== 'boolean')
  if (type === 'Raster' || type === 'Image') return Number(props?.columns)
  if (type === 'Text') return flow(node).join('').length
  if (type === 'Button') return String(props?.label ?? '').length + 4
  if (type !== 'Box' || props?.flexDirection === 'column') return Math.max(0, ...kids.map(widest))

  return kids.map(widest).reduce((sum, wide) => sum + wide, 0) + Number(props?.gap ?? 0) * Math.max(0, kids.length - 1)
}

test('a ghostrunner theme skins the whole pane as a HUD: Raijin under the banner, the agents as blocks above it, nothing wider than the pane', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on, {}, 'custom:ghostrunner', 'claude-sonnet-5-5')
  kitty(on) // even where pictures are drawn, a family in text is cells: no Image, in any terminal
  on('session.usage', () => ({ value: USAGE }))
  on('session.id', () => ({ value: 'a1b2c3d4-0000-4000-8000-000000000001' }))
  const blits: { key: string; cells: string }[] = []
  on('ui.blit', (_$, e) => {
    blits.push({ key: e.key, cells: 'cells' in e ? e.cells : '' })

    return { value: {} }
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  // `false` fails, the build runs until the test ends it, the rest answer at once.
  let finish = () => {}
  on('tool.call', (_$, e) => {
    const { command } = e as { command?: string }
    if (command?.startsWith('npm run build') === true) return new Promise(done => { finish = () => done({ result: 'ok' }) })

    return command === 'false' ? { deny: 'no' } : { result: 'ok' }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  const order = async () => flow(under(await ui.drawn()))
  const text = async () => (await order()).join('\n')
  const mask = async () => (await ui.find({ key: 'kirby' }))?.props
  /** The lines from the banner down, the clocks aside: what must not move as agents come and go. */
  const column = (lines: string[]) => lines.slice(lines.findIndex(line => line.startsWith('┌─┐'))).map(line => line.replace(/RESETS IN .*/, 'RESETS'))

  // Alone: one Raster, the mask, right under the banner's three rows; its name, the model's, under it. Nothing of Kirby's.
  const alone = await order()
  expect(alone.filter(line => line.startsWith('<'))).toEqual(['<Raster kirby>'])
  const at = alone.indexOf('<Raster kirby>')
  expect(alone.slice(at - 3, at).map(line => line.slice(0, 3))).toEqual(['┌─┐', '│!│', '└─┘'])
  expect(alone[at + 1]).toContain('RAIJIN TACHI // SONNET-5-5')
  expect(await text()).not.toContain('poyo')
  expect(alone.some(line => /[╭╰]/.test(line))).toBe(false)
  const before = await mask()
  expect([before?.columns, before?.rows, atob(String(before?.cells)).length]).toEqual([33, MASK_ROWS, 33 * MASK_ROWS * 12])

  // Its captions carry real values: the session's id, its cost, the limits and when they reset, the context; the worry is told in its voice.
  expect(alone[0]).toBe('CONNECTION A1B2.C3.D4')
  for (const said of ['$1.23', '5H LIMIT // RESETS IN 2H14', 'WEEK LIMIT // RESETS IN 3D04H', 'CONTEXT // 40K / 200K', 'WEEKLY QUOTA RUNNING DRY', 'PROTOCOL // WORRIED']) expect(await text()).toContain(said)
  // Flat bars, the number at the right. Past the worry threshold a bar is not only another colour (a hotter red, on the red
  // skin): it is notched as hazard tape, at the height of any bar, its number a filled tag; and the banner, filled in that colour, ends in stripes.
  const bars = (await ui.findAll({ type: 'Text' })).filter(t => /^[▄▂]+$/.test(String(t.text)))
  expect(bars.map(t => t.props.color)).toEqual([hex(SKINS.red.primary), hex(SKINS.red.shadow), hex(SKINS.red.alert), hex(SKINS.red.shadow), hex(SKINS.red.primary), hex(SKINS.red.shadow)])
  expect(bars.map(t => String(t.text).slice(0, 2))).toEqual(['▄▄', '▄▄', '▄▂', '▄▄', '▄▄', '▄▄'])
  expect(alone.filter(line => /^[▄▂]+ +\d+ 100$/.test(line)).map(line => line.length)).toEqual([33, 33, 33])
  const filled = (await ui.findAll({ type: 'Text' })).filter(t => t.props.backgroundColor === hex(SKINS.red.alert)).map(t => String(t.text))
  expect(filled).toEqual([' WEEKLY QUOTA RUNNING DRY ▞▞▞', ' 90'])
  // The banner is one line, closed and underlined whatever it says; the block of meters is closed by a cut corner.
  expect(alone[at - 1]).toMatch(/^└─┘ ▔+ ▀▀ ▀▀$/)
  expect(alone[alone.length - 1]).toMatch(/^└─+╱$/)
  // Nothing is wider than the pane, at 34 columns and wider.
  expect(widest(await ui.drawn())).toBe(33)
  for (const line of alone) if (!line.startsWith('<')) expect(line.length).toBeLessThan(34)

  // Idle it does not rest: frame after frame is swapped in, each the mounted size.
  await clock.advance(2000)
  const frames = blits.filter(b => b.key === 'kirby').map(b => b.cells)
  expect(frames.length).toBeGreaterThan(15)
  expect(new Set(frames).size).toBe(frames.length)
  for (const cells of frames) expect(atob(cells).length).toBe(33 * MASK_ROWS * 12)

  // An agent: its block comes in above the banner, under a rule that counts them; from the banner down nothing has moved.
  await $.agent.spawn({ ...SPAWN, description: 'scout the repo' })
  const busy = await order()
  expect(busy.filter(line => line.startsWith('<'))).toEqual(['<Raster stage>', '<Raster kirby>'])
  const stageAt = busy.indexOf('<Raster stage>')
  expect(busy[stageAt - 1]).toMatch(/^╱─ SUBNET \/\/ 01 PROC ─+┐$/)
  expect(busy.slice(0, stageAt)).toEqual([...alone.slice(0, 2), busy[stageAt - 1]!])
  expect(column(busy)).toEqual(column(alone))
  const blocks = async () => written(await ui.find({ key: 'stage' }))
  expect([(await blocks()).length, (await blocks())[0]!.length]).toEqual([2, 33])
  expect((await blocks())[0]).toContain('[THNK] scout the repo')
  expect((await mask())?.rows).toBe(MASK_ROWS)

  // What it really does: a failed call, then one that ends well; its figure moves between redraws.
  await $.tool.call(inAgent('a1', { tool: 'Bash', command: 'false' }))
  expect((await blocks())[0]).toContain('[FAIL]')
  blits.length = 0
  await clock.advance(2000)
  expect(new Set(blits.filter(b => b.key === 'stage').map(b => b.cells)).size).toBeGreaterThan(3)
  await $.tool.call(inAgent('a1', { tool: 'Bash', command: 'true' }))
  expect((await blocks())[0]).toContain('[THNK]')
  // A second one, known only by its calls; then five more: five blocks and a count, the mask where it was.
  for (const id of ['a2', 'a3', 'a4', 'a5', 'a6', 'a7']) await $.tool.call(inAgent(id, { tool: 'Read', file_path: `/tmp/${id}` }))
  await clock.advance(1)
  expect((await blocks()).filter(line => /\[[A-Z]+\]/.test(line)).length).toBe(5)
  expect((await blocks()).some(line => line.includes('+2 MORE'))).toBe(true)
  expect(await text()).toContain('SUBNET // 07 PROC')
  expect(widest(await ui.drawn())).toBe(33)
  expect(column(await order())).toEqual(column(alone))

  // Finished is not stopped; both leave.
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false, turnId: 't1' })
  await $.turn.complete({ agentId: 'a2', reason: 'aborted', answer: '', durationMs: 1, isAborted: true, turnId: 't2' })
  expect((await blocks()).slice(0, 2).map(line => /\[[A-Z]+\]/.exec(line)?.[0])).toEqual(['[DONE]', '[HALT]'])
  await clock.advance(LEFT_MS)
  expect(await text()).toContain('SUBNET // 05 PROC')
  for (const id of ['a3', 'a4', 'a5', 'a6', 'a7']) await $.turn.complete({ agentId: id, reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: id })
  await clock.advance(LEFT_MS)
  expect((await order()).filter(line => line.startsWith('<'))).toEqual(['<Raster kirby>'])
  expect(column(await order())).toEqual(column(alone))

  // The main loop's call is the banner, in cyan, its tool in the caption; a pet is a clean run, and counts.
  const call = $.tool.call({ tool: 'Bash', command: 'npm run build' })
  await clock.advance(1)
  expect(await text()).toContain('PROTOCOL // BASH')
  expect((await ui.findAll({ type: 'Text' })).filter(t => String(t.text).includes('npm run build')).map(t => t.props.backgroundColor)).toContain(hex(SKINS.red.cyan))
  finish()
  await call
  // A command longer than the bar is cut inside it, with an ellipsis: nothing spills under the banner, whose underline stays.
  const long = $.tool.call({ tool: 'Bash', command: 'npm run build -- --with a great many flags that do not fit' })
  await clock.advance(1)
  const banner = await order()
  const barAt = banner.findIndex(line => line.startsWith('│>│'))
  expect(banner[barAt]).toMatch(/^│>│ npm run build -- --with a … ▛$/)
  expect([banner[barAt]!.length, banner[barAt + 1]]).toEqual([33, alone[at - 1]])
  expect(await text()).not.toContain('great many')
  expect(widest(await ui.drawn())).toBe(33)
  finish()
  await long
  // A turn at work between two calls, while a limit is past its threshold: the banner is the working line, in cyan,
  // not an alarm round it (the week's meter keeps its hazard bar); the turn over, the worry is back.
  const alarmed = async () => (await ui.findAll({ type: 'Text' })).filter(t => t.props.backgroundColor === hex(SKINS.red.alert)).map(t => String(t.text))
  await $.turn.start({ text: 'go on', turnId: 'main' })
  expect(await text()).toContain('PROTOCOL // WORKING')
  expect(await text()).not.toContain('WEEKLY QUOTA RUNNING DRY')
  expect((await order()).some(line => /^│~│ JACKED IN\. TRACING\.\.\. +▛$/.test(line))).toBe(true)
  expect((await ui.findAll({ type: 'Text' })).filter(t => String(t.text).includes('JACKED IN')).map(t => t.props.backgroundColor)).toContain(hex(SKINS.red.cyan))
  expect(await alarmed()).toEqual([' 90'])
  await $.turn.complete({ reason: 'aborted', answer: '', durationMs: 1, isAborted: true, turnId: 'main' })
  expect(await alarmed()).toEqual([' WEEKLY QUOTA RUNNING DRY ▞▞▞', ' 90'])
  await ui.press({ key: 'pet' })
  expect(await text()).toContain('CLEAN RUN. ZERO TRACE.')
  expect(await text()).toContain('[ ♥ 1 ]')
  await ui.unmount()

  // A pane too short for the whole mask crops it about its visor; shorter still, the HUD alone.
  // (A pane of `bodyRows` rows for the avatar, and the one above them the Loadouts line takes.)
  const pane = (bodyRows: number, bodyColumns = 34) => ({ ...KIRBY_PANE, props: { ...KIRBY_PANE.props, bodyColumns, scroll: { offset: 0, bodyRows: bodyRows + 1 } } })
  const short = await $.ui.mount(pane(24))
  expect((await short.find({ key: 'kirby' }))?.props.rows).toBe(7)
  await short.unmount()
  const tiny = await $.ui.mount(pane(18))
  expect(await tiny.find({ type: 'Raster' })).toBeUndefined()
  expect(flow(await tiny.drawn()).join('\n')).toContain('RAIJIN TACHI')
  await tiny.unmount()
  // Wider, it uses the room: the margins grow, the bars too.
  const roomy = await $.ui.mount(pane(60, 46))
  expect((await roomy.find({ key: 'kirby' }))?.props.columns).toBe(45)
  expect(widest(await roomy.drawn())).toBe(45)
  await roomy.unmount()

  // Whatever the pane's height, a running agent is told: the mask never takes the rows of the rule and one block,
  // and is the same with and without the agent. (From 17 rows: the HUD's fifteen and those two.)
  const heights = Array.from({ length: 26 }, (_row, i) => 17 + i)
  const bare = new Map<number, unknown>()
  for (const rows of heights) {
    const before = await $.ui.mount(pane(rows))
    bare.set(rows, (await before.find({ key: 'kirby' }))?.props.rows)
    await before.unmount()
  }
  await $.tool.call(inAgent('late', { tool: 'Bash', command: 'true' }))
  for (const rows of heights) {
    const ui = await $.ui.mount(pane(rows))
    const lines = flow(under(await ui.drawn()))
    expect(lines.some(line => line.includes('SUBNET // 01 PROC'))).toBe(true)
    expect(written(await ui.find({ key: 'stage' })).join('\n')).toContain('[THNK]')
    const maskRows = (await ui.find({ key: 'kirby' }))?.props.rows
    expect(maskRows).toBe(bare.get(rows))
    // The column fits the pane: the HUD's fifteen rows, the mask, the rule and the blocks.
    // (The Loadouts line gives its row up at the one height where it would cost the pane its mask: the avatar then has `rows + 1`.)
    const own = rows + ((await ui.find({ key: 'loadout' })) === undefined ? 1 : 0)
    expect(15 + Number(maskRows ?? 0) + 1 + Number((await ui.find({ key: 'stage' }))?.props.rows)).toBeLessThan(own + 1)
    await ui.unmount()
  }
})

test('the HUD fits the pane when the context is critical and the model id is a long one', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on, {}, 'custom:ghostrunner')
  on('session.usage', () => ({ value: { ...USAGE, context: { tokens: 150_000, window: 200_000, percent: 75 } } }))
  on('ui.blit', () => ({ value: {} }))
  const pane = (bodyColumns: number) => ({ ...KIRBY_PANE, props: { ...KIRBY_PANE.props, bodyColumns, scroll: { offset: 0, bodyRows: 60 } } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (const [model, named] of [['claude-fable-5-20260101', 'RAIJIN ORACLE // FABLE-5 ├─'], ['claude-sonnet-4-5-20250929', 'RAIJIN TACHI // SONNET-4-5 ├─'], ['claude-haiku-experimental-preview', 'RAIJIN PING // HAIKU-EXPER… ├─']] as const) {
    sessionModel = model
    await clock.advance(4400) // the slow tick re-reads the model
    const ui = await $.ui.mount(pane(34))
    const lines = flow(under(await ui.drawn()))
    // The advice the bar is there to give is whole, the bar as wide as the HUD; the name's frame is closed.
    // (A bracketed tag in the alert colour, not a second filled bar under the hazard bars.)
    expect(lines.filter(line => line.startsWith('[!]'))).toEqual(['[!] CONTEXT CRITICAL > /clear'])
    expect(lines.some(line => line.includes(' BUFFER NEAR FULL. /clear ▞▞▞'))).toBe(true)
    expect(lines.some(line => line.endsWith(named))).toBe(true)
    for (const line of lines) if (!line.startsWith('<')) expect(line.length).toBeLessThan(34)
    expect(widest(await ui.drawn())).toBe(33)
    await ui.unmount()
  }
  // Narrower than the pane is ever opened (its captions are cut there), the bar still says what to do, whole.
  const narrow = await $.ui.mount(pane(24))
  expect(flow(await narrow.drawn()).filter(line => line.startsWith('[!]'))).toEqual(['[!] CTX FULL > /clear'])
  await narrow.unmount()
})

test('the Cyberpunk Edgerunners theme is the same HUD in yellow', async ($, on) => {
  mock.clock(on, { now: NOW })
  store(on, {}, 'custom:cyberpunk-edgerunners', 'claude-fable-5')
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  on('ui.blit', () => ({ value: {} }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  const lines = flow(under(await ui.drawn()))
  expect(lines.join('\n')).toContain('RAIJIN ORACLE // FABLE-5')
  expect(lines.join('\n')).toContain('ICE HOLDING. STANDING BY.')
  // No session id told, no limits: the captions say so rather than show a made-up figure.
  expect(lines[0]).toBe('CONNECTION')
  expect(lines.filter(line => line.includes('UNAVAILABLE')).length).toBe(2)
  expect(lines.some(line => /\b0 100$/.test(line))).toBe(false)
  const colours = new Set((await ui.findAll({ type: 'Text' })).flatMap(t => [t.props.color, t.props.backgroundColor]))
  expect(colours.has(hex(SKINS.yellow.primary))).toBe(true)
  expect([hex(SKINS.red.dim), hex(SKINS.red.shadow)].some(color => colours.has(color))).toBe(false)
  const mask = await ui.find({ key: 'kirby' })
  expect(written(mask)).toEqual(textOf(maskFrame(SKINS.yellow, 'fable', 'idle', NOW, 33, MASK_ROWS)))
  await ui.unmount()
})

const BODY_OF = new Map<number, number>(SWAPS.flatMap((swap, slot) => [[swap[0], slot], [swap[2], slot]] as const))

/**
 * What is on a true-pixel frame, in one pass over it: every mini's box, by its body's colours, from
 * row `sky` down; the colours above that row; and whether the queue's count is anywhere.
 */
function seenOn(scene: Canvas, sky: number): { boxes: Map<number, Span4>; above: Set<number>; hasMarker: boolean } {
  const boxes = new Map<number, Span4>()
  const above = new Set<number>()
  let hasMarker = false
  scene.data.forEach((color, i) => {
    const [x, y] = [i % scene.width, Math.floor(i / scene.width)]
    if (color === MARKER) hasMarker = true
    if (y < sky) return void above.add(color)
    const slot = BODY_OF.get(color)
    if (slot === undefined) return
    const box = boxes.get(slot)
    boxes.set(slot, box === undefined ? { left: x, right: x, top: y, bottom: y } : { left: Math.min(box.left, x), right: Math.max(box.right, x), top: box.top, bottom: y })
  })

  return { boxes, above, hasMarker }
}

test('the true-pixel stage: real sprites in exact colour swaps, each act its own picture, motion by the pixel', () => {
  const [W, H] = [99, 70]
  const sky = H - GROUND_PX - REACH_PX
  const boxOf = (scene: Canvas, slot: number) => seenOn(scene, sky).boxes.get(slot)
  const agent = (tool?: string, slot = 0): Agent => ({ slot, calls: tool === undefined ? [] : [{ tool }] })
  const print = (scene: Canvas) => scene.data.join(',')

  // Kirby is the game's 16 by 16 sprite; a slot's colours swap his body, its shaded edge and his feet, exactly, and nothing else:
  // the edge is the body's shade all round, never the feet's colour.
  expect(kirbyMini(0).poses.stand[0]!.px.slice(0, 8).flat().includes(SWAPS[0]![2])).toBe(false)
  expect(kirbyMini(0).poses.stand[0]!.px.flat().filter(color => color === SWAPS[0]![2]).length).toBeGreaterThan(5)
  expect([kirbyMini(0).poses.stand[0]!.px.length, kirbyMini(0).poses.stand[0]!.px[0]!.length]).toEqual([16, 16])
  for (const mini of [kirbyMini, clawdMini]) {
    for (const pose of Object.keys(mini(0).poses) as HiPose[]) {
      mini(0).poses[pose].forEach((one, i) => {
        const [a, b] = [one.px.flat(), mini(1).poses[pose][i]!.px.flat()]
        a.forEach((color, k) => {
          const swap = color === null ? -1 : SWAPS[0]!.slice(0, 3).indexOf(color)
          expect(b[k]).toBe(swap < 0 ? color : SWAPS[1]![swap]!)
        })
        expect(a.filter(color => color === SWAPS[0]![0]).length).toBeGreaterThan(20)
      })
    }
  }

  // Each act is its own picture in both families, roomy or crowded, and a frame is a function of its inputs alone.
  const hurt = { ...agent('Read'), hurtAt: NOW }
  const done = { ...agent(), doneAt: NOW }
  const lost = { ...agent(), doneAt: NOW, isLost: true }
  const shaken = { ...agent(), hurtAt: NOW - 60_000 }
  for (const mini of [kirbyMini, clawdMini]) {
    for (const crowd of [0, 4]) {
      const others = Array.from({ length: crowd }, (_a, i) => agent(undefined, i + 1))
      const drawn = (a: Agent, now = NOW + 450) => [0, 180, 720].map(ms => print(stageFrame(mini, [a, ...others], now + ms, W, H))).join('|')
      const pictures = ['Read', 'Edit', 'Bash', 'WebFetch', 'Agent', 'Skill', 'AskUserQuestion', 'mcp__db__query'].map(tool => drawn(agent(tool)))
      const more = [drawn(agent()), drawn(hurt), drawn(done), drawn(lost), drawn(shaken)]
      expect(new Set([...pictures, ...more]).size).toBe(pictures.length + more.length)
      expect(drawn(agent('Edit'))).toBe(drawn(agent('Edit')))
    }
  }

  // Motion is by the pixel: an agent thinking walks at most two pixels from one frame to the next.
  let was: number | undefined
  let moved = 0
  for (let ms = 0; ms < 9000; ms += 90) {
    const left = boxOf(stageFrame(kirbyMini, [agent()], NOW + ms, W, H), 0)?.left
    expect(left).toBeDefined()
    if (was !== undefined && left !== undefined) {
      expect(Math.abs(left - was)).toBeLessThan(4)
      moved += left === was ? 0 : 1
    }
    was = left
  }
  expect(moved).toBeGreaterThan(20)
})

test('the true-pixel stage: nothing overlaps or leaves the frame, whoever comes and goes, and the queue is in the sky', () => {
  const [W, H] = [99, 70]
  const ground = H - GROUND_PX
  const sky = ground - REACH_PX
  const tools = [undefined, 'Read', 'Edit', 'Bash', 'WebFetch', 'Agent', 'Skill', 'AskUserQuestion', 'Other']
  const models = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-fable-5']
  // What is wrong with any frame, said once: nothing.
  const wrong: string[] = []
  for (const mini of [kirbyMini, clawdMini]) {
    for (const width of [NARROWEST_PX, W, 150]) {
      for (const count of [0, 1, 2, 4, 5, 7]) {
        // Every other frame of the story (each agent's own clock is out of step with the others': no beat is missed by all).
        for (let frame = 0; frame < 84; frame += 2) {
          const now = NOW + frame * 90
          // One fails, one joins late, one finishes, one is stopped short; both are forgotten once they have left.
          const crew: Agent[] = Array.from({ length: count }, (_a, i): Agent => ({
            slot: i,
            model: models[i % models.length]!,
            calls: [tools[(i * 2 + (frame >> 4)) % tools.length]].flatMap(tool => (tool === undefined ? [] : [{ tool }])),
            ...(i === 1 ? { hurtAt: NOW + 300 } : {}),
            ...(i === 2 ? { joinedAt: NOW + 1000, hitAt: NOW + 3000 } : {}),
            ...(i === 0 && count > 1 ? { doneAt: NOW + 400 } : {}),
            ...(i === 3 ? { doneAt: NOW + 900, isLost: true } : {}),
          })).filter(a => (a.joinedAt ?? 0) <= now && (a.doneAt === undefined || a.doneAt > now || now - a.doneAt < LEAVE_MS))
            .map(a => (a.doneAt !== undefined && a.doneAt > now ? { ...a, doneAt: undefined, isLost: undefined } : a))
            .map(a => (a.hurtAt !== undefined && a.hurtAt > now ? { ...a, hurtAt: undefined } : a))
          const scene = stageFrame(mini, crew, now, width, H)
          const where = `${mini === kirbyMini ? 'kirby' : 'clawd'} ${width} px, ${count} agents, +${frame * 90} ms`
          if (scene.width !== width || scene.height !== H || scene.data.length !== width * H) wrong.push(`${where}: not width by height`)

          // Each mini's body in a box of its own, inside the stage's margins and on the ground: no two boxes ever meet.
          const { boxes, above, hasMarker } = seenOn(scene, sky)
          const found = [...boxes.values()]
          if (found.some(box => box.left < 1 || box.right > width - 2 || box.bottom >= ground)) wrong.push(`${where}: a mini outside the margins`)
          if (found.some((a, i) => found.slice(i + 1).some(b => !(a.right < b.left || b.right < a.left)))) wrong.push(`${where}: two minis meet`)

          // As many get a mini as the width holds. Each agent that waits is in the sky as its own mini; the "+" and a
          // count are there only for those that did not fit (but while one rides off up through the sky, over them).
          const staged = stagedArt(crew, now, width)
          const waiting = crew.filter(a => actOf(a, now) !== 'exit' && !staged.includes(a))
          if (staged.length > capArt(width, Infinity)) wrong.push(`${where}: more minis than the width holds`)
          const isCrossed = crew.some(a => actOf(a, now) === 'exit' && a.isLost !== true)
          if (!isCrossed && hasMarker !== waiting.some(a => !above.has(SWAPS[a.slot]![0]))) wrong.push(`${where}: the queue's count`)
          if (width === W && waiting.length > 0 && waiting.length < 3 && hasMarker) wrong.push(`${where}: a count where every waiting mini fits`)
        }
      }
    }
  }
  expect(wrong).toEqual([])
})

test('the true-pixel stage: as many minis as the width holds, a zone holds its mini whole, the sky is clear, the enemy comes for two', () => {
  const [W, H] = [99, 70]
  const ground = H - GROUND_PX
  const sky = ground - REACH_PX
  const at = (scene: Canvas, x: number, y: number) => scene.data[y * scene.width + x]!
  const boxOf = (scene: Canvas, slot: number) => seenOn(scene, sky).boxes.get(slot)
  const agent = (tool?: string, slot = 0): Agent => ({ slot, calls: tool === undefined ? [] : [{ tool }] })
  // Four minis on the default pane's 99 pixels, five on a wider stage, one on the narrowest; the picture is at least STAGE_PX tall.
  expect([capArt(W, 9), capArt(150, 9), capArt(NARROWEST_PX, 9), capArt(60, 2)]).toEqual([4, 5, 1, 2])
  // A zone holds its mini whole whatever it does: no pose is wider than the narrowest zone, but the sword's swing and
  // the ride, which have a narrow form of their own there.
  for (const mini of [kirbyMini, clawdMini]) {
    for (const pose of Object.keys(mini(0).poses) as HiPose[]) {
      if (pose !== 'slash' && pose !== 'ride') for (const one of mini(0).poses[pose]) expect(one.px[0]!.length).toBeLessThan(24)
    }
  }
  // A ride wider than its zone is a small star instead, whole: with four on stage, the column left clear at each zone's end is clear.
  const riders = [0, 1, 2, 3].map(slot => agent('WebFetch', slot))
  for (const mini of [kirbyMini, clawdMini]) {
    for (let ms = 0; ms < 3000; ms += 90) {
      const scene = stageFrame(mini, riders, NOW + ms, W, H)
      for (const edge of [24, 49, 73]) for (let y = sky; y < ground - 2; y++) expect(at(scene, edge, y)).toBe(CLEAR)
    }
  }
  expect(H).toBeGreaterThan(STAGE_PX - 1)

  // The background is clear: most of a frame is nothing at all, the ground strip alone is filled.
  const quiet = stageFrame(kirbyMini, [agent()], NOW, W, H)
  expect(quiet.data.filter(color => color === CLEAR).length).toBeGreaterThan(W * H * 0.7)
  for (let x = 0; x < W; x++) expect(at(quiet, x, H - 1)).not.toBe(CLEAR)

  // A freed place is taken at once, and comings and goings that overlap never make a working mini jump.
  for (const mini of [kirbyMini, clawdMini]) {
    for (const gap of [90, 1300]) {
      const crew = (now: number): Agent[] => [
        { slot: 0, calls: [], doneAt: NOW },
        { slot: 1, calls: [], doneAt: NOW + gap },
        { slot: 2, calls: [{ tool: 'Read' }] },
        { slot: 3, calls: [{ tool: 'Read' }], joinedAt: NOW + 4800 },
      ].filter(a => (a.joinedAt ?? 0) <= now && (a.doneAt === undefined || now - a.doneAt < LEAVE_MS))
      let before: number | undefined
      for (let ms = 0; ms < 16_000; ms += 90) {
        const box = boxOf(stageFrame(mini, crew(NOW + ms), NOW + ms, W, H), 2)
        expect(box).toBeDefined()
        const middle = box === undefined ? undefined : (box.left + box.right) / 2
        if (before !== undefined && middle !== undefined) expect(Math.abs(middle - before)).toBeLessThan(9)
        before = middle
      }
    }
  }

  // With two or more at it Bronto Burt is in the sky, and not for one alone; he is gone for a while when an agent finishes.
  const BURT = INKS[6]
  const skyOf = (crew: Agent[], ms: number) => {
    const scene = stageFrame(kirbyMini, crew, NOW + ms, W, H)

    return new Set(scene.data.slice(0, sky * W))
  }
  const trio: Agent[] = [0, 1, 2].map(slot => agent('Edit', slot))
  expect(skyOf(trio, 2000).has(BURT)).toBe(true)
  expect(skyOf(trio.slice(0, 1), 2000).has(BURT)).toBe(false)
  const won = trio.map(a => (a.slot === 1 ? { ...a, calls: [], doneAt: NOW } : a))
  expect(skyOf(won, 800).has(BURT)).toBe(false)
  expect(skyOf(won, 6500).has(BURT)).toBe(true)
  const stopped = won.map(a => ({ ...a, isLost: a.doneAt !== undefined }))
  expect(skyOf(stopped, 800).has(BURT)).toBe(true)
})

test('nothing on the true-pixel stage is somewhere else from one frame to the next, whatever changes', () => {
  const [W, H] = [99, 63]
  const sky = H - GROUND_PX - REACH_PX
  /** The middle of a mini's body on a frame, by its colours, below the sky. */
  const middleOf = (scene: Canvas, slot: number) => {
    const body = new Set<number>([SWAPS[slot]![0], SWAPS[slot]![2]])
    let [left, right] = [Infinity, -Infinity]
    for (let y = sky; y < scene.height; y++) {
      for (let x = 0; x < scene.width; x++) if (body.has(scene.data[y * W + x]!)) [left, right] = [Math.min(left, x), Math.max(right, x)]
    }

    return left === Infinity ? undefined : (left + right) / 2
  }
  // The crew as the pane's hooks leave it: `turnedAt` and `wasTool` at each change.
  const stories: Record<string, (now: number, at: number) => Agent> = {
    'a call fails': (now, at) => (now < at ? { slot: 0, calls: [{ tool: 'Bash' }] } : { slot: 0, calls: [], hurtAt: at, turnedAt: at, wasTool: 'Bash' }),
    'a read fails under an edit': (now, at) => ({ slot: 0, calls: [{ tool: 'Edit' }], ...(now < at ? {} : { hurtAt: at }) }),
    'stopped while thinking': (now, at) => ({ slot: 0, calls: [], ...(now < at ? {} : { doneAt: at, turnedAt: at, isLost: true }) }),
    'stopped mid call': (now, at) => (now < at ? { slot: 0, calls: [{ tool: 'Bash' }] } : { slot: 0, calls: [], doneAt: at, turnedAt: at, wasTool: 'Bash', isLost: true }),
    'finished': (now, at) => ({ slot: 0, calls: [], ...(now < at ? {} : { doneAt: at, turnedAt: at }) }),
    'a call begins': (now, at) => ({ slot: 0, calls: now < at ? [] : [{ tool: 'Read' }], ...(now < at ? {} : { turnedAt: at }) }),
    'a call ends': (now, at) => (now < at ? { slot: 0, calls: [{ tool: 'Bash' }] } : { slot: 0, calls: [], hitAt: at, turnedAt: at, wasTool: 'Bash' }),
    'one call after another': (now, at) => (now < at ? { slot: 0, calls: [{ tool: 'WebFetch' }] } : { slot: 0, calls: [{ tool: 'Bash' }], turnedAt: at, wasTool: 'WebFetch' }),
  }
  for (const mini of [kirbyMini]) {
    for (const story of Object.values(stories)) {
      // The change at several moments of what it was doing: at either end of a walk, mid lunge.
      for (const at of [NOW + 630, NOW + 1170, NOW + 1980, NOW + 3150]) {
        let before: number | undefined
        for (let now = NOW; now < at + 2700; now += 90) {
          const middle = middleOf(stageFrame(mini, [story(now, at)], now, W, H), 0)
          // Half a body a frame at the very most (a lunge's slide a little more), never the fifteen pixels of a mini put somewhere else.
          if (before !== undefined && middle !== undefined) expect(Math.abs(middle - before)).toBeLessThan(actOf(story(now, at), now) === 'dash' ? 12 : 8)
          before = middle
        }
      }
    }
  }

  // A failed call is the enemy's doing, even for an agent alone: it dives in, and is gone again.
  const BURT = INKS[6]
  const failed: Agent = { slot: 0, calls: [], hurtAt: NOW, turnedAt: NOW, wasTool: 'Bash' }
  expect(coloursOf(stageFrame(kirbyMini, [failed], NOW + 180, W, H)).has(BURT)).toBe(true)
  expect(coloursOf(stageFrame(kirbyMini, [failed], NOW + 180, W, H)).has(IMPACT)).toBe(true)
  expect(coloursOf(stageFrame(kirbyMini, [failed], NOW + 2000, W, H)).has(BURT)).toBe(false)
  // An agent that finishes throws a star at the enemy first: it pops when that lands, not before.
  const pair: Agent[] = [{ slot: 0, calls: [], doneAt: NOW, turnedAt: NOW }, { slot: 1, calls: [{ tool: 'Read' }] }]
  expect(coloursOf(stageFrame(kirbyMini, pair, NOW + 270, W, H)).has(BURT)).toBe(true)
  expect(coloursOf(stageFrame(kirbyMini, pair, NOW + 900, W, H)).has(BURT)).toBe(false)

  // The pop is the game's own, brown and cream.
  expect(coloursOf(stageFrame(kirbyMini, pair, NOW + 800, W, H)).has(INKS[4])).toBe(true)
})

test('the mascot in true pixels: the user\'s Kirby keeps its exact pixels, the game frames exact, a shake that eases', () => {
  const kirby = familyOf('custom:kirby')
  if ('skin' in kirby) throw new Error('Kirby is drawn in pixels')
  // Plain Kirby is the user's own drawing, twenty pixels wide: he is handed over pixel for pixel, for the pane to
  // enlarge as it is, never rounded off (no family has a way to ask for that).
  const plain = kirby.forms.opus.frames[0]!
  const drawn = frameOf({ family: kirby, form: 'opus' }, 'idle', NOW)
  expect([drawn.length, drawn[0]!.length]).toEqual([plain.length, plain[0]!.length])
  expect(JSON.stringify(drawn)).toBe(JSON.stringify(plain))
  expect(JSON.stringify(plain)).toBe(JSON.stringify(KIRBY))
  expect('smooth' in kirby).toBe(false)
  // His moods are painted on those same pixels: a few of them change, none moves.
  const glad = pixelsOf({ family: kirby, form: 'opus' }, 'happy', 0, false)
  expect([glad.length, glad[0]!.length]).toEqual([plain.length, plain[0]!.length])
  expect(glad.flat().filter((color, i) => color !== plain.flat()[i]).length).toBeLessThan(12)
  // The copy abilities are the game's frames, and Clawd is Clawd: their pixels are handed over as they are.
  for (const form of ['sonnet', 'haiku', 'fable'] as const) expect(kirby.forms[form].frames).toContain(frameOf({ family: kirby, form }, 'idle', NOW))
  const clawd = familyOf('dark')
  if ('skin' in clawd) throw new Error('Clawd is drawn in pixels')
  expect(clawd.forms.opus.frames).toContain(frameOf({ family: clawd, form: 'opus' }, 'idle', NOW))

  // Worried: a shiver a pixel at a time, then a rest, never a saw's jump back.
  const shake = Array.from({ length: 96 }, (_f, i) => shakeAt(NOW + i * 90))
  shake.forEach((dx, i) => expect(Math.abs(dx - (shake[i - 1] ?? dx))).toBeLessThan(2))
  expect([Math.min(...shake), Math.max(...shake)]).toEqual([-2, 2])
  expect(shake.filter(dx => dx === 0).length).toBeGreaterThan(48)
})

test('in true pixels a short pane keeps the mascot its size and the legend alone; every mini on stage has its legend line', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on, {}, 'custom:kirby', 'claude-opus-5-5')
  kitty(on)
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  on('ui.blit', () => ({ value: {} }))
  on('tool.call', () => ({ result: 'ok' }))
  // (A pane of `bodyRows` rows for the avatar, and the one above them the Loadouts line takes.)
  const pane = (bodyRows: number) => ({ ...KIRBY_PANE, props: { ...KIRBY_PANE.props, bodyColumns: 34, scroll: { offset: 0, bodyRows: bodyRows + 1 } } })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) await $.tool.call(inAgent(id, { tool: 'Read', file_path: `/tmp/${id}` }))
  await clock.advance(1)

  // Whatever the height, from the shortest pane that holds him whole: never a mascot a third of its size to make room for the stage.
  const widths: number[] = []
  for (let rows = 23; rows <= 40; rows++) {
    const ui = await $.ui.mount(pane(rows))
    const mascot = (await ui.find({ key: 'kirby' }))?.props
    const stage = (await ui.find({ key: 'stage' }))?.props
    const width = Number((mascot?.source as { width: number }).width)
    widths.push(width)
    expect(width).toBeGreaterThan(45) // two art pixels to a sprite pixel at the least: 20 * 2 + 6
    // The column fits the pane: the meters and the bubble, the mascot, and the stage where there is one.
    expect(14 + Number(mascot?.rows) + Number(stage?.rows ?? 0)).toBeLessThan(rows + 1)
    if (rows < 32) expect(stage).toBeUndefined()
    if (rows < 32 || rows > 33) expect(width).toBe(69)
    // No stage, the agents are still told: a line of legend each while rows are left, the last one counting the rest.
    const lines = (await ui.findAll({ type: 'Text' })).map(t => String(t.text)).filter(t => /^[●○] .|more$/.test(t))
    expect(lines.length).toBe(Math.min(5, rows - 14 - Number(mascot?.rows) - Number(stage?.rows ?? 0)))
    await ui.unmount()
  }
  expect(new Set(widths).size).toBeLessThan(3)

  // A tall pane: four have a mini on 99 pixels and the fifth waits; all five are named, in their colours, none merely counted.
  const tall = await $.ui.mount(TALL)
  const texts = (await tall.findAll({ type: 'Text' })).map(t => String(t.text))
  expect([texts.filter(t => t === '● ').length, texts.filter(t => t === '○ ').length]).toEqual([4, 1])
  expect(texts.some(t => t.includes('more'))).toBe(false)
  await tall.unmount()
})

// --- the grounds: the terminal's background and the pane's ---------------------

/** A terminal a person sits at, as `kitty` has it, its pty found (or not) as `found` says; every child the mod starts is kept. */
function terminal(on: On, found = '/dev/pts/7 1 1000 1000', env: Record<string, string> = { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1' }) {
  mock.env(on, env)
  const runs: (readonly string[])[] = []
  on('process.run', (_$, e) => {
    runs.push(e.argv)
    const script = e.argv[3] ?? ''
    const stdout = script.includes('getppid') ? `${found}\n` : script.includes('TIOCGWINSZ') ? '46 209 1881 966\n' : ''

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  /** What the terminal was told, in order: each write's pty and its colour ('' for "your own background back"). */
  const told = () => runs.filter(argv => (argv[3] ?? '').includes(']11;')).map(argv => argv.slice(4))
  const looked = () => runs.filter(argv => (argv[3] ?? '').includes('getppid')).length

  return { told, looked }
}

const KITTY_ENV = { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1' }
const END = { reason: 'prompt_input_exit', sessionId: 's', resume: { id: 's' } } as const
/** A command as the person types it at the prompt. */
const typed = (args: string) => ({ command: 'kirby', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } }) as const

test('the terminal background follows the theme: one escape per change, its own back on another theme, when switched off, and at the end', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const kept = store(on)
  const { told, looked } = terminal(on)
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))

  // At the start: the session's pty is looked for once, and told Kirby's dark green.
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(told()).toEqual([['/dev/pts/7', '#1b2414']])
  // Nothing changes: nothing is sent, however long it lasts.
  await clock.advance(20_000)
  expect(told().length).toBe(1)

  // A theme change is followed within a few seconds, once each: the light pink, the red-black, the yellow-black,
  // and for a theme that brings no ground the terminal's own back.
  const wanted = [['custom:kirby-pink', '#2b1724'], ['custom:ghostrunner', '#120608'], ['custom:cyberpunk-edgerunners', '#0b0b06'], ['dark', ''], ['custom:kirby', '#1b2414']] as const
  for (const [theme, color] of wanted) {
    sessionTheme = theme
    await clock.advance(4400)
    expect(told()[told().length - 1]).toEqual(['/dev/pts/7', color])
    await clock.advance(8800)
  }
  expect(told().length).toBe(1 + wanted.length)
  // One built-in theme after another: the terminal already has its own background, and is not told again.
  sessionTheme = 'dark'
  await clock.advance(4400)
  sessionTheme = 'light'
  await clock.advance(4400)
  expect(told().slice(-2).map(args => args[1])).toEqual(['#1b2414', ''])
  sessionTheme = 'custom:kirby'
  await clock.advance(4400)

  // Switched off, the terminal gets its own background back at once, and the choice is kept; on again, the theme's.
  expect((await $.command.run(typed('background off'))).text).toContain('your own')
  expect(told()[told().length - 1]).toEqual(['/dev/pts/7', ''])
  expect(kept.get('background')).toBe(false)
  const off = told().length
  sessionTheme = 'custom:ghostrunner'
  await clock.advance(8800)
  expect(told().length).toBe(off)
  expect((await $.command.run(typed('background on'))).text).toContain('follows the theme')
  expect(told()[told().length - 1]).toEqual(['/dev/pts/7', '#120608'])
  expect(kept.get('background')).toBe(true)
  expect((await $.command.run(typed('background maybe'))).text).toContain('on|off')
  expect(told().length).toBe(off + 1)

  // The pty was looked for once in all; the session over, the terminal has its own background again.
  expect(looked()).toBe(1)
  await $.session.end(END)
  expect(told()[told().length - 1]).toEqual(['/dev/pts/7', ''])
  // And keeps it: a timer still running after the end tells it nothing more, whatever the theme, and whatever is typed.
  const ended = told().length
  await clock.advance(8800)
  sessionTheme = 'custom:kirby'
  await clock.advance(8800)
  await $.command.run(typed('background on'))
  expect(told().length).toBe(ended)
  // A /clear or a resume goes on in the same terminal: the next session's start tints it again.
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(told()[told().length - 1]).toEqual(['/dev/pts/7', '#1b2414'])
  await $.session.end({ ...END, reason: 'clear' })
  await clock.advance(8800)
  expect(told().length).toBe(ended + 1)
  // Every write named a pty and a colour or nothing: no other shape ever reaches the child.
  for (const [path, color] of told()) expect([/^\/dev\/pts\/\d+$/.test(path!), /^(#[0-9a-f]{6})?$/.test(color!)]).toEqual([true, true])
})

test('the terminal is written to one write at a time, in the order asked: a second never overtakes a first still running', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on)
  mock.env(on, KITTY_ENV)
  const started: string[] = []
  const held: (() => void)[] = []
  const ok = { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  on('process.run', (_$, e) => {
    const script = e.argv[3] ?? ''
    if (script.includes('getppid')) return { value: { ...ok.value, stdout: '/dev/pts/7 1 1000 1000\n' } }
    if (!script.includes(']11;')) return ok
    started.push(e.argv[5] ?? '')

    return new Promise(done => held.push(() => done(ok)))
  })
  on('session.usage', () => ({ value: USAGE }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))

  // The first write, the green, is still running when the person switches the background off, then leaves.
  const start = $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(1)
  expect(started).toEqual(['#1b2414'])
  const off = $.command.run(typed('background off'))
  await clock.advance(1)
  expect(started).toEqual(['#1b2414'])
  // The green lands; only then is "your own background" written: the terminal ends on what was asked last.
  held.shift()?.()
  await start
  await clock.advance(1)
  expect(started).toEqual(['#1b2414', ''])
  held.shift()?.()
  await off
  await $.session.end(END)
  expect(started).toEqual(['#1b2414', ''])
})

// Not a pty; a file; a pty that is no character device; somebody else's pty; nothing found; paths that only start like one.
for (const found of ['/dev/null 1 1000 1000', '/tmp/pts/3 1 1000 1000', '/dev/pts/3 0 1000 1000', '/dev/pts/3 1 0 1000', '', '/dev/pts/3x 1 1000 1000', '/dev/pts/../null 1 1000 1000']) {
  test(`nothing is ever written to what is not a pty of the person's own: "${found}"`, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    store(on)
    const { told, looked } = terminal(on, found)
    on('session.usage', () => ({ value: USAGE }))
    on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    sessionTheme = 'custom:ghostrunner'
    await clock.advance(8800)
    await $.command.run(typed('background off'))
    await $.command.run(typed('background on'))
    await $.session.end(END)
    expect(told()).toEqual([])
    // It was looked for once, and that answer stands: nothing is tried again.
    expect(looked()).toBe(1)
  })
}

const AT_TERMINAL = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const SILENT = [
  ['a session nobody sits at', { ...AT_TERMINAL, isInteractive: false }, KITTY_ENV, {}, []],
  ['a session on another surface', { ...AT_TERMINAL, surface: 'desktop' }, KITTY_ENV, {}, []],
  ['a multiplexer\'s pane', AT_TERMINAL, { ...KITTY_ENV, TMUX: '/tmp/tmux-1000/default,1,0' }, {}, []],
  ['a screen session', AT_TERMINAL, { ...KITTY_ENV, STY: '1234.pts-0.host' }, {}, []],
  ['a zellij pane', AT_TERMINAL, { ...KITTY_ENV, ZELLIJ: '0' }, {}, []],
  ['a tmux reached over ssh', AT_TERMINAL, { TERM: 'tmux-256color' }, {}, []],
  ['a screen reached over ssh', AT_TERMINAL, { TERM: 'screen-256color' }, {}, []],
  ['a terminal that takes no colours', AT_TERMINAL, { TERM: 'dumb' }, {}, []],
  ['no terminal named at all', AT_TERMINAL, {}, {}, []],
  // Off in the store from the start: nothing but, once, "your own background" (a session before may have left its colour).
  ['the switch off from the start', AT_TERMINAL, KITTY_ENV, { background: false }, [['/dev/pts/7', '']]],
] as const
for (const [name, start, env, entries, sent] of SILENT) {
  test(`the terminal is not told a colour from ${name}`, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    store(on, entries)
    const { told } = terminal(on, undefined, env)
    on('session.usage', () => ({ value: USAGE }))
    on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
    await $.session.start(start)
    await clock.advance(8800)
    const before = told()
    await $.session.end(END)
    expect(before).toEqual(sent)
    expect(told()).toEqual(sent)
  })
}

/** How two colours contrast, as WCAG counts it: 1 to 21. */
function contrast(a: number, b: number): number {
  const light = (color: number) => {
    const [r, g, bl] = [(color >> 16) & 255, (color >> 8) & 255, color & 255].map(c => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4))

    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!
  }
  const [hi, lo] = [Math.max(light(a), light(b)), Math.min(light(a), light(b))]

  return (hi + 0.05) / (lo + 0.05)
}

// Each theme's `text` colour, from the person's theme files (~/.claude/themes).
const THEME_TEXT = { kirby: 0xf2f5e6, 'kirby-pink': 0xfbe8f0, ghostrunner: 0xffaca1, 'cyberpunk-edgerunners': 0xefe8b0 } as const

test('each theme has its grounds: body text reads on both, the pane the terminal own tone, and no other theme has any', () => {
  expect(GROUNDS.kirby).toEqual({ terminal: 0x1b2414, pane: 0x1b2414 })
  expect(['custom:kirby-pink', 'light', 'light-daltonized', 'custom:kirby', 'dark', 'custom:ghostrunner', ''].map(isLightOf)).toEqual([false, true, true, false, false, false, false])
  expect(Object.keys(GROUNDS).sort()).toEqual(Object.keys(THEME_TEXT).sort())
  for (const [name, text] of Object.entries(THEME_TEXT)) {
    const { terminal, pane } = GROUNDS[name]!
    expect(contrast(text, terminal)).toBeGreaterThan(4.5)
    expect(contrast(text, pane)).toBeGreaterThan(4.5)
    // The pane is the terminal's own tone: the two read as one surface.
    expect(pane).toBe(terminal)
  }
  // Kirby's is a dark green with a yellow cast (more green than red, more red than blue); the pink one a deep berry, the ghostrunner ones near black.
  const [r, g, b] = [0x1b, 0x24, 0x14]
  expect(g > r && r > b).toBe(true)
  expect(contrast(GROUNDS['kirby-pink']!.terminal, 0xffffff)).toBeGreaterThan(12)
  expect([contrast(GROUNDS.ghostrunner!.terminal, 0), contrast(GROUNDS['cyberpunk-edgerunners']!.terminal, 0)].every(c => c < 1.2)).toBe(true)
  // A theme is known by the name the settings give it; one that only resembles ours brings nothing.
  expect(['custom:kirby', 'Kirby', 'custom:kirby-pink', 'Kirby Pink', 'custom:ghostrunner', 'custom:cyberpunk-edgerunners'].map(theme => groundOf(theme)?.terminal)).toEqual([0x1b2414, 0x1b2414, 0x2b1724, 0x2b1724, 0x120608, 0x0b0b06])
  expect(['dark', 'light', '', 'custom:kirby-night', 'custom:solarized', 'constructor'].map(groundOf)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
})

/** Every colour a drawing names, on any element: text, background, border. */
function coloursIn(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(coloursIn)
  if (typeof node !== 'object' || node === null) return []
  const { props, children } = node as Node
  const own = [props?.color, props?.backgroundColor, props?.borderColor].filter((color): color is string => typeof color === 'string')

  return [...own, ...coloursIn(children ?? props?.children)]
}

const rootOf = async (ui: { drawn: () => Promise<unknown> }) => ((await ui.drawn()) as Node).props ?? {}

for (const [theme, name] of [['custom:kirby', 'kirby'], ['custom:kirby-pink', 'kirby-pink'], ['custom:ghostrunner', 'ghostrunner'], ['custom:cyberpunk-edgerunners', 'cyberpunk-edgerunners']] as const) {
  test(`the pane paints its own background in its theme's tone, all of it: ${name}`, async ($, on) => {
    mock.clock(on, { now: NOW })
    store(on, {}, theme, 'claude-opus-5-5')
    on('session.usage', () => ({ value: USAGE }))
    on('ui.blit', () => ({ value: {} }))
    on('tool.call', () => ({ result: 'ok' }))
    const { pane } = GROUNDS[name]!
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.tool.call(inAgent('a1', { tool: 'Read', file_path: '/tmp/a1' }))
    const ui = await $.ui.mount(TALL)
    // The whole pane: its every column and row.
    expect([(await rootOf(ui)).backgroundColor, (await rootOf(ui)).width, (await rootOf(ui)).height]).toEqual([hex(pane), 34, 60])
    // In cells, nothing shows the terminal's own background inside it: an empty cell is the pane's colour.
    const rasters = await ui.findAll({ type: 'Raster' })
    expect(rasters.map(raster => raster.key)).toEqual(['stage', 'kirby'])
    if (name.startsWith('kirby')) expect((await ui.findAll({ type: 'Text' })).filter(isDot).map(t => t.props.color)).toEqual([colorOf(0)])
    for (const raster of rasters) {
      const bytes = atob(String(raster.props.cells))
      const grounds = new Set(Array.from({ length: bytes.length / 12 }, (_c, i) => bytes.charCodeAt(i * 12 + 8) | (bytes.charCodeAt(i * 12 + 9) << 8) | (bytes.charCodeAt(i * 12 + 10) << 16) | (bytes.charCodeAt(i * 12 + 11) << 24)))
      expect(grounds.has(NONE)).toBe(false)
      expect(grounds.has(pane)).toBe(true)
    }
    await ui.unmount()
  })
}

test('a built-in theme keeps the terminal\'s own background: no fill, and the cells on it', async ($, on) => {
  mock.clock(on, { now: NOW })
  store(on, {}, 'dark')
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const plain = await $.ui.mount(TALL)
  expect(['backgroundColor' in (await rootOf(plain)), 'width' in (await rootOf(plain))]).toEqual([false, false])
  expect(colours((await plain.find({ type: 'Raster' }))?.props.cells).has(0x1b2414)).toBe(false)
  expect(atob(String((await plain.find({ type: 'Raster' }))?.props.cells)).charCodeAt(11)).toBe(1)
  await plain.unmount()
})

test('in true pixels the pictures stay clear over the pane\'s background', async ($, on) => {
  mock.clock(on, { now: NOW })
  store(on, {}, 'custom:kirby', 'claude-sonnet-5-5')
  kitty(on)
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  on('tool.call', () => ({ result: 'ok' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call(inAgent('a1', { tool: 'Read', file_path: '/tmp/a1' }))
  const ui = await $.ui.mount(TALL)
  expect(((await ui.drawn()) as Node).props?.backgroundColor).toBe('#1b2414')
  for (const key of ['kirby', 'stage']) {
    const rgba = rgbaOf((await ui.find({ key }))?.props.source)
    const alphas = Array.from({ length: rgba.length / 4 }, (_p, i) => rgba.charCodeAt(i * 4 + 3))
    // A pixel is drawn or it is not: nothing half clear, and most of a picture is nothing at all. No pixel is the pane's colour painted in.
    expect(alphas.every(alpha => alpha === 0 || alpha === 255)).toBe(true)
    expect(alphas.filter(alpha => alpha === 0).length).toBeGreaterThan(alphas.length * 0.4)
    expect(Array.from({ length: rgba.length / 4 }, (_p, i) => (rgba.charCodeAt(i * 4) << 16) | (rgba.charCodeAt(i * 4 + 1) << 8) | rgba.charCodeAt(i * 4 + 2)).includes(0x1b2414)).toBe(false)
  }
  await ui.unmount()
})

for (const theme of ['custom:kirby', 'custom:kirby-pink', 'dark']) {
  test(`the Kirby and Clawd skins name the theme's colours, never a fixed one, so every theme recolours the pane by itself: ${theme}`, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    store(on, {}, theme)
    let live: SessionUsage = { ...USAGE, rateLimits: [] }
    on('session.usage', () => ({ value: live }))
    on('ui.blit', () => ({ value: {} }))
    on('tool.call', (_$, e) => ((e as { command?: string }).command === 'false' ? { deny: 'no' } : { result: 'ok' }))
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    const seen: string[] = []
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    // Calm, then worried by a limit, then by a context to clear; each time with agents thinking, failed, finished and
    // stopped; idle and at work; and the band that stands in for the pane.
    for (const [n, usage] of [{ ...USAGE, rateLimits: [] }, USAGE, { ...USAGE, context: { tokens: 150_000, window: 200_000, percent: 75 } }].entries()) {
      live = usage
      await clock.advance(n === 0 ? 0 : 8800)
      for (const [id, command] of [['a1', 'false'], ['a2', 'true'], ['a3', 'true'], ['a4', 'true']] as const) await $.tool.call(inAgent(`${id}-${n}`, { tool: 'Bash', command }))
      await $.turn.complete({ agentId: `a2-${n}`, reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: `a2-${n}` })
      await $.turn.complete({ agentId: `a3-${n}`, reason: 'aborted', answer: '', durationMs: 1, isAborted: true, turnId: `a3-${n}` })
      panes = SHOWN
      const ui = await $.ui.mount(TALL)
      seen.push(...coloursIn(await ui.drawn()))
      await $.turn.start({ text: 'go on', turnId: `main-${n}` })
      seen.push(...coloursIn(await ui.drawn()))
      await ui.unmount()
      panes = []
      const band = await $.ui.mount(BAND)
      seen.push(...coloursIn(await band.drawn()))
      await band.unmount()
      await $.turn.complete({ reason: 'aborted', answer: '', durationMs: 1, isAborted: true, turnId: `main-${n}` })
    }
    // A fixed colour is an agent's dot, in its mini's colour, or the pane's own ground: nothing else.
    const ground = groundOf(theme)
    const allowed = [...SWAPS.map((_swap, slot) => colorOf(slot, isLightOf(theme))), ...(ground === undefined ? [] : [hex(ground.pane)])]
    expect([...new Set(seen)].filter(color => color.startsWith('#') && !allowed.includes(color))).toEqual([])
    expect(seen.some(color => color.startsWith('#') && color !== (ground === undefined ? '' : hex(ground.pane)))).toBe(true)
    // The border is the prompt's, a worry's the warning's, a context to clear the error's; the bars turn from success to
    // warning to error; four labels in four accents; what is dim is the theme's own dim.
    for (const key of ['promptBorder', 'warning', 'error', 'success', 'claude', 'suggestion', 'planMode', 'merged', 'inactive', 'subtle', 'text']) expect([key, seen.includes(key)]).toEqual([key, true])
  })
}

// --- forms are never blended ----------------------------------------------------

test('every mascot form at every pane height is its own pixels, each a whole number of times: whole, or cut clean at the foot', () => {
  const sprites = Object.values(FAMILIES).map(family => ('skin' in family ? family.cars : family)).filter(family => family !== undefined)
  const wrong: string[] = []
  const cellOf = { kitty: { w: 9, h: 21 }, unknown: ASSUMED }
  for (const family of sprites) {
    for (const form of FORMS) {
      const look: Look = { family, form }
      for (let rows = 20; rows <= 60; rows++) {
        const where = `${family.key} ${form}, ${rows} rows`
        // In cell blocks, a pixel of the form is a pixel of the picture: the look drawn, mirrored, at one place, and nothing else.
        for (const alive of [0, 2]) {
          const drawn = laidOut(look, alive, 34, rows, true)
          const source = mirrored(pixelsOf(drawn.look, 'idle', 0, false))
          const picture = mascotBlocks(drawn, 'idle', 0)
          const top = picture.findIndex(row => row.some(color => color !== null))
          const left = Math.min(...picture.map(row => row.findIndex(color => color !== null)).filter(x => x >= 0)) - source[0]!.findIndex((_c, x) => source.some(row => row[x] !== null))
          const firstRow = source.findIndex(row => row.some(color => color !== null))
          const shown = picture.length - (top - firstRow)
          const isExact = picture.every((row, y) => row.every((color, x) => color === (source[y - (top - firstRow)]?.[x - left] ?? null)))
          if (!isExact) wrong.push(`${where}, cell blocks: not the form's own pixels`)
          // A model's form is whole or not there: only the plain one, on a pane too short even for it, loses its feet. The form drawn is the model's or, failing that, the plain one.
          if (drawn.look.form !== 'opus' && shown < source.length) wrong.push(`${where}, cell blocks: a model's form cut`)
          if (drawn.look.form !== form && drawn.look.form !== 'opus') wrong.push(`${where}, cell blocks: another form`)
          // He is never shrunk for the stage: with agents he is what he is alone, and the column fits the pane wherever plain Kirby does.
          if (JSON.stringify(drawn.size) !== JSON.stringify(laidOut(look, 0, 34, rows, true).size)) wrong.push(`${where}: the mascot moves for the stage`)
          if (rows >= 24 && CHROME_ROWS + drawn.size.rows + (drawn.stage?.rows ?? 0) + drawn.lines > rows) wrong.push(`${where}, cell blocks: taller than the pane`)
          // A model's form never takes the pane's last rows: where it is drawn, both agents are still told, on the stage or by name.
          if (alive === 2 && drawn.look.form !== 'opus' && drawn.stage === null && drawn.lines < 2) wrong.push(`${where}, cell blocks: the agents are not told`)
        }
        // In true pixels, each sprite pixel is `scale` art pixels each way, a whole number: the frame is the form enlarged, exactly.
        for (const [name, cell] of Object.entries(cellOf)) {
          const { art } = laidOutArt(look, 0, 34, rows, cell)
          const source = frameOf(look, 'idle', NOW)
          if (art === undefined || !Number.isInteger(art.scale) || art.scale < 1) {
            wrong.push(`${where}, ${name}: no whole scale`)
            continue
          }
          const frame = mascotFrame(source, 'worried', NOW + 90 * 12, art.mascot.width, art.mascot.height, art.scale)
          const big = scaled(mirrored(source), art.scale)
          const want = blank(art.mascot.width, art.mascot.height)
          paint(want, big, (art.mascot.width - big[0]!.length) >> 1, art.mascot.height - big.length)
          if (JSON.stringify(pixelsIn(frame)) !== JSON.stringify(pixelsIn(want))) wrong.push(`${where}, ${name}: not the form's pixels ${art.scale} times`)
          if (art.mascot.height < source.length * art.scale + HEADROOM) wrong.push(`${where}, ${name}: no headroom`)
        }
      }
    }
  }
  expect(wrong).toEqual([])
  // What a short pane shows, by looking at it: a form sliced flat under its cheeks reads worse than plain Kirby, so a model's
  // form is whole or not there; and it is not there on a pane it would fill to the last row, the agents told by nothing at all:
  // it leaves three rows of legend. Sword Kirby from 42 rows, Fire Kirby from 38, Beam Kirby from 33; plain Kirby, whole, below.
  const kirby = sprites.find(family => family.key === 'kirby')!
  const shownAt = (form: (typeof FORMS)[number], rows: number) => {
    const drawn = laidOut({ family: kirby, form }, 0, 34, rows, true)

    return `${nameOf(drawn.look)} ${drawn.size.rows * 2 - 2 >= framesOf(drawn.look)[0]!.length ? 'whole' : 'cut'}`
  }
  expect([24, 34, 38, 41, 42].map(rows => shownAt('sonnet', rows))).toEqual(['Kirby whole', 'Kirby whole', 'Kirby whole', 'Kirby whole', 'Sword Kirby whole'])
  expect([24, 30, 34, 37, 38].map(rows => shownAt('fable', rows))).toEqual(['Kirby whole', 'Kirby whole', 'Kirby whole', 'Kirby whole', 'Fire Kirby whole'])
  expect([24, 29, 32, 33].map(rows => shownAt('haiku', rows))).toEqual(['Kirby whole', 'Kirby whole', 'Kirby whole', 'Beam Kirby whole'])
  // Too narrow for the form, the plain one, whatever the height.
  expect(nameOf(laidOut({ family: kirby, form: 'sonnet' }, 0, 22, 60, true).look)).toBe('Kirby')
})

// --- a mini wears its agent's model ---------------------------------------------

test('a helper\'s model gives its mini its form: a hat in its own colours, on every pose, in both families and on both stages', async ($, on) => {
  const HATS = { sonnet: 0x38c048, haiku: 0xe82838, fable: 0xf8a800 } as const // the sword's green cap, the beam's red horn, the fire's flames
  const models = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-4-5', fable: 'claude-fable-5' } as const
  const body = new Set(SWAPS.flat())
  // No hat's colour is a colour an agent's swap could give a body: a hat is told from its wearer.
  for (const ink of [...HAT_INKS, ...Object.values(HATS)]) expect(body.has(ink)).toBe(false)

  for (const mini of [kirbyMini, clawdMini]) {
    const plain = mini(0)
    for (const form of ['sonnet', 'haiku', 'fable'] as const) {
      const [worn, other] = [mini(0, form), mini(1, form)]
      for (const pose of Object.keys(plain.poses) as HiPose[]) {
        expect(worn.poses[pose].length).toBe(plain.poses[pose].length)
        worn.poses[pose].forEach((one, i) => {
          const bare = plain.poses[pose][i]!
          // Every frame of every pose wears it: colours the bare one has not; and under it the same body, where it was.
          const [had, has] = [new Set(bare.px.flat()), new Set(one.px.flat())]
          expect([pose, i, [...has].some(color => color !== null && !had.has(color))]).toEqual([pose, i, true])
          expect([one.px.length - one.ay, one.px[0]!.length - one.ax >= bare.px[0]!.length - bare.ax]).toEqual([bare.px.length - bare.ay, true])
          // Another agent's colours change the body alone: the hat keeps its own.
          const [a, b] = [one.px.flat(), other.poses[pose][i]!.px.flat()]
          expect(a.every((color, k) => b[k] === (color === null || !SWAPS[0]!.slice(0, 3).includes(color) ? color : SWAPS[1]![SWAPS[0]!.indexOf(color)]!))).toBe(true)
        })
      }
      expect(worn.tall).toBeGreaterThan(plain.tall)
    }
    expect(mini(0, 'opus')).toBe(plain)
  }
  // Kirby's hats are the abilities' own: at native size on the game's sixteen-pixel sprite, never scaled.
  for (const [form, ink] of Object.entries(HATS)) expect(kirbyMini(0, form as keyof typeof HATS).poses.stand[0]!.px.flat().includes(ink)).toBe(true)
  expect(kirbyMini(0, 'sonnet').poses.stand[0]!.px[0]!.length).toBe(16)
  // Each edits with its own move: Fire Kirby his breath, Beam Kirby his whip, plain Kirby a pencil, and Sword Kirby alone the sword. Each still an edit's picture, not a read's.
  expect([kirbyMini(0).attack, kirbyMini(0, 'sonnet').attack, kirbyMini(0, 'haiku').attack, kirbyMini(0, 'fable').attack]).toEqual(['pencil', undefined, 'beam', 'fire'])
  const act = (model: string, tool: string) => [0, 270, 540, 810].map(ms => stageFrame(kirbyMini, [{ slot: 0, model, calls: [{ tool }] }], NOW + ms, 99, 70).data.join(',')).join('|')
  for (const model of Object.values(models)) expect(new Set(['Read', 'Edit', 'Bash', 'WebFetch'].map(tool => act(model, tool))).size).toBe(4)
  expect(new Set(Object.values(models).map(model => act(model, 'Edit'))).size).toBe(4)

  // The sword's cap keeps its bobble on every frame of every pose, from the front, the side and behind (never popping off
  // for a turn of the dance or the wind-up of a slash): more yellow than the band alone, which is the cap seen edge on.
  // The sword is steel, inked as the rest: no frame keeps the game's brown one.
  const yellow = (one: { px: readonly (readonly (number | null)[])[] }) => one.px.flat().filter(color => color === 0xf8d838).length
  const sword = kirbyMini(0, 'sonnet').poses
  for (const pose of Object.keys(sword) as HiPose[]) {
    if (pose !== 'turn') sword[pose].forEach((one, i) => expect([pose, i, yellow(one) >= 12]).toEqual([pose, i, true]))
  }
  // Only Sword Kirby has a blade: plain Kirby's edit shows none of its steel, on any frame, and Sword Kirby's does. His sword is a
  // sword: a blade, a gold guard across it, a hilt.
  const STEEL_INKS = [0xe8f8ff, 0x58c8f0]
  const edits = (model: string) => new Set(Array.from({ length: 30 }, (_f, i) => [...coloursOf(stageFrame(kirbyMini, [{ slot: 0, model, calls: [{ tool: 'Edit' }] }], NOW + i * 90, 99, 70))]).flat())
  expect([STEEL_INKS.some(ink => edits(models.opus).has(ink)), STEEL_INKS.every(ink => edits(models.sonnet).has(ink))]).toEqual([false, true])
  const held = sword.slash[7]!.px
  const guard = held.findIndex(row => row.filter(color => color === 0xf8d838 || color === 0xc08818).length >= 5)
  expect([guard > held.findIndex(row => row.includes(0xe8f8ff)), guard < held.length - 16]).toEqual([true, true])
  // Clawd is his small self doubled, and so is his sword: one drawing, in one size of pixel. No pixel of the blade stands alone.
  for (const form of FORMS) {
    for (const one of clawdMini(0, form).poses.slash) {
      for (let y = 1; y + 1 < one.px.length; y += 2) {
        for (let x = 1; x + 1 < one.px[0]!.length; x += 2) {
          const block = [one.px[y]![x], one.px[y]![x + 1], one.px[y + 1]![x], one.px[y + 1]![x + 1]]
          if (block.some(color => typeof color === 'number' && STEEL_INKS.includes(color))) expect(new Set(block).size).toBe(1)
        }
      }
    }
  }
  for (const mini of [kirbyMini, clawdMini]) for (const one of mini(0, 'sonnet').poses.slash) expect(one.px.flat().includes(INKS[4])).toBe(false)
  // From behind a hat shows its back: the fire's crown without its green stone.
  const fire = kirbyMini(0, 'fable')
  expect([fire.poses.stand[0]!.px.flat().includes(0x00b838), fire.poses.back[0]!.px.flat().includes(0x00b838)]).toEqual([true, false])
  // A fire is alive: a second drawing of every frame, the same size and stood at the same place, its flames elsewhere. No other hat flickers.
  expect([kirbyMini(0).flicker, kirbyMini(0, 'sonnet').flicker, kirbyMini(0, 'haiku').flicker]).toEqual([undefined, undefined, undefined])
  for (const pose of Object.keys(fire.poses) as HiPose[]) {
    fire.poses[pose].forEach((one, i) => {
      const other = fire.flicker![pose][i]!
      expect([other.ax, other.ay, other.px.length, other.px[0]!.length]).toEqual([one.ax, one.ay, one.px.length, one.px[0]!.length])
      expect(JSON.stringify(other.px)).not.toBe(JSON.stringify(one.px))
    })
  }
  // Out for the count, Clawd lies on his belly, his hat still on his head: over him, not under.
  const out = clawdMini(0, 'fable').poses.flat[0]!.px
  expect(out.findIndex(row => row.includes(0x7b4bd6))).toBeLessThan(out.findIndex(row => row.includes(SWAPS[0]![0])))

  // On a light theme the stage is by day, on both stages: no night cloud, no dim star; and an agent's dot is its mini's shade.
  const NIGHT = [0x4c5174, 0x363a56, 0xb9a55a]
  const skies = (isLight: boolean) => new Set(Array.from({ length: 40 }, (_f, i) => [
    ...coloursOf(stageFrame(kirbyMini, [{ slot: 0, calls: [] }], NOW + i * 700, 99, 70, isLight)),
    ...sceneOf('kirby', [{ slot: 0, calls: [] }], i * 2, NOW + i * 800, 33, isLight).flat(),
  ]).flat())
  expect([NIGHT.some(color => skies(true).has(color)), NIGHT.every(color => skies(false).has(color)), skies(true).has(0xe58ab8)]).toEqual([false, true, true])
  expect([colorOf(0), colorOf(0, true)]).toEqual(['#ffe066', '#e8a020'])

  // On the stage, in true pixels and in cell blocks: the agent's model picks the hat; no model told, or one of no known family, none.
  const on99 = (model?: string) => coloursOf(stageFrame(kirbyMini, [{ slot: 0, calls: [], ...(model === undefined ? {} : { model }) }], NOW, 99, 70))
  const on33 = (family: Family, model?: string) => new Set(sceneOf(family, [{ slot: 0, calls: [], ...(model === undefined ? {} : { model }) }], 0, NOW, 33).flat())
  for (const [form, ink] of Object.entries(HATS)) {
    expect(on99(models[form as keyof typeof HATS]).has(ink)).toBe(true)
    expect([...on33('kirby', models[form as keyof typeof HATS])].some(color => color !== null && HAT_INKS.includes(color))).toBe(true)
    expect([...on33('clawd', models[form as keyof typeof HATS])].some(color => color !== null && HAT_INKS.includes(color))).toBe(true)
  }
  for (const model of [undefined, models.opus, 'gpt-something']) {
    expect(Object.values(HATS).some(ink => on99(model).has(ink))).toBe(false)
    expect([...on33('kirby', model), ...on33('clawd', model)].some(color => color !== null && HAT_INKS.includes(color))).toBe(false)
  }
  // A waiting mini wears it too, whole, in the sky.
  const crowd: Agent[] = [0, 1, 2, 3, 4].map(slot => ({ slot, calls: [], model: slot === 4 ? models.fable : models.opus }))
  const sky = stageFrame(kirbyMini, crowd, NOW, 99, 70).data.slice(0, (70 - GROUND_PX - REACH_PX) * 99)
  expect(sky.includes(HATS.fable)).toBe(true)

  // In the pane: a spawn tells the model, and that agent's mini wears its hat; an agent known only by its calls is plain.
  const clock = mock.clock(on, { now: NOW })
  store(on)
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  on('tool.call', () => ({ result: 'ok' }))
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  await $.tool.call(inAgent('a2', { tool: 'Read', file_path: '/tmp/a2' }))
  const before = colours((await ui.find({ key: 'stage' }))?.props.cells)
  expect(HAT_INKS.some(ink => before.has(ink))).toBe(false)
  await $.agent.spawn({ ...SPAWN, description: 'scout the repo' })
  await clock.advance(4400) // it has dropped in
  const after = colours((await ui.find({ key: 'stage' }))?.props.cells)
  expect([0xf8a030, 0xe82838].every(ink => after.has(ink))).toBe(true)
  await ui.unmount()

  // The ghostrunner blocks tag the model at the right end of the agent's line; no model told, no tag.
  expect(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-fable-5', 'sonnet', '', undefined, 'gpt-something'].map(modelTag)).toEqual(['OPS', 'SNT', 'HKU', 'FBL', 'SNT', '', '', ''])
  const runner = (model?: string, tool?: string): Runner => ({ slot: 0, label: 'scout the repository again', calls: tool === undefined ? [] : [{ tool, summary: 'src/main.ts' }], ...(model === undefined ? {} : { model }) })
  const two = textOf(agentRows(SKINS.red, [runner('claude-sonnet-5-5', 'Read')], NOW, 33, 2))
  expect([two[0]!.endsWith(' SNT'), two[0]!.length, two[0]!.includes('[SCAN] scout the rep')]).toEqual([true, 33, true])
  expect(textOf(agentRows(SKINS.red, [runner(undefined, 'Read')], NOW, 33, 2))[0]!.trimEnd().endsWith('scout the repositor…')).toBe(true)
  // On one row a block the tool has that end; with none running, the tag.
  const one = textOf(agentRows(SKINS.red, [runner('claude-fable-5', 'Read'), runner('claude-fable-5'), runner()], NOW, 33, 3))
  expect([one[0]!.endsWith(' Read'), one[1]!.endsWith(' FBL'), /FBL|OPS/.test(one[2]!)]).toEqual([true, true, false])
})

// --- nothing is cut off at the sky ------------------------------------------------

test('on the true-pixel stage no hat is ever cut: on a ride at the top of its bob, under what floats over a head, waiting in the sky', () => {
  const models = { sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-4-5', fable: 'claude-fable-5' } as const
  const H = STAGE_PX
  const sky = H - GROUND_PX - REACH_PX
  const count = (colours: Iterable<number | null>, inks: Set<number>) => [...colours].filter(color => color !== null && inks.has(color)).length
  const HEART = 0xff6fa8
  const wrong: string[] = []
  for (const [family, mini] of [['kirby', kirbyMini], ['clawd', clawdMini]] as const) {
    const plain = new Set(mini(0).poses.stand[0]!.px.flat())
    for (const form of ['sonnet', 'haiku', 'fable'] as const) {
      const set = mini(0, form)
      const inks = new Set([set.poses, ...(set.flicker === undefined ? [] : [set.flicker])].flatMap(poses => poses.stand[0]!.px.flat()).filter((color): color is number => color !== null && !plain.has(color)))
      /** The fewest hat pixels any of these frames has, drawn whole: a frame of the stage with fewer has cut one. */
      const least = (frames: readonly (readonly [HiPose, number])[]) =>
        Math.min(...[set.poses, ...(set.flicker === undefined ? [] : [set.flicker])].flatMap(poses => frames.map(([pose, i]) => count(poses[pose][i]!.px.flat(), inks))))
      const acts = [['WebFetch', least([['ride', 0], ['stand', 0]])], ['Agent', least([['cheer', 0], ['cheer', 2]])], ['AskUserQuestion', least([['stand', 0], ['blink', 0]])]] as const
      for (const width of [99, 60, NARROWEST_PX + 4]) {
        for (const [tool, whole] of acts) {
          for (let ms = 0; ms < 5200; ms += 90) {
            const frame = stageFrame(mini, [{ slot: 0, model: models[form], calls: [{ tool }] }], NOW + ms, width, H)
            const where = `${family} ${form}, ${tool}, ${width} px, +${ms} ms`
            if (count(frame.data, inks) < whole) wrong.push(`${where}: its hat is cut`)
            // What floats over its head is whole too: all of the heart, all of the "?".
            if (tool === 'Agent' && count(frame.data, new Set([HEART])) !== count(HI.heart.px.flat(), new Set([HEART]))) wrong.push(`${where}: the heart is cut`)
            if (tool === 'AskUserQuestion' && count(frame.data, new Set([0xffffff])) !== count(HI.ask.px.flat(), new Set([0xffffff]))) wrong.push(`${where}: the "?" is cut`)
          }
        }
      }
      // Waiting in the sky it is whole, on the shortest stage there is: nothing of it above the picture, nothing under the sky.
      const crowd: Agent[] = [0, 1, 2, 3, 4].map(slot => ({ slot, calls: [], model: slot === 4 ? models[form] : 'claude-opus-5-5' }))
      const waiting = stageFrame(mini, crowd, NOW, 99, H)
      if (count(waiting.data.slice(0, sky * 99), inks) < least([['stand', 0]])) wrong.push(`${family} ${form}: cut in the queue`)
      if (set.tall > sky - 2) wrong.push(`${family} ${form}: taller than the sky it waits in`)
    }
  }
  expect(wrong).toEqual([])
  // The "?" has a line round it: white alone would be lost on a light theme's sky.
  expect(HI.ask.px.flat().includes(INKS[0])).toBe(true)
})

test('by day the effects are drawn dark enough for a pale ground: no wind, sparkle or beam in the colours made for the dark', () => {
  const PALE = [STREAK, GOLD, CYAN]
  const tools = [undefined, 'Read', 'Edit', 'Bash', 'WebFetch', 'Agent', 'Skill', 'AskUserQuestion', 'mcp__db__query']
  const models = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-fable-5']
  const seen = { day: new Set<number | null>(), night: new Set<number | null>() }
  for (const tool of tools) {
    for (const model of models) {
      const stories: Agent[] = [
        { slot: 1, model, calls: tool === undefined ? [] : [{ tool }] },
        // (Not a failed call's knock: that burst has a dark line round it, as the "?" has, and reads on any ground.)
        { slot: 1, model, calls: [], doneAt: NOW }, { slot: 1, model, calls: [], doneAt: NOW, isLost: true },
      ]
      for (const agent of tool === undefined ? stories : stories.slice(0, 1)) {
        for (let ms = 0; ms < 5400; ms += 270) {
          for (const [name, isLight] of [['day', true], ['night', false]] as const) {
            const frame = stageFrame(kirbyMini, [agent], NOW + ms, 99, 70, isLight)
            for (const color of frame.data.slice((70 - GROUND_PX - REACH_PX) * 99, (70 - GROUND_PX) * 99)) seen[name].add(color)
            for (const color of sceneOf('kirby', [agent], Math.floor(ms / TICK_MS), NOW + ms, 33, isLight).slice(SKY, STAGE_ROWS * 2 - 2).flat()) seen[name].add(color)
          }
        }
      }
    }
  }
  expect([PALE.filter(color => seen.day.has(color)), PALE.every(color => seen.night.has(color))]).toEqual([[], true])
  // In cell blocks the jester's white balls and a waiting head are told from a pale sky too.
  expect([miniOf('kirby', 0, 'haiku', true).stand.flat().includes(0xf8f8f8), miniOf('kirby', 0, 'haiku').stand.flat().includes(0xf8f8f8)]).toEqual([false, true])
})

test('a write to the terminal that fails is not taken for done: it is tried again, a few times, and the end still gives the background back', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on)
  mock.env(on, KITTY_ENV)
  const writes: string[] = []
  let failing = 0
  on('process.run', (_$, e) => {
    const script = e.argv[3] ?? ''
    const answer = (exitCode: number, stdout = '') => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (script.includes('getppid')) return answer(0, '/dev/pts/7 1 1000 1000\n')
    if (!script.includes(']11;')) return answer(0)
    writes.push(e.argv[5] ?? '')
    if (failing === 0) return answer(0)
    failing -= 1

    return answer(1)
  })
  on('session.usage', () => ({ value: USAGE }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(writes).toEqual(['#1b2414'])
  // The person goes back to a built-in theme and the restore is lost (a pty's buffer full, a child timed out): the
  // terminal is still green. The next tick writes it again, and once it has landed, no more.
  sessionTheme = 'dark'
  failing = 1
  await clock.advance(4400)
  expect(writes).toEqual(['#1b2414', ''])
  await clock.advance(4400)
  expect(writes).toEqual(['#1b2414', '', ''])
  await clock.advance(20_000)
  expect(writes.length).toBe(3)

  // A terminal that keeps refusing is left alone after three tries in a row, not written to every four seconds for good...
  sessionTheme = 'custom:kirby'
  failing = Infinity
  await clock.advance(40_000)
  expect(writes.slice(3)).toEqual(['#1b2414', '#1b2414', '#1b2414'])
  // ...but the person's own word tries again, and so does the session's end: a colour was tried, so its own background is asked back.
  failing = 0
  await $.command.run(typed('background on'))
  expect(writes.slice(6)).toEqual(['#1b2414'])
  failing = 1
  sessionTheme = 'dark'
  await clock.advance(4400)
  expect(writes.slice(7)).toEqual([''])
  await $.session.end(END)
  expect(writes.slice(8)).toEqual([''])
})

// --- the ghostrunner characters --------------------------------------------------

const WHOS: Who[] = ['ninja', 'thief']
// A clock at the start of a cycle of five flourishes.
const T0 = Math.ceil(NOW / (5 * CYCLE_MS)) * 5 * CYCLE_MS
/** Every animation of a character, as moments a frame apart: the stance, the five flourishes, then the three other moods. */
const ANIMS: readonly (readonly [name: string, at: (k: number) => Moment])[] = [
  ['idle', k => ({ mood: 'idle', now: T0 + k * 90 })],
  ...[0, 1, 2, 3, 4].map(n => [`flourish ${n}`, (k: number): Moment => ({ mood: 'idle', now: T0 + n * CYCLE_MS + CALM_MS + k * 90 })] as const),
  ...(['working', 'happy', 'worried'] as const).map(mood => [mood, (k: number): Moment => ({ mood, now: T0 + k * 90, since: T0, clock: k * 90 })] as const),
]

/** A colour as hue (degrees), saturation and value. */
function hsv(color: number): [number, number, number] {
  const [r, g, b] = [(color >> 16) & 255, (color >> 8) & 255, color & 255].map(c => c / 255) as [number, number, number]
  const [hi, lo] = [Math.max(r, g, b), Math.min(r, g, b)]
  const d = hi - lo
  const hue = d === 0 ? 0 : hi === r ? ((g - b) / d + 6) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4

  return [hue * 60, hi === 0 ? 0 : d / hi, hi]
}

/** What a colour is, on the ghostrunner skins: near-black, a grey or a white, or a hue's name. */
function hueOf(color: number): 'dark' | 'plain' | 'red' | 'blue' | 'yellow' | 'other' {
  const [hue, saturation, value] = hsv(color)
  // (Dark: near-black, and the dim tones a dark red passes through on its way to the light blue.)
  if (value < 0.35) return 'dark'
  if (saturation < 0.2) return 'plain'

  return hue <= 22 || hue >= 338 ? 'red' : hue >= 165 && hue <= 215 ? 'blue' : hue >= 42 && hue <= 66 ? 'yellow' : 'other'
}

const gridColours = (grid: Grid) => [...grid.words].filter((word, i) => i % 3 !== 0 && word !== NONE)

test('without footage the cyber Opus is a drawn character of its own, Jack on Ghostrunner and Lucy on Cyberpunk Edgerunners; the other models keep Raijin', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on, {}, 'custom:ghostrunner', 'claude-opus-5-5')
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  on('ui.blit', () => ({ value: {} }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const seen: string[] = []
  for (const [theme, model, named, rows] of [
    ['custom:ghostrunner', 'claude-opus-5-5', 'JACK // OPUS-5-5', HERO_ROWS], ['custom:cyberpunk-edgerunners', 'claude-opus-5-5', 'LUCY // OPUS-5-5', HERO_ROWS],
    ['custom:ghostrunner', 'claude-sonnet-5-5', 'RAIJIN TACHI // SONNET-5-5', MASK_ROWS], ['custom:cyberpunk-edgerunners', 'claude-haiku-4-5', 'RAIJIN PING // HAIKU-4-5', MASK_ROWS],
    ['custom:ghostrunner', 'claude-fable-5', 'RAIJIN ORACLE // FABLE-5', MASK_ROWS],
  ] as const) {
    sessionTheme = theme
    sessionModel = model
    await clock.advance(4400) // the slow tick re-reads the theme and the model
    const ui = await $.ui.mount(TALL)
    const lines = flow(under(await ui.drawn()))
    const at = lines.indexOf('<Raster kirby>')
    // The banner's three rows are right over it, its name right under it.
    expect(lines.slice(at - 3, at).map(line => line.slice(0, 3))).toEqual(['┌─┐', '│:│', '└─┘'])
    expect(lines[at + 1]).toContain(named)
    const raster = await ui.find({ key: 'kirby' })
    expect([raster?.props.columns, raster?.props.rows]).toEqual([33, rows])
    seen.push(String(raster?.props.cells))
    // Each speaks in its own voice.
    expect(lines.join('\n')).toContain(named.startsWith('JACK') ? 'BLADE SHEATHED. WATCHING.' : named.startsWith('LUCY') ? 'CASING THE JOINT. QUIET.' : 'ICE HOLDING. STANDING BY.')
    await ui.unmount()
  }
  expect(new Set(seen).size).toBe(5)
  // A pane too short for a character draws the mask, under the mask's name.
  sessionTheme = 'custom:ghostrunner'
  sessionModel = 'claude-opus-5-5'
  await clock.advance(4400)
  // (28 rows for the avatar, and the Loadouts line above them.)
  const short = await $.ui.mount({ ...KIRBY_PANE, props: { ...KIRBY_PANE.props, bodyColumns: 34, scroll: { offset: 0, bodyRows: 29 } } })
  expect((await short.find({ key: 'kirby' }))?.props.rows).toBe(11)
  expect(flow(await short.drawn()).join('\n')).toContain('RAIJIN // OPUS-5-5')
  await short.unmount()
})

test('/kirby style picks pixel art or text characters, auto by what the terminal draws; the choice is kept', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const kept = store(on, {}, 'custom:ghostrunner', 'claude-opus-5-5')
  kitty(on)
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  on('command.run', () => ({ text: '' }))
  const blits: { width: number; height: number; cells: number }[] = []
  on('ui.blit', (_$, e) => {
    blits.push('source' in e && 'rgba' in e.source ? { width: e.source.width, height: e.source.height, cells: 0 } : { width: 0, height: 0, cells: 'cells' in e ? atob(e.cells).length : 0 })

    return { value: {} }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  const kind = async () => flow(under(await ui.drawn())).filter(line => line.startsWith('<'))
  const column = async () => flow(under(await ui.drawn())).filter(line => !line.startsWith('<') && !/RESETS|T\+/.test(line))

  // Auto, on a terminal that draws pictures: an Image, 33 columns by 14 rows of 9 by 21, 99 by 98 art pixels, clear around her.
  expect(await kind()).toEqual(['<Image kirby>'])
  const picture = (await ui.find({ key: 'kirby' }))?.props
  expect([picture?.columns, picture?.rows]).toEqual([33, 14])
  expect(picture?.source).toMatchObject({ width: 99, height: 98 })
  expect(rgbaOf(picture?.source).charCodeAt(3)).toBe(0)
  const lines = await column()
  const at = flow(under(await ui.drawn())).indexOf('<Image kirby>')
  expect(flow(under(await ui.drawn())).slice(at - 3, at).map(line => line.slice(0, 3))).toEqual(['┌─┐', '│:│', '└─┘'])
  expect(widest(await ui.drawn())).toBe(33)

  // A cycle and more of frames, a flourish among them: every picture the mounted size, and nothing else in the pane has moved.
  await clock.advance(CYCLE_MS + 500)
  expect(blits.length).toBeGreaterThan(40)
  for (const b of blits) expect([b.width, b.height]).toEqual([99, 98])
  expect(await column()).toEqual(lines)
  expect(flow(under(await ui.drawn())).indexOf('<Image kirby>')).toBe(at)

  // Text: a Raster of 33 by 18 cells, redrawn at once, every frame that size; kept in the store.
  expect((await $.command.run(typed('style text'))).text).toContain('text characters')
  expect(kept.get('style')).toBe('text')
  expect(await kind()).toEqual(['<Raster kirby>'])
  const raster = (await ui.find({ key: 'kirby' }))?.props
  expect([raster?.columns, raster?.rows, atob(String(raster?.cells)).length]).toEqual([33, HERO_ROWS, 33 * HERO_ROWS * 12])
  expect((await column()).slice(-12)).toEqual(lines.slice(-12))
  blits.length = 0
  await clock.advance(CYCLE_MS + 500)
  expect(blits.length).toBeGreaterThan(40)
  for (const b of blits) expect(b.cells).toBe(33 * HERO_ROWS * 12)

  // Pixel, and auto again: pictures here.
  await $.command.run(typed('style pixel'))
  expect([kept.get('style'), await kind()]).toEqual(['pixel', ['<Image kirby>']])
  await $.command.run(typed('style auto'))
  expect([kept.get('style'), await kind()]).toEqual(['auto', ['<Image kirby>']])
  expect((await $.command.run(typed('style neon'))).text).toContain('Usage: /avatar style pixel|text|auto (now auto)')
  await ui.unmount()

})

test('where the terminal draws no pictures a character asked for in pixel art is text characters; a style kept in the store is the one drawn', async ($, on) => {
  mock.clock(on, { now: NOW })
  store(on, { style: 'pixel' }, 'custom:cyberpunk-edgerunners', 'claude-opus-5-5')
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  on('ui.blit', () => ({ value: {} }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const plain = await $.ui.mount(TALL)
  expect(flow(await plain.drawn()).filter(line => line.startsWith('<'))).toEqual(['<Raster kirby>'])
  expect(flow(await plain.drawn()).join('\n')).toContain('LUCY // OPUS-5-5')
  await plain.unmount()
})

test('a style of text kept in the store is drawn in text even where the terminal draws pictures', async ($, on) => {
  mock.clock(on, { now: NOW })
  store(on, { style: 'text' }, 'custom:ghostrunner', 'claude-opus-5-5')
  kitty(on)
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  on('ui.blit', () => ({ value: {} }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  expect(flow(under(await ui.drawn())).filter(line => line.startsWith('<'))).toEqual(['<Raster kirby>'])
  expect((await ui.find({ key: 'kirby' }))?.props.rows).toBe(HERO_ROWS)
  await ui.unmount()
})

test('a character is one size in each style through every frame of every animation, and each mood is its own', () => {
  for (const who of WHOS) {
    const stills = new Set<string>()
    for (const [name, at] of ANIMS) {
      const prints = new Set<string>()
      for (let k = 0; k < 48; k++) {
        const [canvas, grid] = [heroCanvas(who, at(k), 99, 98), heroGrid(who, at(k), 33, HERO_ROWS)]
        expect([canvas.width, canvas.height, canvas.data.length]).toEqual([99, 98, 99 * 98])
        expect([grid.columns, grid.rows, grid.words.length]).toEqual([33, HERO_ROWS, 33 * HERO_ROWS * 3])
        // Every glyph is one a cell can hold, every colour a colour or the terminal's own.
        expect(grid.words.every((word, i) => (i % 3 === 0 ? word >= 0x20 && word <= 0xffff : word <= 0xffffff || word === NONE))).toBe(true)
        prints.add(canvas.data.join(','))
        if (k === 10) stills.add(`${canvas.data.join(',')}|${grid.words.join(',')}`)
        // Nothing she does is cut by the frame: a blade's tip, an arc, a foot in a flip keep clear of its sides and its top.
        // (But what leaves it on purpose: Jack's stars fly out of its left, Lucy's line is hooked above its top.)
        const lit = [...canvas.data].flatMap((color, i) => (color === CLEAR ? [] : [i]))
        const [left, right, top] = [Math.min(...lit.map(i => i % 99)), 98 - Math.max(...lit.map(i => i % 99)), Math.floor(lit[0]! / 99)]
        if (!(who === 'ninja' && name === 'flourish 3')) expect(left).toBeGreaterThan(3)
        expect(right).toBeGreaterThan(3)
        if (!(who === 'thief' && name === 'flourish 3')) expect(top).toBeGreaterThan(1)
      }
      // It moves: an animation is many drawings (the stance only breathes, and looks round).
      expect(prints.size).toBeGreaterThan(name === 'idle' ? 6 : 20)
    }
    expect(stills.size).toBe(ANIMS.length)
    // A mood picks its animation: at work the blade is out (or the keyboard is), worried the alarm is on, glad she leaves the ground.
    const pose = (mood: Mood, ms: number) => heroPose(who, { mood, now: T0 + ms, since: T0, clock: ms })
    expect([pose('idle', 900).P, pose('idle', 900).alarm, pose('worried', 900).alarm]).toEqual([0, 0, 1])
    expect(who === 'ninja' ? pose('working', 900).P : pose('working', 900).holo).toBe(1)
    expect([pose('happy', 900).air, pose('happy', 900).y > 30, Math.abs(pose('happy', 900).spin) > 90]).toEqual([1, true, true])
    // A frame is a function of its moment.
    expect(heroGrid(who, { mood: 'working', now: T0 + 777, clock: 777 }, 33, HERO_ROWS).words.join(',')).toBe(heroGrid(who, { mood: 'working', now: T0 + 777, clock: 777 }, 33, HERO_ROWS).words.join(','))
  }
})

test('the flourishes come on the clock alone, one each cycle, in order; loops close and a change of mood is eased', () => {
  // A cycle is a hundred frames: sixty of the stance, then a flourish, the next of the five each time.
  expect([CYCLE_MS / 90, CALM_MS / 90]).toEqual([100, 60])
  for (let frame = 0; frame < 1000; frame++) expect(flourishOf(T0 + frame * 90)).toBe(frame % 100 < 60 ? -1 : Math.floor(frame / 100) % 5)
  expect(FLOURISH_NAMES.ninja.length + FLOURISH_NAMES.thief.length).toBe(10)
  // A frame is a function of the clock: the same moment is the same drawing, and when the cycles have come round the pose is the same again.
  expect(heroCanvas('ninja', { mood: 'idle', now: T0 + 6500 }, 99, 98).data.join(',')).toBe(heroCanvas('ninja', { mood: 'idle', now: T0 + 6500 }, 99, 98).data.join(','))
  const rounded = (who: Who, now: number) => Object.values(heroPose(who, { mood: 'idle', now })).map(value => value.toFixed(3)).join(',')
  // (Fifteen: the five flourishes come round in five, her breathing, which has its own length, with them in fifteen.)
  for (const who of WHOS) expect(rounded(who, T0 + 6500)).toBe(rounded(who, T0 + 6500 + 15 * CYCLE_MS))
  expect(rounded('ninja', T0 + 6500)).not.toBe(rounded('ninja', T0 + 6500 + CYCLE_MS))
  // At rest only while nothing moves faster than breathing, nor is about to: not while a head turns or fingers tap, not in the frames before a flourish, not in one, not at work.
  expect([800, 1700, 2500, 5100, 6000].map(ms => isAtRest('ninja', { mood: 'idle', now: T0 + ms }))).toEqual([true, false, true, false, false])
  expect([800, 1900, 2600].map(ms => isAtRest('thief', { mood: 'idle', now: T0 + ms }))).toEqual([true, false, false])
  expect(isAtRest('ninja', { mood: 'working', now: T0 + 800 })).toBe(false)

  // How far a pose is from another: its joints' channels, an angle the short way round.
  const CHANNELS = ['x', 'y', 'lean', 'head', 'fx', 'fy', 'bx', 'by', 'as', 'ae', 'bs', 'be'] as const
  const round = (a: number) => Math.abs(((a % 360) + 540) % 360 - 180)
  const apart = (who: Who, a: Moment, b: Moment) => {
    const [p, q] = [heroPose(who, a), heroPose(who, b)]

    return Math.max(...CHANNELS.map(name => Math.abs(p[name] - q[name])), round(p.spin - q.spin), p.P !== 0 && q.P !== 0 ? round(p.p - q.p) : 0)
  }
  for (const who of WHOS) {
    // Idle, through all five cycles and round to the first; the kata and the guard, round their own loops.
    const loops: readonly (readonly [frames: number, at: (k: number) => Moment])[] = [
      [500, k => ({ mood: 'idle', now: T0 + k * 90 })],
      [48, k => ({ mood: 'working', now: T0 + k * 90, clock: k * 90 })],
      [40, k => ({ mood: 'worried', now: T0 + k * 90, since: T0 })],
    ]
    for (const [frames, at] of loops) {
      const steps = Array.from({ length: frames }, (_f, k) => apart(who, at(k), at(k + 1)))
      // The step that closes the loop, and each that joins the stance to a flourish, is no larger than the motion elsewhere.
      const joins = [frames - 1, ...(frames === 500 ? [59, 99, 159, 199] : [])]
      for (const k of joins) expect(steps[k]!).toBeLessThan(Math.max(...steps.filter((_s, i) => !joins.includes(i))) + 0.001)
      // And small in itself where a flourish gives way to the stance: a frame's worth of breathing and no more.
      if (frames === 500) for (const k of [99, 199, 299, 399, 499]) expect(steps[k]!).toBeLessThan(1.6)
    }
    // Every flourish ends in the stance it began in, to the last channel: nothing snaps when the cycle comes round. (Where a hand's
    // thing points, and where a thing in the air is, are not seen while there is none.)
    for (let n = 0; n < 5; n++) {
      const [end, next] = [heroPose(who, { mood: 'idle', now: T0 + (n + 1) * CYCLE_MS - 1 }), heroPose(who, { mood: 'idle', now: T0 + (n + 1) * CYCLE_MS })]
      const names = (Object.keys(end) as (keyof typeof end)[]).filter(name => !['p', 'q', 'ox', 'oy', 'oa'].includes(name))
      expect(names.filter(name => Math.abs(end[name] - next[name]) > 0.02)).toEqual([])
      expect([end.P, end.Q, end.O, end.fade, end.spin, end.air]).toEqual([0, 0, 0, 0, 0, 0])
    }
    // A flip is a turn through the air: up and down one arc, turning an eighth or so of the way round each frame, never there in one.
    for (const at of [(ms: number): Moment => ({ mood: 'idle', now: T0 + CALM_MS + ms }), (ms: number): Moment => ({ mood: 'happy', now: T0 + ms, since: T0 })]) {
      const flown = Array.from({ length: 45 }, (_f, k) => heroPose(who, at(k * 90))).filter(pose => pose.air > 0 || pose.spin !== 0)
      expect(flown.length).toBeGreaterThan(6)
      const turns = flown.slice(1).map((pose, i) => Math.abs(pose.spin - flown[i]!.spin))
      expect(Math.max(...turns)).toBeLessThan(55)
      const peak = flown.findIndex(pose => pose.y === Math.max(...flown.map(one => one.y)))
      expect(flown.every((pose, i) => i === 0 || (i <= peak ? pose.y >= flown[i - 1]!.y : pose.y <= flown[i - 1]!.y))).toBe(true)
      expect(peak).toBeGreaterThan(2)
    }
    // A mood that changes mid-move: the pose goes over in BLEND_MS, no step of it larger than the moves' own.
    const since = T0 + 6300
    const turnOf = (k: number): Moment => ({ mood: 'worried', now: since + k * 90, since, was: { mood: 'idle', since: 0 } })
    expect(apart(who, { mood: 'idle', now: since }, turnOf(0))).toBe(0)
    expect(apart(who, turnOf(1), { mood: 'worried', now: since + 90, since })).toBeGreaterThan(1)
    expect(apart(who, turnOf(4), { mood: 'worried', now: since + 360, since })).toBe(0)
    expect(BLEND_MS).toBeLessThan(360)
  }
})

test('the red skin is red, dark red and light blue and nothing else: the HUD, the masks, the agents and Jack; Lucy is yellow, white and light blue', () => {
  // The skin's own colours: no yellow, green, magenta or orange among them.
  const { variant: _variant, ...reds } = SKINS.red
  expect(new Set(Object.values(reds).map(hueOf))).toEqual(new Set(['red', 'blue', 'dark']))
  expect([hueOf(SKINS.red.alert), hueOf(SKINS.red.value), hueOf(SKINS.red.cyan)]).toEqual(['red', 'red', 'blue'])
  // The theme file follows the same rule, and the skin's light blue is its own.
  expect(hex(SKINS.red.cyan)).toBe('#5ef6ff')
  const off = (colours: Iterable<number>, allowed: readonly string[]) => [...new Set(colours)].filter(color => !allowed.includes(hueOf(color))).map(hex)
  const RED = ['red', 'blue', 'dark', 'plain']
  // Every mask, in every mood, and the agents' blocks in every state.
  for (const form of FORMS) for (const mood of MOODS) for (let k = 0; k < 48; k += 3) expect(off(gridColours(maskFrame(SKINS.red, form, mood, NOW + k * 90, 33, 16)), RED)).toEqual([])
  const runner = (more: Partial<Runner>): Runner => ({ slot: 0, label: 'scout', calls: [{ tool: 'Bash', summary: 'ls' }], ...more })
  const crew = [runner({}), runner({ slot: 1, hurtAt: NOW }), runner({ slot: 2, doneAt: NOW, calls: [] }), runner({ slot: 3, doneAt: NOW, isLost: true, calls: [] }), runner({ slot: 4, calls: [], model: 'claude-opus-5-5' })]
  for (let k = 0; k < 24; k++) expect(off(gridColours(agentRows(SKINS.red, crew, NOW + k * 90, 33, 10)), RED)).toEqual([])
  // Jack, in both styles, through every animation; what is plain in her is a pale red or the blade's white, never a grey.
  for (const [, at] of ANIMS) {
    for (let k = 0; k < 48; k += 2) {
      expect(off(coloursOf(heroCanvas('ninja', at(k), 99, 98)), RED)).toEqual([])
      expect(off(gridColours(heroGrid('ninja', at(k), 33, HERO_ROWS)), RED)).toEqual([])
      // Lucy: the HUD's yellow and its dark, white hair, the light blue, and red only under an alarm.
      const hers = new Set([...coloursOf(heroCanvas('thief', at(k), 99, 98)), ...gridColours(heroGrid('thief', at(k), 33, HERO_ROWS))])
      expect(off(hers, ['yellow', 'blue', 'dark', 'plain', ...(at(k).mood === 'worried' ? ['red'] : [])])).toEqual([])
    }
  }
  // She has the light blue in her (a visor), the pale highlight, and the alert's red when worried.
  const still = coloursOf(heroCanvas('ninja', { mood: 'idle', now: T0 + 900 }, 99, 98))
  expect([...still].some(color => hueOf(color) === 'blue')).toBe(true)
  const alarmed = new Set(Array.from({ length: 22 }, (_f, k) => [...coloursOf(heroCanvas('ninja', { mood: 'worried', now: T0 + k * 90, since: T0 }, 99, 98))]).flat())
  expect([alarmed.has(0xff1f47), alarmed.has(0x5ef6ff)]).toEqual([true, true])
  expect(coloursOf(heroCanvas('thief', { mood: 'idle', now: T0 + 900 }, 99, 98)).has(0xffffff)).toBe(true)
})

test('the red HUD names no colour but its reds, its dark and its light blue, alarmed and at work', async ($, on) => {
  mock.clock(on, { now: NOW })
  store(on, {}, 'custom:ghostrunner', 'claude-opus-5-5')
  on('session.usage', () => ({ value: { ...USAGE, context: { tokens: 150_000, window: 200_000, percent: 75 } } }))
  on('ui.blit', () => ({ value: {} }))
  on('tool.call', () => ({ result: 'ok' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call(inAgent('a1', { tool: 'Read', file_path: '/tmp/a1' }))
  const ui = await $.ui.mount(TALL)
  const named = coloursIn(await ui.drawn()).filter(color => color.startsWith('#')).map(color => parseInt(color.slice(1), 16))
  expect(named.length).toBeGreaterThan(20)
  expect([...new Set(named)].filter(color => !['red', 'blue', 'dark'].includes(hueOf(color))).map(hex)).toEqual([])
  await ui.press({ key: 'pet' })
  const glad = coloursIn(await ui.drawn()).filter(color => color.startsWith('#')).map(color => parseInt(color.slice(1), 16))
  expect([...new Set(glad)].filter(color => !['red', 'blue', 'dark'].includes(hueOf(color))).map(hex)).toEqual([])
  expect(flow(under(await ui.drawn())).join('\n')).toContain('ONE CUT. CLEAN.')
  await ui.unmount()
})

test('a move written out of time\'s order plays in it: Jack goes out once, a band of scan lines at a time, and her visor flares once', () => {
  // The vanish: all there, then less and less of her over three frames, then gone; never back in between.
  const dash = (ms: number): Moment => ({ mood: 'idle', now: T0 + 4 * CYCLE_MS + CALM_MS + ms })
  const fades = Array.from({ length: 28 }, (_f, k) => heroPose('ninja', dash(k * 30)).fade)
  expect(fades.every((fade, k) => k === 0 || fade >= fades[k - 1]!)).toBe(true)
  expect([fades[0], fades[12], fades[21]! >= 1]).toEqual([0, 0, true])
  const drawn = [4, 5, 6, 7].map(k => [...heroCanvas('ninja', dash(k * 90), 99, 98).data].filter(color => [0xc0303a, 0x2e0c12, 0x8a1f2a].includes(color)).length)
  expect(drawn[0]!).toBeGreaterThan(150)
  expect(drawn.every((count, k) => k === 0 || count < drawn[k - 1]!)).toBe(true)
  expect(drawn[3]).toBe(0)
  // The stop of the spun katana: the visor flares as it stops and is back to its own light well before the blade is home.
  const glow = (ms: number) => heroPose('ninja', { mood: 'idle', now: T0 + CYCLE_MS + CALM_MS + ms }).glow
  expect([glow(1600), glow(1800) > 0.8, glow(2150), glow(3000), glow(3590)]).toEqual([0, true, 0, 0, 0])
})

test('a cheer that comes while she is still glad starts her flip over', () => {
  let beat: Beat = { mood: 'idle', since: 0 }
  // A pet: glad, from when it struck.
  beat = beatAfter(beat, 'happy', T0 + 90, T0)
  expect(beat).toEqual({ mood: 'happy', since: T0, was: { mood: 'idle', since: 0 } })
  // Frames go by: the same beat.
  expect(beatAfter(beat, 'happy', T0 + 3400, T0)).toBe(beat)
  // A second pet, 3.5 seconds in: the move begins again from there, leaving the pose she was in.
  beat = beatAfter(beat, 'happy', T0 + 3590, T0 + 3500)
  expect(beat).toEqual({ mood: 'happy', since: T0 + 3500, was: { mood: 'happy', since: T0 } })
  for (const who of WHOS) {
    const pose = heroPose(who, { mood: 'happy', now: T0 + 3500 + 900, since: beat.since, ...(beat.was ? { was: beat.was } : {}) })
    expect([pose.air, pose.y > 30]).toEqual([1, true])
  }
  // The joy over: idle again, from now.
  expect(beatAfter(beat, 'idle', T0 + 7600)).toEqual({ mood: 'idle', since: T0 + 7600, was: { mood: 'happy', since: T0 + 3500 } })
})

test('a flourish is played whole or not at all: come to rest in the middle of one, she holds the stance till the next', () => {
  const HAPPY = 4000
  const round = (a: number) => Math.abs(((a % 360) + 540) % 360 - 180)
  // Known from the clock and from when she came to rest: one that began before she did is left out; the next is played from its first frame.
  expect([flourishAt(T0 + 6000), flourishAt(T0 + 6000, T0 + 5300), flourishAt(T0 + 6000, T0 + 5500), flourishAt(T0 + CYCLE_MS + 6000, T0 + 5500)]).toEqual([0, 0, -1, 1])
  for (const who of WHOS) {
    // The pane's own flow: a cheer for four seconds, then idle, a frame every 90 ms; the cheer ending at every point of the cycle.
    let [worstTurn, worstHeld, worstStep] = [0, 0, 0]
    for (let phase = 0; phase < CYCLE_MS; phase += 90) {
      const began = T0 + phase - HAPPY
      let beat: Beat = beatAfter({ mood: 'idle', since: 0 }, 'happy', began, began)
      let before = heroPose(who, { mood: 'happy', now: began + HAPPY - 90, since: beat.since })
      for (let k = 0; k < 12; k++) {
        const now = T0 + phase + k * 90
        beat = beatAfter(beat, 'idle', now)
        const pose = heroPose(who, { mood: 'idle', now, since: beat.since, ...(beat.was ? { was: beat.was } : {}) })
        worstTurn = Math.max(worstTurn, round(pose.spin - before.spin))
        if (phase > CALM_MS) worstHeld = Math.max(worstHeld, Math.abs(pose.spin), pose.air)
        if (phase > CALM_MS) worstStep = Math.max(worstStep, Math.abs(pose.y - before.y), Math.abs(pose.lean - before.lean))
        before = pose
      }
    }
    // Never part of a flip in a frame (it was 175 degrees): come to rest inside a flourish's window she does not leave the ground at all, and
    // her body no further in a frame than breathing takes it; before the window the flourish plays from its start, turning as it always does.
    expect(worstHeld).toBe(0)
    expect(worstStep).toBeLessThan(3)
    expect(worstTurn).toBeLessThan(52)
    // Idle that began in a flourish's window is the stance all through it, only breathing; and at rest, so drawn a frame in three.
    const held = (ms: number): Moment => ({ mood: 'idle', now: T0 + CALM_MS + ms, since: T0 + CALM_MS + 300 })
    const poses = [600, 900, 1500, 3000].map(ms => heroPose(who, held(ms)))
    expect(poses.map(pose => [pose.air, pose.spin, pose.P, pose.fade])).toEqual([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    expect(Math.max(...poses.map(pose => Math.abs(pose.y - poses[0]!.y)))).toBeLessThan(1)
    expect(isAtRest(who, held(1500))).toBe(true)
    // The cycle after, its flourish plays (the second of each: a blade is out).
    expect(heroPose(who, { mood: 'idle', now: T0 + CYCLE_MS + CALM_MS + 900, since: T0 + CALM_MS + 300 }).P).toBeGreaterThan(0)
  }
})

test('a flip leaves the ground off the toes, turns at an even rate with the knees drawn up, and comes down upright with the legs reaching', () => {
  for (const who of WHOS) {
    for (const at of [(ms: number): Moment => ({ mood: 'idle', now: T0 + CALM_MS + ms }), (ms: number): Moment => ({ mood: 'happy', now: T0 + ms, since: T0 })]) {
      // (Both leave the ground 540 ms in and are 900 ms in the air.)
      const flown = Array.from({ length: 11 }, (_f, k) => heroPose(who, at(540 + k * 90)))
      const turns = flown.slice(1, 10).map((pose, i) => Math.abs(pose.spin - flown[i]!.spin))
      // The first frame off the ground is a small turn; then every frame much the same, an eighth of a turn or so.
      expect(turns[0]!).toBeLessThan(30)
      expect(Math.min(...turns.slice(1, 7))).toBeGreaterThan(38)
      expect(Math.max(...turns.slice(1, 7))).toBeLessThan(52)
      // The last frame in the air: all but upright, still well above where it lands, the legs let down.
      const last = flown[9]!
      expect([Math.abs(Math.abs(last.spin) - 360) < 12, last.y - flown[10]!.y > 4, last.air < 0.2]).toEqual([true, true, true])
      expect([flown[10]!.spin, flown[10]!.air]).toEqual([0, 0])
    }
  }
})

test('in text a head is the same cells in every pose: Jack\'s hood and visor bar, Lucy\'s bob, fringe, visor and jaw', () => {
  const FACE: Record<Who, number> = { ninja: 0x1c070b, thief: 0xffe08a }
  /** The head's cells as drawn: the two rows of four the visor's bar is in, glyphs and what is not the visor's own (pulsing) light. */
  const headOf = (who: Who, m: Moment) => {
    const { words, columns } = heroGrid(who, m, 33, HERO_ROWS)
    const cellAt = (i: number) => [String.fromCodePoint(words[i * 3]!), words[i * 3 + 1]!, words[i * 3 + 2]!] as const
    const bar = Array.from({ length: words.length / 3 }, (_c, i) => i).filter(i => cellAt(i)[0] === '▀' && cellAt(i)[2] === FACE[who])
    expect(bar.length).toBe(2)
    expect(bar[1]! - bar[0]!).toBe(1)
    expect(bar.map(i => hueOf(cellAt(i)[1]))).toEqual(['blue', 'blue'])

    return [bar[0]! - columns, bar[0]!].map(from => [0, 1, 2, 3].map(n => cellAt(from + n)).map(([glyph, fg, bg]) => `${glyph}${glyph === '▀' ? '' : hex(fg)}${bg === NONE ? '' : hex(bg)}`).join(' ')).join(' / ')
  }
  // Upright and looking ahead, whatever the rest of her does: the stance, a crouch before a flip, a cut, the guard, the kata or the keys.
  const upright: Record<Who, Moment[]> = {
    ninja: [{ mood: 'idle', now: T0 + 2500 }, { mood: 'idle', now: T0 + CALM_MS + 360 }, { mood: 'idle', now: T0 + 2 * CYCLE_MS + CALM_MS + 540 }, { mood: 'worried', now: T0 + 360, since: T0 }, { mood: 'working', now: T0 + 450, clock: 450 }, { mood: 'working', now: T0 + 2520, clock: 2520 }],
    thief: [{ mood: 'idle', now: T0 + 2500 }, { mood: 'idle', now: T0 + CALM_MS + 360 }, { mood: 'idle', now: T0 + 2 * CYCLE_MS + CALM_MS + 1900 }, { mood: 'worried', now: T0 + 360, since: T0 }, { mood: 'working', now: T0 + 450, clock: 450 }, { mood: 'working', now: T0 + 1200, clock: 1200 }],
  }
  expect(new Set(upright.ninja.map(m => headOf('ninja', m)))).toEqual(new Set(['▗#8a1f2a █#8a1f2a █#8a1f2a ▖#8a1f2a / ▀#1c070b ▀#1c070b █#8a1f2a ▌#8a1f2a']))
  expect(new Set(upright.thief.map(m => headOf('thief', m)))).toEqual(new Set(['▟#ffffff █#ffffff █#ffffff ▙#ffffff / ▀#ffe08a ▀#ffe08a █#ffffff ▌#ffffff']))
  // Through a flip the visor's bar is there every frame, upside down at the top of it.
  for (const who of WHOS) {
    for (let k = 0; k < 24; k++) {
      const { words } = heroGrid(who, { mood: 'happy', now: T0 + k * 90, since: T0 }, 33, HERO_ROWS)
      const bars = Array.from({ length: words.length / 3 }, (_c, i) => i).filter(i => (words[i * 3] === 0x2580 || words[i * 3] === 0x2584) && words[i * 3 + 2] === FACE[who])
      // (A hand of hers over her suit may make such a cell too.)
      expect(bars.length).toBeGreaterThan(1)
      if (k === 10) expect(bars.filter(i => words[i * 3] === 0x2584).length).toBe(2)
    }
  }
})

test('Lucy\'s bob keeps its mass through a flip; Jack\'s scabbard glows only while the blade is in it, and nothing of her is white', () => {
  const count = (canvas: Canvas, color: number) => [...canvas.data].filter(one => one === color).length
  // The white of her hair, frame by frame through the aerial: never the long cone it was (twice the head), never gone.
  const still = count(heroCanvas('thief', { mood: 'idle', now: T0 + 450 }, 99, 98), 0xffffff)
  const flown = Array.from({ length: 12 }, (_f, k) => count(heroCanvas('thief', { mood: 'idle', now: T0 + CALM_MS + 450 + k * 90 }, 99, 98), 0xffffff))
  expect(still).toBeGreaterThan(40)
  expect(Math.max(...flown)).toBeLessThan(still * 1.35)
  expect(Math.min(...flown)).toBeGreaterThan(still * 0.55)
  // The scabbard: the blade's light along it (the deeper blue) in the stance, none with the katana out, a flare the frame it goes home.
  const DEEP = 0x2fb8c4
  const spin = (ms: number): Moment => ({ mood: 'idle', now: T0 + CYCLE_MS + CALM_MS + ms })
  expect(count(heroCanvas('ninja', { mood: 'idle', now: T0 + 450 }, 99, 98), DEEP)).toBeGreaterThan(4)
  expect([heroPose('ninja', spin(1200)).P !== 0, count(heroCanvas('ninja', spin(1200), 99, 98), DEEP) < 2]).toEqual([true, true])
  expect(count(heroCanvas('ninja', { mood: 'working', now: T0 + 900, clock: 900 }, 99, 98), DEEP)).toBeLessThan(2)
  const home = Array.from({ length: 12 }, (_f, k) => spin(2400 + k * 90)).find(m => heroPose('ninja', m).P === 0)!
  expect(count(heroCanvas('ninja', home, 99, 98), DEEP)).toBe(0)
  expect(count(heroCanvas('ninja', { ...home, now: home.now + 360 }, 99, 98), DEEP)).toBeGreaterThan(4)
  // No pure white anywhere in her, in either style: her brightest is the light blue's pale step.
  for (const [, at] of ANIMS) {
    for (let k = 0; k < 48; k += 2) {
      expect(coloursOf(heroCanvas('ninja', at(k), 99, 98)).has(0xffffff)).toBe(false)
      expect(gridColours(heroGrid('ninja', at(k), 33, HERO_ROWS)).includes(0xffffff)).toBe(false)
    }
  }
})

test('off the terminal the red HUD lists its agents with dots of its own light blue, not the minis\' colours', async ($, on) => {
  mock.clock(on, { now: NOW })
  store(on, {}, 'custom:ghostrunner', 'claude-opus-5-5')
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  on('tool.call', () => ({ result: 'ok' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const id of ['a1', 'a2', 'a3', 'a4']) await $.tool.call(inAgent(id, { tool: 'Read', file_path: `/tmp/${id}` }))
  const ui = await $.ui.mount({ ...TALL, surface: 'desktop' })
  const dots = (await ui.findAll({ type: 'Text' })).filter(isDot).map(t => String(t.props.color))
  expect(dots).toEqual(['#5ef6ff', '#5ef6ff', '#5ef6ff', '#5ef6ff'])
  const named = coloursIn(await ui.drawn()).filter(color => color.startsWith('#')).map(color => parseInt(color.slice(1), 16))
  expect([...new Set(named)].filter(color => !['red', 'blue', 'dark'].includes(hueOf(color))).map(hex)).toEqual([])
  await ui.unmount()
})

test('at rest a character is drawn one frame in three, and every frame as soon as something of it moves', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  store(on, { style: 'text' }, 'custom:ghostrunner', 'claude-opus-5-5')
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  let blits = 0
  on('ui.blit', () => {
    blits += 1

    return { value: {} }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  const during = async (ms: number) => {
    blits = 0
    await clock.advance(ms)

    return blits
  }
  // The stance, only breathing: a frame in three at the most.
  await clock.advance(450)
  expect(await during(810)).toBeLessThan(5)
  // Her head turns to the conversation (1.5 s into the cycle, for 450 ms): every frame of it is drawn.
  await clock.advance(1440 - 1260)
  expect(await during(540)).toBeGreaterThan(4)
  // The flourish: from its first frame, every frame.
  await clock.advance(CALM_MS - 1980 - 90)
  expect(await during(900)).toBeGreaterThan(8)
  await ui.unmount()
})

test('a reel plays its mood\'s loops in rotation, each held a while, and survives a bad manifest', () => {
  expect(reelOf('not json')).toBeNull()
  expect(reelOf('{"clips":{"a":{"frames":0}},"moods":{"idle":["a"]}}')).toBeNull()
  const reel = reelOf(JSON.stringify({ clips: { calm: { frames: 20, ms: 100 }, look: { frames: 35, ms: 100 }, 'Bad Name': { frames: 3, ms: 90 } }, moods: { idle: ['calm', 'look', 'gone'], working: ['Bad Name'] } }))!
  expect(reel.moods).toEqual({ idle: ['calm', 'look'] })
  // calm is 2 s, held 4 times (8 s); look is 3.5 s, held twice (7 s); then round again.
  expect(frameAt(reel, 'idle', 0)).toEqual({ clip: 'calm', frame: 0 })
  expect(frameAt(reel, 'idle', 2050)).toEqual({ clip: 'calm', frame: 0 })
  expect(frameAt(reel, 'idle', 7990)).toEqual({ clip: 'calm', frame: 19 })
  expect(frameAt(reel, 'idle', 8000)).toEqual({ clip: 'look', frame: 0 })
  expect(frameAt(reel, 'idle', 15000)).toEqual({ clip: 'calm', frame: 0 })
  // A mood the reel lacks plays the idle loops.
  expect(frameAt(reel, 'worried', 100)).toEqual({ clip: 'calm', frame: 1 })
})

// --- one character per model: the slots -----------------------------------------------

test('a slot is a world and a model: each comes from its theme and the session\'s model', () => {
  expect(SLOTS).toEqual([
    'ghostrunner-opus', 'ghostrunner-sonnet', 'ghostrunner-haiku', 'ghostrunner-fable',
    'edgerunners-opus', 'edgerunners-sonnet', 'edgerunners-haiku', 'edgerunners-fable',
    'initiald-opus', 'initiald-sonnet', 'initiald-haiku', 'initiald-fable',
    'y2k-opus', 'y2k-sonnet', 'y2k-haiku', 'y2k-fable',
    'y2kdark-opus', 'y2kdark-sonnet', 'y2kdark-haiku', 'y2kdark-fable',
    'halo-opus', 'halo-sonnet', 'halo-haiku', 'halo-fable',
    'halodark-opus', 'halodark-sonnet', 'halodark-haiku', 'halodark-fable',
  ])
  const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-fable-5']
  const slotsOf = (theme: string, packs: readonly Pack[] = []) => MODELS.map(model => {
    const { family } = themed(theme, packs)

    return 'skin' in family ? slotOf(family.world, formOf(model)) : undefined
  })
  // By the tables and by the packs alike; a pack of the cyber family is set in the world of its variant.
  for (const packs of [[], PACKS]) {
    expect([...slotsOf('custom:ghostrunner', packs), ...slotsOf('custom:cyberpunk-edgerunners', packs)]).toEqual(SLOTS.slice(0, 8))
    expect(slotsOf('custom:kirby', packs)).toEqual([undefined, undefined, undefined, undefined])
  }
  // The third world is the Initial D pack's (the tables do not know the theme): its drivers, and no drawn character or mask of its own but its cars.
  expect(slotsOf('custom:initial-d', PACKS)).toEqual(SLOTS.slice(8, 12))
  expect(SLOTS.slice(8, 12).map(slot => CAST[slot])).toEqual(['TAKUMI', 'RYOSUKE', 'KEISUKE', 'BUNTA'])
  // The Y2K packs are one cast in two worlds: a light pack plays the pictures made for a light ground, a dark one those for the dark, each in its own skin; with none (none is shipped) the model's object turns in ASCII, never a mask or a sprite.
  const chrome = packsIn({ ...PACK_TEXTS, 'y2k.json': packText('y2k', { family: 'y2k' }, '#f2f5fa', { isLight: true }), 'y2k-dark.json': packText('y2k-dark', { family: 'y2k', skin: skinText(SKINS.midnight) }, '#050813') }).packs
  expect([slotsOf('custom:y2k', chrome), slotsOf('custom:y2k-dark', chrome)]).toEqual([SLOTS.slice(12, 16), SLOTS.slice(16, 20)])
  expect(SLOTS.slice(12, 20).map(slot => CAST[slot])).toEqual(['SERAPH', 'LUMEN', 'SPARK', 'HALO', 'SERAPH', 'LUMEN', 'SPARK', 'HALO'])
  const [day, dark] = ['custom:y2k', 'custom:y2k-dark'].map(theme => themed(theme, chrome)) as [ReturnType<typeof themed>, ReturnType<typeof themed>]
  expect(['skin' in day.family && day.family.skin, 'skin' in dark.family && dark.family.skin, day.isLight, dark.isLight]).toEqual([SKINS.chrome, SKINS.midnight, true, false])
  expect(['skin' in day.family && day.family.cars, day.family === FAMILIES.y2k, dark.family === FAMILIES['y2k-dark']]).toEqual([undefined, true, true])
  const mine = packsIn({ ...PACK_TEXTS, 'sunset.json': packText('sunset', { family: 'cyber', variant: 'yellow' }, '#101820'), 'dawn.json': packText('dawn', { family: 'cyber', variant: 'red' }, '#101820') }).packs
  expect([slotsOf('custom:sunset', mine)[1], slotsOf('custom:dawn', mine)[3]]).toEqual(['edgerunners-sonnet', 'ghostrunner-fable'])
  // The drawn characters stay the ninja for Ghostrunner and the thief for Edgerunners.
  expect(['custom:ghostrunner', 'custom:cyberpunk-edgerunners'].map(theme => {
    const family = familyOf(theme)

    return 'skin' in family ? [family.world, family.hero?.who, family.hero?.name] : []
  })).toEqual([['ghostrunner', 'ninja', 'Jack'], ['edgerunners', 'thief', 'Lucy']])
})

test('a manifest brings its character\'s name and speech as plain text, capped; what is not text is left out', () => {
  const clips = { calm: { frames: 20, ms: 90, what: 'stares' } }
  const moods = { idle: ['calm'] }
  expect(reelOf(JSON.stringify({ name: 'HEL', speech: { idle: 'WATCHING.', working: 'HUNTING...', happy: 'DONE.', worried: 'TOO CLOSE.' }, clips, moods })))
    .toEqual({ name: 'HEL', speech: { idle: 'WATCHING.', working: 'HUNTING...', happy: 'DONE.', worried: 'TOO CLOSE.' }, clips: { calm: { frames: 20, ms: 90 } }, moods })
  // Neither is required: the contract's `speech` is optional, and a manifest from before the names has none.
  expect(reelOf(JSON.stringify({ clips, moods }))).toEqual({ clips: { calm: { frames: 20, ms: 90 } }, moods })
  // Escapes, line breaks and direction marks are no part of a name; a long one is cut; a mood that is not one, or not text, is dropped.
  const odd = reelOf(JSON.stringify({ name: ' \u001b[31mADAM\n‮SMASHER\u0007 ' + 'X'.repeat(60), speech: { idle: 'A'.repeat(200), working: 7, happy: ['x'], worried: '  \t ', angry: 'NO', __proto__: 'x' }, clips, moods }))!
  expect(odd.name).toBe('[31mADAM SMASHER XXXXXXX')
  expect([odd.name!.length, odd.speech]).toEqual([24, { idle: 'A'.repeat(60) }])
  expect([reelOf(JSON.stringify({ name: 42, speech: 'hello', clips, moods })), reelOf(JSON.stringify({ name: '\u0007', speech: null, clips, moods }))]).toEqual([{ clips: { calm: { frames: 20, ms: 90 } }, moods }, { clips: { calm: { frames: 20, ms: 90 } }, moods }])
  // A manifest without idle loops is not one: every other mood falls back to them.
  expect(reelOf(JSON.stringify({ name: 'HEL', clips, moods: { working: ['calm'] } }))).toBeNull()
  expect(FEED_SHAPE).toBe(400 / 340)
})

const manifestOf = (name: string | undefined, speech?: Record<string, string>) => JSON.stringify({
  ...(name === undefined ? {} : { name }), ...(speech === undefined ? {} : { speech }),
  clips: { calm: { frames: 20, ms: 90, what: 'stands' }, act: { frames: 10, ms: 90, what: 'moves' } },
  moods: { idle: ['calm'], working: ['act'], happy: ['act'], worried: ['calm'] },
})

/** The plugin's assets folder, for a test to fill: a manifest per slot, and the slots with still portraits. Returns the manifests read, by slot. */
function assetsFolder(on: On, manifests: Partial<Record<Slot, string>>, stills: readonly Slot[] = []) {
  const asked: string[] = []
  on('fs.read', (_$, e) => {
    const slot = /\/assets\/([a-z0-9-]+)\/manifest\.json$/.exec(e.path)?.[1] as Slot | undefined
    if (slot !== undefined) asked.push(slot)
    const text = slot === undefined ? undefined : manifests[slot]
    if (text === undefined) throw new Error('ENOENT')

    return { value: text }
  })
  on('fs.exists', (_$, e) => ({ value: stills.some(slot => e.path.endsWith(`/assets/${slot}/idle-00.png`)) }))

  return asked
}

test('the camera feed plays the slot of the theme and the model: its manifest\'s loops, name and speech; a missing one falls back, a late one is picked up, a model change switches the feed in one box', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on, {}, 'custom:ghostrunner', 'claude-opus-5-5')
  kitty(on)
  let live: SessionUsage = { ...USAGE, rateLimits: [] }
  on('session.usage', () => ({ value: live }))
  on('command.run', () => ({ text: '' }))
  const files: string[] = []
  on('ui.blit', (_$, e) => {
    if ('source' in e && 'file' in e.source) files.push(e.source.file)

    return { value: {} }
  })
  const manifests: Partial<Record<Slot, string>> = { 'ghostrunner-opus': manifestOf('JACK', { idle: 'BLADE SHEATHED. WATCHING.', working: 'CUTTING THROUGH ICE...' }) }
  const asked = assetsFolder(on, manifests, ['ghostrunner-opus', 'edgerunners-opus'])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  const seen = async () => {
    const lines = flow(under(await ui.drawn()))
    const picture = (await ui.find({ key: 'kirby' }))?.props
    const source = picture?.source as { file?: string } | undefined

    return { lines, kind: lines.filter(line => line.startsWith('<')), box: [picture?.columns, picture?.rows], file: source?.file ?? '', named: lines.find(line => line.startsWith('─┤ ')) ?? '', text: lines.join('\n') }
  }

  // Opus on Ghostrunner, its manifest there: the feed plays its idle loop from the first frame, under its name, saying its line.
  const jack = await seen()
  expect(jack.kind).toEqual(['<Image kirby>'])
  expect(jack.file).toMatch(/\/assets\/ghostrunner-opus\/calm\/000\.png$/)
  expect(jack.named).toBe('─┤ JACK // OPUS-5-5 ├─')
  expect(jack.text).toContain('BLADE SHEATHED. WATCHING.')
  // The box is the feed's shape, 400 by 340, as wide as the pane: 33 columns of 9 by 21 cells, 12 rows.
  expect(jack.box).toEqual([33, 12])
  expect(widest(await ui.drawn())).toBe(33)
  // Its frames follow one another, every one of them the slot's own.
  await clock.advance(1500)
  expect(files.length).toBeGreaterThan(10)
  expect(files.every(file => /\/assets\/ghostrunner-opus\/calm\/\d{3}\.png$/.test(file))).toBe(true)
  expect(files.at(-1)).toMatch(/calm\/01\d\.png$/)

  // The model changes mid-session to one whose slot has no manifest: within a few seconds the mask of that model, as before the slots.
  sessionModel = 'claude-sonnet-5-5'
  await clock.advance(4400)
  const mask = await seen()
  expect([mask.kind, mask.named, mask.box]).toEqual([['<Raster kirby>'], '─┤ RAIJIN TACHI // SONNET-5-5 ├─', [33, MASK_ROWS]])
  expect(mask.text).toContain('ICE HOLDING. STANDING BY.')

  // Its footage arrives later: looked for again within fifteen seconds, and played, in the box Jack had.
  manifests['ghostrunner-sonnet'] = manifestOf('HEL', { idle: 'NO ONE PASSES.', worried: 'TARGET LOCKED. TOO LATE.' })
  files.length = 0
  await clock.advance(16_000)
  const hel = await seen()
  expect([hel.kind, hel.named, hel.box]).toEqual([['<Image kirby>'], '─┤ HEL // SONNET-5-5 ├─', jack.box])
  expect(hel.file).toMatch(/\/assets\/ghostrunner-sonnet\/calm\/\d{3}\.png$/)
  expect(hel.text).toContain('NO ONE PASSES.')
  expect(files.length).toBeGreaterThan(0)
  expect(files.every(file => file.includes('/assets/ghostrunner-sonnet/'))).toBe(true)
  // Its manifest's line for a mood wins over the family's: a worry is told in its words, a mood it has no line for in the family's.
  live = USAGE
  await clock.advance(4400)
  expect((await seen()).text).toContain('TARGET LOCKED. TOO LATE.')
  live = { ...USAGE, rateLimits: [] }
  await clock.advance(4400)

  // Back to Opus: the feed switches within a few seconds, its loop from the first frame again, the box unchanged.
  sessionModel = 'claude-opus-5-5'
  files.length = 0
  await clock.advance(4400)
  const back = await seen()
  expect([back.kind, back.named, back.box]).toEqual([['<Image kirby>'], '─┤ JACK // OPUS-5-5 ├─', jack.box])
  const first = files.findIndex(file => file.includes('/assets/ghostrunner-opus/'))
  expect(files[first]).toMatch(/\/assets\/ghostrunner-opus\/calm\/00[01]\.png$/)
  expect(files.slice(first).every(file => file.includes('/assets/ghostrunner-opus/'))).toBe(true)
  // (Jack's manifest has no line for a worry: the drawn character's own stands.)
  live = USAGE
  await clock.advance(4400)
  expect((await seen()).text).toContain('WEEKLY LIMIT CLOSING IN')
  live = { ...USAGE, rateLimits: [] }

  // The other theme is the other world. Its Opus has no manifest but still portraits: they loop in the same box, under the drawn character's name and lines.
  sessionTheme = 'custom:cyberpunk-edgerunners'
  await clock.advance(4400)
  const lucy = await seen()
  expect([lucy.kind, lucy.named, lucy.box]).toEqual([['<Image kirby>'], '─┤ LUCY // OPUS-5-5 ├─', jack.box])
  expect(lucy.file).toMatch(/\/assets\/edgerunners-opus\/idle-\d\d\.png$/)
  expect(lucy.text).toContain('CASING THE JOINT. QUIET.')
  // Fable there has neither: the mask's Fable.
  sessionModel = 'claude-fable-5'
  await clock.advance(4400)
  const oracle = await seen()
  expect([oracle.kind, oracle.named]).toEqual([['<Raster kirby>'], '─┤ RAIJIN ORACLE // FABLE-5 ├─'])
  // Until Adam Smasher's folder is dropped in; a manifest without a name plays under its slot's own character's, never the mask's.
  manifests['edgerunners-fable'] = manifestOf('ADAM SMASHER')
  manifests['edgerunners-haiku'] = manifestOf(undefined)
  await clock.advance(16_000)
  const adam = await seen()
  expect([adam.kind, adam.named, adam.box]).toEqual([['<Image kirby>'], '─┤ ADAM SMASHER // FABLE-5 ├─', jack.box])
  expect(adam.file).toContain('/assets/edgerunners-fable/calm/')
  expect(adam.text).toContain('ICE HOLDING. STANDING BY.') // no speech in it: the family's lines
  sessionModel = 'claude-haiku-4-5'
  await clock.advance(4400)
  expect([(await seen()).named, (await seen()).file.includes('/assets/edgerunners-haiku/calm/')]).toEqual(['─┤ REBECCA // HAIKU-4-5 ├─', true])

  // The status lists every slot: found, with its name and how many loops, or missing.
  const status = (await $.command.run(typed('status'))).text ?? ''
  expect(/Footage: ([^.]*)\./.exec(status)?.[1]?.split(', ')).toEqual([
    'ghostrunner-opus JACK (2 loops)', 'ghostrunner-sonnet HEL (2 loops)', 'ghostrunner-haiku missing', 'ghostrunner-fable missing',
    'edgerunners-opus missing', 'edgerunners-sonnet missing', 'edgerunners-haiku REBECCA [no name in its manifest] (2 loops)', 'edgerunners-fable ADAM SMASHER (2 loops)',
    'initiald-opus missing', 'initiald-sonnet missing', 'initiald-haiku missing', 'initiald-fable missing',
    'y2k-opus missing', 'y2k-sonnet missing', 'y2k-haiku missing', 'y2k-fable missing',
    'y2kdark-opus missing', 'y2kdark-sonnet missing', 'y2kdark-haiku missing', 'y2kdark-fable missing',
    'halo-opus missing', 'halo-sonnet missing', 'halo-haiku missing', 'halo-fable missing',
    'halodark-opus missing', 'halodark-sonnet missing', 'halodark-haiku missing', 'halodark-fable missing',
  ])
  expect(status).toMatch(/Pictures: \S+\/assets\./)

  // With the style "text" no feed plays: the drawn character for Opus, the mask for the others, manifest or not.
  await $.command.run(typed('style text'))
  expect([(await seen()).kind, (await seen()).named]).toEqual([['<Raster kirby>'], '─┤ RAIJIN PING // HAIKU-4-5 ├─'])
  sessionModel = 'claude-opus-5-5'
  await clock.advance(4400)
  const drawn = await seen()
  expect([drawn.kind, drawn.named, drawn.box]).toEqual([['<Raster kirby>'], '─┤ LUCY // OPUS-5-5 ├─', [33, HERO_ROWS]])
  await $.command.run(typed('style auto'))

  // The manifests still missing are asked for again and again; once all are found, never more.
  const missing = SLOTS.filter(slot => manifests[slot] === undefined)
  expect(missing.length).toBe(24)
  asked.length = 0
  await clock.advance(31_000)
  expect(new Set(asked)).toEqual(new Set(missing))
  for (const slot of missing) manifests[slot] = manifestOf(slot.toUpperCase().slice(0, 4))
  await clock.advance(16_000)
  expect((await seen()).named).toBe('─┤ EDGE // OPUS-5-5 ├─')
  asked.length = 0
  await clock.advance(61_000)
  expect(asked).toEqual([])
  await ui.unmount()
})

test('where the terminal draws no pictures a manifest changes nothing: the drawn character for Opus, the mask for the others', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on, {}, 'custom:ghostrunner', 'claude-opus-5-5')
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  on('ui.blit', () => ({ value: {} }))
  assetsFolder(on, { 'ghostrunner-opus': manifestOf('JACK', { idle: 'FROM THE MANIFEST.' }), 'ghostrunner-sonnet': manifestOf('HEL') }, ['ghostrunner-opus'])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  const lines = flow(under(await ui.drawn()))
  expect(lines.filter(line => line.startsWith('<'))).toEqual(['<Raster kirby>'])
  expect((await ui.find({ key: 'kirby' }))?.props.rows).toBe(HERO_ROWS)
  expect(lines.join('\n')).toContain('JACK // OPUS-5-5')
  expect(lines.join('\n')).toContain('BLADE SHEATHED. WATCHING.')
  sessionModel = 'claude-sonnet-5-5'
  await clock.advance(4400)
  expect(flow(under(await ui.drawn())).join('\n')).toContain('RAIJIN TACHI // SONNET-5-5')
  expect((await ui.find({ key: 'kirby' }))?.props.rows).toBe(MASK_ROWS)
  await ui.unmount()
})

// --- theme packs -------------------------------------------------------------------

const FLOW = { palette: {}, steps: {} } // the Flow map's part of a pack: not this mod's to read
const packText = (slug: string, avatar: object, background: string | null, more: object = {}) => JSON.stringify({ slug, name: slug, isLight: false, terminal: { background }, avatar, flow: FLOW, ...more })
const skinText = (skin: Skin) => Object.fromEntries(Object.entries(skin).filter(([key]) => key !== 'variant').map(([key, color]) => [key, hex(color as number)]))
const RED_SKIN = skinText(SKINS.red)
/** The six packs as the themes folder holds them, today's values. */
const PACK_TEXTS: Record<string, string> = {
  'default.json': packText('default', { family: 'clawd' }, null),
  'kirby.json': packText('kirby', { family: 'kirby' }, '#1b2414', { match: ['kirby'] }),
  'kirby-pink.json': packText('kirby-pink', { family: 'kirby' }, '#2b1724', { match: ['kirby-pink'] }),
  'ghostrunner.json': packText('ghostrunner', { family: 'cyber', variant: 'red', skin: RED_SKIN }, '#120608', { match: ['ghostrunner'] }),
  'cyberpunk-edgerunners.json': packText('cyberpunk-edgerunners', { family: 'cyber', variant: 'yellow' }, '#0b0b06', { match: ['edgerunners'] }),
  'initial-d.json': packText('initial-d', { family: 'initial-d', skin: skinText(SKINS.night) }, '#08182a', { match: ['initial-d'] }),
}
const packsIn = (texts: Record<string, string | null>) => packsOf(new Map(Object.entries(texts)))
const PACKS: Pack[] = packsIn(PACK_TEXTS).packs

/** A themes folder beside the mod, for a test to change: its files by name, listed with a size and a time that follow their text. */
function themesFolder(on: On, files: Record<string, string>) {
  const reads: string[] = []
  on('fs.list', (_$, e) => {
    // (The packs' folder, beside the mod; not `<config>/themes`, Claude Code's own themes, which the Loadouts picker lists.)
    if (!e.path.endsWith('/themes') || e.path.endsWith('/.claude/themes')) throw new Error('ENOENT')

    return { value: Object.entries(files).map(([name, text], i) => ({ name, kind: 'file' as const, size: text.length, mtimeMs: 1000 + i, isLink: false })) }
  })
  on('fs.read', (_$, e) => {
    const name = e.path.split('/').pop() ?? ''
    if (!e.path.includes('/themes/') || e.path.includes('/.claude/themes/') || files[name] === undefined) throw new Error('ENOENT')
    reads.push(name)

    return { value: files[name]! }
  })
  on('fs.exists', () => ({ value: false }))

  return reads
}

test('a pack is read whole or not at all, and the pack that serves a theme is its slug, else its longest match, else the default', () => {
  expect(PACKS.map(pack => pack.slug)).toEqual(['cyberpunk-edgerunners', 'default', 'ghostrunner', 'initial-d', 'kirby-pink', 'kirby'])
  expect(PACKS.find(pack => pack.slug === 'ghostrunner')).toEqual({ slug: 'ghostrunner', name: 'ghostrunner', match: ['ghostrunner'], isLight: false, background: 0x120608, family: 'cyber', variant: 'red', skin: SKINS.red })
  expect(PACKS.find(pack => pack.slug === 'default')?.background).toBeNull()
  // The name as packs know it, and the three rules, in order.
  expect(['custom:Kirby Pink', ' kirby_pink ', 'dark'].map(norm)).toEqual(['kirby-pink', 'kirby-pink', 'dark'])
  const served = (theme: string) => resolve(theme, PACKS)?.slug
  expect(['custom:kirby', 'Kirby Pink', 'custom:kirby-night', 'custom:kirby-pink-neon', 'custom:cyberpunk-edgerunners', 'Edgerunners Night', 'soft ghostrunner', 'custom:cyberpunk-soft', 'custom:cyberpunk', 'dark', 'light', 'custom:solarized', ''].map(served))
    .toEqual(['kirby', 'kirby-pink', 'kirby', 'kirby-pink', 'cyberpunk-edgerunners', 'cyberpunk-edgerunners', 'ghostrunner', 'default', 'default', 'default', 'default', 'default', undefined])
  expect(resolve('dark', PACKS.filter(pack => pack.slug !== 'default'))).toBeUndefined()

  // What is not a pack is named with why, and never half used; the others are read all the same.
  const bad: Record<string, string> = {
    'a.json': 'not json {', 'b.json': '[]', 'c.json': packText('other', { family: 'kirby' }, null), 'd.json': packText('d', { family: 'dragon' }, null),
    'e.json': packText('e', { family: 'kirby', variant: 'red' }, null), 'f.json': packText('f', { family: 'cyber' }, null), 'g.json': packText('g', { family: 'kirby' }, 'green'),
    'h.json': packText('h', { family: 'cyber', variant: 'red', skin: { ...RED_SKIN, ink: 'black' } }, null), 'i.json': JSON.stringify({ slug: 'i', isLight: 'no', terminal: { background: null }, avatar: { family: 'kirby' } }),
    'j.json': packText('j', { family: 'kirby' }, null, { match: 'kirby' }), 'l.json': packText('l', { family: 'initial-d', variant: 'red' }, null), 'm.json': packText('m', { family: 'clawd', skin: RED_SKIN }, null), 'k.json': JSON.stringify({ slug: 'k', isLight: false, avatar: { family: 'kirby' } }),
  }
  for (const [file, text] of Object.entries(bad)) expect([file, typeof packOf(text, file)]).toEqual([file, 'string'])
  const mixed = packsIn({ ...bad, ...PACK_TEXTS, 'gone.json': null })
  expect(mixed.packs.map(pack => pack.slug)).toEqual(PACKS.map(pack => pack.slug))
  expect(mixed.skipped.length).toBe(Object.keys(bad).length + 1)
  expect(mixed.skipped.find(line => line.startsWith('a.json'))).toBe('a.json (not JSON)')
  expect(mixed.skipped.find(line => line.startsWith('gone.json'))).toBe('gone.json (unreadable)')
  // The folder's packs are its JSON files but the schema; what tells a change is a name, a size or a time.
  const entry = (name: string, size = 10, mtimeMs = 1, kind = 'file') => ({ name, size, mtimeMs, kind })
  const listed = packFiles([entry('kirby.json'), entry('schema.json'), entry('validate.py'), entry('sub.json', 0, 0, 'dir'), entry('huge.json', 9_000_000), entry('default.json')])
  expect(listed.files.map(file => file.name)).toEqual(['default.json', 'kirby.json'])
  expect(new Set([listed.print, packFiles([entry('kirby.json', 11), entry('default.json')]).print, packFiles([entry('kirby.json', 10, 2), entry('default.json')]).print, packFiles([entry('default.json')]).print]).size).toBe(4)
})

test('with the packs a theme is what its pack says; without any, or without its own, it is exactly what the tables said', () => {
  const themes = ['', 'dark', 'light', 'light-daltonized', 'dark-ansi', 'custom:kirby', 'Kirby', 'custom:kirby-pink', 'Kirby Pink', 'custom:ghostrunner', 'custom:cyberpunk-edgerunners', 'custom:solarized', 'constructor']
  // No packs: the tables' own answers, the very same objects.
  for (const theme of themes) {
    const got = themed(theme)
    expect([theme, got.family === familyOf(theme), got.ground === groundOf(theme), got.isLight === isLightOf(theme), got.pack]).toEqual([theme, true, true, true, undefined])
  }
  // Today's packs say what the tables said, for every one of those themes: family, variant, grounds, light or dark.
  for (const theme of themes) {
    const [got, was] = [themed(theme, PACKS), themed(theme)]
    expect([theme, got.family === was.family, got.ground, got.isLight]).toEqual([theme, true, was.ground, was.isLight])
    expect(got.ground?.pane).toBe(got.ground?.terminal)
  }
  expect(themed('custom:kirby', PACKS).pack?.slug).toBe('kirby')
  // (Where the packs' rule and the tables' differ, the packs' is the rule: a theme named after one of ours is served by its pack, ground and all.)
  expect([themed('custom:kirby-night').ground, themed('custom:kirby-night', PACKS).ground?.terminal]).toEqual([undefined, 0x1b2414])
  // A pack decides: another ground, another family, a variant, a light theme, its own colours for the HUD.
  const mine = packsIn({
    ...PACK_TEXTS,
    'kirby.json': packText('kirby', { family: 'clawd' }, '#223311', { match: ['kirby'] }),
    'sunset.json': packText('sunset', { family: 'cyber', variant: 'yellow', skin: { ...RED_SKIN, primary: '#ff9900' } }, '#101820', { isLight: true }),
    'default.json': packText('default', { family: 'kirby' }, '#202020'),
  }).packs
  const sunset = themed('custom:sunset', mine)
  expect(['skin' in sunset.family && [sunset.family.key, sunset.family.skin.variant, sunset.family.skin.primary, sunset.family.hero?.who], sunset.ground, sunset.isLight])
    .toEqual([['cyberpunk-edgerunners', 'yellow', 0xff9900, 'thief'], { terminal: 0x101820, pane: 0x101820, isLight: true }, true])
  expect(themed('custom:sunset', mine).family).toBe(sunset.family)
  expect([themed('custom:kirby', mine).family === FAMILIES.clawd, themed('custom:kirby', mine).ground?.terminal]).toEqual([true, 0x223311])
  expect([themed('dark', mine).family === FAMILIES.kirby, themed('dark', mine).ground?.terminal, themed('light', mine).isLight]).toEqual([true, 0x202020, true])
  // A theme of ours whose pack was skipped keeps the tables' answer: the default pack does not take it.
  const partial = PACKS.filter(pack => pack.slug === 'default')
  for (const theme of ['custom:kirby', 'custom:kirby-pink', 'custom:ghostrunner', 'custom:cyberpunk-edgerunners']) {
    expect([theme, themed(theme, partial).family === familyOf(theme), themed(theme, partial).ground === groundOf(theme), themed(theme, partial).pack]).toEqual([theme, true, true, undefined])
  }
  // Nor does a sibling's `match`: without kirby-pink.json the Kirby pack would give the pink theme its green ground; without cyberpunk-edgerunners.json, the red ninja.
  for (const [gone, theme] of [['kirby-pink', 'custom:kirby-pink'], ['kirby-pink', 'Kirby Pink'], ['cyberpunk-edgerunners', 'custom:cyberpunk-edgerunners'], ['kirby', 'custom:kirby'], ['ghostrunner', 'custom:ghostrunner']] as const) {
    const [got, rest] = [themed(theme, PACKS.filter(pack => pack.slug !== gone)), themed(theme)]
    expect([theme, got.family === rest.family, got.ground === rest.ground, got.isLight === rest.isLight, got.pack]).toEqual([theme, true, true, true, undefined])
  }
  expect([themed('custom:kirby-pink', PACKS.filter(pack => pack.slug !== 'kirby-pink')).ground?.terminal === 0x2b1724, themed('custom:cyberpunk-edgerunners', PACKS.filter(pack => pack.slug !== 'cyberpunk-edgerunners')).family.key]).toEqual([true, 'cyberpunk-edgerunners'])
  // (A theme only named after one of ours is still its sibling's by `match`: the tables know our four by name alone.)
  expect(themed('custom:kirby-pink-neon', PACKS.filter(pack => pack.slug !== 'kirby-pink')).pack?.slug).toBe('kirby')
  // A theme not read yet is no pack's.
  expect(themed('', mine).pack).toBeUndefined()
})

test('the Initial D pack brings its own family: a car per model, seen from the front, its headlights for eyes', async ($, on) => {
  expect(['custom:initial-d', 'Initial D', 'custom:initial-d-night'].map(theme => resolve(theme, PACKS)?.slug)).toEqual(['initial-d', 'initial-d', 'initial-d'])
  // (The family is the camera feed's, in the pack's colours or the mod's own; its cars are what is drawn without footage.)
  const feed = FAMILIES['initial-d'] as TextFamily
  const family = feed.cars!
  for (const theme of ['custom:initial-d', 'Initial D']) expect([theme, themed(theme, PACKS).family === feed, themed(theme, PACKS).ground?.terminal]).toEqual([theme, true, 0x08182a])
  expect([feed.world, feed.hero, feed.skin, PACKS.find(pack => pack.slug === 'initial-d')?.skin]).toEqual(['initiald', undefined, SKINS.night, SKINS.night])
  const dusk = themed('custom:initial-d', packsIn({ ...PACK_TEXTS, 'initial-d.json': packText('initial-d', { family: 'initial-d', skin: { ...skinText(SKINS.night), primary: '#ff9900' } }, '#08182a') }).packs).family as TextFamily
  expect([dusk.skin.primary, dusk.skin.variant, dusk.cars === family, themed('custom:initial-d', packsIn({ ...PACK_TEXTS, 'initial-d.json': packText('initial-d', { family: 'initial-d' }, null) }).packs).family === feed]).toEqual([0xff9900, 'night', true, true])
  // Without its pack the theme is anybody's: the tables do not know it.
  expect(themed('custom:initial-d').family).toBe(FAMILIES.clawd)
  expect(FORMS.map(form => nameOf({ family, form }))).toEqual(['Eight-Six', 'Twin Rotor', 'Red Hatch', 'Night Coupe'])
  for (const form of FORMS) {
    const frames = framesOf({ family, form })
    // Lights up, half way, down: three frames of one size, each its own picture, the same car but for its lights.
    expect([form, frames.length, new Set(frames.map(px => JSON.stringify(px))).size]).toEqual([form, 3, 3])
    expect([form, new Set(frames.flatMap(px => px.map(row => row.length))).size, new Set(frames.map(px => px.length)).size]).toEqual([form, 1, 1])
    expect([form, frames[0]!.filter((row, y) => JSON.stringify(row) !== JSON.stringify(frames[2]![y])).length <= 3]).toEqual([form, true])
  }
  // The plain form fits wherever plain Kirby does, and the four bonnets are four colours.
  expect([framesOf({ family, form: 'opus' })[0]![0]!.length <= KIRBY[0]!.length, framesOf({ family, form: 'opus' })[0]!.length <= KIRBY.length]).toEqual([true, true])
  expect(new Set(FORMS.map(form => framesOf({ family, form })[0]![7]![9])).size).toBe(4)
  expect(family.speech.idle[0]).not.toBe('')
  // In the pane: the session's model's car under its name, a pixel of it a pixel, on the pack's ground.
  mock.clock(on, { now: NOW })
  store(on, {}, 'custom:initial-d', 'claude-opus-5-5')
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  themesFolder(on, PACK_TEXTS)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toContain('Eight-Six')
  expect((await rootOf(ui)).backgroundColor).toBe('#08182a')
  const car = await ui.find({ type: 'Raster' })
  expect([car?.props.columns, car?.props.rows]).toEqual([22, 9])
  await ui.unmount()
})

test('the Initial D pane is the camera feed where its slot has footage and the terminal draws pictures, in a HUD of its own words; the cars everywhere else, never the mask', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on, {}, 'custom:initial-d', 'claude-opus-5-5')
  kitty(on)
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  on('command.run', () => ({ text: '' }))
  on('ui.blit', () => ({ value: {} }))
  const manifests: Partial<Record<Slot, string>> = { 'initiald-opus': manifestOf('THE DRIVER', { idle: 'CUP FULL. ROAD EMPTY.' }), 'ghostrunner-sonnet': manifestOf('HEL') }
  // (One folder for both: the packs' files and the slots' manifests.)
  on('fs.list', (_$, e) => {
    if (!e.path.endsWith('/themes') || e.path.endsWith('/.claude/themes')) throw new Error('ENOENT')

    return { value: Object.entries(PACK_TEXTS).map(([name, text], i) => ({ name, kind: 'file' as const, size: text.length, mtimeMs: 1000 + i, isLink: false })) }
  })
  on('fs.read', (_$, e) => {
    const text = e.path.includes('/themes/') && !e.path.includes('/.claude/themes/') ? PACK_TEXTS[e.path.split('/').pop() ?? ''] : manifests[/\/assets\/([a-z-]+)\/manifest\.json$/.exec(e.path)?.[1] as Slot]
    if (text === undefined) throw new Error('ENOENT')

    return { value: text }
  })
  on('fs.exists', () => ({ value: false }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  const seen = async () => {
    const lines = flow(under(await ui.drawn()))
    const picture = (await ui.find({ key: 'kirby' }))?.props

    return { kind: lines.filter(line => line.startsWith('<')), box: [picture?.columns, picture?.rows], file: (picture?.source as { file?: string } | undefined)?.file ?? '', named: lines.find(line => line.startsWith('─┤ ')) ?? '', text: lines.join('\n') }
  }

  // Opus, its manifest there: the feed in the box the other worlds' has, under the manifest's name, saying its line, the HUD in touge words.
  const driver = await seen()
  expect([driver.kind, driver.named, driver.box]).toEqual([['<Image kirby>'], '─┤ THE DRIVER // OPUS-5-5 ├─', [33, 12]])
  expect(driver.file).toMatch(/\/assets\/initiald-opus\/calm\/000\.png$/)
  for (const said of ['CUP FULL. ROAD EMPTY.', 'DOWNHILL', 'STAGE // IDLE', '╱─ TACHOMETER ─']) expect(driver.text).toContain(said)
  for (const word of ['CONNECTION', 'PROTOCOL', 'MONITOR', 'RAIJIN', 'Eight-Six']) expect(driver.text).not.toContain(word)
  expect(coloursIn(await ui.drawn())).toContain(hex(SKINS.night.primary))

  // A model whose slot has none: its car, in the pane the cars always had (the bubble, the name under it), not the mask of another world.
  sessionModel = 'claude-sonnet-5-5'
  await clock.advance(4400)
  const car = await seen()
  expect(car.kind.filter(kind => kind.endsWith(' kirby>'))).toEqual(['<Image kirby>'])
  expect([car.file, car.named]).toEqual(['', ''])
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toContain('Twin Rotor')
  for (const word of ['RAIJIN', 'TACHOMETER', 'RYOSUKE']) expect(car.text).not.toContain(word)
  // Its footage arrives later: the pane switches from the car to the feed. A manifest without a name plays under the slot's driver's, in the family's lines.
  manifests['initiald-sonnet'] = manifestOf(undefined)
  await clock.advance(16_000)
  const late = await seen()
  expect([late.kind, late.named, late.box]).toEqual([['<Image kirby>'], '─┤ RYOSUKE // SONNET-5-5 ├─', driver.box])
  expect(late.file).toContain('/assets/initiald-sonnet/calm/')
  expect(late.text).toContain('ENGINE WARM. WAITING.')

  // With the style "text" no feed plays: the car again, manifest or not.
  await $.command.run(typed('style text'))
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toContain('Twin Rotor')
  expect((await seen()).text).not.toContain('TACHOMETER')
  await $.command.run(typed('style auto'))
  expect((await seen()).named).toBe('─┤ RYOSUKE // SONNET-5-5 ├─')

  // The other worlds fall back as they did: on Ghostrunner a model without footage is the mask, in the cyber HUD's words.
  sessionTheme = 'custom:ghostrunner'
  sessionModel = 'claude-haiku-4-5'
  await clock.advance(4400)
  const mask = await seen()
  expect([mask.kind, mask.named, mask.box]).toEqual([['<Raster kirby>'], '─┤ RAIJIN PING // HAIKU-4-5 ├─', [33, MASK_ROWS]])
  for (const said of ['CONNECTION', 'PROTOCOL // IDLE', 'MONITOR']) expect(mask.text).toContain(said)
  await ui.unmount()
})

test('where the terminal draws no pictures the Initial D pane is the cars, manifest or not', async ($, on) => {
  mock.clock(on, { now: NOW })
  store(on, {}, 'custom:initial-d', 'claude-opus-5-5')
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  on('fs.list', (_$, e) => {
    if (!e.path.endsWith('/themes') || e.path.endsWith('/.claude/themes')) throw new Error('ENOENT')

    return { value: Object.entries(PACK_TEXTS).map(([name, text], i) => ({ name, kind: 'file' as const, size: text.length, mtimeMs: 1000 + i, isLink: false })) }
  })
  on('fs.read', (_$, e) => {
    const text = e.path.includes('/themes/') && !e.path.includes('/.claude/themes/') ? PACK_TEXTS[e.path.split('/').pop() ?? ''] : e.path.endsWith('/assets/initiald-opus/manifest.json') ? manifestOf('THE DRIVER') : undefined
    if (text === undefined) throw new Error('ENOENT')

    return { value: text }
  })
  on('fs.exists', () => ({ value: false }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toContain('Eight-Six')
  expect(flow(under(await ui.drawn())).join('\n')).not.toContain('THE DRIVER')
  const car = await ui.find({ type: 'Raster' })
  expect([car?.props.columns, car?.props.rows]).toEqual([22, 9])
  await ui.unmount()
})

test('the pane is drawn from the packs beside the mod: read at the start, again when a file changes, a bad one skipped and named in /avatar status', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on, {}, 'custom:sunset', 'claude-opus-5-5')
  const { told } = terminal(on)
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  on('session.id', () => ({ value: 's1' }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  const files: Record<string, string> = {
    ...PACK_TEXTS,
    'sunset.json': packText('sunset', { family: 'cyber', variant: 'red', skin: { ...RED_SKIN, primary: '#ff9900' } }, '#101820'),
    'broken.json': '{ "slug": "broken", ',
    'schema.json': '{}',
  }
  const reads = themesFolder(on, files)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  // The terminal and the pane take the pack's one colour; the HUD its skin; the schema is not read as a pack.
  expect(told()).toEqual([['/dev/pts/7', '#101820']])
  expect(reads.includes('schema.json')).toBe(false)
  const ui = await $.ui.mount(TALL)
  expect((await rootOf(ui)).backgroundColor).toBe('#101820')
  expect(coloursIn(await ui.drawn()).includes('#ff9900')).toBe(true)
  const status = async () => (await $.command.run(typed('status'))).text ?? ''
  expect(await status()).toContain('Theme: custom:sunset, by pack sunset (ghostrunner red, dark, background #101820)')
  expect(await status()).toContain('Packs: cyberpunk-edgerunners, default, ghostrunner, initial-d, kirby-pink, kirby, sunset from ')
  expect(await status()).toContain('skipped: broken.json (not JSON)')
  // Nothing changes: the files are not read again, however long it lasts.
  const read = reads.length
  await clock.advance(20_000)
  expect([reads.length, told().length]).toEqual([read, 1])
  // The pack edited: within a tick the terminal has its new colour, and the pane with it.
  files['sunset.json'] = packText('sunset', { family: 'clawd' }, '#203040')
  await clock.advance(4400)
  expect(told()[told().length - 1]).toEqual(['/dev/pts/7', '#203040'])
  expect((await rootOf(ui)).backgroundColor).toBe('#203040')
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toContain('Clawd')
  // The pack gone bad: it is skipped, the theme falls to the default pack, the terminal gets its own background back, and no hook broke.
  files['sunset.json'] = 'oops'
  await clock.advance(4400)
  expect(told()[told().length - 1]).toEqual(['/dev/pts/7', ''])
  expect(await status()).toContain('skipped: broken.json (not JSON), sunset.json (not JSON)')
  expect(await status()).toContain('by pack default (clawd, dark, background the terminal\'s own)')
  await ui.unmount()
  await $.session.end(END)
})

test('with no themes folder the status says so and the tables answer', async ($, on) => {
  mock.clock(on, { now: NOW })
  store(on, {}, 'custom:kirby-pink')
  const { told } = terminal(on)
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('fs.list', () => {
    throw new Error('ENOENT')
  })
  on('fs.exists', () => ({ value: false }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(told()).toEqual([['/dev/pts/7', '#2b1724']])
  const status = (await $.command.run(typed('status'))).text ?? ''
  expect(status).toContain('Theme: custom:kirby-pink, by the built-in table (kirby, dark, background #2b1724)')
  expect(status).toContain('Packs: none found')
  await $.session.end(END)
})

// --- a theme for one terminal, or for all ---------------------------------------------

test('the theme command\'s words: a name as the setting spells it, the settings file with its theme set, the line that pins a terminal', () => {
  const customs = ['ghostrunner', 'cyberpunk-edgerunners', 'kirby', 'kirby-pink', 'dark']
  expect(['kirby', 'Kirby Pink', 'custom:kirby', 'kirby_pink', 'dark', 'custom:dark', 'light-ansi', 'nope', ''].map(name => settingOf(name, BUILT_IN, customs)))
    .toEqual(['custom:kirby', 'custom:kirby-pink', 'custom:kirby', 'custom:kirby-pink', 'dark', 'custom:dark', 'light-ansi', undefined, undefined])
  // The file keeps its other keys, their order and its indent; what is not a settings object is left alone.
  expect(withTheme('{\n    "model": "opus",\n    "theme": "dark",\n    "env": { "A": "1" }\n}\n', 'custom:kirby')).toBe('{\n    "model": "opus",\n    "theme": "custom:kirby",\n    "env": {\n        "A": "1"\n    }\n}\n')
  expect(withTheme('', 'dark')).toBe('{\n  "theme": "dark"\n}\n')
  expect([withTheme('[1]', 'dark'), withTheme('{ broken', 'dark'), withTheme('"dark"', 'dark')]).toEqual([null, null, null])
  expect(pinLines('custom:kirby-pink', 'abc-123', '/mods/kirby-hud/bin/claude-theme')).toEqual({
    short: '/mods/kirby-hud/bin/claude-theme kirby-pink --resume abc-123',
    plain: 'claude --settings \'{"theme":"custom:kirby-pink"}\' --resume abc-123',
  })
  expect(pinLines('dark', '', '/my mods/claude-theme').short).toBe('\'/my mods/claude-theme\' dark --continue')
  expect([askOf([]), askOf(['follow']), askOf(['kirby', 'pink', 'here']), askOf(['dark', 'all']), askOf(['kirby']), askOf(['all'])]).toEqual([
    { kind: 'list' }, { kind: 'follow' }, { kind: 'set', name: 'kirby pink', scope: 'here' }, { kind: 'set', name: 'dark', scope: 'all' }, { kind: 'set', name: 'kirby', scope: undefined }, { kind: 'set', name: '', scope: 'all' },
  ])
})

/** The engine's settings beneath the theme command: the user's file, what `--settings` pinned (none: undefined), and what was written. */
function settings(on: On, pinned?: string, others: { project?: string; local?: string; policy?: string } = {}) {
  const SETTINGS = '/home/u/.claude/settings.json'
  const THEMES = '/home/u/.claude/themes'
  // (`themes` is the themes folder: the four theme files, and the live files Loadout writes there.)
  const state = { file: '{\n  "model": "opus",\n  "theme": "custom:ghostrunner"\n}\n', sets: [] as unknown[], writes: [] as string[], hasLauncher: true, themes: Object.fromEntries(['ghostrunner', 'cyberpunk-edgerunners', 'kirby', 'kirby-pink'].map(slug => [`${slug}.json`, JSON.stringify({ name: slug, base: 'dark', overrides: { claude: '#9be564' } })])) as Record<string, string> }
  const user = () => {
    try {
      return String((JSON.parse(state.file) as { theme?: string }).theme ?? '')
    } catch {
      return ''
    }
  }
  mock.env(on, { HOME: '/home/u' })
  // The settings row (the store's) is what the session runs under: the pinned theme where there is one, else the user's.
  const reload = () => void (sessionTheme = others.policy ?? pinned ?? others.local ?? others.project ?? user())
  reload()
  on('config.set', (_$, e) => {
    state.sets.push(e.value)
    if (!BUILT_IN.some(name => name === e.value)) return { deny: `takes one of: ${BUILT_IN.join(', ')}` }
    state.file = withTheme(state.file, String(e.value))!
    reload()

    return { value: e.value }
  })
  on('settings.read', (_$, e) => {
    const theme = e.source === 'user' ? user() : e.source === 'flag' ? pinned : e.source === undefined ? sessionTheme : others[e.source]

    return { value: theme === undefined ? {} : { theme } }
  })
  on('session.id', () => ({ value: 'abc-123' }))
  on('fs.list', (_$, e) => {
    if (e.path !== '/home/u/.claude/themes') throw new Error('ENOENT')

    return { value: Object.entries(state.themes).map(([name, text]) => ({ name, kind: 'file' as const, size: text.length, mtimeMs: state.writes.length, isLink: false })) }
  })
  on('fs.exists', (_$, e) => ({ value: e.path === SETTINGS || (state.hasLauncher && e.path.endsWith('/bin/loadout')) }))
  on('fs.read', (_$, e) => {
    const themed = e.path.startsWith(`${THEMES}/`) ? state.themes[e.path.slice(THEMES.length + 1)] : undefined
    if (themed !== undefined) return { value: themed }
    if (e.path !== SETTINGS) throw new Error('ENOENT')

    return { value: state.file }
  })
  on('fs.write', (_$, e) => {
    state.writes.push(e.path)
    if (e.path.startsWith(`${THEMES}/`)) state.themes[e.path.slice(THEMES.length + 1)] = e.text
    if (e.path === SETTINGS) state.file = e.text
    if (e.path === SETTINGS) reload()

    return { value: undefined }
  })
  /** The theme the shared live file was written from, undefined while there is none. */
  const live = () => liveSource(state.themes['loadout.json'] ?? '', BUILT_IN)

  return { state, user, live }
}

test('/avatar theme: the list and this terminal\'s scope; "all" writes the live theme file and makes it the global theme; "here" changes nothing and gives the line that does', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on)
  const { state, user, live } = settings(on)
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  const run = async (args: string) => (await $.command.run(typed(args))).text ?? ''

  // Alone: the theme here, that it is the global one, the built-in themes, the custom ones, and the three ways.
  const list = await run('theme')
  expect(list.split('\n')[0]).toBe('Theme here: custom:ghostrunner (the global theme).')
  expect(list).toContain('Built-in: auto, dark, light, light-daltonized, dark-daltonized, light-ansi, dark-ansi.')
  expect(list).toContain('Custom: cyberpunk-edgerunners, ghostrunner, kirby, kirby-pink (/home/u/.claude/themes).')
  for (const way of ['<name> all', '<name> here', 'theme follow']) expect(list).toContain(way)

  // All, on a terminal that runs another theme: the live file is written from the theme and made the global theme, the
  // settings' other keys kept; and this terminal, which keeps the theme it started with, is not said to change.
  const all = await run('theme kirby all')
  expect(all).toContain('Loadout kirby is set, and nothing changed here yet: a running session keeps the theme it started with (ghostrunner).')
  expect(all.split('\n')[1]).toBe('claude --resume abc-123')
  expect([state.file, state.sets, live()]).toEqual(['{\n  "model": "opus",\n  "theme": "custom:loadout"\n}\n', [], 'custom:kirby'])
  expect(state.themes['loadout.json']).toBe(liveText('kirby', state.themes['kirby.json']!))
  // The pane goes on drawing the theme this terminal shows.
  await clock.advance(4400)
  expect((await run('status'))).toContain('Theme: custom:ghostrunner,')
  // All, a built-in theme: a live file too, not the engine's settings row.
  expect(await run('theme Dark all')).toContain('Loadout dark is set')
  expect([user(), state.sets, live()]).toEqual(['custom:loadout', [], 'dark'])
  // A name of two words is one theme.
  expect(await run('theme kirby pink all')).toContain('Loadout kirby-pink is set')
  expect(live()).toBe('custom:kirby-pink')
  // The live file is no theme of the list.
  expect(await run('theme')).toContain('Custom: cyberpunk-edgerunners, ghostrunner, kirby, kirby-pink (/home/u/.claude/themes).')
  expect(await run('theme loadout all')).toContain('No theme "loadout".')

  // Here: this terminal has no theme file of its own. Nothing is written; the answer is the line to run.
  const before = JSON.stringify(state)
  const here = await run('theme cyberpunk-edgerunners here')
  expect(here.split('\n')[1]).toMatch(/\/bin\/loadout cyberpunk-edgerunners --resume abc-123$/)
  expect(here).toContain('Nothing changed yet')
  expect(JSON.stringify(state)).toBe(before)
  // A copy of the mod without its launcher (the plugin cache's): the line to run is the plain one, which needs no file, and the launcher is not named.
  state.hasLauncher = false
  const bare = await run('theme cyberpunk-edgerunners here')
  expect(bare.split('\n')[1]).toBe('claude --settings \'{"theme":"custom:cyberpunk-edgerunners"}\' --resume abc-123')
  expect(bare).toContain('pinned to cyberpunk-edgerunners')
  expect(bare.includes('bin/loadout')).toBe(false)
  state.hasLauncher = true
  // Follow, on a terminal that already does; a theme there is not; a theme without a scope: said, and nothing written.
  expect((await run('theme follow')).split('\n')[0]).toBe('Nothing to do: this terminal follows the global theme, and shows it (kirby-pink) at its next start.')
  expect(await run('theme vaporwave all')).toContain('No theme "vaporwave".')
  expect(await run('theme kirby')).toContain('/avatar theme kirby all, or /avatar theme kirby here')
  expect(await run('theme all')).toContain('Say which theme and where')
  expect(JSON.stringify(state)).toBe(before)

  // A settings file that cannot be read as one is left alone, and the command says so.
  state.file = '{ not json'
  const writes = state.writes.length
  expect(await run('theme kirby all')).toContain('Not changed: /home/u/.claude/settings.json could not be read as settings')
  expect([state.file, state.writes.length, live()]).toEqual(['{ not json', writes, 'custom:kirby-pink'])
})

test('/avatar theme on a terminal pinned at its start: the scope says so, "all" changes the others alone, "follow" gives the way back', async ($, on) => {
  mock.clock(on, { now: NOW })
  store(on)
  const { state, user, live } = settings(on, 'custom:kirby')
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  const run = async (args: string) => (await $.command.run(typed(args))).text ?? ''
  expect((await run('theme')).split('\n')[0]).toBe('Theme here: custom:kirby (pinned to this terminal at its start; the global theme is custom:ghostrunner).')
  // The mod's own theming is the theme this session runs under, not the global one.
  expect(await run('status')).toContain('Theme: custom:kirby, by the built-in table (kirby, dark, background #1b2414)')
  const all = await run('theme light all')
  expect(all).toContain('set for the terminals that follow the global theme')
  expect(all).toContain('This one stays on custom:kirby')
  expect([user(), state.sets, live()]).toEqual(['custom:loadout', [], 'light'])
  expect((await run('theme kirby here')).split('\n')[0]).toBe('Nothing to do: this terminal is already pinned to kirby.')
  const follow = await run('theme follow')
  expect(follow.split('\n')[1]).toBe('claude --resume abc-123')
  expect(follow).toContain('follows the global theme (light)')
  expect(await run('status')).toContain('Theme: custom:kirby, by the built-in table')
})

test('/avatar theme where a project\'s or a managed settings file sets the theme: the scope names it, "all" says this terminal stays, "follow" says what to remove', async ($, on) => {
  mock.clock(on, { now: NOW })
  store(on)
  const { user, live } = settings(on, undefined, { local: 'light' })
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  const run = async (args: string) => (await $.command.run(typed(args))).text ?? ''
  expect((await run('theme')).split('\n')[0]).toBe('Theme here: light (set by .claude/settings.local.json of this project).')
  const all = (await run('theme dark all')).split('\n')[0]
  expect(all).toBe('Loadout dark is now the global theme. This terminal stays on light: .claude/settings.local.json of this project sets it.')
  expect([user(), live()]).toEqual(['custom:loadout', 'dark'])
  expect(await run('theme follow')).toContain('Remove the "theme" key there')
  // Here still works from its start: --settings outranks a project's files.
  expect((await run('theme kirby here')).split('\n')[1]).toMatch(/\/bin\/loadout kirby --resume abc-123$/)
})

test('/avatar theme under a managed theme changes nothing and says who sets it; a project file the session does not run under is not blamed', async ($, on) => {
  mock.clock(on, { now: NOW })
  store(on)
  const { state } = settings(on, undefined, { policy: 'dark' })
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  const run = async (args: string) => (await $.command.run(typed(args))).text ?? ''
  expect((await run('theme')).split('\n')[0]).toContain("set by your organization's managed settings")
  for (const ask of ['theme kirby all', 'theme kirby here', 'theme follow']) expect(await run(ask)).toContain('your organization sets the theme')
  expect([state.sets, state.writes]).toEqual([[], []])
  // (A file whose theme the session does not run under is not blamed: the command then says it is the global theme.)
  sessionTheme = 'custom:ghostrunner'
  expect((await run('theme')).split('\n')[0]).toBe('Theme here: custom:ghostrunner (the global theme).')
})

test('the terminal background follows a live theme file\'s source: told at the start, and again when the file is rewritten from another theme', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on, {}, 'custom:loadout-pts7')
  const { told } = terminal(on)
  const files = { 'loadout-pts7.json': liveText('kirby', '{ "base": "dark", "overrides": {} }')!, 'kirby.json': '{}' }
  let stamp = 1
  on('fs.list', (_$, e) => {
    if (!e.path.endsWith('/.claude/themes')) throw new Error('ENOENT')

    return { value: Object.entries(files).map(([name, text]) => ({ name, kind: 'file' as const, size: text.length, mtimeMs: stamp, isLink: false })) }
  })
  on('fs.read', (_$, e) => {
    const text = e.path.includes('/.claude/themes/') ? files[e.path.split('/').pop() as keyof typeof files] : undefined
    if (text === undefined) throw new Error('ENOENT')

    return { value: text }
  })
  on('fs.exists', () => ({ value: false }))
  on('session.usage', () => ({ value: USAGE }))
  on('ui.blit', () => ({ value: {} }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  // Kirby's dark green, from the live file's source: `loadout-pts7` itself is no theme any table knows.
  expect(told()).toEqual([['/dev/pts/7', '#1b2414']])
  expect(await $.command.run(typed('status')).then(got => got.text)).toContain('Theme: custom:kirby, by the built-in table (kirby, dark, background #1b2414)')
  // Rewritten from Ghostrunner (another terminal's "all", or this one's "here"): its dark red within the slow tick.
  files['loadout-pts7.json'] = liveText('ghostrunner', '{ "base": "dark", "overrides": {} }')!
  stamp = 2
  await clock.advance(4400)
  expect(told()).toEqual([['/dev/pts/7', '#1b2414'], ['/dev/pts/7', '#120608']])
  // From a built-in theme: the terminal's own background back.
  files['loadout-pts7.json'] = liveText('dark', null)!
  stamp = 3
  await clock.advance(4400)
  expect(told().at(-1)).toEqual(['/dev/pts/7', ''])
})

// --- Clawd, moving --------------------------------------------------------------------

const ORANGE = 0xd97757
const CLAWD_BOX = (form: (typeof FORMS)[number], scale: number) => [20 * scale + 6, CLAWD[form].frames[0]!.length * scale + HEADROOM] as const
const clawdAt = (form: (typeof FORMS)[number], mood: Mood, now: number, scale = 3) => clawdFrame(form, { mood, now }, ...CLAWD_BOX(form, scale), scale)
const printOf = (canvas: Canvas) => canvas.data.join(',')
const bodyOf = (canvas: Canvas) => [...canvas.data].map(color => color === ORANGE || color === 0x2a1a14).join('')

test('in true pixels the built-in themes\' pane draws Clawd from his parts: the frame of the moment, in the box his sprite has', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  store(on, {}, 'dark')
  kitty(on)
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  const blits: string[] = []
  on('ui.blit', (_$, e) => {
    if (e.key === 'kirby' && 'source' in e && 'rgba' in e.source) blits.push(e.source.rgba)

    return { value: {} }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TALL)
  const { art } = laidOutArt({ family: FAMILIES.clawd as SpriteFamily, form: 'sonnet' }, 0, 34, 60, { w: 9, h: 21 })
  const source = (await ui.find({ key: 'kirby' }))?.props.source as { rgba: string; width: number; height: number }
  expect([source.width, source.height, art!.scale]).toEqual([art!.mascot.width, art!.mascot.height, 3])
  expect(source.rgba).toBe(sourceOf(clawdFrame('sonnet', { mood: 'idle', now: NOW }, art!.mascot.width, art!.mascot.height, 3)).rgba)
  // His frames go on by themselves: over one idle loop, his breathing and each of his moments are sent, a frame only when it changed.
  await clock.advance(CLAWD_LOOP_MS.idle)
  expect(new Set(blits).size).toBeGreaterThan(12)
  blits.forEach((rgba, i) => expect(rgba).not.toBe(blits[i - 1]))
  await ui.unmount()
})

test('Clawd in true pixels: one size, crisp, his sprite exactly at rest, every mood its own loop that closes, the same frame for the same moment', () => {
  const colours = new Set<number>()
  for (const form of FORMS) {
    for (const scale of [1, 2, 3]) {
      const [width, height] = CLAWD_BOX(form, scale)
      // At rest (the idle loop's first moment: a breath not yet drawn) he is his sprite, each pixel `scale` art pixels, stood where the mascot's box stands it.
      const sprite = scaled(mirrored(CLAWD[form].frames[0]!), scale)
      const want = blank(width, height)
      paint(want, sprite, (width - sprite[0]!.length) >> 1, height - sprite.length)
      expect([form, scale, printOf(clawdAt(form, 'idle', 0, scale)) === printOf(want)]).toEqual([form, scale, true])
      for (const mood of MOODS) {
        const loop = CLAWD_LOOP_MS[mood]
        const seen = new Set<string>()
        for (let t = 0; t < loop; t += 90) {
          const frame = clawdAt(form, mood, NOW + t, scale)
          // Always the box's size; nothing of him ever reaches its edge (he is never cut), whatever he does.
          expect([frame.width, frame.height, frame.data.length]).toEqual([width, height, width * height])
          const edge = [...frame.data].some((color, i) => (color === ORANGE || color === 0x2a1a14) && (i % width === 0 || i % width === width - 1))
          if (edge) throw new Error(`${form} x${scale} ${mood} +${t}: cut at the box's edge`)
          for (const color of frame.data) colours.add(color)
          seen.add(printOf(frame))
          // The loop closes: a loop later, the same picture. And a frame is a function of its moment alone.
          if (t % 450 === 0) expect([mood, t, printOf(clawdAt(form, mood, NOW + t + loop, scale)) === printOf(frame), printOf(clawdAt(form, mood, NOW + t, scale)) === printOf(frame)]).toEqual([mood, t, true, true])
        }
        // Drawn in-betweens, not two poses in turn: many different frames a loop (fewer at his smallest, where a third of his pixel is nothing).
        expect([form, scale, mood, seen.size > (scale === 1 ? 4 : 8)]).toEqual([form, scale, mood, true])
      }
    }
  }
  // Crisp: no colour that is not his, his hats' or an effect's own. Nothing blended, on any frame.
  const own = new Set<number>([CLEAR, ORANGE, 0x2a1a14, ...Object.values(CLAWD).flatMap(form => form.frames[0]!.flat().filter((color): color is number => color !== null)), 0xff1784, 0x5ac8fa, 0xd6f1ff, 0x5fd7ff, 0xffd75f, 0xaf87ff, 0x0087af, 0xaf5f00, 0x5f3fd7])
  expect([...colours].filter(color => !own.has(color))).toEqual([])

  // The moods differ, at any moment: by his body alone, whatever flies about him.
  for (const t of [0, 450, 1260, 5000]) expect(new Set(MOODS.map(mood => bodyOf(clawdAt('opus', mood, NOW + t)))).size).toBe(4)
  const all = (mood: Mood) => Array.from({ length: Math.round(CLAWD_LOOP_MS[mood] / 90) }, (_f, i) => clawdAt('opus', mood, i * 90))
  const count = (frame: Canvas, inks: number[]) => frame.data.filter(color => inks.includes(color)).length
  // Idle: he breathes (his top a pixel or two down, and back), blinks (his eyes shut to a line), looks, shuffles, and hops off the ground.
  const idle = all('idle')
  const topOf = (frame: Canvas) => Math.floor(frame.data.findIndex(color => color === ORANGE) / frame.width)
  const feetOf = (frame: Canvas) => Math.floor(frame.data.findLastIndex(color => color === ORANGE) / frame.width)
  const tops = idle.slice(0, 35).map(topOf)
  expect([Math.max(...tops) - Math.min(...tops), tops.every((top, i) => Math.abs(top - (tops[i - 1] ?? top)) <= 1)]).toEqual([2, true])
  expect(Math.min(...idle.map(frame => count(frame, [0x2a1a14])))).toBe(2 * 6 * 3)
  expect(Math.max(...idle.map(frame => count(frame, [0x2a1a14])))).toBe(2 * 6 * 12)
  expect(Math.min(...idle.map(feetOf))).toBeLessThan(idle[0]!.height - 4)
  expect(idle.filter(frame => feetOf(frame) === frame.height - 1).length).toBeGreaterThan(idle.length - 8)
  // Working: his arms strike in turn (each lower than the other for a part of the loop), with sparks; happy: a jump under hearts,
  // squashed and stretched (wider, then taller, than at rest); worried: a tremble aside and a drop of sweat.
  const armOf = (frame: Canvas, x: number) => Array.from({ length: frame.height }, (_r, y) => frame.data[y * frame.width + x]!).lastIndexOf(ORANGE)
  const working = all('working')
  const strikes = working.map(frame => Math.sign(armOf(frame, 4) - armOf(frame, frame.width - 5)))
  expect([strikes.includes(1), strikes.includes(-1), working.some(frame => count(frame, [0x5fd7ff, 0xffd75f, 0xaf87ff]) > 0)]).toEqual([true, true, true])
  // On a light ground the sparks are the same, in colours that read there: nothing else of the frame differs.
  const lit = (t: number) => clawdFrame('opus', { mood: 'working', now: t }, ...CLAWD_BOX('opus', 3), 3, true)
  const [PALE, DEEP] = [[0x5fd7ff, 0xffd75f, 0xaf87ff], [0x0087af, 0xaf5f00, 0x5f3fd7]]
  working.forEach((frame, i) => expect([i, [...lit(i * 90).data].map(color => (DEEP.includes(color) ? PALE[DEEP.indexOf(color)] : color)).join(',') === printOf(frame)]).toEqual([i, true]))
  expect(working.some((_frame, i) => count(lit(i * 90), DEEP) > 0)).toBe(true)
  const happy = all('happy')
  // His hearts are whole, before him: both of them, on every frame they are inside the box (a heart is 46 pixels).
  expect(happy.map(frame => count(frame, [0xff1784])).filter(n => n !== 2 * 46)).toEqual([])
  const widthOf = (frame: Canvas) => Math.max(...Array.from({ length: frame.height }, (_r, y) => [...frame.data.slice(y * frame.width, (y + 1) * frame.width)].filter(color => color === ORANGE).length))
  const tallOf = (frame: Canvas) => feetOf(frame) - topOf(frame) + 1
  expect([Math.min(...happy.map(feetOf)) <= happy[0]!.height - 1 - 8, Math.max(...happy.map(widthOf)) > widthOf(idle[0]!), Math.max(...happy.map(tallOf)) > tallOf(idle[0]!), happy.every(frame => count(frame, [0xff1784]) > 0)]).toEqual([true, true, true, true])
  const worried = all('worried')
  const leftOf = (frame: Canvas) => Math.min(...[...frame.data].flatMap((color, i) => (color === ORANGE ? [i % frame.width] : [])))
  expect([new Set(worried.map(leftOf)).size, worried.some(frame => count(frame, [0x5ac8fa]) > 0), worried.some(frame => count(frame, [0x5ac8fa]) === 0)]).toEqual([3, true, true])

  // A change of mood is eased: at its first moment his body is where the mood before had it, then on its way, then the new mood's own.
  const since = NOW + 1530
  const turn = (ms: number) => bodyOf(clawdFrame('opus', { mood: 'happy', now: since + ms, was: 'idle', since }, ...CLAWD_BOX('opus', 3), 3))
  expect(turn(0)).toBe(bodyOf(clawdAt('opus', 'idle', since)))
  expect([turn(90) !== bodyOf(clawdAt('opus', 'idle', since + 90)), turn(90) !== bodyOf(clawdAt('opus', 'happy', since + 90))]).toEqual([true, true])
  expect(turn(CLAWD_BLEND_MS)).toBe(bodyOf(clawdAt('opus', 'happy', since + CLAWD_BLEND_MS)))
  // At rest between his moments, so a frame in three is enough; never while he blinks, looks, shuffles or hops, nor in another mood.
  const rests = Array.from({ length: 140 }, (_f, i) => isClawdAtRest({ mood: 'idle', now: i * 90 }))
  expect([rests.filter(Boolean).length > 50, rests[0], rests[30], rests[52], rests[76], rests[117], isClawdAtRest({ mood: 'working', now: 0 }), isClawdAtRest({ mood: 'idle', now: 900, was: 'happy', since: 800 })]).toEqual([true, true, false, false, false, false, false, false])
  // (Resting, the frames skipped hold nothing but a pixel of breath.)
  for (let i = 0; i + 3 < 140; i++) if (rests[i] === true) expect([i, Math.abs(topOf(idle[i + 3]!) - topOf(idle[i]!)) <= 1, feetOf(idle[i + 2]!) === idle[0]!.height - 1]).toEqual([i, true, true])
})

test('Clawd\'s minis: a walk of four drawn frames, a fall of its own, a landing squashed flat before the crouch, a slide; Kirby\'s are the game\'s, untouched', () => {
  for (const form of FORMS) {
    const { poses } = clawdMini(0, form)
    const prints = (pose: HiPose) => poses[pose].map(one => JSON.stringify(one.px))
    expect([poses.walk.length, new Set(prints('walk')).size, prints('walk')[1] === prints('stand')[0]]).toEqual([4, 3, true])
    for (const [pose, other] of [['fall', 'jump'], ['slide', 'duck']] as const) expect(prints(pose)[0]).not.toBe(prints(other)[0])
    // The landing: wider than he stands and lower than his crouch, then the crouch.
    const [crouch, flat, stand] = [poses.duck[0]!, poses.duck[1]!, poses.stand[0]!]
    const wideOf = (px: readonly (readonly (number | null)[])[]) => Math.max(...px.map(row => row.filter(color => color === SWAPS[0]![0] || color === SWAPS[0]![1]).length))
    expect([poses.duck.length, wideOf(flat.px) > wideOf(stand.px) - 3, flat.px.length < crouch.px.length || form !== 'opus']).toEqual([2, true, true])
    expect(clawdMini(0).poses.duck[1]!.px.length).toBeLessThan(clawdMini(0).poses.duck[0]!.px.length)
  }
  expect(kirbyMini(0).poses.duck.length).toBe(1)
  // On the stage: dropping in, he falls, lands flat, crouches, stands: four pictures, in that order.
  const body = (ms: number) => {
    const scene = stageFrame(clawdMini, [{ slot: 0, calls: [], joinedAt: NOW }], NOW + ms, 66, 70)
    const rows = Array.from({ length: 70 }, (_r, y) => [...scene.data.slice(y * 66, (y + 1) * 66)].filter(color => color === SWAPS[0]![0]).length)

    return rows.filter(n => n > 0).length
  }
  const [falling, landed, crouched, stood] = [body(1100), body(1230), body(1320), body(1500)]
  expect([landed < crouched, crouched < stood, falling > crouched]).toEqual([true, true, true])
  // And walking, his body bobs a pixel of his on the planted legs.
  expect(clawdMini(0).poses.walk[0]!.px.length).toBe(clawdMini(0).poses.walk[1]!.px.length + 2)
})

test('the chrome skins polish a bar: one colour a cell, a hard light a third of the way along, darker toward the right end', () => {
  const bar = sheen(SKINS.chrome.primary, 20).map(color => Number.parseInt(color.slice(1), 16))
  const lightOf = (color: number) => (color >> 16) + ((color >> 8) & 255) + (color & 255)
  expect([bar.length, sheen(SKINS.chrome.primary, 0), sheen(SKINS.chrome.primary, 1).length]).toEqual([20, [], 1])
  expect(bar.indexOf(bar.reduce((lit, color) => (lightOf(color) > lightOf(lit) ? color : lit)))).toBe(6)
  expect([lightOf(bar[6]!) > lightOf(SKINS.chrome.primary), lightOf(bar[19]!) < lightOf(SKINS.chrome.primary)]).toEqual([true, true])
})

test('the chrome skins draw the model\'s object in ASCII: one size, plain characters, a loop that closes, each model and mood its own, the same drawing by day and by night in each skin\'s colours', () => {
  expect([isChrome(SKINS.chrome), isChrome(SKINS.midnight), isChrome(SKINS.red), isChrome(SKINS.night)]).toEqual([true, true, false, false])
  const drawn = (skin: Skin, form: Form, mood: Mood, now: number, columns = 52, rows = OBJECT_ROWS) => textOf(chromeFrame(skin, form, mood, now, columns, rows)).join('\n')
  const inked = (text: string) => [...text].filter(ch => ch !== ' ' && ch !== '\n').length
  const seen = new Set<string>()
  for (const form of FORMS) {
    for (const mood of ['idle', 'working', 'happy', 'worried'] as const) {
      const grid = chromeFrame(SKINS.midnight, form, mood, 1234, 52, OBJECT_ROWS)
      const text = textOf(grid).join('\n')
      expect([grid.columns, grid.rows, grid.words.length, /^[\x20-\x7e\n]*$/.test(text)]).toEqual([52, OBJECT_ROWS, 52 * OBJECT_ROWS * 3, true])
      // Something is drawn, nothing touches the box's edges at rest, and the pane's ground shows through every cell.
      expect(inked(text)).toBeGreaterThan(60)
      expect(grid.words.filter((_word, i) => i % 3 === 2).every(bg => bg === NONE)).toBe(true)
      seen.add(text)
    }
    // It moves, and a loop ends where it began (an idle loop is 6400 ms).
    expect(drawn(SKINS.midnight, form, 'idle', 0)).not.toBe(drawn(SKINS.midnight, form, 'idle', 600))
    expect(drawn(SKINS.midnight, form, 'idle', 315)).toBe(drawn(SKINS.midnight, form, 'idle', 315 + 6400))
  }
  expect(seen.size).toBe(16)
  // Weight is depth and light: the same characters on both skins, each in its own colours (by day the heaviest is the darkest ink, by night the brightest).
  const [day, night] = [chromeFrame(SKINS.chrome, 'fable', 'idle', 600, 52, OBJECT_ROWS), chromeFrame(SKINS.midnight, 'fable', 'idle', 600, 52, OBJECT_ROWS)]
  expect(textOf(day)).toEqual(textOf(night))
  const inks = (grid: Grid) => new Set(grid.words.filter((_word, i) => i % 3 === 1 && grid.words[i - 1] !== 0x20))
  expect([inks(day).has(SKINS.chrome.bright), inks(night).has(SKINS.midnight.bright), [...inks(day)].some(ink => inks(night).has(ink))]).toEqual([true, true, false])
  // Where a part passes in front of another, the cells behind its edge are left empty: Halo's rings never run into its core.
  expect(textOf(night).some(line => /\S \S/.test(line))).toBe(true)
  // Any size is drawn, none throws: a pane of a few rows, of none.
  expect([textOf(chromeFrame(SKINS.chrome, 'opus', 'idle', 0, 30, 6)).length, chromeFrame(SKINS.chrome, 'opus', 'idle', 0, 30, 0).words.length]).toEqual([6, 0])
  // The layout gives it its rows where the pane has them, a mask's place otherwise.
  expect([laidOutText({ skin: SKINS.chrome, form: 'opus' }, 0, 53, 60, true).size, laidOutText({ skin: SKINS.red, form: 'opus' }, 0, 53, 60, true).size]).toEqual([{ columns: 52, rows: OBJECT_ROWS }, { columns: 52, rows: MASK_ROWS }])
})

test('the Halo skins draw their figure in pixels, two to a cell: Cortana by day, the Chief\'s helmet by night, each acting out the call that runs, in its own colours per model', () => {
  expect([isHalo(SKINS.cortana), isHalo(SKINS.mjolnir), isHalo(SKINS.chrome), isHalo(SKINS.red)]).toEqual([true, true, false, false])
  // A running call's kind is the cue; a failed one is a worry, an ended one leaves the mood.
  expect([cueOf('idle'), cueOf('working'), cueOf('working', 'scan'), cueOf('working', 'think'), cueOf('idle', 'fail'), cueOf('happy', 'done')]).toEqual(['idle', 'working', 'scan', 'working', 'worried', 'happy'])
  const CUES: readonly (readonly [Mood, State?])[] = [['idle'], ['working'], ['happy'], ['worried'], ['working', 'scan'], ['working', 'edit'], ['working', 'exec'], ['working', 'net'], ['working', 'call'], ['working', 'load'], ['working', 'ask'], ['working', 'tool']]
  const seen = new Set<string>()
  for (const skin of [SKINS.cortana, SKINS.mjolnir]) {
    for (const [mood, doing] of CUES) {
      const grid = haloFrame(skin, 'opus', mood, 1234, 52, OBJECT_ROWS, doing)
      const text = textOf(grid).join('\n')
      expect([grid.columns, grid.rows, grid.words.length, /^[\x20-\x7e\n\u2580\u2584]*$/.test(text)]).toEqual([52, OBJECT_ROWS, 52 * OBJECT_ROWS * 3, true])
      // A figure is drawn, the pane's ground shows around it (an empty cell has no colour of its own), and the same moment is the same drawing.
      expect([...text].filter(ch => ch !== ' ' && ch !== '\n').length).toBeGreaterThan(150)
      expect(grid.words.every((word, i) => i % 3 !== 0 || word !== 0x20 || grid.words[i + 2] === NONE)).toBe(true)
      expect(grid.words.filter((_word, i) => i % 3 === 2).some(bg => bg === NONE)).toBe(true)
      expect(haloFrame(skin, 'opus', mood, 1234, 52, OBJECT_ROWS, doing).words).toEqual(grid.words)
      seen.add(text)
    }
    // It moves at rest; another model is the same figure in another hue.
    expect(textOf(haloFrame(skin, 'opus', 'idle', 0, 52, OBJECT_ROWS))).not.toEqual(textOf(haloFrame(skin, 'opus', 'idle', 1600, 52, OBJECT_ROWS)))
    const [opus, sonnet] = [haloFrame(skin, 'opus', 'idle', 600, 52, OBJECT_ROWS), haloFrame(skin, 'sonnet', 'idle', 600, 52, OBJECT_ROWS)]
    expect([textOf(opus).join(), opus.words.join() === sonnet.words.join()]).toEqual([textOf(sonnet).join(), false])
    // Out of one cue into the next: half way it is neither, and once eased it is the new one.
    const [was, half, there] = [haloFrame(skin, 'opus', 'idle', 5000, 52, OBJECT_ROWS), haloFrame(skin, 'opus', 'working', 5000, 52, OBJECT_ROWS, 'ask', { cue: 'idle', at: 4800 }), haloFrame(skin, 'opus', 'working', 5000, 52, OBJECT_ROWS, 'ask')]
    expect([textOf(half).join() !== textOf(was).join(), textOf(half).join() !== textOf(there).join()]).toEqual([true, true])
    expect(haloFrame(skin, 'opus', 'working', 5000, 52, OBJECT_ROWS, 'ask', { cue: 'idle', at: 1000 }).words).toEqual(there.words)
    // Any size is drawn, none throws.
    expect([textOf(haloFrame(skin, 'opus', 'idle', 0, 30, 6)).length, haloFrame(skin, 'opus', 'idle', 0, 30, 0).words.length]).toEqual([6, 0])
    expect(laidOutText({ skin, form: 'opus' }, 0, 53, 60, true).size).toEqual({ columns: 52, rows: OBJECT_ROWS })
  }
  // Each cue is its own picture, for her and for him.
  expect(seen.size).toBe(2 * CUES.length)
  // The pane's own drawing remembers the cue before: the first frame after a change is still near the old pose.
  haloLive(SKINS.mjolnir, 'opus', 'idle', 9000, 52, OBJECT_ROWS)
  expect(textOf(haloLive(SKINS.mjolnir, 'opus', 'working', 9010, 52, OBJECT_ROWS, 'net'))).not.toEqual(textOf(haloFrame(SKINS.mjolnir, 'opus', 'working', 9010, 52, OBJECT_ROWS, 'net')))
  // A light pack of the family is Cortana and her kind, a dark one the Chief and Blue Team, each in its skin.
  const packs = packsIn({ ...PACK_TEXTS, 'halo.json': packText('halo', { family: 'halo' }, '#f1f0fa', { isLight: true }), 'halo-dark.json': packText('halo-dark', { family: 'halo', skin: skinText(SKINS.mjolnir) }, '#0b100d') }).packs
  const [day, dark] = ['custom:halo', 'custom:halo-dark'].map(theme => themed(theme, packs)) as [ReturnType<typeof themed>, ReturnType<typeof themed>]
  expect([day.family === FAMILIES.halo, dark.family === FAMILIES['halo-dark'], day.isLight, dark.isLight]).toEqual([true, true, true, false])
  expect(FORMS.map(form => [nameOf({ family: day.family, form }), nameOf({ family: dark.family, form })])).toEqual([['CORTANA', 'MASTER CHIEF'], ['THE WEAPON', 'KELLY-087'], ['SERINA', 'LINDA-058'], ['ISABEL', 'FRED-104']])
  expect(packOf(packText('x', { family: 'halo', variant: 'red' }, '#000000'), 'x.json')).toBe('avatar.variant: red or yellow, for cyber alone')
})
