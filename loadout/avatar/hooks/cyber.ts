// The cyber family's drawn Opus characters: a cyber ninja (the Ghostrunner world, red) and a
// cyber thief (the Edgerunners world, yellow). Each is one rig of eased joints moved by authored keys, a
// channel at a time, and drawn two ways from the same pose: in true pixels (a Canvas) and in text
// (a Grid of [glyph, fg, bg] cells). Pure: a frame is derived from (who, moment) alone, so previews
// and tests draw what the pane draws.
import { CLEAR, blank } from './canvas'
import type { Canvas } from './canvas'
import { NONE } from './hud'
import type { Grid } from './hud'
import type { Mood } from './mascot'

export type Who = 'ninja' | 'thief'

/** What each is called. */
export const HERO_NAMES: Readonly<Record<Who, string>> = { ninja: 'Jack', thief: 'Lucy' }

/** The art pixels a picture of one is tall at the least, and its text frame: rows (and the fewest it is drawn on), and the fewest columns. */
export const HERO_PX = 96
export const HERO_ROWS = 18
export const HERO_ROWS_LEAST = 16
export const HERO_COLUMNS = 29

// --- the pose ------------------------------------------------------------------

// A pose, a number a channel. Lengths are art pixels, angles degrees. The figure faces "forward"
// (drawn to the left, at the conversation); x is forward, y up from the ground.
//   x, y        the hip; lean, the torso off upright (forward positive); head, the head's own tilt
//   turn        where the head looks: 1 forward in profile, 0 at the viewer, -1 back over the shoulder
//   spin        the whole body turned about its middle: positive a backflip
//   fx fy bx by the near and the far ankle, where they are (not offsets): legs are solved to them
//   as ae bs be the near and the far arm: shoulder then elbow, from hanging down, forward positive
//   p q         where the near and the far hand's thing points (0 down, 90 forward, 180 up); P Q what it is
//   ox oy oa O  a thing in the air: where, turned how, and what
//   rope holo fade alarm type glow   how far a line is out, a hologram's size, how much of the body is
//               gone, the light blue turning to the alert, fingers typing, the visor flaring
//   wink        the visor shut for a moment
//   air nx ny mx my   off the ground: how far the ankles have left where fx.. put them for a place of
//               their own under the hips (nx, ny the near one's, from the hip; mx, my the far one's)
const NAMES = ['x', 'y', 'lean', 'head', 'turn', 'spin', 'fx', 'fy', 'bx', 'by', 'as', 'ae', 'bs', 'be', 'p', 'q', 'P', 'Q', 'ox', 'oy', 'oa', 'O', 'rope', 'holo', 'fade', 'alarm', 'type', 'glow', 'wink', 'air', 'nx', 'ny', 'mx', 'my'] as const
type Name = (typeof NAMES)[number]
export type Pose = Readonly<Record<Name, number>>
/** Channels that hold what they were set to until the next key: nothing is half a katana. */
const STEPPED: ReadonlySet<Name> = new Set<Name>(['P', 'Q', 'O', 'wink'])

// What a hand holds (P, Q) and what flies (O).
const [KATANA, DAGGER, PISTOL] = [1, 3, 4]
const [SHURIKEN, SHARD, SHARD_HELD] = [1, 6, 7]

const EASES = {
  io: (u: number) => u * u * (3 - 2 * u),
  in: (u: number) => u * u,
  out: (u: number) => 1 - (1 - u) ** 2,
  lin: (u: number) => u,
  snap: (u: number) => 1 - (1 - u) ** 3,
  // Past its mark and back: what follows through.
  over: (u: number) => 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2,
} as const
type Ease = keyof typeof EASES

/** A key: at this many milliseconds these channels are at these values, each reached with this ease. Two keys at one time are a cut. */
type Key = readonly [at: number, set: Partial<Pose>, ease?: Ease]
type Track = { at: number[]; to: number[]; ease: Ease[] }
type Clip = { length: number; loops: boolean; tracks: Readonly<Record<Name, Track>> }

/**
 * A clip from its keys: each channel has its own line of keys, so a hand may still be settling while
 * the hips already move on. Keys may be written in any order (a move is written a limb at a time):
 * they are put in time's order here, two at one time staying as written. A loop ends as it began.
 */
function clip(base: Pose, length: number, written: readonly Key[], loops = true): Clip {
  const keys = [...written].sort((a, b) => a[0] - b[0])
  const tracks = {} as Record<Name, Track>
  for (const name of NAMES) {
    const track: Track = { at: [0], to: [base[name]], ease: ['io'] }
    for (const [at, set, ease = 'io'] of keys) {
      const value = set[name]
      if (value === undefined) continue
      if (at === 0 && track.at.length === 1) track.to[0] = value
      else {
        track.at.push(at)
        track.to.push(value)
        track.ease.push(ease)
      }
    }
    if (track.at[track.at.length - 1]! < length) {
      track.at.push(length)
      track.to.push(loops ? track.to[0]! : track.to[track.to.length - 1]!)
      track.ease.push('io')
    }
    tracks[name] = track
  }

  return { length, loops, tracks }
}

const mod = (a: number, n: number) => ((a % n) + n) % n
const lerp = (a: number, b: number, u: number) => a + (b - a) * u
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function sample({ length, loops, tracks }: Clip, time: number): Pose {
  const t = loops ? mod(time, length) : clamp(time, 0, length)
  const pose = {} as Record<Name, number>
  for (const name of NAMES) {
    const { at, to, ease } = tracks[name]
    let i = at.length - 1
    while (i > 0 && at[i]! > t) i -= 1
    const span = i + 1 < at.length ? at[i + 1]! - at[i]! : 0
    pose[name] = span <= 0 || STEPPED.has(name) ? to[i]! : lerp(to[i]!, to[i + 1]!, EASES[ease[i + 1]!]((t - at[i]!) / span))
  }

  return pose
}

const REST: Pose = {
  x: 0, y: 20, lean: 0, head: 0, turn: 0.5, spin: 0, fx: 6, fy: 0, bx: -6, by: 0, as: 0, ae: 0, bs: 0, be: 0, p: 0, q: 0, P: 0, Q: 0,
  ox: 0, oy: 0, oa: 0, O: 0, rope: 0, holo: 0, fade: 0, alarm: 0, type: 0, glow: 0, wink: 0, air: 0, nx: 5, ny: -8, mx: 2.5, my: -7.5,
}

/**
 * A flip's flight: the feet leave at `at` with the hips at `from`, the body goes up and comes down a
 * parabola (`air` milliseconds of it, `peak` high) turning once over: slowly off the toes for a frame,
 * then at an even rate (an eighth of a turn a frame), and all but round two frames before the
 * ground, so the last of the fall is seen upright, the legs let down and reaching for it. It meets
 * the ground at `land`.
 */
const flight = (at: number, air: number, from: number, peak: number, land: number, spin: number): Key[] => [
  [at, { y: from, spin: 0, air: 0 }],
  [at + air / 2, { y: peak }, 'out'], [at + air, { y: land }, 'in'],
  [at + 90, { spin: spin * 0.07 }, 'in'], [at + air - 200, { spin: spin * 0.955 }, 'lin'], [at + air, { spin }, 'out'], [at + air, { spin: 0 }],
  [at + 180, { air: 1 }, 'out'], [at + air - 300, { air: 1 }], [at + air - 60, { air: 0 }],
]
/** How long a flip is in the air. */
const AIR = 900

// --- Kurenai's moves -------------------------------------------------------------
//
// At rest she waits as a swordsman does before a draw: low, the katana in its scabbard at the hip,
// the near hand over its hilt. Every flourish starts from that and comes back to it, exactly.

const N_STANCE = { x: 0, y: 19.5, lean: 8, head: -6, turn: 0.45, fx: 7, fy: 0, bx: -5, by: 0, as: 2, ae: 72, bs: -14, be: 20 }
// (Off the ground her knees come up to her chest: a ball, the head leading.)
const NINJA: Pose = { ...REST, ...N_STANCE, p: 100, nx: 4.5, ny: -4, mx: 3, my: -3.6 }
// The blade as it lies in the scabbard: pointing back and a little down.
const SHEATHED = 290
// The hand back on the hilt, the blade home: how every move with the katana out ends. (`p`: the same lie of the blade, named
// a turn lower for a blade that comes to it from in front and below rather than over the shoulder.)
const sheathed = (at: number, p = SHEATHED): Key[] => [
  [at, { as: 14, ae: 70, p, lean: 10, x: 0, y: 18.5, head: -4, bs: -14, be: 20 }],
  [at + 270, { as: 2, ae: 72 }, 'in'], [at + 270, { P: 0 }],
  [at + 540, N_STANCE],
]

const NINJA_IDLE = clip(NINJA, 5400, [
  // Now and then the head turns from the viewer to the conversation, and stays on it a while.
  [1500, { turn: 0.45, head: -6 }], [1950, { turn: 1, head: -10 }], [4200, { turn: 1, head: -10 }], [4700, { turn: 0.45, head: -6 }],
  [2700, { x: 0.8, lean: 9.5 }], [5000, { x: 0, lean: 8 }],
  // The fingers settle on the hilt.
  [3000, { ae: 72 }], [3400, { ae: 67 }], [3900, { ae: 72 }],
])

const NINJA_FLOURISHES: readonly Clip[] = [
  // A backflip: a coil, a drive up through straight legs, off the toes, a tuck through the turn, the feet let down to find the ground, a crouch that takes it and is held, and up.
  clip(NINJA, 3600, [
    [270, { y: 14, lean: 22, head: -14, as: -50, ae: 20, bs: -60, be: 15 }],
    [360, { y: 13.5, lean: 24 }],
    [450, { y: 21, lean: 2, as: 120, ae: 10, bs: 110, be: 10, head: 0 }, 'in'],
    [540, { lean: -12, as: 165, ae: 5, bs: 155, be: 5, head: 8 }, 'lin'],
    ...flight(540, AIR, 22.5, 40, 20.5, 360),
    [720, { as: 62, ae: 96, bs: 54, be: 92, lean: 30, head: 6 }], [1170, { as: 62, ae: 96, bs: 54, be: 92, lean: 30, head: 6 }],
    [1440, { lean: 12, as: 40, ae: 20, bs: -30, be: 10, head: -8, fx: 8, bx: -6 }, 'in'],
    [1620, { y: 13.5, lean: 28, head: -22, as: 30, ae: 35, bs: -70, be: -10 }, 'out'],
    [1710, { y: 13, lean: 29 }],
    [2090, { y: 13.6, lean: 27, head: -18, as: 30, ae: 35, bs: -66, be: -10, fx: 8, bx: -6 }],
    [2610, N_STANCE],
  ], false),
  // The katana drawn, spun three times in the hand, stopped high, and sheathed.
  clip(NINJA, 3600, [
    [270, { y: 18, lean: 12, as: 6, ae: 76 }],
    [330, { P: KATANA, p: SHEATHED }],
    [330, { as: 6, ae: 76, lean: 12 }], [450, { as: 40, ae: 50, lean: 6, p: 250 }, 'in'], [560, { as: 95, ae: 15, lean: 2, p: 200 }, 'out'],
    [720, { as: 122, ae: 28, p: 180, y: 20 }],
    [1530, { p: 180 + 1080 }], [1530, { p: 180 }],
    [1100, { as: 104, ae: 48 }], [1530, { as: 122, ae: 28 }],
    [1660, { as: 140, ae: 12, p: 206, lean: -2, head: -12 }, 'over'],
    [1680, { glow: 0 }], [1770, { glow: 1 }, 'snap'], [2100, { glow: 0 }],
    [2000, { as: 140, ae: 12, p: 206, lean: -2, head: -12, y: 20 }],
    [2130, { as: 48, ae: 24, p: 62, lean: 10, head: -8, y: 18.5 }, 'in'],
    ...sheathed(2400, SHEATHED - 360),
  ], false),
  // A draw that is already the cut: rising, its arc hanging in the air; a second cut down through it; the blade flicked clean and put away.
  clip(NINJA, 3600, [
    [300, { y: 15, lean: 25, x: -2, head: -18, as: -4, ae: 82, bs: -20, be: 30 }],
    [390, { P: KATANA, p: SHEATHED }], [390, { as: -4, ae: 82, x: -2, y: 15, lean: 25, fx: 7 }],
    [570, { as: 132, ae: 4, p: SHEATHED + 240, x: 3, y: 17.5, lean: 2, fx: 11, head: -8 }, 'out'], [570, { p: 170 }],
    [900, { as: 140, ae: 8, p: 186, x: 3.5, y: 17.5, lean: 0 }, 'out'],
    [1020, { as: 150, ae: 20, p: 206, lean: -3 }],
    [1140, { as: 42, ae: 14, p: 56, y: 14, lean: 24, x: 0, head: -20 }, 'in'],
    [1600, { as: 38, ae: 16, p: 52, y: 14, lean: 25, x: 0 }, 'out'],
    [1780, { as: 30, ae: 70, p: 128, y: 16, lean: 14, fx: 11 }, 'snap'],
    [2200, { fx: 7 }],
    ...sheathed(2200),
  ], false),
  // Two throwing stars: the first from behind the shoulder, the arm wound back and whipped over; the second from low, off the hip.
  clip(NINJA, 3600, [
    [270, { as: -80, ae: -40, lean: -6, head: 0, turn: 1, x: -1 }],
    [360, { as: -86, ae: -46, lean: -7, x: -1, y: 19.5 }],
    [450, { as: 100, ae: 0, lean: 16, x: 2, y: 18 }, 'snap'],
    [450, { O: SHURIKEN, ox: 16, oy: 35, oa: 0 }], [990, { ox: 54, oy: 37, oa: 270 }, 'lin'], [990, { O: 0 }],
    [800, { as: 108, ae: 8, lean: 12 }, 'out'],
    [1080, { as: -40, ae: -30, lean: 2, x: 0, y: 16.5, bs: 30, be: 40 }],
    [1170, { as: -46, ae: -34, y: 16, x: 0, lean: 2 }],
    [1260, { as: 62, ae: 6, lean: 20, x: 2.5, y: 15.5 }, 'snap'],
    [1260, { O: SHURIKEN, ox: 15, oy: 21, oa: 0 }], [1800, { ox: 53, oy: 17, oa: 270 }, 'lin'], [1800, { O: 0 }],
    [1650, { as: 70, ae: 10, lean: 16, x: 2.5, y: 15.5 }, 'out'],
    [2340, N_STANCE],
  ], false),
  // Gone, and there: she comes apart where she stands, is a step ahead with the cut already made and the blade out behind her, holds it, and is back.
  clip(NINJA, 3600, [
    [300, { y: 14.5, lean: 26, head: -18, as: -6, ae: 84, turn: 1 }],
    [390, { P: KATANA, p: SHEATHED }],
    // (She goes out already moving, and comes back still sliding to her stop: what is left of her is seen to cross the ground between.)
    [360, { fade: 0, x: 0, fx: 7, bx: -5 }], [630, { fade: 1, x: 8, fx: 15, bx: 3 }, 'in'],
    [630, { y: 14.5, lean: 26, head: -18, as: -6, ae: 84, bs: -14, be: 20, p: SHEATHED }],
    [810, { fade: 1 }], [810, { x: 9.5, fx: 17, bx: 3.5 }, 'lin'],
    [810, { y: 13.5, lean: 30, as: -50, ae: -10, p: 300, bs: 60, be: 20, head: -20 }],
    [1080, { fade: 0 }, 'lin'], [1080, { x: 13.5, fx: 21.5, bx: 6.5 }, 'out'],
    [800, { glow: 0 }], [810, { glow: 1 }], [1500, { glow: 0 }],
    [1530, { x: 13.5, fx: 21.5, bx: 6.5, y: 13.8, lean: 29, as: -46, ae: -8, p: 296, bs: 60, be: 20, head: -20 }],
    [1530, { fade: 0 }], [1800, { fade: 1, x: 8, fx: 16, bx: 1 }, 'in'],
    [1800, { y: 13.8, lean: 29, as: -46, ae: -8, p: 296, bs: 60, be: 20, head: -20 }],
    [1980, { fade: 1 }], [1980, { x: 5, fx: 12, bx: 0 }, 'lin'],
    [1980, { y: 17, lean: 12, as: 30, ae: 66, p: 130, bs: -14, be: 20, head: -8 }],
    [2250, { fade: 0 }, 'lin'], [2250, { x: 0, fx: 7, bx: -5 }, 'out'],
    [2400, { x: 0, y: 17, lean: 12, as: 30, ae: 66, p: 130, head: -8 }],
    ...sheathed(2700),
  ], false),
]

// A kata, the blade out all through it: a cut down from overhead, the blade swept back low, a rising
// cut, a whirl, a step back and a thrust, and a last cut down into the guard it began in.
const N_GUARD = { as: 52, ae: 40, p: 116, y: 18, lean: 6, x: 0, fx: 7, bx: -6, bs: -30, be: 45, head: -8 }
const NINJA_WORKING = clip({ ...NINJA, ...N_GUARD, P: KATANA, turn: 1, glow: 1 }, 4320, [
  [300, { as: 152, ae: 22, p: 205, y: 20, lean: -3, x: 0 }],
  [420, { as: 54, ae: 14, p: 70, y: 15.5, lean: 18, x: -1 }, 'in'],
  [720, { as: 50, ae: 16, p: 66, y: 15.5, lean: 19, x: -1 }, 'out'],
  [1020, { as: -36, ae: -26, p: 306, y: 17, lean: 3, x: 3, head: -4 }], [1020, { p: -54 }],
  [1260, { as: -38, ae: -28, p: -58, y: 16.5, lean: 5, x: 3 }],
  // (The rising cut comes round under her arm, the hand lifted ahead of it so the point clears the floor.)
  [1320, { as: 64, ae: 44, y: 18.5 }, 'out'], [1350, { as: 70, ae: 36 }, 'lin'],
  [1350, { p: 30, lean: 2, x: 2 }, 'in'],
  [1440, { as: 134, ae: 0, p: 168, y: 20.5, lean: -5, x: 1 }, 'lin'],
  [1650, { as: 140, ae: 4, p: 180, y: 20.5, lean: -6, x: 1 }, 'out'],
  [1800, { y: 17 }], [2160, { y: 18 }],
  [1800, { p: 180 }], [2160, { p: 180 + 360 }], [2160, { p: 180 }], [2340, { p: 116 }],
  [2340, { as: 52, ae: 40, lean: 6, x: -5, head: -8 }],
  [2460, { as: 84, ae: 4, p: 92, x: -3.5, fx: 8, y: 15.5, lean: 20 }, 'snap'],
  [2820, { as: 86, ae: 2, p: 91, x: -3.5, fx: 8, y: 15.5, lean: 21 }],
  [3120, { as: 52, ae: 40, p: 116, x: 0, fx: 7, y: 18, lean: 6 }],
  [3400, { as: 152, ae: 22, p: 205, y: 20, lean: -3, x: 0 }],
  [3520, { as: 54, ae: 14, p: 70, y: 15.5, lean: 18, x: -1 }, 'in'],
  [3870, { as: 50, ae: 16, p: 66, y: 15.5, lean: 19, x: -1 }, 'out'],
])

// A backflip, the drawn blade tucked along her arm; the landing taken low; then she rises with the katana wheeling in her hand and stops it over a lifted chin.
const NINJA_HAPPY = clip(NINJA, 4000, [
  [180, { P: KATANA, p: SHEATHED }], [180, { as: 2, ae: 72 }],
  [360, { y: 14, lean: 22, as: -40, ae: 60, p: 250, bs: -55, be: 10, head: -14 }],
  [450, { y: 21, lean: 2, as: 110, ae: 20, bs: 120, be: 10, head: 0 }, 'in'],
  [540, { lean: -12, as: 150, ae: 30, bs: 155, be: 5, head: 8 }, 'lin'],
  ...flight(540, AIR, 22.5, 40, 20.5, 360),
  [720, { as: 62, ae: 96, bs: 54, be: 92, lean: 30, head: 6, p: 250 }], [1170, { as: 62, ae: 96, bs: 54, be: 92, lean: 30, head: 6, p: 250 }],
  [1440, { lean: 12, as: 50, ae: 20, bs: -30, be: 10, head: -8, p: 110, fx: 8, bx: -6 }, 'in'],
  [1620, { y: 13.5, lean: 28, head: -22, as: 40, ae: 50, p: 130, bs: -60, be: -10 }, 'out'],
  [1800, { y: 13.8, lean: 27, as: 40, ae: 50, bs: -60, be: -10, head: -22, turn: 0.45 }],
  [1800, { p: 130 }], [2340, { p: 186 + 720 }, 'out'], [2340, { p: 186 }],
  [2250, { y: 21, lean: -4, as: 150, ae: 22, bs: -34, be: -30, head: -16, turn: 0.2, fx: 7, bx: -6 }, 'over'],
  [2250, { glow: 0 }], [2340, { glow: 1 }, 'snap'], [2900, { glow: 0 }],
  [3060, { y: 21, lean: -4, as: 150, ae: 22, p: 186, bs: -34, be: -30, head: -16, turn: 0.2, fx: 7, bx: -6 }],
  // (Out of its high stop the blade is cut down in front of her, a quarter of a circle, and only then goes home.)
  [3190, { as: 48, ae: 24, p: 62, lean: 10, head: -8, y: 18.5, turn: 0.45 }, 'in'],
  ...sheathed(3440, SHEATHED - 360),
], false)

// A low guard, the blade up between her and whatever comes; she breathes, her grip works on the hilt, the head goes from the conversation to the viewer and back, then over her shoulder, and a foot shifts.
const NINJA_WORRIED = clip({ ...NINJA, y: 14.5, lean: 20, fx: 10, bx: -9, as: 30, ae: 70, p: 125, bs: -40, be: 42, P: KATANA, alarm: 1, turn: 1, head: -14 }, 3600, [
  [700, { turn: 1, head: -14 }], [900, { turn: 0, head: -10 }], [1500, { turn: 0, head: -10 }], [1700, { turn: 1, head: -14 }],
  [2300, { turn: 1, head: -14 }], [2450, { turn: -0.6, head: -8 }], [2900, { turn: -0.6, head: -8 }], [3100, { turn: 1, head: -14 }],
  [600, { y: 15.7, lean: 17 }], [1200, { y: 14.5, lean: 20 }], [1800, { y: 15.7, lean: 17 }], [2400, { y: 14.5, lean: 20, x: 0, bx: -9 }],
  [2580, { x: -2, bx: -12, y: 14 }, 'out'], [3300, { x: -2, bx: -12, y: 14.3 }],
  [900, { p: 131, as: 27, ae: 74 }], [1700, { p: 125, as: 30, ae: 70 }], [2600, { p: 133, as: 27, ae: 76 }], [3300, { p: 125, as: 30, ae: 70 }],
])

// --- Magpie's moves ---------------------------------------------------------------
//
// At rest she stands easy: weight on one leg, a hand on her hip, the deck on her other forearm
// raised where she can read it.

const T_STANCE = { x: 0, y: 20.5, lean: 3, head: -3, turn: 0.5, fx: 5, fy: 0, bx: -5, by: 0, as: -28, ae: 75, bs: 25, be: 95, holo: 0.3 }
const THIEF: Pose = { ...REST, ...T_STANCE }

const THIEF_IDLE = clip(THIEF, 5400, [
  // Her weight goes from one leg to the other; in between she reads her deck, and taps at it.
  [1300, { x: -1.5, lean: 1, y: 20.2 }], [2700, { x: 1.5, lean: 5, y: 20.5 }], [4000, { x: -1, lean: 2, y: 20.2 }],
  [1700, { head: -3, turn: 0.5, as: -28, ae: 75, holo: 0.3 }], [2150, { head: 14, turn: 0.9, as: 36, ae: 86, holo: 0.5 }],
  [2150, { type: 0 }], [2200, { type: 0.8 }], [3200, { type: 0.8, head: 14, turn: 0.9, as: 36, ae: 86, holo: 0.5 }], [3250, { type: 0 }],
  [3700, { head: -3, turn: 0.5, as: -28, ae: 75, holo: 0.3 }],
])

const THIEF_FLOURISHES: readonly Clip[] = [
  // An aerial: a dip, a drive up off the toes, over she goes forward with her legs split and her hair flying, lands a step ahead and takes it low with her arms spread, and hops back.
  clip(THIEF, 3600, [
    [270, { y: 15.5, lean: 20, head: 4, as: -55, ae: 10, bs: -45, be: 10, holo: 0 }],
    [360, { y: 15, lean: 22, x: 0 }],
    [450, { y: 21.5, lean: 14, as: 80, ae: 0, bs: 30, be: 0, x: 1 }, 'in'],
    [540, { lean: 22, as: 104, ae: 0, bs: -96, be: 0, x: 2 }, 'lin'],
    ...flight(540, AIR, 22.5, 38.5, 20.5, -360),
    [540 + AIR, { x: 9 }, 'lin'],
    // (Her body one line through the turn, her legs split wide: the turn is all that changes from a frame to the next.)
    [540, { nx: 5, ny: -8, mx: 2.5, my: -7.5 }], [720, { nx: 14, ny: -10, mx: -13, my: -9 }], [1140, { nx: 14, ny: -10, mx: -13, my: -9 }],
    [900, { fx: 5, bx: -5 }], [900, { fx: 14, bx: 4 }], [1380, { nx: 5, ny: -8, mx: 2.5, my: -7.5 }],
    [720, { lean: 14, head: 0 }, 'lin'], [1230, { as: 104, ae: 0, bs: -96, be: 0, lean: 14, head: 0 }],
    [1440, { lean: 12, as: -40, ae: -10, bs: 110, be: -10, head: -6 }, 'in'],
    [1620, { y: 14.5, lean: 22, head: -14, as: -80, ae: -10, bs: 150, be: -10 }, 'out'],
    [1710, { y: 14.2 }],
    [1980, { y: 14.8, lean: 21, as: -76, ae: -10, bs: 146, be: -10, head: -14 }],
    [1980, { x: 9, fx: 14, fy: 0, bx: 4, by: 0 }],
    // (Up out of it over three frames, and a small hop back to where she stood.)
    [2250, { y: 21.5, x: 7, lean: 8, as: -30, ae: 20, bs: 60, be: 40, head: -6 }, 'out'],
    [2250, { fx: 14, fy: 0, bx: 4, by: 0 }],
    [2430, { y: 23.5, x: 3.5, fx: 8.5, fy: 3.5, bx: -1.5, by: 3, lean: 5 }, 'out'],
    [2610, { y: 19.6, x: 0, fx: 5, fy: 0, bx: -5, by: 0 }, 'in'],
    [2700, { y: 18.6 }], [3060, T_STANCE],
  ], false),
  // A dagger off her thigh, twirled, tossed up end over end while she watches it, caught, pointed, put back.
  clip(THIEF, 3600, [
    [200, { as: -8, ae: 18 }],
    [300, { P: DAGGER, p: 10 }],
    [300, { as: -8, ae: 18, holo: 0.3 }], [520, { as: 62, ae: 58, p: 120, holo: 0, bs: 8, be: 40 }, 'out'],
    [1000, { p: 120 + 720 }], [1000, { p: 120 }],
    [1000, { as: 62, ae: 58, y: 20.5 }], [1090, { as: 42, ae: 40, y: 19.5 }],
    [1180, { as: 124, ae: 16, y: 21 }, 'snap'],
    [1180, { P: 0, O: DAGGER, ox: 10, oy: 43, oa: 180 }], [1560, { oy: 64 }, 'out'], [1940, { oy: 41, ox: 11 }, 'in'], [1940, { oa: 180 - 1080 }, 'lin'],
    [1180, { head: -3, turn: 0.5 }], [1300, { head: -24, turn: 0.8 }], [1850, { head: -24, turn: 0.8 }], [2050, { head: -3, turn: 0.5 }],
    [1850, { as: 110, ae: 30 }], [1940, { as: 100, ae: 36 }],
    [1940, { P: DAGGER, O: 0, p: 180 }],
    [2060, { as: 72, ae: 52, p: 160, y: 19.5 }, 'out'],
    [2300, { as: 96, ae: 6, p: 94, lean: 6, y: 20.5 }, 'over'], [2700, { as: 96, ae: 6, p: 94, lean: 6 }],
    [3000, { as: -8, ae: 18, p: 10, lean: 3 }], [3080, { P: 0 }], [3080, { as: -8, ae: 18 }],
    [3400, T_STANCE],
  ], false),
  // Her pistol from the back of her belt, spun round a finger a quarter turn a frame, levelled, a shot that kicks, a wink, a last turn, and away.
  clip(THIEF, 3600, [
    [200, { as: -50, ae: 40 }],
    [320, { P: PISTOL, p: 30 }],
    [320, { as: -50, ae: 40, holo: 0.3 }], [600, { as: 66, ae: 56, p: 90, holo: 0, bs: -8, be: 30 }, 'out'],
    [1680, { p: 90 - 1080 }, 'lin'], [1680, { p: 90 }],
    [1100, { as: 54, ae: 72 }], [1680, { as: 72, ae: 44, lean: 3, head: -3, turn: 0.5, x: 0 }],
    [1800, { as: 90, ae: 0, lean: 8, head: -6, turn: 1, x: 1 }, 'snap'],
    [2070, { as: 90, ae: 0, p: 90, lean: 8, glow: 0 }],
    [2160, { as: 106, ae: 8, p: 114, lean: 4, glow: 1 }, 'snap'], [2250, { glow: 0 }],
    [2430, { as: 90, ae: 0, p: 90, lean: 8 }, 'out'],
    [2430, { wink: 1 }], [2610, { wink: 0 }],
    [2610, { as: 90, ae: 0, p: 90, lean: 8, head: -6, turn: 1, x: 1 }],
    [2970, { p: 390, as: -50, ae: 40, lean: 3, x: 0 }], [2970, { p: 30 }],
    [3060, { P: 0 }], [3060, { as: -50, ae: 40 }],
    [3420, T_STANCE],
  ], false),
  // A line shot up and ahead: she swings out on it, legs trailing then kicking through, back past where she stood, and drops.
  clip(THIEF, 3600, [
    [250, { bs: 152, be: 8, head: -14, turn: 0.9, holo: 0 }],
    [330, { rope: 0 }], [520, { rope: 1 }, 'lin'],
    [650, { y: 19, lean: 8, x: 0, as: -40, ae: 30 }],
    [650, { fx: 5, fy: 0, bx: -5, by: 0 }],
    [1250, { x: 19 }], [1900, { x: -7 }], [2150, { x: 0 }, 'out'],
    [950, { y: 27 }, 'out'], [1250, { y: 35 }, 'out'], [1600, { y: 27 }, 'in'], [1900, { y: 31 }, 'out'], [2150, { y: 19.5 }, 'in'],
    [950, { lean: -4 }], [1250, { lean: -26, bs: 168, be: 4, as: -70, ae: 10 }], [1900, { lean: 22, bs: 150, be: 14 }], [2150, { lean: 6 }],
    [950, { fx: 1, fy: 9, bx: -4, by: 8 }], [1250, { fx: 30, fy: 23, bx: 25, by: 20 }], [1600, { fx: 9, fy: 8, bx: 5, by: 7 }],
    [1900, { fx: -17, fy: 14, bx: -14, by: 12 }], [2150, { fx: 5, fy: 0, bx: -5, by: 0 }, 'in'],
    [2150, { rope: 1 }], [2260, { rope: 0 }],
    [2300, { y: 17 }, 'out'], [2650, T_STANCE],
  ], false),
  // A data shard that is not hers: flipped off her fingers, caught, held up to the light, a wink, and into her jacket.
  clip(THIEF, 3600, [
    [300, { as: 40, ae: 70, holo: 0 }],
    [300, { O: SHARD_HELD }],
    [450, { O: SHARD, ox: 13, oy: 31, oa: 0 }], [450, { as: 52, ae: 78 }, 'snap'],
    [750, { oy: 47 }, 'out'], [1050, { oy: 31 }, 'in'], [1050, { oa: 720 }, 'lin'],
    [600, { head: -14 }], [1000, { head: -2 }],
    [1050, { O: SHARD_HELD }], [1050, { as: 40, ae: 70, turn: 0.5, lean: 3 }],
    [1320, { as: 78, ae: 92, head: 4, turn: 0.8, lean: 5 }],
    [1700, { wink: 1 }], [1880, { wink: 0 }], [1620, { glow: 0 }], [1710, { glow: 1 }, 'snap'], [2100, { glow: 0 }],
    [2000, { as: 78, ae: 92, head: 4, turn: 0.8, lean: 5 }],
    [2320, { as: 12, ae: 124, head: 8, lean: 3 }],
    [2400, { O: 0 }],
    [2520, { ae: 114 }], [2640, { ae: 124, as: 12, head: 8, turn: 0.8 }],
    [3050, T_STANCE],
  ], false),
]

// Typing on a keyboard of light that hangs tilted at her waist, her elbows bent over it, code running
// up a screen ahead of her; between two bursts she winds a dagger back off her thigh and flicks it
// round, or feels for the pistol at her back with a look at who is watching.
const T_TYPING = { as: 30, ae: 62, bs: 38, be: 58 }
const THIEF_WORKING = clip({ ...THIEF, ...T_TYPING, holo: 1, type: 1, lean: 8, head: 8, turn: 0.9, y: 20, fx: 6, bx: -5 }, 4320, [
  [1560, { type: 1 }], [1620, { type: 0 }], [2640, { type: 0 }], [2700, { type: 1 }], [3600, { type: 1 }], [3660, { type: 0 }], [4260, { type: 0 }],
  [1620, { as: 30, ae: 62 }], [1800, { as: -8, ae: 18 }], [1830, { P: DAGGER, p: 10 }], [1830, { as: -8, ae: 18 }],
  [2130, { as: -40, ae: -20, p: -60 }],
  [2250, { as: 40, ae: 50, p: 150 }, 'snap'],
  [2340, { as: 36, ae: 54, p: 170 }],
  [2500, { as: -8, ae: 18, p: 10 }], [2530, { P: 0 }], [2530, { as: -8, ae: 18 }], [2700, { as: 30, ae: 62 }],
  [3660, { bs: 38, be: 58, head: 8, turn: 0.9 }], [3840, { bs: -42, be: 36, head: -4, turn: 0.2 }], [4080, { bs: -42, be: 36, head: -4, turn: 0.2 }], [4290, { bs: 38, be: 58, head: 8, turn: 0.9 }],
  [800, { x: 0.8 }], [2600, { x: -0.6 }],
  ...[0, 2880].flatMap(from => [0, 1, 2, 3].flatMap((n): Key[] => [[from + n * 360 + 90, { y: 19.3 }], [from + n * 360 + 270, { y: 20 }]])),
  [720, { as: 30, ae: 62 }], [840, { as: 50, ae: 34 }, 'out'], [990, { as: 50, ae: 34 }], [1110, { as: 30, ae: 62 }],
  [400, { lean: 9.5, head: 11 }], [1400, { lean: 7.5, head: 7 }], [1620, { head: 4 }], [2700, { head: 8, lean: 8 }], [3000, { lean: 9.5, head: 11 }], [3600, { lean: 8, head: 8 }],
])

// A backflip with a dagger in each hand; the landing taken low; both spun as she comes up, and one held high over a cocked hip.
const THIEF_HAPPY = clip(THIEF, 4000, [
  [200, { P: DAGGER, Q: DAGGER, p: 20, q: 20 }],
  [270, { y: 15.5, lean: 18, as: -40, ae: 20, bs: -30, be: 15, holo: 0 }],
  [360, { y: 15, lean: 20 }],
  [450, { y: 21.5, lean: 2, as: 110, ae: 10, bs: 120, be: 10, head: 0 }, 'in'],
  [540, { lean: -12, as: 150, ae: 0, bs: 140, be: 0, head: 8 }, 'lin'],
  ...flight(540, AIR, 22.5, 40, 20.5, 360),
  [540, { nx: 5, ny: -8, mx: 2.5, my: -7.5 }], [720, { nx: 4.5, ny: -4.5, mx: 3, my: -4 }], [1140, { nx: 4.5, ny: -4.5, mx: 3, my: -4 }], [1380, { nx: 5, ny: -8, mx: 2.5, my: -7.5 }],
  [720, { as: 64, ae: 92, bs: 56, be: 90, lean: 28, head: 4 }], [1170, { as: 64, ae: 92, bs: 56, be: 90, lean: 28, head: 4 }],
  [1440, { lean: 12, as: -20, ae: 0, bs: -40, be: 0, head: -6, fx: 6, bx: -6 }, 'in'],
  [1620, { y: 14.5, lean: 24, as: -30, ae: -10, bs: -55, be: 0, head: -18 }, 'out'],
  [1800, { y: 14.8, lean: 23, as: -30, ae: -10, bs: -55, be: 0, head: -18 }],
  [2070, { y: 21, lean: -2, as: 110, ae: 22, bs: 62, be: 42, head: -8 }],
  // (Both spun as she rises, the near arm going up all the while: each stops where it will be held.)
  [2070, { p: 180, q: 90 }], [2520, { p: 186 + 720, q: -50 - 720 }], [2520, { p: 186, q: -50 }],
  [2520, { turn: 0.5, x: 0, fx: 6, bx: -6, as: 148, ae: 16, bs: 20, be: 60, head: -8, lean: -2 }],
  [2700, { as: 160, ae: 10, p: 186, bs: -30, be: 80, q: -50, head: -12, turn: 0.2, lean: -3, x: 0.5, fx: 6, bx: -3 }, 'over'],
  [2650, { glow: 0 }], [2740, { glow: 1 }, 'snap'], [3200, { glow: 0 }], [2900, { wink: 1 }], [3080, { wink: 0 }],
  [3350, { as: 160, ae: 10, p: 186, bs: -30, be: 80, q: -50, head: -12, turn: 0.2, lean: -3, x: 0.5, y: 21 }],
  [3650, { as: -8, ae: 18, bs: 10, be: 30, p: 10, q: 10, x: 0 }], [3740, { P: 0, Q: 0 }], [3740, { holo: 0 }],
  [3980, T_STANCE],
], false)

// Down low, a dagger out; she breathes, looks ahead, then back over her shoulder, and flinches.
const THIEF_WORRIED = clip({ ...THIEF, y: 12.5, lean: 24, fx: 9, bx: -8, as: 4, ae: 30, P: DAGGER, p: 70, bs: 30, be: 100, holo: 0.5, alarm: 1, head: -8, turn: 1 }, 3600, [
  [900, { turn: 1, head: -8, lean: 24, x: 0 }], [1150, { turn: -1, head: -2, lean: 19, x: -1 }], [2300, { turn: -1, head: -2, lean: 19, x: -1 }], [2550, { turn: 1, head: -8, lean: 24, x: 0 }],
  [600, { y: 13.1 }], [1200, { y: 12.5 }], [1800, { y: 13.1 }], [2400, { y: 12.5 }],
  [2950, { y: 12.7 }], [3050, { y: 11 }, 'snap'], [3300, { y: 12.5 }],
  [600, { p: 70, ae: 30 }], [900, { p: 82, ae: 36 }], [1300, { p: 66, ae: 28 }], [2400, { p: 74, ae: 34 }], [3300, { p: 70, ae: 30 }],
])

const CLIPS: Readonly<Record<Who, { idle: Clip; flourishes: readonly Clip[]; working: Clip; happy: Clip; worried: Clip }>> = {
  ninja: { idle: NINJA_IDLE, flourishes: NINJA_FLOURISHES, working: NINJA_WORKING, happy: NINJA_HAPPY, worried: NINJA_WORRIED },
  thief: { idle: THIEF_IDLE, flourishes: THIEF_FLOURISHES, working: THIEF_WORKING, happy: THIEF_HAPPY, worried: THIEF_WORRIED },
}

// --- when ------------------------------------------------------------------------

const FRAME_MS = 90
/** Idle is a cycle of this many milliseconds: the stance for CALM_MS of it, then one flourish. */
export const CYCLE_MS = 9000
export const CALM_MS = 5400
export const FLOURISHES = 5
/** How long a pose takes to become another mood's. */
export const BLEND_MS = 270
/** What breathes, sways and pulses at rest does it in this long, or a part of it: the stance comes round whole. */
const BREATH_MS = 2700
export const FLOURISH_NAMES: Readonly<Record<Who, readonly string[]>> = {
  ninja: ['backflip', 'spin-sheathe', 'draw-slash', 'shuriken', 'vanish-dash'],
  thief: ['aerial', 'dagger-toss', 'pistol-spin', 'grapple', 'shard'],
}

/** Which flourish plays at `now`, -1 for none: each cycle's is the next of the five, so it is known from the clock alone. */
export const flourishOf = (now: number): number => (mod(now, CYCLE_MS) < CALM_MS ? -1 : Math.floor(now / CYCLE_MS) % FLOURISHES)

/**
 * The flourish a character idle since `since` plays at `now`, -1 for none. A flourish is played whole
 * or not at all: one already under way when she came to rest (a cheer over, a worry gone) is left
 * out, and she holds the stance till the next cycle. Joined part-way it would be a jump: half a flip in a frame.
 */
export const flourishAt = (now: number, since = 0): number => (since > now - mod(now, CYCLE_MS) + CALM_MS ? -1 : flourishOf(now))

/**
 * A moment of a character's life: its mood, the clock, since when the mood has lasted (a flip starts
 * when the joy does), the working kata's own clock (it runs faster while a tool does) and the mood
 * before, which the pose leaves over BLEND_MS rather than at once.
 */
export type Moment = { mood: Mood; now: number; since?: number; clock?: number; was?: { mood: Mood; since: number } }

/** Where a character is in its moods: the one it is in, since when, and the one before. */
export type Beat = { mood: Mood; since: number; was?: { mood: Mood; since: number } }

/**
 * The beat after `beat`, the mood being `mood` at `now`. A mood that has a cause (a cheer: a turn
 * done, a pet) began at `began`; one struck again while it lasts starts its move over, from wherever
 * the last one had got to.
 */
export function beatAfter(beat: Beat, mood: Mood, now: number, began?: number): Beat {
  const isAgain = mood === beat.mood && began !== undefined && began > beat.since
  if (mood === beat.mood && !isAgain) return beat

  return { mood, since: Math.min(now, began ?? now), was: { mood: beat.mood, since: beat.since } }
}

function poseOf(who: Who, mood: Mood, now: number, since: number, clock: number): Pose {
  const set = CLIPS[who]
  const turn = mod(now, CYCLE_MS)
  const flourish = flourishAt(now, since)
  // (The stance held in a flourish's place is the one every flourish ends in, and every cycle begins in.)
  const pose = mood === 'idle' ? (turn < CALM_MS ? sample(set.idle, turn) : flourish < 0 ? sample(set.idle, 0) : sample(set.flourishes[flourish]!, turn - CALM_MS))
    : mood === 'working' ? sample(set.working, clock) : sample(set[mood], now - since)
  // (The other moods breathe in their own keys: their loops close by themselves.)
  if (mood !== 'idle') return pose
  // Breathing, under everything at rest: the hips sink a little, the chest follows, the arms after it.
  const breath = (lag: number) => Math.sin((2 * Math.PI * (now - lag)) / BREATH_MS)

  return { ...pose, y: pose.y + (pose.air > 0 || pose.fy > 1 ? 0 : 0.45 * breath(0)), lean: pose.lean + 0.9 * breath(200), ae: pose.ae + 1.6 * breath(420), be: pose.be + 1.6 * breath(520) }
}

/** The pose at a moment, `lag` milliseconds ago: what trails (a scarf, hair, a blade's arc) is drawn from where the body just was. */
export function heroPose(who: Who, m: Moment, lag = 0): Pose {
  const [now, since] = [m.now - lag, m.since ?? 0]
  const clock = (m.clock ?? m.now) - lag
  if (m.was === undefined || now - since >= BLEND_MS) return poseOf(who, m.mood, now, since, clock)
  const before = poseOf(who, m.was.mood, now, m.was.since, clock)
  if (now <= since) return before
  const [after, u] = [poseOf(who, m.mood, now, since, clock), EASES.io((now - since) / BLEND_MS)]
  const pose = {} as Record<Name, number>
  for (const name of NAMES) pose[name] = STEPPED.has(name) ? (u < 0.5 ? before[name] : after[name]) : lerp(before[name], after[name], u)

  return pose
}

// How far a channel may go in a few frames and the figure still be at rest: a breath's worth.
const STILL: Partial<Record<Name, number>> = { turn: 0.04, type: 0.05, holo: 0.04, glow: 0.2, fade: 0.01 }

/**
 * Whether nothing but breathing moves at a moment, nor will in the next few frames: the stance,
 * between two of its own small moves, and not about to break into a flourish. Then a frame in a few
 * is enough; whatever moves faster (a head turning, fingers on a deck, a flourish) is drawn every frame.
 */
export function isAtRest(who: Who, m: Moment): boolean {
  const ahead = 3 * FRAME_MS
  if (m.mood !== 'idle' || flourishAt(m.now, m.since) >= 0 || flourishAt(m.now + ahead + FRAME_MS, m.since) >= 0) return false
  if (m.was !== undefined && m.now - (m.since ?? 0) < BLEND_MS + 400) return false
  const [here, soon] = [heroPose(who, m), heroPose(who, { ...m, now: m.now + ahead })]

  return here.type < 0.05 && NAMES.every(name => Math.abs(soon[name] - here[name]) <= (STILL[name] ?? 1.3))
}

// --- the rig -----------------------------------------------------------------------

type V = readonly [number, number]
const RAD = Math.PI / 180
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]]
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k]
const between = (a: V, b: V, u = 0.5): V => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]
const far = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1])
/** A length pointing up, turned forward by an angle; and one hanging down. */
const up = (deg: number, len: number): V => [len * Math.sin(deg * RAD), len * Math.cos(deg * RAD)]
const down = (deg: number, len: number): V => [len * Math.sin(deg * RAD), -len * Math.cos(deg * RAD)]
const turned = (v: V, deg: number): V => [v[0] * Math.cos(deg * RAD) - v[1] * Math.sin(deg * RAD), v[0] * Math.sin(deg * RAD) + v[1] * Math.cos(deg * RAD)]
/** `v` no longer than `most`. */
const capped = (v: V, most: number): V => {
  const length = Math.hypot(v[0], v[1])

  return length > most ? mul(v, most / length) : v
}

// A limb is one length whatever it does: depth is shown by what overlaps what, never by a longer bone.
const [THIGH, SHIN, TORSO, ARM] = [11, 11, 15, 8]
/** From the shoulders' line to the middle of the head: hers is longer, a neck shows under the bob. */
const NECK: Readonly<Record<Who, number>> = { ninja: 4.6, thief: 5.6 }

/** The joints of a pose, where they are once the body has turned; `at` puts a point given in the head's own frame, `off` one in the body's. */
type Rig = {
  pose: Pose
  hip: V; neck: V; head: V; shoulder: V; shoulderF: V; hipN: V; hipF: V
  elbowN: V; handN: V; elbowF: V; handF: V
  kneeN: V; ankleN: V; toeN: V; kneeF: V; ankleF: V; toeF: V
  /** Where a held thing points, as drawn: its angle, the body's turn added. */
  aim: (deg: number, len: number) => V
  at: (x: number, y: number) => V
  off: (x: number, y: number) => V
}

function rigOf(who: Who, pose: Pose): Rig {
  const hip: V = [pose.x, pose.y]
  const pivot = add(hip, up(pose.lean, 7))
  const spun = (v: V): V => add(pivot, turned(sub(v, pivot), pose.spin))
  const neck = add(hip, up(pose.lean, TORSO))
  const head = add(neck, up(pose.lean + pose.head, NECK[who]))
  // The body is seen from a little in front of its side: the far shoulder and hip show ahead of the near ones.
  const across: V = [Math.cos(pose.lean * RAD), -Math.sin(pose.lean * RAD)]
  const shoulder = add(add(hip, up(pose.lean, TORSO - 2.5)), mul(across, -1.4))
  const shoulderF = add(add(hip, up(pose.lean, TORSO - 2.5)), mul(across, 1.8))
  const [hipN, hipF] = [add(hip, mul(across, -0.8)), add(hip, mul(across, 1))]
  const arm = (from: V, s: number, e: number): [V, V] => {
    const elbow = add(from, down(s, ARM))

    return [elbow, add(elbow, down(s + e, ARM))]
  }
  const leg = (ground: V, tucked: V): [V, V, V] => {
    // Where the ankle is wanted: on its mark, or (off the ground) at its place under the hips. A mark out of the leg's reach is not reached: the foot leaves it.
    const want = between([ground[0], ground[1] + 1.5], add(hip, tucked), pose.air)
    const gap = Math.max(0.001, far(hip, want))
    const reach = clamp(gap, 4, THIGH + SHIN - 0.2)
    const toFoot = mul(sub(want, hip), 1 / gap)
    const ankle = add(hip, mul(toFoot, reach))
    const bend = Math.acos(clamp((THIGH * THIGH + reach * reach - SHIN * SHIN) / (2 * THIGH * reach), -1, 1)) / RAD
    // The knee is the one of the two that is further forward.
    const [a, b] = [add(hip, mul(turned(toFoot, bend), THIGH)), add(hip, mul(turned(toFoot, -bend), THIGH))]
    const air = clamp(ankle[1] / 8, 0, 1)

    return [a[0] > b[0] ? a : b, ankle, add(ankle, [lerp(3.4, 2.2, air), lerp(-0.6, -2.4, air)])]
  }
  const [elbowN, handN] = arm(shoulder, pose.as, pose.ae)
  const [elbowF, handF] = arm(shoulderF, pose.bs, pose.be)
  const [kneeN, ankleN, toeN] = leg([pose.fx, pose.fy], [pose.nx, pose.ny])
  const [kneeF, ankleF, toeF] = leg([pose.bx, pose.by], [pose.mx, pose.my])
  const tilt = pose.lean + pose.head
  const headAt = spun(head)

  return {
    pose, hip: spun(hip), neck: spun(neck), head: headAt, shoulder: spun(shoulder), shoulderF: spun(shoulderF), hipN: spun(hipN), hipF: spun(hipF),
    elbowN: spun(elbowN), handN: spun(handN), elbowF: spun(elbowF), handF: spun(handF),
    kneeN: spun(kneeN), ankleN: spun(ankleN), toeN: spun(toeN), kneeF: spun(kneeF), ankleF: spun(ankleF), toeF: spun(toeF),
    aim: (deg, len) => turned(down(deg, len), pose.spin),
    at: (x, y) => add(headAt, turned(add(mul([Math.cos(tilt * RAD), -Math.sin(tilt * RAD)], x), up(tilt, y)), pose.spin)),
    off: (x, y) => add(spun(hip), turned(add(mul([Math.cos(pose.lean * RAD), -Math.sin(pose.lean * RAD)], x), up(pose.lean, y)), pose.spin)),
  }
}

// --- the brush -----------------------------------------------------------------------

/** A material: its plain tone, where the light catches it, in its own shadow, and (where it is not the figure's) the line round it. */
type Mat = readonly [base: number, light: number, shade: number, edge?: number]

/** A glyph for the text frame, at a cell: over whatever the conversion put there. `band` keeps the cell's own colour as its ground. */
type Stamp = { x: number; y: number; glyph: string; fg: number; band?: true; bg?: number }

/** A head for the text frame, a row of cells a line, a cell [glyph, fg, bg]: drawn as written for a head upright and looking forward (to the left). */
type Face = readonly (readonly (readonly [glyph: string, fg: number, bg?: number])[])[]
// A block glyph seen in a mirror (left for right), and upside down.
const MIRRORED: Readonly<Record<string, string>> = { '▌': '▐', '▐': '▌', '▟': '▙', '▙': '▟', '▜': '▛', '▛': '▜', '▗': '▖', '▖': '▗', '▝': '▘', '▘': '▝' }
const UPENDED: Readonly<Record<string, string>> = { '▀': '▄', '▄': '▀', '▟': '▜', '▜': '▟', '▙': '▛', '▛': '▙', '▗': '▝', '▝': '▗', '▖': '▘', '▘': '▖' }

/**
 * What a character is drawn with. A solid shape goes on the body layer, outlined and lit from the
 * upper left where the layer is pixels; a mass of light (an arc) on the layer over it; a fine line
 * (a blade, a rope, a key of light) on the last, which the text frame draws in dots.
 * Points are the rig's: forward to the left, up up.
 */
type Brush = {
  isText: boolean
  cap: (a: V, b: V, radius: number, mat: Mat) => void
  poly: (points: readonly V[], mat: Mat) => void
  line: (a: V, b: V, color: number) => void
  /** A filled shape of light; `isFaint` thins it to every other dot: a trail's tail, going out. */
  fan: (points: readonly V[], color: number, isFaint?: boolean) => void
  dot: (a: V, color: number) => void
  /** A blade, for the text frame: the quarters of the cells it crosses, so it has one weight at any angle and is seen from across the room. */
  bar: (a: V, b: V, color: number) => void
  /** Text for the cells where `a` is, a glyph a cell; in pixels, a dash a glyph. */
  write: (a: V, text: string, color: number) => void
  /** A band of light half a cell tall, for the text frame alone: a visor. */
  band: (a: V, b: V, color: number) => void
  /** A head, for the text frame alone: the same cells whatever the pose, centred where `a` is, mirrored for a look back and turned over for a head that is upside down. */
  face: (a: V, cells: Face, isMirrored: boolean, isUpended: boolean) => void
  /** What is on the body layer goes out, a band of scan lines at a time: the same bands whatever the frame, so more gone is only ever more. */
  dissolve: (amount: number, tint: number) => void
}

const hash = (a: number, b: number, c = 0): number => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)

  return (h ^ (h >>> 16)) >>> 0
}

function brushOf(body: Canvas, lights: Canvas, strokes: Canvas, cx: number, ground: number, scale: number, edge: number | null, stamps: Stamp[]): Brush {
  const isText = edge === null
  const to = ([x, y]: V): V => [Math.round(cx - x * scale), Math.round(ground - y * scale)]
  const set = (canvas: Canvas, x: number, y: number, color: number) => {
    if (x >= 0 && y >= 0 && x < canvas.width && y < canvas.height) canvas.data[y * canvas.width + x] = color
  }
  /** A shape on the body layer: where `isIn` says, a ring of outline round it, a rim of light up and to the left, of shadow down and to the right. */
  const shape = (x0: number, y0: number, x1: number, y1: number, isIn: (x: number, y: number) => boolean, [base, light, shade, line]: Mat) => {
    const [left, top, right, bottom] = [Math.max(-1, x0 - 1), Math.max(-1, y0 - 1), Math.min(body.width, x1 + 1), Math.min(body.height, y1 + 1)]
    const [w, h] = [right - left + 1, bottom - top + 1]
    if (w <= 0 || h <= 0) return
    const mask = new Uint8Array(w * h)
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && isIn(x, y)) mask[(y - top) * w + x - left] = 1
    const on = (x: number, y: number) => x >= left && x <= right && y >= top && y <= bottom && mask[(y - top) * w + x - left] === 1
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (on(x, y)) set(body, x, y, isText ? base : !on(x - 1, y) || !on(x, y - 1) ? light : !on(x + 1, y) || !on(x, y + 1) ? shade : base)
        else if (!isText && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) set(body, x, y, line ?? edge)
      }
    }
  }
  const plot = (canvas: Canvas, a: V, b: V, color: number) => {
    const steps = Math.max(1, Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))
    for (let i = 0; i <= steps; i++) set(canvas, Math.round(lerp(a[0], b[0], i / steps)), Math.round(lerp(a[1], b[1], i / steps)), color)
  }
  const inside = (points: readonly V[], x: number, y: number) => {
    let isIn = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [a, b] = [points[i]!, points[j]!]
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) isIn = !isIn
    }

    return isIn
  }
  const boxOf = (points: readonly V[], grow: number) => [
    Math.floor(Math.min(...points.map(p => p[0])) - grow), Math.floor(Math.min(...points.map(p => p[1])) - grow),
    Math.ceil(Math.max(...points.map(p => p[0])) + grow), Math.ceil(Math.max(...points.map(p => p[1])) + grow),
  ] as const

  return {
    isText,
    cap: (a, b, radius, mat) => {
      const [p, q] = [to(a), to(b)]
      const r = Math.max(0.5, radius * scale)
      const [dx, dy] = [q[0] - p[0], q[1] - p[1]]
      const length = dx * dx + dy * dy
      const [x0, y0, x1, y1] = boxOf([p, q], r)
      shape(x0, y0, x1, y1, (x, y) => {
        const u = length === 0 ? 0 : clamp(((x - p[0]) * dx + (y - p[1]) * dy) / length, 0, 1)

        return Math.hypot(x - p[0] - u * dx, y - p[1] - u * dy) <= r + 0.05
      }, mat)
    },
    poly: (points, mat) => {
      const at = points.map(to)
      const [x0, y0, x1, y1] = boxOf(at, 0)
      shape(x0, y0, x1, y1, (x, y) => inside(at, x, y) || at.some(p => p[0] === x && p[1] === y), mat)
    },
    line: (a, b, color) => plot(strokes, to(a), to(b), color),
    fan: (points, color, isFaint = false) => {
      const at = points.map(to)
      const [x0, y0, x1, y1] = boxOf(at, 0)
      const canvas = isFaint ? strokes : lights
      const put = (x: number, y: number) => {
        if (!isFaint || ((x + y) & 1) === 0) set(canvas, x, y, color)
      }
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(at, x + 0.01, y + 0.01)) put(x, y)
      if (!isFaint) at.forEach((p, i) => plot(lights, p, at[(i + 1) % at.length]!, color))
    },
    dot: (a, color) => set(strokes, to(a)[0], to(a)[1], color),
    bar: (a, b, color) => {
      const [p, q] = [to(a), to(b)]
      const steps = Math.max(1, Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]))
      for (let i = 0; i <= steps; i++) {
        const [x, y] = [Math.round(lerp(p[0], q[0], i / steps)), Math.round(lerp(p[1], q[1], i / steps)) & ~1]
        set(lights, x, y, color)
        set(lights, x, y + 1, color)
      }
    },
    write: (a, text, color) => {
      const [x, y] = to(a)
      ;[...text].forEach((glyph, i) => {
        if (glyph === ' ') return
        if (isText) stamps.push({ x: (x >> 1) + i, y: y >> 2, glyph, fg: color })
        else set(strokes, x + i * 2, y, color)
      })
    },
    band: (a, b, color) => {
      if (!isText) return
      const [p, q] = [to(a), to(b)]
      const glyph = mod(p[1], 4) < 2 ? '▀' : '▄'
      for (let x = Math.min(p[0], q[0]) >> 1; x <= Math.max(p[0], q[0]) >> 1; x++) stamps.push({ x, y: p[1] >> 2, glyph, fg: color, band: true })
    },
    face: (a, cells, isMirrored, isUpended) => {
      if (!isText) return
      const [x, y] = to(a)
      const rows = isUpended ? [...cells].reverse() : cells
      rows.forEach((row, j) => {
        const line = isMirrored ? [...row].reverse() : row
        line.forEach(([written, fg, bg], i) => {
          if (written === ' ') return
          const turned = isUpended ? UPENDED[written] ?? written : written
          stamps.push({ x: (x >> 1) - (line.length >> 1) + i, y: (y >> 2) - 1 + j, glyph: isMirrored ? MIRRORED[turned] ?? turned : turned, fg, bg: bg ?? NONE })
        })
      })
    },
    dissolve: (amount, tint) => {
      if (amount <= 0) return
      for (let y = 0; y < body.height; y++) {
        const rank = hash(y >> 1, 7) % 100
        if (rank >= amount * 104 + 20) continue
        for (let x = 0; x < body.width; x++) {
          const at = y * body.width + x
          for (const canvas of [body, lights, strokes]) if (canvas.data[at] !== CLEAR) canvas.data[at] = rank < amount * 104 ? CLEAR : tint
        }
      }
    },
  }
}

// --- the two of them ---------------------------------------------------------------

const WHITE = 0xffffff
// The light blue, its pale step, and a deeper one for what glows less: a hologram's far rows, a blade seen through its scabbard.
const CYAN = 0x5ef6ff
const CYAN_LIT = 0xc2fbff
const CYAN_DEEP = 0x2fb8c4

/**
 * A character's colours. Kurenai's are reds, a pale red, near-black and the light blue, and nothing
 * else: a near-black suit whose leading edge catches a red rim of light, red plates over it, a red
 * cloak lined in dark red. Magpie's are the HUD's yellow and its dark, white hair and the light blue.
 */
type Inks = {
  edge: number
  alert: number
  shadow: number
  pale: number
  /** What is worn next to the skin, and the same on the far side of the body; `dim` stands for it in text, where no rim of light tells a dark limb from the dark behind it. */
  suit: Mat; back: Mat; dim: Mat
  /** Armour (hers: the jacket and the boots), cloth, a cloak's outside and its lining, a grip. */
  plate: Mat; cloth: Mat; cape: Mat; lining: Mat; grip: Mat
  hair: Mat; skin: Mat; steel: Mat
  /** The brightest point of light: hers is white; Kurenai has no white, hers is the light blue's pale step. */
  glint: number
}

const INKS: Readonly<Record<Who, Inks>> = {
  ninja: {
    edge: 0x0a0204, alert: 0xff1f47, shadow: 0x34101a, pale: 0xffd2cb,
    // (Dark, but never as dark as the ground behind her: a leg is a mid red with a rim of light, near-black only in its own shadow.)
    suit: [0x55141b, 0x8a1f2a, 0x2e0c12], back: [0x3a0f16, 0x6a1a22, 0x24090d], dim: [0x55141b, 0x8a232a, 0x2e0c12],
    plate: [0xc0303a, 0xff6158, 0x7a1c26], cloth: [0xe04848, 0xff8a80, 0x8a232a], cape: [0x8a1f2a, 0xc8343c, 0x55141b], lining: [0x3a0f16, 0x55141b, 0x2a0a10],
    grip: [0x55141b, 0x8a232a, 0x2e0c12], hair: [0x8a1f2a, 0xc8343c, 0x55141b], skin: [0x1c070b, 0x3a0f16, 0x0a0204], steel: [CYAN_LIT, CYAN_LIT, CYAN],
    glint: CYAN_LIT,
  },
  thief: {
    edge: 0x121100, alert: 0xff3d3d, shadow: 0x2a2802, pale: 0xfffbb5,
    // (A fitted suit of olive, a cropped jacket and boots of the HUD's yellow over it, a dark harness at the waist: three tones, so she is not one yellow shape.)
    suit: [0x8a8206, 0xc8bc08, 0x5a5504], back: [0x5a5504, 0x7d7605, 0x343104], dim: [0x8a8206, 0xc8bc08, 0x5a5504],
    plate: [0xfcee0a, 0xfffbb5, 0xb0a707], cloth: [0xc8bc08, 0xfcee0a, 0x8a8206], cape: [0x343104, 0x5a5504, 0x1c1a00], lining: [0x343104, 0x5a5504, 0x1c1a00],
    grip: [0x343104, 0x7d7605, 0x1c1a00], hair: [WHITE, WHITE, 0xd6d2b8, WHITE], skin: [0xffe08a, 0xfff0c2, 0xd9b84a], steel: [0xd6d2b8, WHITE, 0x8a8206],
    glint: WHITE,
  },
}

/** How far back the rigs a frame is drawn from go, a step apart: what trails is hung on them. */
const LAGS = 8
const LAG_MS = 40
/** A blade's arc is the ground its tip covered in the last frames, sampled this fine. */
const SWEEPS = 12
const SWEEP_MS = 18
const CODE = '01<>{}[]/=;:+*#$%&0110'
// Fingers on keys, a frame at a time, each hand to its own beat: 1 is a key struck.
const TAPS = [[1, 0, 0, 1, 0, 1, 0, 0], [0, 1, 0, 0, 1, 0, 0, 1]] as const

function drawn(g: Brush, who: Who, m: Moment) {
  const ink = INKS[who]
  const rigs = Array.from({ length: LAGS }, (_rig, i) => rigOf(who, heroPose(who, m, i * LAG_MS)))
  const rig = rigs[0]!
  const { pose } = rig
  const frame = Math.floor(m.now / FRAME_MS)
  const isNinja = who === 'ninja'
  // What sways by itself does it only at rest (in the other moods the body's own motion moves it), coming in and going out with the mood.
  const blend = m.was === undefined ? 1 : clamp((m.now - (m.since ?? 0)) / BLEND_MS, 0, 1)
  const still = (mood: Mood | undefined) => (mood === 'idle' ? 1 : mood === 'worried' ? 0.7 : 0)
  const calm = still(m.mood) * blend + still(m.was?.mood) * (1 - blend)
  const sway = (phase: number, turns = 1) => calm * Math.sin((2 * Math.PI * turns * m.now) / BREATH_MS + phase)
  // Under an alarm the light blue of what she holds and reads goes to the alert's red and back, four frames of each: a pulse, not a strobe. The visor stays lit, so the face is never lost.
  // (Three frames of the alert, one of the pale between, three of the light blue, one of the pale: it goes over, it does not blink.)
  const isAlarmed = pose.alarm > 0.5
  const isAlert = isAlarmed && frame % 8 < 3
  const energy = isAlert ? ink.alert : isAlarmed && frame % 4 === 3 ? ink.pale : CYAN
  const pulse = 0.5 + 0.5 * Math.sin((2 * Math.PI * m.now) / 1800)
  const visor: Mat = pose.wink > 0.5 ? ink.suit : pose.glow > 0.4 ? [CYAN_LIT, ink.glint, CYAN] : pulse > 0.72 ? [CYAN_LIT, CYAN_LIT, CYAN] : [CYAN, CYAN_LIT, CYAN]
  const edge: Mat = energy === CYAN ? [CYAN, CYAN_LIT, CYAN] : [energy, energy, energy]
  const dark = g.isText ? ink.dim : ink.suit
  const tip = (r: Rig, hand: V, deg: number, len: number) => add(hand, r.aim(deg, len))

  /** A blade from a hand: in pixels a lit edge with an outline, in text a fine line over the cells. */
  const blade = (hand: V, deg: number, from: number, len: number) => {
    const [a, b] = [tip(rig, hand, deg, from), tip(rig, hand, deg, from + len)]
    if (g.isText) g.bar(a, b, edge[0])
    else g.cap(a, b, 0.5, edge)
  }
  /**
   * The arc a blade has just cut: the ground its tip covered in the last two frames, along the path
   * it took, widest at the blade it is still joined to and drawn down to a point at its tail, the
   * tail going out. It ends where the tip slowed, turned back or was somewhere else altogether.
   */
  const sweeps = pose.P === 0 && pose.Q === 0 ? [] : Array.from({ length: SWEEPS + 1 }, (_rig, i) => (i === 0 ? rig : rigOf(who, heroPose(who, m, i * SWEEP_MS))))
  const arc = (has: (r: Rig) => boolean, hands: (r: Rig) => V, angle: (r: Rig) => number, len: number, slowest: number, longest = SWEEPS) => {
    const tips = sweeps.map(r => tip(r, hands(r), angle(r), len))
    const roots = sweeps.map(r => tip(r, hands(r), angle(r), len * 0.7))
    // How far back the arc goes, and how much of that the tip was fast for: a cut that has just stopped keeps its arc a frame (the first steps may be slow), a blade only carried has none.
    let [n, fast, last] = [0, 0, 0]
    while (n < longest && has(sweeps[n + 1]!)) {
      const [step, was] = [sub(tips[n + 1]!, tips[n]!), n === 0 ? null : sub(tips[n]!, tips[n - 1]!)]
      const length = Math.hypot(step[0], step[1])
      if (length > 26 || (length < slowest && (fast > 0 || n >= 5))) break
      if (was !== null && length > 0.2 && Math.hypot(was[0], was[1]) > 0.2 && (was[0] * step[0] + was[1] * step[1]) / (length * Math.hypot(was[0], was[1])) < 0.55) break
      n += 1
      if (length >= slowest) [fast, last] = [fast + 1, n]
    }
    n = last
    if (fast < 3) return
    // (Never under the floor.)
    const above = (v: V): V => [v[0], Math.max(0.6, v[1])]
    const inner = (i: number) => above(between(tips[i]!, roots[i]!, 1 - i / n))
    for (let i = n - 1; i >= 0; i--) g.fan([above(tips[i]!), inner(i), inner(i + 1), above(tips[i + 1]!)], energy !== CYAN ? energy : i < n / 3 ? CYAN_LIT : CYAN, i >= (2 * n) / 3)
  }
  const held = (hand: V, what: number, deg: number, has: (r: Rig) => boolean, hands: (r: Rig) => V, angle: (r: Rig) => number) => {
    if (what === KATANA) {
      arc(has, hands, angle, 21, 5.5)
      g.cap(tip(rig, hand, deg, -3.2), tip(rig, hand, deg, 1.2), 0.8, ink.grip)
      if (!g.isText) g.cap(add(tip(rig, hand, deg, 1.9), rig.aim(deg + 90, 1.3)), add(tip(rig, hand, deg, 1.9), rig.aim(deg - 90, 1.3)), 0.4, ink.steel)
      blade(hand, deg, 2.6, 18.4)
    } else if (what === DAGGER) {
      arc(has, hands, angle, 10, 3.4, 7)
      g.cap(tip(rig, hand, deg, -1.5), tip(rig, hand, deg, 1), 0.7, ink.grip)
      blade(hand, deg, 1.6, 8.4)
    } else if (what === PISTOL) {
      // Spun, it leaves a ring of light round the finger it turns on.
      const spin = Math.abs(rig.pose.p - rigs[1]!.pose.p)
      if (spin > 20 && spin < 200) for (let a = (frame % 2) * 15; a < 360; a += 30) g.dot(add(hand, turned([5.6, 0], a)), CYAN)
      g.cap(hand, tip(rig, hand, deg - 105, 3), 0.9, ink.grip)
      g.cap(tip(rig, hand, deg, -0.6), tip(rig, hand, deg, 6.4), 1.1, ink.steel)
      g.line(add(tip(rig, hand, deg, 1), rig.aim(deg + 90, 1.2)), add(tip(rig, hand, deg, 6.2), rig.aim(deg + 90, 1.2)), CYAN)
      // The shot: a star of light at the muzzle.
      if (pose.glow > 0.4) {
        const muzzle = tip(rig, hand, deg, 9)
        for (const a of [0, 45, 90, 135]) g.line(add(muzzle, turned([a % 90 === 0 ? 3.2 : 2, 0], a)), add(muzzle, turned([a % 90 === 0 ? -3.2 : -2, 0], a)), a % 90 === 0 ? CYAN_LIT : CYAN)
      }
    }
  }

  // The floor's shadow, narrower the higher she is.
  const reach = clamp(9 - (pose.y - 20) * 0.22, 3, 10)
  if (pose.fade < 0.5) for (let x = -reach; x <= reach; x += 1) if (g.isText ? true : Math.abs(x) % 2 < 1 || Math.abs(x) < reach - 2) g.dot([pose.x + 1 + x, -1.2], ink.shadow)

  /** A point of the body, where it was `lag` rigs ago (no further behind than `most`), a little adrift: what hangs from her is hung on these. */
  const trailed = (lag: number, x: number, y: number, most: number, drift: V = [0, 0]): V => {
    const [here, then] = [rig.off(x, y), rigs[lag]!.off(x, y)]

    return add(add(here, capped(sub(then, here), most)), drift)
  }

  if (isNinja) {
    // The scarf: a tail from the back of the neck, each point where the neck was a moment ago, sinking as it trails.
    const [points, sink, thick] = [7, 1.25, 1.7]
    const tail: V[] = [rig.off(-2.4, TORSO - 0.4)]
    for (let i = 1; i < points; i++) {
      const want = add(rigs[Math.min(LAGS - 1, i)]!.off(-2.4, TORSO - 0.4), [-1.7 * i - 0.5, -sink * i + sway(i * 0.8 + 1.3, 2) * 0.15 * i])
      tail.push(add(tail[i - 1]!, capped(sub(want, tail[i - 1]!), 3.4)))
    }
    // A ribbon round that line, wide at the neck and down to a point.
    const side = (way: number) => tail.map((at, i) => {
      const along = sub(tail[Math.min(points - 1, i + 1)]!, tail[Math.max(0, i - 1)]!)
      const wide = (way * thick * (1 - i / (points - 0.5))) / Math.max(0.001, Math.hypot(along[0], along[1]))

      return add(at, [-along[1] * wide, along[0] * wide])
    })
    g.poly([...side(1), ...side(-1).reverse()], ink.cloth)

    // The cloak: hung from the shoulders to the knee, its hem where the hips were a moment ago (so it trails a turn and settles after a landing) and swaying a little by itself. Its lining shows under the hem.
    const hem = (lag: number, x: number, y: number, loose: number): V => trailed(lag, x, y, 8 + 4 * pose.air, [-1.5 * loose * sway(1.1 + y * 0.2), 0.5 * loose * sway(2.3 + x)])
    // Off the ground it is gathered up behind her shoulders: a short wedge that trails the turn, not a slab that turns with her.
    const gathered = (x: number, y: number, ax: number, ay: number): [number, number] => [lerp(x, ax, pose.air), lerp(y, ay, pose.air)]
    const [top, nape] = [rig.off(1.2, TORSO - 0.4), rig.off(-3.2, TORSO - 0.4)]
    const [bulge, low, front, inner] = [hem(2, ...gathered(-7.2, 8.5, -6, 12), 0.4), hem(6, ...gathered(-11, -6.5, -16, 9), 1), hem(4, ...gathered(-2.6, -9.5, -8, 6.5), 0.8), hem(2, ...gathered(-0.6, 1, -1.5, 8), 0.3)]
    g.poly([nape, bulge, add(low, [0.6, -1.8]), add(front, [1.8, -1.6]), inner], ink.lining)
    g.poly([top, nape, bulge, low, front, inner, rig.off(-0.4, 10)], ink.cape)
  }

  /** A plate on a limb: over its leading side, from `from` to `till` of the way along it. */
  const plated = (a: V, b: V, from: number, till: number, radius: number, mat: Mat) => {
    const along = sub(b, a)
    const length = Math.max(0.001, Math.hypot(along[0], along[1]))
    const out: V = mul(along[1] < 0 ? [-along[1], along[0]] : [along[1], -along[0]], 0.45 / length)
    g.cap(add(between(a, b, from), out), add(between(a, b, till), out), radius, mat)
  }

  // The far arm and what its hand holds, behind the body.
  if (isNinja) {
    g.cap(rig.shoulderF, rig.shoulderF, 2.1, ink.back)
    g.cap(rig.shoulderF, rig.elbowF, 1.5, ink.back)
    g.cap(rig.elbowF, rig.handF, 1.4, ink.back)
    plated(rig.elbowF, rig.handF, 0.25, 0.8, 1.3, ink.lining)
  } else {
    g.cap(rig.shoulderF, rig.elbowF, 1.3, ink.cloth)
    g.cap(rig.elbowF, rig.handF, 1, ink.back)
    // (Her deck: a cuff on the forearm, a line of light along it.)
    g.cap(between(rig.elbowF, rig.handF, 0.3), between(rig.elbowF, rig.handF, 0.8), 1.5, ink.cape)
    if (!g.isText) g.line(between(rig.elbowF, rig.handF, 0.3), between(rig.elbowF, rig.handF, 0.8), energy)
    g.cap(rig.handF, rig.handF, 1, ink.skin)
  }
  held(rig.handF, pose.Q, pose.q, r => r.pose.Q === pose.Q, r => r.handF, r => r.pose.q)

  // The far leg.
  if (isNinja) {
    g.cap(rig.hipF, rig.kneeF, 1.9, ink.back)
    g.cap(rig.kneeF, rig.ankleF, 1.6, ink.back)
    plated(rig.kneeF, rig.ankleF, 0.2, 0.9, 1.4, ink.lining)
    g.cap(rig.ankleF, rig.toeF, 1.3, ink.back)
  } else {
    g.cap(rig.hipF, rig.kneeF, 1.7, ink.back)
    g.cap(rig.kneeF, rig.ankleF, 1.15, ink.back)
    g.cap(between(rig.kneeF, rig.ankleF, 0.5), rig.ankleF, 1.5, ink.cloth)
    g.cap(rig.ankleF, rig.toeF, 1.15, ink.cloth)
  }

  // The torso.
  const spine = (u: number) => between(rig.hip, rig.neck, u)
  if (isNinja) {
    // A dark waist, a red chest plate over it with a point of the light blue at its heart, a pale belt.
    g.cap(rig.hip, spine(0.5), 2.7, dark)
    g.cap(spine(0.6), spine(0.86), 3.3, ink.plate)
    g.cap(rig.off(-2.2, 2), rig.off(2.2, 2), 0.8, ink.cloth)
    g.dot(rig.off(2.2, 9.8), CYAN)
  } else {
    // Hips, a narrow dark waist in its harness, a belt with a pouch at the back; over it a cropped jacket, square at the shoulders and cut off above the waist, its collar up, a line of the light blue down its front.
    g.cap(rig.off(-1, 0.3), rig.off(1.2, 0.3), 2.5, ink.suit)
    g.cap(spine(0.26), spine(0.5), 1.6, ink.cape)
    g.cap(rig.off(-3.5, 2.4), rig.off(-3.5, 3.4), 1.1, ink.cape)
    g.cap(rig.off(-2.4, 2.3), rig.off(2.5, 2.3), 0.5, ink.plate)
    g.poly([rig.off(-3.5, 13.4), rig.off(3.1, 13.6), rig.off(3.6, 9.6), rig.off(1.8, 7.9), rig.off(-2.9, 8.1)], ink.plate)
    g.cap(rig.off(-1.8, 14.3), rig.off(0.9, 14.7), 0.9, ink.cloth)
    if (!g.isText) g.line(rig.off(2.5, 12.6), rig.off(2.6, 9.4), CYAN)
  }

  // The near leg.
  if (isNinja) {
    g.cap(rig.hipN, rig.kneeN, 2.1, dark)
    g.cap(rig.kneeN, rig.ankleN, 1.7, dark)
    plated(rig.kneeN, rig.ankleN, 0.25, 0.9, 1.5, ink.plate)
    g.cap(rig.kneeN, rig.kneeN, 1.5, ink.plate)
    g.cap(rig.ankleN, rig.toeN, 1.4, dark)
    // The scabbard at the hip, dark, its mouth forward. While the katana is in, the blade's light shows faintly along it and the hilt stands
    // out of it, wrapped pale; drawn, the scabbard is dark but for a point at its mouth; the frame the blade goes home, it flares its whole length.
    const isHome = pose.P !== KATANA
    const isJustHome = isHome && (rigs[2]!.pose.P === KATANA || rigs[3]!.pose.P === KATANA)
    g.cap(rig.off(4.4, 2.6), rig.off(-10.5, -3.4), g.isText ? 1.3 : 0.9, ink.grip)
    if (g.isText) g.bar(rig.off(4.4, 2.6), rig.off(isJustHome ? -9.8 : 4.4, isJustHome ? -2.4 : 2.6), isJustHome ? CYAN_LIT : CYAN)
    else if (isHome && (isJustHome || pose.air < 0.5)) g.line(rig.off(-3.4, 0.3), rig.off(-9.8, -2.4), isJustHome ? CYAN_LIT : CYAN_DEEP)
    if (!g.isText && isJustHome) g.line(rig.off(3, 2.1), rig.off(-3.4, 0.3), CYAN_LIT)
    if (!g.isText) g.dot(rig.off(4.6, 2.6), isHome ? CYAN : CYAN_DEEP)
    if (isHome) {
      g.cap(rig.off(5, 2.9), rig.off(9.8, 4.9), 0.8, ink.cloth)
      if (!g.isText) g.cap(rig.off(4.9, 1.5), rig.off(4.1, 4.1), 0.4, ink.steel)
    }
  } else {
    // A thigh that narrows to the knee, a slim shin, a tall boot; one pale stripe down the side of the leg.
    g.cap(rig.hipN, between(rig.hipN, rig.kneeN, 0.5), 2.1, ink.suit)
    g.cap(between(rig.hipN, rig.kneeN, 0.4), rig.kneeN, 1.6, ink.suit)
    g.cap(rig.kneeN, rig.ankleN, 1.25, ink.suit)
    if (!g.isText) g.line(between(rig.hipN, rig.kneeN, 0.12), between(rig.hipN, rig.kneeN, 0.92), ink.steel[0])
    // (Her dagger's sheath, strapped behind the thigh: its hilt shows while the dagger is in.)
    const thigh = sub(rig.kneeN, rig.hipN)
    const behind = mul(thigh[1] < 0 ? [thigh[1], -thigh[0]] : [-thigh[1], thigh[0]], 2.1 / Math.max(0.001, Math.hypot(thigh[0], thigh[1])))
    const sheath = (u: number) => add(between(rig.hipN, rig.kneeN, u), behind)
    g.cap(sheath(0.34), sheath(0.82), 0.8, ink.cape)
    if (!(pose.P === DAGGER || pose.Q === DAGGER || pose.O === DAGGER)) g.cap(sheath(0.14), sheath(0.26), 0.5, ink.steel)
    g.cap(between(rig.kneeN, rig.ankleN, 0.45), rig.ankleN, 1.7, ink.plate)
    g.cap(rig.ankleN, rig.toeN, 1.3, ink.plate)
  }

  // The head.
  const side = pose.turn < -0.2 ? -1 : 1
  // (Whether it is upside down: past a quarter of a turn over.)
  const upended = Math.cos(pose.spin * RAD) < 0
  // In text a head is not converted from its drawing, which gives another head each pose: it is the same few cells every frame, laid where the head is.
  const isStamped = g.isText && pose.fade < 0.3
  if (isNinja) {
    // A hood: its back falls to the cloak, a short peak over the brow; in its opening a dark faceplate, and the visor's slit of light across it.
    g.cap(rig.neck, rig.head, 1.4, dark)
    g.poly([rig.at(-1.5 * side, 3.8), rig.at(-5.6 * side, 0.6), trailed(2, -4.4, TORSO - 1.4, 3), rig.off(-0.5, TORSO - 1)], ink.hair)
    const [middle, half] = [1.9 * pose.turn, 3 - Math.abs(pose.turn)]
    const [from, till] = [clamp(middle - half, -3.6, 3.6), clamp(middle + half, -3.6, 3.6)]
    if (!isStamped) {
      g.cap(rig.head, rig.head, 4.4, ink.hair)
      g.poly([rig.at(1.6 * side, 4.3), rig.at(5 * side, 2.9), rig.at(3.4 * side, 1.6)], ink.hair)
      g.poly([rig.at(from, 1.9), rig.at(till, 1.9), rig.at(till + 0.3, -1.4), rig.at(till - 0.9, -3.8), rig.at(from + 0.6, -3.8), rig.at(from - 0.2, -1.4)], ink.skin)
      if (g.isText) g.band(rig.at(from, 0.5), rig.at(till, 0.5), visor[0])
      else g.cap(rig.at(from + 0.7, 0.4), rig.at(till - 0.4, 0.4), 0.7, visor)
    } else {
      // One head whatever she does: a hood four cells wide, a dark face under it, the visor a bar of light two cells long across the face.
      const [hood, face, lit] = [ink.hair[0], ink.skin[0], visor[0]]
      const isFacing = pose.turn > -0.2 && pose.turn < 0.3
      g.face(rig.head, [
        [['▗', hood], ['█', hood], ['█', hood], ['▖', hood]],
        isFacing ? [['▐', hood], ['▀', lit, face], ['▀', lit, face], ['▌', hood]] : [['▀', lit, face], ['▀', lit, face], ['█', hood], ['▌', hood]],
      ], side < 0 !== upended, upended)
    }
  } else {
    // A bob: white hair cut straight at the chin, a fringe straight across the brow, the neck bare under it.
    g.cap(rig.neck, between(rig.neck, rig.head, 0.55), 1, ink.skin)
    // The hair is one mass, the same in every pose: only the hem of its panels lags what the head does, a pixel or two, and settles after.
    const hem = (x: number, y: number, lag: number): V => add(rig.at(x, y), add(capped(mul(sub(rigs[lag]!.at(x, y), rig.at(x, y)), 0.6), 1.3), [sway(1.7 + x * 0.3) * 0.4, 0]))
    const middle = 1.7 * pose.turn
    const [from, till] = [clamp(middle - 2.3, -3.5, 3.5), clamp(middle + 2.3, -3.5, 3.5)]
    if (isStamped) {
      // One head whatever she does, four cells by two (a cell is twice as tall as it is wide): the crown and the fringe straight across under it;
      // then the visor over the jaw, and behind them the bob's panel, down to the chin and cut off flat there.
      const [hair, skin, lit] = [ink.hair[0], ink.skin[0], visor[0]]
      const isFacing = pose.turn > -0.2 && pose.turn < 0.3
      g.face(rig.head, [
        [['▟', hair], ['█', hair], ['█', hair], ['▙', hair]],
        isFacing ? [['▐', hair], ['▀', lit, skin], ['▀', lit, skin], ['▌', hair]] : [['▀', lit, skin], ['▀', lit, skin], ['█', hair], ['▌', hair]],
      ], side < 0 !== upended, upended)
    } else {
    // The crown, and the panel that falls straight from it behind the face and is cut off flat at the chin.
    g.cap(rig.at(-0.2, 0.9), rig.at(-0.2, 0.9), 3.2, ink.hair)
    if (side > 0) g.poly([rig.at(-3.4, 1.4), rig.at(from, 1.4), hem(from, -2.9, 2), hem(-3.6, -2.9, 4)], ink.hair)
    else g.poly([rig.at(3.4, 1.4), rig.at(till, 1.4), hem(till, -2.9, 2), hem(3.6, -2.9, 4)], ink.hair)
    // The face: one block of skin, the jaw cut in under it, a mouth.
    g.poly([rig.at(from, 0.9), rig.at(till, 0.9), rig.at(till, -2.1), rig.at(till - 0.9, -3.3), rig.at(from + 0.6, -3.3), rig.at(from, -2.4)], ink.skin)
    // The fringe, straight across the brow, and the lock that frames the face on its other side (unless she is seen from the side).
    g.poly([rig.at(from + 0.2, 2.2), rig.at(till - 0.1, 2.2), rig.at(till - 0.1, 1.5), rig.at(from + 0.2, 1.5)], ink.hair)
    if (Math.abs(pose.turn) < 0.75) g.poly(side > 0 ? [rig.at(till + 0.8, 1), rig.at(till + 1, 1), hem(till + 1, -1.6, 3), hem(till + 0.8, -1.6, 3)] : [rig.at(from - 0.8, 1), rig.at(from - 1, 1), hem(from - 1, -1.6, 3), hem(from - 0.8, -1.6, 3)], ink.hair)
    if (!g.isText) {
      // Under the fringe its line of shadow, then the visor, two pixels of light with nothing between it and the skin; a mouth.
      const row = (y: number, color: number) => g.line(rig.at(from + 0.3, y), rig.at(till - 0.2, y), color)
      row(0.55, ink.hair[2])
      // (Her visor's own pulse is too pale to read at two pixels: it is the light blue, paler only when it flares.)
      const lit = pose.wink > 0.5 ? ink.cape[0] : pose.glow > 0.4 ? CYAN_LIT : CYAN
      row(-0.2, lit)
      row(-0.95, lit)
      g.dot(rig.at(side > 0 ? till - 1.1 : from + 1.1, -2.5), ink.skin[2])
    } else g.band(rig.at(from, -0.2), rig.at(till, -0.2), visor[0])
    // (Her earpiece, a point of light where the hair parts.)
    g.dot(side > 0 ? rig.at(from - 0.6, -1.2) : rig.at(till + 0.6, -1.2), energy)
    }
  }

  // The near arm, over everything of the body; a hand at keys strikes them to its own beat.
  const beat = Math.floor((m.clock ?? m.now) / FRAME_MS)
  const tap = (hand: 0 | 1): V => [0, pose.type > 0.4 ? (TAPS[hand][beat % 8] === 1 ? -1.1 : 1) : 0]
  if (isNinja) {
    g.cap(rig.shoulder, rig.elbowN, 1.7, dark)
    g.cap(rig.shoulder, rig.shoulder, 2.4, ink.plate)
    g.cap(rig.elbowN, rig.handN, 1.5, dark)
    plated(rig.elbowN, rig.handN, 0.3, 0.8, 1.4, ink.plate)
    g.cap(rig.handN, rig.handN, 1.2, dark)
  } else {
    g.cap(rig.shoulder, rig.shoulder, 1.8, ink.plate)
    g.cap(rig.shoulder, rig.elbowN, 1.35, ink.plate)
    g.cap(rig.elbowN, add(rig.handN, tap(0)), 1, ink.suit)
    g.cap(add(rig.handN, tap(0)), add(rig.handN, tap(0)), 1, ink.skin)
    // (The far hand again, over the body, while it types: both hands show at the keys.)
    if (pose.type > 0.4 && pose.holo > 0.75) g.cap(add(rig.handF, tap(1)), add(rig.handF, tap(1)), 1, ink.skin)
  }

  held(rig.handN, pose.P, pose.p, r => r.pose.P === pose.P, r => r.handN, r => r.pose.p)

  // What is left of her while she is gone, and of what she holds: scan lines, in the light blue.
  g.dissolve(pose.fade, CYAN)
  if (pose.fade > 0.15) {
    for (let i = 0; i < Math.round(5 * pose.fade); i++) {
      const y = pose.y - 9 + i * 5.5
      const from = pose.x - 12 + (hash(i, frame, 11) % 10)
      g.line([from, y], [from + 8 + (hash(i, frame, 13) % 14), y], i % 2 === 0 ? CYAN : CYAN_LIT)
    }
  }

  // The line: from the far hand up to where it bit, out of the frame.
  if (pose.rope > 0.02) {
    const hook = between(rig.handF, [27, 96], pose.rope)
    g.line(rig.handF, hook, energy)
    g.dot(add(hook, [0.8, 0.6]), CYAN_LIT)
  }

  // What is in the air.
  const flying: V = pose.O === SHARD_HELD ? add(rig.handN, [0.5, 2.4]) : [pose.ox, pose.oy]
  if (pose.O === SHURIKEN) {
    // A star that turns an eighth a frame (a cross, then a saltire), a tail of light behind it going out.
    g.fan([add(flying, [-3.4, 0.5]), add(flying, [-9.5, 0]), add(flying, [-3.4, -0.5])], CYAN)
    g.fan([add(flying, [-9.5, 0.5]), add(flying, [-15, 0]), add(flying, [-9.5, -0.5])], CYAN, true)
    for (const quarter of [0, 90]) g.line(add(flying, turned([3, 0], pose.oa + quarter)), add(flying, turned([-3, 0], pose.oa + quarter)), ink.pale)
    g.dot(flying, CYAN)
  } else if (pose.O === DAGGER) {
    const along = turned([0, 1], pose.oa)
    g.line(add(flying, mul(along, -3)), add(flying, mul(along, -0.5)), ink.cloth[0])
    g.line(add(flying, mul(along, 0.5)), add(flying, mul(along, 6)), CYAN)
  } else if (pose.O === SHARD || pose.O === SHARD_HELD) {
    const [long, wide] = [turned([0, 2.6], pose.oa), turned([1.5, 0], pose.oa)]
    g.fan([add(flying, long), add(flying, wide), sub(flying, long), sub(flying, wide)], CYAN)
    g.dot(flying, CYAN_LIT)
    if ((frame & 3) === 0) g.dot(add(flying, [2.6, 2.6]), ink.glint)
  }

  // The hologram: a small read-out over her forearm that opens into a keyboard hung tilted at her waist, and a screen ahead of her, clear of her head, code running up it.
  if (pose.holo > 0.05) {
    const open = clamp((pose.holo - 0.5) / 0.5, 0, 1)
    const middle = between(add(rig.handF, [1, 3.6]), [pose.x + 13.5, pose.y + 4.6], EASES.io(open))
    const half = lerp(2.6, 6.5, open)
    const [lit, dim] = isAlert ? [ink.alert, ink.shadow] : [CYAN, CYAN_DEEP]
    const struck = [rig.handN, rig.handF].map((hand, n) => (pose.type > 0.4 && TAPS[n as 0 | 1][beat % 8] === 1 ? hand[0] : NaN))
    // Three rows of keys, each further and higher than the one before: a plane seen from its side. A struck key flares.
    for (let j = 0; j < 3; j++) {
      const y = middle[1] + j * lerp(1.1, 1.5, open)
      for (let x = -half; x <= half; x += g.isText ? 1.25 : 1.6) {
        const at: V = [middle[0] + x + j * lerp(0.9, 1.5, open), y]
        if (isAlert && hash(Math.round(x), j, frame >> 2) % 4 === 0) continue
        g.dot(at, struck.some(hand => Math.abs(hand - at[0]) < 1.3) ? ink.glint : j === 0 ? lit : dim)
      }
    }
    if (open > 0.5) {
      const [left, right]: [V, V] = [[middle[0] - half - 0.6, middle[1] - 1.3], [middle[0] + half - 0.6, middle[1] - 1.3]]
      if (g.isText) g.bar(left, right, lit)
      else g.line(left, right, lit)
      // Five lines of it, the newest lowest: each scrolls up a line as one is typed, faster with the fingers.
      const typed = Math.floor((m.clock ?? m.now) / (pose.type > 0.4 ? 180 : 720))
      for (let i = 0; i < 5; i++) {
        const seed = typed - i
        const length = g.isText ? 3 + (hash(seed, 5) % 4) : 4 + (hash(seed, 5) % 6)
        const text = Array.from({ length }, (_c, n) => (hash(seed, n, 9) % 6 === 0 ? ' ' : CODE[hash(seed, n, 2) % CODE.length]!)).join('')
        g.write([pose.x + 26, pose.y + 12.5 + i * (g.isText ? 5 : 2.4)], i === 0 && pose.type > 0.4 ? `${text}_` : text, isAlert ? ink.alert : i === 0 ? CYAN_LIT : i < 3 ? CYAN : CYAN_DEEP)
      }
    }
  }
}

// --- the two frames ------------------------------------------------------------------

/** How many art pixels a unit of the rig is in a picture: she stands some fifty-eight tall. */
const PIXEL_SCALE = 1.3
/** Where in a frame's width she stands: right of its middle, for what she holds reaches ahead of her (to the left). */
const STAND = 0.56

/** One frame in true pixels, `width` by `height` art pixels: the figure stood on the bottom, clear around it. */
export function heroCanvas(who: Who, m: Moment, width: number, height: number): Canvas {
  const canvas = blank(width, height)
  drawn(brushOf(canvas, canvas, canvas, Math.round(width * STAND), height - 3, PIXEL_SCALE, INKS[who].edge, []), who, m)

  return canvas
}

/** How much smaller the figure is in text: a cell is two dots by four, about square. */
const TEXT_SCALE = 0.8
// A cell's four quarters as a block, by which are filled: upper left 1, upper right 2, lower left 4, lower right 8.
const QUARTERS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'
// A cell's eight dots as braille, by column then row.
const DOTS = [[1, 2, 4, 64], [8, 16, 32, 128]] as const

const most = (colours: readonly number[]): number => {
  let [best, count] = [colours[0] ?? CLEAR, 0]
  for (const color of colours) {
    const n = colours.filter(one => one === color).length
    if (n > count) [best, count] = [color, n]
  }

  return best
}

/**
 * One frame in text, `columns` by `rows` cells, from the same pose, drawn at two dots by four a cell
 * and turned into what reads best of each layer. The body: blocks, a cell's four quarters in its two
 * main colours (so a red plate, a dark limb and a cloak's edge are told apart inside one cell), an
 * edge of the figure as the quarters it fills. An arc's mass of light: quarter blocks over it. What is
 * fine (a blade, a rope, a star, keys, an arc's tail going out): braille dots, one weight whatever
 * the angle, on the body's own colour where they cross it. Then the glyphs laid on by hand: the
 * visor as a band of light in its cell, code as code.
 */
export function heroGrid(who: Who, m: Moment, columns: number, rows: number): Grid {
  const [body, lights, strokes] = [blank(columns * 2, rows * 4), blank(columns * 2, rows * 4), blank(columns * 2, rows * 4)]
  const stamps: Stamp[] = []
  drawn(brushOf(body, lights, strokes, Math.round(columns * 2 * STAND), rows * 4 - 5, TEXT_SCALE, null, stamps), who, m)
  const words = new Uint32Array(columns * rows * 3)
  const grounds = new Int32Array(columns * rows).fill(CLEAR)
  const filled = (list: readonly number[]) => list.filter(color => color !== CLEAR)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const dots = (canvas: Canvas) => [0, 1, 2, 3].flatMap(j => [0, 1].map(i => canvas.data[(y * 4 + j) * canvas.width + x * 2 + i]!))
      const [solid, light, fine] = [dots(body), dots(lights), dots(strokes)]
      // The quarters, upper left first: each the colour most of its two dots are, CLEAR for none.
      const quarters = [0, 1, 2, 3].map(q => most(filled([solid[(q >> 1) * 4 + (q & 1)]!, solid[(q >> 1) * 4 + 2 + (q & 1)]!])))
      const mask = quarters.reduce((bits, color, q) => bits | (color !== CLEAR ? 1 << q : 0), 0)
      const main = most(filled(solid))
      let cell: [number, number, number] = [0x20, NONE, NONE]
      if (mask === 15) {
        const others = quarters.filter(color => color !== main)
        const second = others.length === 0 ? main : most(others)
        const bits = quarters.reduce((sum, color, q) => sum | (color === main ? 1 << q : 0), 0)
        cell = [QUARTERS.codePointAt(bits)!, main, second]
        grounds[y * columns + x] = main
      } else if (mask !== 0) cell = [QUARTERS.codePointAt(mask)!, main, NONE]
      const [lit, drawnFine] = [filled(light), filled(fine)]
      const under = mask === 15 ? main : NONE
      if (lit.length >= 2) {
        // A mass of light: the quarters it reaches.
        const bits = [0, 1, 2, 3].reduce((sum, q) => sum | ([light[(q >> 1) * 4 + (q & 1)]!, light[(q >> 1) * 4 + 2 + (q & 1)]!].some(color => color !== CLEAR) ? 1 << q : 0), 0)
        cell = [QUARTERS.codePointAt(bits)!, most(lit), under]
      } else if (drawnFine.length + lit.length > 0 && (mask === 0 || mask === 15 || drawnFine.length + lit.length > 1)) {
        // Something fine: its dots, as dots.
        const bits = [0, 1, 2, 3, 4, 5, 6, 7].reduce((sum, n) => sum | (fine[n] !== CLEAR || light[n] !== CLEAR ? DOTS[n % 2]![n >> 1]! : 0), 0)
        cell = [0x2800 + bits, most(drawnFine.length > 0 ? drawnFine : lit), under]
      }
      words.set(cell, (y * columns + x) * 3)
    }
  }
  for (const { x, y, glyph, fg, band, bg } of stamps) {
    if (x < 0 || y < 0 || x >= columns || y >= rows) continue
    const at = (y * columns + x) * 3
    const under = grounds[y * columns + x]!
    // A head is laid over whatever is there.
    if (bg !== undefined) {
      words.set([glyph.codePointAt(0)!, fg, bg], at)
      continue
    }
    // A band of light only where there is a head for it to be on; code only where nothing else is.
    if (band === true ? under === CLEAR : words[at] !== 0x20) continue
    words.set([glyph.codePointAt(0)!, fg, band === true ? under : NONE], at)
  }

  return { columns, rows, words }
}
