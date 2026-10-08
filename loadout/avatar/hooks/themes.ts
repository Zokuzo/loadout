// The theme: the words of the command, the settings it writes and the live theme files. Pure but for
// `writeLive`, which is handed its file system: the hooks read and write.
//
// What the engine offers (seen in its types, its docs and probe sessions, 2026-10-08, Claude Code 2.1.293):
// - The theme is the `theme` settings key, read at a session's start: a running session keeps the
//   theme it started with whatever the settings file says later (its config row follows the file,
//   its colours do not). `/theme` changes the session it is typed in, and writes the user's file.
//   A pick in `/theme` raises `config.set` (origin `composer`) with the theme picked, a `custom:` one
//   and the theme already set too; `/theme` left with Esc raises nothing.
// - `$.config.set({ key: 'theme', value })` takes a built-in name alone (a `custom:` one is refused),
//   and from a plugin it writes the setting without repainting the session.
// - `claude --settings '{"theme": ...}'` outranks the user's file for that one session, read once.
// - The CONTENT of the theme file a session uses (`<config>/themes/<slug>.json`) is watched: a
//   rewrite repaints the session within seconds, with no key pressed.
// So Loadout switches by rewriting "live" theme files: `loadout.json`, which every terminal that
// follows the global setting (`custom:loadout`) uses, and `loadout-<tag>.json`, one terminal's own
// (given at its start by `bin/loadout`, `<tag>` its tty). A live file is a copy of a source theme
// under the name "Loadout: <source slug>": that name is how the source is found again.

/** The built-in themes, where the settings row does not list them. */
export const BUILT_IN = ['auto', 'dark', 'light', 'light-daltonized', 'dark-daltonized', 'light-ansi', 'dark-ansi'] as const

export const slugOf = (name: string): string => name.trim().toLowerCase().replace(/^custom:/, '').replace(/[\s_]+/g, '-')

/** A theme as the person names it (`kirby`, `Kirby Pink`, `custom:kirby`, `dark`) as the setting spells it; undefined for none of those there are. A custom theme wins over a built-in of its name only when asked for as `custom:`. */
export function settingOf(name: string, builtIns: readonly string[], customs: readonly string[]): string | undefined {
  const slug = slugOf(name)
  const isCustom = /^\s*custom:/i.test(name)
  if (!isCustom && builtIns.includes(slug)) return slug

  return customs.includes(slug) ? `custom:${slug}` : undefined
}

/** A settings file's text with its theme set, its other keys and its indent kept; null where the text is not a settings object (it is then left alone). */
export function withTheme(text: string, theme: string): string | null {
  let raw: unknown
  try {
    raw = text.trim() === '' ? {} : JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const indent = /\n([ \t]+)"/.exec(text)?.[1] ?? '  '

  return `${JSON.stringify({ ...raw, theme }, null, indent)}\n`
}

/** What a command line is given as one word, whatever is in it. */
export const quoted = (word: string): string => (/^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`)

/** The two command lines that start this conversation again in this terminal, pinned to `theme`: the launcher's, and what it runs. */
export function pinLines(theme: string, session: string, launcher: string): { short: string; plain: string } {
  const resume = session === '' ? '--continue' : `--resume ${quoted(session)}`

  return { short: `${quoted(launcher)} ${quoted(slugOf(theme))} ${resume}`, plain: `claude --settings ${quoted(JSON.stringify({ theme }))} ${resume}` }
}

/** The command's words: nothing, `follow`, or a theme and where (`here`, `all`, or not said). A name of several words is one name. */
export function askOf(words: readonly string[]): { kind: 'list' } | { kind: 'follow' } | { kind: 'set'; name: string; scope: 'here' | 'all' | undefined } {
  if (words.length === 0) return { kind: 'list' }
  if (words.length === 1 && words[0] === 'follow') return { kind: 'follow' }
  const end = words[words.length - 1]
  const scope = end === 'here' || end === 'all' ? end : undefined

  return { kind: 'set', name: (scope === undefined ? words : words.slice(0, -1)).join(' '), scope }
}

/** The names two themes had before they were renamed: still taken, wherever a forgiving name is (bin/loadout has the same four). */
export const OLD_NAMES: Readonly<Record<string, string>> = { 'cyberpunk-soft': 'cyberpunk-edgerunners', soft: 'cyberpunk-edgerunners', 'cyberpunk-classic': 'ghostrunner', classic: 'ghostrunner' }

/**
 * A theme by a forgiving name. The name as the setting spells it wins (`kirby`, `Kirby Pink`,
 * `custom:kirby`); else the theme an old name now is (OLD_NAMES), where that theme is there; else
 * the one theme whose slug, or a word of it, begins with the name (`edge`, `pink`, `cyberpunk` where
 * one theme alone has it). `among` is what the name could be, by slug: several for an ambiguous
 * name, none for an unknown one.
 */
export function findTheme(name: string, builtIns: readonly string[], customs: readonly string[]): { setting: string } | { among: string[] } {
  const exact = settingOf(name, builtIns, customs)
  if (exact !== undefined) return { setting: exact }
  const slug = slugOf(name)
  if (slug === '') return { among: [] }
  const renamed = Object.hasOwn(OLD_NAMES, slug) && customs.includes(OLD_NAMES[slug]!) ? `custom:${OLD_NAMES[slug]!}` : undefined
  if (renamed !== undefined) return { setting: renamed }
  const all = /^\s*custom:/i.test(name) ? customs : [...customs, ...builtIns]
  const hits = [...new Set(all.filter(one => `-${one}`.includes(`-${slug}`)))]
  const only = hits.length === 1 ? settingOf(hits[0]!, builtIns, customs) : undefined

  return only === undefined ? { among: hits } : { setting: only }
}

/** A theme the picker offers: its setting, its slug, its name for a person, and four of its colours. */
export type Offer = { setting: string; slug: string; name: string; swatch: readonly string[] }

// ponytail: a built-in theme's colours are the engine's own and no file gives them: two fixed swatches, by ground. Read them from the engine if it ever tells them.
const SWATCH = { dark: ['#d77757', '#ffffff', '#4eba65', '#ffc107'], light: ['#d77757', '#000000', '#2c7a39', '#966c1e'] } as const
const SWATCH_KEYS = ['claude', 'text', 'success', 'warning'] as const

const groundOf = (name: unknown): 'dark' | 'light' => (typeof name === 'string' && /light/i.test(name) ? 'light' : 'dark')

/** A built-in theme as an offer. */
export const builtInOffer = (slug: string): Offer => ({ setting: slug, slug, name: slug, swatch: SWATCH[groundOf(slug)] })

/**
 * A custom theme as an offer, from its file's text (`~/.claude/themes/<slug>.json`): its `name`, and
 * its own `claude`, `text`, `success` and `warning` colours where it sets them as #rrggbb, its base's
 * otherwise. A file that does not parse is offered all the same, by its slug: the engine lists it too.
 */
export function customOffer(slug: string, text: string): Offer {
  let raw: { name?: unknown; base?: unknown; overrides?: Record<string, unknown> } = {}
  try {
    const read: unknown = JSON.parse(text)
    if (typeof read === 'object' && read !== null && !Array.isArray(read)) raw = read
  } catch {
    // not JSON: its slug and the dark swatch
  }
  const own = typeof raw.overrides === 'object' && raw.overrides !== null ? raw.overrides : {}
  const base = SWATCH[groundOf(raw.base)]
  const swatch = SWATCH_KEYS.map((key, i) => {
    const color = own[key]

    return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : base[i]!
  })

  return { setting: `custom:${slug}`, slug, name: typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : slug, swatch }
}

// --- live theme files ----------------------------------------------------------------------

/** The live file every terminal that follows the global setting uses, by slug. */
export const LIVE = 'loadout'

/** Whether a theme file's slug is a live file's: never a source, never offered, never matched by name. */
export const isLive = (slug: string): boolean => /^loadout(-[a-z0-9-]+)?$/.test(slug)

/** A setting's live slug (`custom:loadout` or `custom:loadout-<tag>`), undefined for any other theme. */
export const liveOf = (setting: string): string | undefined => (setting.startsWith('custom:') && isLive(setting.slice(7)) ? setting.slice(7) : undefined)

/**
 * A live file's text for a source theme: "Loadout: <slug>" as its name, the source's `base` and
 * `overrides`. `source` is the source file's text, null for a built-in theme (its own base, nothing
 * overridden). Undefined where the source is not a theme object: nothing is written from it.
 */
export function liveText(slug: string, source: string | null): string | undefined {
  let raw: { base?: unknown; overrides?: unknown } = { base: slug }
  if (source !== null) {
    try {
      const read: unknown = JSON.parse(source)
      if (typeof read !== 'object' || read === null || Array.isArray(read)) return undefined
      raw = read
    } catch {
      return undefined
    }
  }
  const overrides = typeof raw.overrides === 'object' && raw.overrides !== null && !Array.isArray(raw.overrides) ? raw.overrides : {}

  return `${JSON.stringify({ name: `Loadout: ${slug}`, ...(raw.base === undefined ? {} : { base: raw.base }), overrides }, null, 2)}\n`
}

/**
 * The source a live file was written from, as its setting: from its name ("Loadout: kirby"). A
 * built-in name with nothing overridden is the built-in theme, any other a file of the themes
 * folder. Undefined where the text is no live file (not written yet, or not by Loadout).
 */
export function liveSource(text: string, builtIns: readonly string[]): string | undefined {
  let raw: { name?: unknown; overrides?: unknown }
  try {
    const read: unknown = JSON.parse(text)
    if (typeof read !== 'object' || read === null || Array.isArray(read)) return undefined
    raw = read
  } catch {
    return undefined
  }
  const slug = typeof raw.name === 'string' ? /^Loadout: (\S.*)$/.exec(raw.name.trim())?.[1] : undefined
  if (slug === undefined || isLive(slug)) return undefined
  const isPlain = typeof raw.overrides !== 'object' || raw.overrides === null || Object.keys(raw.overrides).length === 0

  return isPlain && builtIns.includes(slug) ? slug : `custom:${slug}`
}

/** The file system `writeLive` is handed: a read that answers null for no file, a write, and a rename within a folder. */
export type Disk = { read: (path: string) => Promise<string | null>; write: (path: string, text: string) => Promise<void>; move: (from: string, to: string) => Promise<void> }

/**
 * Writes a live file, atomically: a temporary file beside it (no `.json`, so it is no theme), then
 * a rename over it, so the engine's watcher never reads half a file. Nothing is written where the
 * file already says `text`. Resolves whether it wrote; rejects where the disk does.
 */
export async function writeLive(disk: Disk, dir: string, live: string, text: string, stamp: string | number): Promise<boolean> {
  const path = `${dir}/${live}.json`
  if ((await disk.read(path)) === text) return false
  const temp = `${dir}/.${live}.${stamp}.tmp`
  await disk.write(temp, text)
  await disk.move(temp, path)

  return true
}
