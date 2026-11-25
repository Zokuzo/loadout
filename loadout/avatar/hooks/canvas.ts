// A picture in true pixels: what the mascot is composed on where the terminal
// draws images. Pure: no engine import, so previews and tests compose what the pane shows.
import type { Pixels } from './look'

/** `width * height` pixels, row-major: 0xRRGGBB, or CLEAR where nothing is drawn (alpha 0). */
export type Canvas = { width: number; height: number; data: Int32Array }
export const CLEAR = -1

export const blank = (width: number, height: number): Canvas => ({ width, height, data: new Int32Array(width * height).fill(CLEAR) })

/** `px` with its top-left at (x, y), each pixel `scale` wide and tall, mirrored when `flip`, in the one colour `tint` where given; nothing lands outside the canvas. */
export function paint(canvas: Canvas, px: Pixels, x: number, y: number, { flip = false, scale = 1, tint = CLEAR } = {}) {
  px.forEach((row, j) => row.forEach((color, i) => {
    if (color === null) return
    const [x0, y0] = [x + (flip ? row.length - 1 - i : i) * scale, y + j * scale]
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        if (x0 + dx >= 0 && x0 + dx < canvas.width && y0 + dy >= 0 && y0 + dy < canvas.height) canvas.data[(y0 + dy) * canvas.width + x0 + dx] = tint === CLEAR ? color : tint
      }
    }
  }))
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
