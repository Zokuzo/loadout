// Theme packs: what a theme asks of this mod, as data (`<mods>/themes/<slug>.json`, THEMES.md beside
// them says how they are written). Pure: a pack is read from a file's text, and a theme's pack picked
// from the packs read, so tests and previews load what the pane loads. Only the fields this mod
// draws from are read here; the Flow map's (`flow`) are its own to check.
import type { Skin, Variant } from './hud'

export type PackFamily = 'kirby' | 'clawd' | 'cyber' | 'initial-d' | 'y2k' | 'halo'

/**
 * A pack as this mod keeps it: the theme names it serves (`slug`, and the `match` substrings),
 * whether the theme is a light one, the one colour of terminal and pane (null: the terminal's own),
 * the mascot family, for the cyber family its variant and, where the pack brings them, a text family's colours.
 */
export type Pack = {
  slug: string
  name: string
  match: readonly string[]
  isLight: boolean
  background: number | null
  family: PackFamily
  variant?: Variant
  skin?: Skin
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const COLOUR = /^#[0-9a-f]{6}$/i
const FAMILIES: readonly PackFamily[] = ['kirby', 'clawd', 'cyber', 'initial-d', 'y2k', 'halo']
const SKIN_KEYS = ['primary', 'bright', 'body', 'shadow', 'dim', 'cyan', 'alert', 'value', 'tint', 'ink'] as const

/** A theme's name as packs know it: `custom:Kirby Pink` and `kirby_pink` are `kirby-pink`. */
export const norm = (theme: string): string => theme.trim().toLowerCase().replace(/^custom:/, '').replace(/[\s_]+/g, '-')

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const colourOf = (value: unknown): number | undefined => (typeof value === 'string' && COLOUR.test(value) ? Number.parseInt(value.slice(1), 16) : undefined)

/**
 * The pack a file holds, or why it is not one, in a few words: a pack that does not parse, lacks a
 * field or holds a wrong value is never half used. `file` is the file's name: the slug is its name.
 */
export function packOf(text: string, file: string): Pack | string {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return 'not JSON'
  }
  if (!isRecord(raw)) return 'not an object'
  const { slug, name, match, isLight, terminal, avatar } = raw
  if (typeof slug !== 'string' || !SLUG.test(slug)) return 'no slug'
  if (`${slug}.json` !== file) return `slug "${slug}" is not the file's name`
  if (typeof isLight !== 'boolean') return 'isLight is not true or false'
  if (!isRecord(terminal) || !('background' in terminal)) return 'no terminal.background'
  const background = terminal['background'] === null ? null : colourOf(terminal['background'])
  if (background === undefined) return 'terminal.background is not #rrggbb or null'
  if (match !== undefined && !(Array.isArray(match) && match.every(one => typeof one === 'string' && SLUG.test(one)))) return 'match is not a list of names'
  if (!isRecord(avatar)) return 'no avatar'
  const family = FAMILIES.find(one => one === avatar['family'])
  if (family === undefined) return 'avatar.family is not kirby, clawd, cyber, initial-d, y2k or halo'
  const variant = avatar['variant']
  if (family === 'cyber' ? variant !== 'red' && variant !== 'yellow' : variant !== undefined) return 'avatar.variant: red or yellow, for cyber alone'
  const pack: Pack = { slug, name: typeof name === 'string' && name !== '' ? name : slug, match: (match as string[] | undefined) ?? [], isLight, background, family }
  const worn = avatar['skin']
  // (The cars' HUD has one palette, `night`, and the chrome and Halo ones the pack's light or dark: no variant to name.)
  const told = family === 'cyber' ? { variant: variant as Variant } : {}
  if (family !== 'cyber' && family !== 'initial-d' && family !== 'y2k' && family !== 'halo') return worn === undefined ? pack : 'avatar.skin is for cyber, initial-d, y2k and halo alone'
  if (worn === undefined) return { ...pack, ...told }
  if (!isRecord(worn)) return 'avatar.skin is not an object'
  const colours = SKIN_KEYS.map(key => colourOf(worn[key]))
  const missing = SKIN_KEYS.find((_key, i) => colours[i] === undefined)
  if (missing !== undefined) return `avatar.skin.${missing} is not #rrggbb`
  const skin = Object.fromEntries([['variant', variant ?? (family === 'halo' ? (isLight ? 'cortana' : 'mjolnir') : family !== 'y2k' ? 'night' : isLight ? 'chrome' : 'midnight')], ...SKIN_KEYS.map((key, i) => [key, colours[i]])]) as Skin

  return { ...pack, ...told, skin }
}

/**
 * The pack that serves a theme, as THEMES.md has it: the one whose slug is the theme's name, else the
 * one with the longest `match` string the name contains (then the first slug in the alphabet), else
 * the `default` pack. Undefined for a theme not read yet, and where no pack serves it.
 */
export function resolve(theme: string, packs: readonly Pack[]): Pack | undefined {
  const name = norm(theme)
  if (name === '') return undefined
  const exact = packs.find(pack => pack.slug === name)
  if (exact !== undefined) return exact
  const hits = packs.flatMap(pack => pack.match.filter(one => name.includes(one)).map(one => ({ pack, one })))
  hits.sort((a, b) => b.one.length - a.one.length || (a.pack.slug < b.pack.slug ? -1 : 1))

  return hits[0]?.pack ?? packs.find(pack => pack.slug === 'default')
}

/** A pack's file as a directory lists it. */
export type PackFile = { name: string; size: number; mtimeMs: number }

const PACK_MAX = 64 * 1024 // bytes: a pack is a page of JSON

/** The files of a folder that are packs' (`schema.json` is their reference, not one), by name, and what tells a change in any: names, sizes, times. */
export function packFiles(entries: readonly (PackFile & { kind: string })[]): { files: PackFile[]; print: string } {
  const files = entries.filter(one => one.kind === 'file' && one.name.endsWith('.json') && one.name !== 'schema.json' && one.size <= PACK_MAX)
    .map(({ name, size, mtimeMs }) => ({ name, size, mtimeMs })).sort((a, b) => (a.name < b.name ? -1 : 1))

  return { files, print: files.map(one => `${one.name}:${one.size}:${one.mtimeMs}`).join('|') }
}

/** The packs of the files read (`texts` by file name), and the files skipped, each with why. A slug a pack before has is skipped too. */
export function packsOf(texts: ReadonlyMap<string, string | null>): { packs: Pack[]; skipped: string[] } {
  const packs: Pack[] = []
  const skipped: string[] = []
  for (const [file, text] of [...texts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const pack = text === null ? 'unreadable' : packOf(text, file)
    if (typeof pack === 'string') skipped.push(`${file} (${pack})`)
    else packs.push(pack)
  }

  return { packs, skipped }
}
