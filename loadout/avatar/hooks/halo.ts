// The Halo themes' mascots, drawn in ASCII as the Y2K objects are (chrome.ts): each cell is one ray marched to a surface, and
// what is near and lit is a heavy character in a strong colour. One is Cortana, close: her head under its bob, her shoulders,
// a hologram that looks where the work is, with a panel, an orb or her fragments about her. The other is the Master
// Chief's helmet, which turns to look, nods, tilts, and whose visor and shield tell the same things.
// A surface has a material, and a material its own colours: the armour's green and the visor's gold never run together.
// Pure: a grid is derived from (skin, form, mood, what is done, now, size) alone; `haloLive` alone remembers the pose before, to ease out of it.
import { hash, smin } from './chrome'
import { NONE, mix } from './hud'
import type { Grid, Skin, State } from './hud'
import type { Form } from './look'
import type { Mood } from './mascot'

/** Whether a skin is one of the two these figures are drawn in: `cortana` is hers, `mjolnir` the Chief's. */
export const isHalo = (skin: Skin): boolean => skin.variant === 'cortana' || skin.variant === 'mjolnir'

/** The rows a figure takes where the pane has them: more than a chrome object's, for the definition of a face. */
export const HALO_ROWS = 28

/** What a figure acts out: the kind of the call that runs, else the turn's mood. */
export type Cue = Mood | 'scan' | 'edit' | 'exec' | 'net' | 'call' | 'load' | 'ask' | 'tool'

/** A mood and a running call's state as a cue: a call that failed is a worry, one that ended a rest. */
export const cueOf = (mood: Mood, doing?: State): Cue =>
  doing === undefined || doing === 'halt' || doing === 'done' ? mood : doing === 'think' ? 'working' : doing === 'fail' ? 'worried' : doing

const TAU = 2 * Math.PI
const EASE_MS = 420 // from one pose into the next

type V = readonly [number, number, number]

// --- shapes: the distance from a point to each, the point given as three numbers (nothing is allocated per ray) ---

const egg = (x: number, y: number, z: number, rx: number, ry: number, rz: number) => {
  const k0 = len(x / rx, y / ry, z / rz)
  const k1 = len(x / (rx * rx), y / (ry * ry), z / (rz * rz))

  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1
}

const slab = (x: number, y: number, z: number, bx: number, by: number, bz: number, r: number) => {
  const qx = Math.abs(x) - bx
  const qy = Math.abs(y) - by
  const qz = Math.abs(z) - bz

  return len(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r
}

/** A limb from `a` to `b`, `ra` thick at `a` and `rb` at `b`. */
const limb = (x: number, y: number, z: number, a: V, b: V, ra: number, rb = ra) => {
  const bx = b[0] - a[0]
  const by = b[1] - a[1]
  const bz = b[2] - a[2]
  const px = x - a[0]
  const py = y - a[1]
  const pz = z - a[2]
  const h = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz || 1)))

  return len(px - bx * h, py - by * h, pz - bz * h) - (ra + (rb - ra) * h)
}

/** The length of (x, y, z): what Math.hypot gives, several times faster. */
const len = (x: number, y: number, z = 0) => Math.sqrt(x * x + y * y + z * z)

const ease = (u: number) => {
  const q = Math.max(0, Math.min(1, u))

  return q * q * (3 - 2 * q)
}
const wave = (now: number, period: number) => Math.sin((TAU * (now % period)) / period)

/** A scene: how far the eye stands and how wide it sees (half the view's height, one unit away: far and narrow, so nothing near the eye swells), the height it looks at, how far from there anything reaches, and the distance from a point to the nearest surface (`kind` is then that surface's material). */
type Scene = { eye: number; lens: number; mid: number; reach: number; at: (x: number, y: number, z: number) => number }
let kind = 0
const [PLATE, GLASS, UNDER, LIGHT, FACE] = [0, 1, 2, 3, 4] as const // armour or her body; visor or hair; undersuit; what glows (a panel, an orb); her face

/** The nearest of two surfaces, `kind` set to its material. */
const nearest = (a: number, ka: number, b: number, kb: number) => {
  kind = a <= b ? ka : kb

  return Math.min(a, b)
}

// --- the Master Chief ---------------------------------------------------------

/** A helmet's pose: turned left (toward the conversation), nodded down, tilted, in radians; and lifted. */
type Bearing = readonly [yaw: number, pitch: number, roll: number, lift: number]

const BEARINGS: Readonly<Record<Cue, Bearing>> = {
  idle: [0.42, 0.04, 0, 0], working: [0, 0.06, 0, 0], happy: [0.2, 0, 0, 0], worried: [0, 0.1, 0, 0],
  scan: [0.3, 0.24, 0, 0], edit: [0.12, 0.3, 0, 0], exec: [0, 0, 0, 0.02], net: [-0.3, -0.24, 0, 0],
  call: [0, 0, 0, 0], load: [0.1, -0.14, 0, 0], ask: [0.3, 0.02, 0.24, 0], tool: [0.18, 0.12, -0.1, 0],
}

/** The pose at `now`: the cue's, and what moves in it (a slow look around at rest, a sweep at work, a nod when pleased, a shake when not). */
function bearingAt(cue: Cue, now: number): Bearing {
  const [yaw, pitch, roll, lift] = BEARINGS[cue]
  const breath = 0.012 * wave(now, 3600)
  if (cue === 'idle') {
    // (Left, at the conversation, with a glance ahead now and then.)
    const v = now % 9000
    const ahead = v < 6400 ? 0 : v < 7000 ? ease((v - 6400) / 600) : v < 8400 ? 1 : 1 - ease((v - 8400) / 600)

    return [yaw * (1 - 1.5 * ahead) + 0.22 * wave(now, 5200), pitch + 0.04 * wave(now, 7800), roll, breath]
  }
  if (cue === 'working') return [0.5 * wave(now, 3800), pitch + 0.04 * wave(now, 1900), roll, breath]
  if (cue === 'happy') return [yaw, 0.28 * Math.max(0, wave(now, 720)), roll, breath]
  if (cue === 'worried') return [0.14 * wave(now, 360), pitch, roll, 0]
  if (cue === 'call') return [0.62 * wave(now, 2400), pitch, roll, breath]
  if (cue === 'scan') return [yaw + 0.16 * wave(now, 2600), pitch, roll, breath]
  if (cue === 'ask') return [yaw, pitch, roll * (0.8 + 0.2 * wave(now, 2200)), breath]

  return [yaw + 0.04 * wave(now, 2800), pitch + 0.02 * wave(now, 1400), roll, lift + breath]
}

const HEAD_Y = 0.06 // the helmet's centre over the scene's

// A point as the helmet sees it, left here by `helmetOf`'s answer: three numbers, and nothing allocated per ray.
let [lx, ly, lz] = [0, 0, 0]

/** For a bearing, what turns a point of the scene into the helmet's own space (`lx`, `ly`, `lz`): the turn is worked out once a frame. */
function helmetOf([yaw, pitch, roll, lift]: Bearing): (x: number, y: number, z: number) => void {
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch), Math.cos(roll), Math.sin(roll)]

  return (x, y0, z) => {
    const y = y0 - HEAD_Y - lift
    const x1 = cy * x + sy * z // about the neck
    const z1 = -sy * x + cy * z
    const y2 = cp * y + sp * z1 // the nod
    lz = -sp * y + cp * z1
    lx = cr * x1 + sr * y2 // the tilt
    ly = -sr * x1 + cr * y2
  }
}

// The visor: the tall opening in the front of the shell, in the helmet's own space: its middle and its half sizes.
const VISOR = { y: -0.03, z: 0.8, bx: 0.54, by: 0.33 } as const
const [BILL_COS, BILL_SIN] = [Math.cos(0.22), Math.sin(0.22)]

/**
 * The Mark VI as a few solids, after the game's own: a boxy shell with a flat plate along its top, a bill that juts out over
 * a tall gold visor, a cheek guard at each side of the visor's foot with its two lamps, a chin guard that rises to a point
 * between them, and a hose from each side of the jaw. Under it the neck of the undersuit, the chest plate and a pauldron at each side.
 */
function chief(bearing: Bearing): Scene {
  const local = helmetOf(bearing)
  const rise = bearing[3]

  return {
    eye: 7,
    lens: 0.158,
    mid: 0,
    reach: 1.75,
    at: (x, y, z) => {
      // What stands under the helmet does not turn with it, and breathes with it.
      const by = y - rise
      // (The helmet fills the picture: of the armour under it, the collar alone shows.)
      const body = Math.max(Math.abs(len(x, z) - 0.56) - 0.12, Math.abs(by + 1.08) - 0.1) - 0.04
      const neck = Math.max(len(x, z) - 0.42, Math.abs(by + 0.95) - 0.3)
      // (Far from the helmet, its distance is that to a ball about it: its plates are worked out only near them.)
      const ball = len(x, by - HEAD_Y, z) - 1.3
      if (ball > 0.25) return nearest(Math.min(body, ball), PLATE, neck, UNDER)
      local(x, y, z)
      const ax = Math.abs(lx)
      const shell = smin(egg(lx, ly - 0.04, lz + 0.04, 0.8, 0.86, 0.9), slab(lx, ly + 0.36, lz + 0.02, 0.5, 0.28, 0.56, 0.22), 0.2)
      const cut = slab(lx, ly - VISOR.y, lz - VISOR.z, VISOR.bx, VISOR.by, 0.42, 0.1)
      let plate = Math.max(shell, -cut)
      plate = smin(plate, Math.max(shell - 0.05, ax - 0.28, 0.42 - ly, -0.6 - lz), 0.04) // the plate along the top
      // The bill: a slab over the visor, tipped down toward its front edge.
      const billY = BILL_COS * (ly - 0.43) + BILL_SIN * (lz - 0.66)
      const billZ = -BILL_SIN * (ly - 0.43) + BILL_COS * (lz - 0.66)
      plate = smin(plate, slab(lx, billY, billZ, 0.6, 0.035, 0.3, 0.05), 0.07)
      // The chin guard: a wedge whose point rises between the cheek guards, on a bar across the jaw.
      const wedge = Math.max((ly + 0.3 + 0.7 * ax) / 1.22, Math.abs(lz - 0.84) - 0.13, -0.8 - ly, ax - 0.4) - 0.03
      plate = Math.min(plate, wedge, slab(lx, ly + 0.66, lz - 0.52, 0.4, 0.1, 0.34, 0.06))
      plate = Math.min(plate, slab(ax - 0.56, ly + 0.44, lz - 0.7, 0.13, 0.18, 0.2, 0.04)) // a cheek guard
      const glass = Math.max(shell + 0.1, cut - 0.03)
      const hose = limb(ax, ly, lz, HOSE[0], HOSE[1], 0.09)
      const lamps = Math.min(len(ax - 0.56, ly + 0.36, lz - 0.93), len(ax - 0.56, ly + 0.5, lz - 0.93)) - 0.05

      return nearest(nearest(nearest(Math.min(plate, body), PLATE, glass, GLASS), kind, Math.min(neck, hose), UNDER), kind, lamps, LIGHT)
    },
  }
}
const HOSE: readonly [V, V] = [[0.36, -0.56, 0.62], [0.2, -0.95, 0.3]]

// --- Cortana ------------------------------------------------------------------

// The panel she reads and writes, beside her head: its middle and its half sizes, in a picture that shows `wide` to each side of her.
const PANEL = { y: 0.2, by: 0.36 } as const
const panelIn = (wide: number) => ({ x: -Math.max(0.5, Math.min(0.92, wide - 0.28)), bx: 0.22 })

/** What she has about her for a cue, lit: a panel, an orb, her fragments. The distance to it (Infinity: nothing). */
function propOf(cue: Cue, now: number, wide: number): (x: number, y: number, z: number) => number {
  if (cue === 'scan' || cue === 'edit') {
    const panel = panelIn(wide)

    return (x, y, z) => slab(x - panel.x, y - PANEL.y, z - 0.45, panel.bx, PANEL.by, 0.02, 0.02)
  }
  if (cue === 'call') {
    const turn = (TAU * (now % 3600)) / 3600
    const out = Math.min(1.02, wide - 0.14)
    const orbs = [0, 1, 2].map(i => [out * Math.cos(turn + (TAU * i) / 3), 0.25 + 0.3 * Math.sin(2 * turn + i), 0.7 * Math.sin(turn + (TAU * i) / 3)] as const)

    return (x, y, z) => Math.min(len(x - orbs[0]![0], y - orbs[0]![1], z - orbs[0]![2]), len(x - orbs[1]![0], y - orbs[1]![1], z - orbs[1]![2]), len(x - orbs[2]![0], y - orbs[2]![1], z - orbs[2]![2])) - 0.12
  }
  if (cue === 'load' || cue === 'tool') {
    const out = Math.min(0.95, wide - 0.2)

    return (x, y, z) => len(x - out, y - (cue === 'load' ? 0.78 : -0.3) - 0.04 * wave(now, 1100), z - 0.3) - (0.13 + 0.03 * wave(now, 700))
  }

  return () => Infinity
}

/**
 * Cortana, close: a head (a brow, the hollows of the eyes, a nose, lips, a chin) under a bob of hair cut at the jaw and swept
 * across the forehead, a neck, her shoulders. The head turns as a bearing says; the shoulders stay.
 */
function cortana(bearing: Bearing, cue: Cue, now: number, wide: number): Scene {
  const local = helmetOf(bearing)
  const prop = propOf(cue, now, wide)

  return {
    eye: 7,
    lens: 0.166,
    mid: -0.17,
    reach: 2,
    at: (x, y, z) => {
      const body = smin(limb(x, y, z, NECK[0], NECK[1], 0.25, 0.3), smin(limb(x, y, z, SHOULDERS[0], SHOULDERS[1], 0.2), egg(x, y + 1.42, z - 0.02, 0.62, 0.34, 0.3), 0.15), 0.12)
      const light = prop(x, y, z)
      // (Far from her head, its distance is that to a ball about it.)
      const ball = len(x, y - HEAD_Y, z) - 1.12
      if (ball > 0.25) return nearest(Math.min(body, ball), PLATE, light, LIGHT)
      local(x, y, z)
      const ax = Math.abs(lx)
      // The skull, the cheeks and jaw running down to the chin, and what stands out of the face or is sunk in it.
      let face = smin(egg(lx, ly - 0.16, lz + 0.04, 0.58, 0.64, 0.66), egg(lx, ly + 0.2, lz - 0.14, 0.44, 0.56, 0.5), 0.18)
      face = smin(face, len(lx, ly + 0.7, lz - 0.34) - 0.13, 0.12) // the chin
      face = smin(face, limb(lx, ly, lz, NOSE[0], NOSE[1], 0.05, 0.085), 0.06)
      face = smin(face, egg(lx, ly + 0.46, lz - 0.58, 0.15, 0.055, 0.07), 0.04) // the lips
      face = smin(face, egg(ax - 0.2, ly - 0.12, lz - 0.54, 0.2, 0.05, 0.1), 0.06) // a brow
      face = -smin(-face, len(ax - 0.21, ly + 0.04, lz - 0.66) - 0.1, 0.06) // the hollow of an eye
      // The bob: a shell about the skull, open over the face (lower on one side: the fringe is swept across), cut at the jaw.
      const shell = Math.min(egg(lx, ly - 0.2, lz + 0.08, 0.64, 0.67, 0.72), Math.max(len(lx, (lz + 0.08) * 0.9) - 0.63, Math.abs(ly + 0.28) - 0.44) - 0.02)
      const hair = Math.max(shell, -egg(lx - 0.1, ly + 0.2, lz - 0.7, 0.5, 0.74, 0.56), -(shell + 0.12))

      return nearest(nearest(nearest(body, PLATE, face, FACE), kind, hair, GLASS), kind, light, LIGHT)
    },
  }
}
const NECK: readonly [V, V] = [[0, -0.5, -0.08], [0, -1.05, -0.12]]
const SHOULDERS: readonly [V, V] = [[-0.84, -1.16, -0.12], [0.84, -1.16, -0.12]]
const NOSE: readonly [V, V] = [[0, 0.0, 0.58], [0, -0.22, 0.72]]

/** For a bearing, what turns a point of the head's own space back into the scene's: where her eyes and mouth are. */
function sceneOf([yaw, pitch, roll, lift]: Bearing): (x: number, y: number, z: number) => V {
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch), Math.cos(roll), Math.sin(roll)]

  return (x, y, z) => {
    const [x1, y2] = [cr * x - sr * y, sr * x + cr * y]
    const [y1, z1] = [cp * y2 - sp * z, sp * y2 + cp * z]

    return [cy * x1 - sy * z1, y1 + HEAD_Y + lift, sy * x1 + cy * z1]
  }
}

// --- the drawing --------------------------------------------------------------

// Where the light stands: up, to the left, in front. And half way between it and the eye, for a glint.
const unit = (x: number, y: number, z: number): V => {
  const n = Math.hypot(x, y, z)

  return [x / n, y / n, z / n]
}
const KEY = unit(-0.5, 0.75, 0.6)
const GLINT = unit(KEY[0], KEY[1], KEY[2] + 1)

// A model's own hue, mixed into the armour or the hologram: the Chief and three of Blue Team; Cortana and three of her kind.
const HUES: Readonly<Record<'cortana' | 'mjolnir', Readonly<Record<Form, readonly [hue: number, share: number]>>>> = {
  mjolnir: { opus: [0, 0], sonnet: [0x6fa8d8, 0.5], haiku: [0xd8c088, 0.5], fable: [0xd0d6e0, 0.55] },
  cortana: { opus: [0, 0], sonnet: [0x6fe6c0, 0.6], haiku: [0xe08cff, 0.6], fable: [0xffb86b, 0.6] },
}

/** What came before a cue and when it gave way: the figure eases out of it. */
export type Before = { cue: Cue; at: number }

const blend = (a: readonly number[], b: readonly number[], u: number) => b.map((n, i) => a[i]! + (n - a[i]!) * u)

// Characters by the ink they lay, least to most (chrome.ts's own).
const RAMP = '.:-=+*#%@'
const DIGITS = '0110100111010+=<>/'
const CELL = 0.5 // a cell's width over its height
// A cell's four neighbours.
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
// The character for each way a cell's quarters can be covered (bit 0 top left, 1 top right, 2 bottom left, 3 bottom right).
const STROKES = [' ', '`', "'", '"', '.', ')', '/', '/', '.', '\\', '(', '\\', '_', '\\', '/', '#']

/**
 * The figure at `now` in a grid of `columns` by `rows` cells, centred: Cortana in her skin, the Chief's helmet in his.
 * Drawn as the Y2K objects are: each cell is one ray marched to the surface, and what reads as depth is drawn as weight (a
 * part near the eye and facing the light is a heavy character in a strong colour); behind the edge of a part that stands
 * nearer a cell is left empty. Each material has its own colours. `doing` is the state of the call that runs, if one does:
 * with the mood it makes the cue acted out. `before` is the cue left a moment ago: the pose moves from it to this one.
 */
export function haloFrame(skin: Skin, form: Form, mood: Mood, now: number, columns: number, rows: number, doing?: State, before?: Before): Grid {
  const words = new Uint32Array(Math.max(0, columns * rows) * 3).fill(NONE)
  for (let i = 0; i < words.length; i += 3) words[i] = 0x20
  const grid = { columns, rows, words }
  if (rows < 1 || columns < 1) return grid
  const put = (x: number, y: number, glyph: string, fg: number) => {
    if (x < 0 || y < 0 || x >= columns || y >= rows) return
    words[(y * columns + x) * 3] = glyph.charCodeAt(0)
    words[(y * columns + x) * 3 + 1] = fg
  }
  const isEmpty = (x: number, y: number) => x >= 0 && y >= 0 && x < columns && y < rows && words[(y * columns + x) * 3] === 0x20
  const isHer = skin.variant === 'cortana'
  const cue = cueOf(mood, doing)
  const into = before === undefined ? 1 : ease((now - before.at) / EASE_MS)
  const turned = into < 1 && before !== undefined ? blend(bearingAt(before.cue, now), bearingAt(cue, now), into) : [...bearingAt(cue, now)]
  // (She turns less than he does: her face is what is looked at.)
  if (isHer) turned[0]! *= 0.55
  const bearing = turned as unknown as Bearing
  // How far to each side of her the picture shows: what she has about her stays inside it.
  const wide = ((isHer ? 0.166 : 0.158) * 7 * columns * CELL) / rows
  const scene = isHer ? cortana(bearing, cue, now, wide) : chief(bearing)
  const panel = panelIn(wide)
  const local = helmetOf(bearing)
  const { eye, lens, mid, reach } = scene
  const far = (x: number, y: number, z: number) => scene.at(x, y + mid, z)

  // Each material's colours, faint to strong; the first is in the model's own hue.
  const [hue, share] = HUES[isHer ? 'cortana' : 'mjolnir'][form]
  const own = mix(skin.primary, hue, share)
  const alarm = cue === 'worried' ? 0.3 + 0.3 * (0.5 + 0.5 * wave(now, 720)) : 0
  const tinted = (color: number) => mix(color, skin.alert, alarm)
  const tones: readonly (readonly [number, number, number])[] = [
    [mix(skin.body, skin.dim, 0.5), own, skin.bright],
    [mix(skin.shadow, skin.cyan, 0.7), skin.cyan, mix(skin.cyan, skin.bright, 0.8)],
    [mix(skin.tint, skin.dim, 0.5), mix(skin.shadow, skin.dim, 0.85), skin.dim],
    [skin.value, skin.value, mix(skin.value, skin.bright, 0.6)],
    [mix(skin.body, skin.dim, 0.5), own, skin.bright],
  ]

  // First every cell's ray: how far along it the surface is, what it is made of, and how heavy the cell is.
  const size = columns * rows
  const depth = new Float32Array(size).fill(Infinity)
  const weight = new Float32Array(size)
  const made = new Uint8Array(size)
  const where = new Float32Array(size * 3)
  // A ray through a point of the grid (in cells, fractions too): how far along it the surface is (Infinity: none), `kind` its material.
  let d0 = 0
  let d1 = 0
  let d2 = 0
  let here = Infinity
  const cast = (fx: number, fy: number): number => {
    const dx = ((fx - columns / 2) * 2 * lens * CELL) / rows
    const dy = (1 - (fy / rows) * 2) * lens
    const n = Math.hypot(dx, dy, 1)
    d0 = dx / n
    d1 = dy / n
    d2 = -1 / n
    const along = eye / n
    here = Infinity
    if (eye * eye - along * along >= reach * reach) return Infinity
    let t = eye - reach
    for (let i = 0; i < 48 && t < eye + reach; i++) {
      here = far(d0 * t, d1 * t, eye + d2 * t)
      if (here < 0.012) return t
      t += here * 0.92
    }

    return Infinity
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const t = cast(x + 0.5, y + 0.5)
      if (t === Infinity) continue
      const material = kind
      const px = d0 * t
      const py = d1 * t
      const pz = eye + d2 * t
      // The surface's slope there: how the distance changes a step along each axis.
      const gx = far(px + 0.012, py, pz) - here
      const gy = far(px, py + 0.012, pz) - here
      const gz = far(px, py, pz + 0.012) - here
      const at = y * columns + x
      const length = Math.hypot(gx, gy, gz) || 1
      const lit = Math.max(0, (gx * KEY[0] + gy * KEY[1] + gz * KEY[2]) / length)
      const glint = Math.max(0, (gx * GLINT[0] + gy * GLINT[1] + gz * GLINT[2]) / length) ** 24
      // Near is 1, the far side of the figure 0: the nearer, the heavier, whatever the light.
      const near = Math.max(0, Math.min(1, (eye + reach * 0.8 - t) / (reach * 1.6)))
      depth[at] = t
      made[at] = material
      where[at * 3] = px
      where[at * 3 + 1] = py + mid
      where[at * 3 + 2] = pz
      const solid = (0.15 + 0.85 * near ** 1.3) * (0.5 + 0.5 * lit) + 0.6 * glint
      // A visor is a mirror: heavy whatever the light. Her hair is dark, and so faint on a dark ground; what lies under the armour stays light.
      weight[at] = material === GLASS ? (isHer ? 0.1 + 0.3 * lit + 0.25 * glint : 0.62 + 0.3 * lit + 0.6 * glint) : material === UNDER ? 0.08 + 0.22 * lit : material === LIGHT ? 0.9 : isHer ? solid : 0.06 + 0.66 * solid
    }
  }

  // The outline, cut finer than a cell: where the figure ends, four rays are sent through a cell's quarters, and the cell is the
  // character whose shape is the part of it that is covered (a slope, a bracket, a low or a high stroke).
  const rim = new Uint8Array(size) // 0: not on the outline; else 1 + the covered quarters as bits (top left, top right, bottom left, bottom right)
  const rimOf = new Uint8Array(size)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const at = y * columns + x
      const isIn = depth[at]! < Infinity
      let isOut = false
      for (const [i, j] of AROUND) {
        const [nx, ny] = [x + i, y + j]
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows ? isIn : depth[ny * columns + nx]! < Infinity !== isIn) isOut = true
      }
      if (!isOut) continue
      let bits = 0
      for (let q = 0; q < 4; q++) {
        if (cast(x + 0.25 + 0.5 * (q & 1), y + 0.25 + 0.5 * (q >> 1)) < Infinity) {
          bits |= 1 << q
          rimOf[at] = kind
        }
      }
      rim[at] = 1 + bits
    }
  }

  const clock = Math.floor(now / 90)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const at = y * columns + x
      const t = depth[at]!
      if (rim[at]! > 0 && rim[at]! - 1 !== 15 && !(isHer && y >= rows - 3)) {
        // (All four quarters covered is a cell like any other; none is no cell.)
        const stroke = STROKES[rim[at]! - 1]!
        if (stroke !== ' ') put(x, y, stroke, tinted(mix(tones[rimOf[at]!]![1]!, tones[rimOf[at]!]![2]!, rimOf[at] === GLASS && isHer ? 0 : 0.35)))
        continue
      }
      if (t === Infinity) continue
      // Behind the edge of a part that stands clearly nearer, nothing is drawn: a gap of one cell tells the two apart.
      const isBehind = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => x + i! >= 0 && x + i! < columns && y + j! >= 0 && y + j! < rows && depth[at + i! + j! * columns]! < t - 0.2)
      if (isBehind) continue
      const material = made[at]!
      const [faint, plain, strong] = tones[material]!
      const tone = Math.min(1, weight[at]!)
      let glyph = RAMP[Math.min(RAMP.length - 1, Math.floor(tone * RAMP.length))]!
      let color = weight[at]! > 1.02 ? strong : tone < 0.5 ? mix(faint, plain, tone * 2) : mix(plain, strong, tone * 2 - 1)
      const wx = where[at * 3]!
      const wy = where[at * 3 + 1]!
      const wz = where[at * 3 + 2]!
      if (!isHer && material === GLASS) {
        // The visor: a streak of light drifts across it, and it shows what is done. Where a cell is on the glass: from its left edge (0) to its right (1), its foot (0) to its top (1).
        local(wx, wy, wz)
        const u = (lx / VISOR.bx + 1) / 2
        const v = ((ly - VISOR.y) / VISOR.by + 1) / 2
        if (Math.abs(u + 0.3 * v - 0.4 - 0.14 * wave(now, 5200)) < 0.05) [glyph, color] = ['@', strong]
        const sweep = 0.5 + 0.5 * wave(now, cue === 'scan' ? 1500 : 3000)
        if ((cue === 'scan' || cue === 'working') && Math.abs(u - sweep) < 0.04) [glyph, color] = ['|', skin.bright] // a scan line going across
        else if (cue === 'edit' && Math.abs(v - 0.35) < 0.1 && u > 0.15 && u < 0.15 + 0.7 * ((now % 2400) / 2400)) [glyph, color] = ['_', skin.bright] // a line being written
        else if (cue === 'exec' && Math.abs(v - 0.5) < 0.12 && Math.floor(u * 12 - now / 140) % 4 === 0) [glyph, color] = ['>', skin.bright] // prompts running across
        else if (cue === 'net' && Math.abs(Math.hypot((u - 0.5) * 2, v - 0.5) - ((now % 1200) / 1200)) < 0.09) [glyph, color] = ['o', skin.bright] // a ring going out
        else if (cue === 'call' && Math.abs(v - 0.5) < 0.12 && Math.floor(u * 9 + now / 300) % 3 === 0) [glyph, color] = ['+', skin.bright] // contacts
      }
      if (isHer && material === PLATE && hash(x, 7) < 0.26) {
        // Down her body, a few columns of figures rise: twice as fast at work.
        const run = y + Math.floor(now / (mood === 'working' ? 110 : 240)) + Math.floor(hash(x, 3) * 9)
        if (run % 8 < 2) [glyph, color] = [DIGITS[Math.floor(hash(x, run) * DIGITS.length)]!, mix(plain, skin.value, 0.85)]
      }
      if (isHer && material === LIGHT && (cue === 'scan' || cue === 'edit')) {
        // Her panel is a page: lines of text, the one she reads lit; or the lines she types, as far as she has got.
        const row = Math.floor((PANEL.y + PANEL.by + 0.02 - wy) / 0.11)
        const across = (wx - panel.x + panel.bx) / (2 * panel.bx)
        const typed = ((now % 4000) / 4000) * 7
        const isInk = cue === 'scan' ? hash(row, 11) * 0.5 + 0.5 > across : row < Math.floor(typed) || (row === Math.floor(typed) && across < typed % 1)
        const isRead = cue === 'scan' && row === Math.floor(now / 380) % 7
        ;[glyph, color] = [isInk ? (isRead ? '#' : '=') : '.', isRead ? strong : isInk ? plain : faint]
      }
      // A bright band climbs her, as the projector redraws her.
      if (isHer && Math.abs(wy - (-1.3 + ((now % 5200) / 5200) * 2.6)) < 0.06) color = mix(color, skin.bright, 0.6)
      // Her picture ends in the projector's light: its last rows thin out to dots.
      if (isHer && y >= rows - 3 && material !== LIGHT) {
        if ((x + y + (clock >> 2)) % 2 !== 0 && y > rows - 3) continue
        ;[glyph, color] = [y === rows - 1 ? '.' : ':', mix(faint, skin.cyan, 0.4)]
      }
      put(x, y, glyph, tinted(color))
    }
  }

  /** Where a point of the scene falls in the grid. */
  const spot = (wx: number, wy: number): readonly [number, number] => [Math.floor(columns / 2 + ((wx / eye) * rows) / (2 * lens * CELL)), Math.floor(((1 - (wy - mid) / eye / lens) * rows) / 2)]
  /** A word in the air about the figure, at a point of the scene: only where nothing is drawn, brought in from the pane's edges. */
  const say = (wx: number, wy: number, text: string, color: number) => {
    const [px, py] = spot(wx, wy)
    const x = Math.max(0, Math.min(columns - text.length, px - (text.length >> 1)))
    const y = Math.max(0, Math.min(rows - 1, py))
    ;[...text].forEach((ch, i) => {
      if (ch !== ' ' && isEmpty(x + i, y)) put(x + i, y, ch, color)
    })
  }
  const blink = clock % 12 < 8
  if (isHer) {
    // Her face, where she shows it: two eyes and a mouth, set on her head as it turns. She blinks; the cue is in them.
    const out = sceneOf(bearing)
    const isShut = cue === 'idle' && now % 4000 > 3820
    const eyes = cue === 'happy' ? '^' : cue === 'worried' ? (blink ? 'x' : '+') : isShut ? '-' : 'O'
    const feature = (fx: number, fy: number, fz: number, glyph: string, color: number) => {
      const [wx, wy, wz] = out(fx, fy, fz)
      const [x, y] = spot(wx, wy)
      // (Only where that part of her face is what the cell shows: not behind her hair, not turned away.)
      if (wz > 0.3 && x >= 0 && y >= 0 && x < columns && y < rows && made[y * columns + x] === FACE) put(x, y, glyph, tinted(color))
    }
    for (const side of [-1, 1]) feature(side * 0.21, -0.04, 0.6, eyes, cue === 'worried' ? skin.alert : skin.bright)
    feature(0, -0.47, 0.64, cue === 'happy' ? 'v' : cue === 'worried' ? '~' : cue === 'ask' || cue === 'net' ? 'o' : '_', mix(skin.value, skin.bright, 0.4))
    if (cue === 'working') say(0.92, 0.9, ['.', '..', '...', ''][clock % 16 >> 2]!, skin.cyan)
    if (cue === 'exec') say(-0.98, -0.35, ['>', '>>', '>>>', '  >'][clock % 16 >> 2]!, skin.value)
  } else {
    // The shield: it flares along the armour's outline when things go wrong, and recharges from the feet up when they went well.
    const charge = cue === 'happy' ? ((now % 1440) / 1440) * 1.3 : -1
    if (cue === 'worried' || charge >= 0) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
          const isEdge = isEmpty(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => x + i! >= 0 && x + i! < columns && y + j! >= 0 && y + j! < rows && depth[(y + j!) * columns + x + i!]! < Infinity)
          if (!isEdge) continue
          const up = 1 - y / rows
          if (cue === 'worried' && hash(x + clock * 31, y) < 0.3 + alarm) put(x, y, hash(y + clock, x) < 0.5 ? ':' : '!', skin.alert)
          else if (charge >= 0 && Math.abs(up - charge) < 0.14) put(x, y, Math.abs(up - charge) < 0.05 ? '*' : ':', mix(skin.cyan, skin.bright, 0.4))
        }
      }
    }
    if (cue === 'call') say(0, 1.3, ['<  +  >', '<< + >>', '<<<+>>>', '   +   '][clock % 16 >> 2]!, skin.value)
    if (cue === 'load') say(0, 1.3, ['[|]', '[/]', '[-]', '[\\]'][clock % 8 >> 1]!, skin.value)
  }
  if (cue === 'net') say(isHer ? 0.98 : 1.2, isHer ? 0.45 : 1.09, [')', '))', ')))', '  )'][clock % 16 >> 2]!, isHer ? skin.cyan : skin.value)
  if (cue === 'ask') say(isHer ? 0.92 : 0.95, isHer ? 0.98 : 1.1, '?', blink ? skin.alert : skin.dim)
  if (cue === 'worried') say(isHer ? 0.95 : 1, isHer ? 1.02 : 1.15, '!', blink ? skin.alert : skin.dim)

  // Worried, she tears: a band of rows slips aside for a moment, as a signal splits.
  if (isHer && cue === 'worried' && clock % 9 < 2) {
    const [from, by] = [Math.floor(hash(clock, 5) * (rows - 3)), hash(clock, 9) < 0.5 ? 2 : -2]
    for (let y = from; y < from + 3; y++) {
      const line = words.slice(y * columns * 3, (y + 1) * columns * 3)
      for (let x = 0; x < columns; x++) {
        const source = x - by
        words[(y * columns + x) * 3] = source < 0 || source >= columns ? 0x20 : line[source * 3]!
        words[(y * columns + x) * 3 + 1] = source < 0 || source >= columns ? NONE : line[source * 3 + 1]!
      }
    }
  }
  // Pleased: a few glints in the air, each for a third of a second, where nothing is drawn.
  if (cue === 'happy') {
    const beat = Math.floor(now / 330)
    for (let k = 0; k < 6; k++) {
      const [x, y] = [Math.floor(hash(k, beat) * columns), Math.floor(hash(beat, k + 7) * rows)]
      if (isEmpty(x, y)) put(x, y, '+*.'[k % 3]!, skin.value)
    }
  }

  return grid
}

// The cue shown last and the one before it: what `haloLive` eases from.
let shown: { cue: Cue; at: number; before?: Cue } | undefined

/** The same, for a pane that draws frame after frame: it remembers the cue it drew last, and moves from it into a new one. */
export function haloLive(skin: Skin, form: Form, mood: Mood, now: number, columns: number, rows: number, doing?: State): Grid {
  const cue = cueOf(mood, doing)
  if (shown === undefined || shown.cue !== cue) shown = { cue, at: now, ...(shown === undefined ? {} : { before: shown.cue }) }

  return haloFrame(skin, form, mood, now, columns, rows, doing, shown.before === undefined ? undefined : { cue: shown.before, at: shown.at })
}
