import type { Form } from './look'
import { FORMS } from './look'

/** The worlds a text family can be set in, and their characters' places: a slot is a world and a model's form. (`y2k` and `y2kdark` are one cast, rendered for a light and a dark ground; `halo` is Cortana and her kind, `halodark` the Chief and Blue Team.) */
export type World = 'ghostrunner' | 'edgerunners' | 'initiald' | 'y2k' | 'y2kdark' | 'halo' | 'halodark'
export type Slot = `${World}-${Form}`
export const WORLDS: readonly World[] = ['ghostrunner', 'edgerunners', 'initiald', 'y2k', 'y2kdark', 'halo', 'halodark']
export const slotOf = (world: World, form: Form): Slot => `${world}-${form}`
export const SLOTS: readonly Slot[] = WORLDS.flatMap(world => FORMS.map(form => slotOf(world, form)))

/** Who each slot is: the name its footage plays under where its manifest gives none it can use (never the mask's: the mask is not who is on screen). */
export const CAST: Readonly<Record<Slot, string>> = {
  'ghostrunner-opus': 'JACK', 'ghostrunner-sonnet': 'HEL', 'ghostrunner-haiku': 'MITRA', 'ghostrunner-fable': 'MARA',
  'edgerunners-opus': 'LUCY', 'edgerunners-sonnet': 'DAVID', 'edgerunners-haiku': 'REBECCA', 'edgerunners-fable': 'ADAM SMASHER',
  'initiald-opus': 'TAKUMI', 'initiald-sonnet': 'RYOSUKE', 'initiald-haiku': 'KEISUKE', 'initiald-fable': 'BUNTA',
  'y2k-opus': 'SERAPH', 'y2k-sonnet': 'LUMEN', 'y2k-haiku': 'SPARK', 'y2k-fable': 'HALO',
  'y2kdark-opus': 'SERAPH', 'y2kdark-sonnet': 'LUMEN', 'y2kdark-haiku': 'SPARK', 'y2kdark-fable': 'HALO',
  'halo-opus': 'CORTANA', 'halo-sonnet': 'THE WEAPON', 'halo-haiku': 'SERINA', 'halo-fable': 'ISABEL',
  'halodark-opus': 'MASTER CHIEF', 'halodark-sonnet': 'KELLY-087', 'halodark-haiku': 'LINDA-058', 'halodark-fable': 'FRED-104',
}

/** Every picture of the camera feed is this shape (400 by 340), so its box is one size whoever is in it. */
export const FEED_SHAPE = 400 / 340

const SPOKEN = ['idle', 'working', 'happy', 'worried'] as const

/**
 * Footage of a character, cut into loops: `<slot>/<clip>/NNN.png`, and which loops play in which mood.
 * `name` is the character's, and `speech` what its banner says per mood, where the manifest brings them.
 */
export type Reel = {
  name?: string
  speech?: Readonly<Partial<Record<(typeof SPOKEN)[number], string>>>
  clips: Readonly<Record<string, { frames: number; ms: number }>>
  moods: Readonly<Record<string, readonly string[]>>
}

/** A manifest's words as plain text on one line, `max` characters at the most: Latin letters, digits and common punctuation; no control or direction characters. */
const plain = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/[^\x20-\x7e\u00a0-\u024f\u2010-\u2027]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim() : ''

/** A loop stays on screen about this long before the next one of its mood takes over. */
const HOLD_MS = 7000

/** A manifest as read from disk, or null where it is not one: clips with frames, only moods that name them, and idle loops among them (what every other mood falls back to). */
export function reelOf(text: string): Reel | null {
  try {
    const raw = JSON.parse(text) as { name?: unknown; speech?: unknown; clips?: Record<string, { frames?: unknown; ms?: unknown }>; moods?: Record<string, unknown> }
    const clips: Record<string, { frames: number; ms: number }> = {}
    for (const [name, clip] of Object.entries(raw.clips ?? {})) {
      const frames = Number(clip?.frames)
      const ms = Number(clip?.ms)
      if (/^[a-z0-9-]+$/.test(name) && Number.isInteger(frames) && frames > 0 && frames < 1000) clips[name] = { frames, ms: ms >= 30 && ms <= 1000 ? ms : 90 }
    }
    const moods: Record<string, string[]> = {}
    for (const [mood, names] of Object.entries(raw.moods ?? {})) {
      const known = Array.isArray(names) ? names.filter((name): name is string => typeof name === 'string' && Object.hasOwn(clips, name)) : []
      if (known.length > 0) moods[mood] = known
    }

    if (!Object.hasOwn(moods, 'idle')) return null
    const name = plain(raw.name, 24)
    const lines = typeof raw.speech === 'object' && raw.speech !== null ? (raw.speech as Record<string, unknown>) : {}
    const speech = Object.fromEntries(SPOKEN.map(mood => [mood, plain(Object.hasOwn(lines, mood) ? lines[mood] : '', 60)] as const).filter(([, line]) => line !== ''))

    return { ...(name === '' ? {} : { name }), ...(Object.keys(speech).length === 0 ? {} : { speech }), clips, moods }
  } catch {
    return null
  }
}

/** Which of a reel's sets of loops plays: the one named after the kind of call that runs (`scan`, `edit`, `exec`...) where the reel has it, else the mood's. */
export const playedOf = (reel: Reel, mood: string, cue: string): string => (Object.hasOwn(reel.moods, cue) ? cue : mood)

/**
 * The frame to show `elapsed` ms into a mood: its loops in rotation, each repeated whole until it has
 * held about HOLD_MS. A mood the reel lacks plays the idle loops (a reel read by `reelOf` has them); null where there are none either.
 */
export function frameAt(reel: Reel, mood: string, elapsed: number): { clip: string; frame: number } | null {
  const names = reel.moods[mood] ?? reel.moods['idle']
  if (names === undefined) return null
  const spans = names.map(name => {
    const { frames, ms } = reel.clips[name]!
    const once = frames * ms

    return { name, frames, ms, span: once * Math.max(1, Math.round(HOLD_MS / once)) }
  })
  const total = spans.reduce((sum, one) => sum + one.span, 0)
  let at = ((Math.floor(elapsed) % total) + total) % total
  for (const one of spans) {
    if (at < one.span) return { clip: one.name, frame: Math.floor(at / one.ms) % one.frames }
    at -= one.span
  }

  return null
}
