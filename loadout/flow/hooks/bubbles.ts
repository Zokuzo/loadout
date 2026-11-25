// The bubble map: the session and its agents as they stand now, in one picture. Three pure steps:
// the state worded (sceneOf), the words placed (layout), the places painted (render).
// Every size is in device pixels and comes from the mock-up the map was validated on (837 x 567).
import type { Agent } from '../../types'
import { agentKey, soloKey } from './draw'
import { fit, isOver, modelOf, toolName } from './lib'
import type { RunView } from './lib'
import { arrow, bar, icon, line, mix, picture, rgb, rrect, text, textWidth } from './pixels'
import type { Face, Picture, Rgb } from './pixels'

// ── The scene: what is shown, already worded ──

export type Model = 'fable' | 'opus' | 'sonnet' | 'haiku' | 'other'
/** The model colours: a pastel fill and a dark outline. `other` is any model the map does not know. */
export const MODELS: Record<Model, readonly [fill: Rgb, edge: Rgb]> = {
  fable: [rgb('#d0bfff'), rgb('#5f3dc4')],
  opus: [rgb('#ffd8a8'), rgb('#d9480f')],
  sonnet: [rgb('#99e9f2'), rgb('#0b7285')],
  haiku: [rgb('#b2f2bb'), rgb('#2b8a3e')],
  other: [rgb('#e9ecef'), rgb('#495057')],
}
/** Text on a pastel fill. */
const INK = rgb('#1e1e1e')

/** An agent in full. */
export type Bubble = {
  /** Its key in the pane ('main' for the main session): what a selection names. */
  key: string
  name: string
  model: Model
  /** Its model as written: "sonnet 5.5", an unknown model's id, '' for none. */
  label: string
  /** The call in progress. */
  now: { verb: string; target: string } | null
  /** What stands in the call's place while none runs; '' for nothing. */
  idle: string
  /** The calls before it, the latest first. */
  before: string[]
  elapsed: string
  calls: number
  tokens: string
  /** The cache share: the part of its last input read from the cache, 0 to 1; null before its first request. */
  read: number | null
  /** The cache expiry, worded; '' before its first request. */
  expiry: string
  /** Waiting or not started yet: its outline is dashed. */
  isDashed: boolean
  isSelected: boolean
  /** When it was launched. */
  at: number
}
/** An agent in one line: one that finished, or one at work that has no room for a bubble. */
export type Chip = { name: string; model: Model; sign: 'run' | 'done' | 'failed'; took: string; at: number; endedAt: number }
/** The agents that stand together: the plain subagents (no `run`), or one run's. */
export type Group = { run?: { name: string; phase: string }; running: Bubble[]; finished: Chip[]; /** Finished agents no row is kept of. */ gone: number }
export type MapScene = { main: Bubble; groups: Group[] }

const two = (n: number) => String(n).padStart(2, '0')

/** A duration as the map writes it: 52 s, 1 min 48, 14 min, 1 h 02. */
function span(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  if (s < 60) return `${s} s`
  if (m < 10) return `${m} min ${two(s % 60)}`

  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${two(m % 60)}`
}

/** A token count: 950, 31.2k, 212k, 1.25M. */
const count = (n: number): string => (n < 1000 ? String(n) : n < 99_950 ? `${(n / 1000).toFixed(1)}k` : n < 999_500 ? `${Math.round(n / 1000)}k` : `${(n / 1_000_000).toFixed(2)}M`)

/** The time a cache has left: in minutes from ten up, to the second under. */
function expiryOf(left: number): string {
  if (left <= 0) return 'expired'
  const s = Math.floor(left / 1000)

  return s >= 600 ? `expires ${Math.floor(s / 60)} min` : `expires ${Math.floor(s / 60)}:${two(s % 60)}`
}

const familyOf = (id: string): Model => modelOf(id)?.family ?? 'other'

/** What stands in an agent's call line while no call runs. */
const idleOf = (a: Agent, isBusy: boolean): string => (a.status === 'queued' ? 'starting' : a.waiting === true ? 'waiting on background work' : isBusy ? 'thinking' : '')

/** An agent in full at `now`; `isBusy` is whether it is at work when no call of its runs. */
function bubbleOf(a: Agent, key: string, now: number, sel: string, isBusy = true): Bubble {
  const total = a.ask === undefined ? 0 : a.ask.fresh + a.ask.read + a.ask.wrote
  const last = a.calls[a.calls.length - 1]

  return {
    key, name: a.label, model: familyOf(a.model), label: modelOf(a.model)?.full ?? a.model,
    now: last === undefined ? null : { verb: toolName(last.tool), target: last.what },
    idle: idleOf(a, isBusy),
    before: [...a.log].reverse().map(done => `${toolName(done.tool)} ${done.what}`.trim()),
    elapsed: span(now - a.startedAt), calls: a.tools, tokens: count(total),
    read: a.ask === undefined || total === 0 ? null : a.ask.read / total,
    expiry: a.ask === undefined ? '' : expiryOf(a.ask.at + a.ask.ttlMs - now),
    isDashed: a.status === 'queued' || a.waiting === true, isSelected: key === sel, at: a.startedAt,
  }
}

const chipOf = (a: Agent): Chip => ({ name: a.label, model: familyOf(a.model), sign: a.status === 'done' ? 'done' : 'failed', took: span(a.endedAt - a.startedAt), at: a.startedAt, endedAt: a.endedAt })
const byLaunch = <T extends { at: number }>(list: T[]): T[] => [...list].sort((a, b) => a.at - b.at)
/** The agents not over, those started before those only asked for, each by launch: an agent at work has a bubble before one that waits to start. */
const atWork = (agents: readonly Agent[]): Agent[] => agents.filter(a => !isOver(a)).sort((a, b) => Number(a.status === 'queued') - Number(b.status === 'queued') || a.startedAt - b.startedAt)

/** The state as the bubble map words it at `now`. `sel` is the selected agent's key, `isWorking` whether the main session's turn runs. */
export function sceneOf(o: { main: Agent; isWorking: boolean; solo: readonly Agent[]; runs: readonly RunView[]; now: number; sel: string }): MapScene {
  // A run that is over has no zone: it is one chip among the plain subagents.
  const over = o.runs.map(rv => rv.run).filter(run => run.endedAt !== null)
    .map((run): Chip => ({ name: run.name, model: 'other', sign: run.outcome === 'completed' ? 'done' : 'failed', took: span((run.endedAt ?? run.startedAt) - run.startedAt), at: run.startedAt, endedAt: run.endedAt ?? run.startedAt }))
  const plain: Group = { running: atWork(o.solo).map(a => bubbleOf(a, soloKey(a), o.now, o.sel)), finished: byLaunch([...o.solo.filter(isOver).map(chipOf), ...over]), gone: 0 }
  const zones = o.runs.filter(rv => rv.run.endedAt === null).map((rv): Group => ({
    run: { name: rv.run.name, phase: rv.phases[rv.at] === undefined ? '' : `phase ${rv.at + 1}/${rv.phases.length} ${rv.phases[rv.at]!.title}` },
    running: atWork(rv.run.agents).map(a => bubbleOf(a, agentKey(rv.run, a), o.now, o.sel)),
    finished: byLaunch(rv.run.agents.filter(isOver).map(chipOf)),
    gone: Math.max(0, rv.run.spawned - rv.run.agents.length),
  }))

  return { main: bubbleOf(o.main, 'main', o.now, o.sel, o.isWorking), groups: [...(plain.running.length + plain.finished.length > 0 ? [plain] : []), ...zones] }
}

/** A bubble's counts on one line. */
const statsOf = (b: Bubble) => `${b.elapsed} · ${b.calls} ${b.calls === 1 ? 'call' : 'calls'} · ${b.tokens} tok`

/** A chip in words. */
const endedOf = (c: Chip): string => `${c.name}${c.model === 'other' ? '' : ` (${c.model})`} ${c.sign === 'done' ? `finished in ${c.took}` : c.sign === 'failed' ? `failed after ${c.took}` : `at work for ${c.took}`}`

/** A bubble in words. */
function saidOf(b: Bubble): string {
  const who = `${b.name}${b.label === '' ? '' : ` (${b.label})`}${b.isDashed ? ', waiting' : ''}${b.isSelected ? ', selected' : ''}`
  const doing = b.now === null ? b.idle || 'no call in progress' : `${b.now.verb} ${b.now.target}`.trim()

  return [`${who}: ${doing}`, statsOf(b), ...(b.read === null ? [] : [`cache ${Math.round(b.read * 100)}% read, ${b.expiry}`])].join('; ')
}

/**
 * The scene in words, a line an agent: what the picture's `alt` says where the picture cannot be seen (a screen
 * reader, a terminal that draws no picture), and every agent of it, with or without room for a bubble.
 */
export function altOf(scene: MapScene): string {
  const group = (g: Group): string[] => [
    ...(g.run === undefined ? [] : [`run ${g.run.name}${g.run.phase === '' ? '' : `, ${g.run.phase}`}`]),
    ...g.running.map(saidOf),
    ...g.finished.map(endedOf),
    ...(g.gone === 0 ? [] : [`+${g.gone} finished`]),
  ]

  return [saidOf(scene.main), ...scene.groups.flatMap(group)].join('\n')
}

// ── The layout: where each thing goes ──

/** One thing to paint: a shape of the pixel kit and what it takes. */
export type Shape =
  | ({ kind: 'rrect' } & Parameters<typeof rrect>[1])
  | ({ kind: 'line' } & Parameters<typeof line>[1])
  | ({ kind: 'arrow' } & Parameters<typeof arrow>[1])
  | ({ kind: 'bar' } & Parameters<typeof bar>[1])
  | ({ kind: 'icon' } & Parameters<typeof icon>[1])
  | ({ kind: 'text' } & Parameters<typeof text>[1])
/** The room a picture has: its width, the most it may be tall, and a cell's height, which its own height is a multiple of. */
export type Room = { width: number; maxHeight: number; cellHeight: number }
/** The colours drawn straight on the theme's ground. */
export type Inks = { ground: Rgb; fg: Rgb; dim: Rgb }
/** A picture laid out: its shapes in painting order, and the keys of its bubbles from left to right. */
export type Laid = { width: number; height: number; shapes: Shape[]; order: string[] }

const MARGIN = 10
const TOP = 8
const [BUBBLE_W, MAIN_W, MAIN_H] = [258, 600, 108]
/** Under this width the main session is a plain bubble: its two columns have no room. */
const WIDE = 540
const [SLOT_GAP, GROUP_GAP, ZONE_PAD, ZONE_FOOT] = [12, 11, 10, 11]
/** The rows between the main session and the bubbles: the arrows and their numbers, a zone's name and phase, the chips. */
const [BAND, BAND_TIGHT, HEAD, CHIPS, CHIP_H] = [52, 36, 54, 54, 28]
const CHIP_MAX = 200
/** How far an arrow keeps from what is beside it: a chip's end, another arrow. */
const CLEAR = 17
/** A call before the one in progress: one line of this height. */
const CALL_H = 17
const [DASH, ZONE_DASH, REPLY_DASH] = [[5, 3], [7, 5], [6, 4]] as const
const LEGEND_ROW = 22

/** A bubble that lists `before` calls. */
const bubbleH = (before: number) => 162 + CALL_H * before
const cut = (s: string, width: number, face: Face) => fit(s, Math.max(1, Math.floor(width / textWidth('m', face))))
const tones = (model: Model) => ({ fill: MODELS[model][0], edge: MODELS[model][1], soft: mix(INK, MODELS[model][0], 0.3) })

/** The call in progress, then the calls before it, `before` of them. */
function calls(out: Shape[], b: Bubble, x: number, y: number, width: number, before: number) {
  const { edge, soft } = tones(b.model)
  const room = Math.floor((width - 16) / 8)
  if (b.now !== null) {
    const verb = fit(b.now.verb, room)
    out.push({ kind: 'icon', sign: 'run', x, y: y + 3, size: 10, color: edge }, { kind: 'text', x: x + 16, y, text: verb, color: mix(edge, INK, 0.2), face: '8b' })
    if (b.now.target !== '' && room - verb.length >= 3) out.push({ kind: 'text', x: x + 16 + (verb.length + 1) * 8, y, text: fit(b.now.target, room - verb.length - 1), color: INK, face: '8b' })
  } else if (b.idle !== '') out.push({ kind: 'text', x, y, text: cut(b.idle, width, '8b'), color: soft, face: '8b' })
  b.before.slice(0, before).forEach((call, i) => {
    const top = y + 21 + CALL_H * i
    out.push({ kind: 'icon', sign: 'dot', x: x + 1, y: top + 3, size: 9, color: soft }, { kind: 'text', x: x + 16, y: top, text: cut(call, width - 16, '7'), color: soft, face: '7' })
  })
}

/** Three rows: the label and the expiry, the split bar, then each part named under its end of the bar. */
function cache(out: Shape[], b: Bubble, x: number, y: number, width: number) {
  const { fill, edge } = tones(b.model)
  out.push({ kind: 'text', x, y, text: 'cache', color: INK, face: '7b' })
  if (b.expiry !== '') out.push({ kind: 'text', x: x + width - textWidth(b.expiry, '7'), y, text: b.expiry, color: INK, face: '7' })
  out.push({ kind: 'bar', x, y: y + 20, w: width, h: 10, share: b.read ?? 0, full: edge, rest: fill, outline: edge })
  if (b.read === null) return
  const [read, rest] = [`${Math.round(b.read * 100)}% read`, `${100 - Math.round(b.read * 100)}% rewritten`]
  out.push({ kind: 'text', x, y: y + 35, text: read, color: INK, face: '7' }, { kind: 'text', x: x + width - textWidth(rest, '7'), y: y + 35, text: rest, color: INK, face: '7' })
}

const frame = (b: Bubble, x: number, y: number, w: number, h: number): Shape =>
  ({ kind: 'rrect', x, y, w, h, r: 12, fill: tones(b.model).fill, outline: tones(b.model).edge, ...(b.isDashed ? { dash: DASH } : {}), ...(b.isSelected ? { width: 4 } : {}) })
/** The name, then the model's label ending at `right`; the name is cut to what the label leaves it. */
function titled(out: Shape[], b: Bubble, left: number, right: number, y: number) {
  const label = fit(b.label, 14)
  const taken = label === '' ? 0 : textWidth(label, '7b') + 9
  out.push({ kind: 'text', x: left, y: y + 12, text: cut(b.name, right - left - taken, '9b'), color: INK, face: '9b' })
  if (label !== '') out.push({ kind: 'text', x: right - textWidth(label, '7b'), y: y + 15, text: label, color: mix(tones(b.model).edge, INK, 0.25), face: '7b' })
}

/** A bubble, top to bottom: name and model, the calls, a rule, the counts, the cache. */
function bubble(out: Shape[], b: Bubble, x: number, y: number, before: number) {
  const { fill, edge } = tones(b.model)
  const [left, width, rule] = [x + 12, BUBBLE_W - 24, y + 69 + CALL_H * before]
  out.push(frame(b, x, y, BUBBLE_W, bubbleH(before)))
  titled(out, b, left, left + width, y)
  calls(out, b, left, y + 41, width, before)
  out.push({ kind: 'line', x1: left, y1: rule, x2: left + width, y2: rule, color: mix(edge, fill, 0.5) }, { kind: 'text', x: left, y: rule + 9, text: cut(statsOf(b), width, '7'), color: INK, face: '7' })
  cache(out, b, left, rule + 31, width)
}

/** The main session where the pane is wide: the calls on the left, the counts and the cache on the right. */
function wideMain(out: Shape[], b: Bubble, x: number, w: number) {
  const { fill, edge } = tones(b.model)
  const [left, split, right, end] = [x + 14, x + 276, x + 290, x + w - 14]
  out.push(frame(b, x, TOP, w, MAIN_H))
  titled(out, b, left, split - 14, TOP)
  calls(out, b, left, TOP + 41, split - 14 - left, 2)
  out.push({ kind: 'line', x1: split, y1: TOP + 12, x2: split, y2: TOP + MAIN_H - 12, color: mix(edge, fill, 0.5) }, { kind: 'text', x: right, y: TOP + 15, text: cut(statsOf(b), end - right, '7'), color: INK, face: '7' })
  cache(out, b, right, TOP + 41, end - right)
}

/** A chip's name cut so the chip is at most CHIP_MAX wide, and that width. */
function sized(c: Chip): { name: string; w: number } {
  const name = fit(c.name, Math.max(1, Math.floor((CHIP_MAX - 44 - textWidth(c.took, '7')) / 7)))

  return { name, w: 44 + textWidth(name, '7b') + textWidth(c.took, '7') }
}

type Seat = { b: Bubble; x: number; lane: number }
type Spot = { c: Chip; name: string; x: number; w: number }
type More = { label: string; x: number; w: number }
type Placed = { group: Group; x: number; w: number; seats: Seat[]; spots: Spot[]; more: More | null }
/** A picture's width, shared out: the main session's place, where an arrow may run (under it, clear of its corners), what a row may fill. */
type Across = { W: number; avail: number; fill: number; isWide: boolean; mainX: number; mainW: number; from: number; to: number }

function across(W: number): Across {
  const [avail, isWide] = [W - 2 * MARGIN, W >= WIDE]
  const mainW = isWide ? Math.min(MAIN_W, avail) : BUBBLE_W
  const mainX = Math.floor((W - mainW) / 2)

  // A row never grows past what leaves its outer bubbles a lane under the main session.
  return { W, avail, fill: Math.min(avail, mainW + 2 * (BUBBLE_W - 32)), isWide, mainX, mainW, from: mainX + 16, to: mainX + mainW - 16 }
}

/** What a row of groups takes across, each with its count of bubble slots. */
const rowWidth = (groups: Group[], slots: number[]) =>
  slots.reduce((sum, n, i) => sum + n * BUBBLE_W + (n - 1) * SLOT_GAP + (groups[i]!.run === undefined ? 0 : 2 * ZONE_PAD), 0) + GROUP_GAP * Math.max(0, slots.length - 1)

/**
 * The groups of a scene that a picture `width` wide has room for, from the first: each needs one bubble's width.
 * The agents of the others are not drawn: they are counted in a "+N more", and no key reaches them.
 */
export function shownOf(scene: MapScene, width: number): Group[] {
  const { fill } = across(width)
  let shown = scene.groups
  while (shown.length > 0 && rowWidth(shown, shown.map(() => 1)) > fill) shown = shown.slice(0, -1)

  return shown
}

/** How many finished agents may ask for a chip: no row of chips holds more. */
const MAX_CHIPS = 8
/** The finished agents that may keep a chip: the latest. */
const latestOf = (g: Group): Chip[] => [...g.finished].sort((a, b) => b.endedAt - a.endedAt).slice(0, MAX_CHIPS)

/** How many bubble slots each group gets: one, then one more per agent at work while the row fits, by launch; then the room left goes to the groups whose chips want more than their bubbles' width. */
function slotsOf(shown: Group[], fill: number): number[] {
  const slots = shown.map(() => 1)
  const fits = (i: number) => rowWidth(shown, slots.map((n, j) => (j === i ? n + 1 : n))) <= fill
  for (;;) {
    const next = shown.map((g, i) => ({ i, b: g.running[slots[i]!] })).filter(x => x.b !== undefined).sort((a, b) => a.b!.at - b.b!.at)[0]
    if (next === undefined || !fits(next.i)) break
    slots[next.i]! += 1
  }
  shown.forEach((g, i) => {
    const wanted = Math.min(3, Math.ceil((latestOf(g).reduce((sum, c) => sum + sized(c).w + 8, 0) + (g.finished.length + g.gone > 0 ? 120 : 0)) / (BUBBLE_W + SLOT_GAP)))
    while (slots[i]! < wanted && fits(i)) slots[i]! += 1
  })

  return slots
}

/** What flow() is asked: the bubbles and the chips of one group, its inner edges, where an arrow may run, and the "+N" chip's width (0 for none). */
type Flow = { bubbles: Bubble[]; chips: Chip[]; left: number; right: number; from: number; to: number; more: number }
type Flowing = { lanes: number[]; spots: Spot[]; cursor: number; lastEnd: number }

/** The last pixel bubble `i`'s lane may take. */
const laneEnd = (o: Flow, i: number) => Math.min(o.left + i * (BUBBLE_W + SLOT_GAP) + BUBBLE_W - 16, o.to, o.right - o.more - CLEAR)

/** The last pixel a chip may take: before the "+N" chip, and with its last arrow still under the main session. */
const chipEnd = (o: Flow) => Math.min(o.right - (o.more === 0 ? 0 : o.more + 8), o.to + 16)

/** Gives the next bubble its lane: its middle, or past the chips before it; false when it has none left. */
function lane(o: Flow, at: Flowing): boolean {
  const x = o.left + at.lanes.length * (BUBBLE_W + SLOT_GAP)
  const [from, end] = [Math.max(x + 16, o.from, at.lastEnd + CLEAR), laneEnd(o, at.lanes.length)]
  if (from > end) return false
  at.lanes.push(Math.round(Math.min(end, Math.max(from, x + BUBBLE_W / 2))))
  at.cursor = Math.max(at.cursor, at.lanes[at.lanes.length - 1]! + CLEAR)

  return true
}

/**
 * A group's chips from left to right over its bubbles, and each bubble's lane: where its launch runs down between
 * the chips. Null when they do not all fit: the caller tries with one chip fewer.
 */
function flow(o: Flow): { lanes: number[]; spots: Spot[] } | null {
  const at: Flowing = { lanes: [], spots: [], cursor: o.left, lastEnd: -Infinity }
  for (const c of o.chips) {
    const { name, w } = sized(c)
    // its leftmost arrow, from its right end: its launch, which stands alone while it runs
    const first = c.sign === 'run' ? 16 : 42
    const x = () => Math.max(at.cursor, o.from + first - w)
    // a chip that would leave the next bubble no lane comes after that lane
    while (at.lanes.length < o.bubbles.length && x() + w + CLEAR > laneEnd(o, at.lanes.length)) if (!lane(o, at)) return null
    if (x() + w > chipEnd(o)) return null
    at.spots.push({ c, name, x: x(), w })
    ;[at.lastEnd, at.cursor] = [x() + w, x() + w + 8]
  }
  while (at.lanes.length < o.bubbles.length) if (!lane(o, at)) return null

  return at
}

/** The "+N" of a group: what it counts and how it reads. `lost` says an agent at work is among them. */
function moreOf(uncounted: number, lost: boolean): { label: string; w: number } {
  const label = uncounted === 0 ? '' : `+${uncounted} ${lost ? 'more' : 'finished'}`

  return { label, w: label === '' ? 0 : textWidth(label, '7b') + 18 }
}

/** A zone's name and phase as written at its top left, cut to their room. */
const headOf = (group: Group): string[] => (group.run === undefined ? [] : [fit(group.run.name, 14), fit(group.run.phase, 16)])

/** A group's width, its inner edges (a zone keeps a padding), and where its first arrow may run: a zone's name and phase stand at its top left, and no arrow runs through them. */
function edgesOf(group: Group, x: number, slots: number, span: Across): { w: number; left: number; right: number; from: number } {
  const pad = group.run === undefined ? 0 : ZONE_PAD
  const w = slots * BUBBLE_W + (slots - 1) * SLOT_GAP + 2 * pad
  const [name = '', phase = ''] = headOf(group)
  const clear = group.run === undefined ? -Infinity : x + 12 + Math.max(textWidth(name, '8b'), textWidth(phase, '7b')) + 10

  return { w, left: x + pad, right: x + w - pad, from: Math.max(span.from, clear) }
}

/** The agents of a group that get its bubbles: the first launched, and the selected one in the last seat when it is not among them. */
function seatedOf(group: Group, slots: number): Bubble[] {
  const bubbles = group.running.slice(0, slots)
  const chosen = group.running.findIndex(b => b.isSelected)
  if (chosen >= bubbles.length && bubbles.length > 0) bubbles[bubbles.length - 1] = group.running[chosen]!

  return bubbles
}

/**
 * One group at `x` with `slots` bubble slots: its bubbles (the first launched, the selected one always), its chips
 * and its "+N". `folded` agents of groups that have no room are counted here too. Chips are given up one by one,
 * the finished agent that ended first, then the last one at work, until what is left fits.
 */
function seated(group: Group, x: number, slots: number, folded: number, span: Across): Placed {
  const { w, left, right, from } = edgesOf(group, x, slots, span)
  const bubbles = seatedOf(group, slots)
  const waiting = group.running.filter(b => !bubbles.includes(b)).map((b): Chip => ({ name: b.name, model: b.model, sign: 'run', took: b.elapsed, at: b.at, endedAt: 0 }))
  const latest = latestOf(group)
  let chips = [...waiting, ...group.finished.filter(c => latest.includes(c))]
  const seatAt = (n: number) => left + n * (BUBBLE_W + SLOT_GAP)
  for (;;) {
    const kept = chips
    const more = moreOf(group.gone + group.finished.length + waiting.length - kept.length + folded, folded > 0 || kept.filter(c => c.sign === 'run').length < waiting.length)
    const got = flow({ bubbles, chips: kept, left, right, from, to: span.to, more: more.w })
      // nothing left to give up: the lanes as they fall, whatever stands beside them
      ?? (kept.length === 0 ? { spots: [], lanes: bubbles.map((_, n) => Math.round(Math.min(span.to, Math.max(span.from, seatAt(n) + BUBBLE_W / 2)))) } : null)
    if (got !== null) return { group, x, w, seats: bubbles.map((b, n) => ({ b, x: seatAt(n), lane: got.lanes[n]! })), spots: got.spots, more: more.label === '' ? null : { label: more.label, x: right - more.w, w: more.w } }
    const oldest = kept.filter(c => c.sign !== 'run').sort((a, b) => a.endedAt - b.endedAt)[0]
    chips = oldest === undefined ? kept.slice(0, -1) : kept.filter(c => c !== oldest)
  }
}

/** The legend's signs and words, in rows that fit `width`: one row spreads over it, as the mock-up's does. */
function legend(out: Shape[], inks: Inks, y: number, width: number): void {
  type Item = { sign: number; label: string; draw: (x: number, top: number) => Shape }
  const items: Item[] = [
    ...(['fable', 'opus', 'sonnet', 'haiku'] as const).map((model): Item => ({ sign: 18, label: model, draw: (x, top) => ({ kind: 'rrect', x, y: top + 1, w: 18, h: 14, r: 4, fill: MODELS[model][0], outline: MODELS[model][1] }) })),
    { sign: 30, label: 'launches', draw: (x, top) => ({ kind: 'arrow', x1: x, y1: top + 8, x2: x + 30, y2: top + 8, color: inks.fg }) },
    { sign: 30, label: 'replies', draw: (x, top) => ({ kind: 'arrow', x1: x, y1: top + 8, x2: x + 30, y2: top + 8, color: inks.fg, dash: DASH }) },
    { sign: 22, label: 'waiting or finished', draw: (x, top) => ({ kind: 'rrect', x, y: top + 1, w: 22, h: 14, r: 4, outline: inks.fg, dash: [4, 3] }) },
  ]
  const wide = (item: Item) => item.sign + 7 + textWidth(item.label, '7')
  legendRows(width).forEach((row, j) => {
    const used = row.reduce((sum, i) => sum + wide(items[i]!), 0)
    const gap = legendRows(width).length === 1 ? (width - used) / (row.length - 1) : 14
    let x = MARGIN
    row.forEach(i => {
      const item = items[i]!
      out.push(item.draw(Math.round(x), y + j * LEGEND_ROW), { kind: 'text', x: Math.round(x) + item.sign + 7, y: y + j * LEGEND_ROW, text: item.label, color: inks.fg, face: '7' })
      x += wide(item) + gap
    })
  })
}

/** The widths of the legend's seven entries, sign and word. */
const LEGEND = [60, 53, 67, 60, 93, 86, 162]
/** The legend's entries (by index) row by row, 14 pixels apart at least. */
function legendRows(width: number): number[][] {
  const rows: number[][] = [[]]
  let used = 0
  LEGEND.forEach((w, i) => {
    if (rows[rows.length - 1]!.length > 0 && used + 14 + w > width) {
      rows.push([])
      used = 0
    }
    used += (rows[rows.length - 1]!.length > 0 ? 14 : 0) + w
    rows[rows.length - 1]!.push(i)
  })

  return rows
}

/** Where each row of the picture starts, top to bottom, and how tall the whole is. */
type Down = { before: number; bandTop: number; rowTop: number; chipY: number; bubbleY: number; rowBottom: number; legendY: number; discY: number; total: number }

/**
 * Down the picture: only the rows this scene needs, as the mock-up spaces them; closed up when the room is short,
 * then with fewer calls before in each bubble. Undefined when even that is too tall.
 */
function downOf(placed: Placed[], scene: MapScene, span: Across, maxHeight: number): Down | undefined {
  const seats = placed.flatMap(g => g.seats)
  const has: Has = {
    isWide: span.isWide, row: placed.length > 0, zone: placed.some(g => g.group.run !== undefined), chips: placed.some(g => g.spots.length > 0 || g.more !== null),
    seats: seats.length > 0, legend: legendRows(span.avail).length,
  }
  const want = Math.min(5, Math.max(2, ...seats.map(s => s.b.before.length), ...(span.isWide ? [] : [scene.main.before.length])))

  return [stacked(has, want, false), ...Array.from({ length: want + 1 }, (_, i) => stacked(has, want - i, true))].find(d => d.total <= maxHeight)
}

/** What a scene has to stack: a wide main session or a plain one, a row of groups at all, a zone, chips, bubbles, and how many rows of legend. */
type Has = { isWide: boolean; row: boolean; zone: boolean; chips: boolean; seats: boolean; legend: number }

/** The rows stacked, each bubble listing `before` calls; `isTight` closes up the arrows' band and the legend's margins. */
function stacked(has: Has, before: number, isTight: boolean): Down {
  const bandTop = TOP + (has.isWide ? MAIN_H : bubbleH(before))
  const rowTop = bandTop + (!has.row ? 0 : isTight ? BAND_TIGHT : BAND)
  const chipY = rowTop + (has.zone ? HEAD : 0)
  const bubbleY = chipY + (has.chips ? CHIPS : 0)
  const rowBottom = lowest(has, { bandTop, chipY, bubbleY }, before)
  const legendY = rowBottom + (isTight ? 14 : has.row ? 37 : 22)

  return { before, bandTop, rowTop, chipY, bubbleY, rowBottom, legendY, discY: Math.round((bandTop + rowTop) / 2), total: legendY + (has.legend - 1) * LEGEND_ROW + 16 + (isTight ? 9 : 31) }
}

/** Where the row of groups ends: under its bubbles, else under its chips; a zone adds its own foot. */
function lowest(has: Has, at: { bandTop: number; chipY: number; bubbleY: number }, before: number): number {
  if (!has.row) return at.bandTop
  if (has.seats) return at.bubbleY + bubbleH(before) + (has.zone ? ZONE_FOOT : 0)

  return at.chipY + (has.chips ? CHIP_H : 0) + (has.zone ? 12 : 0)
}

/** Each run zone: its dashed frame, its name, its phase. */
function zones(out: Shape[], placed: Placed[], at: Down, inks: Inks) {
  placed.filter(g => g.group.run !== undefined).forEach(g => {
    const [name, phase] = headOf(g.group)
    out.push({ kind: 'rrect', x: g.x, y: at.rowTop, w: g.w, h: at.rowBottom - at.rowTop, r: 14, outline: inks.dim, dash: ZONE_DASH }, { kind: 'text', x: g.x + 12, y: at.rowTop + 9, text: name!, color: inks.fg, face: '8b' })
    if (phase !== '') out.push({ kind: 'text', x: g.x + 12, y: at.rowTop + 28, text: phase!, color: inks.dim, face: '7b' })
  })
}

/** The arrows, numbered in the order things happened: a launch down to each agent drawn, a reply back up from each finished one. */
function arrows(out: Shape[], placed: Placed[], at: Down, inks: Inks) {
  const ofChip = (s: Spot) => (s.c.sign === 'run'
    ? [{ t: s.c.at, x: s.x + s.w - 16, y: at.chipY - 1, isReply: false }]
    : [{ t: s.c.at, x: s.x + s.w - 42, y: at.chipY - 1, isReply: false }, { t: s.c.endedAt, x: s.x + s.w - 16, y: at.chipY - 1, isReply: true }])
  const all = [...placed.flatMap(g => g.seats).map(s => ({ t: s.b.at, x: s.lane, y: at.bubbleY - 1, isReply: false })), ...placed.flatMap(g => g.spots).flatMap(ofChip)].sort((a, b) => a.t - b.t)
  all.forEach((a, i) => out.push({
    kind: 'arrow', x1: a.x, y1: a.isReply ? a.y : at.bandTop + 1, x2: a.x, y2: a.isReply ? at.bandTop + 1 : a.y, color: inks.fg,
    ...(a.isReply ? { dash: REPLY_DASH } : {}), number: i + 1, numberAt: at.discY, ground: inks.ground,
  }))
}

/** A group's chips, and its "+N". */
function chipped(out: Shape[], g: Placed, y: number, inks: Inks) {
  g.spots.forEach(({ c, name, x, w }) => {
    const { fill, edge } = tones(c.model)
    out.push(
      { kind: 'rrect', x, y, w, h: CHIP_H, r: 9, fill, outline: edge, ...(c.sign === 'run' ? {} : { dash: DASH }) },
      { kind: 'icon', sign: c.sign, x: x + 9, y: y + 9, size: 11, color: c.sign === 'run' ? edge : INK },
      { kind: 'text', x: x + 26, y: y + 7, text: name, color: INK, face: '7b' },
      { kind: 'text', x: x + w - 9 - textWidth(c.took, '7'), y: y + 7, text: c.took, color: INK, face: '7' },
    )
  })
  if (g.more !== null) out.push({ kind: 'rrect', x: g.more.x, y, w: g.more.w, h: CHIP_H, r: 9, outline: inks.dim, dash: DASH }, { kind: 'text', x: g.more.x + 9, y: y + 7, text: g.more.label, color: inks.fg, face: '7b' })
}

/**
 * The picture of a scene in a room, or null where the room cannot hold the smallest one (the text cards then take over).
 * Each agent at work gets a bubble while bubbles fit, by launch, the selected one always; the others and the finished
 * ones are chips over the bubbles of their group, and what has no room for a chip is counted in a "+N" chip.
 */
export function layout(scene: MapScene, room: Room, inks: Inks): Laid | null {
  const span = across(room.width)
  const shown = shownOf(scene, room.width)
  if (span.avail < BUBBLE_W || (shown.length === 0 && scene.groups.length > 0)) return null
  const slots = slotsOf(shown, span.fill)
  const folded = scene.groups.slice(shown.length).reduce((sum, g) => sum + g.running.length + g.finished.length + g.gone, 0)
  let x = Math.floor((span.W - rowWidth(shown, slots)) / 2)
  const placed = shown.map((group, i) => {
    const one = seated(group, x, slots[i]!, i === shown.length - 1 ? folded : 0, span)
    x += one.w + GROUP_GAP

    return one
  })
  const at = downOf(placed, scene, span, room.maxHeight)
  if (at === undefined) return null

  const out: Shape[] = []
  zones(out, placed, at, inks)
  arrows(out, placed, at, inks)
  if (span.isWide) wideMain(out, scene.main, span.mainX, span.mainW)
  else bubble(out, scene.main, span.mainX, TOP, at.before)
  placed.flatMap(g => g.seats).forEach(s => bubble(out, s.b, s.x, at.bubbleY, at.before))
  placed.forEach(g => chipped(out, g, at.chipY, inks))
  legend(out, inks, at.legendY, span.avail)

  return { width: span.W, height: Math.min(room.maxHeight, Math.ceil(at.total / room.cellHeight) * room.cellHeight), shapes: out, order: placed.flatMap(g => g.seats).map(s => s.b.key) }
}

// ── The picture ──

const PAINT = { rrect, line, arrow, bar, icon, text } as Record<Shape['kind'], (p: Picture, shape: never) => void>

/** The shapes painted, in order, on the theme's ground. */
export function render(laid: Laid, ground: Rgb): Picture {
  const p = picture(laid.width, laid.height, ground)
  laid.shapes.forEach(shape => PAINT[shape.kind](p, shape as never))

  return p
}
