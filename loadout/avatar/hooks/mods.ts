// The Avatar pane's own lines, as pure functions: the words of the agents' count (the pane paints them; a HUD says its own),
// and the line before a /clear, drawn in the Avatar pane, or above the prompt where that pane is not shown: its words are
// fixed; a theme only paints them, with its Flow palette and its steps header.
import type { Palette, StepsStyle } from '../../flow/hooks/palette'
import type { ModsState } from '../../types'

export const MODS: ModsState = { endAt: 0, files: [], prompt: '' }

/**
 * One run of text in one colour: a line is a list of them. A run with a `key` is a control: drawn
 * `h: handoff` (a plain Button of that hotkey), pressing it does what the key names.
 */
export type Seg = { t: string; fg?: string; bold?: boolean; key?: string; dim?: boolean }
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

/**
 * The Avatar pane's count line, in its two parts: how many agents live (`3 agents`), then how many of them
 * wait (` · 1 waiting`), empty for none. Both are empty for no agent: the line is said whole or not at all.
 */
export const agentCount = (agents: number, waiting: number): [count: string, waiting: string] =>
  [agents > 0 ? `${agents} agent${agents === 1 ? '' : 's'}` : '', agents > 0 && waiting > 0 ? ` · ${waiting} waiting` : '']

/**
 * The line before a /clear, `columns` wide at most where its two keys fit (21 cells: they are never cut): its title in the pack's header colour (in capitals where
 * the pack's header is), the two keys (a handoff keeps what the context holds; a lesson where Professeur is
 * on, dim where it is not), then how full the context is, where that is known. What gives way, in order: the
 * context figure, then the title shortens to `/clear`, then the title goes. A key is never cut.
 */
export function clearLine(context: number | undefined, isProf: boolean, P: Palette, S: StepsStyle, columns: number): Line {
  const keys: Line = [{ t: 'handoff', key: 'h' }, { t: '  ' }, { t: 'lesson', key: 'e', dim: !isProf }]
  const titled = (title: string): Line => [{ t: S.header.upper ? title.toUpperCase() : title, fg: P[S.header.color], bold: true }, { t: '  ' }, ...keys]
  const whole = titled('before /clear')
  const forms = [...(context === undefined ? [] : [[...whole, { t: `  ctx ${Math.round(context)}%`, fg: P.text3 }]]), whole, titled('/clear')]

  return forms.find(line => width(line) <= columns) ?? keys
}
