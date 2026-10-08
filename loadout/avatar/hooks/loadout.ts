// `/loadout`: the command's words, its help and its lists. Pure: register.tsx reads, writes and opens.
// (The command is answered there, beside the theme code it runs: the engine follows `$` from a hook
// into the functions of that hook's own file, never across an import.)

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
