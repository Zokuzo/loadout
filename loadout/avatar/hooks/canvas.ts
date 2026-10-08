// A picture in true pixels: what the stage and the mascot are composed on where the terminal
// draws images. Pure: no engine import, so previews and tests compose what the pane shows.
import type { Pixels } from './look'

/** `width * height` pixels, row-major: 0xRRGGBB, or CLEAR where nothing is drawn (alpha 0). */
export type Canvas = { width: number; height: number; data: Int32Array }
export const CLEAR = -1

/** A sprite and its anchor: the column of its body's middle and the row under its feet. */
export type Sprite = { px: Pixels; ax: number; ay: number }

/** [from, to) in pixels, on either axis. */
export type Span = readonly [from: number, to: number]

export const blank = (width: number, height: number): Canvas => ({ width, height, data: new Int32Array(width * height).fill(CLEAR) })

export const sprite = (px: Pixels, ax = px[0]!.length >> 1, ay = px.length): Sprite => ({ px, ax, ay })

/** `px` with its top-left at (x, y), each pixel `scale` wide and tall, mirrored when `flip`; nothing lands outside `columns`, `rows` or the canvas. */
export function paint(canvas: Canvas, px: Pixels, x: number, y: number, { flip = false, scale = 1, columns = [0, canvas.width] as Span, rows = [0, canvas.height] as Span, tint = CLEAR } = {}) {
  const [left, right] = [Math.max(0, columns[0]), Math.min(canvas.width, columns[1])]
  const [top, bottom] = [Math.max(0, rows[0]), Math.min(canvas.height, rows[1])]
  px.forEach((row, j) => row.forEach((color, i) => {
    if (color === null) return
    const [x0, y0] = [x + (flip ? row.length - 1 - i : i) * scale, y + j * scale]
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        if (x0 + dx >= left && x0 + dx < right && y0 + dy >= top && y0 + dy < bottom) canvas.data[(y0 + dy) * canvas.width + x0 + dx] = tint === CLEAR ? color : tint
      }
    }
  }))
}

type Clip = { flip?: boolean; columns?: Span; rows?: Span; tint?: number }

/** A sprite with its anchor at (x, y): its feet on row y - 1, its middle on column x. */
export const stand = (canvas: Canvas, { px, ax, ay }: Sprite, x: number, y: number, clip: Clip = {}) =>
  paint(canvas, px, Math.round(x) - (clip.flip === true ? px[0]!.length - ax : ax), Math.round(y) - ay, clip)

/** The canvas as rows of pixels, null where it is clear. */
export const pixelsOf = ({ width, height, data }: Canvas): Pixels =>
  Array.from({ length: height }, (_row, y) => Array.from({ length: width }, (_cell, x) => (data[y * width + x] === CLEAR ? null : data[y * width + x]!)))

/** `px` with each pixel `n` wide and tall. */
export const scaled = (px: Pixels, n: number): Pixels => px.flatMap(row => Array.from({ length: n }, () => row.flatMap(color => Array<number | null>(n).fill(color))))

export const mirrored = (px: Pixels): Pixels => px.map(row => [...row].reverse())

/** `base` with `add` drawn over it, its top-left `dx`, `dy` from the anchor: the anchor stays where the body's was. */
export function joined(base: Sprite, add: Pixels, dx: number, dy: number): Sprite {
  const [left, top] = [Math.min(0, base.ax + dx), Math.min(0, base.ay + dy)]
  const canvas = blank(Math.max(base.px[0]!.length, base.ax + dx + add[0]!.length) - left, Math.max(base.px.length, base.ay + dy + add.length) - top)
  paint(canvas, base.px, -left, -top)
  paint(canvas, add, base.ax + dx - left, base.ay + dy - top)

  return { px: pixelsOf(canvas), ax: base.ax - left, ay: base.ay - top }
}

/** The colours a canvas paints. */
export const coloursOf = (canvas: Canvas): Set<number> => new Set([...canvas.data].filter(color => color !== CLEAR))

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]]
    const word = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += BASE64[word >> 18]! + BASE64[(word >> 12) & 63]! + (b === undefined ? '=' : BASE64[(word >> 6) & 63]!) + (c === undefined ? '=' : BASE64[word & 63]!)
  }

  return out
}

/**
 * The canvas as an Image's source: RGBA bytes, each pixel sent `scale` wide and tall. At 1 the
 * terminal does the enlarging; at the art pixel's size in device pixels it has nothing left to scale.
 */
export function sourceOf(canvas: Canvas, scale = 1): { rgba: string; width: number; height: number } {
  const [width, height] = [canvas.width * scale, canvas.height * scale]
  const bytes = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = canvas.data[Math.floor(y / scale) * canvas.width + Math.floor(x / scale)]!
      if (color !== CLEAR) bytes.set([(color >> 16) & 255, (color >> 8) & 255, color & 255, 255], (y * width + x) * 4)
    }
  }

  return { rgba: base64(bytes), width, height }
}

/** A terminal cell in device pixels. */
export type Cell = { w: number; h: number }

/** What a cell is taken for while nobody could measure it: one wide by two tall. */
export const ASSUMED: Cell = { w: 9, h: 18 }

/** Device pixels to an art pixel, each way: about a third of a column, so a pane is some hundred art pixels across. */
export const unitOf = (cell: Cell): number => Math.max(1, Math.round(cell.w / 3))

/**
 * A box of cells and the art pixels that fill it exactly, so an art pixel is `unitOf(cell)` device
 * pixels each way, square and whole: at least `width` by `height` art pixels, grown to the next
 * whole cells that divide evenly.
 */
export type Box = { columns: number; rows: number; width: number; height: number }

export function boxOf(cell: Cell, width: number, height: number): Box {
  const unit = unitOf(cell)
  let columns = Math.max(1, Math.ceil((width * unit) / cell.w))
  while ((columns * cell.w) % unit !== 0) columns += 1
  let rows = Math.max(1, Math.ceil((height * unit) / cell.h))
  while ((rows * cell.h) % unit !== 0) rows += 1

  return { columns, rows, width: (columns * cell.w) / unit, height: (rows * cell.h) / unit }
}

/** The widest box of whole art pixels in at most `columns` cells, `rows` tall as `boxOf` has them. */
export function boxIn(cell: Cell, columns: number, height: number): Box {
  const unit = unitOf(cell)
  let fit = Math.max(1, columns)
  while (fit > 1 && (fit * cell.w) % unit !== 0) fit -= 1

  return { ...boxOf(cell, 1, height), columns: fit, width: Math.floor((fit * cell.w) / unit) }
}
