// What a pane of a given size draws, and the cell-block mascot's pixels. Pure: no engine import, so
// previews and tests lay out and compose what the pane shows. A mascot is never scaled by anything
// but a whole number: in cell blocks a sprite pixel is a pixel (half a cell), in true pixels a
// whole number of art pixels.
import { boxIn, boxOf, unitOf } from './canvas'
import type { Box, Cell } from './canvas'
import { HERO_COLUMNS, HERO_PX, HERO_ROWS, HERO_ROWS_LEAST } from './cyber'
import type { Who } from './cyber'
import { fitOf, framesOf, pixelsOf } from './families'
import type { Look } from './families'
import { FEED_SHAPE } from './reel'
import type { Slot } from './reel'
import { OBJECT_ROWS, isChrome } from './chrome'
import { HALO_ROWS, isHalo } from './halo'
import { MASK_COLUMNS, MASK_LEAST, MASK_ROWS, NONE } from './hud'
import type { Skin } from './hud'
import { HUD_ROWS } from './hudpane'
import type { Form, Pixels } from './look'
import { HEADROOM, MARGIN } from './mascot'
import type { Mood } from './mascot'
import { KIRBY } from './sprite'

const BLUSH = 0xff1784
/** A step of the cell-block mascot. */
export const TICK_MS = 400
const BLINK_EVERY = 10 // of those steps

// A raster is the sprite plus two pixels: a column each side to shake in, two rows to jump in.
const sizeOf = (width: number, height: number) => ({ columns: width + 2, rows: Math.ceil((height + 2) / 2) })

export const CHROME_ROWS = 12 // the bubble's four, name, pet, a blank, cost, two meters of two (week, context)
// The Halo HUD's: the cyber HUD's, and two more, as its motion tracker is five rows beside the week's magazine and the cost.
export const HALO_HUD_ROWS = HUD_ROWS + 2
/** The rows a layout's frame takes besides its mascot and its agents' count: the HUD's, the Halo HUD's, or the plain pane's. */
export const chromeRows = (l: Layout): number => ('text' in l ? (isHalo(l.text.skin) ? HALO_HUD_ROWS : HUD_ROWS) : CHROME_ROWS)
const NARROWEST = KIRBY[0]!.length // no mascot is drawn narrower than plain Kirby
const ART_SCALE = 2 // art pixels to a sprite pixel in true pixels, at the most: 3 is a whole column, the mascot at its largest
const PLAIN_ROWS = sizeOf(NARROWEST, KIRBY.length).rows
const COUNT_ROWS = 1 // the agents' count: the row a mascot leaves over the bubble, or over a HUD's banner

/** A mascot in text: the family's skin and the model's form. */
export type TextLook = { skin: Skin; form: Form }

/**
 * What a pane draws: the mascot's box in cells. In cell blocks `look` is the look drawn, which on a
 * short or narrow pane is the family's plain form; in true pixels, `art` holds the picture's box
 * and how many art pixels a sprite pixel is. A family in text has `text` in place of a `look`: its
 * mask in `size` (no rows for none); with a `hero`, that box holds the family's character instead
 * of the mask, in true pixels where there is an `art`; with a `feed`, it holds the camera feed of
 * that slot's pictures (reel.ts), for any model.
 */
export type Layout = {
  size: { columns: number; rows: number }
  art?: { scale: number; mascot: Box }
} & ({ look: Look } | { text: TextLook; hero?: Who; feed?: Slot })

/**
 * Whether a pane of `rows` rows, laid out as `l`, has the row of the agents' count: all do, but a
 * pane its mascot fills to the last row or overflows (the plain form is never cut to make one: in cell
 * blocks, under 23 rows). The pane is filled from its foot, so the count comes and goes in that row
 * and nothing under it moves.
 */
export const hasCountRow = (l: Layout, rows: number): boolean => rows - chromeRows(l) - l.size.rows >= COUNT_ROWS

/**
 * The layout of a pane of this size, in cell blocks. The mascot depends on the pane alone, never on
 * the agents, so it holds still as they come and go, and it is never shrunk: it has every row the
 * meters and the bubble leave. Too short for the form, the pane shows what `fitOf` says: the plain
 * form, whole. A model's form is "too short for" a pane it would fill to the last row: it is drawn
 * only where COUNT_ROWS are left above the bubble, so the agents are still counted there.
 */
export function laidOut(look: Look, width: number, rows: number): Layout & { look: Look } {
  const budget = Math.max(PLAIN_ROWS, rows - CHROME_ROWS)
  const wide = Math.max(NARROWEST, width - 2)
  const whole = fitOf(look, wide, (budget - COUNT_ROWS) * 2 - 2)
  const fit = look.form !== 'opus' && whole.look === look ? whole : fitOf({ family: look.family, form: 'opus' }, wide, budget * 2 - 2)

  return { look: fit.look, size: sizeOf(framesOf(fit.look)[0]![0]!.length, fit.height) }
}

/**
 * The same in true pixels, for cells of `cell` device pixels. A sprite pixel is a whole number of
 * art pixels, ART_SCALE of them at the most (two thirds of a column: smaller than the cell-block
 * mascot, by the person's choice): the mascot is never blurred, only smaller. It is the largest
 * that leaves COUNT_ROWS above the bubble.
 * Its box is as many columns off the bubble's width as keeps it centred under the bubble's tail.
 */
export function laidOutArt(look: Look, width: number, rows: number, cell: Cell): Layout & { look: Look } {
  const whole = framesOf(look)[0]!
  const boxAt = (scale: number) => {
    const box = boxOf(cell, whole[0]!.length * scale + 2 * MARGIN, whole.length * scale + HEADROOM)
    const wider = boxOf(cell, box.width + 1, box.height)
    const isOff = (columns: number) => (Math.max(8, width - 1) - columns) % 2 !== 0

    return isOff(box.columns) && !isOff(wider.columns) && wider.columns <= width ? wider : box
  }
  const top = Math.max(1, Math.min(ART_SCALE, Math.round(cell.w / unitOf(cell))))
  const scales = Array.from({ length: top }, (_scale, i) => top - i)
  const scale = scales.find(s => boxAt(s).rows <= rows - CHROME_ROWS - COUNT_ROWS && boxAt(s).columns <= width) ?? 1
  const mascot = boxAt(scale)

  return { look, size: mascot, art: { scale, mascot } }
}

/**
 * The same for a family in text. The mask depends on the pane alone, so it holds still as the
 * agents come and go: whole where the rows allow, cropped about its visor on a shorter pane, left
 * out under MASK_LEAST rows or MASK_COLUMNS columns. (The chrome skins draw the model's object there, chrome.ts, and the Halo ones their figure, halo.ts: OBJECT_ROWS tall where the rows allow, HALO_ROWS for a figure.) It never takes the last COUNT_ROWS:
 * the rule that counts the agents has the row left above the banner, so running agents are told on
 * any pane that holds the HUD and one row more.
 *
 * A `hero` is the family's character, drawn in place of the mask where the pane has its rows: in
 * true pixels, in a box of whole art pixels as wide as the pane, when a `cell` is given; in text
 * otherwise, HERO_ROWS tall or a little less. Its box is one size whatever it does. On a pane too
 * short or too narrow for it, the mask is drawn, as for any other model.
 *
 * A `feed` is a slot whose pictures there are (with a `cell`: pictures are true pixels): the box is
 * the camera feed's, one shape and so one size whoever plays in it, with or without a drawn `who`.
 */
export function laidOutText(text: TextLook, width: number, rows: number, canDraw: boolean, hero?: { who?: Who; cell?: Cell; feed?: Slot }): Layout {
  const columns = Math.max(8, width - 1)
  const room = rows - (isHalo(text.skin) ? HALO_HUD_ROWS : HUD_ROWS) - COUNT_ROWS
  if (hero !== undefined && canDraw && columns >= HERO_COLUMNS) {
    const drawn = hero.who === undefined ? {} : { hero: hero.who }
    const feed = hero.cell === undefined ? undefined : hero.feed
    const box = hero.cell === undefined ? undefined : feed !== undefined ? portraitBox(hero.cell, columns, room, FEED_SHAPE) : hero.who !== undefined ? boxIn(hero.cell, columns, HERO_PX) : undefined
    if (box !== undefined && box.rows <= room) return { text, size: { columns: box.columns, rows: box.rows }, ...drawn, ...(feed === undefined ? {} : { feed }), art: { scale: 1, mascot: box } }
    if (hero.who !== undefined && room >= HERO_ROWS_LEAST) return { text, size: { columns, rows: Math.min(HERO_ROWS, room) }, ...drawn }
  }

  return { text, size: { columns, rows: canDraw && columns >= MASK_COLUMNS && room >= MASK_LEAST ? Math.min(isHalo(text.skin) ? HALO_ROWS : isChrome(text.skin) ? OBJECT_ROWS : MASK_ROWS, room) : 0 } }
}

// --- the mascot in cell blocks ---------------------------------------------------

const SPARK = [0x5fd7ff, 0xffd75f, 0xaf87ff]
// Where the free corner above Kirby's face holds a spark, one per frame.
const SPARK_AT = [[3, 1], [1, 3], [2, 0], [0, 2]] as const

/**
 * One step of the main mascot in cell blocks, as pixels, two to a cell's height: idle breathes and
 * blinks, working bounces and chatters with sparks flying off, happy jumps under hearts, worried
 * shakes. The sprite is drawn mirrored (the mascots look left, at the conversation), a pixel of it
 * a pixel here; what the box is too short for is cut at its foot.
 */
export function mascotBlocks(drawn: Layout & { look: Look }, mood: Mood, frame: number): Pixels {
  const { columns, rows } = drawn.size
  const isBlink = mood === 'idle' && frame % BLINK_EVERY === BLINK_EVERY - 1
  const isHalf = mood === 'worried' || (mood === 'working' && frame % 2 === 1)
  const dy = mood === 'happy' ? [2, 1, 0, 1][frame % 4]! : mood === 'working' ? 1 + (frame % 2) : 1 + (Math.floor(frame / 4) % 2)
  const dx = mood === 'worried' ? (frame % 2) * 2 : 1

  const canvas = Array.from({ length: rows * 2 }, () => Array<number | null>(columns).fill(null))
  pixelsOf(drawn.look, mood, isBlink ? 2 : isHalf ? 1 : 0, mood === 'working' && frame % 2 === 1).forEach((row, y) => row.forEach((color, x) => {
    const line = canvas[y + dy]
    if (line && color !== null) line[dx + row.length - 1 - x] = color
  }))
  if (mood === 'working' || mood === 'happy') {
    const [row, col] = SPARK_AT[frame % SPARK_AT.length]!
    const color = mood === 'happy' ? BLUSH : SPARK[frame % SPARK.length]!
    canvas[row]![col] ??= color
    if (mood === 'happy') canvas[row]![columns - 1 - col] ??= color
  }

  return canvas
}

/**
 * Pixels as RasterProps cells, an upper-half block per two pixels. Where nothing is drawn a cell
 * shows `ground`: the pane's own background, or the terminal's (NONE) on a pane that paints none.
 */
export function encoded(canvas: Pixels, ground = NONE): string {
  const columns = canvas[0]!.length
  const rows = canvas.length / 2
  const words = new Uint32Array(columns * rows * 3)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const top = canvas[y * 2]?.[x] ?? null
      const bottom = canvas[y * 2 + 1]?.[x] ?? null
      const cell =
        top !== null ? [0x2580, top, bottom ?? ground]
        : bottom !== null ? [0x2584, bottom, ground]
        : [0x20, ground, ground]
      words.set(cell, (y * columns + x) * 3)
    }
  }

  return btoa(String.fromCharCode(...new Uint8Array(words.buffer)))
}

/** The largest box of cells of a portrait's shape in `columns` by `room`: its art fields are its device pixels. */
function portraitBox(cell: { w: number; h: number }, columns: number, room: number, shape: number): ReturnType<typeof boxIn> {
  let wide = columns
  let rows = Math.round((wide * cell.w) / shape / cell.h)
  if (rows > room) {
    rows = room
    wide = Math.max(1, Math.min(columns, Math.round((rows * cell.h * shape) / cell.w)))
  }

  return { columns: wide, rows: Math.max(1, rows), width: wide * cell.w, height: Math.max(1, rows) * cell.h }
}
