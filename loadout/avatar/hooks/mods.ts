// The five mods of docs/mods/grammar.md, as pure functions: the status line (live state and the error light),
// and the cards drawn in the Avatar pane (before /clear, back after a while away, a recall card while Claude
// works), or above the prompt where the Avatar pane is not shown. Words and glyphs are fixed; a theme only paints them, with its Flow palette and its steps header and meter.
import type { Palette, StepsStyle } from '../../flow/hooks/palette'
import type { ModsState, RecallCard, RecallDeck } from '../../types'

export const AWAY_MS = 15 * 60_000 // away this long, the card that says where things stand
export const RECALL_AFTER_MS = 20_000 // a turn this long, and the prompt empty, the recall card
export const PROBLEM_AT = 3 // failures in a row that make a PROBLEM
export const BLINK_MS = 3000 // the alarm glyph alternates this long, every 500 ms, then holds
export const CARD_MAX = 96
const DAY = 86_400_000

export const MODS: ModsState = { idleAt: 0, turnAt: 0, endAt: 0, said: '', streak: { n: 0, kind: '', what: '', at: 0 }, files: [], prompt: '', backSeen: 0, recallShown: 0, flip: null }

/**
 * One run of text in one colour: a line of the status or of a card is a list of them. A run with a `key` is a
 * control: drawn `f: forgot` (a plain Button of that hotkey), pressing it does what the key names.
 */
export type Seg = { t: string; fg?: string; bg?: string; bold?: boolean; key?: string; dim?: boolean }
export type Line = Seg[]

/**
 * The cells a character takes in the terminal: 2 for East Asian wide ones and emoji pictographs, 0 for joiners,
 * variation selectors and combining marks, else 1. (★ ♥ ▶ ● are narrow, as kitty draws them.)
 */
const cellOf = (ch: string): number => {
  const c = ch.codePointAt(0) ?? 0
  if (c === 0x200d || (c >= 0xfe00 && c <= 0xfe0f) || (c >= 0x300 && c <= 0x36f)) return 0
  const wide = (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff)
    || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6)
    || (c >= 0x1f300 && c <= 0x1f64f) || (c >= 0x1f900 && c <= 0x1f9ff) || (c >= 0x1fa70 && c <= 0x1faff) || (c >= 0x20000 && c <= 0x3fffd)

  return wide ? 2 : 1
}
/** The cells a text takes in the terminal. */
export const cells = (text: string): number => [...text].reduce((n, ch) => n + cellOf(ch), 0)
const drawn = (s: Seg): string => (s.key === undefined ? s.t : `${s.key}: ${s.t}`)
export const width = (line: Line): number => line.reduce((n, s) => n + cells(drawn(s)), 0)

/** `4m`, `1h12`: the minute is the finest a duration is told, so nothing in a calm line moves faster. */
export function minutes(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))

  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

/** The kind of a failed call, in 7 characters at most: what the light names. */
export function kindOf(tool: string, text: string): string {
  if (/denied|not allowed|permission/i.test(text)) return 'DENIED'
  if (/timed? ?out|timeout/i.test(text)) return 'TIMEOUT'
  if (/chrome|browser|tabs?_/i.test(tool)) return 'CHROME'
  if (/sql|supabase|postgres/i.test(tool + text)) return 'SQL'
  if (/fetch|ENOTFOUND|ECONN|socket|network/i.test(tool + text)) return 'NET'
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'EDIT'
  if (tool === 'Bash') return 'BASH'

  return tool.replace(/^mcp__.*__/, '').toUpperCase().slice(0, 7)
}

/** A call ended: a failure lengthens the run, the first call that goes through ends it. */
export function streakAfter(was: ModsState['streak'], failed: boolean, tool: string, text: string, what: string, at: number): ModsState['streak'] {
  if (!failed) return { n: 0, kind: '', what: '', at: 0 }

  return { n: was.n + 1, kind: kindOf(tool, text), what: `${tool.replace(/^mcp__.*__/, '')} ${what}`.trim(), at }
}

export type Head = 'PROBLEM' | 'YOUR TURN' | 'RUNNING' | 'IDLE'

/** The status line's head: PROBLEM over YOUR TURN over RUNNING over IDLE. */
export function headOf(s: ModsState, working: boolean, agents: number): Head {
  if (s.streak.n >= PROBLEM_AT) return 'PROBLEM'
  if (working || agents > 0) return 'RUNNING'
  if (s.endAt > s.idleAt) return 'YOUR TURN'

  return 'IDLE'
}

export type Facts = { working: boolean; agents: number; tool?: string; now: number }

/**
 * The status line, `columns` wide at most: head, then facts that give way from the end, then the
 * error light (△ calm, kept whatever the room). The head's glyph and word never give way.
 */
export function statusLine(s: ModsState, f: Facts, P: Palette, columns: number): Line {
  const head = headOf(s, f.working, f.agents)
  const isBlinkOff = head === 'PROBLEM' && f.now - s.streak.at < BLINK_MS && Math.floor((f.now - s.streak.at) / 500) % 2 === 1
  const lead: Line =
    head === 'PROBLEM' ? [{ t: ` ${isBlinkOff ? ' ' : '▲'} PROBLEM `, fg: P.bg, bg: P.red, bold: true }]
    : head === 'YOUR TURN' ? [{ t: ' ● YOUR TURN ', fg: P.bg, bg: P.tabActive, bold: true }]
    : head === 'RUNNING' ? [{ t: '▶', fg: P.yellow }, { t: ' RUNNING', fg: P.fg, bold: true }]
    : [{ t: '○ IDLE', fg: P.text3 }]
  const facts: string[] =
    head === 'PROBLEM' ? [`${s.streak.n}× ${s.streak.kind}`, s.streak.what, 'esc steer']
    : head === 'RUNNING' ? [
        ...(f.working && f.now - s.turnAt >= 60_000 ? [minutes(f.now - s.turnAt)] : []),
        ...(f.tool === undefined ? [] : [f.tool]),
        ...(f.agents > 0 ? [`${f.agents} agent${f.agents === 1 ? '' : 's'}`] : []),
        ...(f.working ? [] : ['Claude resumes alone']),
      ]
    : head === 'YOUR TURN' ? [`answered ${minutes(f.now - s.endAt)} ago`]
    : []
  const warn: Line = head !== 'PROBLEM' && s.streak.n > 0 ? [{ t: '  △', fg: P.orange }, { t: ` ${s.streak.n}× ${s.streak.kind}`, fg: P.fg }] : []
  const room = columns - width(lead) - width(warn)
  // The facts give way from the end: the last one first, then a shorter cut of what is left.
  let told = ''
  for (let n = facts.filter(Boolean).length; n > 0 && told === ''; n--) {
    const cut = `  ${facts.filter(Boolean).slice(0, n).join(' · ')}`
    if (cells(cut) <= room) told = cut
  }
  if (told === '' && facts.length > 0 && room > 4) told = clip(`  ${facts[0]}`, room)

  return [...lead, ...(told === '' ? [] : [{ t: told, fg: P.text3 }]), ...warn]
}

export function clip(text: string, columns: number): string {
  if (cells(text) <= columns) return text
  let out = ''
  for (const ch of text) {
    if (cells(out + ch) > columns - 1) break
    out += ch
  }

  return columns <= 0 ? '' : `${out}…`
}

// --- the cards ---

export type Card = {
  /** What the card is about, in the title: words a pack may set in capitals. */
  title: string
  /** What follows the title, never in capitals: a duration, a rate. */
  meta: string
  /** At the right end of the title: a count, a key. */
  right: string
  rows: Line[]
}

const caps = (text: string, isUpper: boolean) => (isUpper ? text.toUpperCase() : text)
const cell = (t: string, fg?: string, bold = false): Seg => ({ t, ...(fg === undefined ? {} : { fg }), ...(bold ? { bold } : {}) })

/** A card drawn in the theme's own header: boxed (its corners), banner, bracketed, or plain; `columns` wide. */
export function drawCard(card: Card, P: Palette, S: StepsStyle, columns: number): Line[] {
  const w = Math.min(columns, CARD_MAX)
  const { header } = S
  const tint = P[header.color]
  const frame = P[header.frame]
  const title = `${header.prefix}${caps(card.title, header.upper)}${card.meta === '' ? '' : ` · ${card.meta}`}`
  const right = card.right
  const pad = (line: Line, inner: number): Line => {
    const fitted = fitLine(line, inner)

    return [...fitted, { t: ' '.repeat(Math.max(0, inner - width(fitted))) }]
  }
  if (header.style === 'boxed') {
    const [tl = '╭', tr = '╮', bl = '╰', br = '╯'] = [...header.corners]
    const t = clip(title, w - 6 - (right === '' ? 0 : cells(right) + 2))
    const fill = w - 5 - cells(t) - (right === '' ? 0 : cells(right) + 1)

    return [
      [cell(`${tl} `, frame), cell(t, tint, true), cell(` ${'─'.repeat(Math.max(0, fill))}`, frame), ...(right === '' ? [] : [cell(` ${right}`, P.text3)]), cell(` ${tr}`, frame)],
      ...card.rows.map(row => [cell('│ ', frame), ...pad(row, w - 4), cell(' │', frame)]),
      [cell(`${bl}${'─'.repeat(w - 2)}${br}`, frame)],
    ]
  }
  const rule: Line = [cell('─'.repeat(w), frame)]
  const body = card.rows.map(row => [cell('  '), ...pad(row, w - 2)])
  if (header.style === 'banner') {
    const t = clip(title, w - 3 - (right === '' ? 0 : cells(right) + 1))
    const gap = w - 2 - cells(t) - cells(right)

    return [[{ t: ` ${t}${' '.repeat(Math.max(1, gap))}${right} `, fg: P.bg, bg: tint, bold: true }], ...body, rule]
  }
  const open = header.style === 'bracketed' ? '[ ' : ''
  const shut = header.style === 'bracketed' ? ' ]' : ''
  const t = clip(title, w - 4 - cells(open + shut) - (right === '' ? 0 : cells(right) + 1))
  const gap = w - cells(open + t + shut) - cells(right) - 1

  return [
    [cell(open, frame), cell(t, tint, true), cell(shut, frame), cell(` ${(header.style === 'bracketed' ? '─' : ' ').repeat(Math.max(0, gap - 1))}`, frame), cell(` ${right}`, P.text3)],
    ...body,
    rule,
  ]
}

/** A line cut to `columns`: whole runs while they fit, the one that does not cut with an ellipsis. */
export function fitLine(line: Line, columns: number): Line {
  const out: Line = []
  let left = columns
  for (const seg of line) {
    const n = cells(drawn(seg))
    if (n <= left) {
      out.push(seg)
      left -= n
    } else {
      if (left > 0 && seg.key === undefined) out.push({ ...seg, t: clip(seg.t, left) }) // (a control is whole or not drawn)
      break
    }
  }

  return out
}

/** Ten cells of the pack's meter (never pips, never a cycle): what is done of `of`. */
export function meter(done: number, of: number, P: Palette, S: StepsStyle): Line {
  const n = of <= 0 ? 0 : Math.round((10 * Math.min(done, of)) / of)
  // (A meter whose two cells are one glyph tells them by colour alone: the card's is then █░, readable without it.)
  const fill = S.meter.fill === S.meter.empty ? '█' : S.meter.fill
  const empty = S.meter.fill === S.meter.empty ? '░' : S.meter.empty

  return [cell(fill.repeat(n), P.green), cell(empty.repeat(10 - n), P.text3), cell(` ${done}/${of}`, P.text2)]
}

/** The card after a while away: what waits for the person first, then where the plan stands. */
export function backCard(away: number, said: string, steps: { done: number; of: number; now: string } | null, P: Palette, S: StepsStyle, inner: number): Card {
  const ask = lastAsk(said)
  // The ask whole, on as many lines as it takes (8 at most): the first beside the pill, the others under its words.
  const [first = '', ...more] = wrap(ask === '' ? 'Claude is waiting for you' : ask, Math.max(8, inner - 11), 8)

  return {
    title: 'back',
    meta: `away ${minutes(away)}`,
    right: '',
    rows: [
      [{ t: '● FOR YOU', fg: P.bg, bg: P.tabActive, bold: true }, cell(`  ${first}`, P.fg)],
      ...more.map(l => [cell(`${' '.repeat(11)}${l}`, P.fg)]),
      ...(steps === null ? [] : [meter(steps.done, steps.of, P, S), ...(steps.now === '' ? [] : [[cell('now  ', P.text3), cell(steps.now, P.fg)]])]),
    ],
  }
}

/** What Claude's last answer asks of the person: its last question, else its last line. */
export function lastAsk(said: string): string {
  const lines = said.split('\n').map(l => l.replace(/^[\s>#*\-\d.)]+/, '').replace(/[*`_]/g, '').trim()).filter(Boolean)
  const asked = [...lines].reverse().find(l => l.endsWith('?'))

  return asked ?? lines[lines.length - 1] ?? ''
}

/** The card before /clear: a handoff keeps what the context holds; a lesson where Professeur is on. */
export function clearCard(context: number | undefined, files: readonly string[], isProf: boolean, P: Palette): Card {
  const names = files.slice(-2).map(f => f.split('/').pop() ?? f)

  return {
    title: 'before /clear',
    meta: context === undefined ? '' : `ctx ${Math.round(context)}%`,
    right: 'then /clear',
    rows: [
      [{ t: 'handoff', key: 'h', fg: P.fg }, cell('   '), { t: 'lesson', key: 'e', fg: P.fg, dim: !isProf }],
      [cell('keeps  ', P.text3), cell(`${files.length} file${files.length === 1 ? '' : 's'}`, P.fg), cell(names.length === 0 ? '' : ` · ${names.join(' ')}${files.length > 2 ? ` +${files.length - 2}` : ''}`, P.text2)],
      [cell('prof   ', P.text3), isProf ? cell('● on', P.green) : cell('○ off (read only)', P.text3)],
    ],
  }
}

// --- recall: SM-2 on two grades ---

export type Schedule = { ef: number; reps: number; interval: number; due: number }
export const NEW: Schedule = { ef: 2.5, reps: 0, interval: 0, due: 0 }

/** SM-2 with two grades: forgot (again in 10 minutes, ease down), knew it (1 day, 6 days, then times the ease). */
export function reviewed(was: Schedule, knew: boolean, now: number): Schedule {
  if (!knew) return { ef: Math.max(1.3, was.ef - 0.2), reps: 0, interval: 0, due: now + 10 * 60_000 }
  const reps = was.reps + 1
  const interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(was.interval * was.ef)

  return { ef: Math.min(3, was.ef + 0.05), reps, interval, due: now + interval * DAY }
}

/** The cards due now: the seen ones first, the most overdue first (a forgotten card is back in 10 minutes), then the new ones. */
export function dueCards(deck: RecallDeck, cards: readonly RecallCard[], now: number): RecallCard[] {
  const seen = cards.filter(c => deck.sched[c.id] !== undefined && (deck.sched[c.id]?.due ?? 0) <= now)
    .sort((a, b) => (deck.sched[a.id]?.due ?? 0) - (deck.sched[b.id]?.due ?? 0))

  return [...seen, ...cards.filter(c => deck.sched[c.id] === undefined)]
}

/** The share of answers "knew it" over the last 30 days, or undefined before any. */
export function recallRate(deck: RecallDeck, now: number): number | undefined {
  const recent = deck.log.filter(l => now - l.at <= 30 * DAY)

  return recent.length === 0 ? undefined : Math.round((100 * recent.filter(l => l.knew).length) / recent.length)
}

/** The recall card: the question, then on the same place the answer and when it comes back. */
export function recallCard(card: RecallCard, due: number, rate: number | undefined, flipped: { knew: boolean; next: number } | null, P: Palette, inner: number, rows = 8): Card {
  return {
    title: 'recall',
    meta: rate === undefined ? 'new' : `${rate}%`,
    right: `${due} due`,
    rows: flipped === null
      ? [...wrap(card.q, inner, rows).map(l => [cell(l, P.fg)]), [{ t: 'forgot', key: 'f', fg: P.fg }, cell('   '), { t: 'knew it', key: 'k', fg: P.fg }]]
      : [...wrap(`→ ${card.a}`, inner, rows).map(l => [cell(l, P.fg)]), [cell(flipped.knew ? '✓ knew it' : '↺ again soon', flipped.knew ? P.green : P.text2), cell(` · next in ${flipped.next < 1 ? '10m' : `${flipped.next} d`}`, P.text3)]],
  }
}

/** Text in lines of `columns` at most, cut at spaces, `max` lines, the last cut with an ellipsis. */
export function wrap(text: string, columns: number, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line === '' ? word : `${line} ${word}`
    if (cells(next) <= columns) line = next
    else {
      if (line !== '') lines.push(line)
      line = word
    }
  }
  if (line !== '') lines.push(line)
  if (lines.length <= max) return lines.map(l => clip(l, columns))

  return [...lines.slice(0, max - 1), clip(lines.slice(max - 1).join(' '), columns)]
}
