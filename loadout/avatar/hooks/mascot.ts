// The main mascot in true pixels: its sprite keeps its exact pixels, each `scale` art pixels wide,
// and moves an art pixel at a time. Pure: a frame is derived from (mood, now) alone.
import { blank, paint } from './canvas'
import type { Canvas } from './canvas'
import type { Pixels } from './look'
import { decode } from './forms'

export type Mood = 'idle' | 'working' | 'worried' | 'happy'

/** Art pixels kept free around the sprite: at each side to shake in, above to jump in. */
export const MARGIN = 3
export const HEADROOM = 9

const BLINK_EVERY = 4000
const SPARKS = [0x5fd7ff, 0xffd75f, 0xaf87ff]
const HEART = 0xff1784
const FRAME_MS = 90
// The working bob, a frame at a time: up, held, down, held. Even, whatever the clock's phase.
const BOB = [0, 1, 2, 2, 2, 1, 0, 0]
// Drawn at the picture's own pixel, finer than the mascot's: a heart, and a spark as it flies and as it flares.
// The worried shake: a shiver of eight frames, eased out and back each way, then a rest twice as long.
const SHIVER = [0, 1, 2, 1, 0, -1, -2, -1]
const SHIVER_EVERY = 24

/** How far aside the worried shake has a mascot at `now`, in art pixels. */
export const shakeAt = (now: number): number => {
  const k = Math.floor(now / FRAME_MS) % SHIVER_EVERY

  return k < SHIVER.length ? SHIVER[k]! : 0
}

const [HEART_PX, SPARK_PX, FLARE_PX] = decode([HEART], [
  ['.00...00.', '0000.0000', '000000000', '000000000', '.0000000.', '..00000..', '...000...', '....0....'],
  ['.0.', '000', '.0.'],
  ['..0..', '..0..', '00000', '..0..', '..0..'],
])

/** Which of a mascot's frames shows at `now`: its eyes (0 open, 1 half shut, 2 shut) and whether its mouth is shut. */
export function faceAt(mood: Mood, now: number): { eyes: 0 | 1 | 2; isMouthShut: boolean } {
  const blink = now % BLINK_EVERY
  // At work the mouth chatters on an even beat of two frames; the eyes narrow for a held moment now and then, never in time with it.
  const isMouthShut = mood === 'working' && Math.floor(now / (2 * FRAME_MS)) % 2 === 1
  if (mood === 'idle' && blink >= BLINK_EVERY - 270) return { eyes: blink >= BLINK_EVERY - 180 && blink < BLINK_EVERY - 90 ? 2 : 1, isMouthShut }

  return { eyes: mood === 'worried' || (mood === 'working' && now % 2880 >= 2160) ? 1 : 0, isMouthShut }
}

/**
 * One frame of the mascot, `width` by `height` art pixels, stood on the bottom row and mirrored
 * (the mascots look left, at the conversation): idle breathes, a pixel or two, and blinks; working
 * bobs with sparks arcing off; happy jumps under rising hearts; worried shakes.
 */
export function mascotFrame(px: Pixels, mood: Mood, now: number, width: number, height: number, scale: number): Canvas {
  const canvas = blank(width, height)
  const [w, h] = [px[0]!.length * scale, px.length * scale]
  const lift =
    mood === 'happy' ? HEADROOM * 4 * ((now % 720) / 720) * (1 - (now % 720) / 720)
    : mood === 'working' ? BOB[Math.floor(now / FRAME_MS) % BOB.length]!
    : mood === 'idle' ? 1 - Math.cos((2 * Math.PI * now) / 3200)
    : 0
  const shake = mood === 'worried' ? shakeAt(now) : 0
  const [x, y] = [((width - w) >> 1) + shake, height - h - Math.round(lift)]
  // What flies about him is drawn first: he is in front of it, never under a spark.
  if (mood === 'working') {
    // Sparks thrown up off his head, each on its own arc, flaring half way.
    SPARKS.forEach((color, i) => {
      const u = (now / 900 + i / SPARKS.length) % 1
      const side = i % 2 === 0 ? -1 : 1
      const one = u > 0.35 && u < 0.6 ? FLARE_PX! : SPARK_PX!
      paint(canvas, one, Math.round(x + w / 2 + side * (w / 4 + u * w / 3)) - (one.length >> 1), Math.round(y + scale * 2 - 14 * u * (1.6 - u)) - (one.length >> 1), { tint: color })
    })
  } else if (mood === 'happy') {
    // Hearts rising in the corners his round head leaves free.
    for (const side of [0, 1]) {
      const u = (now / 1400 + side / 2) % 1
      const sway = Math.round(Math.sin(u * 9 + side * 2))
      paint(canvas, HEART_PX!, side === 0 ? 2 + sway : width - 11 + sway, Math.round((y + h * 0.26) * (1 - u)))
    }
  }
  paint(canvas, px, x, y, { flip: true, scale })

  return canvas
}
