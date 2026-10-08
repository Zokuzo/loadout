import { expect, mock, test } from 'claude-code/testing'

import { agentView, brief, busy, gist, kindOf, lingering, newRun, nextPhase, noted, parseMeta, parseSites, RUN_LINGER_MS, runView, seatOf, targetOf, toHistory, toPlan, verbOf } from '../hooks/lib'
import { PALETTES } from '../hooks/palette'
import type { Agent } from '../../types'
import { answer, engine, HIST, inAgent, lines, notify, paint, pane, ROUNDS, SCRIPT, spawn, step } from './kit'
import type { Node } from './kit'

const P = PALETTES.handoff
type Ui = { drawn: () => Promise<unknown>; findAll: (q: { type: string }) => Promise<{ key: string | undefined; text: string; props: Record<string, unknown> }[]> }
const BAND = { plugin: 'loadout', surface: 'terminal', component: 'AbovePrompt', requestId: 'band', props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} } } as const
/** The names of the runs drawn, top to bottom: one summary box each. */
const boxes = async (ui: Ui) => (await text(ui)).flatMap(l => l.match(/╭─ workflow (\S+) /)?.[1] ?? [])
/** No list of past runs: no heading, no Button that opens a run, no digit hotkey. */
const noList = async (ui: Ui) => {
  expect((await text(ui)).filter(l => /recent runs|press one for/i.test(l))).toEqual([])
  expect((await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('run:') === true || /^\d$/.test(String(b.props.hotkey ?? ''))).map(b => b.key)).toEqual([])
}
const text = async (ui: Ui) => lines((await ui.drawn()) as Node).map(l => l.trimEnd())
/** The style of the first run of cells holding `part`. */
const styleOf = async (ui: Ui, part: string | RegExp) => paint((await ui.drawn()) as Node).flat().find(r => (typeof part === 'string' ? r.t.includes(part) : part.test(r.t)))
const AGENT: Agent = { key: 'k', n: 1, id: 'a', label: 'x', model: '', status: 'running', startedAt: 0, endedAt: 0, tools: 0, calls: [], phase: 0, tokIn: 0, tokOut: 0, log: [], steer: '', stepIn: 0, stepOut: 0 }

test('parseMeta reads the name and the phase titles', () => {
  expect(parseMeta(SCRIPT)).toEqual({ name: 'ship-it', phases: ['Scan', 'Review'] })
  expect(parseMeta("export const meta = { phases: ['a', 'b'], name: \"x\" }")).toEqual({ name: 'x', phases: ['a', 'b'] })
  expect(parseMeta('agent()')).toEqual({ phases: [] })
})

test('toPlan refuses a malformed plan', () => {
  expect(typeof toPlan({ title: 't', steps: [{ label: 'a', status: 'nope' }] })).toBe('string')
  expect(toPlan({ title: 't', steps: [{ label: 'a', status: 'done' }] })).toEqual({ title: 't', steps: [{ label: 'a', status: 'done' }] })
})

test('progress is elapsed over the estimate, capped at 99%; past it the agent is over; with no history there is neither', () => {
  const run = { ...newRun({ callId: 'c', name: 'r', phases: ['one', 'two'], startedAt: 0 }), agents: [AGENT] }
  // No history and no agent of the run finished: no estimate, an indeterminate bar, an open ETA.
  expect(agentView(run, AGENT, 10_000, {})).toMatchObject({ est: null, prog: null, rem: null, over: 0, el: 10_000 })
  expect(runView(run, 10_000, {})).toMatchObject({ eta: 0, isOpen: true, at: 0 })
  // History of the same name: 60s of a 240s mean is 25%, 180s left.
  const known = { 'a:x': [2, 480_000] as [number, number] }
  expect(agentView(run, AGENT, 60_000, known)).toMatchObject({ est: 240_000, prog: 0.25, rem: 180_000, over: 0 })
  // Past the estimate: 99%, nothing left, 60s over.
  expect(agentView(run, AGENT, 300_000, known)).toMatchObject({ prog: 0.99, rem: 0, over: 60_000 })
  // Without history of its name, the mean of this run's finished agents stands in.
  expect(agentView({ ...run, done: 2, doneMs: 200_000 }, AGENT, 50_000, {}).est).toBe(100_000)
  // The run: the running phase's longest remainder plus the pending phase's past duration; the mean of the phases' progress.
  const view = runView(run, 60_000, { ...known, 'p:r/two': [1, 120_000] })
  expect(view).toMatchObject({ eta: 300_000, isOpen: false, pct: 0.125, at: 0 })
  expect(view.phases.map(p => [p.status, p.word])).toEqual([['run', '1m 00s'], ['pend', '~2m 00s']])
  // Done is 1, and a number in a name is not part of it: "polish:round-2" learns from "polish:round-1".
  expect(agentView(run, { ...AGENT, status: 'done', endedAt: 5_000 }, 60_000, {})).toMatchObject({ prog: 1, rem: 0 })
  expect(agentView(run, { ...AGENT, label: 'polish:round-2' }, 30_000, noted({}, 'a:polish:round-#', 60_000)).prog).toBe(0.5)
  expect(toHistory({ a: [1, 5], b: 'x', c: [0, 0] })).toEqual({ a: [1, 5] })
})

test('a phase\'s time is the time its agents ran: a phase the script comes back to, or a resumed run, does not count the time between', () => {
  expect(busy([])).toBe(0)
  expect(busy([[0, 10], [5, 20], [50, 60], [52, 55]])).toBe(30)
  const MIN = 60_000
  const done = (n: number, phase: number, from: number, to: number): Agent => ({ ...AGENT, key: `k${n}`, n, id: `a${n}`, status: 'done', phase, startedAt: from * MIN, endedAt: to * MIN })
  // build 20m, critique 10m, polish 15m, critique 10m, polish 15m, with the two titles declared once each.
  const run = { ...newRun({ callId: 'c', name: 'r', phases: ['build', 'critique', 'polish'], startedAt: 0 }), endedAt: 70 * MIN, outcome: 'completed',
    agents: [done(1, 0, 0, 20), done(2, 1, 20, 30), done(3, 2, 30, 45), done(4, 1, 45, 55), done(5, 2, 55, 70)] }
  expect(runView(run, 70 * MIN, {}).phases.map(p => p.el / MIN)).toEqual([20, 20, 30])
})

// (Four hours of the mocked clock at the pane's 150 ms beat: about 4 s of the 5 a test has by default, so it is given more.)
test('a resumed run\'s ELAPSED leaves out the time it was not running', { timeoutMs: 20_000 }, async ($, on) => {
  const { clock, world } = engine(on)
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT })
  await $.agent.spawn(spawn(1, 'scan the repo'))
  await clock.advance(20 * 60_000)
  await $.prompt.submit(notify('killed'))
  await clock.advance(4 * 3_600_000)
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-2', script: SCRIPT, resumeFromRunId: 'wf_1' })
  await $.agent.spawn({ ...spawn(1, 'scan the repo'), tool_use_id: 'call-2' })
  await clock.advance(5 * 60_000)
  const ui = await $.ui.mount(pane(60, 40))
  world.isUp = true
  await clock.advance(1_000)
  const seen = await text(ui)
  expect(seen.find(l => /^ {2}│ \S+ +\d+m \d+s +\S+ +│$/.test(l))).toMatch(/ 25m 0\ds /)
  // The phase's own time too: the 5 minutes its agent has run since the resume took the failed one's place.
  expect(seen.some(l => /^ {2}[◐◓◑◒] {2}Scan ×1 +5m 0\ds$/.test(l))).toBe(true)
  await ui.unmount()
})

test('a Workflow call with both a script and a scriptPath is read from the file, as the tool runs it', async ($, on) => {
  engine(on, { hist: HIST, disk: { '/s/rounds.js': ROUNDS } })
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT, scriptPath: '/s/rounds.js' })
  await $.agent.spawn(spawn(1, 'ship-check'))
  const ui = await $.ui.mount(pane(60, 40))
  const seen = await text(ui)
  expect(seen.filter(l => /^ {2}\S {2}(review|polish|ship|Scan|Review)\b/.test(l)).map(l => l.trim().split(/\s+/)[1])).toEqual(['review', 'polish', 'review', 'polish', 'ship'])
  expect(seen[0]).toMatch(/phase 5\/5/)
  await ui.unmount()
})

test('a scriptPath that cannot be read falls back to the script the call carries', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT, scriptPath: '/s/gone.js' })
  const ui = await $.ui.mount(pane(60, 40))
  expect((await text(ui)).filter(l => /^ {2}○ {2}/.test(l)).map(l => l.trim().split(/\s+/)[1])).toEqual(['Scan', 'Review'])
  await ui.unmount()
})

test('a call is summed up, classed as the color-rows mod classes it, and worded as the handoff words it', () => {
  expect(gist({ command: 'npm   test\n--watch' })).toBe('npm test --watch')
  expect(gist({ file_path: '/home/me/app/src/auth.ts' })).toBe('src/auth.ts')
  expect(gist({ limit: 3 })).toBe('')
  expect([kindOf('Bash'), kindOf('Edit'), kindOf('mcp__playwright__click'), kindOf('mcp__x__y'), kindOf('constructor')]).toEqual(['shell', 'edit', 'web', 'mcp', 'other'])
  expect(['Read', 'Grep', 'Edit', 'Write', 'Bash', 'mcp__x__y'].map(verbOf)).toEqual(['reading', 'searching', 'editing', 'writing', 'running', 'calling'])
  // A file tool's target is the file's name; a command or a pattern is shown whole; a search is named by its pattern, not its directory.
  expect([targetOf('Read', 'src/auth.ts'), targetOf('Bash', 'pnpm test'), targetOf('mcp__x__y', '')]).toEqual(['auth.ts', 'pnpm test', 'y'])
  expect(brief('Grep', { path: '/repo/src', pattern: '"TODO"' })).toBe('"TODO"')
})

test('an agent joins the wave of the agents still running, and opens the next once they all finished', () => {
  expect(nextPhase([])).toBe(0)
  expect(nextPhase([{ ...AGENT, status: 'running', phase: 0 }])).toBe(0)
  expect(nextPhase([{ ...AGENT, status: 'done', phase: 0 }, { ...AGENT, status: 'failed', phase: 0 }])).toBe(1)
})

test('the script says which phase an agent is in: by its label, its phase option or its prompt, and a title used twice in order', () => {
  const sites = parseSites(ROUNDS)
  expect(sites.map(s => [s.phase, s.label.replace('\u0000', '*')])).toEqual([
    ['review', 'code-review:round-*'], ['review', 'art-director:round-*'], ['polish', 'polish:round-*'], ['polish', 'sprites:round-*'], ['ship', 'ship-check'],
  ])
  const run = { ...newRun({ callId: 'c', name: 'r', phases: parseMeta(ROUNDS).phases, sites, startedAt: 0 }) }
  const done = (phase: number): Agent => ({ ...AGENT, status: 'done', phase })
  expect(seatOf(run, 'code-review:round-1', '')?.phase).toBe(0)
  expect(seatOf({ ...run, agents: [done(0)] }, 'polish:round-1', '')?.phase).toBe(1)
  // The second round: "review" is the first review phase not yet passed.
  expect(seatOf({ ...run, agents: [done(0), done(1)] }, 'art-director:round-2', '')?.phase).toBe(2)
  expect(seatOf({ ...run, agents: [done(0), done(1), done(2)] }, 'sprites:round-2', '')?.phase).toBe(3)
  expect(seatOf(run, 'ship-check', '')?.phase).toBe(4)
  // A label no call site writes says nothing: the caller falls back to the waves.
  expect(seatOf(run, 'something else', 'an unknown prompt')).toBeNull()
  // The phase option wins over the phase() above; with no label the prompt's opening, or the description cut from it, finds the site.
  const loose = parseSites("phase('A')\nawait agent(`Verify the claim about ${x} carefully`, { phase: 'B' })\nawait agent('Summarise everything that was found')")
  expect(loose.map(s => s.phase)).toEqual(['B', 'A'])
  const other = { ...run, phases: ['A', 'B'], sites: loose }
  expect(seatOf(other, 'agent 1', 'Verify the claim about tokens carefully')?.phase).toBe(1)
  expect(seatOf(other, 'Summarise everything…', '<placeholder>')?.phase).toBe(0)
  // A phase() title meta does not list is a phase of its own, after the declared ones; a computed title is unknown.
  expect(seatOf({ ...run, phases: ['A'], sites: parseSites("phase('Extra')\nawait agent('p', { label: 'late' })") }, 'late', '')).toEqual({ phase: 1, phases: ['A', 'Extra'] })
  expect(seatOf({ ...run, sites: parseSites("phase(title)\nawait agent('p', { label: 'late' })") }, 'late', '')).toBeNull()
  // However long the prompt literal, the options after it are read: its own phase, not the phase() above.
  const long = parseSites(`phase('A')\nawait agent(\`${'x'.repeat(7000)} (see \${notes})\`, { label: 'long one', phase: 'B' })\nawait agent('next', { label: 'after' })`)
  expect(long.map(s => [s.phase, s.label])).toEqual([['B', 'long one'], ['A', 'after']])
})

test('an agent that runs a second turn: each turn\'s tokens count once, its steps\' not twice', async ($, on) => {
  const { world } = engine(on)
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT })
  await $.agent.spawn(spawn(1, 'scan the repo'))
  const ui = await $.ui.mount(pane(60, 40))
  const out = async () => (await text(ui)).find(l => /^ {2}│ \S+ +\S+ +[\d.]+k? +│$/.test(l))?.match(/([\d.]+k?) +│$/)?.[1]
  world.stepOut = 20_000
  await step($, 'agent-1')
  expect(await out()).toBe('20.0k')
  // The turn's own total holds what its step counted.
  await answer($, 'agent-1', 20_000)
  expect(await out()).toBe('20.0k')
  // A second turn, cheaper than the first, adds its whole cost.
  await answer($, 'agent-1', 5_000)
  expect(await out()).toBe('25.0k')
  await ui.unmount()
})

test('a resume with renamed phases shows the new titles in place, and seats its agents in them', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT })
  await $.agent.spawn(spawn(1, 'scan the repo'))
  await answer($, 'agent-1')
  await $.prompt.submit(notify('killed'))
  const edited = SCRIPT.replaceAll('Review', 'Report')
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-2', script: edited, resumeFromRunId: 'wf_1' })
  await $.agent.spawn({ ...spawn(3, 'write the report'), tool_use_id: 'call-2' })
  const ui = await $.ui.mount(pane(60, 40))
  const seen = await text(ui)
  expect(seen.filter(l => /^ {2}\S {2}(Scan|Report|Review)/.test(l)).map(l => l.trim().split(/\s+/)[1])).toEqual(['Scan', 'Report'])
  expect(seen[0]).toMatch(/phase 2\/2/)
  await ui.unmount()
})

test('a two-phase run is drawn as the handoff draws it: the summary, the rail, cards for running agents, rows for finished ones', async ($, on) => {
  const { clock, world } = engine(on)
  world.isUp = true
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT })
  await $.agent.spawn(spawn(1, 'scan the repo'))
  await $.agent.spawn(spawn(2, 'review auth'))
  const ui = await $.ui.mount(pane(60, 40))

  // The summary box, titled with the run's name and the phase it is in; the first phase running with two cards.
  let seen = await text(ui)
  expect(seen[0]).toMatch(/^ {2}╭─ workflow ship-it ─+ phase 1\/2 ─╮$/)
  expect(seen.some(l => /^ {2}│ ETA +ELAPSED +TOKENS OUT +│$/.test(l))).toBe(true)
  expect(seen.some(l => /^ {2}[◐◓◑◒] {2}Scan ×2 +0s$/.test(l))).toBe(true)
  expect((await styleOf(ui, 'Scan'))).toMatchObject({ c: P.yellow, b: true })
  expect(seen.some(l => /^ {2}○ {2}Review$/.test(l))).toBe(true)
  expect((await styleOf(ui, 'Review'))?.c).toBe(P.text4)
  expect(seen.filter(l => /^ {2}┆ {2}╭─+╮$/.test(l))).toHaveLength(2)
  expect(seen.filter(l => /∴ thinking +eta —/.test(l))).toHaveLength(2)
  // A card's Button is its tool count (a Button's label cannot be bold, and the running name must be): pressing it lists the calls.
  expect((await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('ag:')).map(b => b.text)).toEqual(['0 tools', '0 tools'])
  expect((await styleOf(ui, 'scan the repo'))).toMatchObject({ c: P.fg, b: true })

  // Agent 2 runs a tool: its card names it with the handoff's verb, in the shell's colour, and counts it.
  const bash = inAgent($, 'agent-2', { tool: 'Bash', tool_use_id: 'b1', command: 'ls -la' })
  await clock.advance(2_000)
  expect((await styleOf(ui, '▸ running ls -la'))?.c).toBe(P.violet)
  expect((await text(ui)).filter(l => /∴ thinking/.test(l))).toHaveLength(1)
  await clock.advance(58_000)
  await bash
  expect((await text(ui)).some(l => /│ ↓ 0 out {3}1 tool +1m 00s │$/.test(l))).toBe(true)

  // Agent 1 answers: it becomes one row with its bar, its mark and its tokens out, and the summary follows.
  await answer($, 'agent-1')
  seen = await text(ui)
  expect(seen.some(l => /^ {2}┆ {2}scan the repo ━+ {2}✓ {5}50$/.test(l))).toBe(true)
  expect((await styleOf(ui, '✓'))?.c).toBe(P.green)
  // One agent finished, so the other has an estimate (99% of it); the Review phase has no history, so the run's ETA stays open.
  expect(seen.some(l => /│ —\s+1m 00s\s+50\s+│$/.test(l))).toBe(true)
  expect(seen.some(l => /│ review auth +99% │$/.test(l))).toBe(true)

  // Both finished, then a third agent starts: its label is the script's "write the report", so it is in Review.
  await answer($, 'agent-2')
  await $.agent.spawn(spawn(3, 'write the report'))
  seen = await text(ui)
  expect(seen.some(l => /^ {2}● {2}Scan ×2 +1m 00s$/.test(l))).toBe(true)
  expect((await styleOf(ui, 'Scan'))?.c).toBe(P.text2)
  expect(seen.some(l => /^ {2}[◐◓◑◒] {2}Review ×1 +0s$/.test(l))).toBe(true)
  expect(seen[0]).toMatch(/phase 2\/2/)
  expect(seen.some(l => /^ {5}│ write the report/.test(l))).toBe(true)

  // The fold key, set into the footer's divider, hides the finished agents behind one line, and shows them again.
  expect(seen[seen.length - 2]).toMatch(/^─+ k: ↑ {2}j: ↓ {2}f: fold {2}n: narrow {2}w: wide ──$/)
  await ui.press({ key: 'fold:call-1' })
  seen = await text(ui)
  expect(seen).toContain('  │  ✓ 2 finished')
  expect(seen.some(l => /scan the repo/.test(l))).toBe(false)
  expect((await ui.find({ key: 'fold:call-1' }))?.text).toBe('unfold')
  await ui.press({ key: 'fold:call-1' })
  expect((await text(ui)).some(l => /scan the repo/.test(l))).toBe(true)

  // The task's notification ends the run: its diagram stays on screen, in its final state.
  await $.prompt.submit(notify('completed'))
  seen = await text(ui)
  // Over, the title still counts the phases; that it is done is the ETA cell's to say, beside the run's time and tokens out.
  expect(seen[0]).toMatch(/^ {2}╭─ workflow ship-it ─+ phase 2\/2 ─╮$/)
  expect(seen.some(l => /│ done\s+1m 00s\s+100\s+│$/.test(l))).toBe(true)
  expect(seen.some(l => /│ ■+ +100% │$/.test(l))).toBe(true)
  // Agent 3 never reported its end: it took the run's outcome, and its phase is done.
  expect(seen.some(l => /^ {2}● {2}Review ×1 /.test(l))).toBe(true)
  expect(seen.some(l => /write the report +━+ {2}✓ +0$/.test(l))).toBe(true)
  expect(seen.some(l => /[◐◓◑◒]/.test(l))).toBe(false)
  await noList(ui)
  // No agent runs: none is selected.
  expect(paint((await ui.drawn()) as Node).flat().some(r => r.bg === P.select)).toBe(false)
  expect((await styleOf(ui, /^done\s/))).toMatchObject({ c: P.green, b: true })
  await ui.unmount()
})

test('a short pane folds the finished phase to its header and keeps the running agent whole', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT })
  await $.agent.spawn(spawn(1, 'scan the repo'))
  await answer($, 'agent-1')
  await $.agent.spawn(spawn(2, 'write the report'))
  const ui = await $.ui.mount(pane(34, 19))
  const seen = await text(ui)
  expect(seen.some(l => /^ ● {2}Scan ×1 +0s$/.test(l))).toBe(true)
  expect(seen.some(l => /scan the repo/.test(l))).toBe(false)
  expect(seen.some(l => /│ write the report +│$/.test(l))).toBe(true)
  expect(seen.some(l => /∴ thinking/.test(l))).toBe(true)
  expect(seen.length).toBeLessThanOrEqual(19)
  await ui.unmount()
})

test('an agent running two tools at once shows the latest still running, not an empty slot', async ($, on) => {
  const { clock, world } = engine(on)
  world.isUp = true
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT })
  await $.agent.spawn(spawn(1, 'scan the repo'))
  const ui = await $.ui.mount(pane(60, 40))
  const bash = inAgent($, 'agent-1', { tool: 'Bash', tool_use_id: 'b1', command: 'npm test' })
  await clock.advance(1_000)
  const peek = inAgent($, 'agent-1', { tool: 'Read', tool_use_id: 'r1', file_path: '/repo/src/auth.ts' })
  await clock.advance(500)
  expect((await text(ui)).some(l => /▸ reading auth\.ts/.test(l))).toBe(true)
  await clock.advance(1_000)
  await peek
  expect((await text(ui)).some(l => /▸ running npm test/.test(l))).toBe(true)
  await clock.advance(3_000)
  await bash
  const seen = await text(ui)
  expect(seen.some(l => /∴ thinking/.test(l))).toBe(true)
  expect(seen.some(l => / 2 tools /.test(l))).toBe(true)
  await ui.unmount()
})

test('a resume that is refused leaves the finished run as it was', async ($, on) => {
  const { clock, world } = engine(on)
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT })
  await clock.advance(10_000)
  await $.prompt.submit(notify('completed'))
  await clock.advance(60_000)
  world.isRefused = true
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-2', script: SCRIPT, resumeFromRunId: 'wf_1' })
  const ui = await $.ui.mount(pane(60, 40))
  // Still on screen as it ended a minute ago: done, its 10 seconds, and no second run made of the refused call.
  const seen = await text(ui)
  expect(await boxes(ui)).toEqual(['ship-it'])
  expect(seen.some(l => /│ done\s+10s\s/.test(l))).toBe(true)
  expect(seen.some(l => /not started/.test(l))).toBe(false)
  expect(seen.some(l => /[◐◓◑◒]/.test(l))).toBe(false)
  await noList(ui)
  await ui.unmount()
})

test('a resumed run puts the agent it runs again back in its own phase, in place of the failed one', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT })
  await $.agent.spawn(spawn(1, 'scan the repo'))
  await $.agent.spawn(spawn(2, 'review auth'))
  await answer($, 'agent-1')
  await answer($, 'agent-2')
  await $.agent.spawn(spawn(3, 'write the report'))
  await $.prompt.submit(notify('killed'))
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-2', script: SCRIPT, resumeFromRunId: 'wf_1' })
  const ui = await $.ui.mount(pane(60, 40))
  // Before its agent is raised again, the cut agent reads stopped, not running.
  let seen = await text(ui)
  expect(seen.some(l => /^ {2}■ {2}Review ×1 +failed$/.test(l))).toBe(true)
  expect((await styleOf(ui, 'Review'))).toMatchObject({ c: P.red, b: true })
  expect(seen.some(l => /write the report +━* {2}■ +0$/.test(l))).toBe(true)
  await $.agent.spawn({ ...spawn(3, 'write the report'), tool_use_id: 'call-2' })
  seen = await text(ui)
  expect(seen.some(l => /^ {2}[◐◓◑◒] {2}Review ×1 /.test(l))).toBe(true)
  expect(seen.filter(l => /write the report/.test(l))).toHaveLength(1)
  expect(seen.some(l => /stage 3/.test(l))).toBe(false)
  await ui.unmount()
})

test('an ended run shows no agent still running: one that never reported took the run\'s outcome', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT })
  await $.agent.spawn(spawn(1, 'scan the repo'))
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })
  const ui = await $.ui.mount(pane(60, 40))
  let seen = await text(ui)
  expect(seen.some(l => /│ ended\s/.test(l))).toBe(true)
  expect(seen.some(l => /^ {2}■ {2}Scan ×1 +failed$/.test(l))).toBe(true)
  expect(seen.some(l => /╭─+╮/.test(l) && /┆/.test(l))).toBe(false)
  // The real outcome arrives: the same agent reads done.
  await $.prompt.submit(notify('completed'))
  seen = await text(ui)
  expect(seen.some(l => /^ {2}● {2}Scan ×1 /.test(l))).toBe(true)
  expect(seen.some(l => /│ done\s/.test(l))).toBe(true)
  expect(seen.some(l => /scan the repo +━* {2}✓ /.test(l))).toBe(true)
  await ui.unmount()
})

test('ten runs live at once all show, and the one fold key serves the first run with finished agents; once they end, only the last to end stays', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('tool.call', (_, e) => ({ result: { status: 'async_launched', taskId: `task-${e.tool_use_id}`, runId: `wf_${e.tool_use_id}`, workflowName: 'ship-it' } as never }))
  on('agent.spawn', (_, e) => ({ model: 'sonnet', agentId: `agent-${e.workflow?.runId}` }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.Stop', () => ({}))
  for (let i = 0; i < 10; i++) await $.tool.call({ tool: 'Workflow', tool_use_id: `c${i}`, script: SCRIPT })
  for (const i of [0, 1]) {
    await $.agent.spawn({ ...spawn(1, 'scan the repo', 'p', `wf_c${i}`), tool_use_id: `c${i}` })
    await answer($, `agent-wf_c${i}`)
  }
  const ui = await $.ui.mount(pane(60, 400))
  expect(await boxes(ui)).toHaveLength(10)
  const folds = (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('fold:'))
  expect(folds.map(b => [b.key, b.props.hotkey])).toEqual([['fold:c0', 'f']])
  await noList(ui)
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })
  expect(await boxes(ui)).toHaveLength(1)
  await noList(ui)
  await ui.unmount()
})

test('a run the Stop backstop marked ended takes its real outcome from the notification that follows', async ($, on) => {
  const { clock } = engine(on)
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT })
  await clock.advance(10_000)
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })
  const ui = await $.ui.mount(pane(60, 40))
  expect((await text(ui)).some(l => /│ ended\s+10s\s/.test(l))).toBe(true)
  await clock.advance(5_000)
  await $.prompt.submit(notify('failed'))
  // Failed: the ETA is the red dash and the phases not reached are on hold; the run still ended when the backstop saw it.
  const seen = await text(ui)
  expect(seen.some(l => /│ —\s+10s\s/.test(l))).toBe(true)
  expect(seen.some(l => /│ ended\s/.test(l))).toBe(false)
  expect(seen.filter(l => /^ {2}○ {2}\w+ +on hold$/.test(l))).toHaveLength(2)
  expect((await styleOf(ui, /^—\s/))).toMatchObject({ c: P.red, b: true })
  await ui.unmount()
})

test('agents spawned before the Workflow call answered, with no call id, end up in one run that still ends', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('agent.spawn', () => ({ model: 'sonnet', agentId: 'agent-1' }))
  on('prompt.submit', (_, e) => e)
  on('tool.call', async () => {
    await $.agent.spawn({ ...spawn(1, 'early bird'), tool_use_id: '' })
    return { result: { status: 'async_launched', taskId: 'task-7', runId: 'wf_1', workflowName: 'ship-it' } as never }
  })
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT })
  const ui = await $.ui.mount(pane(60, 40))
  let seen = await text(ui)
  expect(seen.filter(l => /╭─ workflow ship-it /.test(l))).toHaveLength(1)
  // No call site of the script reads "early bird": the waves seat it, in the first phase.
  expect(seen.some(l => /^ {2}[◐◓◑◒] {2}Scan ×1 /.test(l))).toBe(true)
  expect(seen.some(l => /^ {2}○ {2}Review$/.test(l))).toBe(true)
  await $.prompt.submit({ text: '<task-id>task-7</task-id><status>killed</status>', wait: false, origin: { kind: 'task-notification' } })
  seen = await text(ui)
  expect(await boxes(ui)).toEqual(['ship-it'])
  expect(seen.some(l => /^ {2}■ {2}Scan ×1 +stopped$/.test(l))).toBe(true)
  expect(seen.some(l => /early bird +━* {2}■ /.test(l))).toBe(true)
  await ui.unmount()
})

test('the steps tool replaces the plan, drawn on the same rail as a run\'s phases', async $ => {
  const posted = await $.tool.call({
    tool: 'mcp__loadout__steps', tool_use_id: 's1', title: 'Tune the downhill setup',
    steps: [
      { label: 'Import clips', status: 'done' },
      { label: 'Rough cut', status: 'active' },
      { label: 'Colour grade', status: 'pending' },
      { label: 'Export', status: 'blocked' },
    ],
  })
  expect(posted.result).toBe('Plan shown: step 2 of 4.')
  const ui = await $.ui.mount(pane(60, 40))
  const seen = await text(ui)
  expect(seen.some(l => /^ {2}╭─ Tune the downhill setup ─+ 1\/4 ─╮$/.test(l))).toBe(true)
  expect(seen.some(l => /│ step 2 of 4 · 1 of 4 done +│$/.test(l))).toBe(true)
  expect(seen.some(l => /│ ■+ +25% │$/.test(l))).toBe(true)
  // Each step has its status's node and colour: done, active (the spinner, bold, its place at the line's end), pending, blocked.
  expect(seen.some(l => /^ {2}● {2}Import clips$/.test(l))).toBe(true)
  expect(seen.some(l => /^ {2}[◐◓◑◒] {2}Rough cut +2\/4$/.test(l))).toBe(true)
  expect(seen.some(l => /^ {2}○ {2}Colour grade$/.test(l))).toBe(true)
  expect(seen.some(l => /^ {2}■ {2}Export +blocked$/.test(l))).toBe(true)
  expect((await styleOf(ui, 'Import clips'))?.c).toBe(P.text2)
  expect((await styleOf(ui, 'Rough cut'))).toMatchObject({ c: P.yellow, b: true })
  expect((await styleOf(ui, 'Colour grade'))?.c).toBe(P.text4)
  expect((await styleOf(ui, 'Export'))).toMatchObject({ c: P.red, b: true })
  // Three connectors join the four nodes: solid under a done step, dashed under the others.
  expect(seen.filter(l => /^ {2}[│┆]$/.test(l))).toEqual(['  │', '  ┆', '  ┆'])
  // The plan stands in the run's place: the empty state's line is gone.
  expect(seen.some(l => /No workflow is running/.test(l))).toBe(false)
  await ui.unmount()

  const bad = await $.tool.call({ tool: 'mcp__loadout__steps', tool_use_id: 's2', title: 'x', steps: 'nope' })
  expect(bad.deny ?? bad.text).toMatch(/steps:/)
})

test('the system prompt gains one session section when the tool is offered', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' as const }] }))
  const base = { model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, traits: [] } as const
  const withTool = await $.prompt.compose({ ...base, tools: ['mcp__loadout__steps'] })
  expect(withTool.sections.map(s => s.id)).toEqual(['intro', 'flow-map:steps'])
  expect((await $.prompt.compose({ ...base, tools: [] })).sections).toHaveLength(1)
})

// ── A finished run: on screen as it ended, until a run starts or 3 minutes pass. No list of past runs. ──

test('lingering: the last run to end, for 3 minutes, unless a run began after it; a run that never started is not one', () => {
  const run = (callId: string, endedAt: number | null, outcome = 'completed') => ({ ...newRun({ callId, name: 'r', phases: [], startedAt: 0 }), endedAt, outcome })
  const [a, b, live, never] = [run('a', 100), run('b', 200, 'killed'), run('c', null, ''), run('d', 300, 'not started')]
  expect(lingering([a, b, live, never], 250, 0)?.callId).toBe('b')
  expect(lingering([b, a], 200 + RUN_LINGER_MS - 1, 0)?.callId).toBe('b')
  expect(lingering([a, b], 200 + RUN_LINGER_MS, 0)).toBeUndefined()
  // A run began after it ended: it is gone, and the one that ended before it does not come back.
  expect(lingering([a, b, live], 250, 201)).toBeUndefined()
  // A run that was already live when it ended sends nothing away.
  expect(lingering([a, b, live], 250, 150)?.callId).toBe('b')
  expect([lingering([live], 250, 0), lingering([never], 310, 0), lingering([], 0, 0)]).toEqual([undefined, undefined, undefined])
  expect(RUN_LINGER_MS).toBe(180_000)
})

for (const [status, eta, hue, scan, review] of [
  ['completed', /│ done\s+20s\s/, P.green, /^ {2}● {2}Scan ×1 +20s$/, /^ {2}○ {2}Review +skipped$/],
  ['failed', /│ —\s+20s\s/, P.red, /^ {2}■ {2}Scan ×1 +stopped$/, /^ {2}○ {2}Review +on hold$/],
  ['killed', /│ —\s+20s\s/, P.red, /^ {2}■ {2}Scan ×1 +stopped$/, /^ {2}○ {2}Review +on hold$/],
] as const) {
  test(`a ${status} run stays on screen in its final state, leaves after 3 minutes without a new run, and is drawn once more only then`, async ($, on) => {
    const { clock, world } = engine(on)
    world.isUp = true
    await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT })
    await $.agent.spawn(spawn(1, 'scan the repo'))
    const ui = await $.ui.mount(pane(60, 40))
    await clock.advance(20_000)
    await $.prompt.submit(notify(status))
    await clock.advance(1_000)
    // How it ended: the summary box, the phase it reached and the ones it did not, nothing running, nothing to steer or stop.
    const final = await text(ui)
    expect(final[0]).toMatch(/^ {2}╭─ workflow ship-it ─+ phase 1\/2 ─╮$/)
    expect([status, final.some(l => eta.test(l)), final.some(l => scan.test(l)), final.some(l => review.test(l))]).toEqual([status, true, true, true])
    expect((await styleOf(ui, /^(done|—)\s/))).toMatchObject({ c: hue, b: true })
    expect(final.some(l => /[◐◓◑◒]|∴ thinking/.test(l))).toBe(false)
    expect((await ui.findAll({ type: 'Button' })).filter(b => b.key === 'key:x' || b.key === 'key:s')).toEqual([])
    await noList(ui)
    // It stands still for its 3 minutes: not one cell changes.
    await clock.advance(RUN_LINGER_MS - 30_000)
    expect(await text(ui)).toEqual(final)
    // Then it leaves (within one idle beat), and the pane is its empty state; nothing is drawn after that.
    await clock.advance(35_000)
    const gone = await text(ui)
    expect(gone.slice(0, 3)).toEqual(['  No workflow is running.', '', '  No plan yet. Claude posts one for a 3+ step task.'])
    expect(await boxes(ui)).toEqual([])
    await noList(ui)
    await clock.advance(60_000)
    expect(await text(ui)).toEqual(gone)
    await ui.unmount()
  })
}

test('a finished run leaves at once when a run starts or is resumed; live runs all show, and only the last to end stays beside them; no state lists past runs', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  on('tool.call', (_, e) => {
    const input: Record<string, unknown> = e
    const name = String(input.script ?? '').match(/name: '([^']+)'/)?.[1] ?? 'ship-it'
    return { result: { status: 'async_launched', taskId: `task-${e.tool_use_id}`, runId: String(input.resumeFromRunId ?? `wf_${e.tool_use_id}`), workflowName: name } as never }
  })
  on('agent.spawn', (_, e) => ({ model: 'sonnet', agentId: `agent-${e.workflow?.runId}` }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => e)
  on('classic.Stop', () => ({}))
  on('ui.panes', () => ({ value: [{ id: 'flow-map', title: 'Flow map', isShown: true, isFocused: false, isPlaced: true }] }))
  const start = (id: string, name: string) => $.tool.call({ tool: 'Workflow', tool_use_id: id, script: SCRIPT.replace("'ship-it'", `'${name}'`) })
  const done = async (ui: Ui) => (await text(ui)).some(l => /│ done\s/.test(l))
  const ui = await $.ui.mount(pane(60, 120))
  // Empty.
  expect((await text(ui))[0]).toBe('  No workflow is running.')
  await noList(ui)
  // One run, live, then finished: it stays.
  await start('c0', 'ship-it')
  await $.agent.spawn({ ...spawn(1, 'scan the repo', 'p', 'wf_c0'), tool_use_id: 'c0' })
  await answer($, 'agent-wf_c0')
  await noList(ui)
  await clock.advance(2_000)
  await $.prompt.submit(notify('completed', 'task-c0'))
  expect([await boxes(ui), await done(ui)]).toEqual([['ship-it'], true])
  await noList(ui)
  // A new run starts 5 seconds later: the finished one is gone at once.
  await clock.advance(5_000)
  await start('c1', 'second')
  expect([await boxes(ui), await done(ui)]).toEqual([['second'], false])
  await noList(ui)
  // Two live at once: both show. One ends: it stays under the live one, which was running already.
  await clock.advance(1_000)
  await start('c2', 'third')
  expect(await boxes(ui)).toEqual(['second', 'third'])
  await clock.advance(1_000)
  await $.prompt.submit(notify('killed', 'task-c1'))
  expect(await boxes(ui)).toEqual(['third', 'second'])
  await noList(ui)
  // The other ends too: only the last to end stays.
  await clock.advance(1_000)
  await $.prompt.submit(notify('completed', 'task-c2'))
  expect([await boxes(ui), await done(ui)]).toEqual([['third'], true])
  await noList(ui)
  // A resume is a run starting: the finished one leaves, and none of the earlier ones comes back.
  await clock.advance(1_000)
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'c3', script: SCRIPT, resumeFromRunId: 'wf_c0' })
  expect([await boxes(ui), await done(ui)]).toEqual([['ship-it'], false])
  expect((await text(ui)).some(l => /^ {2}○ {2}Review$/.test(l))).toBe(true)
  // It ends (the Stop backstop), stays, and after 3 minutes the pane is empty again.
  await clock.advance(1_000)
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })
  expect(await boxes(ui)).toEqual(['ship-it'])
  expect((await text(ui)).some(l => /│ ended\s/.test(l))).toBe(true)
  await noList(ui)
  await clock.advance(RUN_LINGER_MS + 5_000)
  expect(await boxes(ui)).toEqual([])
  expect((await text(ui))[0]).toBe('  No workflow is running.')
  await noList(ui)
  await ui.unmount()
})

test('the folded tab follows the same rule: the live run, then the finished one for 3 minutes, then idle', async ($, on) => {
  const { clock } = engine(on)
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: SCRIPT })
  await $.agent.spawn(spawn(1, 'scan the repo'))
  const ui = await $.ui.mount(pane(60, 40))
  await ui.press({ key: 'key:z' })
  const band = await $.ui.mount(BAND)
  const middle = async () => lines((await band.drawn()) as Node)[1] ?? ''
  expect(await middle()).toMatch(/^│ [◐◓◑◒] flow map {2}0% {2}eta — {2}z: show │$/)
  await clock.advance(20_000)
  await $.prompt.submit(notify('completed'))
  await clock.advance(1_000)
  expect(await middle()).toBe('│ ● flow map  100%  completed  z: show │')
  expect(paint((await band.drawn()) as Node)[1]?.[1]?.c).toBe(P.green)
  await clock.advance(RUN_LINGER_MS - 30_000)
  expect(await middle()).toBe('│ ● flow map  100%  completed  z: show │')
  await clock.advance(35_000)
  expect(await middle()).toBe('│ ○ flow map  idle  z: show │')
  await band.unmount()
  await ui.unmount()
})
