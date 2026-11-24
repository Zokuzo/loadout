// The Tickets pane as lines of cells: the wayfinder map alone, at its full height. Nothing folds here: what does not
// fit the pane's rows scrolls. register.tsx turns each line into elements, as it does the Flow map's (draw.ts).
import type { Ticket, Way, WayMap } from '../../types'
import { cells, clip, gap, s, shapes, spread } from './draw'
import type { Line, Seg } from './draw'
import { fit, fitTwo, inState, numOf, resolvedLast } from './lib'
import { STEPS } from './palette'
import type { Palette, StepState, StepsStyle } from './palette'

export type TicketScene = {
  /** The pane's body, in columns. */
  w: number
  P: Palette
  /** How the map is drawn: the theme pack's steps style, the built-in one without a pack. */
  S?: StepsStyle
  way: Way
  map: WayMap | null
}

const STATE_OF = { resolved: 'done', claimed: 'active', frontier: 'pending', blocked: 'blocked' } as const
const TYPE = { research: '◇', grilling: '?', prototype: '±', task: '■', other: '•' } as const
const FOLDS = { fog: ['g', 'fog'], out: ['o', 'out of scope'] } as const
const EFFORT_KEYS = 'abceh'
/** What blocks a ticket stands at its row's right up to this many cells ("← #03, #05, #07"); longer, it has a row of its own. */
const ASIDE = 16
/** The cells a title keeps before what stands at its right is given up. */
const TITLE_MIN = 8

/** How a group's tickets are written: the title's colour, bold or struck, and the type glyph's colour where it is not the type's own. */
type Look = { hue: string; bold?: boolean; strike?: boolean; mark?: string }
/** What every row of one drawing shares: the palette, the width, the blocked state's colour, the cells of the widest ticket number. */
type Pen = { P: Palette; W: number; alarm: string; numW: number }

/**
 * A ticket's rows: its number, its type and its title on two lines at most; at the right what blocks it and its GitLab
 * issue. A pane too narrow for both keeps the title: what blocks the ticket then has the row under it, as a long one has.
 */
function ticketRows({ P, W, alarm, numW }: Pen, t: Ticket, rail: Seg, look: Look): Line[] {
  const typeHue = { research: P.blue, grilling: P.violet, prototype: P.green, task: P.orange, other: P.text2 } as const
  const head: Line = [rail, s(`${numOf(t.n).padEnd(numW)} `, P.text3), s(`${TYPE[t.type]} `, look.mark ?? typeHue[t.type])]
  const room = W - cells(head)
  const by = t.blockers.length === 0 ? '' : `← ${t.blockers.join(', ')}`
  const wanted: Seg[] = [...(by !== '' && by.length <= ASIDE ? [s(by, alarm)] : []), ...(t.iid === null ? [] : [s(`gl#${t.iid}`, P.text4)])]
  const aside: Line = wanted.flatMap((seg, i) => (i === 0 ? [seg] : [gap(2), seg]))
  const right = cells(aside) + 1 + TITLE_MIN <= room ? aside : []
  const isBeside = right.length > 0 && by.length <= ASIDE
  const words = (text: string): Seg => ({ ...s(text, look.hue, look.bold), ...(look.strike === true ? { x: true } : {}) })
  const under = (seg: Seg): Line => [rail, gap(cells(head) - cells([rail])), seg]
  const [first = '', second] = fitTwo(t.title, room - (right.length === 0 ? 0 : cells(right) + 1), room)
  return [
    spread(W, [...head, words(first)], right),
    ...(second === undefined ? [] : [under(words(second))]),
    ...(by === '' || isBeside ? [] : [under(s(fit(by, room), P.text3))]),
  ]
}

/** What is left of the map (fog, out of scope), under a Button that opens it; nothing for an empty list. */
function section({ P, W }: Pen, way: Way, id: keyof typeof FOLDS, items: string[], hue: string): Line[] {
  if (items.length === 0) return []
  const [hotkey, name] = FOLDS[id]
  const isOpen = way.open.includes(id)
  return [
    [s(`${isOpen ? '▾' : '▸'}  `, P.text4), { btn: { key: `way:${id}`, label: fit(`${name} (${items.length})`, Math.max(4, W - 6)), hotkey, dim: !isOpen, act: { a: 'way', id } } }],
    ...(isOpen ? items.map((item): Line => [gap(3), s('· ', P.text4), s(fit(item, Math.max(4, W - 5)), hue)]) : []),
  ]
}

/** One Button per effort that holds a map, the one shown marked; none for a single effort. */
function efforts(map: WayMap, W: number, wrap: (items: Line[]) => Line[]): Line[] {
  if (map.efforts.length < 2) return []
  return wrap(map.efforts.map((name, i): Line => {
    const key = EFFORT_KEYS[i]
    return [{ btn: { key: `way:effort:${name}`, label: `${name === map.effort ? '●' : '○'} ${fit(name, Math.max(6, W - 6))}`, dim: name !== map.effort, act: { a: 'effort', name }, ...(key === undefined ? {} : { hotkey: key }) } }]
  }))
}

/** Where we are, what comes next, what is blocked and by which ticket, what is resolved, and what is left of the map. */
export function tickets(sc: TicketScene): Line[] {
  const { P, way, map } = sc
  const pad = sc.w >= 44 ? 2 : 1
  const W = Math.max(20, sc.w - pad * 2)
  const S = sc.S ?? STEPS
  const { nodeOf, up, wrap, meter, frame } = shapes(P, S, W)
  const inset = (rows: Line[]): Line[] => rows.map((line): Line => (line.length === 0 ? line : [gap(pad), ...clip(line, W)]))
  if (!way.active) return inset([[s('No wayfinder map yet.', P.text3)], [s(fit('It is drawn once the wayfinder skill is used.', W), P.text4)]])
  if (map === null) return inset([[s('wayfinder is on: no map found', P.text3)], [s('looked for .scratch/*/map.md', P.text4)]])

  const [D, A, N, B] = [S.states.done, S.states.active, S.states.pending, S.states.blocked]
  // (Every number as wide as the widest, so the titles of #99 and #100 start at one column.)
  const pen: Pen = { P, W, alarm: P[B.color], numW: Math.max(3, ...map.tickets.map(t => numOf(t.n).length)) }
  // What a group's tickets stand behind: the state's rail, or in a list its filled left edge.
  const railOf = (st: StepState): Seg => (S.layout === 'list' ? s(`${st.edge}  `, P[st.edgeColor]) : s(`${st.rail}  `, P[st.railColor]))
  /** A group: its node and name, how many it holds said once at the right, then its tickets behind its rail. */
  const group = (st: StepState, node: string, name: string, hue: string, isBold: boolean, note: string, list: Ticket[], look: (i: number) => Look): { rail: Seg; lines: Line[] } => {
    const rail = railOf(st)
    const head: Line = [s(`${node}  `, hue, isBold), s(up(name), hue, isBold)]
    return { rail, lines: [spread(W, head, [s(fit(up(note), Math.max(1, W - cells(head) - 1)), P.text4)]), ...list.flatMap((t, i) => ticketRows(pen, t, rail, look(i)))] }
  }

  const done = resolvedLast(map)
  const here = inState(map, 'claimed')
  const next = inState(map, 'frontier')
  const blocked = inState(map, 'blocked')
  const total = map.tickets.length
  const groups = [
    group(A, here.length > 0 ? nodeOf('active') : N.glyph, 'here', here.length > 0 ? P[A.color] : P[N.color], here.length > 0 && A.bold, here.length === 0 ? 'no ticket claimed' : `${here.length} claimed`,
      here, () => ({ hue: P.fg, bold: true })),
    // The first is what the skill takes next: it alone is as bright as the claimed one.
    group(N, N.glyph, 'next', next.length > 0 ? P.fg : P[N.color], false, next.length === 0 ? 'nothing unblocked' : `${next.length} unblocked`,
      next, i => ({ hue: i === 0 ? P.fg : P.text2 })),
    ...(blocked.length === 0 ? [] : [group(B, B.glyph, 'blocked', P[B.color], B.bold, `${blocked.length} waiting`, blocked, () => ({ hue: P.text3 }))]),
    // How many are resolved is the box's to say; the last one resolved is on top.
    ...(done.length === 0 ? [] : [group(D, D.glyph, 'done', P[D.color], D.bold, '', done, () => ({ hue: P[D.labelColor], strike: D.strike, mark: P[D.color] }))]),
  ]
  const left = [
    ...(map.unreadable > 0 ? [[s('!  ', P.red, true), s(fit(`${map.unreadable} ticket ${map.unreadable === 1 ? 'file' : 'files'} unreadable`, Math.max(4, W - 3)), P.red)]] : []),
    ...section(pen, way, 'fog', map.fog, P.text2),
    ...section(pen, way, 'out', map.out, P.text4),
  ]
  return inset([
    ...efforts(map, W, wrap),
    ...frame(map.title, `${done.length}/${total}`, inner => [
      [s(fit(map.destination || 'no destination written yet', inner), P.text2)],
      ...(map.carte === null ? [] : [[s(fit(`GitLab #${map.carte}`, inner), P.text3)]]),
      meter(inner, total === 0 ? 0 : done.length / total, map.tickets.map(t => STATE_OF[t.state])),
    ]),
    [],
    // Between two groups the rail goes on in a path; a list has a blank row (an edge with nothing beside it is noise).
    ...groups.flatMap((g, i): Line[] => [...g.lines, ...(i === groups.length - 1 ? [] : [S.layout === 'list' ? [] : [g.rail]])]),
    ...(left.length === 0 ? [] : [[], ...left]),
  ])
}
