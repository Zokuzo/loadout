// The stage's sprites, in the palette-indexed rows of forms.ts ('.' transparent), all drawn
// facing right. Mini Kirby's silhouette, face and jump are the 8x8 "mini" Kirby of Kirby's
// Adventure (NES) at native size; his shading, feet and other poses, mini Clawd, the
// flying enemy and the effects are hand-pixelled to match.
import { decode } from './forms'
import type { Family, Form, Pixels } from './look'

export type Pose = 'stand' | 'blink' | 'walk1' | 'walk2' | 'jump' | 'hurt' | 'dazed' | 'flat' | 'half' | 'thin' | 'duck' | 'gulp1' | 'gulp2' | 'cheer' | 'cheer2'
export type Mini = Readonly<Record<Pose, Pixels>>

/** A mini's width in pixels; every frame of a family has it. */
export const MINI_WIDTH: Record<Family, number> = { kirby: 8, clawd: 9 }

/** A mini's height stood up, bare-headed. */
export const BODY_ROWS: Record<Family, number> = { kirby: 8, clawd: 7 }

/** The column, from a mini's left edge, of the hand that holds its sword: the first one free ahead of its body. */
export const REACH = 8

/** The row, from a standing mini's top, of that hand. */
export const HAND_ROW: Record<Family, number> = { kirby: 3, clawd: 2 }

/**
 * The colours an agent's mini is swapped to, by colour slot, as the games swap players 2 to 4
 * and then others: the body's light and shade, the feet, the shine on the head.
 */
export const SWAPS: readonly (readonly [light: number, shade: number, feet: number, shine: number])[] = [
  [0xffe066, 0xe8a020, 0xf0502c, 0xfff6c0], // yellow, red feet
  [0x7cc4ff, 0x3d84e0, 0x4a5cf0, 0xd0ecff], // blue, deep blue feet
  [0x8cf08c, 0x34b050, 0xf08a2e, 0xd8ffd0], // green, orange feet
  [0xc9a2ff, 0x8a5ce0, 0xff62b0, 0xeedcff], // purple, pink feet
  [0xdfe2f6, 0x9aa2d0, 0x7a86c8, 0xfafaff], // white, a shade off it so it has a body on a light ground too; slate feet
  [0x4fe0d0, 0x1f9f98, 0xe8c040, 0xc4fff4], // teal, yellow feet
  [0xf0566a, 0xa82844, 0xf4a038, 0xffc0c8], // crimson, amber feet
]

/** An open mouth, on any body colour. */
export const MOUTH = 0xc8283c

// Mini Kirby: 0 outline, 1 body, 2 body shade, 3 feet, 4 mouth, 5 shine. Lit from the top left, as the mascot is.
const KIRBY_INKS = [0x000000, 0, 0, 0, 0xb61f36, 0]
const HEAD = ['..0000..', '.051110.', '01111110', '01101010', '01101020']
const FEET = ['03300330', '.00..00.']
const KIRBY: Record<Pose, readonly string[]> = {
  stand: [...HEAD, '.011220.', ...FEET],
  blink: ['..0000..', '.051110.', '01111110', '01111110', '01101020', '.011220.', ...FEET],
  // A step is the feet alone: apart, then together.
  walk1: [...HEAD, '.011220.', '33000033', '00....00'],
  walk2: [...HEAD, '.011220.', '.003300.', '...00...'],
  jump: ['..0000..', '.051110.', '01101010', '01101010', '00111200', '03011030', '.030030.', '..0000..'],
  // Knocked over, feet up and mouth open.
  hurt: ['.00..00.', '03300330', '.011410.', '01101010', '01101020', '01111120', '.011220.', '..0000..'],
  // Sat down in a heap: eyes half shut, mouth open, feet apart.
  dazed: ['........', '..0000..', '.051110.', '01111110', '01101020', '.011420.', '33000033', '00....00'],
  // Out for the count: on his back, as knocked over.
  flat: ['.00..00.', '03300330', '.011410.', '01101010', '01101020', '01111120', '.011220.', '..0000..'],
  // A spin: half turned, then edge on.
  half: ['...00...', '..0510..', '.011110.', '.011010.', '.011020.', '..0120..', '..0330..', '...00...'],
  thin: ['...00...', '..0510..', '..0110..', '..0110..', '..0120..', '..0120..', '..0330..', '...00...'],
  duck: ['.000000.', '01101010', '01111120', ...FEET],
  gulp1: ['..0000..', '.051110.', '01101110', '01101440', '01111440', '.011220.', ...FEET],
  gulp2: ['..0000..', '.051110.', '01101440', '01101444', '01111440', '.011220.', ...FEET],
  // The end of the dance: hands up and mouth open, then a wink on tiptoe with the hands higher.
  cheer: ['..0000..', '10511101', '01111110', '01101010', '01101020', '.011420.', ...FEET],
  cheer2: ['1.0000.1', '.051110.', '01111110', '01111010', '01101020', '.011420.', '.003300.', '...00...'],
}

// Mini Clawd: 0 body, 1 eyes, 2 his mouth, open.
const CLAWD_INKS = [0, 0x2a1a14, MOUTH]
const CLAWD_TOP = ['.0000000.', '.0001010.', '000010100', '.0000000.', '.0000000.']
const CLAWD: Record<Pose, readonly string[]> = {
  stand: [...CLAWD_TOP, '.0.0.0.0.', '.0.0.0.0.'],
  blink: ['.0000000.', '.0000000.', '000010100', '.0000000.', '.0000000.', '.0.0.0.0.', '.0.0.0.0.'],
  walk1: [...CLAWD_TOP, '.0.0.0.0.', '.0...0...'],
  walk2: [...CLAWD_TOP, '.0.0.0.0.', '...0...0.'],
  jump: ['0.......0', '.0000000.', '.0001010.', '.0001010.', '.0000000.', '.0000000.', '.0.0.0.0.'],
  hurt: ['.0.0.0.0.', '.0.0.0.0.', '.0000000.', '.0000000.', '000101000', '.0010100.', '.0000000.'],
  // Slumped: eyes half shut, arms hanging, legs folded.
  dazed: ['.........', '.0000000.', '.0000000.', '.0001010.', '.0000000.', '000000000', '.0.0.0.0.'],
  // Out for the count: sunk flat on his belly, eyes shut, arms and legs splayed. Upright, so his hat stays on his head.
  flat: ['.........', '.........', '.........', '.........', '.0000000.', '000010100', '00.000.00'],
  half: ['..00000..', '..00010..', '.0000100.', '..00000..', '..00000..', '..0.0.0..', '..0.0.0..'],
  thin: ['...000...', '...010...', '..00100..', '...000...', '...000...', '...0.0...', '...0.0...'],
  duck: ['.0000000.', '000010100', '.0000000.', '.0.0.0.0.'],
  gulp1: ['.0000000.', '.0010100.', '000000000', '.0000022.', '.0000000.', '.0.0.0.0.', '.0.0.0.0.'],
  gulp2: ['.0000000.', '.0010100.', '000000000', '.0000022.', '.0000022.', '.0.0.0.0.', '.0.0.0.0.'],
  cheer: ['0.......0', '000000000', '.0001010.', '.0001010.', '.0000000.', '.0.0.0.0.', '.0.0.0.0.'],
  cheer2: ['0.......0', '0.......0', '000000000', '.0001010.', '.0000000.', '.0000000.', '.0.0.0.0.'],
}

// A model's hat, a few rows in the inks past the body's own (Kirby's 6 to 8, Clawd's 3 and 4), '.' clear. Kirby's last
// row is the hat's band, drawn over the top of his head; Clawd's sits on his. No cell of a hat hangs clear of the rest.
type Hat = { readonly inks: readonly number[]; readonly rows: readonly string[] }
const KIRBY_HATS: Readonly<Partial<Record<Form, Hat>>> = {
  // Sword: a green cap, a yellow bobble on its tip at the back, a yellow band.
  sonnet: { inks: [0x38c048, 0x1c8034, 0xf8d838], rows: ['.8......', '.76666..', '.888888.'] },
  // Beam: a jester's hat, red behind and orange ahead, a white ball on each horn.
  haiku: { inks: [0xf8a030, 0xe82838, 0xf8f8f8], rows: ['.8....8.', '.77..66.', '.777666.'] },
  // Fire: flames, red at their tips, yellow at their heart: no band, so it is never taken for a crown.
  fable: { inks: [0xe82000, 0xf8a800, 0xf8f040], rows: ['.6..6.6.', '.67.676.', '.778877.'] },
}
const CLAWD_HATS: Readonly<Partial<Record<Form, Hat>>> = {
  // The poet's beret, its stalk on top.
  sonnet: { inks: [0xc0392b, 0x7d2018], rows: ['.....4...', '..33333..', '.4444444.'] },
  // A straw hat, a cone over a wide brim.
  haiku: { inks: [0xe8c872, 0xa87f32], rows: ['....3....', '..33333..', '.4444444.'] },
  // The wizard's hat: a cone, a star on it, a wide gold brim. (Four rows: a row more and, doubled on the true-pixel stage, it would not fit the sky it waits in.)
  fable: { inks: [0x7b4bd6, 0xf8d048], rows: ['....3....', '...343...', '..33333..', '.4444444.'] },
}

// By day the jester's white balls would be lost on a pale ground: they are lilac there.
const BALL_DAY = 0x8f7fc8
const byDayHat = (hat: Hat | undefined, isLight: boolean): Hat | undefined =>
  hat === undefined || !isLight ? hat : { ...hat, inks: hat.inks.map(ink => (ink === 0xf8f8f8 ? BALL_DAY : ink)) }

/** The colours no agent's swap touches: every hat's. */
export const HAT_INKS: readonly number[] = [...[...Object.values(KIRBY_HATS), ...Object.values(CLAWD_HATS)].flatMap(hat => hat.inks), BALL_DAY]

/** A row with `n` cells taken out of each half, about its middle: a hat for a body half turned, or edge on. */
const narrowed = (row: string, n: number): string => '.'.repeat(n) + row[0]! + row.slice(1 + n, row.length - 1 - n) + row[row.length - 1]! + '.'.repeat(n)

/**
 * A pose with the hat on. The hat's last row goes on `at`, the first row of the head (Kirby: over its
 * outline) or the row above it (Clawd), rows added above where the pose has none; on a body upside
 * down it goes under it, upside down too. A body half turned or edge on takes it narrowed.
 */
function hatted(family: Family, pose: Pose, rows: readonly string[], hat: Hat | undefined): readonly string[] {
  if (hat === undefined) return rows
  const worn = hat.rows.map(row => narrowed(row, pose === 'half' ? 1 : pose === 'thin' ? 2 : 0))
  const over = (under: string, top: string) => [...top].map((ink, x) => (ink === '.' ? under[x]! : ink)).join('')
  if (pose === 'hurt') {
    const under = [...worn].reverse()

    return family === 'kirby' ? [...rows.slice(0, -1), over(rows[rows.length - 1]!, under[0]!), ...under.slice(1)] : [...rows, ...under]
  }
  const head = rows.findIndex(row => (family === 'kirby' ? /[^.]{2}/ : /0{3}/).test(row))
  const at = family === 'kirby' ? head : head - 1
  const padded = [...Array<string>(Math.max(0, worn.length - 1 - at)).fill('.'.repeat(rows[0]!.length)), ...rows]
  const from = padded.length - rows.length + at - (worn.length - 1)

  return padded.map((row, y) => (y >= from && y < from + worn.length ? over(row, worn[y - from]!) : row))
}

const POSES = Object.keys(KIRBY) as Pose[]

// Mini Clawd's in-betweens, for the true-pixel stage alone (the cell-block stage has no frame to show them in): a step
// on either foot, the arms swinging and the body a pixel up on the planted legs; a fall, arms flung up and eyes on the
// ground; a landing, squashed flat and wide; a slide, leant into it with an arm and the legs trailing.
const CLAWD_MORE = {
  stepA: ['.0000000.', '.00010100', '00001010.', '.0000000.', '.0000000.', '.0.0.0.0.', '.0...0...', '.0...0...'],
  stepB: ['.0000000.', '00001010.', '.00010100', '.0000000.', '.0000000.', '.0.0.0.0.', '...0...0.', '...0...0.'],
  fall: ['0.......0', '0.......0', '000000000', '.0000000.', '.0001010.', '.0001010.', '.0.0.0.0.'],
  land: ['000000000', '000010100', '00.0.0.00'],
  slide: ['..0000000', '000001010', '.0000000.', '0.0.0.0..'],
} as const
export type ClawdMore = keyof typeof CLAWD_MORE

/** Those in-betweens in the colours of `slot`, the hat of `form` on. */
export function clawdMore(slot: number, form: Form = 'opus'): Readonly<Record<ClawdMore, Pixels>> {
  const hat = CLAWD_HATS[form]
  const names = Object.keys(CLAWD_MORE) as ClawdMore[]
  const frames = decode([SWAPS[slot % SWAPS.length]![0], CLAWD_INKS[1]!, CLAWD_INKS[2]!, ...(hat?.inks ?? [])], names.map(name => hatted('clawd', 'stand', CLAWD_MORE[name], hat)))

  return Object.fromEntries(names.map((name, i) => [name, frames[i]!])) as Partial<Record<ClawdMore, Pixels>> as Record<ClawdMore, Pixels>
}
const made = new Map<string, Mini>()

/**
 * The family's mini in the colours of `slot`, wearing the hat of `form` (none for opus): body, shine and
 * feet are swapped; outline, eyes, mouth and hat keep theirs.
 */
export function miniOf(family: Family, slot: number, form: Form = 'opus', isLight = false): Mini {
  const key = `${family}/${slot % SWAPS.length}/${form}/${isLight}`
  const [light, shade, feet, shine] = SWAPS[slot % SWAPS.length]!
  const hat = byDayHat((family === 'kirby' ? KIRBY_HATS : CLAWD_HATS)[form], isLight)
  const palette = family === 'kirby' ? [KIRBY_INKS[0]!, light, shade, feet, KIRBY_INKS[4]!, shine, ...(hat?.inks ?? [])] : [light, CLAWD_INKS[1]!, CLAWD_INKS[2]!, ...(hat?.inks ?? [])]
  const rows = family === 'kirby' ? KIRBY : CLAWD
  const frames = decode(palette, POSES.map(pose => hatted(family, pose, rows[pose], hat)))
  const mini = made.get(key) ?? (Object.fromEntries(POSES.map((pose, i) => [pose, frames[i]!])) as Partial<Mini> as Mini)
  made.set(key, mini)

  return mini
}

/** The colour an agent's dot is drawn in: its mini's body; on a light ground the body's shade, which a pale yellow or green would vanish on. */
export const colorOf = (slot: number, isLight = false): string => `#${SWAPS[slot % SWAPS.length]![isLight ? 1 : 0].toString(16).padStart(6, '0')}`

// Effects, the enemy and scenery share one palette, quiet enough for a dark terminal.
export const GRASS = 0x3c9a58
export const SOIL = 0x24603c
export const SOIL_LIT = 0x2c7448
export const SKY_STAR = 0xb9a55a
// By day, on a light theme: a sparkle in the sky, and a white cloud shaded pink.
export const SKY_SPARK = 0xe58ab8
export const CLOUD_DAY = [0xffffff, 0xe3b4cd] as const
export const MARKER = 0x8e88b8
export const STREAK = 0xcfd8ea
export const GOLD = 0xffd75f
export const WHITE = 0xffffff
export const STEEL = 0xcfd8eb
export const CYAN = 0x7fe3ff
export const DUST = 0x8c96c0
export const IMPACT = 0xff5f5f
// A pencil, for the mini that edits with one: its eraser, its body, its wood, its lead.
export const PENCIL = [0xff7fa8, 0xf8d030, 0xf0c898, 0x3a3a48] as const

/**
 * By day, on a light theme: what is drawn in white and pale colours for a dark ground (a breath's
 * wind, a sparkle, a beam, a "?") is drawn in these instead, dark enough to be seen on a pale one.
 */
const DAY = new Map<number, number>([[WHITE, 0x4a4a7a], [STREAK, 0x7a6fae], [GOLD, 0xb86e00], [STEEL, 0x5f6fae], [CYAN, 0x0a7fa8], [PENCIL[2], 0xb07a40]])

/** A colour as the stage's effects have it by day, or (`isLight` false) as it is. */
export const byDay = (color: number, isLight: boolean): number => (isLight ? DAY.get(color) ?? color : color)

/** A sprite's pixels in the day's colours. */
export const pixelsByDay = (px: Pixels, isLight: boolean): Pixels => (isLight ? px.map(row => row.map(color => (color === null ? color : byDay(color, true)))) : px)
const FACE = 0x2a1a15
const FX_INKS = [
  0x000000, WHITE, GOLD, 0xe8961e, 0xff6fa8, STEEL, CYAN, 0x4c5174, 0x363a56, // 0-8: ink, white, gold, amber, pink, steel, cyan, cloud, cloud shade
  0xf08438, 0xfcd9a8, IMPACT, FACE, // 9-c: the enemy's feet and wings, red, its eyes
  ...CLOUD_DAY, // d-e: the cloud by day
]
const fx = (...rows: string[]): Pixels => decode(FX_INKS, [rows])[0]!
const marked = (...rows: string[]): Pixels => decode([MARKER], [rows])[0]!

export const FX = {
  star: [fx('..2..', '.222.', '22222', '.232.', '.3.3.'), fx('2...2', '.2.2.', '..1..', '.2.2.', '2...2')],
  twinkle: fx('.2.', '212', '.2.'),
  // What circles a dazed head: a gold star, then a pale one.
  dizzy: [fx('.2.', '222', '.2.'), fx('.6.', '616', '.6.')],
  // A warp star, drawn over the feet of its rider.
  warp: fx('....2....', '...222...', '222222222', '.2222233.', '..22233..', '.222.333.', '.2.....3.'),
  // A shooting star: its tail, then its head.
  shot: fx('3221'),
  heart: fx('.4.4.', '44444', '.444.', '..4..'),
  ask: fx('111', '..1', '.1.', '...', '.1.'),
  bolt: fx('..2', '.22', '222', '22.', '2..'),
  // A knock on the head.
  impact: fx('1.b.1', '.bbb.', '1.b.1'),
  puff: [
    fx('1.....1', '.1...1.', '..222..', '..212..', '..222..', '.1...1.', '1.....1'),
    fx('.55.55.', '5555555', '5555558', '.555588', '5555888', '.58888.', '..8.8..'),
    fx('5..5...', '....5.5', '.5.....', '......8', '5...8..', '..8....', '.8...8.'),
  ],
  // The enemy flies in the sky and faces left, at the minis: wings up, then down.
  flyer: [
    fx('aa.444.aa', '.a44444a.', '..c4c44..', '..44444..', '...9.9...'),
    fx('...444...', '..44444..', '.ac4c44a.', 'aa44444aa', '...9.9...'),
  ],
  flyerHit: fx('aa.111.aa', '.a11111a.', '..c1c11..', '..11111..', '...9.9...'),
  cloud: [fx('...7777...', '7777777777', '.88888888.'), fx('...8888...', '8888888888', '..888888..')],
  cloudDay: [fx('...dddd...', 'dddddddddd', '.eeeeeeee.'), fx('...eeee...', 'eeeeeeeeee', '..eeeeee..')],
  plus: marked('...', '.0.', '000', '.0.', '...'),
  digits: [
    marked('000', '0.0', '0.0', '0.0', '000'), marked('.0.', '00.', '.0.', '.0.', '000'), marked('000', '..0', '000', '0..', '000'),
    marked('000', '..0', '.00', '..0', '000'), marked('0.0', '0.0', '000', '..0', '..0'), marked('000', '0..', '000', '..0', '000'),
    marked('000', '0..', '000', '0.0', '000'), marked('000', '..0', '..0', '.0.', '.0.'), marked('000', '0.0', '000', '0.0', '000'),
    marked('000', '0.0', '000', '..0', '000'),
  ],
} as const

/** The head of an agent waiting in the queue, in its colour, a line round its crown by day (a pale head has no edge on a pale ground); its model's hat is the top of it, in the hat's two first colours. */
export function headOf(family: Family, slot: number, form: Form = 'opus', isLight = false): Pixels {
  const hat = (family === 'kirby' ? KIRBY_HATS : CLAWD_HATS)[form]
  const [light, shade] = SWAPS[slot % SWAPS.length]!
  const top = hat === undefined ? (isLight ? '.444.' : '.000.') : '.232.'

  return decode([light, FACE, hat?.inks[0] ?? light, hat?.inks[1] ?? light, shade], [[top, '01010', '00000', isLight ? '.444.' : '.000.']])[0]!
}
