// `/loadout`: the command's words, its help and its lists. Pure: register.tsx reads, writes and opens.
// (The command is answered there, beside the theme code it runs: the engine follows `$` from a hook
// into the functions of that hook's own file, never across an import.)
import type { Offer } from './themes'

/** What `/loadout ...` asks for. A theme's name is every word but a closing `here` (or `all`). */
export type LoadoutAsk =
  | { kind: 'pick' } | { kind: 'help' } | { kind: 'status' } | { kind: 'follow' }
  | { kind: 'pane'; pane: 'avatar' | 'flow' }
  | { kind: 'frames'; value: string } | { kind: 'background'; value: string } | { kind: 'style'; value: string }
  | { kind: 'theme'; name: string; scope: 'all' | 'here' }

const PANES = ['avatar', 'flow'] as const
const SWITCHES = ['frames', 'background', 'style'] as const

export function loadoutAsk(args: string): LoadoutAsk {
  const words = args.trim().toLowerCase().split(/\s+/).filter(word => word !== '')
  const [first = '', second = ''] = words
  if (words.length === 0) return { kind: 'pick' }
  if (words.length === 1 && first === 'help') return { kind: 'help' }
  if (words.length === 1 && first === 'status') return { kind: 'status' }
  if (words.length === 1 && first === 'follow') return { kind: 'follow' }
  const pane = PANES.find(one => one === first)
  if (pane !== undefined && words.length === 1) return { kind: 'pane', pane }
  const change = SWITCHES.find(one => one === first)
  if (change !== undefined && words.length <= 2) return { kind: change, value: second }
  const end = words[words.length - 1]
  const scope = end === 'here' ? 'here' : 'all'

  return { kind: 'theme', name: (end === 'here' || end === 'all' ? words.slice(0, -1) : words).join(' '), scope }
}

export const USAGE = 'Change it: /loadout <theme> (every terminal) · /loadout <theme> here (this terminal) · /loadout help.'

export const HELP = [
  '/loadout                        pick a theme in the Avatar pane, and list them',
  '/loadout <theme>                that theme for every terminal, with no restart',
  '/loadout <theme> here           this terminal only: live where bin/loadout started it',
  '/loadout follow                 the line that makes this terminal follow the global theme again',
  '/loadout avatar | flow          open that pane',
  '/loadout frames on|off          the frames around conversation rows',
  '/loadout background on|off      let the theme tint the terminal background',
  '/loadout style pixel|text|auto  how a Ghostrunner or Edgerunners character is drawn',
  '/loadout status                 what is loaded',
  'A theme\'s name is forgiving: "Cyberpunk Edgerunners", edgerunners, edge, cyberpunk; ghost.',
].join('\n')

/** The themes in a line, customs first, the one in use marked: `▸kirby`. */
export const listed = (customs: readonly string[], builtIns: readonly string[], active: string): string =>
  [...customs.map(slug => [`custom:${slug}`, slug] as const), ...builtIns.map(slug => [slug, slug] as const)].map(([setting, slug]) => (setting === active ? `▸${slug}` : slug)).join(', ')

/** A row of the prompt box's typeahead: what taking it writes over the token, a dim word beside it. */
export type Suggestion = { text: string; description?: string }

const WORDS: readonly (readonly [string, string])[] = [
  ['here', 'this terminal only'], ['all', 'every terminal'], ['status', 'what is loaded'], ['help', 'every word it takes'], ['follow', 'follow the global theme again'],
  ['avatar', 'open the Avatar pane'], ['flow', 'open the Flow map'], ['frames', 'frames around rows: on|off'], ['background', 'tint the background: on|off'], ['style', 'pixel|text|auto'],
]
const VALUES: Readonly<Record<string, readonly string[]>> = { frames: ['on', 'off'], background: ['on', 'off'], style: ['pixel', 'text', 'auto'] }

/**
 * The typeahead's rows for `/loadout` as it is typed: `text` the draft, `token` the word at the cursor
 * (never empty), `start` where it begins. The command typed in full lists every theme; its first word
 * a theme or a word of the command, as a theme's name is forgiving (`edge`, `dark`); after a theme,
 * `here` or `all`; after a switch, its values. None for any other draft.
 */
export function loadoutSuggestions(text: string, token: string, start: number, offers: readonly Offer[], active: string): Suggestion[] {
  const themes = (match: (slug: string) => boolean, lead: string) =>
    offers.filter(one => match(one.slug)).map(one => ({ text: `${lead}${one.slug}`, description: `${one.name}${one.setting === active ? ' · in use' : ''}` }))
  if (token === '/loadout' && start === 0) return themes(() => true, '/loadout ')
  const before = /^\/loadout\s+(.*)$/s.exec(text.slice(0, start))
  if (before === null) return []
  const words = before[1]!.trim().toLowerCase().split(/\s+/).filter(word => word !== '')
  const typed = token.toLowerCase()
  const begins = (word: string) => word.startsWith(typed)
  const said = (pairs: readonly (readonly [string, string?])[]) => pairs.filter(([word]) => begins(word)).map(([word, description]) => ({ text: word, ...(description ? { description } : {}) }))
  if (words.length === 0) return [...themes(slug => `-${slug}`.includes(`-${typed}`), ''), ...said(WORDS.slice(2))]
  if (words.length === 1 && Object.hasOwn(VALUES, words[0]!)) return said(VALUES[words[0]!]!.map(word => [word]))

  return words.at(-1) === 'here' || words.at(-1) === 'all' ? [] : said(WORDS.slice(0, 2))
}
