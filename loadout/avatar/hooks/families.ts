// The mascot families: which one a theme calls for, and what each brings. A family is one entry of
// FAMILIES; the pane draws whatever the entry holds, so a new family is a new entry and its art,
// nothing else. A family is drawn in pixels (sprites, and a stage of minis) or, with a `skin`, in text.
import type { Canvas } from './canvas'
import { CLAWD, clawdFrame, isClawdAtRest } from './clawd'
import type { ClawdMoment } from './clawd'
import { HERO_NAMES } from './cyber'
import type { Who } from './cyber'
import { FORM_SPRITES } from './forms'
import type { FormSprite } from './forms'
import { clawdMini, kirbyMini } from './hires'
import type { MiniSet } from './hires'
import { NAMES, SKINS, hex } from './hud'
import type { Skin } from './hud'
import type { Captions } from './hudpane'
import type { Family, Form, Pixels } from './look'
import { faceAt } from './mascot'
import type { Mood } from './mascot'
import { norm, resolve } from './packs'
import type { Pack } from './packs'
import { CAST } from './reel'
import type { World } from './reel'
import { KIRBY } from './sprite'
import { TOUGE } from './touge'

export type FamilyName = 'kirby' | 'clawd' | 'ghostrunner' | 'cyberpunk-edgerunners' | 'initial-d'

/** What worries a mascot, in its own words: a context getting full, and a limit (named) almost used up. */
export type Worry = { full: string; near: (limit: string) => string }

/** What the bubble says per mood, and in which colour: a key of the theme's, or a skin's own. */
type Speech = Readonly<Record<Mood, readonly [text: string, color: string]>>

/**
 * A family drawn in pixels:
 * - `forms`: the main mascot per model, its name and three frames (eyes open, half shut, shut);
 * - `painted`: optionally, a form's pixels drawn for the mood instead of picked from its frames;
 * - `mini`: the stage's sprites for an agent's colour slot and its model's form (hires.ts says which poses);
 * - `blocks`: which of the cell-block stage's two mini sets stands in where the terminal draws no pictures;
 * - `acted`: optionally, the mascot in true pixels drawn anew for each moment (from its parts, not a frame pushed
 *   about): a `frame` of `width` by `height` art pixels in the box its sprite has, and whether a moment is one of rest.
 */
export type SpriteFamily = {
  key: FamilyName
  forms: Readonly<Record<Form, FormSprite>>
  painted?: (form: Form, mood: Mood, isMouthShut: boolean, isBlink: boolean) => Pixels | undefined
  mini: (slot: number, form?: Form) => MiniSet
  blocks: Family
  speech: Speech
  acted?: { frame: (form: Form, moment: Acting, width: number, height: number, scale: number, isLight?: boolean) => Canvas; isAtRest: (moment: Acting) => boolean }
}

/** A moment of a mascot that acts: its mood, the clock and, while the mood is fresh, the one before and since when this one lasts. */
export type Acting = ClawdMoment

/**
 * A family drawn in text (hud.ts): its `skin` is the palette the whole pane takes, as a HUD, with
 * the mask and the agents' blocks in characters; `names` is the mask's name per model, `worry` how it puts what worries it.
 * `world` is where its characters come from: with a model's form it names the slot whose footage the camera feed plays (reel.ts).
 * A world with `cars` has no mask and no `hero`: its HUD frames the camera feed alone, in its own `captions`, and wherever
 * the feed does not play (no footage, no pictures, a style of text) the pane is the cars', as a sprite family draws it.
 */
export type TextFamily = { key: FamilyName; skin: Skin; world: World; names: Readonly<Record<Form, string>>; speech: Speech; worry: Worry; hero?: Hero; cars?: SpriteFamily; captions?: Captions }

/** A text family's Opus: a whole character (cyber.ts) in place of the mask, with its own name and voice. Drawn where the pane has its rows; the mask elsewhere. */
export type Hero = { who: Who; name: string; speech: Speech; worry: Worry }

export type FamilyDef = SpriteFamily | TextFamily

const BODY = 0xffa2de
const DARK = 0x000000
const MOUTH = 0xb61f36
const BLUSH = 0xff1784
const SWEAT = 0x5ac8fa
const EYE_COLS = [9, 10, 12, 13]

// [row, column, color] over the user's Kirby. Its eyes are rows 4-8 of EYE_COLS,
// its blush row 8 beside them, its mouth the one pixel at (10, 12).
const PAINT: Record<Mood, readonly (readonly [number, number, number])[]> = {
  idle: [],
  working: [[10, 11, MOUTH], [11, 11, MOUTH], [11, 12, MOUTH]],
  worried: [
    [8, 7, BODY], [8, 8, BODY], [8, 14, BODY], [8, 15, BODY],
    [10, 11, MOUTH], [10, 13, MOUTH],
    [4, 14, SWEAT], [5, 14, SWEAT],
  ],
  happy: [
    [8, 6, BLUSH], [9, 7, BLUSH], [9, 8, BLUSH], [9, 14, BLUSH], [9, 15, BLUSH], [8, 16, BLUSH],
    [10, 12, BODY], [10, 11, MOUTH], [10, 13, MOUTH], [11, 12, MOUTH],
  ],
}

/** The user's Kirby with the mood's face painted on. */
function paintedKirby(mood: Mood, isMouthShut: boolean, isBlink: boolean): Pixels {
  const px = KIRBY.map(row => [...row])
  const put = (row: number, col: number, color: number) => {
    const line = px[row]
    if (line) line[col] = color
  }
  if (!isMouthShut) for (const [row, col, color] of PAINT[mood]) put(row, col, color)
  if (isBlink) {
    for (const col of EYE_COLS) {
      for (let row = 4; row <= 8; row++) put(row, col, row === 7 ? DARK : BODY)
    }
  }

  return px
}

const KIRBY_FAMILY: SpriteFamily = {
  key: 'kirby',
  forms: { ...FORM_SPRITES, opus: { name: 'Kirby', frames: [KIRBY.map(row => [...row])] } },
  painted: (form, mood, isMouthShut, isBlink) => (form === 'opus' ? paintedKirby(mood, isMouthShut, isBlink) : undefined),
  mini: kirbyMini,
  blocks: 'kirby',
  speech: { idle: ['poyo!', 'claude'], working: ['thinking…', 'suggestion'], worried: ['', 'error'], happy: ['poyo~ ♥', 'success'] },
}

const CLAWD_FAMILY: SpriteFamily = {
  key: 'clawd',
  forms: CLAWD,
  mini: clawdMini,
  blocks: 'clawd',
  acted: { frame: clawdFrame, isAtRest: isClawdAtRest },
  speech: { idle: ['hi!', 'claude'], working: ['thinking…', 'suggestion'], worried: ['', 'error'], happy: ['clack clack ♥', 'success'] },
}

// The cars of a night mountain pass, one per model, seen from the front: their headlights are their eyes. The helpers on stage are Clawd's minis.
// (What the Initial D theme draws wherever its camera feed does not play: `touge`, below.)
const TOUGE_FAMILY: SpriteFamily = {
  key: 'initial-d',
  forms: TOUGE,
  mini: clawdMini,
  blocks: 'clawd',
  speech: { idle: ['tofu loaded. engine warm.', 'claude'], working: ['drifting…', 'suggestion'], worried: ['', 'error'], happy: ['not a drop spilled ♥', 'success'] },
}

/** The night pass on camera: the drivers' footage in a HUD of its own colours and words, told as a stage is run; the cars where it does not play. */
const touge = (skin: Skin): TextFamily => ({
  key: 'initial-d',
  skin,
  world: 'initiald',
  cars: TOUGE_FAMILY,
  captions: { link: 'DOWNHILL', crew: 'CONVOY', unit: 'CARS', banner: 'STAGE', meters: 'TACHOMETER' },
  names: { opus: CAST['initiald-opus'], sonnet: CAST['initiald-sonnet'], haiku: CAST['initiald-haiku'], fable: CAST['initiald-fable'] },
  speech: {
    idle: ['ENGINE WARM. WAITING.', hex(skin.primary)],
    working: ['INTO THE HAIRPIN...', hex(skin.cyan)],
    worried: ['', hex(skin.alert)],
    happy: ['NOT A DROP SPILLED.', hex(skin.value)],
  },
  worry: { full: 'TYRES NEAR GONE. /clear', near: limit => `${limit.toUpperCase()} LIMIT AT REDLINE` },
})

/** The cyber family in one of its two palettes and worlds: Raijin, terse as a netrunner. The drawn ninja is Ghostrunner's Opus, the drawn thief Edgerunners'. */
const cyber = (key: FamilyName, skin: Skin, who: Who): TextFamily => ({
  key,
  skin,
  world: who === 'ninja' ? 'ghostrunner' : 'edgerunners',
  hero: {
    who,
    name: HERO_NAMES[who],
    ...(who === 'ninja' ? {
      // Kurenai: few words, all of them about the blade.
      speech: { idle: ['BLADE SHEATHED. WATCHING.', hex(skin.primary)], working: ['CUTTING THROUGH ICE...', hex(skin.cyan)], worried: ['', hex(skin.alert)], happy: ['ONE CUT. CLEAN.', hex(skin.value)] },
      worry: { full: 'NO ROOM LEFT. /clear', near: limit => `${limit.toUpperCase()} LIMIT CLOSING IN` },
    } : {
      // Magpie: a thief's shop talk.
      speech: { idle: ['CASING THE JOINT. QUIET.', hex(skin.primary)], working: ['FINGERS IN THE VAULT...', hex(skin.cyan)], worried: ['', hex(skin.alert)], happy: ['GOT IT. NEVER HERE.', hex(skin.value)] },
      worry: { full: 'POCKETS FULL. /clear', near: limit => `${limit.toUpperCase()} HEAT RISING. EASY` },
    }),
  },
  names: NAMES,
  speech: {
    idle: ['ICE HOLDING. STANDING BY.', hex(skin.primary)],
    working: ['JACKED IN. TRACING...', hex(skin.cyan)],
    worried: ['', hex(skin.alert)],
    happy: ['CLEAN RUN. ZERO TRACE.', hex(skin.value)],
  },
  // (Each fits the alarm banner's one line on the narrowest pane.)
  worry: { full: 'BUFFER NEAR FULL. /clear', near: limit => `${limit.toUpperCase()} QUOTA RUNNING DRY` },
})

/** The families that exist. One a theme calls for that is not here is played by Kirby. */
export const FAMILIES: Partial<Record<FamilyName, FamilyDef>> = {
  kirby: KIRBY_FAMILY, clawd: CLAWD_FAMILY, ghostrunner: cyber('ghostrunner', SKINS.red, 'ninja'), 'cyberpunk-edgerunners': cyber('cyberpunk-edgerunners', SKINS.yellow, 'thief'), 'initial-d': touge(SKINS.night),
}

/**
 * The family a theme calls for: Kirby for a kirby theme (and while the theme is unknown); the cyber
 * family in red for a Ghostrunner theme, in yellow for an Edgerunners one; Clawd for the rest.
 */
export const wantedOf = (theme: string): FamilyName =>
  theme === '' || /kirby/i.test(theme) ? 'kirby' : /ghostrunner/i.test(theme) ? 'ghostrunner' : /edgerunners/i.test(theme) ? 'cyberpunk-edgerunners' : 'clawd'

export const familyOf = (theme: string): FamilyDef => FAMILIES[wantedOf(theme)] ?? KIRBY_FAMILY

/** The mascot's name: the model's form of the family. */
export const nameOf = ({ family, form }: { family: FamilyDef; form: Form }): string => ('skin' in family ? family.names[form] : family.forms[form].name)

/** A mascot in pixels: its family and the model's form. */
export type Look = { family: SpriteFamily; form: Form }

/** Eyes open, half shut, shut; a painted form may have one frame alone. */
export const framesOf = ({ family, form }: Look): readonly Pixels[] => family.forms[form].frames

/** The look's pixels for a mood: painted where the family paints the form, else its frame for the eyes (0 open, 1 half shut, 2 shut). */
export function pixelsOf(look: Look, mood: Mood, eyes: 0 | 1 | 2, isMouthShut: boolean): Pixels {
  const frames = framesOf(look)

  return look.family.painted?.(look.form, mood, isMouthShut, eyes === 2) ?? frames[Math.min(eyes, frames.length - 1)]!
}

/**
 * The look's pixels at `now`, in true pixels: its frame for the face of that moment, exactly as
 * drawn (the user's Kirby among them: never rounded off), for the pane to enlarge pixel for pixel.
 */
export function frameOf(look: Look, mood: Mood, now: number): Pixels {
  const { eyes, isMouthShut } = faceAt(mood, now)

  return pixelsOf(look, mood, eyes, isMouthShut)
}

/**
 * What a box of `maxWidth` by `maxHeight` pixels shows of a look in cell blocks, a pixel of the form
 * a pixel of the box, never scaled: the form whole where it fits, else the family's plain form,
 * whole. A model's form is never cut: a body sliced flat under its cheeks reads worse than the plain
 * one (seen at every height from 24 to 60 rows). Only the plain form, on a box too short even for
 * it, loses its feet. Returns the look drawn and how many of its rows show.
 */
export function fitOf(look: Look, maxWidth: number, maxHeight: number): { look: Look; height: number } {
  const whole = framesOf(look)[0]!
  if (whole[0]!.length <= maxWidth && whole.length <= maxHeight) return { look, height: whole.length }

  return look.form === 'opus' ? { look, height: Math.min(whole.length, maxHeight) } : fitOf({ family: look.family, form: 'opus' }, maxWidth, maxHeight)
}

// --- the grounds ---------------------------------------------------------------

/** A theme's grounds, 0xRRGGBB: the terminal's own background, and the pane's, a step off it so the pane reads as a panel; `isLight` for a light theme's. */
export type Ground = { terminal: number; pane: number; isLight?: true }

/**
 * The themes that bring a ground, by name: a dark green with a yellow cast for Kirby, a deep
 * berry for Kirby Pink, a red-black for Ghostrunner and a yellow-black for Cyberpunk Edgerunners.
 * Each theme's `text` colour reads on both at 4.5 to 1 or better (the tests hold them to it).
 */
export const GROUNDS: Readonly<Record<string, Ground>> = {
  kirby: { terminal: 0x1b2414, pane: 0x1b2414 },
  // (The pane only a little darker: the theme's small text, green, grey and magenta, is near 4.5 to 1 on the terminal's tone itself.)
  'kirby-pink': { terminal: 0x2b1724, pane: 0x2b1724 },
  ghostrunner: { terminal: 0x120608, pane: 0x120608 },
  'cyberpunk-edgerunners': { terminal: 0x0b0b06, pane: 0x0b0b06 },
}

/** The ground of a theme as the settings name it (`custom:kirby-pink`, `Kirby Pink`); undefined for a theme that brings none: a built-in one, or somebody else's. */
export const groundOf = (theme: string): Ground | undefined => {
  const name = theme.trim().toLowerCase().replace(/^custom:/, '').replace(/[\s_]+/g, '-')

  return Object.hasOwn(GROUNDS, name) ? GROUNDS[name] : undefined
}

/** Whether a theme is a light one: ours that says so, or a built-in one named so. On it the stage is by day, and what is drawn in light colours for a dark ground is drawn darker. */
export const isLightOf = (theme: string): boolean => groundOf(theme)?.isLight === true || /^light/i.test(theme.trim())

// --- a theme's pack ------------------------------------------------------------

// The text family in a pack's own colours, made once per palette: a pane drawn twice draws from the same family.
const skinned = new Map<string, TextFamily>()

/** The family a pack calls for, by its name; the cyber family in the pack's variant (red: the Ghostrunner world, yellow: Edgerunners). A text family's colours are the pack's where it brings them. */
function packFamily(pack: Pack): FamilyDef {
  if (pack.family !== 'cyber' && pack.skin === undefined) return FAMILIES[pack.family] ?? CLAWD_FAMILY
  const [key, who] = pack.family !== 'cyber' ? (['initial-d', undefined] as const) : pack.variant === 'yellow' ? (['cyberpunk-edgerunners', 'thief'] as const) : (['ghostrunner', 'ninja'] as const)
  const stock = FAMILIES[key] ?? KIRBY_FAMILY
  const mark = JSON.stringify(pack.skin)
  if (pack.skin === undefined || ('skin' in stock && JSON.stringify(stock.skin) === mark)) return stock
  const made = skinned.get(mark) ?? (who === undefined ? touge(pack.skin) : cyber(key, pack.skin, who))
  skinned.set(mark, made)

  return made
}

/** What a theme makes of the pane: its family, its grounds (undefined: the terminal's own) and whether it is a light one; `pack` is the pack that said so, absent where the tables above did. */
export type Themed = { family: FamilyDef; ground: Ground | undefined; isLight: boolean; pack?: Pack }

/**
 * A theme as the packs read have it. The tables above stay the answer where no pack is the theme's
 * own: while the theme is not read yet, with no packs at all, and for one of our themes whose pack
 * was skipped or is gone. Neither the `default` pack nor a sibling's `match` takes it from them:
 * without kirby-pink.json, `kirby` would give Kirby Pink the green ground.
 */
export function themed(theme: string, packs: readonly Pack[] = []): Themed {
  const pack = resolve(theme, packs)
  const isOurs = pack !== undefined && pack.slug !== norm(theme) && groundOf(theme) !== undefined
  if (pack === undefined || isOurs || (pack.slug === 'default' && wantedOf(theme) !== 'clawd')) return { family: familyOf(theme), ground: groundOf(theme), isLight: isLightOf(theme) }
  // (A built-in light theme is served by the default pack, which is not a light one: its name says it.)
  const isLight = pack.isLight || (pack.slug === 'default' && /^light/i.test(theme.trim()))
  const ground: Ground | undefined = pack.background === null ? undefined : { terminal: pack.background, pane: pack.background, ...(isLight ? { isLight: true as const } : {}) }

  return { family: packFamily(pack), ground, isLight, pack }
}
