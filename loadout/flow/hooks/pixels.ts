// The bubble map's pixels: flat fills, rounded corners, straight lines, dashes and letters. Every edge is
// smoothed by how much of a pixel the shape covers, so nothing is drawn larger and reduced.
// Pure: no engine import, so a test reads back what a shape leaves.
import { CHARS, FACES, PAD } from './atlas'

/** A picture in device pixels: RGBA bytes, row-major, every pixel opaque. */
export type Picture = { width: number; height: number; data: Uint8Array }
/** A colour, 0xRRGGBB. */
export type Rgb = number
/** A dashed line: pixels drawn, then pixels left out. */
export type Dash = readonly [on: number, off: number]
/** A face of the atlas: its pitch in pixels, `b` for the heavy weight. */
export type Face = '6b' | '7' | '7b' | '8b' | '9b'
export type Sign = 'run' | 'done' | 'failed' | 'dot'

export const rgb = (hex: string): Rgb => parseInt(hex.slice(1), 16)

/** Colour `a` moved `t` of the way to colour `b`: the one way to make a softer ink. */
export const mix = (a: Rgb, b: Rgb, t: number): Rgb =>
  [16, 8, 0].reduce((out, shift) => out | (Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t) << shift), 0)

export function picture(width: number, height: number, ground: Rgb): Picture {
  const data = new Uint8Array(width * height * 4)
  const [r, g, b] = [(ground >> 16) & 255, (ground >> 8) & 255, ground & 255]
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = 255
  }

  return { width, height, data }
}

const unit = (n: number) => Math.min(1, Math.max(0, n))

/** Lays `color` over one pixel, `cover` (0 to 1) of it; nothing lands outside the picture. */
function blend(p: Picture, x: number, y: number, color: Rgb, cover: number) {
  if (cover <= 0 || x < 0 || y < 0 || x >= p.width || y >= p.height) return
  const i = (y * p.width + x) * 4
  for (let k = 0; k < 3; k++) p.data[i + k] = Math.round(p.data[i + k]! + (((color >> (16 - 8 * k)) & 255) - p.data[i + k]!) * Math.min(1, cover))
}

/** Runs `each` over the pixels of a box, with each pixel's centre. */
function over(p: Picture, x0: number, y0: number, x1: number, y1: number, each: (x: number, y: number, cx: number, cy: number) => void) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(p.height, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(p.width, Math.ceil(x1)); x++) each(x, y, x + 0.5, y + 0.5)
  }
}

type Box = { x: number; y: number; w: number; h: number }

/** How far a point is outside a rounded box: negative inside, 0 on its edge. */
function outside({ x, y, w, h }: Box, r: number, px: number, py: number): number {
  const [qx, qy] = [Math.abs(px - (x + w / 2)) - (w / 2 - r), Math.abs(py - (y + h / 2)) - (h / 2 - r)]

  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r
}

/** How far round a corner a point is, 0 to 1, from the angle `from` (in quarter turns from the top). */
const turned = (px: number, py: number, cx: number, cy: number, from: number) => unit((((Math.atan2(py - cy, px - cx) / (Math.PI / 2) + 1 - from) % 4) + 4) % 4)

/**
 * The walk round a rounded box's outline, along the middle of its stroke, clockwise from the left end of its top
 * side: how long it is (`round`), and how far along it the point nearest to a pixel is.
 */
function walkOf(box: Box, r: number, width: number): { round: number; along: (px: number, py: number) => number } {
  const [inset, rc] = [width / 2, Math.max(0, r - width / 2)]
  const [x0, y0, x1, y1] = [box.x + inset, box.y + inset, box.x + box.w - inset, box.y + box.h - inset]
  const [across, down, bend] = [x1 - x0 - 2 * rc, y1 - y0 - 2 * rc, (Math.PI * rc) / 2]
  // where each stretch starts: the top side, then each corner and side in turn
  const [right, bottom, left] = [across + bend, across + 2 * bend + down, 2 * across + 3 * bend + down]
  const side = (px: number, py: number): number | null => {
    if (px >= x0 + rc && px <= x1 - rc) return py < (y0 + y1) / 2 ? px - (x0 + rc) : bottom + (x1 - rc - px)
    if (py >= y0 + rc && py <= y1 - rc) return px < (x0 + x1) / 2 ? left + (y1 - rc - py) : right + (py - (y0 + rc))

    return null
  }
  const corner = (px: number, py: number): number => {
    const [isLeft, isTop] = [px < (x0 + x1) / 2, py < (y0 + y1) / 2]
    if (isTop) return isLeft ? left + down + turned(px, py, x0 + rc, y0 + rc, 3) * bend : across + turned(px, py, x1 - rc, y0 + rc, 0) * bend

    return isLeft ? bottom + across + turned(px, py, x0 + rc, y1 - rc, 2) * bend : right + down + turned(px, py, x1 - rc, y1 - rc, 1) * bend
  }

  return { round: 2 * across + 2 * down + 4 * bend, along: (px, py) => side(px, py) ?? corner(px, py) }
}

/**
 * How much of a dash covers a point of a rounded box's outline: the outline is walked clockwise from the
 * left end of its top side, and the dashes are stretched a little so a whole number of them goes round.
 */
function dashOf(box: Box, r: number, width: number, [on, off]: Dash): (px: number, py: number) => number {
  const { along, round } = walkOf(box, r, width)
  const period = round / Math.max(1, Math.round(round / (on + off)))
  const drawn = (period * on) / (on + off)

  return (px, py) => {
    const at = along(px, py) % period

    return at < drawn ? unit(0.5 + Math.min(at, drawn - at)) : unit(0.5 - Math.min(at - drawn, period - at))
  }
}

/** A rounded rectangle: a flat fill, an outline `width` deep inside its box, dashed where `dash` is given. */
export function rrect(p: Picture, shape: Box & { r: number; fill?: Rgb; outline?: Rgb; width?: number; dash?: Dash }) {
  const { fill, outline, width = 2, dash } = shape
  const r = Math.min(shape.r, shape.w / 2, shape.h / 2)
  const dashed = outline !== undefined && dash !== undefined ? dashOf(shape, r, width, dash) : null
  over(p, shape.x, shape.y, shape.x + shape.w, shape.y + shape.h, (x, y, cx, cy) => {
    const far = outside(shape, r, cx, cy)
    const whole = unit(0.5 - far)
    if (whole === 0) return
    // the outline's share of this pixel; the dashes are walked only on the outline itself
    const band = outline === undefined ? 0 : whole - unit(0.5 - far - width)
    const ring = band === 0 || dashed === null ? band : band * dashed(cx, cy)
    if (fill !== undefined) blend(p, x, y, ring === 0 ? fill : mix(fill, outline!, ring / whole), whole)
    else blend(p, x, y, outline!, ring)
  })
}

/** A box with straight corners, its edges anywhere between two pixels. */
function rect(p: Picture, { x, y, w, h }: Box, color: Rgb) {
  over(p, x, y, x + w, y + h, (px, py) => blend(p, px, py, color, unit(Math.min(px + 1, x + w) - Math.max(px, x)) * unit(Math.min(py + 1, y + h) - Math.max(py, y))))
}

/** A straight line along a row or a column, `width` across, dashed where `dash` is given. */
export function line(p: Picture, { x1, y1, x2, y2, color, width = 1, dash }: { x1: number; y1: number; x2: number; y2: number; color: Rgb; width?: number; dash?: Dash }) {
  const [length, isDown] = [Math.abs(x2 - x1) + Math.abs(y2 - y1), x1 === x2]
  const [sx, sy] = [Math.sign(x2 - x1), Math.sign(y2 - y1)]
  const [on, off] = dash ?? [length, 0]
  for (let from = 0; from < length; from += on + off) {
    const to = Math.min(length, from + on)
    const [ax, ay, bx, by] = [x1 + sx * from, y1 + sy * from, x1 + sx * to, y1 + sy * to]
    rect(p, isDown ? { x: ax - width / 2, y: Math.min(ay, by), w: width, h: to - from } : { x: Math.min(ax, bx), y: ay - width / 2, w: to - from, h: width }, color)
  }
}

/** How far a point is from a segment. */
function fromSegment(px: number, py: number, [ax, ay]: Point, [bx, by]: Point): number {
  const [dx, dy] = [bx - ax, by - ay]
  const t = unit(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))

  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

type Point = readonly [number, number]

/** A stroke through the points, `width` across, its ends and joints round. */
function stroke(p: Picture, points: readonly Point[], width: number, color: Rgb) {
  const [xs, ys] = [points.map(q => q[0]), points.map(q => q[1])]
  over(p, Math.min(...xs) - width, Math.min(...ys) - width, Math.max(...xs) + width, Math.max(...ys) + width, (x, y, cx, cy) => {
    const far = Math.min(...points.slice(1).map((q, i) => fromSegment(cx, cy, points[i]!, q)))
    blend(p, x, y, color, unit(0.5 - (far - width / 2)))
  })
}

/** A full triangle; each pixel is covered by the share of its 16 sample points that fall inside. */
function triangle(p: Picture, [a, b, c]: readonly [Point, Point, Point], color: Rgb) {
  const side = (q: Point, r: Point, x: number, y: number) => (r[0] - q[0]) * (y - q[1]) - (r[1] - q[1]) * (x - q[0])
  const turn = Math.sign(side(a, b, c[0], c[1])) || 1
  const [xs, ys] = [[a[0], b[0], c[0]], [a[1], b[1], c[1]]]
  over(p, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (x, y) => {
    let inside = 0
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        const [sx, sy] = [x + (i + 0.5) / 4, y + (j + 0.5) / 4]
        if (side(a, b, sx, sy) * turn >= 0 && side(b, c, sx, sy) * turn >= 0 && side(c, a, sx, sy) * turn >= 0) inside += 1
      }
    }
    blend(p, x, y, color, inside / 16)
  })
}

/** A disc: a flat fill, an outline `width` deep where one is given. */
export function disc(p: Picture, { cx, cy, r, fill, outline, width = 2 }: { cx: number; cy: number; r: number; fill?: Rgb; outline?: Rgb; width?: number }) {
  rrect(p, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, r, fill, outline, width })
}

const HEAD = 9
const DISC = 8

/**
 * A straight arrow along a row or a column, two pixels across, its head at (x2, y2). `number` sits in a
 * disc of the ground's colour, centred `numberAt` along the arrow's axis, so the disc cuts the line.
 */
export function arrow(p: Picture, shape: { x1: number; y1: number; x2: number; y2: number; color: Rgb; dash?: Dash; number?: number; numberAt?: number; ground?: Rgb }) {
  const { x1, y1, x2, y2, color, dash } = shape
  const [sx, sy] = [Math.sign(x2 - x1), Math.sign(y2 - y1)]
  const [bx, by, wing] = [x2 - sx * HEAD, y2 - sy * HEAD, HEAD * 0.55]
  line(p, { x1, y1, x2: bx, y2: by, color, width: 2, dash })
  triangle(p, [[x2, y2], [bx - sy * wing, by + sx * wing], [bx + sy * wing, by - sx * wing]], color)
  if (shape.number === undefined) return
  const [cx, cy] = sx === 0 ? [x1, shape.numberAt ?? (y1 + y2) / 2] : [shape.numberAt ?? (x1 + x2) / 2, y1]
  disc(p, { cx, cy, r: DISC, fill: shape.ground ?? color, outline: color })
  const label = String(shape.number)
  text(p, { x: Math.round(cx - textWidth(label, '6b') / 2), y: cy - 6, text: label, color, face: '6b' })
}

/** A split bar, its ends rounded: `share` (0 to 1) of it in the full colour, the rest in the other, one pixel of outline. */
export function bar(p: Picture, shape: Box & { share: number; full: Rgb; rest: Rgb; outline: Rgb }) {
  const [r, split] = [Math.min(3, shape.h / 2), shape.x + shape.w * unit(shape.share)]
  over(p, shape.x, shape.y, shape.x + shape.w, shape.y + shape.h, (x, y, cx, cy) => {
    const far = outside(shape, r, cx, cy)
    const whole = unit(0.5 - far)
    if (whole === 0) return
    const inner = mix(shape.rest, shape.full, unit(split - x))
    blend(p, x, y, mix(inner, shape.outline, (whole - unit(0.5 - far - 1)) / whole), whole)
  })
}

/** A small sign in a square box: an agent at work (a full triangle), one that ended well (a tick), one that failed (a cross), a bullet. */
export function icon(p: Picture, { sign, x, y, size, color }: { sign: Sign; x: number; y: number; size: number; color: Rgb }) {
  const at = (fx: number, fy: number): Point => [x + fx * size, y + fy * size]
  const width = Math.max(2, Math.round(size / 5))
  if (sign === 'run') triangle(p, [at(0.15, 0.05), at(0.95, 0.5), at(0.15, 0.95)], color)
  else if (sign === 'done') stroke(p, [at(0.1, 0.55), at(0.38, 0.82), at(0.88, 0.2)], width, color)
  else if (sign === 'failed') [[at(0.16, 0.16), at(0.84, 0.84)], [at(0.84, 0.16), at(0.16, 0.84)]].forEach(ends => stroke(p, ends, width, color))
  else disc(p, { cx: x + size / 2, cy: y + size / 2, r: size * 0.3, fill: color })
}

const SLOT = new Map([...CHARS].map((ch, i) => [ch, i]))
const CELLS = new Map<string, Uint8Array>()
/** A face's cells, decoded once. */
const cellsOf = (face: Face): Uint8Array => CELLS.get(face) ?? CELLS.set(face, Uint8Array.from(atob(FACES[face]!.cells), ch => ch.charCodeAt(0))).get(face)!

/** The width of a text: every letter advances its face's pitch. */
export const textWidth = (s: string, face: Face): number => [...s].length * FACES[face]!.pitch

/** Stamps a text with the top-left of its first slot at (x, y), which are whole pixels; a letter the atlas lacks is a question mark. */
export function text(p: Picture, { x, y, text: s, color, face }: { x: number; y: number; text: string; color: Rgb; face: Face }) {
  const { pitch, height } = FACES[face]!
  const [cells, wide, tall] = [cellsOf(face), pitch + 2 * PAD, height + 2 * PAD]
  ;[...s].forEach((ch, n) => {
    if (ch.trim() === '') return
    const from = (SLOT.get(ch) ?? SLOT.get('?')!) * wide * tall
    for (let j = 0; j < tall; j++) {
      for (let i = 0; i < wide; i++) blend(p, Math.round(x) + n * pitch - PAD + i, Math.round(y) - PAD + j, color, cells[from + j * wide + i]! / 255)
    }
  })
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Bytes as base64, by the engine's own encoder where it has one. */
function base64(bytes: Uint8Array): string {
  const native = (bytes as { toBase64?: () => string }).toBase64
  if (native !== undefined) return native.call(bytes)
  const out: string[] = []
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]]
    const word = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out.push(BASE64[word >> 18]! + BASE64[(word >> 12) & 63]! + (b === undefined ? '=' : BASE64[(word >> 6) & 63]!) + (c === undefined ? '=' : BASE64[word & 63]!))
  }

  return out.join('')
}

/** A picture as an Image's source. */
export const sourceOf = (p: Picture): { rgba: string; width: number; height: number } => ({ rgba: base64(p.data), width: p.width, height: p.height })

/** What one Image may hold: 2 MiB of pixels. */
const IMAGE_BYTES = 2 * 1024 * 1024

/** A picture as the Images that show it, top to bottom: one, or as many bands of whole cell rows as keep each under what an Image may hold. */
export function tiles(p: Picture, cellHeight: number): { rows: number; source: { rgba: string; width: number; height: number } }[] {
  const rows = Math.round(p.height / cellHeight)
  const perTile = Math.max(1, Math.floor(IMAGE_BYTES / (p.width * cellHeight * 4)))
  const count = Math.ceil(rows / perTile)
  // even bands, so no band is a thin leftover
  const even = Math.ceil(rows / count)

  return Array.from({ length: count }, (_, i) => {
    const [from, to] = [i * even, Math.min(rows, (i + 1) * even)]

    return { rows: to - from, source: { rgba: base64(p.data.subarray(from * cellHeight * p.width * 4, to * cellHeight * p.width * 4)), width: p.width, height: (to - from) * cellHeight } }
  })
}
