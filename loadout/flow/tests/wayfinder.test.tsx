import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { chart, inState, isWayfinder, parseMapDoc, parseTicket, pickEffort, scratchOf } from '../hooks/lib'
import { PALETTES } from '../hooks/palette'
import { lines, paint, pane } from './kit'
import type { Node } from './kit'

// Invented fixtures in the shape real maps take: French text, a note after the status, annotated and outside blockers.
const MAP = `# Carte — ACM 360, module Analyse (lots 1 à 3)

Label : \`wayfinder:map\` · ouverte le 11 sept. 2026.

## Destination

**Plus rien à décider** pour le module [Analyse](../docs/a.md) — le rapport,
le dépôt et la vente. L'exécution n'est pas dans cette carte.

Même partage qu'au lot 0.

## Notes

- \`01-le-format.md\` → [#30](https://gitlab.example/issues/30)

## Sur GitLab

- miroir

## Decisions so far

<!-- une ligne par ticket clos -->

- [Le format de la colonne](issues/01-le-format.md) ([#30](https://x/30), 14 sept.) — **deux colonnes**

## Not yet specified

- **Le sort d'une organisation qui part** : ce qui est purgé,
  ce qui est rendu.
- L'archivage d'un rapport. Orca n'en garde qu'un.

## Out of scope

- **L'export CSV d'une liste** : tranché non.
`

const ticket = (title: string, type: string, status: string, blockedBy?: string) =>
  `# ${title}\n\nType: ${type}\nStatus: ${status}\n${blockedBy === undefined ? '' : `Blocked by: ${blockedBy}\n`}Parent: ../map.md\nLot: 1\nPropriétaire: Zoku\n\n## Question\n\nStatus: resolved dans le texte ne compte pas.\n`

const ISSUES = {
  '01-le-format.md': ticket('Le format de la colonne', 'research', 'resolved (15 sept. 2026, GitLab #30 — décidé par l\'agent, à contester)'),
  '02-le-vocabulaire.md': ticket('Le vocabulaire', 'grilling', 'claimed'),
  '03-la-couture.md': ticket('La couture Kestrel', 'task', 'open'),
  '04-l-ecran.md': ticket('L\'écran de valeur', 'prototype', 'open', '01'),
  '05-le-panier.md': ticket('Le panier mixte', 'task', 'open', '03, 01 (résolu)'),
  '06-l-interrupteur.md': ticket('L\'interrupteur', 'task', 'open', 'avis juridique (externe, Marcellin + Élie + juriste)'),
  '07-le-chiffre.md': ticket('Le chiffre qui fait acheter', 'grilling', 'open', '09'),
  '08-casse.md': 'pas de titre\n',
}
const GITLAB = JSON.stringify({ carte: 29, tickets: { '01': { iid: 30, cable: true, ferme: true }, '03': { iid: 32, cable: true }, '06': { iid: 35 } } })
const issues = (set: Record<string, string>) => Object.entries(set).map(([name, text]) => ({ name, text }))

test('a ticket file reads as its number, title, type, status and blockers', () => {
  expect(parseTicket('01-le-format.md', ISSUES['01-le-format.md'])).toEqual({ n: 1, title: 'Le format de la colonne', type: 'research', status: 'resolved', blockedBy: [] })
  expect(parseTicket('05-x.md', ISSUES['05-le-panier.md'])?.blockedBy).toEqual(['03', '01 (résolu)'])
  expect(parseTicket('06-x.md', ISSUES['06-l-interrupteur.md'])?.blockedBy).toEqual(['avis juridique (externe, Marcellin + Élie + juriste)'])
  // No Status line is an open ticket; no title or no number is not a ticket.
  expect(parseTicket('09-x.md', '# Neuf\n\nType: spike\n')).toEqual({ n: 9, title: 'Neuf', type: 'other', status: 'open', blockedBy: [] })
  expect(parseTicket('08-casse.md', ISSUES['08-casse.md'])).toBeNull()
  expect(parseTicket('notes.md', '# Notes\n')).toBeNull()
})

test('the map file gives its title, the destination\'s first sentence and the bullets of each section', () => {
  const doc = parseMapDoc(MAP)
  expect(doc.title).toBe('ACM 360, module Analyse (lots 1 à 3)')
  expect(doc.destination).toBe('Plus rien à décider pour le module Analyse — le rapport, le dépôt et la vente.')
  expect([doc.bullets('decisions so far').length, doc.bullets('not yet specified').length, doc.bullets('out of scope').length, doc.bullets('nope').length]).toEqual([1, 2, 1, 0])
  expect(parseMapDoc('')).toMatchObject({ title: '', destination: '' })
})

test('the chart sorts tickets into resolved, claimed, frontier and blocked, and names what blocks', () => {
  // Files out of order, and one that could not be read: the frontier still comes out by number.
  const c = chart('alpha', MAP, [...issues(ISSUES).reverse(), { name: '10-illisible.md', text: null }], GITLAB)
  expect(inState(c, 'resolved').map(t => t.n)).toEqual([1])
  expect(inState(c, 'claimed').map(t => t.title)).toEqual(['Le vocabulaire'])
  // 04 is blocked by 01 alone, which is resolved: it is on the frontier, after 03.
  expect(inState(c, 'frontier').map(t => [t.n, t.type, t.iid])).toEqual([[3, 'task', 32], [4, 'prototype', null]])
  expect(inState(c, 'blocked').map(t => [t.n, t.blockers])).toEqual([
    [5, ['La couture Kestrel']],
    [6, ['avis juridique (externe, Marcellin + Élie + juriste)']],
    [7, ['#09 ?']],
  ])
  expect([c.title, c.carte, c.decisions, c.fog, c.out, c.unreadable]).toEqual([
    'ACM 360, module Analyse (lots 1 à 3)', 29, 1, ['Le sort d\'une organisation qui part', 'L\'archivage d\'un rapport.'], ['L\'export CSV d\'une liste'], 2,
  ])
})

test('no gitlab.json, or a broken one, leaves the map without GitLab numbers', () => {
  for (const mirror of [null, '{ not json', '[]', '{"tickets": {"03": null}}']) {
    const c = chart('alpha', MAP, issues(ISSUES), mirror)
    expect([c.carte, c.tickets.every(t => t.iid === null), c.tickets.length]).toEqual([null, true, 7])
  }
  expect(chart('vide', '', [], null)).toMatchObject({ title: 'vide', tickets: [], fog: [], unreadable: 0 })
})

test('wayfinder is known by name, a path by its effort, and the effort shown is the wanted one or the latest', () => {
  expect(['wayfinder', 'mattpocock-skills:wayfinder', 'Wayfinder', 'wayfinder-notes', 'pathfinder', 7].map(isWayfinder)).toEqual([true, true, true, false, false, false])
  expect(scratchOf('/repo/.scratch/alpha/issues/01-x.md')).toEqual({ root: '/repo/.scratch', effort: 'alpha' })
  expect(scratchOf('.scratch/beta/map.md')).toEqual({ root: '.scratch', effort: 'beta' })
  expect(scratchOf('/repo/src/scratch/a.ts')).toBeNull()
  const efforts = [{ name: 'alpha', mtimeMs: 5 }, { name: 'beta', mtimeMs: 9 }]
  expect([pickEffort(efforts, ['', 'gone']), pickEffort(efforts, ['', 'alpha']), pickEffort([], ['alpha'])]).toEqual(['beta', 'alpha', ''])
})

// The disk beneath the mod: files by absolute path, listed and read as $.fs does.
type Disk = Record<string, { text: string; mtimeMs: number }>
const disk = (): Disk => ({
  '/repo/.scratch/handoff.md': { text: 'notes', mtimeMs: 900 },
  '/repo/.scratch/alpha/map.md': { text: MAP, mtimeMs: 100 },
  '/repo/.scratch/alpha/gitlab.json': { text: GITLAB, mtimeMs: 100 },
  ...Object.fromEntries(Object.entries(ISSUES).map(([name, text]) => [`/repo/.scratch/alpha/issues/${name}`, { text, mtimeMs: 200 }])),
  '/repo/.scratch/beta/map.md': { text: '# Map: Beta effort\n\n## Destination\n\nShip beta.\n', mtimeMs: 50 },
  '/repo/.scratch/beta/issues/01-seul.md': { text: ticket('Le seul ticket', 'task', 'open'), mtimeMs: 50 },
  // No map.md: not an effort, however recent.
  '/repo/.scratch/prod-v1/questions.md': { text: '# Questions', mtimeMs: 999 },
})

const world = (on: Parameters<TestBody>[1], cwd = '/repo') => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const files = disk()
  on('session.cwd', () => ({ value: cwd }))
  on('fs.exists', (_, e) => ({ value: e.path === '/repo/.git' || e.path in files }))
  on('fs.list', (_, e) => {
    const under = Object.keys(files).filter(p => p.startsWith(`${e.path}/`))
    if (under.length === 0) return { deny: 'ENOENT' }
    const names = [...new Set(under.map(p => p.slice(e.path.length + 1).split('/')[0] ?? ''))]
    const value = names.map(name => {
      const file = files[`${e.path}/${name}`]
      return file === undefined
        ? { name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false }
        : { name, kind: 'file' as const, size: file.text.length, mtimeMs: file.mtimeMs, isLink: false }
    })
    return { value }
  })
  on('fs.read', (_, e) => {
    const file = files[e.path]
    return file === undefined ? { deny: 'ENOENT' } : { value: file.text }
  })
  on('tool.call', { tool: 'Skill' }, () => ({ result: {} as never }))
  on('tool.call', { tool: 'Edit' }, () => ({ result: {} as never }))
  on('tool.call', { tool: 'Read' }, () => ({ result: {} as never }))
  on('command.run', () => ({}))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('prompt.submit', (_, e) => e)

  return { clock, files }
}

const P = PALETTES.handoff
type Ui = { drawn: () => Promise<unknown> }
const text = async (ui: Ui) => lines((await ui.drawn()) as Node).map(l => l.trimEnd())
const has = async (ui: Ui, line: RegExp) => (await text(ui)).some(l => line.test(l))
const styleOf = async (ui: Ui, part: string) => paint((await ui.drawn()) as Node).flat().find(r => r.t.includes(part))
const exact = async (ui: Ui, whole: string) => paint((await ui.drawn()) as Node).flat().find(r => r.t === whole)
const resolve03 = (files: Disk) => {
  files['/repo/.scratch/alpha/issues/03-la-couture.md'] = { text: ticket('La couture Kestrel', 'task', 'resolved (1 oct. 2026)'), mtimeMs: 300 }
}

test('the Skill tool loading wayfinder puts the map in the pane: here, next, blocked and what is left', async ($, on) => {
  world(on)
  const ui = await $.ui.mount(pane(60, 80))
  expect(await has(ui, /here/)).toBe(false)
  expect((await text(ui)).slice(0, 3)).toEqual(['  No workflow is running.', '', '  No plan yet. Claude posts one for a 3+ step task.'])

  await $.tool.call({ tool: 'Skill', tool_use_id: 'k1', skill: 'mattpocock-skills:wayfinder' })
  // The summary box: title, destination, progress and the map's GitLab issue. alpha is the effort changed last; prod-v1 has no map.
  const seen = await text(ui)
  // Two efforts hold a map: one Button each, side by side, above the box.
  expect(seen.slice(0, 2)).toEqual(['  a: ● alpha  b: ○ beta', expect.stringMatching(/^ {2}╭─ ACM 360, module Analyse \(lots 1 à 3\) ─+ 1\/7 ─╮$/)])
  expect(await has(ui, /^ {2}│ Plus rien à décider pour le module Analyse/)).toBe(true)
  expect(await has(ui, /^ {2}│ 1 \/ 7 resolved · GitLab #29 +│$/)).toBe(true)
  expect(await has(ui, /^ {2}│ here 1 · next 2 · blocked 3 +│$/)).toBe(true)
  expect(await has(ui, /^ {2}│ ■+ +14% │$/)).toBe(true)
  expect((await styleOf(ui, 'ACM 360'))?.c).toBe(P.cyan)
  // here: the claimed ticket, bold, under its type's glyph, on the running rail.
  expect(await has(ui, /^ {2}[◐◓◑◒] {2}here ×1 +1 claimed$/)).toBe(true)
  expect(seen).toContain('  ┆  ? Le vocabulaire')
  expect((await styleOf(ui, 'Le vocabulaire'))).toMatchObject({ c: P.fg, b: true })
  expect((await styleOf(ui, '? '))?.c).toBe(P.violet)
  expect((await exact(ui, 'here'))).toMatchObject({ c: P.yellow, b: true })
  // next: the frontier in number order, the first marked, each with its type and its GitLab number after the title.
  expect(await has(ui, /^ {2}○ {2}next ×2 +2 unblocked$/)).toBe(true)
  expect(await has(ui, /^ {2}┆ {2}■ La couture Kestrel #32 +next$/)).toBe(true)
  expect(seen).toContain('  ┆  ± L\'écran de valeur')
  expect((await styleOf(ui, ' #32'))?.c).toBe(P.text4)
  // blocked: each with what blocks it, by title, by "#NN ?" for a ticket with no file, or by the outside blocker's text.
  expect(await has(ui, /^ {2}■ {2}blocked ×3 +3 waiting$/)).toBe(true)
  expect((await exact(ui, 'blocked'))).toMatchObject({ c: P.red, b: true })
  expect(seen).toContain('  ┆    ╰ by La couture Kestrel')
  expect(await has(ui, /^ {2}┆ {4}╰ by avis juridique \(externe, Marcellin/)).toBe(true)
  expect(seen).toContain('  ┆    ╰ by #09 ?')
  expect(seen).toContain('  !  1 ticket files unreadable')
  // Done, fog and out of scope are one Button each, from column 3 behind its mark, which opens its list on the rail; the last has no rail below.
  expect(seen.slice(seen.indexOf('  ▸  d: done (1)')).slice(0, 5)).toEqual(['  ▸  d: done (1)', '  ┆', '  ▸  g: fog (2)', '  ┆', '  ▸  o: out of scope (1)'])
  expect((await ui.find({ key: 'way:done' }))).toMatchObject({ text: 'done (1)', props: { hotkey: 'd' } })
  expect((await ui.find({ key: 'way:fog' }))).toMatchObject({ text: 'fog (2)', props: { hotkey: 'g' } })
  expect((await ui.find({ key: 'way:out' }))).toMatchObject({ text: 'out of scope (1)', props: { hotkey: 'o' } })
  expect(await has(ui, /Le format de la colonne/)).toBe(false)
  await ui.press({ key: 'way:done' })
  expect(await text(ui)).toContain('  ┆  ● Le format de la colonne #30')
  expect(await text(ui)).toContain('  ▾  d: done (1)')
  await ui.press({ key: 'way:fog' })
  expect(await text(ui)).toContain('  ┆  · Le sort d\'une organisation qui part')
  // With no plan posted the map stands alone; a posted plan shows below it.
  expect(await has(ui, /No plan yet/)).toBe(false)
  await $.tool.call({ tool: 'mcp__loadout__steps', tool_use_id: 's1', title: 'Resolve the ticket', steps: [{ label: 'Read it', status: 'active' }] })
  expect(await has(ui, /│ step 1 of 1/)).toBe(true)
  expect(await has(ui, /^ {2}○ {2}next ×2 +2 unblocked$/)).toBe(true)
  // Every line is the pane's width, in its background.
  expect(lines((await ui.drawn()) as Node).filter(l => l.length !== 60)).toEqual([])
  await ui.unmount()
})

test('a write under .scratch/ has the pane read the files again, and so does the slow tick', async ($, on) => {
  const { clock, files } = world(on)
  await $.tool.call({ tool: 'Skill', tool_use_id: 'k1', skill: 'wayfinder' })
  const ui = await $.ui.mount(pane(60, 80))
  expect(await has(ui, /│ 1 \/ 7 resolved/)).toBe(true)

  resolve03(files)
  await $.tool.call({ tool: 'Edit', tool_use_id: 'e1', file_path: '/repo/.scratch/alpha/issues/03-la-couture.md', old_string: 'Status: open', new_string: 'Status: resolved' })
  expect(await has(ui, /│ 2 \/ 7 resolved/)).toBe(true)
  // What it blocked is now on the frontier, and the next ticket is the following one.
  expect(await has(ui, /^ {2}┆ {2}± L'écran de valeur +next$/)).toBe(true)
  expect(await text(ui)).toContain('  ┆  ■ Le panier mixte')
  expect(await has(ui, /╰ by La couture/)).toBe(false)

  // A file changed with no tool call (another terminal): the tick finds it. A file deleted is no error.
  files['/repo/.scratch/alpha/issues/02-le-vocabulaire.md'] = { text: ticket('Le vocabulaire', 'grilling', 'resolved'), mtimeMs: 400 }
  delete files['/repo/.scratch/alpha/gitlab.json']
  await clock.advance(6_000)
  expect(await has(ui, /│ 3 \/ 7 resolved +│$/)).toBe(true)
  expect(await has(ui, /^ {2}○ {2}here +no ticket claimed$/)).toBe(true)
  await ui.unmount()
})

test('several maps: the effort the session touched is shown, a Button switches, and the choice is kept', async ($, on) => {
  world(on, '/repo/apps/web')
  // The session read beta's files before wayfinder was loaded: beta is the effort, though alpha changed last.
  await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/repo/.scratch/beta/map.md' })
  await $.skill.prompt({ skill: 'wayfinder', text: 'the skill' })
  const ui = await $.ui.mount(pane(60, 80))
  expect(await has(ui, /╭─ Beta effort ─+ 0\/1 ─╮/)).toBe(true)
  expect(await has(ui, /^ {2}┆ {2}■ Le seul ticket +next$/)).toBe(true)
  expect((await ui.findAll({ type: 'Button' })).map(b => b.props.hotkey)).toEqual(['a', 'b', 'd', 'g', 'o', 'n', 'w', 'z'])
  expect((await ui.find({ key: 'way:effort:beta' }))?.text).toBe('● beta')
  expect((await ui.find({ key: 'way:effort:alpha' }))?.text).toBe('○ alpha')
  expect(await ui.find({ key: 'way:effort:prod-v1' })).toBeUndefined()

  await ui.press({ key: 'way:effort:alpha' })
  expect(await has(ui, /│ 1 \/ 7 resolved · GitLab #29/)).toBe(true)
  // Reading beta again does not undo the person's choice; /wayfinder naming an effort does.
  await $.tool.call({ tool: 'Read', tool_use_id: 'r2', file_path: '/repo/.scratch/beta/issues/01-seul.md' })
  expect(await has(ui, /│ 1 \/ 7 resolved · GitLab #29/)).toBe(true)
  await $.command.run({ command: 'wayfinder', args: 'beta', origin: { kind: 'composer' } } as never)
  expect(await has(ui, /╭─ Beta effort /)).toBe(true)
  await ui.unmount()
})

test('a loose file in .scratch/ or a directory without a map does not move the map off the effort the session is on', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/repo/.scratch/beta/map.md' })
  await $.tool.call({ tool: 'Skill', tool_use_id: 'k1', skill: 'wayfinder' })
  const ui = await $.ui.mount(pane(60, 80))
  expect(await has(ui, /╭─ Beta effort /)).toBe(true)
  // alpha changed last: it is what shows if beta is forgotten.
  await $.tool.call({ tool: 'Read', tool_use_id: 'r2', file_path: '/repo/.scratch/handoff.md' })
  expect(await has(ui, /╭─ Beta effort /)).toBe(true)
  await $.tool.call({ tool: 'Read', tool_use_id: 'r3', file_path: '/repo/.scratch/prod-v1/questions.md' })
  expect(await has(ui, /╭─ Beta effort /)).toBe(true)
  await $.command.run({ command: 'wayfinder', args: '.scratch/handoff.md', origin: { kind: 'composer' } } as never)
  expect(await has(ui, /╭─ Beta effort /)).toBe(true)
  // A real effort's file still moves it, by a relative path too.
  await $.tool.call({ tool: 'Read', tool_use_id: 'r4', file_path: '.scratch/alpha/issues/01-le-format.md' })
  expect(await has(ui, /│ 1 \/ 7 resolved · GitLab #29/)).toBe(true)
  await ui.unmount()
})

test('a session started outside the repository finds the map through the files it touches', async ($, on) => {
  world(on, '/home/me')
  await $.prompt.submit({ text: '/wayfinder', wait: false, origin: { kind: 'composer' } })
  const ui = await $.ui.mount(pane(60, 80))
  expect(await has(ui, /wayfinder is on: no map found/)).toBe(true)
  await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/repo/.scratch/alpha/map.md' })
  expect(await has(ui, /│ 1 \/ 7 resolved · GitLab #29/)).toBe(true)
  await ui.unmount()
})

test('a short, narrow pane folds done, fog and the blockers\' names, then the tail of next: here, the first next and the blocked tickets stay', async ($, on) => {
  const { files } = world(on)
  for (let n = 11; n < 19; n++) files[`/repo/.scratch/alpha/issues/${n}-libre.md`] = { text: ticket(`Ticket libre ${n}`, 'research', 'open'), mtimeMs: 200 }
  await $.tool.call({ tool: 'Skill', tool_use_id: 'k1', skill: 'wayfinder' })
  const ui = await $.ui.mount(pane(34, 26))
  await ui.press({ key: 'way:done' })
  await ui.press({ key: 'way:out' })
  expect((await ui.find({ key: 'way:done' }))?.text).toBe('done (1) folded')
  expect((await ui.find({ key: 'way:out' }))?.text).toBe('out of scope (1) folded')
  const seen = await text(ui)
  // No line passes the 34 cells, a Button's "d: " included.
  expect(lines((await ui.drawn()) as Node).filter(l => l.length !== 34)).toEqual([])
  expect(seen.length).toBeLessThanOrEqual(26)
  expect(seen.some(l => /Le format de la colonne/.test(l))).toBe(false)
  expect(seen.some(l => /╰ by/.test(l))).toBe(false)
  // What is blocked is still named; only what blocks it is folded.
  expect(seen.some(l => /^ ■ {2}blocked ×3 +3 waiting$/.test(l))).toBe(true)
  expect(seen).toContain(' ┆  ■ Le panier mixte')
  expect(seen).toContain(' ┆  ? Le chiffre qui fait acheter')
  expect(seen).toContain(' ┆  ? Le vocabulaire')
  expect(seen.some(l => /^ ┆ {2}■ La couture Kestr\S* #32 +next$/.test(l))).toBe(true)
  expect(seen.some(l => /^ ┆ {4}\+\d more$/.test(l))).toBe(true)
  expect(seen.some(l => /Ticket libre 18/.test(l))).toBe(false)
  await ui.unmount()
})

test('the system prompt section tells the model not to re-post the wayfinder map', async ($, on) => {
  on('prompt.compose', () => ({ sections: [] }))
  const got = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, traits: [], tools: ['mcp__loadout__steps'] })
  expect(got.sections.map(s => s.id)).toEqual(['flow-map:steps'])
  expect(got.sections[0]?.text).toMatch(/wayfinder skill is active .* do not re-post the map/)
})
