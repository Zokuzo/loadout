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
import { isHalo } from './halo'
import { MASK_COLUMNS, MASK_LEAST, MASK_ROWS, NONE, blockRowsOf } from './hud'
import type { Skin } from './hud'
import { HUD_ROWS } from './hudpane'
import type { Form, Pixels } from './look'
import { HEADROOM, MARGIN } from './mascot'
import type { Mood } from './mascot'
import { NARROWEST_PX, STAGE_PX } from './scene'
import { KIRBY } from './sprite'
import { NARROWEST as STAGE_NARROWEST, STAGE_ROWS } from './stage'

const BLUSH = 0xff1784
const BLINK_EVERY = 10 // of the cell-block mascot's steps

// A raster is the sprite plus two pixels: a column each side to shake in, two rows to jump in.
const sizeOf = (width: number, height: number) => ({ columns: width + 2, rows: Math.ceil((height + 2) / 2) })

export const LEGEND_MAX = 5 // as many as the widest stage has minis: every mini on stage has its line
export const CHROME_ROWS = 14 // the bubble's four, name, pet, a blank, cost, three meters of two
const NARROWEST = KIRBY[0]!.length // no mascot is drawn narrower than plain Kirby
const PLAIN_ROWS = sizeOf(NARROWEST, KIRBY.length).rows
const TEXT_RESERVED = 2 // of a text family's pane: the agents' rule and one row of them
const LEGEND_KEPT = 3 // the rows a model's form leaves above the bubble: two agents named and a count of the others

/** A mascot in text: the family's skin and the model's form. */
export type TextLook = { skin: Skin; form: Form }

/**
 * What a pane draws: the mascot's box in cells and, above it, the stage's (null for none) and how
 * many lines of legend. In cell blocks `look` is the look drawn, which on a short or narrow pane is
 * the family's plain form; in true pixels, `art` holds the two pictures' boxes and how many art
 * pixels a sprite pixel is. A family in text has `text` in place of a `look`: its mask in `size`
 * (no rows for none) and its agents' blocks in `stage`; with a `hero`, that box holds the family's
 * character instead of the mask, in true pixels where there is an `art`; with a `feed`, it holds the
 * camera feed of that slot's pictures (reel.ts), for any model.
 */
export type Layout = {
  size: { columns: number; rows: number }
  stage: { columns: number; rows: number } | null
  lines: number
  art?: { scale: number; mascot: Box; stage: Box | null }
} & ({ look: Look } | { text: TextLook; hero?: Who; feed?: Slot })

/** How many lines of legend `room` rows hold: at most LEGEND_MAX agents are named; a last line counts the others. */
const linesOf = (alive: number, room: number) => Math.max(0, Math.min(Math.min(alive, LEGEND_MAX) + (alive > LEGEND_MAX ? 1 : 0), room))

/**
 * The layout of a pane of this size, in cell blocks. The mascot depends on the pane alone, never on
 * the helpers, so it holds still as they come and go, and it is never shrunk: it has every row the
 * meters and the bubble leave, the stage only the rows left over. Too short for the form, the pane
 * shows what `fitOf` says: the plain form, whole. A model's form is "too short for" a pane it would
 * fill to the last row: it is drawn only where LEGEND_KEPT rows are left above the bubble, so the
 * agents are still told there, by name, when the stage has given up its rows. The stage and its
 * legend take the rows left above the bubble; too few for the stage, the legend alone.
 */
export function laidOut(look: Look, alive: number, width: number, rows: number, canDraw: boolean): Layout & { look: Look } {
  const budget = Math.max(PLAIN_ROWS, rows - CHROME_ROWS)
  const wide = Math.max(NARROWEST, width - 2)
  const whole = fitOf(look, wide, (budget - LEGEND_KEPT) * 2 - 2)
  const fit = look.form !== 'opus' && whole.look === look ? whole : fitOf({ family: look.family, form: 'opus' }, wide, budget * 2 - 2)
  const size = sizeOf(framesOf(fit.look)[0]![0]!.length, fit.height)
  const room = rows - CHROME_ROWS - size.rows
  const hasStage = canDraw && alive > 0 && width - 1 >= STAGE_NARROWEST && room > STAGE_ROWS

  return { look: fit.look, size, stage: hasStage ? { columns: width - 1, rows: STAGE_ROWS } : null, lines: linesOf(alive, room - (hasStage ? STAGE_ROWS : 0)) }
}

/**
 * The same in true pixels, for cells of `cell` device pixels. A sprite pixel is a whole number of
 * art pixels, about a column wide at the most (the cell-block mascot's size): the mascot is never
 * blurred, only smaller. It gives up one step of its size to leave the stage room, never more: on
 * a pane too short for that it keeps the size it has alone, and the agents are lines of legend.
 * Its box is as many columns off the bubble's width as keeps it centred under the bubble's tail.
 */
export function laidOutArt(look: Look, alive: number, width: number, rows: number, cell: Cell): Layout & { look: Look } {
  const stage = boxIn(cell, width - 1, STAGE_PX)
  const whole = framesOf(look)[0]!
  const boxAt = (scale: number) => {
    const box = boxOf(cell, whole[0]!.length * scale + 2 * MARGIN, whole.length * scale + HEADROOM)
    const wider = boxOf(cell, box.width + 1, box.height)
    const isOff = (columns: number) => (Math.max(8, width - 1) - columns) % 2 !== 0

    return isOff(box.columns) && !isOff(wider.columns) && wider.columns <= width ? wider : box
  }
  const fits = (scale: number, budget: number) => boxAt(scale).rows <= budget && boxAt(scale).columns <= width
  const top = Math.max(1, Math.round(cell.w / unitOf(cell)))
  const scales = Array.from({ length: top }, (_scale, i) => top - i)
  const alone = scales.find(s => fits(s, rows - CHROME_ROWS)) ?? 1
  const roomy = scales.find(s => fits(s, rows - CHROME_ROWS - stage.rows - 1))
  const scale = roomy !== undefined && roomy >= Math.max(alone - 1, Math.min(alone, 2)) ? roomy : alone
  const mascot = boxAt(scale)
  const room = rows - CHROME_ROWS - mascot.rows
  const hasStage = alive > 0 && stage.width >= NARROWEST_PX && room > stage.rows

  return {
    look, size: mascot, stage: hasStage ? stage : null,
    lines: linesOf(alive, room - (hasStage ? stage.rows : 0)), art: { scale, mascot, stage: hasStage ? stage : null },
  }
}

/**
 * The same for a family in text. The mask depends on the pane alone, so it holds still as the
 * agents come and go: whole where the rows allow, cropped about its visor on a shorter pane, left
 * out under MASK_LEAST rows or MASK_COLUMNS columns. (The chrome skins draw the model's object there, chrome.ts, and the Halo ones their figure, halo.ts: OBJECT_ROWS tall where the rows allow.) It never takes the last TEXT_RESERVED rows:
 * the agents' blocks take the rows left above the banner, one of them for their rule, so a running
 * agent is told on any pane that holds the HUD and two rows more.
 *
 * A `hero` is the family's character, drawn in place of the mask where the pane has its rows: in
 * true pixels, in a box of whole art pixels as wide as the pane, when a `cell` is given; in text
 * otherwise, HERO_ROWS tall or a little less. Its box is one size whatever it does. On a pane too
 * short or too narrow for it, the mask is drawn, as for any other model.
 *
 * A `feed` is a slot whose pictures there are (with a `cell`: pictures are true pixels): the box is
 * the camera feed's, one shape and so one size whoever plays in it, with or without a drawn `who`.
 */
export function laidOutText(text: TextLook, alive: number, width: number, rows: number, canDraw: boolean, hero?: { who?: Who; cell?: Cell; feed?: Slot }): Layout {
  const columns = Math.max(8, width - 1)
  const spare = rows - HUD_ROWS
  const room = spare - TEXT_RESERVED
  const laid = (size: { columns: number; rows: number }, more: Partial<Layout> = {}): Layout => {
    const blocks = canDraw && alive > 0 ? blockRowsOf(alive, spare - size.rows - 1) : 0

    return { text, size, stage: blocks > 0 ? { columns, rows: blocks } : null, lines: 0, ...more }
  }
  if (hero !== undefined && canDraw && columns >= HERO_COLUMNS) {
    const drawn = hero.who === undefined ? {} : { hero: hero.who }
    const feed = hero.cell === undefined ? undefined : hero.feed
    const box = hero.cell === undefined ? undefined : feed !== undefined ? portraitBox(hero.cell, columns, room, FEED_SHAPE) : hero.who !== undefined ? boxIn(hero.cell, columns, HERO_PX) : undefined
    if (box !== undefined && box.rows <= room) return laid({ columns: box.columns, rows: box.rows }, { ...drawn, ...(feed === undefined ? {} : { feed }), art: { scale: 1, mascot: box, stage: null } })
    if (hero.who !== undefined && room >= HERO_ROWS_LEAST) return laid({ columns, rows: Math.min(HERO_ROWS, room) }, drawn)
  }

  return laid({ columns, rows: canDraw && columns >= MASK_COLUMNS && room >= MASK_LEAST ? Math.min(isChrome(text.skin) || isHalo(text.skin) ? OBJECT_ROWS : MASK_ROWS, room) : 0 })
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
