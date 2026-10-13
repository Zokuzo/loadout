// The Y2K themes' mascots: four objects of polished metal, one per model, turning in three dimensions and drawn in
// ASCII characters. Each cell is one ray marched to the object's surface. What reads as depth is drawn as weight: a part
// near the eye and facing the light is a heavy character in the skin's strongest colour, a part far behind a faint one,
// and where one part passes in front of another a cell is left empty behind its edge, so the two never run together.
// Pure: a grid is derived from (skin, form, mood, now, size) alone, so previews and tests draw what the pane draws.
import { NONE, mix } from './hud'
import type { Grid, Skin } from './hud'
import type { Form } from './look'
import type { Mood } from './mascot'

/** The rows the object takes where the pane has them: taller than a mask, so its curves read. */
export const OBJECT_ROWS = 24

/** Whether a skin is one of the two the objects are drawn in. */
export const isChrome = (skin: Skin): boolean => skin.variant === 'chrome' || skin.variant === 'midnight'

// Characters by the ink they lay, least to most.
const RAMP = '.:-=+*#%@'
const TAU = 2 * Math.PI
const EYE = 3 // how far the eye stands from the object: near enough that what comes forward grows
const LENS = 0.47 // half the view's height, one unit away
const REACH = 1.5 // no object reaches farther from the centre
const CELL = 0.5 // a cell's width over its height

type V = readonly [number, number, number]
/** A distance field at `p`, `u` of the way through its loop (0 to 1), working (`e` 1) or not (0): the distance, and how boldly a ray may step by it. */
type Field = (p: V, u: number, e: number) => readonly [distance: number, pace: number]

/** `p` as the object sees it once turned by `a` about an axis. */
function rot(p: V, axis: 0 | 1 | 2, a: number): V {
  const [i, j] = ([[1, 2], [2, 0], [0, 1]] as const)[axis]
  const [c, s] = [Math.cos(a), Math.sin(a)]
  const q: [number, number, number] = [p[0], p[1], p[2]]
  q[i] = c * p[i] + s * p[j]
  q[j] = -s * p[i] + c * p[j]

  return q
}

const smin = (a: number, b: number, k: number) => {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k))

  return b + (a - b) * h - k * h * (1 - h)
}

/** A flat band bent into a ring and twisted `turns` times along it; `flow` slides the twist around. */
function ribbon(p: V, radius: number, half: number, thick: number, turns: number, flow: number): number {
  const th = turns * Math.atan2(p[2], p[0]) + flow
  const [qx, qy, c, s] = [Math.hypot(p[0], p[2]) - radius, p[1], Math.cos(th), Math.sin(th)]
  const [dx, dy] = [Math.abs(c * qx + s * qy) - half, Math.abs(-s * qx + c * qy) - thick]

  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - 0.03
}

const torus = (p: V, radius: number, tube: number) => Math.hypot(Math.hypot(p[0], p[2]) - radius, p[1]) - tube
const bicone = (r: number, y: number, height: number, base: number) => (r * height + Math.abs(y) * base - height * base) / Math.hypot(height, base)

// (Everything is thick: a cell is a tenth of the object, and a band thinner than that flickers between two rays. And everything
// turns all the way round: it is the turning that shows what is in front. `u` runs a whole loop, and each shape comes back to itself.)
const FIELDS: Readonly<Record<Form, Field>> = {
  // Opus, Seraph: a ring seen through its hole, swinging round and nodding, a bead looping through the hole and back over the rim.
  opus: (at, u, e) => {
    const p = rot(rot(at, 0, 0.5 + 0.35 * Math.sin(TAU * u)), 1, TAU * u)
    const a = TAU * u * (2 + e)
    const bead = Math.hypot(p[0] - 0.85 - 0.4 * Math.cos(a), p[1], p[2] - 0.4 * Math.sin(a)) - 0.17

    return [Math.min(Math.hypot(Math.hypot(p[0], p[1]) - 0.85, p[2]) - 0.24, bead), 0.9]
  },
  // Sonnet, Lumen: liquid metal, a big drop and two small ones that circle it and sink into it as they pass.
  sonnet: (at, u, e) => {
    const p = rot(at, 0, 0.45)
    let d = Math.hypot(p[0], p[1], p[2]) - (0.72 + 0.04 * Math.sin(TAU * u * (1 + e)))
    for (let i = 0; i < 2; i++) {
      const a = TAU * u * (1 + e) + Math.PI * i
      const out = 0.85 + 0.3 * Math.sin(2 * a)
      d = smin(d, Math.hypot(p[0] - out * Math.cos(a), p[1] - 0.2 * Math.sin(a), p[2] - out * Math.sin(a)) - 0.22, 0.25)
    }

    return [d, 0.8]
  },
  // Haiku, Spark: a four-point star turning on its long axis, two beads circling it the other way.
  haiku: (at, u, e) => {
    const p = rot(at, 2, 0.2)
    const q = rot(p, 1, Math.PI * u * (1 + e))
    const cross = smin(bicone(Math.hypot(q[0], q[2]), q[1], 1.2, 0.34), bicone(Math.hypot(q[1], q[2]), q[0], 0.95, 0.3), 0.12)
    const star = smin(cross, bicone(Math.hypot(q[0], q[1]), q[2], 0.5, 0.34), 0.12) - 0.03
    const b = rot(rot(p, 0, 0.5), 1, -Math.PI * u * (1 + e))

    return [Math.min(star, Math.hypot(Math.abs(b[0]) - 1.12, b[1], b[2]) - 0.15), 0.7]
  },
  // Fable, Halo: a core in three rings, each turning on its own axis.
  fable: (at, u, e) => {
    const p = rot(at, 0, 0.4)
    const core = Math.hypot(p[0], p[1], p[2]) - (0.36 + 0.04 * e * Math.sin(2 * TAU * u))
    const rings = Math.min(torus(rot(p, 0, Math.PI * u * (1 + e)), 0.66, 0.1), torus(rot(rot(p, 2, 0.9), 0, -Math.PI * u), 0.93, 0.1), torus(rot(rot(p, 0, 1.2), 2, Math.PI * u * (1 + e)), 1.2, 0.1))

    return [Math.min(core, rings), 0.85]
  },
}

// Where the light stands: up, to the left, in front. And half way between it and the eye, for the metal's glint.
const unit = (x: number, y: number, z: number): V => {
  const n = Math.hypot(x, y, z)

  return [x / n, y / n, z / n]
}
const KEY = unit(-0.5, 0.75, 0.6)
const GLINT = unit(KEY[0], KEY[1], KEY[2] + 1)

// How long a loop lasts in each mood, ms: at work everything flows twice as fast.
const LOOP_MS: Readonly<Record<Mood, number>> = { idle: 6400, working: 3200, happy: 4000, worried: 9600 }

const hash = (a: number, b: number) => {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)

  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * The model's object at `now`, in a grid of `columns` by `rows` cells, centred. At rest it turns slowly; at work it turns
 * and flows twice as fast; pleased, it bobs and the air around it twinkles; worried, it slows and takes the alert's colour.
 * The same characters on both skins: the heavier, the nearer and the more lit. By night heavy is bright, by day heavy is dark ink.
 */
export function chromeFrame(skin: Skin, form: Form, mood: Mood, now: number, columns: number, rows: number): Grid {
  const words = new Uint32Array(Math.max(0, columns * rows) * 3).fill(NONE)
  for (let i = 0; i < words.length; i += 3) words[i] = 0x20
  const grid = { columns, rows, words }
  if (rows < 1 || columns < 1) return grid
  const put = (x: number, y: number, glyph: string, fg: number) => {
    words[(y * columns + x) * 3] = glyph.charCodeAt(0)
    words[(y * columns + x) * 3 + 1] = fg
  }
  const effort = mood === 'working' ? 1 : 0
  const u = (now % LOOP_MS[mood]) / LOOP_MS[mood]
  const lift = mood === 'happy' ? 0.12 * Math.sin((TAU * (now % 800)) / 800) : 0
  const field = FIELDS[form]
  const far = (p: V) => field([p[0], p[1] - lift, p[2]], u, effort)
  // The far end of the ramp of colours is faint on the pane's ground, the near end the strongest the skin has.
  const [faint, strong] = [mix(skin.body, skin.dim, 0.5), skin.bright]
  const tinted = (color: number) => (mood === 'worried' ? mix(color, skin.alert, 0.55) : color)

  // First every cell's ray: how far along it the surface is (Infinity: nothing there) and how heavy the cell is, 0 to 1 and a little more on a glint.
  const depth = new Float32Array(columns * rows).fill(Infinity)
  const weight = new Float32Array(columns * rows)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const [dx, dy] = [((x + 0.5 - columns / 2) * 2 * LENS * CELL) / rows, (1 - ((y + 0.5) / rows) * 2) * LENS]
      const n = Math.hypot(dx, dy, 1)
      const d: V = [dx / n, dy / n, -1 / n]
      // (The eye is on the z axis: a ray that passes farther than REACH from the centre meets nothing.)
      const along = EYE / n
      if (EYE * EYE - along * along >= REACH * REACH) continue
      let t = EYE - REACH
      let isHit = false
      for (let i = 0; i < 48 && t < EYE + REACH; i++) {
        const [distance, pace] = far([d[0] * t, d[1] * t, EYE + d[2] * t])
        if (distance < 0.012) {
          isHit = true
          break
        }
        t += distance * pace
      }
      if (!isHit) continue
      const p: V = [d[0] * t, d[1] * t, EYE + d[2] * t]
      // The surface's normal: the field's slope, from four points about `p`.
      const g = [0, 0, 0]
      for (const k of [[1, -1, -1], [-1, -1, 1], [-1, 1, -1], [1, 1, 1]] as const) {
        const here = far([p[0] + k[0] * 0.01, p[1] + k[1] * 0.01, p[2] + k[2] * 0.01])[0]
        for (let i = 0; i < 3; i++) g[i]! += k[i]! * here
      }
      const size = Math.hypot(g[0]!, g[1]!, g[2]!) || 1
      const lit = Math.max(0, (g[0]! * KEY[0] + g[1]! * KEY[1] + g[2]! * KEY[2]) / size)
      const glint = Math.max(0, (g[0]! * GLINT[0] + g[1]! * GLINT[1] + g[2]! * GLINT[2]) / size) ** 24
      // Near is 1, the far side of the object 0: the nearer, the heavier, whatever the light.
      const near = Math.max(0, Math.min(1, (EYE + REACH * 0.8 - t) / (REACH * 1.6)))
      depth[y * columns + x] = t
      weight[y * columns + x] = (0.15 + 0.85 * near ** 1.3) * (0.5 + 0.5 * lit) + 0.6 * glint
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const at = y * columns + x
      const t = depth[at]!
      if (t === Infinity) continue
      // Behind the edge of a part that stands clearly nearer, nothing is drawn: a gap of one cell tells the two apart.
      const isBehind = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => x + i! >= 0 && x + i! < columns && y + j! >= 0 && y + j! < rows && depth[at + i! + j! * columns]! < t - 0.3)
      if (isBehind) continue
      const tone = Math.min(1, weight[at]!)
      const color = tone < 0.5 ? mix(faint, skin.primary, tone * 2) : mix(skin.primary, strong, tone * 2 - 1)
      put(x, y, RAMP[Math.min(RAMP.length - 1, Math.floor(tone * RAMP.length))]!, tinted(weight[at]! > 1.02 ? strong : color))
    }
  }
  // Pleased: a few glints in the air about it, each for a third of a second, where nothing is drawn.
  if (mood === 'happy') {
    const beat = Math.floor(now / 330)
    for (let k = 0; k < 6; k++) {
      const [x, y] = [Math.floor(hash(k, beat) * columns), Math.floor(hash(beat, k + 7) * rows)]
      if (words[(y * columns + x) * 3] === 0x20) put(x, y, '+*.'[k % 3]!, skin.value)
    }
  }

  return grid
}
