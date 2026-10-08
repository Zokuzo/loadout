// The true-pixel stage's sprites. A family hands the stage a MiniSet per colour slot: Kirby's is
// cut from Kirby's Adventure at native size (gamesprites.ts), Clawd's is his small self doubled,
// outlined and shaded, holding the game's sword and sat on its star. The effects and the enemy are the game's too.
import { CLEAR, blank, joined, mirrored, paint, pixelsOf, scaled, sprite } from './canvas'
import type { Sprite } from './canvas'
import { decode } from './forms'
import { CUT, INKS } from './gamesprites'
import type { Form, Pixels } from './look'
import { CLOUD_DAY, FX, GOLD, IMPACT, MOUTH, PENCIL, SWAPS, WHITE, clawdMore, miniOf } from './minis'
import type { ClawdMore } from './minis'

/**
 * What the stage asks of a mini, each pose one or more frames facing right, anchored at the feet:
 * `walk` a cycle of four; `duck` a crouch, then where a set has one a deeper squash for the moment of a landing; `turn` edge on; `tumble` four of a somersault; `inhale` two, mouth wide;
 * `full` cheeks stuffed; `puff` breathing in and `float` four of flapping; `sit` dazed and `flat`
 * out; `cheer` facing us (mouth open, landed wide, arms up); `dance` (facing us, stretched in a
 * jump, two from behind, two heels over head, a side step); `back` from behind round to the front;
 * `slash` eight of a sword swing (wound up low behind, over the head, the flash, held high), the
 * sword in the frames, then two in-betweens a set may leave out (the sword tilting back before the
 * swing, and settling past upright after the flash); `ride` on a warp star, anchored under the star.
 */
export type Pose =
  | 'stand' | 'blink' | 'walk' | 'turn' | 'duck' | 'slide' | 'jump' | 'fall' | 'tumble' | 'inhale' | 'full' | 'puff' | 'float'
  | 'sit' | 'flat' | 'cheer' | 'dance' | 'back' | 'slash' | 'ride'

/**
 * A family's mini in one colour and one model's form: its poses, `half` its standing body's width,
 * `tall` its height stood up, hat and all, and `attack` what it edits with where that is not the sword
 * (the sword is Sword Kirby's: plain Kirby writes with a pencil).
 * `flicker` is the same poses a moment later, for a hat that is alive (a fire): the stage shows the two in turn.
 */
export type MiniSet = { half: number; tall: number; attack?: 'fire' | 'beam' | 'pencil'; poses: Readonly<Record<Pose, readonly Sprite[]>>; flicker?: Readonly<Record<Pose, readonly Sprite[]>> }

type Cut = { readonly ax: number; readonly ay: number; readonly rows: readonly string[] }

const cut = (frames: readonly Cut[], palette: readonly number[] = INKS): Sprite[] =>
  decode(palette, frames.map(frame => frame.rows)).map((px, i) => ({ px, ax: frames[i]!.ax, ay: frames[i]!.ay }))

const SHADE = '8' // an ink past the game's own: the body's shade

/**
 * The game draws Kirby's feet, his blush and the soft edge of his body in one ink. Swapped to an
 * agent's colours the feet take a colour of their own, which the edge must not: the ink's small
 * patches (under three pixels, the edge and the blush) are given the body's shade instead.
 */
function shaded(rows: readonly string[]): string[] {
  const grid = rows.map(row => [...row])
  const seen = new Set<string>()
  grid.forEach((row, y) => row.forEach((ink, x) => {
    if (ink !== '2' || seen.has(`${x},${y}`)) return
    const patch: (readonly [number, number])[] = []
    const todo: (readonly [number, number])[] = [[x, y]]
    while (todo.length > 0) {
      const [i, j] = todo.pop()!
      if (grid[j]?.[i] !== '2' || seen.has(`${i},${j}`)) continue
      seen.add(`${i},${j}`)
      patch.push([i, j])
      todo.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1])
    }
    if (patch.length < 3) for (const [i, j] of patch) grid[j]![i] = SHADE
  }))

  return grid.map(row => row.join(''))
}

const GAPE = '9' // and another: the inside of his mouth

/**
 * The game leaves an inhaling Kirby's mouth clear, the background showing through it, and his eyes
 * two specks at the edge of his tilted head: on a dark terminal that is a lump with a notch. Here
 * the gape is filled (the clear pixels right of a row that his lips reach over, above and below),
 * the creases of `plain` go back to body, and his `eyes` are drawn, each three rows from the pixel given.
 */
function agape(rows: readonly string[], eyes: readonly (readonly [number, number])[], plain: readonly (readonly [number, number])[]): string[] {
  const grid = rows.map(row => [...row])
  const isInk = (x: number, y: number) => (rows[y]?.[x] ?? '.') !== '.'
  grid.forEach((row, y) => row.forEach((ink, x) => {
    const isPast = ink === '.' && x > row.join('').replace(/\.+$/, '').length - 1
    if (isPast && rows.slice(0, y).some((_r, j) => isInk(x, j)) && rows.slice(y + 1).some((_r, j) => isInk(x, y + 1 + j))) row[x] = GAPE
  }))
  for (const [x, y] of plain) grid[y]![x] = '1'
  for (const [x, y] of eyes) for (const dy of [0, 1, 2]) grid[y + dy]![x] = '0'

  return grid.map(row => row.join(''))
}

// Per frame of the inhale (and the puff, which is its first): where the eyes go, and the creases they replace.
const GAPES: readonly (readonly [eyes: readonly (readonly [number, number])[], plain: readonly (readonly [number, number])[]])[] = [
  [[[9, 4], [11, 4]], [[11, 3], [12, 4], [12, 5]]],
  [[[14, 4], [16, 4]], [[16, 2], [17, 3], [17, 4], [16, 6], [17, 7]]],
]

const FLASH = [INKS[0], INKS[1], INKS[2], WHITE, GOLD, 0xfff3b0] as const

const POSES = ['stand', 'blink', 'walk', 'turn', 'duck', 'slide', 'jump', 'fall', 'tumble', 'inhale', 'full', 'puff', 'float', 'sit', 'flat', 'cheer', 'dance', 'back', 'slash', 'ride'] as const satisfies readonly Pose[]

// Two clouds, a far one and a near one: their body and, under it, their shade.
const CLOUDS = [
  ['......0000..........', '....00000000..000...', '..0000000000000000..', '.000000000000000000.', '00000000000000000000', '.111111111111111111.', '...11111111111111...'],
  ['...0000.....', '.00000000.0.', '000000000000', '.1111111111.'],
]

/** `px` with a line of `ink` round it: one pixel bigger each way. */
function outlined(px: Pixels, ink: number): Pixels {
  const at = (x: number, y: number) => px[y]?.[x] ?? null

  return Array.from({ length: px.length + 2 }, (_row, j) => Array.from({ length: px[0]!.length + 2 }, (_cell, i) => {
    const [x, y] = [i - 1, j - 1]

    return at(x, y) ?? ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx!, y + dy!) !== null) ? ink : null)
  }))
}

/** The game's effects: the spat star turning, a pop in three, dust in two, a breath, a sparkle, the warp star, the sword in seven, Bronto Burt's two wing beats. */
export const HI = {
  // The pop's first frame is a flash: the game's brown star, here gold round a white heart.
  star: cut(CUT.star), pop: [...cut(CUT.pop.slice(0, 1), FLASH), ...cut(CUT.pop.slice(1))], dust: cut(CUT.dust), air: cut(CUT.air)[0]!, spark: cut(CUT.spark)[0]!,
  bigstar: cut(CUT.bigstar)[0]!, blade: cut(CUT.blade).map(one => one.px), burt: cut(CUT.burt),
  // Hand-pixelled, as the small stage has them, doubled.
  heart: sprite(scaled(FX.heart, 2)),
  // The "?" has a line round it, as the minis have: white alone is lost on a light theme's sky.
  ask: sprite(outlined(scaled(FX.ask, 2), INKS[0])),
  // A pencil, held by its eraser, its lead down and ahead: anchored at the lead.
  pencil: sprite(decode([INKS[0], ...PENCIL], [['.....00.', '....0110', '...02210', '..02220.', '.02220..', '032220..', '0430....', '00......']])[0]!, 0, 8),
  // A knock: a jagged red burst, lit at its heart, outlined.
  impact: sprite(decode([0x1a0a10, IMPACT, GOLD, WHITE], [[
    '.....0.....', '.0..010..0.', '0100121001.', '.01122110..', '..0123210..', '.011232110.', '0112232110.', '.00121100..', '..010010...', '...0..0....',
  ]])[0]!),
  // What a mini throws at the enemy: a gold star, turning.
  shot: FX.star.map(px => sprite(scaled(px, 2))),
  twinkle: sprite(scaled(FX.twinkle, 2)), glint: sprite(FX.twinkle), dizzy: FX.dizzy.map(px => sprite(scaled(px, 2))),
  plus: scaled(FX.plus, 2), digits: FX.digits.map(px => scaled(px, 2)),
  cloud: decode([0x4c5174, 0x363a56], CLOUDS), cloudDay: decode(CLOUD_DAY, CLOUDS),
}

// --- the copy abilities' hats -------------------------------------------------

/**
 * A hat as the game's sprites would have it at this size: from the side (facing right), from the front,
 * from behind, and edge on. `alt` is the same hat a moment later, where it is alive: a fire's flames.
 */
type Hat = { side: Pixels; front: Pixels; back: Pixels; thin: Pixels; alt?: Hat }
type Views = { side: readonly string[]; front: readonly string[]; back: readonly string[]; thin: readonly string[] }

const hat = (palette: readonly number[], views: Views, alt?: Views): Hat => {
  const [side, front, back, thin] = decode([INKS[0], ...palette], [views.side, views.front, views.back, views.thin])

  return { side: side!, front: front!, back: back!, thin: thin!, ...(alt === undefined ? {} : { alt: hat(palette, alt) }) }
}

// The band of the fire's crown, under its flames: from the side, the front (its green stone showing) and behind.
const CROWN = { side: ['12233222332221', '.1233333333210', '..044444454440'], front: ['122332233221', '012333333210', '044445444440'], back: ['122332233221', '012333333210', '044444444440'], thin: ['123321', '012210', '044540'] }

const HATS: Readonly<Partial<Record<Form, Hat>>> = {
  // Sword: the green cap, a yellow bobble on its tip (hanging back from the side, to one side from the front, to the
  // other from behind: never out of sight), a yellow band round the brow.
  sonnet: hat([0x38c048, 0x1c8034, 0xf8d838, 0xc08818], {
    side: ['......0000....', '.00.00111100..', '0330111111110.', '03302111111110', '.0002111111110', '..033333333330', '..044444444440'],
    front: ['.00.0000....', '0330111100..', '03301111110.', '000111111110', '021111111120', '033333333330', '044444444440'],
    back: ['....0000.00.', '..0011110330', '.01111110330', '011111111000', '021111111120', '033333333330', '044444444440'],
    thin: ['.0000.', '011110', '011110', '011110', '021120', '033330', '044440'],
  }),
  // Beam: the jester's hat, red behind and orange ahead (the other way round from behind), a white ball at the end of each horn.
  haiku: hat([0xf8a030, 0xb86010, 0xe82838, 0x981828, 0xf8f8f8, 0xb8b8d0], {
    side: ['.00........00.', '0550......0550', '05503000010550', '.033330011110.', '.033333111110.', '..033331111110', '..044442222220'],
    front: ['.00........00.', '0550......0550', '05503000010550', '.033330011110.', '.033333111110.', '.033333111110.', '.044444222220.'],
    back: ['.00........00.', '0550......0550', '05501000030550', '.011110033330.', '.011111333330.', '.011111333330.', '.022222444440.'],
    thin: ['5.00.5', '003100', '033110', '033110', '033110', '033110', '044220'],
  }),
  // Fire: a crown of flames, yellow at the heart, over a gold band with a green stone in front. The flames flicker: two drawings, in turn.
  fable: hat([0xe82000, 0xf8a800, 0xf8f040, 0xf8c000, 0x00b838], {
    side: ['....1....1....', '...121..121.1.', '.1.1221.12212.', '12123211232121', ...CROWN.side],
    front: ['...1....1...', '..121..121..', '1.1221122121', '121232232121', ...CROWN.front],
    back: ['...1....1...', '..121..121..', '1.1221122121', '121232232121', ...CROWN.back],
    thin: ['1..1..', '121121', '122221', '123321', ...CROWN.thin],
  }, {
    side: ['......1....1..', '.1...121..121.', '121.12211.1221', '12212321123211', ...CROWN.side],
    front: ['.1....1...1.', '121..121.121', '122112211221', '123212322321', ...CROWN.front],
    back: ['.1....1...1.', '121..121.121', '122112211221', '123212322321', ...CROWN.back],
    thin: ['..1..1', '.12121', '122221', '123321', ...CROWN.thin],
  }),
}

/** The colours of the things a mini holds or rides: a hat is worn under them, never over. */
const HELD = new Set<number>([INKS[3], INKS[4], INKS[5]])

/** Where a frame's hat goes: which view of it, then the column of the head's middle and the row of its brow (the hat's last row). */
type HatAt = readonly [view: Exclude<keyof Hat, 'alt'>, x: number, y: number]

// Placed by hand, frame by frame, on the game's own sprites.
const BODY: HatAt = ['front', 7, 2] // the body under a sword, three quarters on: the hat on his head, clear of the hand he holds up
const HAT_AT: Readonly<Record<Pose, readonly HatAt[]>> = {
  stand: [['side', 8, 2]], blink: [['side', 8, 2]],
  walk: [['side', 7, 2], ['side', 7, 2], ['side', 7, 2], ['side', 7, 2]],
  turn: [['thin', 4, 2]], duck: [['side', 8, 1]], slide: [['side', 9, 2]], jump: [['side', 8, 2]], fall: [['side', 10, 6]],
  tumble: [['side', 10, 2], ['side', 8, 2], ['side', 8, 2], ['side', 8, 3]],
  inhale: [['side', 8, 2], ['side', 13, 1]], full: [['side', 12, 1], ['side', 12, 2]], puff: [['side', 8, 2]],
  float: [['side', 12, 2], ['side', 11, 1], ['side', 11, 2], ['side', 12, 2]],
  sit: [['side', 8, 2]], flat: [['front', 8, 3]],
  cheer: [['front', 7, 1], ['front', 9, 0], ['front', 7, 0]],
  dance: [['front', 7, 1], ['back', 9, 3], ['back', 9, 3], ['back', 11, 3], ['front', 8, 2], ['front', 8, 4], BODY],
  back: [['back', 8, 2], ['back', 8, 2], ['front', 7, 2], ['front', 7, 1], BODY],
  slash: [['back', 18, 2], ['back', 23, 10], ['back', 21, 18], ['front', 12, 17], ['front', 7, 16], ['front', 7, 21], ['front', 7, 21], ['front', 7, 17]],
  ride: [['side', 8, 2]],
}

/**
 * The frame with the hat on: over the body, under what it holds, a line of ink between the two where
 * they meet (a sword before a cap, not stuck in it); the anchor stays where the body's was.
 */
function crowned(base: Sprite, worn: Hat, [view, x, y]: HatAt): Sprite {
  const px = worn[view]
  const [left, top] = [x - (px[0]!.length >> 1), y - px.length + 1]
  const [dx, dy] = [Math.min(0, left), Math.min(0, top)]
  const canvas = blank(Math.max(base.px[0]!.length, left + px[0]!.length) - dx, Math.max(base.px.length, top + px.length) - dy)
  const at = (i: number, j: number) => (j - dy) * canvas.width + i - dx
  const isHeld = (i: number, j: number) => HELD.has(base.px[j]?.[i] ?? CLEAR)
  const isHat = (i: number, j: number) => (px[j - top]?.[i - left] ?? null) !== null
  paint(canvas, base.px, -dx, -dy)
  paint(canvas, px, left - dx, top - dy)
  base.px.forEach((row, j) => row.forEach((color, i) => {
    if (color === null || !isHeld(i, j)) return
    canvas.data[at(i, j)] = color
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]] as const) if (isHat(a, b) && !isHeld(a, b)) canvas.data[at(a, b)] = INKS[0]
  }))

  return { px: pixelsOf(canvas), ax: base.ax - dx, ay: base.ay - dy }
}

// The sword as Sword Kirby's is: the game's small blade in ice blue, inked as everything else on stage is.
const STEEL = new Map<number, number>([[INKS[3], 0xe8f8ff], [INKS[5], 0x58c8f0], [INKS[4], INKS[0]]])
const steeled = (one: Sprite): Sprite => ({ ...one, px: one.px.map(row => row.map(color => (color === null ? color : STEEL.get(color) ?? color))) })

// The sword Sword Kirby holds, on the game's own pixel: a broad blade, lit on its left, a gold guard, a hilt.
const BLADE_INKS = [INKS[0], 0xe8f8ff, 0x58c8f0, 0xf8d838, 0xc08818] as const
const SWORD = decode(BLADE_INKS, [[
  '...0...', '..010..', '.01120.', '.01120.', '.01120.', '.01120.', '.01120.', '.01120.', '.01120.', '.01120.', '0000000', '0333340', '0000000', '..030..', '..040..',
]])[0]!
const LEAN = 0.4 // pixels aside a row up

/** The sword leaning: each row slid whole pixels aside, the more the higher (`way` 1 ahead, -1 back). Its foot keeps `foot` columns from the left. */
function leaned(px: Pixels, way: 1 | -1): { px: Pixels; foot: number } {
  const most = Math.round((px.length - 1) * LEAN)
  const rows = px.map((row, y) => {
    const slid = Math.round((px.length - 1 - y) * LEAN)
    const before = way > 0 ? slid : most - slid

    return [...Array<null>(before).fill(null), ...row, ...Array<null>(most - before).fill(null)]
  })

  return { px: rows, foot: way > 0 ? 0 : most }
}

const made = new Map<string, MiniSet>()

function kept(key: string, make: () => MiniSet): MiniSet {
  const set = made.get(key) ?? make()
  made.set(key, set)

  return set
}

/**
 * Kirby as the game drew him, body and feet swapped to the slot's colours as the games swap players
 * two to four, and on his head the hat of his agent's model: the sword's cap, the beam's jester hat,
 * the fire's crown. A hat keeps its own colours whatever the slot.
 */
export const kirbyMini = (slot: number, form: Form = 'opus'): MiniSet => kept(`kirby/${slot % SWAPS.length}/${form}`, () => {
  const [light, shade, feet] = SWAPS[slot % SWAPS.length]!
  const palette = [INKS[0], light, feet, ...INKS.slice(3), shade, MOUTH]
  const rowsOf = (pose: Pose, rows: readonly string[], i: number) => (pose === 'inhale' || pose === 'puff' ? agape(shaded(rows), ...GAPES[i]!) : shaded(rows))
  const bare = Object.fromEntries(POSES.map(pose => [pose, cut(CUT[pose].map((one, i) => ({ ...one, rows: rowsOf(pose, one.rows, i) })), palette)])) as Record<Pose, Sprite[]>
  const held = bare.slash[7]!
  const flash = steeled(sprite(HI.blade[4]!)).px
  const [back, ahead] = [leaned(SWORD, -1), leaned(SWORD, 1)]
  /** Every pose with `worn` on his head. */
  const dressed = (worn: Hat | undefined): Record<Pose, Sprite[]> => {
    const on = (one: Sprite, at: HatAt): Sprite => (worn === undefined ? one : crowned(one, worn, at))
    const poses = Object.fromEntries(POSES.map(pose => [pose, bare[pose].map((one, i) => on(one, HAT_AT[pose][i]!))])) as Record<Pose, Sprite[]>
    // The sword between its hold and its swing: his body as it stands under the held sword, the blade tilted back, then past upright.
    const under = on({ px: held.px.slice(held.ay - 16), ax: held.ax, ay: 16 }, BODY)

    const armed = joined(under, SWORD, 2, -30)

    return {
      ...poses,
      // The swing is the game's (its blade a blur); from the flash on, the sword is the one he holds: flashing, held high, leaning back, then past upright.
      slash: [
        ...poses.slash.slice(0, 5).map(steeled), joined(armed, flash, -3, -34), joined(armed, mirrored(flash), -3, -34), armed,
        joined(under, back.px, 2 - back.foot, -30), joined(under, ahead.px, 2, -30),
      ],
      // The star he rides is under his feet: the anchor goes under the star.
      ride: poses.ride.map(({ px }) => sprite(px)),
    }
  }
  const worn = HATS[form]
  const poses = dressed(worn)

  return {
    half: 8,
    tall: poses.stand[0]!.px.length,
    ...(form === 'fable' ? { attack: 'fire' as const } : form === 'haiku' ? { attack: 'beam' as const } : form === 'sonnet' ? {} : { attack: 'pencil' as const }),
    poses,
    ...(worn?.alt === undefined ? {} : { flicker: dressed(worn.alt) }),
  }
})

const INK = 0x2a1a14 // Clawd's eyes, and the line round him

/** A flat block given a line round it and a tone: `px` one pixel bigger each way, its `light` shaded where it faces down or right. */
function finished(px: Pixels, light: number, shade: number): Pixels {
  const at = (x: number, y: number) => px[y]?.[x] ?? null

  return outlined(px.map((row, y) => row.map((color, x) => (color === light && (at(x + 1, y) === null || at(x, y + 1) === null) ? shade : color))), INK)
}

// Clawd's sword, in his own pixels (it is doubled with him, so the two are one drawing): held up, leaning ahead, swung
// over his head, and the flash of its stroke. 0 the blade's light, 1 its shade, 2 the gold of guard and hilt, 3 the flash.
const CLAWD_BLADE_INKS = [0xe8f8ff, 0x58c8f0, 0xf8d838, 0xffffff] as const
const [UP, TILT, SWOOSH, GLINT] = decode(CLAWD_BLADE_INKS, [
  ['.0.', '.01', '.01', '.01', '222', '.2.'],
  ['....0', '...01', '..01.', '221..', '.2...'],
  ['..00000..', '.01...10.', '01.....10'],
  ['3.3.3', '.303.', '33033', '.303.', '3.3.3'],
])
const upturned = (px: Pixels): Pixels => [...px].reverse()

/** Clawd, twice his small self, his model's hat on: the sword and the star are the game's, in his hands and under his feet. */
export const clawdMini = (slot: number, form: Form = 'opus'): MiniSet => kept(`clawd/${slot % SWAPS.length}/${form}`, () => {
  const small = miniOf('clawd', slot, form)
  const [light, shade] = SWAPS[slot % SWAPS.length]!
  const big = (pose: keyof typeof small) => sprite(finished(scaled(small[pose], 2), light, shade))
  /** A pose with the sword in hand, drawn small then doubled as one: `dx`, `dy` are the blade's top-left from the body's middle and its feet, in his own pixels. */
  const armed = (pose: keyof typeof small, blade: Pixels, dx: number, dy: number, more?: readonly [Pixels, number, number]): Sprite => {
    const body = joined(sprite(small[pose]), blade, dx, dy)
    const whole = more === undefined ? body : joined(body, ...more)

    return { px: finished(scaled(whole.px, 2), light, shade), ax: 2 * whole.ax + 2, ay: 2 * whole.ay + 2 }
  }
  const [stand, half, thin, duck, jump, cheer, cheer2] = (['stand', 'half', 'thin', 'duck', 'jump', 'cheer', 'cheer2'] as const).map(big)
  // His in-betweens, drawn for this stage: a walk of four frames, a fall, a landing squashed flat before the crouch, a slide.
  const more = clawdMore(slot, form)
  const [stepA, stepB, fall, land, slide] = (['stepA', 'stepB', 'fall', 'land', 'slide'] as const satisfies readonly ClawdMore[]).map(name => sprite(finished(scaled(more[name], 2), light, shade)))

  return {
    half: 9,
    tall: stand!.px.length,
    poses: {
      stand: [stand!], blink: [big('blink')], walk: [stepA!, stand!, stepB!, stand!], turn: [thin!], duck: [duck!, land!], slide: [slide!], jump: [jump!], fall: [fall!],
      tumble: [big('hurt'), half!, thin!, half!], inhale: [big('gulp1'), big('gulp2')], full: [big('gulp2')], puff: [jump!], float: [jump!, cheer!, jump!, cheer2!],
      sit: [big('dazed')], flat: [big('flat')], cheer: [cheer!, duck!, cheer2!], dance: [stand!, jump!, half!, thin!, big('hurt'), half!, stepA!], back: [half!, thin!, half!, stand!, stand!],
      // Wound up low behind, swung up and over his head, down ahead, the flash, held high, then leaning back and ahead.
      slash: [
        armed('duck', upturned(mirrored(TILT!)), -9, -3), armed('duck', mirrored(TILT!), -9, -7), armed('stand', mirrored(TILT!), -9, -10), armed('jump', SWOOSH!, -4, -10),
        armed('stand', TILT!, 4, -10), armed('stand', UP!, 3, -11, [GLINT!, 2, -13]), armed('stand', UP!, 3, -11, [mirrored(upturned(GLINT!)), 2, -12]), armed('stand', UP!, 3, -11),
        armed('stand', mirrored(TILT!), 1, -10), armed('stand', TILT!, 4, -10),
      ],
      // Sat on the star, all of him before it.
      ride: [sprite(joined(HI.bigstar, duck!.px, -10, -HI.bigstar.px.length - 1 - (duck!.px.length - 2 * miniOf('clawd', slot).duck.length - 2)).px)],
    },
  }
})
