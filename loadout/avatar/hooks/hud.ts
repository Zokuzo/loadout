// The cyber family (the Ghostrunner and Cyberpunk Edgerunners themes), in text: Raijin, a cyber-oni mask drawn in characters, and the agents as
// HUD blocks. Both are grids of [glyph, foreground, background] cells for a Raster, swapped in
// place a frame at a time. Pure: a grid is derived from (skin, mood or agents, now) alone, so
// previews and tests draw what the pane draws.
import { FORMS } from './look'
import type { Form } from './look'
import type { Mood } from './mascot'
import { LEAVE_MS, actOf } from './stage'
import type { Act, Agent } from './stage'

/** The terminal's default colour, in a cell. */
export const NONE = 0x01000000

export type Variant = 'red' | 'yellow' | 'night' | 'chrome' | 'midnight' | 'cortana' | 'mjolnir'

/**
 * One skin's palette, 0xRRGGBB: the interface's one colour (`primary`), its lit edge, the mask's
 * `body` and `shadow`, the `dim` of captions and thin lines, `cyan` for what is live or selected,
 * `alert` (what must not be missed: never the skin's own hue), the colour of a `value` (money, a
 * count, what went well), and the near-black `tint` of a recess and `ink` of text on a filled bar.
 */
export type Skin = { variant: Variant; primary: number; bright: number; body: number; shadow: number; dim: number; cyan: number; alert: number; value: number; tint: number; ink: number }

/**
 * Red on red-black as the game's inventory is, and nothing but red, dark red and its light blue: a
 * count is a pale red, an alarm a hotter one (told by its stripes and its filled tag too, not by its
 * hue alone). Yellow on black as its HUD is, what one may do in its blue and an alarm in red. Cyan is the same in both.
 * Night is a mountain pass in a cel of the nineties: the street lamps' yellow-green on a teal-navy dark, captions in
 * moonlit blue-green, what is live in the fog lights' yellow, an alarm a tail light, a count the pink of dusk.
 * Chrome is a phone advert of the year 2000: cobalt on ice white, navy print, what is live in glass teal, a count in the violet of an oil film;
 * midnight is the same room with the lights off, periwinkle and aqua on blue-black. (On these two the pane's bars are shaded as polished metal: hudpane.tsx.)
 * Cortana is a hologram in the dark: the projector's blue on violet-black, what is live in violet, a count in orchid;
 * Mjolnir is the armour at night: its olive green on green-black, what is live in the visor's gold, a count in the blue of a shield bar.
 */
export const SKINS: Readonly<Record<Variant, Skin>> = {
  red: { variant: 'red', primary: 0xff6158, bright: 0xffb9ad, body: 0x6a1d22, shadow: 0x34101a, dim: 0xc0706a, cyan: 0x5ef6ff, alert: 0xff1f47, value: 0xffd2cb, tint: 0x1c080c, ink: 0x0b0306 },
  yellow: { variant: 'yellow', primary: 0xfcee0a, bright: 0xfffbb5, body: 0x7d7605, shadow: 0x3a3702, dim: 0xb0a707, cyan: 0x5ef6ff, alert: 0xff3d3d, value: 0x3aa0ff, tint: 0x121100, ink: 0x060600 },
  chrome: { variant: 'chrome', primary: 0x1c3fd6, bright: 0x0d1638, body: 0x9fb4d8, shadow: 0xd3dcec, dim: 0x5c6f94, cyan: 0x00857a, alert: 0xd81e2c, value: 0xa23bb5, tint: 0xe4eaf4, ink: 0xffffff },
  midnight: { variant: 'midnight', primary: 0x7da2ff, bright: 0xffffff, body: 0x2a3970, shadow: 0x18213f, dim: 0x8793b5, cyan: 0x5fe6d6, alert: 0xff5468, value: 0xd9a3ff, tint: 0x0b1126, ink: 0x050813 },
  cortana: { variant: 'cortana', primary: 0x6fb6ff, bright: 0xf2f8ff, body: 0x2c4a9a, shadow: 0x1a2458, dim: 0x7f8fc8, cyan: 0x8f7cff, alert: 0xff5470, value: 0xe08cff, tint: 0x0e0d28, ink: 0x070616 },
  mjolnir: { variant: 'mjolnir', primary: 0xa3b86c, bright: 0xeaf2c9, body: 0x4a5c2c, shadow: 0x222d17, dim: 0x86957a, cyan: 0xffb238, alert: 0xff4f3a, value: 0x74c7ff, tint: 0x121a12, ink: 0x080c08 },
  night: { variant: 'night', primary: 0xd2e04e, bright: 0xf4eeda, body: 0x1f5068, shadow: 0x122f48, dim: 0x6f9fb8, cyan: 0xffb52e, alert: 0xff4d3d, value: 0xf29a8e, tint: 0x0c2236, ink: 0x06121f },
}

export const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

/** `columns * rows` cells, row-major, three words each: a code point, a foreground, a background. */
export type Grid = { columns: number; rows: number; words: Uint32Array }

function blank(columns: number, rows: number): Grid {
  const words = new Uint32Array(columns * rows * 3).fill(NONE)
  for (let i = 0; i < words.length; i += 3) words[i] = 0x20

  return { columns, rows, words }
}

/** One cell; nothing lands outside the grid. An absent `bg` keeps the cell's. */
function put(grid: Grid, x: number, y: number, glyph: string, fg: number, bg?: number) {
  if (x < 0 || y < 0 || x >= grid.columns || y >= grid.rows) return
  const at = (y * grid.columns + x) * 3
  grid.words[at] = glyph.codePointAt(0) ?? 0x20
  grid.words[at + 1] = fg
  if (bg !== undefined) grid.words[at + 2] = bg
}

const write = (grid: Grid, x: number, y: number, text: string, fg: number, bg?: number) => [...text].forEach((ch, i) => put(grid, x + i, y, ch, fg, bg))

/** A grid's rows as text: what it says, colours aside. */
export const textOf = ({ columns, rows, words }: Grid): string[] =>
  Array.from({ length: rows }, (_row, y) => Array.from({ length: columns }, (_cell, x) => String.fromCodePoint(words[(y * columns + x) * 3]!)).join(''))

const channels = (color: number) => [(color >> 16) & 255, (color >> 8) & 255, color & 255] as const

/** `a` to `b`, `u` of the way; past 1 it stays `b`. */
export function mix(a: number, b: number, u: number): number {
  const q = Math.max(0, Math.min(1, u))
  const [x, y] = [channels(a), channels(b)]
  const at = (i: 0 | 1 | 2) => Math.round(x[i] + (y[i] - x[i]) * q)

  return (at(0) << 16) | (at(1) << 8) | at(2)
}

const WHITE = 0xffffff

/** A whole number from three, the same every time: what is random here is a function of where and when. */
function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)

  return (h ^ (h >>> 16)) >>> 0
}

const ease = (u: number) => u * u * (3 - 2 * u)
const unit = (u: number) => Math.max(0, Math.min(1, u))
const wave = (t: number, period: number) => Math.sin((2 * Math.PI * (t % period)) / period)

// --- the mask ----------------------------------------------------------------

export const MASK_COLUMNS = 29
export const MASK_ROWS = 16
/** The fewest rows a pane shows of it: the visor and what frames it. */
export const MASK_LEAST = 6

const HALF = 15 // a row is drawn as its left half, the middle column included, and mirrored
const VISOR = { x: 5, y: 6, columns: 19, rows: 2 } as const

/**
 * A row of the mask's left half, three layers of HALF characters: the glyphs; their inks; their
 * backgrounds. Inks: the armour's planes, k in shadow, m plain, l lit (each takes the light, from
 * the upper left: a full block half way between two tones is a shade of the one on the other); t the dark of
 * a recess, d a seam, r a rim, p primary, b bright, T bone; then what moves: V the visor, W the brow
 * over it, J a vent, C a cable, E the form's own light.
 */
type Row = readonly [glyphs: string, inks: string, grounds: string]

const row = (glyphs: string, inks: string, grounds = ''): Row => [glyphs.padEnd(HALF), inks.padEnd(HALF), grounds.padEnd(HALF)]

// From the brow down, the same for every form but its two rows of mouth: the helmet's rim and its
// wings, the visor under a brow that dips to the middle, its sill, the cheeks' vents either side of
// the nose guard, the mouth, the jaw, the chin, then the neck's cables inside a high collar whose
// wings rise at each side; a cable hangs from each cheek to it.
const BROW: readonly Row[] = [
  row('  ▗▄▄▄▄▄▄▄▄███┃', '  bbppppppplllb', '      mmmmm   l'),
  row('  ▝▀█      ▀▀▀▀', '  rrmVVVVVVWWWW'),
  row('    █', '    mVVVVVVVVVV'),
  row('    ▜▀▀▀▀▀▀▀▀▀▀', '    mrrrrrrrrrr', '     mmmmmmmmmm'),
  row('    ▐▜██≡≡≡█▗██', '    CmmmJJJklll', '        kkk k'),
]
const JAW: readonly Row[] = [
  row(' ▄  ▐   ▜██████', ' b  C   mmmmmmm'),
  row(' █▙▄▐    ▜█≡≡██', ' lmkC    mmJJmm', '           kk'),
  row(' ▜████▙▄▄  ▐│┃│', ' lmmmmkkk  kCdC', '            ttt'),
  row('  ▜██████▄▄▟███', '  mmmmmmkkkkrrr'),
]

// The mouth, two rows a form: what tells them apart below the visor. Where a form has teeth, `glad`
// is its grin (every upper tooth bared) and `grit` the lower row its jaw chatters to when worried;
// a grille has neither, and is told by its light alone.
type Mouth = { rest: readonly [Row, Row]; glad?: readonly [Row, Row]; grit?: Row }
const MOUTHS: Readonly<Record<Form, Mouth>> = {
  // Teeth that lock, a tusk standing at each corner.
  opus: {
    rest: [row('    ▐ ▜█▲ ▼ ▼ ▼', '    C mmT T T T', '        ttttttt'), row('    ▐  ▜█  ▲ ▲', '    C  mT  T T', '         tttttt')],
    glad: [row('    ▐ ▜█▲▼▼▼▼▼▼', '    C mmTTTTTTT', '        ttttttt'), row('    ▐  ▜█ ▲ ▲ ▲', '    C  mT T T T', '         tttttt')],
    grit: row('    ▐  ▜█ ▲ ▲ ▲', '    C  mT T T T', '         tttttt'),
  },
  // A grille of bars.
  sonnet: { rest: [row('    ▐ ▜██▌ ▌ ▌', '    C mmmT T T', '         tttttt'), row('    ▐  ▜█▌ ▌ ▌', '    C  mmT T T', '         tttttt')] },
  // A speaker's mesh.
  haiku: { rest: [row('    ▐ ▜██▚▚▚▚▚▚', '    C mmmdddddd', '         tttttt'), row('    ▐  ▜█▚▚▚▚▚▚', '    C  mmdddddd', '         tttttt')] },
  // Two full rows of needles.
  fable: {
    rest: [row('    ▐ ▜█▲▼▼▼▼▼▼', '    C mmTTTTTTT', '        ttttttt'), row('    ▐  ▜█▲▲▲▲▲▲', '    C  mTTTTTTT', '         tttttt')],
    grit: row('    ▐  ▜█▲ ▲ ▲', '    C  mTT T T', '         tttttt'),
  },
}
const MOUTH_Y = 10 // the mouth's two rows: under the crown's five and the brow's five

const DOME = row('      ▗▟·█╱█·█┃', '      lldmdmdmb', '        m m m l')

// The crown, five rows a form: what tells them apart at a glance.
const CROWNS: Readonly<Record<Form, readonly Row[]>> = {
  // Two horns swept up and out.
  opus: [
    row(' ▄', ' b'),
    row(' █▙', ' bp'),
    row(' ▜█▙      ▗▄▄▄▄', ' bpp      lllll'),
    row('  ▜██▙  ▗▟█╱██┃', '  bppr  llmdmmb', '           m  l'),
    row('    ▜███·█╱█·█┃', '    prmmdmdmdmb', '        m m m l'),
  ],
  // A crescent blade across the brow, its points high over the helmet.
  sonnet: [
    row('     ▖', '     b'),
    row('     ▜▙', '     bb'),
    row('      ▜█▄ ▗▄▄▄▄', '      bbp lllll'),
    row('        ▜██▄▄▄█', '        bppppbb', '           mmm'),
    DOME,
  ],
  // No horns: an aerial at each temple, its tip a light.
  haiku: [
    row('       ▄', '       E'),
    row('       ┃', '       d'),
    row('       ┃  ▗▄▄▄▄', '       d  lllll'),
    row('       ┃▗▟█╱██┃', '       dllmdmmb', '           m  l'),
    DOME,
  ],
  // A halo over three spikes, and a third eye.
  fable: [
    row('        ▄▄▀▀▀▀▀', '        EEEEEEE'),
    row('         ▄    ▄', '         p    b'),
    row('         █▗▄▄▄█', '         pllllb'),
    row('        ▗▟█╱██◆', '        llmdmmE', '           m  m'),
    DOME,
  ],
}

/** The mask's name, by model. */
export const NAMES: Readonly<Record<Form, string>> = { opus: 'Raijin', sonnet: 'Raijin Tachi', haiku: 'Raijin Ping', fable: 'Raijin Oracle' }

const MIRRORS = '╱╲▌▐▙▟▛▜▖▗▘▝▚▞▏▕'
const mirrored = (glyph: string): string => {
  const at = MIRRORS.indexOf(glyph)

  return at < 0 ? glyph : MIRRORS[at ^ 1]!
}

/** An armour plane's tone, before the light: an index into the ramp from the recess's dark to the rim. */
const LEVELS: Readonly<Record<string, number>> = { k: 1, m: 2, l: 3 }

/** How much more (or less) lit a cell of the mask is than its plane: the light is up and to the left. */
const lightAt = (x: number, y: number): number => 1.4 - 2.6 * (x / (MASK_COLUMNS - 1)) - 0.3 * (y / (MASK_ROWS - 1))

// An eye, five cells over the visor's two rows, outer end first: the top row's glyphs, then the bottom's.
type Eye = readonly [top: string, bottom: string]
const EYES: Readonly<Record<'open' | 'half' | 'shut' | 'focus' | 'glad' | 'afraid', Eye>> = {
  open: ['▆▅▃▂▁', '▀▀▀▀▀'], // a wedge, thick at the temple: a glare
  half: ['▂▂▁  ', '▀▀▀▀▀'],
  shut: ['     ', '▔▔▔▔▔'],
  focus: ['▃▃▂▂▁', '▀▀▀▀▀'],
  glad: ['▗▄▄▄▖', '▘   ▝'], // a thin arc, narrowed by a grin
  afraid: ['▁▂▃▅▆', '▀▀▀▀▀'], // the wedge the other way: brows up
}
// Ping has one optic, seven cells, in the middle of its visor.
const OPTICS: Readonly<Record<keyof typeof EYES, Eye>> = {
  open: ['▂▄▆█▆▄▂', '▔▀▀▀▀▀▔'],
  half: [' ▂▃▄▃▂ ', '▔▀▀▀▀▀▔'],
  shut: ['       ', ' ▔▔▔▔▔ '],
  focus: ['▁▃▅▆▅▃▁', '▔▀▀▀▀▀▔'],
  glad: ['▗▄▄▄▄▄▖', '▘     ▝'],
  afraid: ['▁▂▅█▅▂▁', ' ▀▀▀▀▀ '],
}

const FRAME_MS = 90
const BLINK_EVERY = 4000
const HEX = '0123456789ABCDEF'
/**
 * A tear: every so many frames (0 for never), for one frame, a band of `rows` rows slips `by` cells
 * aside. A worried mask tears twice as often, and wider.
 */
const TEARS: Readonly<Record<Mood, { every: number; rows: number; by: number }>> = {
  idle: { every: 64, rows: 3, by: 2 }, worried: { every: 32, rows: 4, by: 3 }, working: { every: 0, rows: 0, by: 0 }, happy: { every: 0, rows: 0, by: 0 },
}
/** Which frame of those it is: never the first, so no loop (and no still) opens on a tear. */
const TEAR_AT = 11

/** Which eye the mask has at `now`: the mood's, and idle a blink through half shut. */
function eyeOf(mood: Mood, now: number): keyof typeof EYES {
  const left = BLINK_EVERY - (now % BLINK_EVERY)
  if (mood === 'idle' && left <= 4 * FRAME_MS) return left > 3 * FRAME_MS || left <= FRAME_MS ? 'half' : 'shut'

  return mood === 'working' ? 'focus' : mood === 'happy' ? 'glad' : mood === 'worried' ? 'afraid' : 'open'
}

/** Where the mask looks, in cells from the middle of its eye: left, at the conversation, with a glance ahead now and then; the move is eased. */
function gazeAt(mood: Mood, now: number): number {
  if (mood !== 'idle') return mood === 'working' ? 1.2 * wave(now, 2400) : 0
  const v = now % 7200
  const ahead = v < 5200 ? 0 : v < 5600 ? ease((v - 5200) / 400) : v < 6800 ? 1 : 1 - ease((v - 6800) / 400)

  return -1.4 + 1.6 * ahead
}

/** How many columns a row is torn aside at `now`, 0 for nearly all: the rows of one band slip together, for one frame. */
function tearOf(mood: Mood, y: number, now: number): number {
  const { every, rows, by } = TEARS[mood]
  const k = Math.floor(now / FRAME_MS)
  if (every === 0 || k % every !== TEAR_AT) return 0
  const spell = Math.floor(k / every)
  const first = hash(spell, 3, 5) % (MASK_ROWS - rows + 1)

  return y >= first && y < first + rows ? (hash(spell, 7, 9) % 2 === 0 ? by : -by) : 0
}

// A shorter box drops rows: first the collar and the neck (the mask then ends on its jaw, as a
// bust), then two rows of the crown its shape reads without (a horn keeps its tip and stays in one
// piece) and the cheeks between them. Shorter still, a bust without its crown, each drawn whole:
// the mouth is all there or not there, and the last row is always the jaw.
const JAW_Y = 12
const CROWN_DROPS: Readonly<Record<Form, readonly [number, number]>> = { opus: [1, 2], sonnet: [0, 1], haiku: [1, 2], fable: [1, 2] }
const BUSTS: Readonly<Record<number, readonly number[]>> = {
  9: [4, 5, 6, 7, 8, 9, 10, 11, JAW_Y], 8: [4, 5, 6, 7, 8, 10, 11, JAW_Y], 7: [5, 6, 7, 8, 10, 11, JAW_Y], 6: [4, 5, 6, 7, 8, JAW_Y],
}

/** The rows of the mask a box of `rows` shows of a form, top to bottom. */
function keptOf(form: Form, rows: number): readonly number[] {
  const drops = [15, 14, 13, CROWN_DROPS[form][0], 9, CROWN_DROPS[form][1]].slice(0, Math.max(0, MASK_ROWS - rows))

  return rows >= 10 ? Array.from({ length: MASK_ROWS }, (_row, y) => y).filter(y => !drops.includes(y)) : BUSTS[rows] ?? [5, 6, 7, 8].slice(0, rows)
}

/**
 * One frame of the mask, `columns` by `rows` cells: the mask in the middle (a bust, `keptOf`, where
 * `rows` is fewer than its own), and in the columns left at each side, binary digits, one of
 * which changes now and then, and plus marks, faint.
 *
 * Idle its glow breathes, a scan line sweeps the visor, its eyes glow, look left and blink, its
 * vents shimmer, and a band of rows tears aside now and then. Working, hex runs between narrowed
 * eyes, the vents, the cables and the mouth pulse and the scan quickens. Happy its edges and teeth
 * flare in beats (the armour keeps its shading), its eyes narrow to arcs over a grin, sparks light
 * up between the horns. Worried its eyes widen round a "!", its edges pulse in the alert colour,
 * its jaw chatters, and it tears more often and wider.
 */
export function maskFrame(skin: Skin, form: Form, mood: Mood, now: number, columns = MASK_COLUMNS, rows = MASK_ROWS): Grid {
  const whole = blank(MASK_COLUMNS, MASK_ROWS)
  const k = Math.floor(now / FRAME_MS)
  const breath = 0.5 + 0.5 * wave(now, mood === 'working' ? 1400 : 3200)
  const beat = mood === 'happy' ? (1 - unit((now % 1440) / 900)) ** 2 : 0 // a flare that decays, every beat
  const alarm = mood === 'worried' ? 0.5 + 0.5 * wave(now, 1440) : 0
  const glow = (color: number) => mix(color, skin.primary, 0.1 * breath)
  // A flare lights what is already lit (edges, bone), never the armour's planes: its shading stays.
  const flare = (color: number) => mix(glow(color), skin.bright, 0.6 * beat)
  // The armour's tones, dark to light; a plane's level and the light on it pick between two of them.
  const ramp = [skin.tint, skin.shadow, skin.body, mix(skin.body, skin.primary, 0.42), mix(skin.body, skin.primary, 0.8)].map(glow)
  const levelOf = (mark: string, light: number) => Math.max(0.75, Math.min(4, LEVELS[mark]! + light))
  const toneAt = (level: number) => mix(ramp[Math.min(3, Math.floor(level))]!, ramp[Math.min(3, Math.floor(level)) + 1]!, level - Math.min(3, Math.floor(level)))
  // An edge: its own colour, dimmer on the side away from the light, and the alert's as an alarm swells.
  const edge = (color: number, light: number) => flare(mix(mix(color, skin.alert, 0.7 * alarm), skin.body, Math.max(0, -light) * 0.6))
  const steady: Record<string, number> = { t: skin.tint, T: mix(glow(skin.bright), WHITE, 0.6 * beat), E: mix(skin.dim, mood === 'worried' ? skin.alert : skin.value, 0.35 + 0.65 * (0.5 + 0.5 * wave(now, 1100))) }
  const edges: Record<string, number> = { d: mix(skin.shadow, skin.dim, 0.75), r: mix(skin.body, skin.primary, 0.7), p: skin.primary, b: skin.bright }

  // The mask itself: each row's left half, and its mirror.
  const mouth = MOUTHS[form]
  const isGritted = mood === 'worried' && k % 6 < 2
  const [mouthTop, mouthBottom] = mood === 'happy' && mouth.glad !== undefined ? mouth.glad : [mouth.rest[0], isGritted ? mouth.grit ?? mouth.rest[1] : mouth.rest[1]]
  const rowsOf = [...CROWNS[form], ...BROW, mouthTop, mouthBottom, ...JAW]
  // The dark of the mouth: a cyan pulse at work, the alert's as an alarm swells.
  const throat = mood === 'working' ? mix(skin.tint, skin.cyan, 0.08 + 0.22 * (0.5 + 0.5 * wave(now, 720))) : mix(skin.tint, skin.alert, 0.16 * alarm)
  rowsOf.forEach(([glyphs, marks, grounds], y) => {
    for (let i = 0; i < HALF; i++) {
      const [mark, ground] = [marks[i]!, grounds[i]!]
      if ((mark === ' ' && ground === ' ') || mark === 'V' || mark === 'W') continue
      for (const x of i === HALF - 1 ? [i] : [i, MASK_COLUMNS - 1 - i]) {
        const glyph = x === i ? glyphs[i]! : mirrored(glyphs[i]!)
        const light = lightAt(x, y)
        const inkOf = (one: string): number | undefined => (one in LEVELS ? toneAt(levelOf(one, light)) : one in edges ? edge(edges[one]!, light) : steady[one])
        const bg = ground === ' ' ? NONE : ground === 't' && (y === MOUTH_Y || y === MOUTH_Y + 1) ? throat : inkOf(ground) ?? NONE
        if (glyph === '█' && mark in LEVELS) {
          // A full block of armour: where its tone falls half way between two of the ramp's, a shade of the lighter on the darker.
          const level = levelOf(mark, light)
          const lo = Math.min(3, Math.floor(level))
          const part = level - lo
          put(whole, x, y, part < 0.3 || part >= 0.7 ? '█' : '▒', ramp[part < 0.3 ? lo : lo + 1]!, ramp[lo]!)
          continue
        }
        // A vent's light runs outward along it at work, and shimmers otherwise, bar after bar.
        const vent = mood === 'working' ? 0.5 + 0.5 * wave(now + i * 130, 620) : 0.3 + 0.5 * (0.5 + 0.5 * wave(now + i * 420 + y * 300, 2600))
        // A cable carries a pulse down it: quick and bright at work, slow and faint idle.
        const pulse = (mood === 'working' ? 1 : mood === 'idle' ? 0.45 : 0) * unit(1 - Math.abs(((now / (mood === 'working' ? 110 : 420) + i * 3) % 14) - (y - 4)) / 1.5)
        const fg = mark === 'J' ? glow(mix(skin.shadow, mood === 'working' ? skin.cyan : skin.primary, vent)) : mark === 'C' ? mix(edge(edges.d!, light), skin.cyan, pulse) : inkOf(mark) ?? skin.primary
        put(whole, x, y, glyph, fg, bg)
      }
    }
  })

  // The visor: a dark recess, darker still under the brow, a scan line's glow passing over it, and in it the eyes.
  const sweep = mood === 'working' ? 900 : 2600
  const pass = (now % (2 * sweep)) / sweep
  const scanAt = VISOR.columns * ease(pass < 1 ? pass : 2 - pass) - 0.5
  const recess = mood === 'worried' ? mix(skin.tint, skin.alert, 0.06 + 0.08 * alarm) : mix(skin.tint, skin.cyan, 0.06 + 0.1 * beat)
  const nearAt = (i: number) => Math.exp(-((i - scanAt) ** 2) / 3)
  for (let j = 0; j < VISOR.rows; j++) {
    for (let i = 0; i < VISOR.columns; i++) put(whole, VISOR.x + i, VISOR.y + j, ' ', NONE, mix(mix(recess, skin.cyan, 0.3 * nearAt(i)), 0, j === 0 ? 0.35 : 0))
  }
  // At work, hex runs between the eyes (either side of Ping's one), a cell clear of them, a digit every other frame.
  if (mood === 'working') {
    for (const i of form === 'haiku' ? [1, 2, 3, 4, 14, 15, 16, 17] : [7, 8, 9, 10, 11]) {
      put(whole, VISOR.x + i, VISOR.y + 1, HEX[hash(i + (k >> 1), 3, 17) % 16]!, mix(skin.tint, skin.cyan, 0.7 + 0.3 * nearAt(i)))
    }
  }
  // The brow dips over the visor's middle: its glow shows under it.
  rowsOf.forEach(([glyphs, marks], y) => {
    for (let i = 0; i < HALF; i++) if (marks[i] === 'W') for (const x of [i, MASK_COLUMNS - 1 - i]) put(whole, x, y, glyphs[i]!, edge(skin.primary, lightAt(x, y)))
  })
  const eye = eyeOf(mood, now)
  const gaze = gazeAt(mood, now)
  const iris = mood === 'worried' ? mix(skin.alert, WHITE, 0.2 + 0.3 * alarm) : mood === 'happy' ? mix(skin.cyan, WHITE, 0.35 + 0.5 * beat) : skin.cyan
  // Idle, the eyes' own light swells and ebbs.
  const ember = mood === 'idle' ? 0.3 * (0.5 + 0.5 * wave(now, 1800)) : 0
  const drawEye = ([top, bottom]: Eye, x: number, isMirrored: boolean) => {
    const wide = top.length
    ;[top, bottom].forEach((cells, j) => {
      for (let i = 0; i < wide; i++) {
        const glyph = cells[isMirrored ? wide - 1 - i : i]!
        if (glyph === ' ') continue
        // The pupil is the brightest of it, and glides between cells; an arch is lit all along.
        const pupil = eye === 'glad' ? 0.7 : eye === 'shut' ? 0 : unit(1 - Math.abs(i - (wide - 1) / 2 - gaze) / 1.3)
        put(whole, x + i, VISOR.y + j, isMirrored ? mirrored(glyph) : glyph, mix(mix(iris, skin.tint, eye === 'glad' ? 0 : 0.3), WHITE, unit(0.75 * pupil + ember)))
      }
    })
  }
  if (form === 'haiku') drawEye(OPTICS[eye], VISOR.x + 6, false)
  else {
    drawEye(EYES[eye], VISOR.x + 1, false)
    drawEye(EYES[eye], VISOR.x + VISOR.columns - 6, true)
  }
  const middle = VISOR.x + (VISOR.columns >> 1)
  // Between the eyes, afraid: a "!" in a filled box.
  if (mood === 'worried' && form !== 'haiku') {
    const isOn = k % 12 < 8
    put(whole, middle, VISOR.y + 1, '!', isOn ? skin.ink : skin.alert, isOn ? skin.alert : undefined)
  }

  // Happy: sparks light up between the horns, over the crown, each held where it is while it swells and fades.
  if (mood === 'happy') {
    for (let n = 0; n < 6; n++) {
      const [spell, age] = [Math.floor((k + n * 5) / 16), (k + n * 5) % 16]
      const [x, y] = [3 + (hash(n, spell, 41) % (MASK_COLUMNS - 6)), hash(n, spell, 43) % 2]
      const at = (y * MASK_COLUMNS + x) * 3
      if (age < 12 && whole.words[at] === 0x20 && whole.words[at + 2] === NONE) put(whole, x, y, '·+*+'[Math.floor(age / 3)]!, mix(skin.cyan, WHITE, age >= 3 && age < 9 ? 0.75 : 0.2))
    }
  }

  // A torn band: its rows slid aside together, as a signal splits. Where a row has moved onto empty
  // cells it is cyan; where it has left the mask, the mask stays, in its plain colour: no hole opens in it.
  const torn = blank(MASK_COLUMNS, MASK_ROWS)
  const cellAt = (x: number, y: number) => {
    const from = (y * MASK_COLUMNS + x) * 3
    const [glyph, fg, bg] = [whole.words[from]!, whole.words[from + 1]!, whole.words[from + 2]!]

    return x < 0 || x >= MASK_COLUMNS || (glyph === 0x20 && bg === NONE) ? undefined : { glyph: String.fromCodePoint(glyph), fg, bg }
  }
  for (let y = 0; y < MASK_ROWS; y++) {
    const dx = tearOf(mood, y, now)
    for (let x = 0; x < MASK_COLUMNS; x++) {
      const [moved, stayed] = [cellAt(x - dx, y), cellAt(x, y)]
      if (moved !== undefined) put(torn, x, y, moved.glyph, stayed === undefined ? skin.cyan : moved.fg, stayed === undefined ? NONE : moved.bg)
      else if (stayed !== undefined) put(torn, x, y, stayed.glyph, skin.primary, stayed.bg)
    }
  }

  // Into its box: the rows a box this tall shows, centred, the margins' digits beside it.
  const grid = blank(columns, rows)
  const kept = keptOf(form, rows)
  const isBust = !kept.includes(JAW_Y + 2)
  const left = (columns - MASK_COLUMNS) >> 1
  kept.forEach((from, y) => {
    for (let x = 0; x < MASK_COLUMNS; x++) {
      // A bust ends on the jaw alone: what hangs beside it there (the cables, the collar's tips) goes with the collar.
      if (isBust && from >= JAW_Y && (x < 8 || x > MASK_COLUMNS - 9)) continue
      const at = (from * MASK_COLUMNS + x) * 3
      put(grid, left + x, y, String.fromCodePoint(torn.words[at]!), torn.words[at + 1]!, torn.words[at + 2]!)
    }
  })
  // Still, as the game's margins are: of all these digits one changes at a time, a little oftener at work.
  const xs = left >= 4 ? [0, 1, columns - 2, columns - 1] : left >= 2 ? [0, columns - 1] : []
  const count = xs.length * rows
  const step = Math.floor(now / (mood === 'working' ? 360 : 810))
  xs.forEach((x, n) => {
    for (let y = 0; y < rows; y++) {
      const turn = Math.floor((step + (((n * rows + y) * 7) % count)) / count)
      const isMark = (y + (n >= xs.length / 2 ? 2 : 0)) % 5 === 2 && (x === 0 || x === columns - 1)
      put(grid, x, y, isMark ? '+' : hash(x, y, turn) % 2 === 0 ? '0' : '1', mix(skin.tint, skin.dim, isMark ? 0.5 : 0.3))
    }
  })

  return grid
}

// --- the agents --------------------------------------------------------------

/** What a block says its agent is at: between calls, one per kind of tool, then a failed call, and its end, stopped or finished. */
export type State = 'think' | 'scan' | 'edit' | 'exec' | 'net' | 'call' | 'load' | 'ask' | 'tool' | 'fail' | 'halt' | 'done'

export const STATES: Readonly<Record<Exclude<Act, 'exit'>, State>> = {
  idle: 'think', inhale: 'scan', sword: 'edit', dash: 'exec', ride: 'net', call: 'call', sparkle: 'load', ask: 'ask', hop: 'tool',
  hurt: 'fail', dazed: 'fail', dance: 'done', faint: 'halt',
}

/** The state of an agent at `now`, from what it really does: the stage's acts, told as a HUD tells them. */
export function stateOf(agent: Agent, now: number): State {
  const act = actOf(agent, now)

  return act === 'exit' ? (agent.isLost === true ? 'halt' : 'done') : STATES[act]
}

export const TAGS: Readonly<Record<State, string>> = {
  think: 'THNK', scan: 'SCAN', edit: 'EDIT', exec: 'EXEC', net: 'NET', call: 'CALL', load: 'LOAD', ask: 'ASK', tool: 'TOOL', fail: 'FAIL', halt: 'HALT', done: 'DONE',
}

// A state's little figure, three cells, a frame every two of the clock's: each state its own motion.
// None fills its cell top to bottom: on a block of one row, a figure never runs into the one under it.
// Every frame has a glyph lit, and what a figure is anchored on (a prompt, a dot, a "?") keeps its cell.
const ICONS: Readonly<Record<State, readonly string[]>> = {
  think: ['•··', '·•·', '··•', '·•·'], // a thought going to and fro
  scan: ['■□□', '□■□', '□□■', '□■□'], // a head sweeping a track
  edit: ['╺  ', '━╸ ', '━━╸', '━━━', '━━╸', '━╸ '], // a line written and taken back
  exec: ['>_ ', '>  ', '>_ ', '>>_', '>>>', '>>·', '>··'], // a prompt, then it runs
  net: ['·  ', '·) ', '·))', '•))', '• )', '•  '], // a signal going out
  call: ['>--', '->-', '-->', '--<', '-<-', '<--'], // a message there and back
  load: ['[|]', '[/]', '[-]', '[\\]'], // a chip spinning up
  ask: [' ? ', '·?·', '•?•', '·?·'], // a question waiting
  tool: ['▖··', '▘▖·', '·▘▖', '··▘', '···'], // a pulse stepping through
  fail: ['×!×', '!×!', '×!×', '! !'], // broken up
  halt: ['■■■', '■■□', '■□□', '□□□', '□□□', '□□□'], // going dark
  done: ['▁  ', '▁▃ ', '▁▃▆', ' ✓ ', ' ✓ ', '·✓·', ' ✓ ', ' ✓ '], // bars rising to a tick
}

/** What the blocks need of a subagent besides its times: its task, and what each running call is about. */
export type Runner = Omit<Agent, 'calls'> & { label: string; calls: readonly { tool: string; summary: string }[] }

/** A model as a block tags it, three letters at the right end of the agent's line. */
export const MODEL_TAGS: Readonly<Record<Form, string>> = { opus: 'OPS', sonnet: 'SNT', haiku: 'HKU', fable: 'FBL' }

/** The tag of the model an agent runs on; none while nobody told, or for a model of no known family. */
export const modelTag = (model: string | undefined): string => {
  const form = FORMS.find(one => (model ?? '').toLowerCase().includes(one))

  return form === undefined ? '' : MODEL_TAGS[form]
}

/** As many agents as get a block of their own; more are counted on a last line. */
export const BLOCKS_MAX = 5

/** How many rows the blocks of `alive` agents take of `room`: two a block where all fit so, else one, the last one counting those left out. */
export const blockRowsOf = (alive: number, room: number): number =>
  alive <= BLOCKS_MAX && room >= 2 * alive ? 2 * alive : Math.max(0, Math.min(Math.min(alive, BLOCKS_MAX) + (alive > BLOCKS_MAX ? 1 : 0), room))

/** Text a cell can hold: a width-1 character each, anything else a "?". */
const plain = (text: string): string =>
  [...text.replace(/\s+/g, ' ')].map(ch => {
    const code = ch.codePointAt(0)!

    return (code >= 0x20 && code < 0x7f) || (code >= 0xa1 && code < 0x250 && code !== 0xad) ? ch : '?'
  }).join('')

const cut = (text: string, width: number): string => (text.length <= width ? text : width < 1 ? '' : `${text.slice(0, width - 1)}…`)

/**
 * The agents' blocks, `columns` by `rows` cells, as the game lays out what one may answer: down the
 * left edge a bar, a three-cell figure acting out its state, the state as a bracketed tag, its task;
 * all three in the state's colour (live, failed, stopped, finished), never one of the agent's own that
 * could be taken for a state. Under it, where the rows allow two a block, the agent's number, the
 * running tool and what it is about; on one row, the number first, and the tool at the right end,
 * the task taking all the row leaves it. The model it runs on, where that is known, is a short tag at the right
 * end of its first row (on a block of one row, where no tool is named there). An agent that ended fades out; agents past the rows are a "+N MORE"
 * (on a single row, the first agent alone).
 */
export function agentRows(skin: Skin, crew: readonly Runner[], now: number, columns: number, rows: number): Grid {
  const grid = blank(columns, rows)
  const per = crew.length <= BLOCKS_MAX && rows >= 2 * crew.length ? 2 : 1
  // More agents than rows: the last row counts those left out; a single row names the first instead (the rule over the blocks has the count).
  const fit = per === 2 ? crew.length : crew.length > BLOCKS_MAX || crew.length > rows ? Math.max(Math.min(1, rows), Math.min(BLOCKS_MAX, rows - 1)) : crew.length
  const shown = crew.slice(0, fit)
  const toolOf = (agent: Runner) => plain((agent.calls[agent.calls.length - 1]?.tool ?? '').replace(/^mcp__/, ''))
  shown.forEach((agent, n) => {
    const y = n * per
    const state = stateOf(agent, now)
    // An ended agent goes out over its stay.
    const gone = agent.doneAt === undefined ? 0 : 0.75 * ease(unit((now - agent.doneAt - LEAVE_MS / 2) / (LEAVE_MS / 2)))
    const faded = (color: number) => mix(color, skin.tint, gone)
    const frames = ICONS[state]
    const since = state === 'done' && agent.doneAt !== undefined ? Math.min(frames.length - 1, Math.floor((now - agent.doneAt) / (2 * FRAME_MS))) : Math.floor((now + agent.slot * 370) / (2 * FRAME_MS)) % frames.length
    const tone = state === 'fail' ? skin.alert : state === 'halt' ? skin.dim : state === 'done' ? skin.value : skin.cyan
    const call = agent.calls[agent.calls.length - 1]
    const tool = toolOf(agent)
    for (let j = 0; j < per; j++) put(grid, 0, y + j, '▌', faded(tone))
    // The agent's number: under its figure, or before it on a block of one row.
    const number = String(agent.slot + 1).padStart(2, '0')
    const at = per === 2 ? 2 : 5
    write(grid, at, y, frames[since]!, faded(tone))
    // A failed call's tag is filled, and blinks: it is the one to see.
    const isFilled = state === 'fail' && Math.floor(now / (4 * FRAME_MS)) % 2 === 0
    write(grid, at + 4, y, `[${TAGS[state]}]`, isFilled ? skin.ink : faded(tone), isFilled ? skin.alert : undefined)
    const from = at + 6 + TAGS[state].length + 1
    const label = plain(agent.label)
    write(grid, 2, y + per - 1, number, faded(mix(skin.tint, skin.dim, 0.7)))
    const model = modelTag(agent.model)
    if (per === 2) {
      write(grid, from, y, cut(label === '' ? 'agent' : label, columns - from - (model === '' ? 0 : model.length + 1)), faded(skin.bright))
      write(grid, columns - model.length, y, model, faded(skin.dim))
      const about = call === undefined ? (state === 'fail' ? 'a call failed' : state === 'done' ? 'finished' : state === 'halt' ? 'stopped' : 'thinking') : plain(call.summary)
      write(grid, 6, y + 1, cut(tool, columns - 6), faded(skin.primary))
      write(grid, 6 + (tool === '' ? 0 : tool.length + 1), y + 1, cut(about, columns - 6 - (tool === '' ? 0 : tool.length + 1)), faded(skin.dim))
    } else {
      // The tool at the right end, a third of the row at the most; the task has the rest, all of it where no tool runs.
      const named = tool === '' ? model : cut(tool, Math.floor(columns / 3))
      write(grid, from, y, cut(label === '' ? 'agent' : label, columns - from - (named === '' ? 0 : named.length + 1)), faded(skin.bright))
      write(grid, columns - named.length, y, named, faded(tool === '' ? skin.dim : skin.primary))
    }
  })
  if (fit < crew.length && fit * per < rows) {
    put(grid, 0, fit * per, '▌', skin.dim)
    write(grid, 2, fit * per, cut(`+${crew.length - fit} MORE`, columns - 2), skin.dim)
  }

  return grid
}
