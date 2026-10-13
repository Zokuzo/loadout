// The Halo themes' mascots, modelled as the Y2K objects are (chrome.ts: a ray marched to a surface) but drawn as pixels, two to a
// cell: flat tones of a material's colour, and a dark outline where a part ends. By day it is Cortana, a hologram standing on her pedestal,
// who acts out what the session does: she reads a panel, types, points, listens, sends her fragments out. By night it is
// the Master Chief's helmet, which turns to look, nods, tilts, and whose visor and shield tell the same things.
// A surface has a material, and a material its own colours: the armour's green and the visor's gold never run together.
// Pure: a grid is derived from (skin, form, mood, what is done, now, size) alone; `haloLive` alone remembers the pose before, to ease out of it.
import { hash, smin } from './chrome'
import { NONE, mix } from './hud'
import type { Grid, Skin, State } from './hud'
import type { Form } from './look'
import type { Mood } from './mascot'

/** Whether a skin is one of the two these figures are drawn in: `cortana` is hers, `mjolnir` the Chief's. */
export const isHalo = (skin: Skin): boolean => skin.variant === 'cortana' || skin.variant === 'mjolnir'

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

    return [yaw * (1 - 1.5 * ahead) + 0.05 * wave(now, 5200), pitch, roll, breath]
  }
  if (cue === 'working') return [0.5 * wave(now, 3800), pitch + 0.04 * wave(now, 1900), roll, breath]
  if (cue === 'happy') return [yaw, 0.28 * Math.max(0, wave(now, 720)), roll, breath]
  if (cue === 'worried') return [0.14 * wave(now, 360), pitch, roll, 0]
  if (cue === 'call') return [0.62 * wave(now, 2400), pitch, roll, breath]
  if (cue === 'scan') return [yaw + 0.16 * wave(now, 2600), pitch, roll, breath]
  if (cue === 'ask') return [yaw, pitch, roll * (0.8 + 0.2 * wave(now, 2200)), breath]

  return [yaw + 0.04 * wave(now, 2800), pitch + 0.02 * wave(now, 1400), roll, lift + breath]
}

const HEAD_Y = 0.1 // the helmet's centre over the scene's

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

// The visor's opening in the shell, in the helmet's own space: its middle and its half sizes.
const VISOR = { y: 0.08, z: 0.75, bx: 0.58, by: 0.17 } as const
const [CHEEK_COS, CHEEK_SIN] = [Math.cos(0.32), Math.sin(0.32)]

/**
 * The Mark VI as a few solids: a shell with a jaw, a band cut out of its front where the gold visor shows, a brim over that
 * band and a crest over the dome, a mouthpiece under it between two slanted cheek guards, a pod at each ear. Under it the
 * neck of the undersuit, the chest plate and a pauldron at each side.
 */
function chief(bearing: Bearing): Scene {
  const local = helmetOf(bearing)
  const rise = bearing[3]

  return {
    eye: 7,
    lens: 0.186,
    mid: 0,
    reach: 2,
    at: (x, y, z) => {
      // What stands under the helmet does not turn with it, and breathes with it.
      const by = y - rise
      const body = Math.min(slab(x, by + 1.36, z, 0.66, 0.2, 0.28, 0.14), slab(x, by + 1.2, z - 0.3, 0.22, 0.12, 0.1, 0.05), egg(Math.abs(x) - 1.1, by + 1.12, z, 0.42, 0.34, 0.44))
      const neck = Math.max(len(x, z) - 0.42, Math.abs(by + 0.95) - 0.3)
      // (Far from the helmet, its distance is that to a ball about it: its plates are worked out only near them.)
      const ball = len(x, by - HEAD_Y, z) - 1.2
      if (ball > 0.25) return nearest(Math.min(body, ball), PLATE, neck, UNDER)
      local(x, y, z)
      const ax = Math.abs(lx)
      const cut = slab(lx, ly - VISOR.y, lz - VISOR.z, VISOR.bx, VISOR.by, 0.4, 0.06)
      // (Under the visor the shell is open too: the undersuit shows between the cheek guards and the mouthpiece.)
      const open = slab(lx, ly + 0.44, lz - 0.85, 0.42, 0.2, 0.4, 0.04)
      // (The shell's distance is worked out once: the brim, the crest and what shows through the openings are that shell, a little out or in.)
      const shell = egg(lx, ly - 0.05, lz, 0.74, 0.84, 0.84)
      let plate = Math.max(smin(shell, slab(lx, ly + 0.5, lz - 0.1, 0.42, 0.2, 0.5, 0.12), 0.15), -cut, -open)
      plate = smin(plate, Math.max(shell - 0.065, Math.abs(ly - 0.35) - 0.075, 0.1 - lz), 0.04) // the brim: a brow that hugs the shell
      plate = smin(plate, Math.max(shell - 0.042, ax - 0.17, 0.3 - ly, -0.55 - lz), 0.04) // the crest, along the dome
      plate = Math.min(plate, slab(lx, ly + 0.4, lz - 0.74, 0.11, 0.12, 0.1, 0.03), slab(lx, ly + 0.69, lz - 0.56, 0.3, 0.055, 0.16, 0.04)) // the mouthpiece, the chin
      // A cheek guard at each side: a wide plate, slanted in toward the chin.
      const u = CHEEK_COS * (ax - 0.4) - CHEEK_SIN * (ly + 0.36)
      const v = CHEEK_SIN * (ax - 0.4) + CHEEK_COS * (ly + 0.36)
      plate = Math.min(plate, slab(u, v, lz - 0.62, 0.15, 0.21, 0.14, 0.03), egg(ax - 0.76, ly + 0.02, lz - 0.05, 0.08, 0.18, 0.18))
      plate = Math.min(plate, body)
      const glass = Math.max(shell + 0.06, cut - 0.05)
      const under = Math.min(neck, Math.max(shell + 0.09, open - 0.05))

      return nearest(nearest(plate, PLATE, glass, GLASS), kind, under, UNDER)
    },
  }
}

// --- Cortana ------------------------------------------------------------------

/** Her pose, fifteen numbers: turned (to the left, in radians), her hips aside, her head aside; then the elbow and the hand of the arm at the left of the picture, and of the one at its right. */
type Pose = readonly number[]

const HANG = [0.38, 0.28, -0.02, 0.4, -0.04, 0.06] // an arm at rest, as the right of the picture has it (the left is its mirror)
const HIP = [0.56, 0.3, -0.08, 0.3, 0, 0.1] // a hand on the hip
const left = (arm: readonly number[]) => arm.map((n, i) => (i % 3 === 0 ? -n : n))
const pose = (yaw: number, sway: number, head: number, armLeft: readonly number[], armRight: readonly number[]): Pose => [yaw, sway, head, ...armLeft, ...armRight]

const POSES: Readonly<Record<Cue, Pose>> = {
  idle: pose(0.1, 0.05, 0, left(HANG), HIP), // a hand on her hip
  working: pose(0.15, 0, 0.02, [-0.3, 0.3, 0.14, 0.16, 0.33, 0.2], [0.34, 0.42, 0.2, 0.1, 0.8, 0.2]), // a hand at her chin, the other arm across
  scan: pose(0.32, 0.03, -0.03, [-0.52, 0.42, 0.12, -0.64, 0.72, 0.24], HIP), // holding a panel up, reading it
  edit: pose(0, 0, 0, [-0.42, 0.32, 0.1, -0.2, 0.34, 0.42], [0.42, 0.32, 0.1, 0.2, 0.34, 0.42]), // both hands on the keys
  exec: pose(0.18, -0.04, 0, [-0.54, 0.66, 0.05, -0.76, 0.8, 0.2], HIP), // pointing: go
  net: pose(-0.1, 0, 0.02, left(HANG), [0.52, 0.78, 0.06, 0.24, 1, 0.1]), // a hand at her ear
  call: pose(0, 0, 0, [-0.5, 0.4, 0.1, -0.74, 0.34, 0.25], [0.5, 0.4, 0.1, 0.74, 0.34, 0.25]), // arms open, her fragments about her
  load: pose(0.1, 0.03, 0, left(HIP), [0.54, 0.8, 0.02, 0.5, 1.06, 0.08]), // an orb held up
  ask: pose(0, 0, 0.04, [-0.46, 0.3, 0.08, -0.66, 0.52, 0.22], [0.46, 0.3, 0.08, 0.66, 0.52, 0.22]), // a shrug
  tool: pose(0, 0, 0, [-0.4, 0.34, 0.14, -0.17, 0.44, 0.42], [0.4, 0.34, 0.14, 0.17, 0.44, 0.42]), // an orb between her hands
  happy: pose(0.08, 0.05, 0, left(HIP), [0.56, 0.84, 0, 0.52, 1.2, 0.08]), // a fist up
  worried: pose(0, 0, 0, [-0.5, 0.84, 0.1, -0.2, 1.04, 0.14], [0.5, 0.84, 0.1, 0.2, 1.04, 0.14]), // her hands at her head
}

/** The cue's pose at `now`, with what moves in it: she sways at rest, her fingers go at the keys, she bounces when pleased. */
function poseAt(cue: Cue, now: number): Pose {
  const p = [...POSES[cue]]
  p[0]! += cue === 'worried' ? 0 : 0.1 * wave(now, cue === 'idle' ? 6400 : 4200)
  if (cue === 'edit') {
    p[7]! += 0.05 * wave(now, 300)
    p[13]! -= 0.05 * wave(now, 300)
  }
  if (cue === 'working') p[13]! += 0.02 * wave(now, 1600)
  if (cue === 'exec') p[6]! -= 0.04 * Math.max(0, wave(now, 900))
  if (cue === 'load' || cue === 'happy') p[13]! += 0.05 * wave(now, cue === 'happy' ? 720 : 1400)
  if (cue === 'ask') for (const i of [7, 13]) p[i]! += 0.04 * wave(now, 1800)

  return p
}

// Her trunk's axis, her shoulders' line and the foot of her neck.
const TRUNK: readonly [V, V] = [[0, -0.5, 0], [0, 0.62, 0]]
const SHOULDERS: readonly [V, V] = [[-0.26, 0.62, 0], [0.26, 0.62, 0]]
const NECK: V = [0, 0.7, 0]

const FLOOR = -0.4 // where the picture of her ends: she is seen from the hips up
// The panel she reads and writes: its middle and its half sizes, in a picture that shows `wide` to each side of her (a narrow pane brings it in beside her head).
const PANEL = { y: 0.98, by: 0.2 } as const
const panelIn = (wide: number) => {
  const bx = Math.max(0.1, Math.min(0.2, (wide - 0.26) / 2))

  return { x: -Math.min(0.66, 0.26 + bx), bx }
}

/** What she has about her for a cue, lit: a panel, an orb, her fragments. The distance to it (Infinity: nothing). */
function propOf(cue: Cue, now: number, hand: V, wide: number): (x: number, y: number, z: number) => number {
  if (cue === 'scan' || cue === 'edit') {
    const panel = panelIn(wide)

    return (x, y, z) => slab(x - panel.x, y - PANEL.y, z - 0.2, panel.bx, PANEL.by, 0.02, 0.02)
  }
  if (cue === 'call') {
    const turn = (TAU * (now % 3600)) / 3600

    const out = Math.min(0.78, wide - 0.12)
    const orbs = [0, 1, 2].map(i => [out * Math.cos(turn + (TAU * i) / 3), 0.95 + 0.16 * Math.sin(2 * turn + i), 0.6 * Math.sin(turn + (TAU * i) / 3)] as const)

    return (x, y, z) => Math.min(len(x - orbs[0]![0], y - orbs[0]![1], z - orbs[0]![2]), len(x - orbs[1]![0], y - orbs[1]![1], z - orbs[1]![2]), len(x - orbs[2]![0], y - orbs[2]![1], z - orbs[2]![2])) - 0.1
  }
  if (cue === 'load') return (x, y, z) => len(x - hand[0], y - hand[1] - 0.2, z - hand[2]) - (0.1 + 0.02 * wave(now, 700))
  if (cue === 'tool') return (x, y, z) => len(x, y - 0.46 - 0.03 * wave(now, 1100), z - 0.48) - 0.12
  if (cue === 'exec') {
    // A bolt leaves her hand for the conversation, again and again.
    const u = (now % 900) / 900

    return (x, y, z) => len(x - hand[0] + 0.15 + 0.5 * u, y - hand[1] - 0.02, z - hand[2]) - 0.09 * (1 - u * 0.5)
  }

  return () => Infinity
}

/**
 * Cortana as a few solids: a head under a bob of hair cut at the jaw, shoulders, chest, a narrow waist, hips set aside
 * over the leg that bears her, two arms whose elbows and hands the pose places. She is seen from the hips up.
 */
function cortana(p: Pose, cue: Cue, now: number, lift: number, wide: number): Scene {
  const [yaw, sway, head] = [p[0]!, p[1]!, p[2]!]
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)]
  const arms = [-1, 1].map((side, i) => {
    const at = 3 + 6 * i
    const [shoulder, elbow, hand] = [[side * 0.3, 0.6, 0] as V, [p[at]!, p[at + 1]!, p[at + 2]!] as V, [p[at + 3]!, p[at + 4]!, p[at + 5]!] as V]
    // (A ball that holds the whole arm: far from it, the arm is not worked out.)
    const middle = [0, 1, 2].map(k => (shoulder[k]! + elbow[k]! + hand[k]!) / 3) as unknown as V
    const round = Math.max(...[shoulder, elbow, hand].map(joint => len(joint[0] - middle[0], joint[1] - middle[1], joint[2] - middle[2]))) + 0.1

    return { shoulder, elbow, hand, middle, round }
  })
  const legs = [-1, 1].map(side => ({ hip: [sway + side * 0.13, -0.26, 0] as V, knee: [side * 0.12 + sway * 0.4, -0.84, 0.03] as V }))
  // (Her right hand, as the scene has it: what she holds is where it is.)
  const held = arms[1]!.hand
  const prop = propOf(cue, now, [c * held[0] - s * held[2], held[1] + lift, s * held[0] + c * held[2]], wide)
  const pointer = arms[0]!.hand
  const bolt = cue === 'exec' ? propOf(cue, now, [c * pointer[0] - s * pointer[2], pointer[1] + lift, s * pointer[0] + c * pointer[2]], wide) : prop

  return {
    eye: 7,
    lens: 0.13,
    mid: 0.5,
    reach: 1.45,
    at: (wx, wy, wz) => {
      const x = c * wx + s * wz
      const y = wy - lift
      const z = -s * wx + c * wz
      // (Far from her trunk, its distance is that to a column about it: its parts are worked out only near them. The same for her head.)
      const column = limb(x, y, z, TRUNK[0], TRUNK[1], 0.46)
      let body = column
      if (column < 0.2) {
        body = smin(limb(x, y, z, SHOULDERS[0], SHOULDERS[1], 0.085), egg(x, y - 0.42, z - 0.03, 0.24, 0.22, 0.17), 0.1)
        body = smin(body, egg(x - sway * 0.5, y - 0.12, z, 0.17, 0.22, 0.13), 0.1)
        body = smin(body, egg(x - sway, y + 0.17, z, 0.26, 0.2, 0.18), 0.1)
        body = smin(body, limb(x, y, z, NECK, [head * 0.5, 0.86, 0], 0.065), 0.04)
        for (const leg of legs) body = smin(body, limb(x, y, z, leg.hip, leg.knee, 0.125, 0.095), 0.06)
      }
      for (const arm of arms) {
        const ball = len(x - arm.middle[0], y - arm.middle[1], z - arm.middle[2]) - arm.round
        if (ball > 0.15) {
          body = Math.min(body, ball)
          continue
        }
        body = smin(body, limb(x, y, z, arm.shoulder, arm.elbow, 0.085, 0.075), 0.05)
        body = Math.min(body, limb(x, y, z, arm.elbow, arm.hand, 0.075, 0.065), len(x - arm.hand[0], y - arm.hand[1], z - arm.hand[2]) - 0.085)
      }
      const skull = len(x - head, y - 1.03, z) - 0.3
      if (skull > 0.15) return nearest(nearest(body, PLATE, skull, GLASS), kind, bolt(wx, wy, wz), LIGHT)
      // The bob: a shell about the head, open over the face, cut at the jaw.
      const hair = Math.max(egg(x - head, y - 1.04, z + 0.03, 0.235, 0.235, 0.24), -egg(x - head, y - 0.92, z - 0.24, 0.165, 0.2, 0.2), 0.8 - y)
      const face = egg(x - head, y - 1, z - 0.02, 0.17, 0.21, 0.19)

      return nearest(nearest(nearest(body, PLATE, face, FACE), kind, hair, GLASS), kind, bolt(wx, wy, wz), LIGHT)
    },
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
  cortana: { opus: [0, 0], sonnet: [0x006aa6, 0.7], haiku: [0x00806c, 0.7], fable: [0xb85a14, 0.7] },
}

/** What came before a cue and when it gave way: the figure eases out of it. */
export type Before = { cue: Cue; at: number }

const blend = (a: readonly number[], b: readonly number[], u: number) => b.map((n, i) => a[i]! + (n - a[i]!) * u)

/** Black and white, for a tone's shade and its shine. */
const [BLACK, WHITE] = [0x000000, 0xffffff]

/**
 * The figure at `now` in a grid of `columns` by `rows` cells, centred: Cortana in her skin, the Chief's helmet in his.
 * It is a picture of `columns` by twice `rows` square pixels, two to a cell (an upper half block: its ink is the pixel above,
 * its ground the one below): each pixel is one ray, shaded in a few flat tones of its material's colour, and where a part ends
 * or passes in front of another the pixel is an outline. `doing` is the state of the call that runs, if one does: with the
 * mood it makes the cue acted out. `before` is the cue left a moment ago: the pose moves from it to this one.
 */
export function haloFrame(skin: Skin, form: Form, mood: Mood, now: number, columns: number, rows: number, doing?: State, before?: Before): Grid {
  const words = new Uint32Array(Math.max(0, columns * rows) * 3).fill(NONE)
  for (let i = 0; i < words.length; i += 3) words[i] = 0x20
  const grid = { columns, rows, words }
  if (rows < 1 || columns < 1) return grid
  const [W, H] = [columns, rows * 2]
  const isHer = skin.variant === 'cortana'
  const cue = cueOf(mood, doing)
  const into = before === undefined ? 1 : ease((now - before.at) / EASE_MS)
  const lift = isHer && cue === 'happy' ? 0.06 * Math.abs(wave(now, 720)) : 0
  const bearing = (into < 1 && before !== undefined ? blend(bearingAt(before.cue, now), bearingAt(cue, now), into) : bearingAt(cue, now)) as unknown as Bearing
  // How far to each side of her the picture shows: in a narrow pane her arms and what she holds stay inside it.
  const wide = (0.13 * 7 * W) / H
  const her = (into < 1 && before !== undefined ? blend(poseAt(before.cue, now), poseAt(cue, now), into) : poseAt(cue, now)).map((n, i) => (i >= 3 && i % 3 === 0 ? Math.max(0.1 - wide, Math.min(wide - 0.1, n)) : n))
  const scene = isHer ? cortana(her, cue, now, lift, wide) : chief(bearing)
  const panel = panelIn(wide)
  const local = helmetOf(bearing)
  const { eye, lens, mid, reach } = scene
  const far = (x: number, y: number, z: number) => scene.at(x, y + mid, z)

  // Each material's tones, from its shade to its shine; the first is in the model's own hue. And the outline's ink.
  const [hue, share] = HUES[isHer ? 'cortana' : 'mjolnir'][form]
  const own = mix(skin.primary, hue, share)
  const alarm = cue === 'worried' ? 0.12 + 0.22 * (0.5 + 0.5 * wave(now, 720)) : 0
  const tinted = (color: number) => mix(color, skin.alert, alarm)
  const tones: readonly (readonly number[])[] = isHer ? [
    [mix(own, BLACK, 0.15), own, mix(own, skin.body, 0.55), skin.body, mix(skin.body, WHITE, 0.6)],
    [skin.bright, mix(skin.bright, skin.cyan, 0.45), mix(skin.bright, skin.cyan, 0.8), skin.cyan, mix(skin.cyan, WHITE, 0.45)],
    [skin.dim, skin.dim, skin.dim, skin.dim, skin.dim],
    [mix(skin.value, BLACK, 0.2), skin.value, mix(skin.value, WHITE, 0.3), mix(skin.value, WHITE, 0.55), mix(skin.value, WHITE, 0.8)],
    [mix(skin.body, own, 0.25), mix(skin.body, WHITE, 0.35), mix(skin.body, WHITE, 0.6), mix(skin.body, WHITE, 0.78), mix(skin.body, WHITE, 0.9)],
  ] : [
    [mix(skin.shadow, skin.body, 0.7), mix(skin.body, own, 0.2), mix(skin.body, own, 0.55), mix(skin.body, own, 0.9), mix(own, skin.bright, 0.55)],
    [mix(skin.cyan, BLACK, 0.62), mix(skin.cyan, BLACK, 0.38), mix(skin.cyan, BLACK, 0.12), mix(skin.cyan, WHITE, 0.25), mix(skin.cyan, WHITE, 0.8)],
    [skin.ink, mix(skin.ink, skin.shadow, 0.5), skin.shadow, mix(skin.shadow, skin.dim, 0.3), mix(skin.shadow, skin.dim, 0.5)],
    [mix(skin.value, BLACK, 0.3), skin.value, mix(skin.value, WHITE, 0.3), mix(skin.value, WHITE, 0.55), mix(skin.value, WHITE, 0.8)],
    [skin.body, skin.body, skin.body, skin.body, skin.body],
  ]
  const line = isHer ? skin.bright : mix(skin.ink, skin.shadow, 0.35)

  // First every pixel's ray: how far along it the surface is, what it is made of, how lit, and where.
  const size = W * H
  const depth = new Float32Array(size).fill(Infinity)
  const light = new Float32Array(size)
  const made = new Uint8Array(size)
  const where = new Float32Array(size * 3)
  for (let j = 0; j < H; j++) {
    for (let x = 0; x < W; x++) {
      const dx = ((x + 0.5 - W / 2) * 2 * lens) / H
      const dy = (1 - ((j + 0.5) / H) * 2) * lens
      const n = Math.hypot(dx, dy, 1)
      const d0 = dx / n
      const d1 = dy / n
      const d2 = -1 / n
      const along = eye / n
      if (eye * eye - along * along >= reach * reach) continue
      let t = eye - reach
      let here = Infinity
      for (let i = 0; i < 48 && t < eye + reach; i++) {
        here = far(d0 * t, d1 * t, eye + d2 * t)
        if (here < 0.012) break
        t += here * 0.92
      }
      if (here >= 0.012) continue
      const material = kind
      const px = d0 * t
      const py = d1 * t
      const pz = eye + d2 * t
      // The surface's slope there: how the distance changes a step along each axis.
      const gx = far(px + 0.012, py, pz) - here
      const gy = far(px, py + 0.012, pz) - here
      const gz = far(px, py, pz + 0.012) - here
      const at = j * W + x
      const length = Math.hypot(gx, gy, gz) || 1
      const lit = Math.max(0, (gx * KEY[0] + gy * KEY[1] + gz * KEY[2]) / length)
      const glint = Math.max(0, (gx * GLINT[0] + gy * GLINT[1] + gz * GLINT[2]) / length) ** 28
      depth[at] = t
      made[at] = material
      where[at * 3] = px
      where[at * 3 + 1] = py + mid
      where[at * 3 + 2] = pz
      // (Past 1: a glint.)
      light[at] = glint > 0.5 ? 1.2 : lit
    }
  }

  // Then every pixel's colour (NONE: the pane's ground shows through).
  const image = new Uint32Array(size).fill(NONE)
  const clock = Math.floor(now / 90)
  const jump = isHer ? 0.16 : 0.22
  for (let j = 0; j < H; j++) {
    for (let x = 0; x < W; x++) {
      const at = j * W + x
      const t = depth[at]!
      if (t === Infinity) continue
      const material = made[at]!
      // An outline: where the figure ends, where a part stands in front of another, where one material meets the next.
      let isEdge = x === 0 || x === W - 1 || j === 0
      if (!isEdge) {
        for (const step of [-1, 1, -W, W]) {
          const other = at + step
          if (other < 0 || other >= size) continue
          if (depth[other]! === Infinity || depth[other]! > t + jump || (made[other]! !== material && made[other]! > material)) isEdge = true
        }
      }
      const ramp = tones[material]!
      const lit = light[at]!
      let color = isEdge ? line : ramp[lit > 1 ? 4 : lit < 0.12 ? 0 : lit < 0.42 ? 1 : lit < 0.75 ? 2 : 3]!
      const wx = where[at * 3]!
      const wy = where[at * 3 + 1]!
      const wz = where[at * 3 + 2]!
      if (!isHer && material === GLASS && !isEdge) {
        // The visor is a mirror: dark gold at its foot, bright at its top, a streak of light that drifts across it. And it shows what is done.
        local(wx, wy, wz)
        const u = (lx / VISOR.bx + 1) / 2
        const v = ((ly - VISOR.y) / VISOR.by + 1) / 2
        const streak = Math.abs(u + 0.35 * v - 0.42 - 0.12 * wave(now, 5200))
        color = ramp[v < 0.22 ? 0 : v < 0.5 ? 1 : v < 0.8 ? 2 : 3]!
        if (streak < 0.035) color = ramp[4]!
        else if (streak < 0.075) color = ramp[3]!
        const sweep = 0.5 + 0.5 * wave(now, cue === 'scan' ? 1500 : 3000)
        if ((cue === 'scan' || cue === 'working') && Math.abs(u - sweep) < 0.035) color = WHITE // a scan line going across
        else if (cue === 'edit' && Math.abs(v - 0.35) < 0.12 && u > 0.15 && u < 0.15 + 0.7 * ((now % 2400) / 2400)) color = WHITE // a line being written
        else if (cue === 'exec' && Math.abs(Math.abs(v - 0.5) - (0.3 - ((((u * 7 - now / 260) % 1) + 1) % 1) * 0.6) * 0.5) < 0.07 && v > 0.15 && v < 0.85) color = WHITE // prompts running across
        else if (cue === 'net' && Math.abs(Math.hypot((u - 0.5) * 2.6, v - 0.5) - ((now % 1200) / 1200) * 1.2) < 0.09) color = WHITE // a ring going out
        else if (cue === 'call' && v > 0.3 && v < 0.7 && Math.floor(u * 9 + now / 300) % 3 === 0) color = WHITE // contacts
      }
      if (isHer && !isEdge) {
        // Down her body, thin columns of light rise: twice as fast at work. And a bright band climbs her, as the projector redraws her.
        if (material === PLATE && wy - lift < 0.56 && hash(x, 7) < 0.22 && (j + Math.floor(now / (mood === 'working' ? 60 : 130)) + Math.floor(hash(x, 3) * 12)) % 12 < 4) color = mix(color, skin.value, 0.75)
        if (material === LIGHT && (cue === 'scan' || cue === 'edit')) {
          // Her panel is a page: lines of text, the one she reads lit; or the lines she types, as far as she has got.
          const row = Math.floor((PANEL.y + PANEL.by - wy) / 0.045)
          const across = (wx - panel.x + panel.bx) / (2 * panel.bx)
          const typed = ((now % 4000) / 4000) * 5
          const isInk = row % 2 === 1 && across > 0.12 && (cue === 'scan' ? across < 0.45 + 0.45 * hash(row, 11) : row >> 1 < Math.floor(typed) || (row >> 1 === Math.floor(typed) && across < 0.12 + 0.8 * (typed % 1)))
          color = isInk ? (cue === 'scan' && row >> 1 === Math.floor(now / 380) % 5 ? skin.bright : ramp[0]!) : mix(skin.tint, WHITE, 0.5)
        }
        if (Math.abs(wy - (FLOOR + ((now % 5200) / 5200) * 2.2)) < 0.04) color = mix(color, WHITE, 0.55)
        // Her picture ends in the projector's light: its last rows thin out.
        if (j >= H - 6 && (x + j + (clock >> 2)) % 2 !== 0) continue
        if (j >= H - 6) color = mix(color, skin.shadow, (j - (H - 7)) / 7)
      }
      image[at] = tinted(color)
    }
  }
  /** A pixel, where the picture has it. */
  const dot = (x: number, j: number, color: number, isOver = true) => {
    if (x >= 0 && j >= 0 && x < W && j < H && (isOver || image[j * W + x] === NONE)) image[j * W + x] = color
  }
  /** Where a point of the scene falls in the picture. */
  const spot = (wx: number, wy: number): readonly [number, number] => [Math.floor(W / 2 + ((wx / eye) * H) / (2 * lens)), Math.floor(((1 - (wy - mid) / eye / lens) * H) / 2)]

  if (isHer) {
    // Her face, where she shows it: two eyes and a mouth, set on her head as it turns. She blinks; the cue is in them.
    const [yaw, head] = [her[0]!, her[2]!]
    if (Math.abs(yaw) < 0.9) {
      const ink = tinted(skin.bright)
      const isShut = (cue === 'idle' && now % 4000 > 3820) || cue === 'happy'
      const face = (fx: number, fy: number) => spot(Math.cos(yaw) * (head + fx) - Math.sin(yaw) * 0.19, fy + lift)
      for (const side of [-1, 1]) {
        const [x, j] = face(side * 0.075, 1.02)
        if (made[j * W + x] !== FACE) continue
        dot(x, j, ink)
        if (!isShut) dot(x, j - 1, cue === 'worried' ? skin.alert : ink)
        if (cue === 'happy') dot(x + side, j + 1, ink), dot(x - side, j + 1, ink) // an arc: a smile in the eyes
        if (cue === 'worried' || cue === 'ask') dot(x + side, j - 3, ink) // a brow, raised
      }
      const [mx, mj] = face(0, 0.895)
      if (made[mj * W + mx] === FACE) {
        dot(mx, mj, ink)
        if (cue === 'happy') dot(mx - 1, mj - 1, ink), dot(mx + 1, mj - 1, ink)
        else if (cue === 'ask' || cue === 'net' || cue === 'worried') dot(mx, mj + 1, ink)
        else dot(mx + 1, mj, ink)
      }
    }
  } else {
    // The shield: it flares along the armour's outline when things go wrong, and recharges from the feet up when they went well.
    const charge = cue === 'happy' ? ((now % 1440) / 1440) * 1.3 : -1
    if (cue === 'worried' || charge >= 0) {
      for (let j = 1; j < H - 1; j++) {
        for (let x = 1; x < W - 1; x++) {
          const at = j * W + x
          if (depth[at]! !== Infinity || (depth[at - 1]! === Infinity && depth[at + 1]! === Infinity && depth[at - W]! === Infinity && depth[at + W]! === Infinity)) continue
          const up = 1 - j / H
          if (cue === 'worried' ? hash(x + clock * 31, j) < 0.45 + alarm : Math.abs(up - charge) < 0.16) image[at] = cue === 'worried' ? skin.alert : mix(skin.cyan, WHITE, Math.abs(up - charge) < 0.06 ? 0.7 : 0.2)
        }
      }
    }
  }

  // Worried, she tears: a band of rows slips aside for a moment, as a signal splits.
  if (isHer && cue === 'worried' && clock % 9 < 2) {
    const [from, by] = [Math.floor(hash(clock, 5) * (H - 6)), hash(clock, 9) < 0.5 ? 3 : -3]
    for (let j = from; j < from + 6; j++) {
      const row = image.slice(j * W, (j + 1) * W)
      for (let x = 0; x < W; x++) image[j * W + x] = x - by < 0 || x - by >= W ? NONE : row[x - by]!
    }
  }
  // Pleased: a few glints in the air, each for a third of a second, where nothing is drawn.
  if (cue === 'happy') {
    const beat = Math.floor(now / 330)
    for (let k = 0; k < 7; k++) {
      const [x, j] = [1 + Math.floor(hash(k, beat) * (W - 2)), 1 + Math.floor(hash(beat, k + 7) * (H - 2))]
      for (const [i, n] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) dot(x + i, j + n, skin.value, false)
    }
  }

  // Two pixels to a cell: an upper half block, its ink the pixel above and its ground the one below.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < W; x++) {
      const [upper, lower] = [image[2 * y * W + x]!, image[(2 * y + 1) * W + x]!]
      if (upper === NONE && lower === NONE) continue
      const at = (y * W + x) * 3
      words[at] = upper === NONE ? 0x2584 : 0x2580
      words[at + 1] = upper === NONE ? lower : upper
      words[at + 2] = upper === NONE || lower === NONE ? NONE : lower
    }
  }
  /** A word in the air about the figure, at a point of the scene: only where nothing is drawn, brought in from the pane's edges. */
  const say = (wx: number, wy: number, text: string, color: number) => {
    const [px, pj] = spot(wx, wy)
    const x = Math.max(0, Math.min(W - text.length, px - (text.length >> 1)))
    const y = Math.max(0, Math.min(rows - 1, pj >> 1))
    ;[...text].forEach((ch, i) => {
      const at = (y * W + x + i) * 3
      if (ch !== ' ' && words[at] === 0x20) [words[at], words[at + 1]] = [ch.charCodeAt(0), color]
    })
  }
  const blink = clock % 12 < 8
  if (cue === 'net') say(isHer ? 0.56 : 1.2, isHer ? 1.04 : 1.09, [')', '))', ')))', '  )'][clock % 16 >> 2]!, isHer ? skin.cyan : skin.value)
  if (cue === 'working' && isHer) say(0.46, 1.22, ['.', '..', '...', ''][clock % 16 >> 2]!, skin.cyan)
  if (cue === 'call' && !isHer) say(0, 1.3, ['<  +  >', '<< + >>', '<<<+>>>', '   +   '][clock % 16 >> 2]!, skin.value)
  if (cue === 'load' && !isHer) say(0, 1.3, ['[|]', '[/]', '[-]', '[\\]'][clock % 8 >> 1]!, skin.value)
  if (cue === 'ask') say(isHer ? 0.44 : 0.95, isHer ? 1.28 : 1.1, '?', blink ? skin.alert : skin.dim)
  if (cue === 'worried') say(isHer ? 0.5 : 1, isHer ? 1.3 : 1.15, '!', blink ? skin.alert : skin.dim)

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
