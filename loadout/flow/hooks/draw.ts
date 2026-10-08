// The pane as lines of cells, in the designer's handoff layout: no engine here, so a line's width is
// known before it is drawn. register.tsx turns each line into Text, Button and Input elements.
import type { Agent, Plan, Run, Ticket, View, Way, WayMap } from '../../types'
import { brisk, dur, ENTER_MS, fit, FLASH_MS, inState, isOver, kindOf, LEAVE_MS, LINGER_MS, targetOf, tok, TOOL_MS, TOOL_STEP, toolName, verbOf } from './lib'
import type { AgentView, PhaseView, RunView } from './lib'
import { filled, gradient, mix, STEPS } from './palette'
import type { Palette, StepState, StepStatusName, StepsStyle } from './palette'

/** A run of cells of one style: text, colour, bold, background, struck through. */
export type Seg = { t: string; c?: string; b?: boolean; bg?: string; x?: boolean }
/** What a press does, as data: register.tsx runs it. */
export type Act =
  | { a: 'agent'; key: string } | { a: 'move'; d: 1 | -1 } | { a: 'steer' } | { a: 'stop' } | { a: 'yes' } | { a: 'no' }
  | { a: 'hide' } | { a: 'size'; d: number } | { a: 'fold'; run: string }
  | { a: 'effort'; name: string } | { a: 'way'; id: string }
/** A Button, drawn plain: its label alone, or "k: label" with a hotkey. `pad` is the cells its box takes when wider than it. */
export type Btn = { key: string; label: string; hotkey?: string; dim?: boolean; auto?: boolean; pad?: number; bg?: string; act: Act }
export type Piece = Seg | { btn: Btn } | { inp: { key: string; width: number } }
export type Line = Piece[]

export const SPIN = '◐◓◑◒'
/** The spinner's frame: one step every 450 ms, the handoff's rate. */
export const spinAt = (now: number): string => SPIN[Math.floor(now / 450) % SPIN.length] ?? '◐'

export const isSeg = (p: Piece): p is Seg => 't' in p
// ponytail: a cell is one UTF-16 unit. A label holding wide characters (CJK, emoji) is counted short and its line is cut
// by the terminal instead of here; measure with a width table if such labels become common.
export const widthOf = (b: Btn): number => Math.max(b.pad ?? 0, b.hotkey === undefined ? b.label.length : b.label.length + 3)
export const cells = (line: Line): number => line.reduce((n, p) => n + (isSeg(p) ? p.t.length : 'btn' in p ? widthOf(p.btn) : p.inp.width), 0)

const s = (t: string, c?: string, b?: boolean, bg?: string): Seg => ({ t, ...(c === undefined ? {} : { c }), ...(b === true ? { b } : {}), ...(bg === undefined ? {} : { bg }) })
const gap = (n: number, bg?: string): Seg => s(' '.repeat(Math.max(0, n)), undefined, false, bg)
/** `left`, then `right` pushed to the line's end `width` cells away. */
const spread = (width: number, left: Line, right: Line, bg?: string): Line => [...left, gap(width - cells(left) - cells(right), bg), ...right]

/** `n` cells of `glyph`, the first `filled` coloured cell by cell by `hue` (its position 0..1), the rest in `track`. */
function bar(n: number, filled: number, glyph: string, hue: (x: number) => string, track: string, rest = glyph): Seg[] {
  const out: Seg[] = []
  for (let i = 0; i < n; i++) {
    const c = i < filled ? hue(n === 1 ? 0 : i / (n - 1)) : track
    const last = out[out.length - 1]
    if (last !== undefined && last.c === c) last.t += i < filled ? glyph : rest
    else out.push(s(i < filled ? glyph : rest, c))
  }
  return out
}
/** Cells filled at `prog`: all of them only when done, so a bar at 99% still shows a cell to go. */
const filledOf = (n: number, prog: number): number => (prog >= 1 ? n : Math.min(n - 1, Math.floor(prog * n)))

/** `line` cut to `n` cells: text that crosses the edge ends in an ellipsis, a Button or field that does is left out. */
export function clip(line: Line, n: number): Line {
  if (cells(line) <= n) return line
  const out: Line = []
  let left = Math.max(0, n)
  for (const p of line) {
    const size = cells([p])
    if (size > left) {
      if (isSeg(p) && left > 0) out.push({ ...p, t: left === 1 ? '…' : fit(p.t, left) })
      break
    }
    out.push(p)
    left -= size
  }
  return out
}

export type Fold = { phases: boolean; agents: boolean; tight: boolean; way: number; cap: number }
// How much the body gives up to fit the pane, least first. The wayfinder map folds first (1 done, 2 fog and out
// of scope, 3 the blockers' names), then the finished phases' rows, then the blank rows, then the finished agents
// of a running phase. Running agents' cards never fold; what is still too tall scrolls in the pane.
const LEVELS: readonly Fold[] = [
  { phases: false, agents: false, tight: false, way: 0, cap: Infinity },
  { phases: false, agents: false, tight: false, way: 1, cap: Infinity },
  { phases: false, agents: false, tight: false, way: 2, cap: Infinity },
  { phases: false, agents: false, tight: false, way: 3, cap: Infinity },
  { phases: true, agents: false, tight: false, way: 3, cap: Infinity },
  { phases: true, agents: false, tight: true, way: 3, cap: Infinity },
  { phases: true, agents: true, tight: true, way: 3, cap: Infinity },
]

export type Scene = {
  /** The pane's body: columns and rows. */
  w: number
  rows: number
  /** Seated inline above the prompt: the frame fits the tree, so the footer is not pushed down to the last row. */
  inline?: boolean
  P: Palette
  now: number
  /** The runs drawn: the live ones, then the finished one still on screen (lib's lingering). */
  runs: RunView[]
  view: View
  plan: Plan | null
  way: Way
  map: WayMap | null
  /** How the steps and the wayfinder map are drawn: the theme pack's, the built-in style without one. */
  S?: StepsStyle
  /** The plain subagents: the running ones, and the finished ones not yet gone. */
  solo?: Agent[]
}
/** `steer` is the key of the agent a steer would reach, '' for none. */
export type Drawn = { lines: Line[]; order: string[]; cur: string; target: Agent | undefined; steer: string; stoppable: Run | undefined }

export const runKey = (r: Run): string => r.callId || r.id
export const agentKey = (r: Run, a: Agent): string => `ag:${runKey(r)}:${a.key}`
/** A plain subagent's key in the pane: no run of a workflow is called "solo". */
export const soloKey = (a: Agent): string => `ag:solo:${a.key}`
const STATE_OF = { resolved: 'done', claimed: 'active', frontier: 'pending', blocked: 'blocked' } as const

const TYPE = { research: '◇', grilling: '?', prototype: '±', task: '■', other: '•' } as const
const FOLDS = { done: ['d', 'done'], fog: ['g', 'fog'], out: ['o', 'out of scope'] } as const
const EFFORT_KEYS = 'abceh'

export function compose(sc: Scene): Drawn {
  const { P, view, now } = sc
  const pad = sc.w >= 44 ? 2 : 1
  const W = Math.max(20, sc.w - pad * 2)
  const spin = spinAt(now)
  const S = sc.S ?? STEPS
  const solo = sc.solo ?? []
  // The clock the plain subagents are read at: the pane's, and never before the last thing one of them did.
  const T = Math.max(now, ...solo.flatMap(a => [a.startedAt, a.endedAt, a.flashAt ?? 0, ...a.calls.map(c => c.at)]))
  /** A step state's node: the pack's cycle for the active one, turning with the clock. */
  const nodeOf = (name: StepStatusName): string =>
    (name === 'active' && S.cycle !== null ? S.cycle.glyphs[Math.floor(now / S.cycle.ms) % S.cycle.glyphs.length] : undefined) ?? S.states[name].glyph
  const up = (text: string): string => (S.header.upper ? text.toUpperCase() : text)
  const toolHue = (tool: string): string => {
    const kind = kindOf(tool)
    return kind === 'read' ? P.blue : kind === 'edit' ? P.yellow : kind === 'shell' ? P.violet : kind === 'web' ? P.cyan : P.text2
  }
  const flow = (x: number) => gradient([[0, P.cyan], [1, P.green]], x)
  const card = (x: number) => gradient([[0, P.cyan], [0.7, P.green], [1, P.yellow]], x)

  /** Items side by side, two cells apart, on as many lines as the width asks. */
  const wrap = (items: Line[]): Line[] => {
    const rows: Line[] = []
    for (const item of items) {
      const last = rows[rows.length - 1]
      if (last !== undefined && cells(last) + 2 + cells(item) <= W) last.push(gap(2), ...item)
      else rows.push([...item])
    }
    return rows
  }
  /** A rounded box `width` cells wide, its titles set into the top border; `sub` follows the title where there is room. */
  const box = (width: number, title: Seg, right: Seg | null, body: Line[], hue = P.border, sub?: Seg, corners = STEPS.header.corners): Line[] => {
    const [tl = '╭', tr = '╮', bl = '╰', br = '╯'] = corners
    const inner = width - 4
    const side = right === null ? '' : ` ${right.t} ─`
    const name = fit(title.t, Math.max(1, width - 5 - side.length))
    const room = width - 6 - side.length - name.length
    const more = sub === undefined || room < 4 ? '' : ` ${fit(sub.t, room)}`
    return [
      [s(`${tl}─ `, hue), { ...title, t: name }, ...(sub === undefined || more === '' ? [] : [{ ...sub, t: more }]), s(` ${'─'.repeat(Math.max(0, width - 5 - name.length - more.length - side.length))}`, hue),
        ...(right === null ? [] : [s(' '), right, s(' ─', hue)]), s(tr, hue)],
      ...body.map(row => clip(row, inner)).map(row => [s('│ ', hue), ...row, gap(inner - cells(row)), s(' │', hue)]),
      [s(`${bl}${'─'.repeat(width - 2)}${br}`, hue)],
    ]
  }
  /** The summary's last row: the segmented bar and the bold percent, in `inner` cells. */
  const meter = (inner: number, prog: number, marks?: StepStatusName[]): Line => {
    const pct = `${Math.round(prog * 100)}%`
    // One mark per step, in its state's node and colour, where the pack asks for it and they fit.
    if (S.meter.style === 'pips' && marks !== undefined && marks.length > 0 && marks.length * 2 - 1 <= inner - 6) {
      const pips = marks.flatMap((name, i) => [...(i > 0 ? [s(' ')] : []), s(nodeOf(name), P[S.states[name].color], S.states[name].bold)])
      return spread(inner, pips, [s(pct, P.fg, true)])
    }
    const n = Math.max(1, inner - 6)
    // A run's summary (no marks) keeps the handoff's cells; the steps and the map take the pack's.
    const [fill, empty] = marks === undefined ? ['■', '■'] : [S.meter.fill, S.meter.empty]
    return [...bar(n, filledOf(n, prog), fill, flow, P.track, empty), s(pct.padStart(inner - n), P.fg, true)]
  }
  /** The header of the steps and of the map, in the pack's style: the title, the count at its right, then the body rows. */
  const frame = (title: string, right: string, body: (inner: number) => Line[]): Line[] => {
    const H = S.header
    const name = `${H.prefix}${up(title)}`
    if (H.style === 'boxed') return box(W, s(name, P[H.color]), s(right, P.text3), body(W - 4), P[H.frame], undefined, H.corners)
    if (H.style === 'banner') {
      const ground = P[H.color]
      return [spread(W, [s(` ${fit(name, Math.max(1, W - right.length - 4))}`, P.bg, true, ground)], [s(`${right} `, P.bg, true, ground)], ground), ...body(W)]
    }
    if (H.style === 'bracketed') {
      const text = fit(name, Math.max(1, W - right.length - 8))
      return [[s('[ ', P[H.frame]), s(text, P[H.color], true), s(` ] ${'─'.repeat(Math.max(1, W - text.length - right.length - 6))} `, P[H.frame]), s(right, P.text3)], ...body(W)]
    }
    return [spread(W, [s(fit(name, Math.max(1, W - right.length - 1)), P[H.color], true)], [s(right, P.text3)]), ...body(W)]
  }
  const cell = (text: Seg, width: number): Seg => ({ ...text, t: fit(text.t, width).padEnd(width) })
  const live = solo.filter(a => !isOver(a))

  // ── A run: the summary box, then its phases on the rail ──

  const summary = (rv: RunView): Line[] => {
    const r = rv.run
    const inner = W - 4
    const col = Math.floor(inner / 3)
    const isOver = r.endedAt !== null
    const eta: Seg = rv.isHeld ? s('—', P.red, true)
      : r.outcome === 'completed' ? s('done', P.green, true)
        : isOver ? s(r.outcome || '—', P.fg, true)
          : rv.eta < 1000 && rv.isOpen ? s('—', P.fg, true)
            : s(`${dur(rv.eta)}${rv.isOpen ? '+' : ''}`, P.fg, true)
    // The phase the run is in; once over, the last one it reached. How it ended is the ETA cell's to say.
    const reached = rv.phases.reduce((n, p, i) => (p.status === 'pend' || p.status === 'hold' ? n : i + 1), 0)
    const phases = rv.phases.length === 0 ? '' : `phase ${rv.at >= 0 ? rv.at + 1 : Math.max(1, reached)}/${rv.phases.length}`
    // The plain subagents running beside the run are counted here; their group stands above the box.
    const beside = live.length === 0 || W < 44 ? '' : `+${live.length} ${live.length === 1 ? 'agent' : 'agents'}`
    const right = [phases, beside].filter(x => x !== '').join(' · ')
    // The handoff's title, then the run's own name: two runs can be live at once.
    const named = r.name === '' || r.name === 'workflow' ? undefined : s(r.name, P.text3)
    return box(W, s('workflow', P.cyan), right === '' ? null : s(right, P.text3), [
      [cell(s('ETA', P.text3), col), cell(s('ELAPSED', P.text3), col), cell(s(inner - col * 2 >= 10 ? 'TOKENS OUT' : 'TOK OUT', P.text3), inner - col * 2)],
      [cell(eta, col), cell(s(dur(rv.t - r.startedAt), P.fg), col), cell(s(tok(r.tokOut), P.blue, true), inner - col * 2)],
      [],
      meter(inner, rv.pct),
    ], P.border, named)
  }

  /** The last 5 tool calls, newest first: the running ones, then the ended. */
  const history = (a: Agent, isRunning: boolean, inner: number, t: number): Line[] => {
    const rows = [
      ...[...a.calls].reverse().map(c => ({ tool: c.tool, what: c.what, took: isRunning ? '…' : brisk(t - c.at), failed: false })),
      ...[...a.log].reverse().map(c => ({ tool: c.tool, what: c.what, took: brisk(c.ms), failed: c.failed })),
    ].slice(0, 5)
    if (rows.length === 0) return [[s('no tool call yet', P.text4)]]
    return rows.map(c => {
      const name = fit(toolName(c.tool), 8).padEnd(5)
      const what = fit(targetOf(c.tool, c.what), Math.max(1, inner - name.length - c.took.length - 2))
      return spread(inner, [s(name, c.failed ? P.red : toolHue(c.tool)), s(` ${what}`, P.text2)], [s(c.took, P.text4)])
    })
  }

  // A card's last row, shortened as the card narrows. The tool count is the card's Button: pressing it lists the calls,
  // and the ring stops on it (a Button's label cannot be bold, so the name above is text).
  const stats = (a: Agent, el: number, inner: number, button: (label: string) => Piece): Line => {
    const tools = `${a.tools} ${a.tools === 1 ? 'tool' : 'tools'}`
    const [out1, sep, took] = ([[` ${tok(a.tokOut)} out`, 3, dur(el)], [` ${tok(a.tokOut)}`, 2, dur(el)], [` ${tok(a.tokOut)}`, 2, ''], ['', 1, '']] as const)
      .find(([o, g, e]) => 1 + o.length + g + tools.length + (e === '' ? 0 : 1 + e.length) <= inner) ?? ['', 1, '']
    return spread(inner, [s('↓', P.blue), s(out1, P.text3), gap(sep), button(fit(tools, Math.max(1, inner - 2)))], [s(took, P.text3)])
  }

  // ── The plain subagents: one group in a running phase's language, above the runs or alone ──

  /** Alone in the pane, the group has the summary box a run has: how many run, for how long, their tokens out. */
  const agentsBox = (): Line[] => {
    const inner = W - 4
    const col = Math.floor(inner / 3)
    const since = live.length === 0 ? '—' : dur(T - Math.min(...live.map(a => a.startedAt)))
    return box(W, s('agents', P.cyan), s(`${live.length} running`, P.text3), [
      [cell(s('RUNNING', P.text3), col), cell(s('ELAPSED', P.text3), col), cell(s(inner - col * 2 >= 10 ? 'TOKENS OUT' : 'TOK OUT', P.text3), inner - col * 2)],
      [cell(s(`${live.length} of ${solo.length}`, P.fg, true), col), cell(s(since, P.fg), col), cell(s(tok(solo.reduce((n, a) => n + a.tokOut, 0)), P.blue, true), inner - col * 2)],
    ])
  }

  const agents = (fold: Fold, cur: string, order: string[]): Line[] => {
    if (solo.length === 0) return []
    const isLive = live.length > 0
    const hue = isLive ? P.yellow : P.text2
    const rail = (): Seg => (isLive ? s('┆  ', P.railRun) : s('│  ', P.railDone))
    const time = isLive ? dur(T - Math.min(...live.map(a => a.startedAt))) : ''
    const isOpen = (a: Agent) => view.open.includes(soloKey(a))
    const pick = (a: Agent, label: string, width: number, bg?: string): Piece => {
      const key = soloKey(a)
      order.push(key)
      return { btn: { key, label, pad: width, dim: true, act: { a: 'agent', key }, ...(key === cur && view.mode === '' ? { auto: true } : {}), ...(bg === undefined ? {} : { bg }) } }
    }
    // One name column for the finished rows, as a run's: every bar starts at the same column.
    const room = W - 3 - 11
    const want = Math.min(22, Math.max(9, ...solo.filter(isOver).map(a => a.label.length + 1)))
    const cols = room - want >= 6 ? { name: want, bar: room - want } : { name: room, bar: 0 }

    const card = (a: Agent): Line[] => {
      const inner = W - 7
      // Coming in: the border goes from dashed and dark to its own colour, and the bar's track is laid from the left.
      const k = Math.min(1, Math.max(0, T - a.startedAt) / ENTER_MS)
      // A tool call just ended: the border is lit, green or red, and settles back.
      const lit = a.flashAt === undefined ? 1 : Math.min(1, Math.max(0, T - a.flashAt) / FLASH_MS)
      const base = soloKey(a) === cur ? P.yellow : P.cardBorder
      const edge = lit < 1 ? mix(a.flashBad === true ? P.red : P.green, base, lit) : k < 1 ? mix(P.track, base, k) : base
      const dash = k < 0.5 ? '╌' : '─'
      const call = a.calls[a.calls.length - 1]
      const mark = a.steer === '' ? '' : ' ↳'
      const kind = a.kind === undefined || a.kind === a.label || inner - a.kind.length - mark.length < 14 ? '' : a.kind
      const name = fit(a.label, Math.max(4, inner - mark.length - (kind === '' ? 0 : kind.length + 1)))
      const took = call === undefined ? '' : dur(T - call.at)
      const space = Math.max(4, inner - took.length - (took === '' ? 0 : 2))
      const doing = call !== undefined ? s(fit(`▸ ${verbOf(call.tool)} ${targetOf(call.tool, call.what)}`, space), toolHue(call.tool))
        : a.steer !== '' ? s(fit(`↳ "${a.steer}"`, space), P.blue)
          : s(a.status === 'queued' ? '∴ starting' : '∴ thinking', P.text3)
      // The bar: no progress is known, so it shows activity. While a tool runs a highlight in the tool's colour
      // travels along it, its tail fading; while the agent thinks three dim cells walk, as an indeterminate bar's.
      // The highlight leaves from the left when the call starts (a few cells in, by the call's id, so two cards do not
      // move as one) and goes on TOOL_STEP cells each time the pane is drawn again for it: every step is the same.
      const laid = Math.ceil(inner * k)
      const lead = call === undefined ? 0 : [...call.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 7
      const head = call === undefined ? 0 : (lead + (Math.floor(T / TOOL_MS) - Math.floor(call.at / TOOL_MS)) * TOOL_STEP) % (inner + 6)
      const walk = Math.floor(T / 450) % Math.max(1, inner)
      const hueAt = (i: number): string => {
        if (i >= laid) return P.bg
        if (call === undefined) return Math.abs(i - walk) <= 1 ? mix(P.track, P.text3, 0.5) : P.track
        const behind = head - i
        return behind >= 0 && behind < 6 ? mix(toolHue(call.tool), P.track, behind / 6) : P.track
      }
      const rows: Line[] = [
        spread(inner, [s(name, P.fg, true), s(mark, P.blue)], [s(kind, P.text3)]),
        bar(inner, inner, '■', x => hueAt(Math.round(x * (inner - 1))), P.track),
        spread(inner, [doing], [s(took, P.text3)]),
        stats(a, T - a.startedAt, inner, label => pick(a, label, 0)),
        ...(isOpen(a) ? [[s('┄'.repeat(inner), P.border)], ...history(a, true, inner, T)] : []),
      ]
      return [
        [rail(), s(`╭${dash.repeat(inner + 2)}╮`, edge)],
        ...rows.map(row => [rail(), s('│ ', edge), ...row, gap(inner - cells(row)), s(' │', edge)]),
        [rail(), s(`╰${dash.repeat(inner + 2)}╯`, edge)],
      ]
    }

    const ended = (a: Agent): Line[] => {
      const bg = soloKey(a) === cur ? P.select : undefined
      const isBad = a.status === 'failed'
      // Just ended: the bar and the mark are bright for a moment. About to leave: the row fades and its bar empties.
      const isFresh = T - a.endedAt < FLASH_MS
      const gone = Math.min(1, Math.max(0, T - (a.endedAt + LINGER_MS - LEAVE_MS)) / LEAVE_MS)
      const dim = (c: string): string => (gone > 0 ? mix(c, bg ?? P.bg, gone) : c)
      const fill = isBad ? () => P.red : isFresh ? flow : (x: number) => mix(P.track, flow(x), 0.55)
      const row: Line = [
        rail(),
        pick(a, fit(a.label, Math.min(22, cols.name - 1)), cols.name, bg),
        ...(cols.bar > 0 ? bar(cols.bar, Math.round(cols.bar * (1 - gone)), '━', x => dim(fill(x)), dim(P.track)).map(seg => ({ ...seg, ...(bg === undefined ? {} : { bg }) })) : []),
        s('  ', undefined, false, bg),
        // Done, failed (an error or a refusal), stopped (interrupted).
        s(isBad ? (a.stopped === true ? '■' : '✗') : '✓', dim(isBad ? P.red : P.green), isFresh, bg),
        s(dur(a.endedAt - a.startedAt).padStart(8), dim(P.text3), false, bg),
      ]
      return isOpen(a) ? [row, ...history(a, false, W - 5, T).map(line => [rail(), s('│ ', P.border), ...line])] : [row]
    }

    const over = solo.filter(isOver)
    const failed = over.filter(a => a.status === 'failed').length
    return [
      spread(W, [s(`${isLive ? spin : '●'}  `, hue, isLive), s('agents', hue, isLive), s(` ×${solo.length}`, P.text4)], [s(time, P.fg)]),
      ...(fold.agents && over.length > 0 ? [[rail(), ...(over.length > failed ? [s(`✓ ${over.length - failed} finished`, P.green)] : []), ...(failed > 0 ? [s(`${over.length > failed ? '  ' : ''}✗ ${failed} failed`, P.red)] : [])]] : []),
      ...solo.flatMap(a => (!isOver(a) ? card(a) : fold.agents ? [] : ended(a))),
    ]
  }

  const phase = (rv: RunView, p: PhaseView, isLast: boolean, fold: Fold, cols: { name: number; bar: number }, cur: string, order: string[]): Line[] => {
    const isFuture = p.status === 'pend' || p.status === 'hold'
    const hue = p.status === 'done' ? P.text2 : p.status === 'run' ? P.yellow : p.status === 'stop' ? P.red : P.text4
    const isBold = p.status === 'run' || p.status === 'stop'
    const node = p.status === 'done' ? '●' : p.status === 'run' ? spin : p.status === 'stop' ? '■' : '○'
    const rail = (): Seg => (isLast ? s('   ') : s(p.status === 'done' ? '│  ' : '┆  ', p.status === 'done' ? P.railDone : p.status === 'run' ? P.railRun : P.border))
    const count = isFuture || p.agents.length === 0 ? '' : ` ×${p.agents.length}`
    const time = s(p.word, isFuture ? P.text4 : p.status === 'run' ? P.fg : P.text3)
    const head = spread(W, [s(`${node}  `, hue, isBold), s(fit(p.title, Math.max(4, W - 4 - count.length - time.t.length)), hue, isBold), s(count, P.text4)], [time])
    const out: Line[] = [head]
    if (isFuture || (p.status === 'done' && fold.phases)) return isLast || fold.tight ? out : [...out, [rail()]]

    const isSel = (v: AgentView) => agentKey(rv.run, v.a) === cur
    const isOpen = (v: AgentView) => view.open.includes(agentKey(rv.run, v.a))
    const pick = (v: AgentView, label: string, width: number, dim: boolean, bg?: string): Piece => {
      const key = agentKey(rv.run, v.a)
      order.push(key)
      return { btn: { key, label, pad: width, dim, act: { a: 'agent', key }, ...(isSel(v) && view.mode === '' ? { auto: true } : {}), ...(bg === undefined ? {} : { bg }) } }
    }

    const compact = (v: AgentView): Line[] => {
      const bg = isSel(v) ? P.select : undefined
      const fill = v.state === 'stop' ? () => P.red : (x: number) => mix(P.track, flow(x), 0.55)
      const row: Line = [
        rail(),
        pick(v, fit(v.a.label, Math.min(22, cols.name - 1)), cols.name, true, bg),
        ...(cols.bar > 0 ? bar(cols.bar, filledOf(cols.bar, v.prog ?? 0), '━', fill, P.track).map(seg => ({ ...seg, ...(bg === undefined ? {} : { bg }) })) : []),
        s('  ', undefined, false, bg),
        v.state === 'done' ? s('✓', P.green, false, bg) : v.state === 'stop' ? s('■', P.red, false, bg) : s('·', P.text4, false, bg),
        s(tok(v.a.tokOut).padStart(7), P.text3, false, bg),
      ]
      return isOpen(v) ? [row, ...history(v.a, v.state === 'run', W - 5, rv.t).map(line => [rail(), s('│ ', P.border), ...line])] : [row]
    }

    const running = (v: AgentView): Line[] => {
      const edge = isSel(v) ? P.yellow : P.cardBorder
      const inner = W - 7
      const a = v.a
      const pct = v.prog === null ? '' : `${Math.round(v.prog * 100)}%`
      const mark = a.steer === '' ? '' : ' ↳'
      const name = fit(a.label, Math.max(4, inner - pct.length - mark.length - 1))
      const call = a.calls[a.calls.length - 1]
      const right = v.est === null ? s('eta —', P.text2) : v.over > 0 ? s(`+${dur(v.over)} over`, P.orange) : s(`eta ${dur(v.rem ?? 0)}`, P.text2)
      const room = Math.max(4, inner - right.t.length - 2)
      const doing = call !== undefined ? s(fit(`▸ ${verbOf(call.tool)} ${targetOf(call.tool, call.what)}`, room), toolHue(call.tool))
        : a.steer !== '' ? s(fit(`↳ "${a.steer}"`, room), P.blue)
          : s('∴ thinking', P.text3)
      // The indeterminate bar: with no history there is no progress to show, so three cells walk the track.
      const at = Math.floor(now / 450) % Math.max(1, inner)
      const cellsOf = v.prog === null
        ? bar(inner, inner, '■', x => (Math.abs(Math.round(x * (inner - 1)) - at) <= 1 ? card(x) : P.track), P.track)
        : bar(inner, filledOf(inner, v.prog), '■', card, P.track)
      const rows: Line[] = [
        spread(inner, [s(name, P.fg, true), s(mark, P.blue)], [s(pct, P.yellow, true)]),
        cellsOf,
        spread(inner, [doing], [right]),
        stats(a, v.el, inner, label => pick(v, label, 0, true)),
        ...(isOpen(v) ? [[s('┄'.repeat(inner), P.border)], ...history(a, true, inner, rv.t)] : []),
      ]
      return [
        [rail(), s(`╭${'─'.repeat(inner + 2)}╮`, edge)],
        ...rows.map(row => [rail(), s('│ ', edge), ...row, gap(inner - cells(row)), s(' │', edge)]),
        [rail(), s(`╰${'─'.repeat(inner + 2)}╯`, edge)],
      ]
    }

    const over = p.agents.filter(v => v.state === 'done' || v.state === 'stop')
    const shown = fold.agents ? p.agents.filter(v => !over.includes(v)) : p.agents
    if (fold.agents && over.length > 0) {
      const failed = over.filter(v => v.state === 'stop').length
      out.push([rail(), s(`✓ ${over.length - failed} finished`, P.green), ...(failed > 0 ? [s(`  ■ ${failed} failed`, P.red)] : [])])
    }
    for (const v of shown) out.push(...(v.state === 'run' ? running(v) : compact(v)))
    return isLast || fold.tight ? out : [...out, [rail()]]
  }

  const run = (rv: RunView, fold: Fold, cur: string, order: string[]): Line[] => {
    const r = rv.run
    const k = runKey(r)
    const level = { ...fold, agents: fold.agents || view.folded.includes(k) }
    // One name column for the whole run, so every bar starts at the same column; the bar goes first when it is narrow.
    const names = rv.phases.flatMap(p => p.agents.filter(v => v.state !== 'run').map(v => v.a.label.length))
    const room = W - 3 - 10
    const want = Math.min(22, Math.max(9, ...names.map(n => n + 1)))
    const cols = room - want >= 6 ? { name: want, bar: room - want } : { name: room, bar: 0 }
    const gone = r.spawned - r.agents.length
    return [
      ...summary(rv),
      ...(fold.tight ? [] : [[]]),
      ...rv.phases.flatMap((p, i) => phase(rv, p, i === rv.phases.length - 1, level, cols, cur, order)),
      ...(rv.phases.length === 0 ? [[s('no agent started yet', P.text4)]] : []),
      ...(gone > 0 ? [[s(`+${gone} earlier agents not listed`, P.text4)]] : []),
    ]
  }

  const stepper = (fold: Fold): Line[] => {
    const plan = sc.plan
    // The empty state shows only in an empty pane: under a run or the agents it would be noise.
    if (plan === null) return sc.runs.length > 0 || solo.length > 0 ? [] : [[s('No plan yet.', P.text3), s(fit(' Claude posts one for a 3+ step task.', W - 12), P.text4)]]
    const total = plan.steps.length
    const done = plan.steps.filter(x => x.status === 'done').length
    const active = plan.steps.findIndex(x => x.status === 'active')
    // Where we are and what is left, in the pack's words: the part before the first " · " is the strong one.
    const words = filled(active < 0 ? S.captions.idle : S.captions.progress, { i: active + 1, n: total, done, left: total - done })
    const cut = active < 0 ? 0 : words.indexOf(' · ') < 0 ? words.length : words.indexOf(' · ')
    return [
      ...frame(plan.title || S.captions.title, `${done}/${total}`, inner => [
        clip([s(words.slice(0, cut), P.fg, true), s(words.slice(cut), P.text3)].filter(seg => seg.t !== ''), inner),
        meter(inner, total === 0 ? 0 : done / total, plan.steps.map(x => x.status)),
      ]),
      ...(fold.tight ? [] : [[]]),
      ...plan.steps.flatMap((x, i): Line[] => {
        const st = S.states[x.status]
        const bg = st.ground === null ? undefined : P[st.ground]
        // A label that opens with "optional" is tagged, where the pack has a word for it.
        const lead = S.captions.optional === '' ? null : x.label.match(/^\s*[[(]?optional[\])]?\s*[:–-]?\s+/i)
        const tag = lead === null ? '' : ` [${S.captions.optional}]`
        const tail = x.status === 'active' ? s(`${S.captions.active} ${i + 1}/${total}`.trim(), P.fg, false, bg) : x.status === 'blocked' ? s(S.captions.blocked, P.text3, false, bg) : s('')
        // Path: the node, then the label, a rail row under it. List: a filled left edge, the node, the label, no row between.
        const head: Seg[] = S.layout === 'list'
          ? [s(st.edge, P[st.edgeColor], false, bg), s(` ${nodeOf(x.status)} `, P[st.color], st.bold, bg)]
          : [s(`${nodeOf(x.status)}  `, P[st.color], st.bold, bg)]
        const label = fit(lead === null ? x.label : x.label.slice(lead[0].length), Math.max(4, W - cells(head) - 1 - tail.t.length - tag.length))
        const row = spread(W, [...head, { ...s(label, P[st.labelColor], st.bold, bg), ...(st.strike ? { x: true } : {}) }, s(tag, P.text3, false, bg)].filter(seg => seg.t !== ''), [tail], bg)
        return i === total - 1 || fold.tight || S.layout === 'list' ? [row] : [row, [s(st.rail, P[st.railColor])]]
      }),
    ]
  }

  // ── The wayfinder map: where we are, what comes next, what is blocked and by what, and what is left ──

  const wayfinder = (fold: Fold): Line[] => {
    const map = sc.map
    if (!sc.way.active) return []
    if (map === null) return [[s('wayfinder is on: no map found', P.text3)], [s('looked for .scratch/*/map.md', P.text4)]]
    const done = inState(map, 'resolved')
    const here = inState(map, 'claimed')
    const next = inState(map, 'frontier')
    const blocked = inState(map, 'blocked')
    const typeHue = { research: P.blue, grilling: P.violet, prototype: P.green, task: P.orange, other: P.text2 } as const
    const ticket = (t: Ticket, rail: Seg, hue: string, isBold: boolean, tail: Seg): Line => {
      const id = t.iid === null ? '' : ` #${t.iid}`
      const title = fit(t.title, Math.max(4, W - 5 - id.length - tail.t.length - (tail.t === '' ? 0 : 1)))
      return spread(W, [rail, s(`${TYPE[t.type]} `, typeHue[t.type]), s(title, hue, isBold), s(id, P.text4)], [tail])
    }
    const [D, A, N, B] = [S.states.done, S.states.active, S.states.pending, S.states.blocked]
    // What a group's tickets stand behind: the state's rail, or in a list its filled left edge.
    const railOf = (st: StepState): Seg => (S.layout === 'list' ? s(`${st.edge}  `, P[st.edgeColor]) : s(`${st.rail}  `, P[st.railColor]))
    // Between two groups: the rail going on in a path, a blank row in a list (an edge with nothing beside it is noise).
    const between = (rail: Seg): Line[] => (fold.tight ? [] : [S.layout === 'list' ? [] : [rail]])
    const group = (node: string, name: string, hue: string, isBold: boolean, note: string, n: number, rail: Seg, rows: (rail: Seg) => Line[]): Line[] => [
      spread(W, [s(`${node}  `, hue, isBold), s(up(name), hue, isBold), s(n > 0 ? ` ×${n}` : '', P.text4)], [s(up(note), P.text4)]),
      ...rows(rail),
      ...between(rail),
    ]
    const efforts = map.efforts.length < 2 ? [] : wrap(map.efforts.map((name, i): Line => {
      const key = EFFORT_KEYS[i]
      return [{ btn: { key: `way:effort:${name}`, label: `${name === map.effort ? '●' : '○'} ${fit(name, Math.max(6, W - 6))}`, dim: name !== map.effort, act: { a: 'effort', name }, ...(key === undefined ? {} : { hotkey: key }) } }]
    }))
    // A section that opens: its mark where a phase has its node, its Button from column 3, its rows behind the rail.
    const section = (id: keyof typeof FOLDS, n: number, items: (rail: Seg) => Line[], isFolded: boolean, isLast = false): Line[] => {
      const [hotkey, name] = FOLDS[id]
      const isOpen = sc.way.open.includes(id)
      const rail = isLast ? s('   ') : railOf(N)
      const label = fit(`${name} (${n})${isOpen && isFolded ? ' folded' : ''}`, Math.max(4, W - 6))
      return [
        [s(`${isOpen && !isFolded ? '▾' : '▸'}  `, P.text4), { btn: { key: `way:${id}`, label, hotkey, dim: !isOpen, act: { a: 'way', id } } }],
        ...(isOpen && !isFolded ? items(rail) : []),
        ...(isLast ? [] : between(rail)),
      ]
    }
    const shown = next.slice(0, Math.max(1, fold.cap))
    const total = map.tickets.length
    const hasBlocked = blocked.length > 0
    return [
      ...efforts,
      ...frame(map.title, `${done.length}/${total}`, inner => [
        [s(fit(map.destination || 'no destination written yet', inner), P.text2)],
        [s(up(`${done.length} / ${total} resolved`), P.fg, true), ...(map.carte === null ? [] : [s(` · GitLab #${map.carte}`, P.text3)])],
        [s(up(`here ${here.length}`), P[A.color]), s(up(` · next ${next.length}`), P.text3), s(up(` · blocked ${blocked.length}`), hasBlocked ? P[B.color] : P.text3)],
        meter(inner, total === 0 ? 0 : done.length / total, map.tickets.map(t => STATE_OF[t.state])),
      ]),
      ...(fold.tight ? [] : [[]]),
      ...group(here.length > 0 ? nodeOf('active') : N.glyph, 'here', here.length > 0 ? P[A.color] : P[N.color], here.length > 0 && A.bold, here.length === 0 ? 'no ticket claimed' : `${here.length} claimed`, here.length, railOf(A),
        rail => here.map(t => ticket(t, rail, P.fg, true, s('')))),
      ...group(N.glyph, 'next', next.length > 0 ? P.fg : P[N.color], false, next.length === 0 ? 'nothing unblocked' : `${next.length} unblocked`, next.length, railOf(N),
        rail => [
          ...shown.map((t, i) => ticket(t, rail, i === 0 ? P.fg : P.text2, false, i === 0 ? s(up('next'), P[A.color]) : s(''))),
          ...(shown.length < next.length ? [[rail, s(`  +${next.length - shown.length} more`, P.text4)]] : []),
        ]),
      ...(hasBlocked ? group(B.glyph, 'blocked', P[B.color], B.bold, `${blocked.length} waiting`, blocked.length, railOf(B), rail => blocked.flatMap(t => [
        ticket(t, rail, P.text3, false, s('')),
        ...(fold.way >= 3 ? [] : [[rail, s('  ╰ by ', P[B.color]), s(fit(t.blockers.join(', '), Math.max(4, W - 10)), P.text4)]]),
      ])) : []),
      ...(map.unreadable > 0 ? [[s('!  ', P.red, true), s(`${map.unreadable} ticket files unreadable`, P.red)], ...between(railOf(N))] : []),
      ...section('done', done.length, rail => done.map(t => [rail, s(`${D.glyph} `, P[D.color]), { ...s(fit(t.title, Math.max(4, W - 5 - (t.iid === null ? 0 : String(t.iid).length + 2))), P[D.labelColor]), ...(D.strike ? { x: true } : {}) }, s(t.iid === null ? '' : ` #${t.iid}`, P.text4)]), fold.way >= 1),
      ...section('fog', map.fog.length, rail => map.fog.map(f => [rail, s('· ', P.text4), s(fit(f, Math.max(4, W - 5)), P.text2)]), fold.way >= 2),
      ...section('out', map.out.length, rail => map.out.map(f => [rail, s('· ', P.text4), s(fit(f, Math.max(4, W - 5)), P.text4)]), fold.way >= 2, true),
    ]
  }

  // ── The footer: key hints, the steer field, or the stop question ──

  const all = [...solo.map(a => ({ key: soloKey(a), a })), ...sc.runs.flatMap(rv => rv.run.agents.map(a => ({ key: agentKey(rv.run, a), a })))]
  const steerable = (cur: string) => {
    const reached = all.filter(x => x.a.status === 'running' && x.a.id !== '')
    return (reached.find(x => x.key === cur) ?? reached[0])
  }
  const stoppableOf = (cur: string): Run | undefined => {
    const open = sc.runs.map(rv => rv.run).filter(r => r.endedAt === null && r.taskId !== '' && (r.stop ?? 0) === 0)
    return open.find(r => r.agents.some(a => agentKey(r, a) === cur)) ?? open[0]
  }
  const footer = (cur: string, order: string[]): Line[] => {
    const inset = (line: Line): Line => [gap(pad), ...clip(line, W)]
    const plain: Line = [s('─'.repeat(sc.w), P.track)]
    /** The divider with the lesser keys set into it, as a box's titles are; null when they do not fit. */
    const ruled = (keys: Line[]): Line | null => {
      const row = keys.flatMap((k, i) => (i === 0 ? k : [gap(2), ...k]))
      const left = sc.w - cells(row) - 4
      return keys.length === 0 ? plain : left < 1 ? null : [s('─'.repeat(left), P.track), gap(1), ...row, gap(1), s('──', P.track)]
    }
    if (view.mode === 'steer') {
      const hit = all.find(x => x.key === view.target)
      if (hit !== undefined && hit.a.status === 'running') {
        // Esc gives the keys back to the pane without an event: c then takes the field down.
        const cancel: Line = [s('esc, then ', P.text4), { btn: { key: 'steer:cancel', label: 'cancel', hotkey: 'c', dim: true, act: { a: 'no' } } }]
        const prompt = `steer ${fit(hit.a.label, Math.max(4, W - 26))} › `
        const top = ruled([cancel])
        return [top ?? plain, inset([s(prompt, P.blue), { inp: { key: 'steer', width: W - prompt.length } }]), ...(top === null ? [inset(cancel)] : [])]
      }
    }
    if (view.mode === 'confirm') {
      const r = sc.runs.map(rv => rv.run).find(x => runKey(x) === view.target && x.endedAt === null)
      if (r !== undefined) {
        // One row, as the handoff asks; what it stops is the run (the engine stops a task, not one agent), so it names the run.
        const note = `  ${r.agents.filter(a => a.status === 'running').length} running`
        const room = W - 6 - 15
        const hasNote = room - note.length >= 8
        const name = fit(r.name, Math.max(3, room - (hasNote ? note.length : 0)))
        return [plain, inset([
          s(`stop ${name}?`, P.red, true), ...(hasNote ? [s(note, P.text3)] : []), gap(2),
          { btn: { key: 'stop:yes', label: 'yes', hotkey: 'y', act: { a: 'yes' } } }, gap(2),
          { btn: { key: 'stop:no', label: 'no', hotkey: 'n', auto: true, act: { a: 'no' } } },
        ])]
      }
    }
    const hint = (hotkey: string, label: string, act: Act): Line => [{ btn: { key: `key:${hotkey}`, label, hotkey, dim: true, act } }]
    // A key that is not a Button's hotkey: the arrows walk the pane's ring, Enter presses what the ring is on.
    const cap = (key: string, label: string): Line => [s(key, P.fg, true), s(` ${label}`, P.text3)]
    const canMove = order.length > 0
    // The handoff's row.
    const main: Line[] = [
      ...(canMove ? [cap('↑↓', 'select'), cap('⏎', 'actions')] : []),
      ...(steerable(cur) === undefined ? [] : [hint('s', 'steer', { a: 'steer' })]),
      ...(stoppableOf(cur) === undefined ? [] : [hint('x', 'stop', { a: 'stop' })]),
      hint('z', 'hide', { a: 'hide' }),
    ]
    // The keys the handoff's row has no room for. A hotkey exists only as a drawn Button, so they sit in the divider.
    const foldable = sc.runs.map(rv => rv.run).find(r => r.agents.some(a => a.status === 'done' || a.status === 'failed'))
    const jk: Line[] = canMove ? [hint('k', '↑', { a: 'move', d: -1 }), hint('j', '↓', { a: 'move', d: 1 })] : []
    const rest: Line[] = [
      ...(foldable === undefined ? [] : [[{ btn: { key: `fold:${runKey(foldable)}`, label: view.folded.includes(runKey(foldable)) ? 'unfold' : 'fold', hotkey: 'f', dim: true, act: { a: 'fold', run: runKey(foldable) } } }] as Line]),
      // The inline block ignores a width asked for: only the dock has these two.
      ...(sc.inline === true ? [] : [hint('n', 'narrow', { a: 'size', d: -5 }), hint('w', 'wide', { a: 'size', d: 5 })]),
    ]
    // Narrow, j and k go first (the arrows do the same), then the rest drops under the row.
    const top = ruled([...jk, ...rest]) ?? ruled(rest)
    return [top ?? plain, ...wrap(main).map(inset), ...(top === null ? wrap(rest).map(inset) : [])]
  }

  const build = (fold: Fold): Drawn => {
    const order: string[] = []
    // The selection is settled before the rows are built, so a first pass lists the agents drawn.
    const listed: string[] = []
    agents(fold, '', listed)
    sc.runs.forEach(rv => run(rv, fold, '', listed))
    const firstLive = all.filter(x => x.a.status === 'running').map(x => x.key).find(k => listed.includes(k))
    // The person's own selection, else the first running agent; with none running, nothing is selected.
    const cur = listed.includes(view.sel) ? view.sel : firstLive ?? ''
    const map = wayfinder(fold)
    // The empty state shows only in an empty pane: a plan or the map takes the run's place.
    const isEmpty = sc.runs.length === 0 && sc.plan === null && map.length === 0 && solo.length === 0
    const group = agents(fold, cur, order)
    const body: Line[] = [
      ...(isEmpty ? [[s(fit('No workflow is running.', W), P.text3)], []] : []),
      // The plain subagents: above the runs, or alone under their own summary box.
      ...(group.length > 0 && sc.runs.length === 0 ? [...agentsBox(), ...(fold.tight ? [] : [[]])] : []),
      ...group,
      ...(group.length > 0 && sc.runs.length > 0 ? [[]] : []),
      ...sc.runs.flatMap((rv, i) => [...(i > 0 ? [[]] : []), ...run(rv, fold, cur, order)]),
    ]
    // The model's own plan stays below the map; without one the map stands alone.
    const steps = sc.way.active && sc.plan === null ? [] : stepper(fold)
    const below = [...map, ...(map.length > 0 && steps.length > 0 ? [[]] : []), ...steps]
    const foot = footer(cur, order)
    const lines = [...body, ...(body.length > 0 && !isEmpty && below.length > 0 ? [[]] : []), ...below].map((line): Line => (line.length === 0 ? line : [gap(pad), ...clip(line, W)]))
    return { lines: [...lines, ...Array.from({ length: sc.inline === true ? 0 : Math.max(0, sc.rows - lines.length - foot.length) }, (): Line => []), ...foot], order, cur, target: steerable(cur)?.a, steer: steerable(cur)?.key ?? '', stoppable: stoppableOf(cur) }
  }

  const tries = LEVELS.map(build)
  const last = tries[tries.length - 1]
  const over = (last?.lines.length ?? 0) - sc.rows
  const queue = sc.way.active && sc.map !== null ? inState(sc.map, 'frontier').length : 0
  // Still too tall with everything folded: the tail of NEXT goes, one row per ticket and one for "+N more".
  const cut = over > 0 && queue > 1 && last !== undefined ? build({ phases: true, agents: true, tight: true, way: 3, cap: Math.max(1, queue - over - 1) }) : last
  return tries.find(d => d.lines.length <= sc.rows) ?? cut ?? { lines: [], order: [], cur: '', target: undefined, steer: '', stoppable: undefined }
}

/** The folded pane: one tab above the prompt, as the handoff's "Folded state" draws it, and the Button that restores. */
export function tab(P: Palette, rv: RunView | undefined, now: number, solo: readonly Agent[] = []): Line[] {
  const isLive = rv !== undefined && rv.run.endedAt === null
  // The plain subagents running: beside a live run they are counted after it; with none they are what the tab shows.
  const live = solo.filter(a => !isOver(a))
  const agents = `${live.length} ${live.length === 1 ? 'agent' : 'agents'}`
  const alone = !isLive && live.length > 0
  const body: Line = [
    s(isLive || alone ? spinAt(now) : rv === undefined ? '○' : rv.run.outcome === 'completed' ? '●' : '■', isLive || alone ? P.yellow : rv === undefined ? P.text4 : rv.run.outcome === 'completed' ? P.green : P.red),
    s(' flow map', P.cyan),
    ...(alone ? [s(`  ${agents}`, P.fg, true), s(`  ${dur(Math.max(now, ...live.map(a => a.startedAt)) - Math.min(...live.map(a => a.startedAt)))}`, P.text3)]
      : rv === undefined ? [s('  idle', P.text3)] : [
        s(`  ${Math.round(rv.pct * 100)}%`, P.fg, true),
        ...(isLive ? [s('  eta ', P.text3), rv.isHeld || (rv.eta < 1000 && rv.isOpen) ? s('—', rv.isHeld ? P.red : P.fg) : s(`${dur(rv.eta)}${rv.isOpen ? '+' : ''}`, P.fg)] : [s(`  ${rv.run.outcome}`, P.text3)]),
        ...(isLive && live.length > 0 ? [s(`  +${agents}`, P.text3)] : []),
      ]),
    s('  '),
    { btn: { key: 'show', label: 'show', hotkey: 'z', dim: true, act: { a: 'hide' } } },
  ]
  const inner = cells(body)
  return [
    [s(`╭${'─'.repeat(inner + 2)}╮`, P.border)],
    [s('│ ', P.border), ...body, s(' │', P.border)],
    [s(`╰${'─'.repeat(inner + 2)}╯`, P.border)],
  ]
}
