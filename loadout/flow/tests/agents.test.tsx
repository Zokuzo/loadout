// Plain subagents (started outside a workflow) in the pane: seen on their first event, drawn alive, ended, gone.
import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { cells, compose, soloKey, tab } from '../hooks/draw'
import { ENTER_MS, FLASH_MS, frameOf, LEAVE_MS, LINGER_MS, QUEUE_MS, soloAgent, sweep, TOOL_MS, TOOL_STEP } from '../hooks/lib'
import { mix } from '../hooks/palette'
import { PALETTES } from '../hooks/palette'
import type { Agent, View } from '../../types'
import { answer, engine, HIST, inAgent, lines, midflight, paint, pane, solo, step } from './kit'
import type { Node, Run } from './kit'

const P = PALETTES.handoff
type Dollar = Parameters<TestBody>[0]
type Ui = { drawn: () => Promise<unknown>; findAll: (q: { type: string }) => Promise<{ key: string | undefined; text: string; props: Record<string, unknown> }[]> }
const painted = async (ui: Ui) => paint((await ui.drawn()) as Node)
const text = async (ui: Ui) => lines((await ui.drawn()) as Node).map(l => l.trimEnd())
const row = (all: Run[][], part: string | RegExp) => all.find(line => (typeof part === 'string' ? line.map(r => r.t).join('').includes(part) : part.test(line.map(r => r.t).join('')))) ?? []
const cell = (line: Run[], part: string) => line.find(r => r.t.includes(part))
const has = async (ui: Ui, line: RegExp) => (await text(ui)).some(l => line.test(l))
const START = { cwd: '/repo', surface: 'terminal', isInteractive: false } as const
const READ = { tool: 'Read', tool_use_id: 'r1', file_path: '/scans/kosmos_hs1-2.png' } as const
const up = async ($: Dollar, on: Parameters<TestBody>[1], rows = 30) => {
  const kit = engine(on, { hist: HIST })
  kit.world.isUp = true
  await $.session.start(START)
  return { ...kit, ui: await $.ui.mount(pane(56, rows)) }
}

test('a plain subagent shows on its start, names its tool in the tool\'s colour, counts its tools and tokens, ends as one row, and leaves', async ($, on) => {
  const { ui, clock, world } = await up($, on)
  expect(await has(ui, /agents/)).toBe(false)
  await $.agent.spawn(solo('Reading kosmos_hs1-2.png scan'))
  // Alone in the pane: the summary box counts them, then the group, in a running phase's language.
  let seen = await text(ui)
  expect(seen.slice(0, 4)).toEqual([
    '  ╭─ agents ───────────────────────────── 1 running ─╮',
    '  │ RUNNING         ELAPSED         TOKENS OUT       │',
    '  │ 1 of 1          0s              0                │',
    '  ╰──────────────────────────────────────────────────╯',
  ])
  expect(seen.some(l => /^ {2}[◐◓◑◒] {2}agents ×1 +0s$/.test(l))).toBe(true)
  // The card: its description as the name, bold; its type beside it, dim; thinking until a tool runs.
  expect(seen.some(l => /│ Reading kosmos_hs1-2\.png scan general-purpose │$/.test(l))).toBe(true)
  expect(cell(row(await painted(ui), '│ Reading kosmos'), 'Reading kosmos_hs1-2.png scan')).toMatchObject({ c: P.fg, b: true })
  expect(cell(row(await painted(ui), '│ Reading kosmos'), 'general-purpose')?.c).toBe(P.text3)
  expect(cell(row(await painted(ui), /^ {2}[◐◓◑◒] {2}agents/), 'agents')).toMatchObject({ c: P.yellow, b: true })
  expect(seen.some(l => /│ ∴ thinking +│$/.test(l))).toBe(true)
  expect(seen.some(l => /│ ↓ 0 out {3}0 tools +0s │$/.test(l))).toBe(true)
  expect(seen.some(l => /No workflow is running|No plan yet/.test(l))).toBe(false)

  // A tool runs: the action in the tool's colour, counted, with how long it has run.
  const reading = inAgent($, 'solo-1', READ)
  await clock.advance(700)
  expect(cell(row(await painted(ui), '▸ reading'), '▸ reading kosmos_hs1-2.png')?.c).toBe(P.blue)
  expect(await has(ui, /│ ↓ 0 out {3}1 tool +\ds │$/)).toBe(true)
  await clock.advance(400)
  await reading
  expect(await has(ui, /│ ∴ thinking +│$/)).toBe(true)
  // Tokens, where the engine gives them: each model request's, as it answers.
  world.stepOut = 2_100
  await step($, 'solo-1')
  expect(await has(ui, /│ ↓ 2\.1k out {3}1 tool /)).toBe(true)
  expect(cell(row(await painted(ui), '│ 1 of 1'), '2.1k')).toMatchObject({ c: P.blue, b: true })
  await clock.advance(9_000)
  expect(await has(ui, /^ {2}[◐◓◑◒] {2}agents ×1 +10s$/)).toBe(true)

  // It answers: one compact row, its mark and how long it ran; the group is done.
  await answer($, 'solo-1', 2_100)
  seen = await text(ui)
  expect(seen.some(l => /^ {2}│ {2}Reading kosmos_hs1-2… ━+ {2}✓ +10s$/.test(l))).toBe(true)
  expect(seen.some(l => /^ {2}● {2}agents ×1$/.test(l))).toBe(true)
  expect(seen[0]).toMatch(/ 0 running ─╮$/)
  expect(cell(row(await painted(ui), /✓ +10s/), '✓')?.c).toBe(P.green)
  expect(seen.some(l => /╭─+╮/.test(l) && /[┆│] {2}╭/.test(l))).toBe(false)
  // A while later it is gone, and the pane is as it was.
  await clock.advance(LINGER_MS - 2_000)
  expect(await has(ui, /Reading kosmos/)).toBe(true)
  await clock.advance(3_000)
  expect((await text(ui)).slice(0, 3)).toEqual(['  No workflow is running.', '', '  No plan yet. Claude posts one for a 3+ step task.'])
  await ui.unmount()
})

test('failed, stopped and refused agents are marked, each its own way', async ($, on) => {
  const { ui, clock, world } = await up($, on)
  for (const name of ['crashes', 'is interrupted', 'answers']) await $.agent.spawn(solo(name, 'Explore'))
  await clock.advance(5_000)
  await $.turn.complete({ reason: 'error', answer: '', agentId: 'solo-1' } as never)
  await $.turn.complete({ reason: 'aborted', answer: '', agentId: 'solo-2' } as never)
  await answer($, 'solo-3')
  world.deny = 'no agents today'
  await $.agent.spawn(solo('is refused'))
  const all = await painted(ui)
  const mark = (name: string) => row(all, new RegExp(`^ {2}│ {2}${name} `)).find(r => /^[✓✗■]$/.test(r.t))
  // An error is a cross, an interruption the stop square, both red; an answer the green tick.
  expect([mark('crashes'), mark('is interrupted'), mark('answers'), mark('is refused')].map(m => [m?.t, m?.c])).toEqual([['✗', P.red], ['■', P.red], ['✓', P.green], ['✗', P.red]])
  expect(row(all, /^ {2}│ {2}crashes /).filter(r => r.t.includes('━')).every(r => r.c === P.red)).toBe(true)
  expect(lines((await ui.drawn()) as Node)[0]).toMatch(/ 0 running ─╮/)
  // The engine's own list is the backstop for an end the pane saw no turn of.
  world.deny = ''
  await $.agent.spawn(solo('ends unseen'))
  expect(await has(ui, /│ ends unseen /)).toBe(true)
  world.agents = [{ id: 'solo-4', description: 'ends unseen', type: 'general-purpose', status: 'killed' }]
  await clock.advance(1_500)
  expect(row(await painted(ui), /^ {2}│ {2}ends unseen /).find(r => /^[✓✗■]$/.test(r.t))?.t).toBe('■')
  await ui.unmount()
})

test('an agent whose start was not seen is taken in on its first tool call, from the engine\'s list; an id the list does not name is not', async ($, on) => {
  const { ui, clock, world } = await up($, on)
  world.agents = [
    { id: 'bg-7', description: 'index the docs', type: 'Explore', status: 'running' },
    { id: 'mate-1', teammateId: 'scout@team', description: 'a teammate', type: 'teammate', status: 'running' },
  ]
  const known = inAgent($, 'bg-7', { tool: 'Bash', tool_use_id: 'b1', command: 'ls docs' })
  const mate = inAgent($, 'mate-1', { tool: 'Bash', tool_use_id: 'b2', command: 'ls' })
  const unknown = inAgent($, 'wf-lost-agent', { tool: 'Bash', tool_use_id: 'b3', command: 'ls' })
  await clock.advance(500)
  const seen = await text(ui)
  expect(seen.some(l => /│ index the docs +Explore │$/.test(l))).toBe(true)
  expect(cell(row(await painted(ui), '▸ running'), '▸ running ls docs')?.c).toBe(P.violet)
  // A teammate idles between turns and is no plain subagent; a workflow's agent and an engine fork are in no list.
  expect(seen.some(l => /agents ×1 /.test(l))).toBe(true)
  expect(seen.some(l => /a teammate|wf-lost/.test(l))).toBe(false)
  await clock.advance(5_000)
  await Promise.all([known, mate, unknown])
  await ui.unmount()

  // A teammate's start is not shown either; a fork is, as a fork.
  await $.agent.spawn(solo('a named teammate', 'reviewer', { isTeammate: true }))
  await $.agent.spawn(solo('continue the refactor', 'general-purpose', { fork: true }))
  const again = await $.ui.mount(pane(56, 30))
  expect(await has(again, /a named teammate/)).toBe(false)
  expect(await has(again, /│ continue the refactor +fork │$/)).toBe(true)
  await again.unmount()
})

test('a workflow\'s agents are in their run and nowhere else; plain subagents stand above the run, counted in its box', async ($, on) => {
  const kit = engine(on, { hist: HIST })
  const { land } = await midflight($, kit)
  const ui = await $.ui.mount(pane(56, 60))
  // The run alone: no group, and each of its agents once.
  let seen = await text(ui)
  expect(seen.some(l => /agents ×/.test(l))).toBe(false)
  for (const name of ['code-review:round-1', 'art-director:round-1', 'polish:round-1', 'sprites:round-1']) expect([name, seen.filter(l => l.includes(name)).length]).toEqual([name, 1])
  expect(seen[0]).toMatch(/ phase 2\/5 ─╮$/)
  // A plain subagent starts beside it: the group stands first, the run's box counts it, and the run's agents are still listed once.
  await $.agent.spawn(solo('check the licence headers', 'Explore'))
  seen = await text(ui)
  expect(seen[0]).toMatch(/^ {2}[◐◓◑◒] {2}agents ×1 /)
  expect(seen.some(l => /^ {2}╭─ workflow kirby-polish ─+ phase 2\/5 · \+1 agent ─╮$/.test(l))).toBe(true)
  expect(seen.some(l => /╭─ agents /.test(l))).toBe(false)
  for (const name of ['polish:round-1', 'sprites:round-1', 'check the licence headers']) expect([name, seen.filter(l => l.includes(name)).length]).toEqual([name, 1])
  // The workflow's own tool calls and turns leave the group alone.
  await answer($, 'agent-4', 9_800)
  expect((await text(ui)).some(l => /agents ×1 /.test(l))).toBe(true)
  await ui.unmount()
  await land()
})

test('selection, the last tool calls and steering work on a plain subagent as on a run\'s; no stop is offered for one', async ($, on) => {
  const { ui, clock, world } = await up($, on)
  await $.agent.spawn(solo('Reading kosmos_hs1-2.png scan'))
  await $.agent.spawn(solo('find the config loader', 'Explore'))
  for (const n of [1, 2]) {
    const one = inAgent($, 'solo-1', { tool: 'Read', tool_use_id: `r${n}`, file_path: `/scans/page-${n}.png` })
    await clock.advance(1_000)
    await one
  }
  await clock.advance(1_000)
  const keys = (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('ag:solo:'))
  expect(keys.map(b => [b.text, b.props.autoFocus])).toEqual([['2 tools', true], ['0 tools', undefined]])
  const edgeOf = async (name: string) => cell(row(await painted(ui), new RegExp(`│ ${name}`)), '│')?.c
  // The first running agent is selected; j moves on.
  expect([await edgeOf('Reading kosmos'), await edgeOf('find the config')]).toEqual([P.yellow, P.cardBorder])
  await ui.press({ key: 'key:j' })
  expect([await edgeOf('Reading kosmos'), await edgeOf('find the config')]).toEqual([P.cardBorder, P.yellow])
  // ⏎ on a card lists its last tool calls, newest first.
  await ui.press({ key: keys[0]?.key ?? '' })
  const seen = await text(ui)
  const at = seen.findIndex(l => /┄{45}/.test(l))
  expect(seen.slice(at + 1, at + 3)).toEqual(['  ┆  │ Read  page-2.png                         1.0s │', '  ┆  │ Read  page-1.png                         1.0s │'])
  // s steers it by its loop's id, the engine's SendMessage delivery; x is not offered: the engine stops a task, and no event gives a plain subagent's.
  expect((await ui.findAll({ type: 'Button' })).some(b => b.key === 'key:x')).toBe(false)
  await ui.press({ key: 'key:s' })
  expect(await has(ui, /steer Reading kosmos.* ›/)).toBe(true)
  await $.ui.input({ plugin: 'loadout', key: 'steer', text: 'only the first page' })
  expect(world.sent).toEqual([{ to: 'solo-1', text: 'only the first page' }])
  expect(await has(ui, /│ Reading kosmos.*… ↳ general-purpose │$/)).toBe(true)
  expect(await has(ui, /│ ↳ "only the first page" +│$/)).toBe(true)
  await ui.unmount()
})

test('the animation is a function of the clock alone: the same clock draws the same cells, and nothing is drawn when nothing moves', async ($, on) => {
  const agent = (more: Partial<Agent>): Agent => soloAgent({ key: 'k', id: 'a', label: 'scan', kind: 'Explore', startedAt: 10_000, ...more })
  const VIEW: View = { folded: [], sel: '', open: [], mode: '', target: '', at: 0, hidden: false, cols: 0, colsFrom: 0, colsAt: 0 }
  const draw = (solo: Agent[], now: number) => compose({ w: 56, rows: 30, P, now, runs: [], view: VIEW, plan: null, way: { active: false, root: '', touched: '', chosen: '', hint: '', open: [] }, map: null, solo }).lines
  const busy = agent({ calls: [{ id: 'c', tool: 'Read', what: 'a.png', at: 12_000 }], tools: 1 })
  // Pure: twice the same clock is twice the same lines; the highlight has moved 150 ms later.
  expect(draw([busy], 13_000)).toEqual(draw([busy], 13_000))
  const cellsOf = (solo: Agent[], now: number) => (draw(solo, now).find(l => l.some(p => 't' in p && p.t.includes('■'))) ?? []).flatMap(p => ('t' in p && p.t.includes('■') ? [p] : []))
  const barOf = (now: number) => cellsOf([busy], now).map(p => `${p.t.length}${p.c}`).join(' ')
  expect(cellsOf([busy], 13_000).reduce((n, p) => n + p.t.length, 0)).toBe(45)
  expect(barOf(13_000)).not.toBe(barOf(13_300))
  expect(barOf(13_000)).toBe(barOf(13_000))
  // The highlight's head (the cell in the tool's own colour) leaves from the left when the call starts and goes on by the
  // same number of cells each time the pane is drawn again for it; between two such redraws it stands.
  const headOf = (solo: Agent[], now: number) => {
    const row = cellsOf(solo, now)
    const hit = row.findIndex(p => p.c === P.blue)
    return hit < 0 ? -1 : row.slice(0, hit).reduce((n, p) => n + p.t.length, 0) + (row[hit]?.t.length ?? 1) - 1
  }
  const from = headOf([busy], 12_000)
  expect(from).toBeLessThan(7)
  expect([1, 2, 3, 4, 5].map(n => headOf([busy], 12_000 + n * TOOL_MS) - from)).toEqual([1, 2, 3, 4, 5].map(n => n * TOOL_STEP))
  expect(headOf([busy], 12_000 + TOOL_MS + 149)).toBe(headOf([busy], 12_000 + TOOL_MS))
  // Two cards are not one: a call started later is behind, and two started in the same instant are apart by their ids.
  const later = (id: string, at: number) => agent({ key: id, calls: [{ id, tool: 'Read', what: 'b.png', at }], tools: 1 })
  const headsOf = (a: Agent, b: Agent, now: number) => {
    const rows = draw([a, b], now).filter(l => l.some(p => 't' in p && p.t.includes('■'))).map(l => l.flatMap(p => ('t' in p && p.t.includes('■') ? [p] : [])))
    return rows.map(row => row.slice(0, row.findIndex(p => p.c === P.blue) + 1).reduce((n, p) => n + p.t.length, 0))
  }
  const [h1, h2] = headsOf(busy, later('d', 12_900), 13_500)
  expect(h1).not.toBe(h2)
  const [h3, h4] = headsOf(busy, later('toolu_other', 12_000), 13_500)
  expect(h3).not.toBe(h4)
  // The highlight is in the tool's colour, its tail fading to the track; with no tool it is three dim cells.
  expect(cellsOf([busy], 13_000).some(p => p.c === P.blue)).toBe(true)
  expect(cellsOf([agent({})], 13_000).filter(p => p.c !== P.track).reduce((n, p) => n + p.t.length, 0)).toBe(3)

  // The frame the pane is on: a new one only when something on screen changed.
  const key = (solo: Agent[], t: number, isLive = false, stepMs = 0) => frameOf({ isLive, solo, stepMs, t })
  expect(key([], 50_000)).toBe('')
  // A live run alone beats as before: the spinner's 450 ms and the second.
  expect(key([], 50_000, true)).toBe(`${Math.floor(50_000 / 450)}:50`)
  // Thinking, past its entrance: the spinner and the second, nothing faster.
  expect(key([agent({})], 20_000)).toBe(key([agent({})], 20_020))
  expect(key([agent({})], 20_000)).not.toBe(key([agent({})], 20_450))
  // A tool running: every 300 ms. Coming in, a call or the agent just ended, or about to leave: every 150 ms.
  expect(key([busy], 20_000)).not.toBe(key([busy], 20_300))
  expect(key([agent({})], 10_000)).not.toBe(key([agent({})], 10_150))
  expect(key([agent({ flashAt: 20_000 })], 20_000)).not.toBe(key([agent({ flashAt: 20_000 })], 20_150))
  expect(key([agent({ flashAt: 20_000 })], 20_000 + FLASH_MS)).toBe(key([agent({})], 20_000 + FLASH_MS))
  // Finished and waiting to leave: nothing moves, nothing is drawn; then its exit, then it is swept.
  const over = agent({ status: 'done', endedAt: 30_000 })
  expect(key([over], 30_000)).not.toBe('')
  expect([key([over], 30_000 + FLASH_MS), key([over], 45_000)]).toEqual(['', ''])
  expect(key([over], 30_000 + LINGER_MS - LEAVE_MS)).not.toBe('')
  expect([sweep([over], 30_000 + LINGER_MS - 1).length, sweep([over], 30_000 + LINGER_MS).length]).toEqual([1, 0])
  expect(ENTER_MS % 150).toBe(0)

  // In the pane (a test cannot count redraws: it sees the tree): while one runs its elapsed time moves; while a finished one
  // waits to leave, the tree does not change at all.
  const kit = await up($, on)
  await $.agent.spawn(solo('scan the docs'))
  await kit.clock.advance(3_000)
  expect(await has(kit.ui, /agents ×1 +3s$/)).toBe(true)
  await kit.clock.advance(1_000)
  expect(await has(kit.ui, /agents ×1 +4s$/)).toBe(true)
  await answer($, 'solo-1')
  // Just ended: the mark is bold and the bar bright. With nothing else live the pane is drawn once more when the flash is
  // over, so the row stands settled (not bright for its whole stay), and then nothing is drawn until it leaves.
  const mark = async () => row(await painted(kit.ui), /scan the docs +━/).find(r => r.t === '✓')
  const bar = async () => row(await painted(kit.ui), /scan the docs +━/).filter(r => r.t.includes('━')).map(r => r.c)
  expect((await mark())?.b).toBe(true)
  expect((await bar())[0]).toBe(P.cyan)
  await kit.clock.advance(2_000)
  expect((await mark())?.b).toBeUndefined()
  expect((await bar())[0]).toBe(mix(P.track, P.cyan, 0.55))
  const drawn = await painted(kit.ui)
  await kit.clock.advance(15_000)
  expect(await painted(kit.ui)).toEqual(drawn)
  await kit.ui.unmount()
})

// A spawn whose chain rejects is marked failed by the same write as a refused one; the harness cannot make next(e) reject
// (it skips a hook that throws), so that path is not driven here.
test('a spawn that starts with no id is not shown, and one that never answers is given up: neither stays running for ever', async ($, on) => {
  const { ui, clock, world } = await up($, on)
  // Started by a hook that gave no id: no event will ever name it, so there is no card to leave running.
  world.noId = true
  await $.agent.spawn(solo('has no id'))
  world.noId = false
  expect(await has(ui, /has no id/)).toBe(false)
  // Asked for and never started: queued, then given up, then gone like any finished row.
  world.held.set(-1, new Promise<void>(() => undefined))
  void $.agent.spawn(solo('never starts')).catch(() => undefined)
  await clock.advance(1_000)
  expect(await has(ui, /│ never starts /)).toBe(true)
  expect(await has(ui, /│ ∴ starting +│$/)).toBe(true)
  world.held.delete(-1)
  // (Off screen for the wait: the pane beats once a second there, and the test runs faster.)
  world.isUp = false
  await clock.advance(QUEUE_MS)
  world.isUp = true
  await clock.advance(2_500)
  expect(row(await painted(ui), /^ {2}│ {2}never starts /).find(r => /^[✓✗■]$/.test(r.t))?.t).toBe('✗')
  expect((await text(ui)).some(l => /[◐◓◑◒] {2}agents/.test(l))).toBe(false)
  await clock.advance(LINGER_MS)
  expect(await has(ui, /never starts/)).toBe(false)
  const still = await painted(ui)
  await clock.advance(8_000)
  expect(await painted(ui)).toEqual(still)
  await ui.unmount()
})

test('folded to its tab, the pane still says that plain subagents run: alone, and beside a live run', async ($, on) => {
  const kit = engine(on, { hist: HIST })
  await $.session.start(START)
  const BAND = { plugin: 'loadout', surface: 'terminal', component: 'AbovePrompt', requestId: 'band', props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} } } as const
  const ui = await $.ui.mount(pane(56, 30))
  await ui.press({ key: 'key:z' })
  const band = await $.ui.mount(BAND)
  const middle = async () => lines((await band.drawn()) as Node)[1] ?? ''
  expect(await middle()).toBe('│ ○ flow map  idle  z: show │')
  await $.agent.spawn(solo('Reading kosmos_hs1-2.png scan'))
  await $.agent.spawn(solo('find the config loader', 'Explore'))
  await kit.clock.advance(3_000)
  expect(await middle()).toMatch(/^│ [◐◓◑◒] flow map {2}2 agents {2}3s {2}z: show │$/)
  expect(paint((await band.drawn()) as Node)[1]?.find(r => r.t.includes('2 agents'))).toMatchObject({ c: P.fg, b: true })
  await answer($, 'solo-1')
  expect(await middle()).toMatch(/ flow map {2}1 agent {2}3s /)
  await answer($, 'solo-2')
  expect(await middle()).toBe('│ ○ flow map  idle  z: show │')
  await band.unmount()
  await ui.unmount()
  // Beside a live run the run's figures stay, and the agents are counted after them.
  const rv = { run: { endedAt: null, outcome: '' }, pct: 0.38, eta: 60_000, isOpen: false, isHeld: false } as never
  const live = [soloAgent({ key: 'a', label: 'x', startedAt: 0 }), soloAgent({ key: 'b', label: 'y', startedAt: 0, status: 'done', endedAt: 5 })]
  expect(tab(P, rv, 0, live)[1]?.map(p => ('t' in p ? p.t : '')).join('')).toMatch(/^│ . flow map {2}38% {2}eta 1m 00s {2}\+1 agent {2}/)
  expect(tab(P, rv, 0)[1]?.map(p => ('t' in p ? p.t : '')).join('')).not.toMatch(/agent/)
})

test('a card comes in, flashes when a tool call ends, and a finished row goes: each over a few frames', async ($, on) => {
  const { ui, clock } = await up($, on)
  const top = async () => row(await painted(ui), /[┆│] {2}╭/).find(r => r.t.startsWith('╭'))
  await $.agent.spawn(solo('scan the docs'))
  // Coming in: a dashed border, darker than its own colour, and no bar yet; then the border is whole and the track laid.
  const first = await top()
  expect(first?.t).toMatch(/^╭╌+╮$/)
  expect(first?.c).not.toBe(P.yellow)
  await clock.advance(ENTER_MS + 150)
  expect(await top()).toMatchObject({ t: `╭${'─'.repeat(47)}╮`, c: P.yellow })
  // A tool call ends: the border is lit green at once, red for a call that failed, and is back within half a second.
  const ok = inAgent($, 'solo-1', READ)
  await clock.advance(1_000)
  await ok
  expect((await top())?.c).toBe(P.green)
  await clock.advance(FLASH_MS + 150)
  expect((await top())?.c).toBe(P.yellow)
  const bad = inAgent($, 'solo-1', { tool: 'Edit', tool_use_id: 'e1', file_path: '/repo/src/physics/float.ts', old_string: 'a', new_string: 'b' })
  await clock.advance(2_000)
  await bad
  expect((await top())?.c).toBe(P.red)
  await clock.advance(FLASH_MS + 150)
  // Finished: the row's bar is whole; in its last frames it empties and the row fades toward the pane.
  await answer($, 'solo-1')
  const barOf = async () => row(await painted(ui), /scan the docs +━/).filter(r => r.t.includes('━'))
  await clock.advance(2_000)
  const whole = await barOf()
  expect(whole.every(r => r.c !== P.track)).toBe(true)
  await clock.advance(LINGER_MS - 2_000 - 300)
  const going = await barOf()
  expect(going.some(r => r.c !== undefined && !whole.some(w => w.c === r.c))).toBe(true)
  await clock.advance(600)
  expect(await has(ui, /scan the docs/)).toBe(false)
  await ui.unmount()
})

test('the agents group fits every width from 34 to 96, alone and with every agent open', () => {
  const agent = (n: number, more: Partial<Agent>): Agent => soloAgent({ key: `k${n}`, id: `a${n}`, label: 'an agent whose description is much longer than any narrow pane', kind: 'general-purpose', startedAt: 0, tools: 123, tokOut: 1_234_567, ...more })
  const log = [{ tool: 'mcp__server__a_tool_with_a_long_name', what: 'src/a/very/long/path/to/a/file-with-a-long-name.test.tsx', ms: 123_456, failed: true }]
  const solo = [
    agent(1, { calls: [{ id: 'c', tool: 'Bash', what: 'pnpm run a-very-long-script-name --with --many --flags --that --go --on', at: 0 }], log, steer: 'a steer message long enough to be cut' }),
    agent(2, { label: 'x', kind: 'Explore' }), agent(3, { status: 'queued' }),
    agent(4, { status: 'done', endedAt: 4_000_000, log }), agent(5, { status: 'failed', endedAt: 60_000, stopped: true, label: 'short' }),
  ]
  const VIEW: View = { folded: [], sel: '', open: solo.map(soloKey), mode: '', target: '', at: 0, hidden: false, cols: 0, colsFrom: 0, colsAt: 0 }
  for (const view of [VIEW, { ...VIEW, open: [] }, { ...VIEW, mode: 'steer' as const, target: soloKey(solo[0] as Agent) }]) {
    for (let w = 34; w <= 96; w++) {
      const drawn = compose({ w, rows: 600, P, now: 4_000_500, runs: [], view, plan: null, way: { active: false, root: '', touched: '', chosen: '', hint: '', open: [] }, map: null, solo })
      expect([w, drawn.lines.filter(l => cells(l) > w).length]).toEqual([w, 0])
      // Every card and the summary box keep their right border under their corner.
      const texts = drawn.lines.map(l => l.map(p => ('t' in p ? p.t : 'btn' in p ? ' '.repeat(Math.max(p.btn.pad ?? 0, p.btn.label.length)) : ' '.repeat(p.inp.width))).join(''))
      const edges = new Set(texts.filter(l => /^ {1,2}┆ {2}[╭│╰].*[╮│╯]$/.test(l)).map(l => l.length))
      expect([w, edges.size]).toEqual([w, 1])
      expect(drawn.order).toHaveLength(5)
    }
  }
})
