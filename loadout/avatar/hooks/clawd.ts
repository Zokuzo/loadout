// Clawd, Claude Code's own mascot, and one hat per model. Rows are 20 columns of palette
// indices, '.' transparent: 0 is his orange, 1 his eyes, 2 and 3 the hat's two colors.
import { blank, paint } from './canvas'
import type { Canvas } from './canvas'
import { decode } from './forms'
import type { FormSprite } from './forms'
import type { Form } from './look'
import { HEADROOM } from './mascot'
import type { Mood } from './mascot'

const ORANGE = 0xd97757
const EYE = 0x2a1a14

const BODY = '...00000000000000...'
const ARMS = '00000000000000000000'
const LEGS = '....00.00..00.00....'
const EYE_COLS = [6, 7, 12, 13]

// Eleven rows of body, the arms on rows 4 to 6, then three of legs.
const TORSO = [BODY, BODY, BODY, BODY, ARMS, ARMS, ARMS, BODY, BODY, BODY, BODY, LEGS, LEGS, LEGS]

const withEyes = (rows: readonly number[]) =>
  TORSO.map((row, y) => (rows.includes(y) ? [...row].map((ch, x) => (EYE_COLS.includes(x) ? '1' : ch)).join('') : row))

// Eyes open, half shut, shut.
const BLINKS = [[2, 3, 4, 5], [4, 5], [5]]

const clawd = (name: string, hat: readonly string[], colors: readonly number[]): FormSprite => ({
  name,
  frames: decode([ORANGE, EYE, ...colors], BLINKS.map(rows => [...hat, ...withEyes(rows)])),
})

export const CLAWD = {
  opus: clawd('Clawd', [], []),
  sonnet: clawd(
    'Poet Clawd',
    [
      '...........3........',
      '.......222222222....',
      '.....2222222222222..',
      '....33333333333333..',
    ],
    [0xc0392b, 0x7d2018],
  ),
  haiku: clawd(
    'Zen Clawd',
    [
      '.........22.........',
      '.......222222.......',
      '.....2222222222.....',
      '...22222222222222...',
      '.333333333333333333.',
    ],
    [0xe8c872, 0xa87f32],
  ),
  fable: clawd(
    'Wizard Clawd',
    [
      '...........22.......',
      '..........222.......',
      '.........2222.......',
      '........223222......',
      '.......22222232.....',
      '......2222222222....',
      '.....333333333333...',
      '..2222222222222222..',
    ],
    [0x7b4bd6, 0xffd75f],
  ),
} satisfies Record<string, FormSprite>

// --- Clawd, moving -----------------------------------------------------------------
//
// In true pixels Clawd is not one sprite pushed about: he is drawn anew each frame from what he is
// made of (a body, two arms, four legs, two eyes, a hat), every part a block of whole art pixels.
// A pose says where each part is, in thirds of one of his own pixels; a mood is a pose authored
// against the clock, eased, so between two of his pixels there are drawn in-betweens (never a
// blend: a pixel is his orange or it is not). At rest the picture is his sprite, exactly.
// Pure: a frame is derived from (form, moment) alone.

/**
 * Where his parts are, in thirds of a sprite pixel but `lift` and `dx`, which are art pixels: off
 * the ground, and aside. `sink` lowers the body on its legs, `squash` shortens it from the top and
 * widens it (negative: a stretch), `armL` and `armR` move an arm down (negative: up; L is the one on
 * the conversation's side), `l0` to `l3` lift a foot, `eyeX` and `eyeY` move the eyes, `eye` is their height (12 open, 3 shut).
 */
const CHANNELS = ['lift', 'dx', 'sink', 'squash', 'armL', 'armR', 'l0', 'l1', 'l2', 'l3', 'eyeX', 'eyeY', 'eye'] as const
type Channel = (typeof CHANNELS)[number]
type Pose = Record<Channel, number>

const REST: Pose = { lift: 0, dx: 0, sink: 0, squash: 0, armL: 0, armR: 0, l0: 0, l1: 0, l2: 0, l3: 0, eyeX: 0, eyeY: 0, eye: 12 }

const FRAME_MS = 90
/** How long a pose takes to become another mood's. */
export const CLAWD_BLEND_MS = 270
/** The moods' loops: each comes round whole in this long. */
export const CLAWD_LOOP_MS: Readonly<Record<Mood, number>> = { idle: 12_600, working: 2880, happy: 1980, worried: 2160 }
const BREATH_MS = 3150
const LEAP_MS = 990
// Of the idle loop: when he blinks, looks at the conversation, shuffles his feet, and hops.
const BLINKS_AT = [2700, 8370, 8730]
const LOOK = [4500, 6300] as const
const SHUFFLE = [6750, 7830] as const
const HOP_AT = 10_350
const STEP_MS = 270

const ease = (u: number) => u * u * (3 - 2 * u)
const arc = (u: number) => 4 * u * (1 - u)
const unit = (u: number) => Math.max(0, Math.min(1, u))
const mod = (a: number, n: number) => ((a % n) + n) % n
/** 0 outside [from, to), 1 inside, eased over `ramp` at each end. */
const within = (t: number, from: number, to: number, ramp: number) => (t < from || t >= to ? 0 : ease(unit((t - from) / ramp)) * (1 - ease(unit((t - (to - ramp)) / ramp))))

/** A jump, `v` milliseconds in: a crouch, a stretch off the ground, an arc `high` art pixels up, and a landing that squashes and settles. `air` is 1 while off the ground. */
function leap(v: number, high: number): { lift: number; squash: number; air: number } {
  if (v < 180) return { lift: 0, squash: 3 * ease(v / 180), air: 0 }
  if (v < 720) {
    const up = arc((v - 180) / 540)

    return { lift: high * up, squash: -2 * (1 - up), air: 1 }
  }

  return { lift: 0, squash: 3 * (1 - ease(unit((v - 720) / (LEAP_MS - 720)))), air: 0 }
}

/** Shut and open again over three frames from `at`, else `open`. */
const blink = (t: number, at: number, open: number): number => [6, 3, 6][Math.floor((t - at) / FRAME_MS)] ?? open

/** A key struck, `u` of the way through the stroke: down fast, up slower. */
const tap = (u: number) => (u < 0 || u >= 1 ? 0 : u < 0.3 ? ease(u / 0.3) : 1 - ease((u - 0.3) / 0.7))

const POSES: Readonly<Record<Mood, (t: number) => Pose>> = {
  // Breathing, a gentle squash; a blink now and then, a look at the conversation, a shuffle of the feet, a small hop: each at its place in the loop.
  idle: t => {
    const c = mod(t, CLAWD_LOOP_MS.idle)
    const hop = c >= HOP_AT && c < HOP_AT + LEAP_MS ? leap(c - HOP_AT, 5) : undefined
    const breath = 1.6 * ((1 - Math.cos((2 * Math.PI * t) / BREATH_MS)) / 2) * (1 - within(c, HOP_AT - 180, HOP_AT + LEAP_MS + 180, 180))
    const foot = c >= SHUFFLE[0] && c < SHUFFLE[1] ? 3 * arc(((c - SHUFFLE[0]) % STEP_MS) / STEP_MS) : 0
    const isOdd = Math.floor((c - SHUFFLE[0]) / STEP_MS) % 2 === 1

    return {
      ...REST,
      lift: hop?.lift ?? 0,
      squash: breath + (hop?.squash ?? 0),
      armL: -2 * (hop?.air ?? 0), armR: -2 * (hop?.air ?? 0),
      l0: isOdd ? 0 : foot, l2: isOdd ? 0 : foot, l1: isOdd ? foot : 0, l3: isOdd ? foot : 0,
      eyeX: -3 * within(c, LOOK[0], LOOK[1], STEP_MS),
      eye: BLINKS_AT.reduce((open, at) => blink(c, at, open), 12),
    }
  },
  // Typing: the arms strike in turn, the body dips with each stroke, the eyes are on the keys but for a glance at the conversation.
  working: t => {
    const u = mod(t, 720) / 360
    const [left, right] = [tap(u), tap(u - 1)]
    const c = mod(t, CLAWD_LOOP_MS.working)
    const glance = within(c, 1440, 2070, 180)

    return { ...REST, sink: 2 * Math.max(left, right), armL: 4.5 * left - 1, armR: 4.5 * right - 1, eyeX: -2 * glance, eyeY: 2 * (1 - glance), eye: blink(c, 2430, 12) }
  },
  // A bouncy jump, squashed before and after, stretched off the ground, and a wave to the conversation with eyes that smile.
  happy: t => {
    const v = mod(t, LEAP_MS)
    const jump = leap(v, 9)
    const up = within(v, 90, LEAP_MS, 180)

    return { ...REST, lift: jump.lift, squash: jump.squash, armL: up * (-9 + 2 * Math.sin((2 * Math.PI * v) / 180)), armR: -3 * jump.air + 2 * (1 - jump.air) * up, eyeY: -6 * up, eye: 12 - 6 * up }
  },
  // Hunched and trembling, then still, his eyes darting one way and the other.
  worried: t => {
    const k = Math.floor(mod(t, CLAWD_LOOP_MS.worried) / FRAME_MS)
    const shiver = [0, 1, -1, 1, -1, 1, -1, 1, -1, 0][k] ?? 0
    const dart = [-1.5, -3, -3, -1.5, 1.5, 3, 3, 1.5][k - 11] ?? 0

    return { ...REST, dx: shiver, squash: 1.5, armL: -2 + shiver, armR: -2 - shiver, eyeX: dart, eye: 8 }
  },
}

/** A moment of his: the mood, the clock and, while it is fresh, the mood before and since when this one lasts. */
export type ClawdMoment = { mood: Mood; now: number; was?: Mood; since?: number }

/** His pose at a moment: the mood's, or for CLAWD_BLEND_MS after a change of mood the way there from the one before's. */
function poseAt({ mood, now, was, since }: ClawdMoment): Pose {
  const pose = POSES[mood](now)
  if (was === undefined || since === undefined || now - since >= CLAWD_BLEND_MS || now < since) return pose
  const [before, u] = [POSES[was](now), ease((now - since) / CLAWD_BLEND_MS)]

  return Object.fromEntries(CHANNELS.map(name => [name, before[name] + (pose[name] - before[name]) * u])) as Pose
}

/** Whether nothing of him moves but his breathing, nor will in the next frames: then a frame in a few is enough. */
export const isClawdAtRest = ({ mood, now, was, since }: ClawdMoment): boolean => {
  if (mood !== 'idle' || (was !== undefined && since !== undefined && now - since < CLAWD_BLEND_MS + 3 * FRAME_MS)) return false
  const still = (t: number) => {
    const { squash, ...pose } = POSES.idle(t)

    // (A breath moves his top a seventh of a third of a pixel a frame; a landing that settles, several times that.)
    return JSON.stringify(pose) === JSON.stringify({ ...REST, squash: undefined }) && Math.abs(POSES.idle(t + FRAME_MS).squash - squash) < 0.4
  }

  return still(now) && still(now + 3 * FRAME_MS) && still(now + 4 * FRAME_MS)
}

const SWEAT = [0x5ac8fa, 0xd6f1ff]
// The keys' sparks: pale on a dark ground, and the same three hues deep enough to read on a light one.
const KEYS = [0x5fd7ff, 0xffd75f, 0xaf87ff]
const KEYS_LIGHT = [0x0087af, 0xaf5f00, 0x5f3fd7]
const HEART = 0xff1784
const [HEART_PX, DROP_PX, SPARK_PX, FLARE_PX] = decode([HEART, ...SWEAT], [
  ['.00...00.', '0000.0000', '000000000', '000000000', '.0000000.', '..00000..', '...000...', '....0....'],
  ['.1.', '121', '111', '.1.'],
  ['.0.', '000', '.0.'],
  ['..0..', '..0..', '00000', '..0..', '..0..'],
])

function fill(canvas: Canvas, x: number, y: number, w: number, h: number, color: number) {
  for (let j = Math.max(0, y); j < Math.min(canvas.height, y + h); j++) {
    for (let i = Math.max(0, x); i < Math.min(canvas.width, x + w); i++) canvas.data[j * canvas.width + i] = color
  }
}

/**
 * One frame of Clawd in the model's form, `width` by `height` art pixels, a pixel of his `scale` of
 * them: stood on the bottom row where his sprite stands, looking left, at the conversation. The
 * margins of the mascot's box (MARGIN aside, HEADROOM above) hold everything he does. `isLight`: on a
 * light ground, where what flies about him is drawn in deeper colours.
 */
export function clawdFrame(form: Form, moment: ClawdMoment, width: number, height: number, scale: number, isLight = false): Canvas {
  const canvas = blank(width, height)
  const sprite = CLAWD[form].frames[0]!
  const hat = sprite.slice(0, sprite.length - TORSO.length)
  const pose = poseAt(moment)
  const { mood, now } = moment
  const px = (thirds: number) => Math.round((thirds * scale) / 3)
  const s = scale
  const [x0, feet] = [((width - 20 * s) >> 1) + Math.round(pose.dx), height - Math.round(Math.min(pose.lift, HEADROOM))]
  const squash = px(pose.squash)
  const wide = Math.round(squash / 2)
  // The body: its top comes down with a squash and the sides go out; the legs give under a sink.
  const sink = Math.min(px(pose.sink), 2 * s)
  const bottom = feet - 3 * s + sink
  const top = bottom - 11 * s + squash
  const [left, right] = [x0 + 3 * s - wide, x0 + 17 * s + wide]

  ;[4, 7, 11, 14].forEach((column, i) => {
    const up = Math.min(px(pose[(['l0', 'l1', 'l2', 'l3'] as const)[i]!]), 2 * s)
    fill(canvas, x0 + column * s, bottom, 2 * s, feet - up - bottom, ORANGE)
  })
  fill(canvas, left, top, right - left, bottom - top, ORANGE)
  // The arms hang from the body's middle: a squash takes them half way down with it.
  const shoulder = bottom - 7 * s + Math.round(squash / 2)
  const hands = [shoulder + px(pose.armL), shoulder + px(pose.armR)] as const
  fill(canvas, left - 3 * s, hands[0], 3 * s, 3 * s, ORANGE)
  fill(canvas, right, hands[1], 3 * s, 3 * s, ORANGE)
  // The eyes close from the top, and look where he looks; they stay on his face whatever it does.
  const tall = Math.max(1, Math.min(4 * s, px(pose.eye)))
  const low = Math.min(bottom - s, top + 6 * s + px(pose.eyeY))
  for (const column of [6, 12]) fill(canvas, x0 + column * s + px(pose.eyeX), Math.max(top + 1, low - tall), 2 * s, Math.min(tall, low - top - 1), EYE)
  if (hat.length > 0) paint(canvas, hat, x0, top - hat.length * s, { flip: true, scale: s })

  // Hearts rising in the corners while he is glad, before him: his waving arm and his hat's brim are in those corners too, and a heart behind them is a sliver.
  if (mood === 'happy') {
    for (const side of [0, 1]) {
      const u = mod(now / CLAWD_LOOP_MS.happy + side / 2, 1)
      paint(canvas, HEART_PX!, (side === 0 ? 1 : width - 10) + Math.round(Math.sin(2 * Math.PI * u * 2 + side)), Math.round((top + 2 * s) * (1 - u)))
    }
  }
  if (mood === 'working') {
    // A key struck under each hand in turn: a flash where it lands, and a spark that falls away from it.
    for (const side of [0, 1]) {
      const age = mod(now - side * 360, 720) - 110
      if (age < 0 || age >= 450) continue
      const [x, under] = [side === 0 ? left - 3 * s : right, bottom - 4 * s + sink + Math.round(squash / 2) + px(4)]
      const color = (isLight ? KEYS_LIGHT : KEYS)[((Math.floor((now - side * 360) / 720) % 2) + side) % KEYS.length]!
      if (age < FRAME_MS) fill(canvas, x, under + 1, 3 * s, 1, color)
      const [u, out] = [age / 450, side === 0 ? -1 : 1]
      const at = [x + s + out * Math.round(u * s) + (s >> 1), under + 2 + Math.round(2.5 * s * u * u)] as const
      if (s >= 2 && age >= FRAME_MS && age < 3 * FRAME_MS) paint(canvas, FLARE_PX!, at[0] - 2, at[1] - 1, { tint: color })
      else if (u < 0.8) paint(canvas, SPARK_PX!, at[0] - 1, at[1], { tint: color })
      else fill(canvas, at[0], at[1] + 1, 1, 1, color)
    }
  }
  if (mood === 'worried') {
    // A drop of sweat on his temple, on the side the conversation does not see: it swells, runs down his cheek, and is flicked off.
    const k = mod(now, CLAWD_LOOP_MS.worried) / FRAME_MS
    const big = Math.max(1, s - 1)
    const [x, from, to] = [right - s - 2 * big, top + big, bottom - 3 * s - 4 * big]
    if (k >= 2 && k < 4) fill(canvas, x + big, from + big, big, k < 3 ? big : 2 * big, SWEAT[0]!)
    else if (k >= 4 && k < 13) paint(canvas, DROP_PX!, x, from + Math.round(Math.max(0, to - from) * unit((k - 5) / 7) ** 2), { scale: big })
    else if (k >= 13 && k < 15) for (const out of [-1, 1]) fill(canvas, x + big + out * big * Math.round(k - 11), to + 3 * big - big * Math.round(k - 13), big, big, SWEAT[0]!)
  }

  return canvas
}
