// The handoff's pane on the handoff's own run: what it draws, in which colours, and what its keys do.
import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { cells, compose, isSeg, widthOf } from '../hooks/draw'
import type { Line } from '../hooks/draw'
import { chart, newRun, runView } from '../hooks/lib'
import { contrast, PALETTES, paletteOf } from '../hooks/palette'
import type { Palette, PaletteName } from '../hooks/palette'
import { engine, HIST, inAgent, lines, midflight, notify, paint, pane, SCRIPT, spawn } from './kit'
import type { Node, Run } from './kit'
import type { Agent, View } from '../../types'

const P = PALETTES.handoff
type Dollar = Parameters<TestBody>[0]
type Ui = { drawn: () => Promise<unknown>; findAll: (q: { type: string }) => Promise<{ key: string | undefined; text: string; props: Record<string, unknown> }[]> }
const painted = async (ui: Ui) => paint((await ui.drawn()) as Node)
const text = async (ui: Ui) => lines((await ui.drawn()) as Node).map(l => l.trimEnd())
const row = (all: Run[][], part: string | RegExp) => all.find(line => (typeof part === 'string' ? line.map(r => r.t).join('').includes(part) : part.test(line.map(r => r.t).join('')))) ?? []
const cell = (line: Run[], part: string) => line.find(r => r.t.includes(part))
/** The agents' Buttons in the order drawn: code-review, art-director, polish, sprites. */
const agents = async (ui: Ui) => (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('ag:')).map(b => b.key ?? '')
const [CODE, POLISH, SPRITES] = [0, 2, 3] as const
const keyOf = async (ui: Ui, at: number) => (await agents(ui))[at] ?? ''
const BAND = { plugin: 'loadout', surface: 'terminal', component: 'AbovePrompt', requestId: 'band', props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} } } as const
const flight = async ($: Dollar, on: Parameters<TestBody>[1], columns = 56, rows = 44, theme = 'dark') => {
  const kit = engine(on, { theme, hist: HIST })
  const { land } = await midflight($, kit)
  return { ...kit, land, ui: await $.ui.mount(pane(columns, rows)) }
}

test('the summary box: ETA, elapsed and tokens out, the phase it is in, and the gradient bar with its bold percent', async ($, on) => {
  const { ui, land } = await flight($, on)
  const seen = await text(ui)
  expect(seen.slice(0, 6)).toEqual([
    '  ╭─ workflow kirby-polish ────────────── phase 2/5 ─╮',
    '  │ ETA             ELAPSED         TOKENS OUT       │',
    // What is left of the polish phase (4m 53s of a 22m 10s agent) and the three phases to come (7m, 5m 40s, 3m).
    '  │ 20m 33s         24m 17s         87.9k            │',
    '  │                                                  │',
    // One phase done and the running one at (78% + 99%) / 2, over five phases.
    '  │ ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■   38% │',
    '  ╰──────────────────────────────────────────────────╯',
  ])
  const all = await painted(ui)
  // The handoff's title in cyan, then the run's own name, dim.
  expect(cell(row(all, '╭─ workflow'), 'workflow')?.c).toBe(P.cyan)
  expect(cell(row(all, '╭─ workflow'), 'kirby-polish')?.c).toBe(P.text3)
  expect(cell(row(all, '╭─ workflow'), 'phase 2/5')?.c).toBe(P.text3)
  expect(cell(row(all, '│ ETA'), 'ETA')?.c).toBe(P.text3)
  expect(cell(row(all, '20m 33s'), '20m 33s')).toMatchObject({ c: P.fg, b: true })
  expect(cell(row(all, '20m 33s'), '87.9k')).toMatchObject({ c: P.blue, b: true })
  // Elapsed is the one value that is not bold.
  expect(cell(row(all, '20m 33s'), '24m 17s')?.b).toBeUndefined()
  // The bar: 42 cells, the first 15 filled, each its own colour from cyan toward green, the rest the track.
  const bar = row(all, '38%').filter(r => r.t.includes('■'))
  expect(bar.reduce((n, r) => n + r.t.length, 0)).toBe(42)
  expect(bar.slice(0, -1).map(r => r.t)).toEqual(Array.from({ length: 15 }, () => '■'))
  expect(bar[0]?.c).toBe(P.cyan)
  expect(new Set(bar.map(r => r.c)).size).toBe(16)
  expect(bar[bar.length - 1]).toMatchObject({ c: P.track, t: '■'.repeat(27) })
  expect(cell(row(all, '38%'), '38%')).toMatchObject({ c: P.fg, b: true })
  await ui.unmount()
  await land()
})
test('each phase state has its node, its colours, its time and its rail', async ($, on) => {
  const { ui, clock, land } = await flight($, on)
  let seen = await text(ui)
  let all = await painted(ui)
  // Done: a grey dot, its duration, a solid green rail.
  expect(seen).toContain('  ●  review ×2                                  7m 00s')
  expect(cell(row(all, '●  review'), '●')).toMatchObject({ c: P.text2 })
  expect(cell(row(all, '●  review'), '×2')?.c).toBe(P.text4)
  expect(cell(row(all, '●  review'), '7m 00s')?.c).toBe(P.text3)
  expect(cell(row(all, /^ {2}│ {2}code-review/), '│')?.c).toBe(P.railDone)
  // Running: the spinner, yellow and bold, its elapsed time, a dashed rail.
  expect(seen.some(l => /^ {2}[◐◓◑◒] {2}polish ×2 +17m 17s$/.test(l))).toBe(true)
  expect(cell(row(all, /polish ×2/), 'polish')).toMatchObject({ c: P.yellow, b: true })
  expect(cell(row(all, /polish ×2/), '17m 17s')?.c).toBe(P.fg)
  expect(cell(row(all, /^ {2}┆ {2}╭/), '┆')?.c).toBe(P.railRun)
  // Pending: a hollow node, no count, the estimate from history, a dashed grey rail; the last phase has no rail.
  expect(seen.slice(seen.indexOf('  ○  review                                    ~7m 00s'))).toEqual(expect.arrayContaining([
    '  ○  review                                    ~7m 00s', '  ┆', '  ○  polish                                    ~5m 40s', '  ┆', '  ○  ship                                      ~3m 00s',
  ]))
  expect(cell(row(all, '○  ship'), 'ship')?.c).toBe(P.text4)
  expect(cell(row(all, '○  ship'), '~3m 00s')?.c).toBe(P.text4)
  expect(cell(all[all.findIndex(l => l.map(r => r.t).join('').includes('○  review')) + 1] ?? [], '┆')?.c).toBe(P.border)
  // The spinner turns every 450 ms.
  const frames = new Set<string>()
  for (let i = 0; i < 4; i++) {
    frames.add((await text(ui)).find(l => /polish ×2/.test(l))?.[2] ?? '')
    await clock.advance(450)
  }
  expect([...frames].sort()).toEqual(['◐', '◑', '◒', '◓'])

  // Stopped: x, then y. The run's task is stopped; the ETA reads a red dash at once.
  await ui.press({ key: 'key:x' })
  await clock.advance(1_000)
  await ui.press({ key: 'stop:yes' })
  expect(cell(row(await painted(ui), /│ —\s/), '—')).toMatchObject({ c: P.red, b: true })
  // TaskStop said the task is stopped: the run is over at once, with no notification, and its diagram stays on screen
  // as it ended, with no Button to open or close it.
  const frozen = (await text(ui))[2]
  await clock.advance(30_000)
  expect((await text(ui))[2]).toBe(frozen)
  expect((await text(ui))[0]).toMatch(/╭─ workflow kirby-polish /)
  expect((await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('run:'))).toEqual([])
  // The notification that may follow changes nothing.
  await $.prompt.submit(notify('killed'))
  seen = await text(ui)
  all = await painted(ui)
  expect(seen).toContain('  ■  polish ×2                                 stopped')
  expect(cell(row(all, '■  polish'), 'polish')).toMatchObject({ c: P.red, b: true })
  expect(seen.some(l => /^ {2}┆ {2}polish:round-1 +━+ {2}■ {2}24\.3k$/.test(l))).toBe(true)
  expect(cell(row(all, /polish:round-1 /), '━')?.c).toBe(P.red)
  // On hold: every phase after it.
  expect(seen.filter(l => /^ {2}○ {2}\w+ +on hold$/.test(l))).toHaveLength(3)
  expect(cell(row(all, 'on hold'), 'on hold')?.c).toBe(P.text4)
  // The title still counts the phases: that it was stopped is the ETA's red dash and the phase's word.
  expect(seen[0]).toMatch(/ phase 2\/5 ─╮$/)
  expect(cell(row(all, /│ —\s/), '—')).toMatchObject({ c: P.red, b: true })
  await ui.unmount()
  await land()
})
test('compact rows share one name column, so every bar starts at the same column', async ($, on) => {
  const kit = engine(on)
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT })
  for (const [n, label] of [[1, 'a'], [2, 'a much longer agent name than twenty-two cells'], [3, 'review auth']] as const) await $.agent.spawn(spawn(n, label))
  for (const n of [1, 2, 3]) await $.turn.complete({ reason: n === 3 ? 'error' : 'answer', answer: '', agentId: `agent-${n}` } as never)
  await $.agent.spawn(spawn(4, 'write the report'))
  for (const [columns, hasBar] of [[96, true], [56, true], [44, false], [34, false]] as const) {
    const ui = await $.ui.mount(pane(columns, 60))
    const rows = (await text(ui)).filter(l => /[✓■] +\d+$/.test(l))
    expect(rows).toHaveLength(3)
    // A long name is cut with an ellipsis, to 22 cells at most; the mark and the tokens end every row at the same column.
    const long = rows.map(l => l.match(/a much longer[^…]*…/)?.[0] ?? '').find(n => n !== '') ?? ''
    expect([columns, long.length >= 18 && long.length <= 22]).toEqual([columns, true])
    expect(new Set(rows.map(l => l.length)).size).toBe(1)
    // The thin bar is what goes first when the pane narrows.
    expect(new Set(rows.map(l => l.indexOf('━'))).size).toBe(1)
    expect(rows[0]?.includes('━')).toBe(hasBar)
    await ui.unmount()
  }
  void kit
})

test('a running agent\'s card: name, percent, gradient bar, the action by tool kind, eta or over, tokens out, tools, elapsed', async ($, on) => {
  const { ui, clock, world, land } = await flight($, on)
  // A long wait is made with the pane off screen, so the test does not draw every beat of it.
  const wait = async (ms: number) => {
    world.isUp = false
    await clock.advance(ms)
    world.isUp = true
    await clock.advance(1_200)
  }
  const seen = await text(ui)
  const at = seen.findIndex(l => /│ polish:round-1 /.test(l))
  expect(seen.slice(at - 1, at + 5)).toEqual([
    '  ┆  ╭───────────────────────────────────────────────╮',
    '  ┆  │ polish:round-1                            78% │',
    '  ┆  │ ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ │',
    '  ┆  │ ▸ editing hud.tsx                  eta 4m 53s │',
    '  ┆  │ ↓ 24.3k out   4 tools                 17m 17s │',
    '  ┆  ╰───────────────────────────────────────────────╯',
  ])
  let all = await painted(ui)
  expect(cell(row(all, '78%'), '78%')).toMatchObject({ c: P.yellow, b: true })
  expect(cell(row(all, '78%'), 'polish:round-1')).toMatchObject({ c: P.fg, b: true })
  // An edit is yellow; the eta is dim; the arrow of tokens out is blue.
  expect(cell(row(all, '▸ editing'), '▸ editing hud.tsx')?.c).toBe(P.yellow)
  expect(cell(row(all, '▸ editing'), 'eta 4m 53s')?.c).toBe(P.text2)
  expect(cell(row(all, '↓ 24.3k'), '↓')?.c).toBe(P.blue)
  expect(cell(row(all, '↓ 24.3k'), '24.3k out')?.c).toBe(P.text3)
  // The card's bar: 45 cells, 78% of them filled from cyan through green.
  const bar = all[all.findIndex(l => l.some(r => r.t.includes('78%'))) + 1]?.filter(r => r.t.includes('■')) ?? []
  expect(bar.filter(r => r.c !== P.track)).toHaveLength(35)
  expect(bar[0]?.c).toBe(P.cyan)
  expect(bar[bar.length - 1]).toMatchObject({ c: P.track, t: '■'.repeat(10) })
  // The other agent searches (blue) and is past its 12m estimate: orange, and its bar reaches the gradient's yellow end.
  expect(cell(row(all, '▸ searching'), '▸ searching "floatSpeed"')?.c).toBe(P.blue)
  expect(cell(row(all, '▸ searching'), '+5m 17s over')?.c).toBe(P.orange)
  expect(seen.some(l => /│ sprites:round-1 +99% │$/.test(l))).toBe(true)

  // The other kinds, as each tool starts on the second agent: read, write, shell; then none.
  await wait(31_000)
  for (const [call, shown, hue] of [
    [{ tool: 'Read', file_path: '/repo/src/sprites/kirby.ts' }, '▸ reading kirby.ts', P.blue],
    [{ tool: 'Write', file_path: '/repo/assets/levels/1-1.json', content: '{}' }, '▸ writing 1-1.json', P.yellow],
    [{ tool: 'Bash', command: 'pnpm lint' }, '▸ running pnpm lint', P.violet],
  ] as const) {
    const running = inAgent($, 'agent-4', { ...call, tool_use_id: shown })
    await clock.advance(500)
    all = await painted(ui)
    expect(cell(row(all, shown), shown)?.c).toBe(hue)
    await wait(31_000)
    await running
  }
  expect(cell(row(await painted(ui), '∴ thinking'), '∴ thinking')?.c).toBe(P.text3)
  await ui.unmount()
  await land()
})
test('an agent of the running phase that has not started is a compact row with a dim dot, and the phase counts it', async ($, on) => {
  const kit = engine(on, { hist: HIST })
  const { land } = await midflight($, kit)
  let release = () => {}
  kit.world.held.set(9, new Promise<void>(done => { release = done }))
  const late = $.agent.spawn(spawn(9, 'polish:round-1', 'Polish the build of round 1'))
  await kit.clock.advance(1_000)
  const ui = await $.ui.mount(pane(56, 48))
  const seen = await text(ui)
  expect(seen.some(l => /^ {2}[◐◓◑◒] {2}polish ×3 /.test(l))).toBe(true)
  expect(seen.some(l => /^ {2}┆ {2}polish:round-1 +━+ {2}· +0$/.test(l))).toBe(true)
  const queued = row(await painted(ui), /polish:round-1 +━/)
  expect(cell(queued, '·')?.c).toBe(P.text4)
  expect(queued.filter(r => r.t.includes('━')).every(r => r.c === P.track)).toBe(true)
  await ui.unmount()
  release()
  await late
  await land()
})

test('with no history: "eta —", no percent, and a bar that only walks', async ($, on) => {
  const { clock, world } = engine(on)
  world.isUp = true
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT })
  await $.agent.spawn(spawn(1, 'scan the repo'))
  const ui = await $.ui.mount(pane(56, 30))
  await clock.advance(30_000)
  const seen = await text(ui)
  expect(seen.some(l => /│ scan the repo +│$/.test(l))).toBe(true)
  expect(seen.some(l => /│ ∴ thinking +eta — │$/.test(l))).toBe(true)
  expect(seen.some(l => /│ — +30s +0 +│$/.test(l))).toBe(true)
  expect(seen.some(l => / 0% │$/.test(l))).toBe(true)
  const lit = async () => (await painted(ui))[10]?.filter(r => r.t.includes('■') && r.c !== P.track).reduce((n, r) => n + r.t.length, 0)
  const where = async () => (await painted(ui))[10]?.map(r => r.t).join('').length
  expect(await lit()).toBeLessThanOrEqual(3)
  expect(await lit()).toBeGreaterThan(0)
  expect(await where()).toBe(56)
  await ui.unmount()
})

test('selection: the first running agent by default, j and k move it, the ring moving onto a row selects it', async ($, on) => {
  const { ui, land } = await flight($, on)
  const keys = (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('ag:'))
  // A finished agent's Button is its name; a running one's, its tool count.
  expect(keys.map(b => b.text)).toEqual(['code-review:round-1', 'art-director:round-1', '4 tools', '1 tool'])
  const edgeOf = async (name: string) => cell(row(await painted(ui), new RegExp(`│ ${name} `)), '│')?.c
  const backOf = async (name: string) => row(await painted(ui), new RegExp(`[│┆] {2}${name}`)).find(r => r.kind === 'button')?.bg
  // By default the first running agent is selected: its card's border is yellow, and the ring starts on it.
  expect(await edgeOf('polish:round-1')).toBe(P.yellow)
  expect(await edgeOf('sprites:round-1')).toBe(P.cardBorder)
  expect(keys.map(b => b.props.autoFocus)).toEqual([undefined, undefined, true, undefined])
  // j moves down, and stops at the last.
  await ui.press({ key: 'key:j' })
  await ui.press({ key: 'key:j' })
  expect(await edgeOf('sprites:round-1')).toBe(P.yellow)
  expect(await edgeOf('polish:round-1')).toBe(P.cardBorder)
  // k moves up onto a finished agent's row: its whole row takes the selection's background.
  for (let i = 0; i < 2; i++) await ui.press({ key: 'key:k' })
  expect(await backOf('art-director:round-1')).toBe(P.select)
  expect(await backOf('code-review:round-1')).toBe(P.bg)
  expect(row(await painted(ui), /art-director:round-1/).filter(r => r.bg === P.select).reduce((n, r) => n + r.t.length, 0)).toBe(49)
  // Tab or a click moves the engine's ring: the row it lands on is the selection.
  await $.ui.focus({ component: 'Pane', requestId: 'flow-map', plugin: 'loadout', element: keys[0]?.key ?? '', origin: { kind: 'person' } } as never)
  expect(await backOf('code-review:round-1')).toBe(P.select)
  await ui.unmount()
  await land()
})
test('⏎ on an agent opens its last 5 tool calls, newest first, and closes them again', async ($, on) => {
  const { ui, clock, land } = await flight($, on)
  const key = await keyOf(ui, POLISH)
  for (const n of [1, 2]) {
    const read = inAgent($, 'agent-3', { tool: 'Read', tool_use_id: `more-${n}`, file_path: `/repo/src/scenes/title-${n}.ts` })
    await clock.advance(1_000)
    await read
  }
  await ui.press({ key })
  const seen = await text(ui)
  const at = seen.findIndex(l => /┄{45}/.test(l))
  expect(seen.slice(at, at + 7)).toEqual([
    '  ┆  │ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │',
    // The call still running has no duration yet; the oldest, a Read of kirby.ts, no longer fits in five.
    '  ┆  │ Edit  hud.tsx                               … │',
    '  ┆  │ Read  title-2.ts                         1.0s │',
    '  ┆  │ Read  title-1.ts                         1.0s │',
    '  ┆  │ Edit  float.ts                           2.0s │',
    '  ┆  │ Bash  pnpm test                          5.0s │',
    '  ┆  ╰───────────────────────────────────────────────╯',
  ])
  const all = await painted(ui)
  // The tool in its colour, red for the Edit that failed; the target and the duration dim.
  expect(cell(row(all, 'Edit  hud.tsx'), 'Edit')?.c).toBe(P.yellow)
  expect(cell(row(all, 'Edit  float.ts'), 'Edit')?.c).toBe(P.red)
  expect(cell(row(all, 'Bash  pnpm test'), 'Bash')?.c).toBe(P.violet)
  expect(cell(row(all, 'Read  title-2.ts'), 'Read')?.c).toBe(P.blue)
  expect(cell(row(all, 'Read  title-2.ts'), 'title-2.ts')?.c).toBe(P.text2)
  expect(cell(row(all, 'Read  title-2.ts'), '1.0s')?.c).toBe(P.text4)
  // A finished agent's calls show under its row, behind a guide.
  await ui.press({ key: await keyOf(ui, CODE) })
  expect(await text(ui)).toContain('  │  │ Read  title.ts                             1.0s')
  await ui.press({ key })
  expect((await text(ui)).some(l => /┄/.test(l))).toBe(false)
  await ui.unmount()
  await land()
})
test('s steers the selected running agent: the footer becomes a field, Enter sends the text to the agent and marks it', async ($, on) => {
  const { ui, world, clock, land } = await flight($, on)
  // The footer: the handoff's one row under the divider, which carries the keys the row has no room for.
  expect((await text(ui)).slice(-2)).toEqual(['───────────── k: ↑  j: ↓  f: fold  n: narrow  w: wide ──', '  ↑↓ select  ⏎ actions  s: steer  x: stop  z: hide'])
  const foot = (await painted(ui)).slice(-2)
  expect(cell(foot[0] ?? [], '─')?.c).toBe(P.track)
  expect(cell(foot[1] ?? [], '↑↓')).toMatchObject({ c: P.fg, b: true })
  expect(cell(foot[1] ?? [], ' select')?.c).toBe(P.text3)
  await ui.press({ key: 'key:s' })
  let seen = await text(ui)
  expect(seen.slice(-2)).toEqual([`${'─'.repeat(33)} esc, then c: cancel ──`, '  steer polish:round-1 › ▌'])
  expect(cell(row(await painted(ui), 'steer polish'), 'steer polish:round-1 ›')?.c).toBe(P.blue)
  // An empty Enter sends nothing and leaves the field.
  await $.ui.input({ plugin: 'loadout', key: 'steer', text: '   ' })
  expect(world.sent).toEqual([])
  expect((await text(ui)).some(l => /steer polish/.test(l))).toBe(false)
  // Enter with text: delivered to the agent by its id, and the card shows the mark.
  await ui.press({ key: 'key:s' })
  await $.ui.input({ plugin: 'loadout', key: 'steer', text: 'keep the palette at 4 colours' })
  expect(world.sent).toEqual([{ to: 'agent-3', text: 'keep the palette at 4 colours' }])
  seen = await text(ui)
  expect(seen.some(l => /│ polish:round-1 ↳ +78% │$/.test(l))).toBe(true)
  expect(cell(row(await painted(ui), 'polish:round-1 ↳'), '↳')?.c).toBe(P.blue)
  expect(seen.slice(-1)).toEqual(['  ↑↓ select  ⏎ actions  s: steer  x: stop  z: hide'])
  // Once its tool call ended, the steered agent's line quotes the message.
  world.isUp = false
  await clock.advance(31_000)
  world.isUp = true
  await clock.advance(1_200)
  expect(cell(row(await painted(ui), '↳ "keep'), '↳ "keep')?.c).toBe(P.blue)
  // With another agent selected, s steers that one; a message the engine does not deliver leaves no mark and says why.
  await ui.press({ key: 'key:j' })
  await ui.press({ key: 'key:s' })
  expect((await text(ui)).some(l => /steer sprites:round-1 ›/.test(l))).toBe(true)
  world.isDelivered = false
  await $.ui.input({ plugin: 'loadout', key: 'steer', text: 'stop' })
  expect(world.sent[1]).toEqual({ to: 'agent-4', text: 'stop' })
  expect((await text(ui)).some(l => /sprites:round-1 ↳/.test(l))).toBe(false)
  expect(world.toasts.some(t => /not delivered to sprites:round-1: the recipient is gone/.test(t))).toBe(true)
  // Cancel leaves the field too.
  await ui.press({ key: 'key:s' })
  await ui.press({ key: 'steer:cancel' })
  expect((await text(ui)).some(l => /steer \S+ ›/.test(l))).toBe(false)
  await ui.unmount()
  await land()
})
test('x asks before it stops: only y, on a question that is showing, stops the run; nothing else does', async ($, on) => {
  const { ui, world, clock, land } = await flight($, on)
  // Nothing is stopped by x itself: the footer asks.
  await ui.press({ key: 'key:x' })
  expect((await text(ui)).slice(-2)).toEqual(['─'.repeat(56), '  stop kirby-polish?  2 running  y: yes  n: no'])
  expect(cell(row(await painted(ui), 'stop kirby-polish?'), 'stop kirby-polish?')).toMatchObject({ c: P.red, b: true })
  expect(world.stopped).toEqual([])
  // A y in the same instant (a held key, a double Enter) is not an answer.
  await ui.press({ key: 'stop:yes' })
  expect(world.stopped).toEqual([])
  // n takes the question down; the hints are back, and no y Button is left to press.
  await ui.press({ key: 'stop:no' })
  expect((await ui.findAll({ type: 'Button' })).some(b => b.key === 'stop:yes')).toBe(false)
  expect((await text(ui)).slice(-1)[0]).toMatch(/x: stop {2}z: hide$/)
  // While it asks, no other key is drawn anywhere in the pane, so no stray j, s, f or z does anything; the ring starts on "no". Pressing an agent takes the question down.
  await ui.press({ key: 'key:x' })
  await clock.advance(1_000)
  expect((await ui.findAll({ type: 'Button' })).map(b => b.props.hotkey).filter(k => k !== undefined).sort()).toEqual(['n', 'y'])
  expect((await ui.findAll({ type: 'Button' })).filter(b => b.props.autoFocus === true).map(b => b.key)).toEqual(['stop:no'])
  await ui.press({ key: await keyOf(ui, SPRITES) })
  expect((await ui.findAll({ type: 'Button' })).some(b => b.key === 'stop:yes')).toBe(false)
  // So does the ring leaving the question for another element (Tab, a click).
  await ui.press({ key: 'key:x' })
  await $.ui.focus({ component: 'Pane', requestId: 'flow-map', plugin: 'loadout', element: await keyOf(ui, CODE), origin: { kind: 'person' } } as never)
  expect((await ui.findAll({ type: 'Button' })).some(b => b.key === 'stop:yes')).toBe(false)
  // The question goes away by itself after 15 seconds.
  await ui.press({ key: 'key:x' })
  await clock.advance(16_000)
  expect((await ui.findAll({ type: 'Button' })).some(b => b.key === 'stop:yes')).toBe(false)
  expect(world.stopped).toEqual([])
  // Asked and answered y: the run's task is stopped through the engine's TaskStop tool.
  await ui.press({ key: 'key:x' })
  await clock.advance(1_000)
  await ui.press({ key: 'stop:yes' })
  expect(world.stopped).toEqual(['task-9'])
  // A run being stopped offers no second stop.
  expect((await ui.findAll({ type: 'Button' })).some(b => b.key === 'key:x')).toBe(false)
  await ui.unmount()

  // A pane that does not hold the keyboard does not show the question at all.
  const idle = await $.ui.mount(pane(56, 44, false))
  expect((await idle.findAll({ type: 'Button' })).some(b => b.key === 'stop:yes')).toBe(false)
  await idle.unmount()
  await land()
})
test('z folds the pane to one tab above the prompt, and the tab restores it', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['the band beneath'] }) as never)
  const { ui, world, land } = await flight($, on)
  // Not folded: the band is left to whoever else draws there.
  const before = await $.ui.mount(BAND)
  expect(await before.drawn()).toMatchObject({ type: 'Text', children: ['the band beneath'] })
  await before.unmount()

  await ui.press({ key: 'key:z' })
  expect(world.closed).toBe(1)
  const band = await $.ui.mount(BAND)
  const tab = lines((await band.drawn()) as Node)
  expect(tab.slice(0, 3)).toEqual([
    '╭───────────────────────────────────────╮',
    '│ ◐ flow map  38%  eta 20m 33s  z: show │'.replace('◐', tab[1]?.[2] ?? ''),
    '╰───────────────────────────────────────╯',
  ])
  expect('◐◓◑◒').toContain(tab[1]?.[2] ?? 'x')
  // What else draws in the band stays, beneath the tab.
  expect(tab[3]).toBe('the band beneath')
  const all = paint((await band.drawn()) as Node)
  expect(cell(all[1] ?? [], 'flow map')?.c).toBe(P.cyan)
  expect(cell(all[1] ?? [], '38%')).toMatchObject({ c: P.fg, b: true })
  expect(cell(all[1] ?? [], 'eta')?.c).toBe(P.text3)
  expect(all[1]?.[1]?.c).toBe(P.yellow)
  // The band is not the pane: it paints no background of its own.
  expect(all.flat().some(r => r.bg !== undefined)).toBe(false)
  // The tab's Button (z while the band holds the keys, or a click) opens the pane again, with the keyboard.
  await band.press({ key: 'show' })
  expect(world.opened).toEqual([56])
  expect(await band.drawn()).toMatchObject({ type: 'Text', children: ['the band beneath'] })
  await band.unmount()
  await ui.unmount()
  await land()
})
test('n and w ask the dock for 5 columns less or more than the pane has, between 34 and 96; an ask the dock did not take is said, and never adds up', async ($, on) => {
  const kit = engine(on, { hist: HIST })
  const { land } = await midflight($, kit)
  const { world, clock } = kit
  const at = async (columns: number, key: 'key:n' | 'key:w') => {
    const ui = await $.ui.mount(pane(columns, 44))
    await ui.press({ key })
    await ui.unmount()
  }
  // Each ask starts from the width the pane has.
  await at(56, 'key:w')
  await at(61, 'key:w')
  await at(66, 'key:n')
  expect(world.opened).toEqual([61, 66, 61])
  // At either end there is nothing to ask.
  await at(34, 'key:n')
  await at(96, 'key:w')
  expect(world.opened).toHaveLength(3)
  // The dock keeps a width the person dragged it to: the pane is still 56 wide a while after the ask.
  const ui = await $.ui.mount(pane(56, 44))
  await ui.press({ key: 'key:w' })
  expect(world.opened.slice(3)).toEqual([61])
  await clock.advance(2_000)
  await ui.press({ key: 'key:w' })
  expect(world.opened.slice(3)).toEqual([61])
  expect(world.toasts.filter(t => /kept its width/.test(t))).toHaveLength(1)
  // The next press asks again, for the same width: nothing drifted.
  await clock.advance(2_000)
  await ui.press({ key: 'key:w' })
  expect(world.opened.slice(3)).toEqual([61, 61])
  await ui.unmount()
  await land()
})

test('seated inline above the prompt the pane is as tall as what it shows; docked it fills the dock', async ($, on) => {
  engine(on)
  const inline = await $.ui.mount({ ...pane(56, 30), props: { ...pane(56, 30).props, placement: 'inline' } })
  const tree = (await inline.drawn()) as Node
  expect(lines(tree).map(l => l.trimEnd())).toEqual(['  No workflow is running.', '', '  No plan yet. Claude posts one for a 3+ step task.', '─'.repeat(56), '  z: hide'])
  expect(typeof tree === 'string' ? {} : tree.props ?? {}).not.toHaveProperty('minHeight')
  expect(tree).toMatchObject({ type: 'Box', props: { width: 56, backgroundColor: P.bg } })
  await inline.unmount()
  const dock = await $.ui.mount(pane(56, 30))
  expect(lines((await dock.drawn()) as Node)).toHaveLength(30)
  expect((await dock.drawn()) as Node).toMatchObject({ props: { minHeight: 30 } })
  await dock.unmount()
})

test('no line is wider than the pane at 34, 44, 56 and 96 columns, whatever is open', async ($, on) => {
  const kit = engine(on, { hist: HIST })
  const { land } = await midflight($, kit)
  await $.tool.call({ tool: 'mcp__loadout__steps', tool_use_id: 's1', title: 'A plan with a title longer than a narrow pane can hold in one line', steps: [{ label: 'A step whose label is also much longer than thirty-four cells', status: 'active' }, { label: 'b', status: 'blocked' }] })
  for (const columns of [34, 44, 56, 96]) {
    const ui = await $.ui.mount(pane(columns, 80))
    const check = async (what: string) => {
      const all = lines((await ui.drawn()) as Node)
      // Every line is exactly the pane's width: its cells and the background painted to the edge.
      expect([what, columns, all.filter(l => l.length !== columns)]).toEqual([what, columns, []])
      expect((await ui.drawn()) as Node).toMatchObject({ type: 'Box', props: { width: columns, backgroundColor: P.bg } })
    }
    await check('the run')
    for (const b of (await ui.findAll({ type: 'Button' })).filter(x => x.key?.startsWith('ag:'))) await ui.press({ key: b.key ?? '' })
    await check('every agent open')
    await ui.press({ key: 'key:s' })
    await check('steering')
    await ui.press({ key: 'steer:cancel' })
    await ui.press({ key: 'key:x' })
    await check('asking to stop')
    await ui.press({ key: 'stop:no' })
    for (const b of (await ui.findAll({ type: 'Button' })).filter(x => x.key?.startsWith('ag:'))) await ui.press({ key: b.key ?? '' })
    await ui.unmount()
  }
  await land()
})

test('every width from 34 to 96: no line passes the pane and every box keeps its right border, with a finished run, a long plan and a map with two-digit counts', () => {
  const agent = (n: number, status: Agent['status'], phase: number, label: string): Agent => ({
    key: `${n}@0`, n, id: `a${n}`, label, model: '', status, startedAt: 0, endedAt: status === 'running' ? 0 : 60_000, tools: 123, phase, tokIn: 0, tokOut: 1_234_567, steer: 'a steer message that is long enough to be cut', stepIn: 0, stepOut: 0,
    calls: status === 'running' && n % 2 === 0 ? [{ id: 'c', tool: 'Bash', what: 'pnpm run a-very-long-script-name --with --many --flags --that --go --on', at: 0 }] : [],
    log: [{ tool: 'mcp__server__a_tool_with_a_long_name', what: 'src/a/very/long/path/to/a/file-with-a-long-name.test.tsx', ms: 123_456, failed: n === 1 }],
  })
  const live = { ...newRun({ callId: 'c1', name: 'a-run-whose-name-is-much-longer-than-a-narrow-title-can-hold', phases: ['review', 'a phase with a long title that must be cut', 'ship'], startedAt: 0 }), taskId: 't1', spawned: 16, done: 10, failed: 2, tokOut: 12_345_678,
    agents: [agent(1, 'done', 0, 'code-review:round-1'), agent(2, 'failed', 0, 'an agent name longer than twenty-two cells'), agent(3, 'running', 1, 'polish:round-1 with a long label too'), agent(4, 'running', 1, 'x'), agent(5, 'queued', 1, 'waiting') ] }
  const over = { ...newRun({ callId: 'c0', name: 'kirby-polish', phases: ['only'], startedAt: 0 }), endedAt: 4_000_000, outcome: 'completed', spawned: 120, done: 100, failed: 20, tokOut: 1_234_567, agents: [agent(1, 'done', 0, 'ship-check')] }
  const issues = Array.from({ length: 120 }, (_, i) => ({
    name: `${String(i + 1).padStart(3, '0')}-t.md`,
    text: `# Ticket ${i + 1}, whose title goes on past any pane\n\nType: task\nStatus: ${i < 100 ? 'resolved' : i < 110 ? 'claimed' : 'open'}\n${i >= 115 ? 'Blocked by: 111, an outside blocker with a long name\n' : ''}`,
  }))
  const map = { ...chart('alpha', '# Map: A map\n\n## Destination\n\nSomewhere far, told in a sentence longer than the box.\n\n## Not yet specified\n\n- fog one\n\n## Out of scope\n\n- out one\n', issues, JSON.stringify({ carte: 1234, tickets: { '001': { iid: 4321 } } })), scratch: '', efforts: ['alpha', 'an-effort-with-a-long-name'], sig: '' }
  const plan = { title: 'A plan with a title longer than a narrow pane can hold', steps: Array.from({ length: 30 }, (_, i) => ({ label: `Step ${i + 1} with a label much longer than thirty-four cells`, status: i < 12 ? 'done' as const : i === 12 ? 'active' as const : 'pending' as const })) }
  const shown = (line: Line) => line.map(p => (isSeg(p) ? p.t : 'btn' in p ? `${p.btn.hotkey === undefined ? '' : `${p.btn.hotkey}: `}${p.btn.label}`.padEnd(widthOf(p.btn)) : ' '.repeat(p.inp.width))).join('')
  const base: View = { folded: [], sel: 'ag:c0:1@0', open: live.agents.map(a => `ag:c1:${a.key}`), mode: '', target: '', at: 0, hidden: false, cols: 0, colsFrom: 0, colsAt: 0 }
  for (const view of [base, { ...base, mode: 'steer' as const, target: 'ag:c1:3@0' }, { ...base, mode: 'confirm' as const, target: 'c1' }, { ...base, folded: ['c1'] }]) {
    for (let w = 34; w <= 96; w++) {
      const drawn = compose({
        w, rows: 600, P, now: 300_000, runs: [runView(live, 300_000, HIST), runView(over, 300_000, HIST)], view, plan,
        way: { active: true, root: '', touched: '', chosen: '', hint: '', open: ['done', 'fog', 'out'] }, map,
      })
      const texts = drawn.lines.map(shown)
      expect([w, view.mode, drawn.lines.filter(l => cells(l) > w).map(shown)]).toEqual([w, view.mode, []])
      // A box's row is the box's width whatever it holds: its right border stands under its corner.
      const edge = texts.find(l => l.includes('╮') && !l.includes('┆'))?.length
      const boxed = texts.filter(l => /^ {1,2}│ (\d+ \/ \d+ resolved|here \d+|step \d+ of|ETA)/.test(l))
      expect([w, boxed.length, boxed.filter(l => !l.endsWith(' │') || l.length !== edge)]).toEqual([w, 5, []])
      // The finished run is drawn as the live one is: no list of past runs, no Button that opens one.
      expect([w, texts.filter(l => /recent runs|press one for/i.test(l))]).toEqual([w, []])
      expect([w, drawn.lines.flat().flatMap(p => ('btn' in p && (p.btn.key.startsWith('run:') || /^\d$/.test(p.btn.hotkey ?? '')) ? [p.btn.key] : []))]).toEqual([w, []])
      expect(cells(drawn.lines[drawn.lines.length - 1] ?? [])).toBeLessThanOrEqual(w)
    }
  }
})

test('the palette follows the theme, and the pane paints its own background over its whole area', async ($, on) => {
  expect(['dark', 'light', '', 'kirby', 'custom:Kirby', 'kirby-pink', 'Kirby Pink', 'ghostrunner', 'cyberpunk-edgerunners', 'Cyberpunk Edgerunners', 'Ghostrunner Soft', 'cyberpunk-soft', 'cyberpunk'].map(paletteOf)).toEqual(
    ['handoff', 'handoff', 'handoff', 'kirby', 'kirby', 'kirby-pink', 'kirby-pink', 'ghostrunner', 'cyberpunk-edgerunners', 'cyberpunk-edgerunners', 'ghostrunner', 'handoff', 'handoff'],
  )
  expect(PALETTES.kirby.bg).toBe('#1b2414') // the terminal's own background on that theme
  // Every palette holds every token, and reads: 4.5 for the text, 3 for the dim text and the accents, on the pane and on a selected row.
  const tokens = Object.keys(P).sort()
  for (const [name, pal] of Object.entries(PALETTES) as [PaletteName, Palette][]) {
    expect([name, Object.keys(pal).sort()]).toEqual([name, tokens])
    for (const on of [pal.bg, pal.select]) {
      expect([name, contrast(pal.fg, on) >= 4.5]).toEqual([name, true])
      for (const token of ['text2', 'text3', 'text4', 'cyan', 'green', 'yellow', 'orange', 'red', 'blue', 'violet'] as const) {
        expect([name, token, contrast(pal[token], on) >= 3]).toEqual([name, token, true])
      }
    }
    // An empty bar cell stands out of the pane at least as the handoff's does (#3a3a3a on #262626), and more on a coloured ground.
    expect([name, contrast(pal.track, pal.bg) >= (name === 'handoff' ? 1.3 : 1.45)]).toEqual([name, true])
  }

  const kit = engine(on, { theme: 'kirby', hist: HIST })
  const { land } = await midflight($, kit)
  const ui = await $.ui.mount(pane(56, 44))
  const K = PALETTES.kirby
  const drawn = (await ui.drawn()) as Node
  // The root Box: the pane's width and height, in the palette's background.
  expect(drawn).toMatchObject({ type: 'Box', props: { width: 56, minHeight: 44, backgroundColor: K.bg } })
  const all = paint(drawn)
  expect(all).toHaveLength(44)
  // Every cell of every line has a background: the palette's, or the selection's.
  expect(all.map(l => l.reduce((n, r) => n + r.t.length, 0)).every(n => n === 56)).toBe(true)
  expect([...new Set(all.flat().map(r => r.bg))].sort()).toEqual([K.bg])
  // The same roles in the palette's own colours, the gradient between its own cyan and green.
  expect(cell(row(all, '╭─ workflow'), 'workflow')?.c).toBe(K.cyan)
  expect(cell(row(all, /polish ×2/), 'polish')?.c).toBe(K.yellow)
  expect(row(all, '38%').find(r => r.t.includes('■'))?.c).toBe(K.cyan)
  expect(cell(row(all, '+5m 17s over'), '+5m 17s over')?.c).toBe(K.orange)
  const used = new Set(all.flat().map(r => r.c).filter(c => c !== undefined && c !== 'dim'))
  expect([...used].filter(c => Object.values(P).includes(c ?? '') && !Object.values(K).includes(c ?? ''))).toEqual([])

  // The theme changes while the pane is up: the next beat repaints it.
  kit.world.theme = 'cyberpunk-edgerunners'
  await kit.clock.advance(1_200)
  expect((await ui.drawn()) as Node).toMatchObject({ props: { backgroundColor: PALETTES['cyberpunk-edgerunners'].bg } })
  // With no run live either: the idle beat still sees the theme change, within a few seconds.
  await $.prompt.submit(notify('completed'))
  kit.world.theme = 'kirby-pink'
  await kit.clock.advance(9_000)
  expect((await ui.drawn()) as Node).toMatchObject({ props: { backgroundColor: PALETTES['kirby-pink'].bg } })
  await ui.unmount()
  await land()
})

test('the pane is drawn again only while a run is live and it is on screen', async ($, on) => {
  const kit = engine(on, { hist: HIST })
  const { land } = await midflight($, kit)
  const ui = await $.ui.mount(pane(56, 44))
  const elapsed = async () => (await text(ui))[2]?.match(/\d+m \d+s {9}(\d+m \d+s)/)?.[1]
  expect(await elapsed()).toBe('24m 17s')
  await kit.clock.advance(2_000)
  expect(await elapsed()).toBe('24m 19s')
  // Hidden (another pane's tab is shown, or the pane is closed): the clock the drawing reads stands still.
  kit.world.isUp = false
  await kit.clock.advance(1_000)
  const frozen = await elapsed()
  await kit.clock.advance(60_000)
  expect(await elapsed()).toBe(frozen)
  // Shown again: it catches up within a second.
  kit.world.isUp = true
  await kit.clock.advance(1_200)
  expect(await elapsed()).toBe('25m 21s')
  // The run ended: its diagram stays as it ended, and nothing moves any more.
  await $.prompt.submit(notify('completed'))
  await kit.clock.advance(1_000)
  const final = await text(ui)
  expect(final[0]).toMatch(/╭─ workflow kirby-polish /)
  expect(final.some(l => /[◐◓◑◒]/.test(l))).toBe(false)
  await kit.clock.advance(30_000)
  expect(await text(ui)).toEqual(final)
  await ui.unmount()
  await land()
})
