// Theme packs: read from the themes folder, the one of the active theme applied, a broken one skipped, and without any the pane as before.
import { expect, test } from 'claude-code/testing'

import { cells, compose, isSeg } from '../hooks/draw'
import type { Line, Seg } from '../hooks/draw'
import { chart } from '../hooks/lib'
import { contrast, filled, lookOf, packOf, PALETTES, STEPS, toPack } from '../hooks/palette'
import type { Pack } from '../hooks/palette'
import type { Plan, View } from '../../types'
import { engine, lines, packFiles, paint, paletteIn, pane, SLUGS } from './kit'
import type { Node } from './kit'
import { PACK_TEXT } from './packs'

type Ui = { drawn: () => Promise<unknown> }
const text = async (ui: Ui) => lines((await ui.drawn()) as Node).map(l => l.trimEnd())
const styleOf = async (ui: Ui, part: string) => paint((await ui.drawn()) as Node).flat().find(r => r.t.includes(part))
const START = { cwd: '/repo', surface: 'terminal', isInteractive: false } as const
const PLAN = { tool: 'mcp__loadout__steps' as const, tool_use_id: 's1', title: 'Tune the downhill setup', steps: [
  { label: 'Import the clips', status: 'done' }, { label: 'Sync the audio', status: 'done' }, { label: 'Rough cut', status: 'active' },
  { label: 'Colour grade', status: 'pending' }, { label: 'Optional: add the outtakes', status: 'pending' }, { label: 'Export for the family', status: 'blocked' },
] as Plan['steps'] }
const PACKS = SLUGS.map(slug => toPack(JSON.parse(PACK_TEXT[slug] ?? 'null')))
const packs = PACKS.filter((p): p is Pack => p !== null)
const VIEW: View = { folded: [], sel: '', open: [], mode: '', target: '', at: 0, hidden: false, cols: 0, colsFrom: 0, colsAt: 0 }

test('every pack file is a pack; the one that serves a theme is its slug, else its longest match, else default; none while the theme is unknown', () => {
  expect(PACKS.map(p => p?.slug)).toEqual([...SLUGS])
  const served = { 'custom:kirby-pink': 'kirby-pink', 'Kirby Pink': 'kirby-pink', 'custom:kirby': 'kirby', 'custom:kirby_night': 'kirby', 'custom:cyberpunk-edgerunners': 'cyberpunk-edgerunners',
    'custom:edgerunners-2': 'cyberpunk-edgerunners', 'custom:ghostrunner': 'ghostrunner', 'Ghostrunner II': 'ghostrunner', 'custom:initial-d': 'initial-d', 'Initial D': 'initial-d',
    // The names from before the rename are no pack's, and no rule reads the word "soft".
    'custom:cyberpunk-soft': 'default', 'custom:cyberpunk': 'default', 'custom:ghostrunner-soft': 'ghostrunner', dark: 'default', 'light-daltonized': 'default', 'custom:vaporwave': 'default' }
  for (const [theme, slug] of Object.entries(served)) expect([theme, packOf(theme, packs)?.slug]).toEqual([theme, slug])
  expect(packOf('', packs)).toBeNull()
  // The pack's palette is the file's, and its steps style the file's with every optional field filled.
  for (const slug of SLUGS) expect([slug, lookOf(`custom:${slug}`, packs).P]).toEqual([slug, Object.fromEntries(Object.entries(paletteIn(slug)).map(([k, v]) => [k, v.toLowerCase()]))])
  expect(lookOf('custom:ghostrunner', packs).S).toMatchObject({ layout: 'list', header: { upper: true, corners: '┌┐└╱' }, meter: { fill: '▰', empty: '▱' }, states: { done: { strike: true, edge: '▌' }, active: { ground: 'select', labelColor: 'blue' } }, captions: { optional: 'OPTIONAL' } })
  expect(filled('stage {i} of {n} · {left} to go, {what}', { i: 3, n: 6, left: 4 })).toBe('stage 3 of 6 · 4 to go, {what}')
})

test('without a pack the pane draws as it did: the built-in palette of the theme and the built-in steps', () => {
  for (const theme of ['', 'dark', 'custom:kirby', 'Kirby Pink', 'ghostrunner', 'cyberpunk-edgerunners', 'soft ghostrunner', 'cyberpunk-soft', 'cyberpunk']) {
    const name = /kirby/i.test(theme) ? (/pink/i.test(theme) ? 'kirby-pink' : 'kirby') : /ghostrunner/.test(theme) ? 'ghostrunner' : /edgerunners/.test(theme) ? 'cyberpunk-edgerunners' : 'handoff'
    expect(lookOf(theme, [])).toEqual({ P: PALETTES[name], S: STEPS })
  }
  // One of the four themes whose own pack is missing or broken keeps its built-in look: not another family's pack through
  // `match` (kirby-pink would turn dark green), not the default one.
  for (const slug of ['kirby', 'kirby-pink', 'ghostrunner', 'cyberpunk-edgerunners'] as const) {
    const rest = packs.filter(p => p.slug !== slug)
    expect([slug, lookOf(`custom:${slug}`, rest)]).toEqual([slug, { P: PALETTES[slug], S: STEPS }])
    // A built-in theme is the default pack's as ever, and a pack of the theme's own slug wins whatever else is missing.
    expect([slug, lookOf('dark', rest).P]).toEqual([slug, packOf('dark', packs)?.palette])
  }
  const night = { ...(packs.find(p => p.slug === 'kirby-pink') as Pack), slug: 'kirby-night', match: [] }
  expect(lookOf('custom:kirby-night', [night]).P).toBe(night.palette)
  // With its family's pack loaded, a theme served through `match` takes that pack.
  expect(lookOf('custom:kirby_night', packs).P).toBe(packs.find(p => p.slug === 'kirby')?.palette)
  // A theme not read yet has no pack, whatever is loaded.
  expect(lookOf('', packs)).toEqual({ P: PALETTES.handoff, S: STEPS })
  // A pack written to the first schema (no layout, meter, edge, ground, templates) is the built-in steps exactly.
  const first = JSON.parse(PACK_TEXT.default ?? '{}') as { flow: { steps: unknown } }
  first.flow.steps = {
    header: { style: 'boxed', prefix: '', color: 'cyan', frame: 'border' },
    states: {
      done: { glyph: '●', color: 'text2', bold: false, rail: '│', railColor: 'railDone' }, active: { glyph: '◐', color: 'yellow', bold: true, rail: '┆', railColor: 'railRun' },
      pending: { glyph: '○', color: 'text4', bold: false, rail: '┆', railColor: 'border' }, blocked: { glyph: '■', color: 'red', bold: true, rail: '┆', railColor: 'border' },
    },
    cycle: { glyphs: ['◐', '◓', '◑', '◒'], ms: 450 },
    captions: { title: 'steps', active: '', blocked: 'blocked' },
  }
  expect(toPack(first)).toMatchObject({ slug: 'default', palette: PALETTES.handoff, steps: STEPS })
})

test('a file that is not a pack is no pack, and never throws', () => {
  const good = () => JSON.parse(PACK_TEXT.kirby ?? '{}') as { slug: unknown; flow: { palette: Record<string, unknown>; steps: { layout: unknown; states: { done: Record<string, unknown> }; cycle: { glyphs: unknown }; header: Record<string, unknown> } } }
  const broken = (change: (p: ReturnType<typeof good>) => void) => {
    const pack = good()
    change(pack)
    return toPack(pack)
  }
  expect(toPack(good())?.slug).toBe('kirby')
  for (const junk of [null, undefined, 7, 'kirby', [], {}, { slug: 'x' }, { slug: 'x', flow: {} }, { slug: 'x', flow: { palette: {}, steps: {} } }]) expect(toPack(junk)).toBeNull()
  expect(broken(p => { delete p.flow.palette.fg })).toBeNull()
  expect(broken(p => { p.flow.palette.bg = 'green' })).toBeNull()
  expect(broken(p => { p.flow.steps.states.done.color = 'magenta' })).toBeNull()
  expect(broken(p => { p.flow.steps.states.done.glyph = '★★' })).toBeNull()
  expect(broken(p => { p.flow.steps.layout = 'grid' })).toBeNull()
  expect(broken(p => { p.flow.steps.cycle.glyphs = ['★'] })).toBeNull()
  expect(broken(p => { p.flow.steps.header.corners = '┌┐' })).toBeNull()
  expect(broken(p => { p.slug = 'Not A Slug' })).toBeNull()
})

test('the mod reads the packs at session start and applies the active theme\'s: its palette and its steps', async ($, on) => {
  const { world } = engine(on, { theme: 'custom:kirby', files: packFiles() })
  await $.session.start(START)
  await $.tool.call(PLAN)
  const ui = await $.ui.mount(pane(56, 24))
  const K = paletteIn('kirby')
  expect((await ui.drawn()) as Node).toMatchObject({ type: 'Box', props: { backgroundColor: K.bg } })
  const seen = await text(ui)
  // Kirby's steps, not the built-in rail: a plaque, a star per cleared stage, the warp star on the current one.
  expect(seen.slice(0, 3)).toEqual([expect.stringMatching(/^ {3}★ TUNE THE DOWNHILL SETUP +2\/6$/), '  stage 3 of 6 · 4 to go', expect.stringMatching(/^ {2}★ ★ [✦✧] ○ ○ ✕ +33%$/)])
  expect(await styleOf(ui, 'TUNE THE DOWNHILL SETUP')).toMatchObject({ c: K.bg, bg: K.yellow, b: true })
  expect(seen).toContain('  ★  Import the clips')
  expect(seen.some(l => /^ {2}[✦✧] {2}Rough cut +<\('\.'\)> 3\/6$/.test(l))).toBe(true)
  expect(await styleOf(ui, 'Rough cut')).toMatchObject({ c: K.fg, b: true, bg: K.select })
  expect(seen.filter(l => /^ {2}[║┊]$/.test(l))).toEqual(['  ║', '  ║', '  ┊', '  ┊', '  ┊'])
  // The theme changes: the other pack's look, with no file read again.
  world.theme = 'custom:ghostrunner'
  await $.config.set({ key: 'theme', value: 'custom:ghostrunner' } as never).catch(() => undefined)
  await $.command.run({ command: 'flow', args: '', origin: { kind: 'composer' } } as never)
  const C = paletteIn('ghostrunner')
  expect((await ui.drawn()) as Node).toMatchObject({ props: { backgroundColor: C.bg } })
  const job = await text(ui)
  expect(job[0]).toMatch(/^ {2}┌─ JOB \/\/ TUNE THE DOWNHILL SETUP ─+ 2\/6 ─┐$/)
  expect(job[3]).toMatch(/^ {2}└─+╱$/)
  expect(job).toContain('  ▌ ✓ Import the clips')
  expect(await styleOf(ui, 'Import the clips')).toMatchObject({ c: C.text4, x: true })
  expect(job.some(l => /^ {2}█ [◈◆] Rough cut +TRACKED 3\/6$/.test(l))).toBe(true)
  expect(job).toContain('  ▌ ◇ add the outtakes [OPTIONAL]')
  expect(job.some(l => /^ {2}▌ ✕ Export for the family +LOCKED$/.test(l))).toBe(true)
  await ui.unmount()
})

test('a pack edited on disk is read again on the slow beat; a malformed one is skipped, the others stand, and no hook fails', async ($, on) => {
  const { world, clock } = engine(on, { theme: 'custom:kirby', files: packFiles() })
  await $.session.start(START)
  await $.tool.call(PLAN)
  const ui = await $.ui.mount(pane(56, 24))
  expect((await ui.drawn()) as Node).toMatchObject({ props: { backgroundColor: paletteIn('kirby').bg } })
  // The file changes: within the idle beat the pane has the new colour.
  world.files = { ...packFiles(), 'kirby.json': (PACK_TEXT.kirby ?? '').replaceAll(paletteIn('kirby').bg, '#102030') }
  world.stamp++
  await clock.advance(5_000)
  expect((await ui.drawn()) as Node).toMatchObject({ props: { backgroundColor: '#102030' } })
  // Kirby's pack is broken (not JSON), another is JSON but no pack: both are skipped. The theme keeps its look from before
  // packs (the built-in kirby palette and steps), not the grey default pack's; the plan is still drawn.
  world.files = { ...packFiles(), 'kirby.json': '{ "slug": "kirby", ', 'notes.json': '{"hello": 1}' }
  world.stamp++
  await clock.advance(5_000)
  expect((await ui.drawn()) as Node).toMatchObject({ props: { backgroundColor: PALETTES.kirby.bg } })
  expect((await text(ui))[0]).toMatch(/^ {2}╭─ Tune the downhill setup ─+ 2\/6 ─╮$/)
  expect(await text(ui)).toContain('  ●  Import the clips')
  expect((await $.tool.call({ ...PLAN, tool_use_id: 's2' })).result).toBe('Plan shown: step 3 of 6.')
  // The other packs stand: a built-in theme still has the default pack's steps.
  world.theme = 'dark'
  await clock.advance(5_000)
  expect((await ui.drawn()) as Node).toMatchObject({ props: { backgroundColor: paletteIn('default').bg } })
  expect((await text(ui)).some(l => l.includes('step 3 of 6 · 4 left'))).toBe(true)
  world.theme = 'custom:kirby'
  await clock.advance(5_000)
  // The folder goes: the built-in palette of the theme and the built-in steps, as before packs.
  world.files = undefined
  await clock.advance(5_000)
  expect((await ui.drawn()) as Node).toMatchObject({ props: { backgroundColor: PALETTES.kirby.bg } })
  expect(await text(ui)).toContain('  ●  Import the clips')
  await ui.unmount()
})

test('each pack draws the four states its own way, readably, and fits every width from 34 to 96: the steps and the wayfinder map', () => {
  const issues = Array.from({ length: 14 }, (_, i) => ({
    name: `${String(i + 1).padStart(2, '0')}-t.md`,
    text: `# Ticket ${i + 1}, whose title goes on past any narrow pane\n\nType: task\nStatus: ${i < 5 ? 'resolved' : i < 7 ? 'claimed' : 'open'}\n${i >= 11 ? 'Blocked by: 08, an outside blocker with a long name\n' : ''}`,
  }))
  const map = { ...chart('alpha', '# Map: A map\n\n## Destination\n\nSomewhere far, told in a sentence longer than the box.\n\n## Not yet specified\n\n- fog one\n\n## Out of scope\n\n- out one\n', issues, null), scratch: '', efforts: ['alpha'], sig: '' }
  const long: Plan = { title: 'A plan with a title longer than a narrow pane can hold', steps: Array.from({ length: 30 }, (_, i) => ({ label: `Optional: step ${i + 1} with a label much longer than thirty-four cells`, status: i < 12 ? 'done' as const : i === 12 ? 'active' as const : i === 29 ? 'blocked' as const : 'pending' as const })) }
  const shown = (line: Line) => line.map(p => (isSeg(p) ? p.t : 'btn' in p ? `${p.btn.hotkey === undefined ? '' : `${p.btn.hotkey}: `}${p.btn.label}` : ' '.repeat(p.inp.width))).join('')
  const looks = new Set<string>()
  for (const pack of packs) {
    const { palette: P, steps: S } = pack
    const draw = (w: number, plan: Plan, isWay: boolean, now = 0) => compose({ w, rows: 900, P, S, now, runs: [], view: VIEW, plan, way: { active: isWay, root: '', touched: '', chosen: '', hint: '', open: ['done', 'fog', 'out'] }, map: isWay ? map : null })
    for (let w = 34; w <= 96; w++) {
      for (const drawn of [draw(w, PLAN, false), draw(w, long, false), draw(w, PLAN, true)]) expect([pack.slug, w, drawn.lines.filter(l => cells(l) > w).map(shown)]).toEqual([pack.slug, w, []])
    }
    const drawn = draw(56, PLAN, false)
    const rows = drawn.lines.map(shown)
    const segOf = (label: string) => drawn.lines.flat().filter(isSeg).find(seg => seg.t === label) as Seg
    // Where we are, what is done, what is next and how many remain: the count, the active step's place, what is left.
    expect([pack.slug, rows[0]?.includes('2/6'), rows.some(l => /3\s?(of|OF|\/)\s?6/.test(l) && /4 /.test(l)), rows.some(l => / 3\/6$/.test(l))]).toEqual([pack.slug, true, true, true])
    // Each state has its own node, and the label of each reads at 4.5 on what it stands on.
    const states = [['Import the clips', 'done'], ['Rough cut', 'active'], ['Colour grade', 'pending'], ['Export for the family', 'blocked']] as const
    for (const [label, name] of states) {
      const line = rows.find(l => l.includes(label)) ?? ''
      const seg = segOf(label)
      expect([pack.slug, name, line.includes(S.states[name].glyph) || (name === 'active' && (S.cycle?.glyphs.some(g => line.includes(g)) ?? false))]).toEqual([pack.slug, name, true])
      expect([pack.slug, name, contrast(seg.c ?? P.fg, seg.bg ?? P.bg) >= 4.5]).toEqual([pack.slug, name, true])
    }
    expect(new Set(states.map(([, name]) => S.states[name].glyph)).size).toBe(4)
    // No frame of the active node's cycle is another state's glyph: the current step never reads as done or pending.
    expect([pack.slug, (S.cycle?.glyphs ?? []).filter(g => (['done', 'pending', 'blocked'] as const).some(name => S.states[name].glyph === g))]).toEqual([pack.slug, []])
    // The active step is the most visible thing: the only bold label, and no label is brighter against its ground.
    const active = segOf('Rough cut')
    expect([pack.slug, active.b, states.filter(([label]) => segOf(label).b === true).map(([, name]) => name)]).toEqual([pack.slug, true, S.states.blocked.bold ? ['active', 'blocked'] : ['active']])
    for (const [label, name] of states) if (name !== 'active') expect([pack.slug, name, contrast(active.c ?? P.fg, active.bg ?? P.bg) >= contrast(segOf(label).c ?? P.fg, P.bg)]).toEqual([pack.slug, name, true])
    // Its node turns with the clock, at the pack's rate, and the same clock draws the same node.
    if (S.cycle !== null) {
      const nodeAt = (now: number) => draw(56, PLAN, false, now).lines.map(shown).find(l => l.includes('Rough cut'))
      expect([pack.slug, nodeAt(0) === nodeAt(S.cycle.ms - 1), nodeAt(0) !== nodeAt(S.cycle.ms)]).toEqual([pack.slug, true, true])
    }
    // The map: here, next and blocked each under the pack's node, and what blocks a ticket named beside it.
    const way = draw(56, PLAN, true).lines.map(shown)
    expect([pack.slug, way.some(l => /here ×2/i.test(l)), way.some(l => /next ×4/i.test(l)), way.some(l => l.includes(S.states.blocked.glyph) && /blocked ×3/i.test(l)), way.filter(l => /╰ by Ticket 8, /.test(l)).length]).toEqual([pack.slug, true, true, true, 3])
    looks.add(rows.slice(0, 12).join('\n'))
  }
  // Ten packs, eight different lists: the two Y2K packs are one design in two palettes, and so are the two Halo ones.
  expect(looks.size).toBe(8)
})

test('the working line is the theme\'s: one of its pack\'s words for the engine\'s, behind its icon, which turns', async ($, on) => {
  const { clock } = engine(on, { theme: 'custom:kirby-pink', files: packFiles() })
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`engine says ${e.props.word}`}</Text>
  })
  await $.session.start(START)
  const spinner = toPack(JSON.parse(PACK_TEXT['kirby-pink'] ?? ''))?.spinner
  if (spinner === null || spinner === undefined) throw new Error('kirby-pink has no spinner')
  const ui = await $.ui.mount({ plugin: 'loadout', surface: 'terminal', component: 'Spinner', viewport: { columns: 100, rows: 40 }, props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' } })
  const icon = async () => (await ui.findAll({ type: 'Text' })).filter(t => t.props.backgroundColor !== undefined).map(t => t.text).join('')
  const said = ((await ui.findAll({ type: 'Text', text: /^engine says / }))[0]?.text ?? '').replace('engine says ', '')
  expect([spinner.verbs.includes(said), await icon()]).toEqual([true, spinner.frames[0]])
  await clock.advance(spinner.ms + 50)
  expect(await icon()).toBe(spinner.frames[1])
  await ui.unmount()
  // Initial D's: a tyre that turns, a quarter a frame, before words of the pass.
  const touge = toPack(JSON.parse(PACK_TEXT['initial-d'] ?? ''))?.spinner
  expect([touge?.frames, touge?.ms, touge?.verbs.length, touge?.verbs.includes('Delivering tofu'), touge?.verbs.every(verb => verb.length <= 32)]).toEqual([['◴', '◷', '◶', '◵'], 120, 16, true, true])
})
