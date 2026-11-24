import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { chart, inState, isWayfinder, parseMapDoc, parseTicket, pickEffort, resolvedLast, scratchOf } from '../hooks/lib'
import { PALETTES } from '../hooks/palette'
import { lines, paint, pane, tickets } from './kit'
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

test('the chart sorts tickets into resolved, claimed, frontier and blocked, and cites what blocks by its number', () => {
  // Files out of order, and one that could not be read: the frontier still comes out by number.
  const c = chart('alpha', MAP, [...issues(ISSUES).reverse(), { name: '10-illisible.md', text: null }], GITLAB)
  expect(inState(c, 'resolved').map(t => t.n)).toEqual([1])
  expect(inState(c, 'claimed').map(t => t.title)).toEqual(['Le vocabulaire'])
  // 04 is blocked by 01 alone, which is resolved: it is on the frontier, after 03.
  expect(inState(c, 'frontier').map(t => [t.n, t.type, t.iid])).toEqual([[3, 'task', 32], [4, 'prototype', null]])
  expect(inState(c, 'blocked').map(t => [t.n, t.blockers])).toEqual([
    [5, ['#03']],
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
  // The panes the mod asked for, in order: an id, and `focus` where it asked to be raised.
  const opened: { id: string; focus?: true }[] = []
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
  on('ui.open', (_, e) => {
    opened.push({ id: e.id, ...(e.focus === true ? { focus: true as const } : {}) })
    return { value: { isPlaced: true as const } }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__loadout__${e.name}` } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  return { clock, files, opened }
}

const P = PALETTES.handoff
type Ui = { drawn: () => Promise<unknown> }
const text = async (ui: Ui) => lines((await ui.drawn()) as Node).map(l => l.trimEnd())
const has = async (ui: Ui, line: RegExp) => (await text(ui)).some(l => line.test(l))
const styleOf = async (ui: Ui, part: string) => paint((await ui.drawn()) as Node).flat().find(r => r.t.includes(part))
const exact = async (ui: Ui, whole: string) => paint((await ui.drawn()) as Node).flat().find(r => r.t === whole)
/** The resolved tickets' numbers, top to bottom: their rows stand behind the done rail. */
const resolved = async (ui: Ui) => (await text(ui)).flatMap(l => l.match(/^ {1,2}│ {2}(#\d+) /)?.[1] ?? [])
const resolve03 = (files: Disk) => {
  files['/repo/.scratch/alpha/issues/03-la-couture.md'] = { text: ticket('La couture Kestrel', 'task', 'resolved (1 oct. 2026)'), mtimeMs: 300 }
}

test('a ticket keeps when its file last changed, and the resolved come out last changed first', () => {
  const files = ([['01-a.md', 7], ['02-b.md', 9], ['03-c.md', 7]] as const).map(([name, mtimeMs]) => ({ name, text: ticket(`Ticket ${name}`, 'task', 'resolved'), mtimeMs }))
  const c = chart('alpha', '', files, null)
  expect(c.tickets.map(t => t.at)).toEqual([7, 9, 7])
  // Two files changed at one time (a checkout writes them all at once): the higher number first.
  expect(resolvedLast(c).map(t => t.n)).toEqual([2, 3, 1])
  // A listing that gave no time reads as the oldest.
  expect(chart('alpha', '', issues(ISSUES), null).tickets.every(t => t.at === 0)).toBe(true)
})

test('wayfinder in use draws the map in the Tickets pane alone, and opens no pane: each ticket under its number, a blocker by its number, the resolved open', async ($, on) => {
  const { opened } = world(on)
  const flow = await $.ui.mount(pane(60, 80))
  const ui = await $.ui.mount(tickets(56, 80))
  // Before the skill is used the pane says why it is empty.
  expect(await text(ui)).toEqual(['  No wayfinder map yet.', '  It is drawn once the wayfinder skill is used.'])

  await $.tool.call({ tool: 'Skill', tool_use_id: 'k1', skill: 'mattpocock-skills:wayfinder' })
  // No pane is asked for: a pane that opens is the one shown, and Loadout never changes the pane shown.
  expect(opened).toEqual([])
  const seen = await text(ui)
  // Two efforts hold a map: one Button each, side by side, above the box. alpha is the effort changed last; prod-v1 has no map.
  expect(seen.slice(0, 2)).toEqual(['  a: ● alpha  b: ○ beta', expect.stringMatching(/^ {2}╭─ ACM 360, module Analyse \(lots 1 à 3\) ─+ 1\/7 ─╮$/)])
  // The summary box: title, how many are resolved, destination, the map's GitLab issue and the bar.
  expect(await has(ui, /^ {2}│ Plus rien à décider pour le module Analyse/)).toBe(true)
  expect(await has(ui, /^ {2}│ GitLab #29 +│$/)).toBe(true)
  expect(await has(ui, /^ {2}│ ■+ +14% │$/)).toBe(true)
  expect((await styleOf(ui, 'ACM 360'))?.c).toBe(P.cyan)
  // Each count is written once: the resolved in the box's corner, the others beside their group.
  expect(seen.filter(l => /resolved|×/.test(l))).toEqual([])
  expect(seen.filter(l => l.includes('1/7')).length).toBe(1)
  for (const name of ['here', 'next', 'blocked']) expect([name, seen.filter(l => new RegExp(`\\b${name}\\b`).test(l)).length]).toEqual([name, 1])
  // here: the claimed ticket, bold, under its number and its type's glyph, on the running rail.
  expect(await has(ui, /^ {2}[◐◓◑◒] {2}here +1 claimed$/)).toBe(true)
  expect(seen).toContain('  ┆  #02 ? Le vocabulaire')
  expect((await styleOf(ui, 'Le vocabulaire'))).toMatchObject({ c: P.fg, b: true })
  expect((await styleOf(ui, '? '))?.c).toBe(P.violet)
  expect((await exact(ui, 'here'))).toMatchObject({ c: P.yellow, b: true })
  // next: the frontier in number order, each with its type and, at the right, its GitLab issue.
  expect(await has(ui, /^ {2}○ {2}next +2 unblocked$/)).toBe(true)
  expect(await has(ui, /^ {2}┆ {2}#03 ■ La couture Kestrel +gl#32$/)).toBe(true)
  expect(seen).toContain('  ┆  #04 ± L\'écran de valeur')
  expect((await styleOf(ui, 'gl#32'))?.c).toBe(P.text4)
  // blocked: what blocks a ticket is cited by its number, "#NN ?" for one with no file; an outside blocker's text has its own row.
  expect(await has(ui, /^ {2}■ {2}blocked +3 waiting$/)).toBe(true)
  expect((await exact(ui, 'blocked'))).toMatchObject({ c: P.red, b: true })
  expect(await has(ui, /^ {2}┆ {2}#05 ■ Le panier mixte +← #03$/)).toBe(true)
  expect(await has(ui, /^ {2}┆ {2}#07 \? Le chiffre qui fait acheter +← #09 \?$/)).toBe(true)
  const outside = seen.findIndex(l => /^ {2}┆ {2}#06 ■ L'interrupteur +gl#35$/.test(l))
  expect(seen[outside + 1]).toMatch(/^ {2}┆ {8}← avis juridique \(externe, Marcellin/)
  expect(seen.filter(l => /╰ by|← La couture/.test(l))).toEqual([])
  // done: the resolved are listed, with no Button to open them.
  expect(seen).toContain('  ●  done')
  expect(await has(ui, /^ {2}│ {2}#01 ◇ Le format de la colonne +gl#30$/)).toBe(true)
  expect(await ui.find({ key: 'way:done' })).toBeUndefined()
  // The groups, top to bottom: where we are, what comes next, what waits, what is behind us.
  const order = [/ here /, / next /, / blocked /, / done$/].map(line => seen.findIndex(l => line.test(l)))
  expect([order.includes(-1), order]).toEqual([false, [...order].sort((a, b) => a - b)])
  // What is left of the map closes the pane: fog and out of scope, one Button each, opening its list under it.
  expect(seen.slice(-3)).toEqual(['  !  1 ticket file unreadable', '  ▸  g: fog (2)', '  ▸  o: out of scope (1)'])
  expect((await ui.find({ key: 'way:fog' }))).toMatchObject({ text: 'fog (2)', props: { hotkey: 'g' } })
  expect((await ui.find({ key: 'way:out' }))).toMatchObject({ text: 'out of scope (1)', props: { hotkey: 'o' } })
  await ui.press({ key: 'way:fog' })
  expect(await text(ui)).toContain('     · Le sort d\'une organisation qui part')
  expect(await text(ui)).toContain('  ▾  g: fog (2)')
  // Every line is the pane's width, in its background.
  expect(lines((await ui.drawn()) as Node).filter(l => l.length !== 56)).toEqual([])

  // The Flow map no longer draws the map: with wayfinder on it is the pane of the agents and of the step plan.
  expect((await text(flow)).slice(0, 3)).toEqual(['  No workflow is running.', '', '  No plan yet. Claude posts one for a 3+ step task.'])
  await $.tool.call({ tool: 'mcp__loadout__steps', tool_use_id: 's1', title: 'Resolve the ticket', steps: [{ label: 'Read it', status: 'active' }] })
  expect(await has(flow, /│ step 1 of 1/)).toBe(true)
  expect((await text(flow)).filter(l => /here|unblocked|ACM 360|Le vocabulaire/.test(l))).toEqual([])
  await flow.unmount()
  await ui.unmount()
})

test('a write under .scratch/ has the pane read the files again, and so does the slow tick: the ticket resolved last is on top', async ($, on) => {
  const { clock, files } = world(on)
  await $.tool.call({ tool: 'Skill', tool_use_id: 'k1', skill: 'wayfinder' })
  const ui = await $.ui.mount(tickets(60, 80))
  expect(await has(ui, / 1\/7 ─╮$/)).toBe(true)
  expect(await resolved(ui)).toEqual(['#01'])

  resolve03(files)
  await $.tool.call({ tool: 'Edit', tool_use_id: 'e1', file_path: '/repo/.scratch/alpha/issues/03-la-couture.md', old_string: 'Status: open', new_string: 'Status: resolved' })
  expect(await has(ui, / 2\/7 ─╮$/)).toBe(true)
  expect(await resolved(ui)).toEqual(['#03', '#01'])
  // What it blocked is now on the frontier, and the next ticket is the following one.
  const next = (await text(ui)).filter(l => /^ {2}┆ {2}#0[45] /.test(l))
  expect(next).toEqual(['  ┆  #04 ± L\'écran de valeur', '  ┆  #05 ■ Le panier mixte'])
  expect(await has(ui, /← #03/)).toBe(false)

  // A file changed with no tool call (another terminal): the tick finds it. A file deleted is no error.
  files['/repo/.scratch/alpha/issues/02-le-vocabulaire.md'] = { text: ticket('Le vocabulaire', 'grilling', 'resolved'), mtimeMs: 400 }
  delete files['/repo/.scratch/alpha/gitlab.json']
  await clock.advance(6_000)
  expect(await has(ui, / 3\/7 ─╮$/)).toBe(true)
  expect(await has(ui, /^ {2}○ {2}here +no ticket claimed$/)).toBe(true)
  expect(await resolved(ui)).toEqual(['#02', '#03', '#01'])
  expect(await has(ui, /gl#|GitLab/)).toBe(false)
  await ui.unmount()
})

test('several maps: the effort the session touched is shown, a Button switches, and the choice is kept', async ($, on) => {
  world(on, '/repo/apps/web')
  // The session read beta's files before wayfinder was loaded: beta is the effort, though alpha changed last.
  await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/repo/.scratch/beta/map.md' })
  await $.skill.prompt({ skill: 'wayfinder', text: 'the skill' })
  const ui = await $.ui.mount(tickets(60, 80))
  expect(await has(ui, /╭─ Beta effort ─+ 0\/1 ─╮/)).toBe(true)
  expect(await text(ui)).toContain('  ┆  #01 ■ Le seul ticket')
  // Beta has nothing resolved, no fog and nothing out of scope: no group and no Button for them.
  expect((await ui.findAll({ type: 'Button' })).map(b => b.props.hotkey)).toEqual(['a', 'b'])
  expect(await has(ui, /done|fog|out of scope/)).toBe(false)
  expect((await ui.find({ key: 'way:effort:beta' }))?.text).toBe('● beta')
  expect((await ui.find({ key: 'way:effort:alpha' }))?.text).toBe('○ alpha')
  expect(await ui.find({ key: 'way:effort:prod-v1' })).toBeUndefined()

  await ui.press({ key: 'way:effort:alpha' })
  expect(await has(ui, /│ GitLab #29/)).toBe(true)
  // Reading beta again does not undo the person's choice; /wayfinder naming an effort does.
  await $.tool.call({ tool: 'Read', tool_use_id: 'r2', file_path: '/repo/.scratch/beta/issues/01-seul.md' })
  expect(await has(ui, /│ GitLab #29/)).toBe(true)
  await $.command.run({ command: 'wayfinder', args: 'beta', origin: { kind: 'composer' } } as never)
  expect(await has(ui, /╭─ Beta effort /)).toBe(true)
  await ui.unmount()
})

test('a loose file in .scratch/ or a directory without a map does not move the map off the effort the session is on', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/repo/.scratch/beta/map.md' })
  await $.tool.call({ tool: 'Skill', tool_use_id: 'k1', skill: 'wayfinder' })
  const ui = await $.ui.mount(tickets(60, 80))
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
  expect(await has(ui, /│ GitLab #29/)).toBe(true)
  await ui.unmount()
})

test('a session started outside the repository finds the map through the files it touches', async ($, on) => {
  world(on, '/home/me')
  await $.prompt.submit({ text: '/wayfinder', wait: false, origin: { kind: 'composer' } })
  const ui = await $.ui.mount(tickets(60, 80))
  expect(await has(ui, /wayfinder is on: no map found/)).toBe(true)
  await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/repo/.scratch/alpha/map.md' })
  expect(await has(ui, /│ GitLab #29/)).toBe(true)
  await ui.unmount()
})

test('the Tickets pane never folds: short and narrow, it still lists every ticket, each line cut to its width', async ($, on) => {
  const { files } = world(on)
  for (let n = 11; n < 19; n++) files[`/repo/.scratch/alpha/issues/${n}-libre.md`] = { text: ticket(`Ticket libre ${n}, dont le titre passe la largeur d'un panneau étroit`, 'research', 'open'), mtimeMs: 200 }
  files['/repo/.scratch/alpha/issues/19-noue.md'] = { text: ticket('Le noeud', 'task', 'open', '03, 11, 12'), mtimeMs: 200 }
  await $.tool.call({ tool: 'Skill', tool_use_id: 'k1', skill: 'wayfinder' })
  const ui = await $.ui.mount(tickets(34, 26))
  const seen = await text(ui)
  // No line passes the 34 cells, a Button's "g: " included; what does not fit the rows scrolls.
  expect(lines((await ui.drawn()) as Node).filter(l => l.length !== 34)).toEqual([])
  expect(seen.length).toBeGreaterThan(26)
  for (let n = 11; n < 19; n++) expect(seen.filter(l => l.startsWith(` ┆  #${n} ◇ Ticket libre ${n}`)).length).toBe(1)
  expect(seen.filter(l => /\+\d+ more|folded/.test(l))).toEqual([])
  // A title takes two lines at the most, the second under the first and cut where the pane ends.
  const long = seen.findIndex(l => l.startsWith(' ┆  #18 ◇ Ticket libre 18'))
  expect([seen[long + 1]?.startsWith(' ┆        '), seen[long + 1]?.endsWith('…'), seen[long + 2]]).toEqual([true, true, ' ┆'])
  // What stands at a row's right (a blocker's number, the GitLab issue) is kept; the title gives it the room.
  expect(seen.some(l => /^ ┆ {2}#05 ■ Le panier mixte +← #03$/.test(l))).toBe(true)
  const done = seen.findIndex(l => /^ │ {2}#01 ◇ Le format de la +gl#30$/.test(l))
  expect(seen[done + 1]).toBe(' │        colonne')
  // Three blockers do not fit beside a title here: they are cited on the row under it, never left out.
  const knot = seen.indexOf(' ┆  #19 ■ Le noeud')
  expect([knot >= 0, seen[knot + 1]]).toEqual([true, ' ┆        ← #03, #11, #12'])
  await ui.unmount()
})

test('the Tickets pane is a tab from the session\'s start, behind; only the person\'s /tickets raises it', async ($, on) => {
  const { opened } = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  // Asked for first and with no `focus`: wayfinder or not, the tab is there, behind the pane met after it.
  expect(opened.slice(0, 2)).toEqual([{ id: 'tickets' }, { id: 'flow-map' }])
  await $.skill.prompt({ skill: 'wayfinder', text: 'the skill' })
  expect(opened.filter(one => one.id === 'tickets')).toEqual([{ id: 'tickets' }])
  expect((await $.command.run({ command: 'tickets', args: '', origin: { kind: 'composer' } } as never)).text).toBe('Tickets pane opened.')
  expect(opened.filter(one => one.id === 'tickets')).toEqual([{ id: 'tickets' }, { id: 'tickets', focus: true }])
  // A session with nobody at it (`-p`) asks for no pane.
  opened.length = 0
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  expect(opened).toEqual([])
})

test('the system prompt section tells the model not to re-post the wayfinder map', async ($, on) => {
  on('prompt.compose', () => ({ sections: [] }))
  const got = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, traits: [], tools: ['mcp__loadout__steps'] })
  expect(got.sections.map(s => s.id)).toEqual(['flow-map:steps'])
  expect(got.sections[0]?.text).toMatch(/wayfinder skill is active the Tickets pane already shows .* do not re-post the map/)
  // A step label is five words at most: the pane gives a step one line, two to the active one.
  expect(got.sections[0]?.text).toMatch(/each label 5 words at most/)
})
