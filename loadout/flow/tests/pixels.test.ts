// The bubble map's pixels: what a shape leaves on the picture, read back pixel by pixel.
import { expect, test } from 'claude-code/testing'

import { arrow, bar, disc, icon, mix, picture, rgb, rrect, sourceOf, text, textWidth, tiles } from '../hooks/pixels'
import type { Picture } from '../hooks/pixels'

const [GROUND, FILL, EDGE, INK] = [rgb('#1b2414'), rgb('#ffd8a8'), rgb('#d9480f'), rgb('#1e1e1e')]
/** The colour of one pixel, 0xRRGGBB. */
const at = (p: Picture, x: number, y: number) => (p.data[(y * p.width + x) * 4]! << 16) | (p.data[(y * p.width + x) * 4 + 1]! << 8) | p.data[(y * p.width + x) * 4 + 2]!
/** How many pixels of a row, or of a column, are not the ground. */
const inked = (p: Picture, y: number) => Array.from({ length: p.width }, (_, x) => at(p, x, y)).filter(c => c !== GROUND).length
const inkedDown = (p: Picture, x: number) => Array.from({ length: p.height }, (_, y) => at(p, x, y)).filter(c => c !== GROUND).length

test('a picture starts as its ground, opaque', () => {
  const p = picture(4, 3, GROUND)
  expect([p.width, p.height, p.data.length]).toEqual([4, 3, 48])
  expect(at(p, 3, 2)).toBe(GROUND)
  expect(p.data[3]).toBe(255)
})

test('mix moves one colour towards another', () => {
  expect(mix(rgb('#000000'), rgb('#ffffff'), 0)).toBe(0x000000)
  expect(mix(rgb('#000000'), rgb('#ffffff'), 1)).toBe(0xffffff)
  expect(mix(rgb('#102030'), rgb('#304050'), 0.5)).toBe(0x203040)
})

test('a rounded rectangle is its fill inside, its outline two pixels deep, the ground past its corner', () => {
  const p = picture(60, 40, GROUND)
  rrect(p, { x: 10, y: 10, w: 40, h: 20, r: 8, fill: FILL, outline: EDGE })
  expect(at(p, 30, 20)).toBe(FILL)
  // a straight side is crisp: the outline is exactly two pixels, then the fill
  expect([at(p, 9, 20), at(p, 10, 20), at(p, 11, 20), at(p, 12, 20)]).toEqual([GROUND, EDGE, EDGE, FILL])
  expect([at(p, 30, 9), at(p, 30, 10), at(p, 30, 11), at(p, 30, 12)]).toEqual([GROUND, EDGE, EDGE, FILL])
  expect([at(p, 49, 20), at(p, 50, 20)]).toEqual([EDGE, GROUND])
  // the corner of the box is outside the rounding
  expect(at(p, 10, 10)).toBe(GROUND)
  expect(at(p, 49, 29)).toBe(GROUND)
})

test('a dashed outline leaves gaps, where the fill or the ground shows', () => {
  const frame = picture(200, 60, GROUND)
  rrect(frame, { x: 10, y: 10, w: 180, h: 40, r: 10, outline: EDGE, dash: [7, 5] })
  const top = Array.from({ length: 150 }, (_, i) => at(frame, 25 + i, 10))
  expect(top.filter(c => c === EDGE).length).toBeGreaterThan(60)
  expect(top.filter(c => c === GROUND).length).toBeGreaterThan(40)
  // nothing is drawn inside an empty frame
  expect(at(frame, 100, 30)).toBe(GROUND)

  const chip = picture(200, 60, GROUND)
  rrect(chip, { x: 10, y: 10, w: 180, h: 40, r: 10, fill: FILL, outline: EDGE, dash: [5, 3] })
  const side = Array.from({ length: 150 }, (_, i) => at(chip, 25 + i, 10))
  expect(side.filter(c => c === EDGE).length).toBeGreaterThan(60)
  expect(side.filter(c => c === FILL).length).toBeGreaterThan(30)
  expect(side.filter(c => c === GROUND).length).toBe(0)
})

test('a text is stamped one letter a slot: a space leaves nothing, an unknown letter is a question mark', () => {
  expect(textWidth('explorer', '9b')).toBe(72)
  expect(textWidth('explorer', '7')).toBe(56)
  const p = picture(60, 30, GROUND)
  text(p, { x: 10, y: 5, text: 'I I', color: INK, face: '9b' })
  const columns = (from: number) => Array.from({ length: 9 }, (_, i) => inkedDown(p, from + i)).reduce((a, b) => a + b, 0)
  expect(columns(10)).toBeGreaterThan(10)
  expect(columns(19)).toBe(0)
  expect(columns(28)).toBe(columns(10))

  // white space of any kind leaves nothing
  const spaced = picture(40, 30, GROUND)
  text(spaced, { x: 4, y: 4, text: '\u00a0\t', color: INK, face: '7' })
  expect(Array.from(spaced.data)).toEqual(Array.from(picture(40, 30, GROUND).data))

  const [unknown, mark] = [picture(20, 30, GROUND), picture(20, 30, GROUND)]
  text(unknown, { x: 4, y: 4, text: '中', color: INK, face: '7' })
  text(mark, { x: 4, y: 4, text: '?', color: INK, face: '7' })
  expect(Array.from(unknown.data)).toEqual(Array.from(mark.data))
  expect(inked(mark, 12)).toBeGreaterThan(0)
})

test('an arrow is a two-pixel line ending in a head; dashed, the line has gaps; a number sits in a disc on it', () => {
  const p = picture(40, 120, GROUND)
  arrow(p, { x1: 20, y1: 10, x2: 20, y2: 110, color: EDGE })
  expect([at(p, 18, 50), at(p, 19, 50), at(p, 20, 50), at(p, 21, 50)]).toEqual([GROUND, EDGE, EDGE, GROUND])
  // the head: wide at its base, a point at the end, nothing past it
  expect(inked(p, 102)).toBeGreaterThan(7)
  expect(inked(p, 109)).toBeLessThan(4)
  expect(inked(p, 110)).toBe(0)
  expect(inked(p, 9)).toBe(0)

  const dashed = picture(40, 120, GROUND)
  arrow(dashed, { x1: 20, y1: 110, x2: 20, y2: 10, color: EDGE, dash: [6, 4] })
  const shaft = Array.from({ length: 80 }, (_, i) => at(dashed, 20, 25 + i))
  expect(shaft.filter(c => c === GROUND).length).toBeGreaterThan(24)
  expect(shaft.filter(c => c === EDGE).length).toBeGreaterThan(40)
  // it points up: the head is at the top
  expect(inked(dashed, 18)).toBeGreaterThan(7)

  const numbered = picture(40, 120, GROUND)
  arrow(numbered, { x1: 20, y1: 10, x2: 20, y2: 110, color: EDGE, number: 3, numberAt: 60, ground: GROUND })
  // the disc is 16 pixels across and cuts the line: its inside is the ground, with the digit's ink
  expect(inked(numbered, 60)).toBeGreaterThan(5)
  expect(at(numbered, 13, 60)).toBe(EDGE)
  expect(at(numbered, 26, 60)).toBe(EDGE)
  expect(at(numbered, 15, 60)).toBe(GROUND)
})

test('a horizontal arrow points the way it is drawn', () => {
  const p = picture(60, 20, GROUND)
  arrow(p, { x1: 5, y1: 10, x2: 35, y2: 10, color: EDGE })
  expect([at(p, 15, 8), at(p, 15, 9), at(p, 15, 10), at(p, 15, 11)]).toEqual([GROUND, EDGE, EDGE, GROUND])
  expect(inkedDown(p, 27)).toBeGreaterThan(7)
  expect(inkedDown(p, 35)).toBe(0)
})

test('a bar is split at its share: the full colour, then the rest', () => {
  const p = picture(120, 20, GROUND)
  bar(p, { x: 10, y: 5, w: 100, h: 10, share: 0.75, full: EDGE, rest: FILL, outline: EDGE })
  expect(at(p, 50, 10)).toBe(EDGE)
  expect(at(p, 84, 10)).toBe(EDGE)
  expect(at(p, 86, 10)).toBe(FILL)
  expect(at(p, 109, 10)).toBe(EDGE)
  expect(at(p, 110, 10)).toBe(GROUND)
  expect(at(p, 10, 5)).not.toBe(EDGE)
})

test('a disc is round, and each sign fills its box its own way', () => {
  const p = picture(40, 40, GROUND)
  disc(p, { cx: 20, cy: 20, r: 8, fill: FILL })
  expect(at(p, 20, 20)).toBe(FILL)
  expect(at(p, 13, 13)).toBe(GROUND)
  expect([inked(p, 20), inkedDown(p, 20)]).toEqual([16, 16])

  const signs = (['run', 'done', 'failed', 'dot'] as const).map(sign => {
    const box = picture(20, 20, GROUND)
    icon(box, { sign, x: 4, y: 4, size: 11, color: INK })
    // nothing leaves the box, something is in it
    expect([inked(box, 2), inked(box, 17), inkedDown(box, 2), inkedDown(box, 17)]).toEqual([0, 0, 0, 0])

    return Array.from(box.data).join()
  })
  expect(new Set(signs).size).toBe(4)
})

test('a picture is sent as RGBA bytes; one too large for a single image is cut at whole rows of cells', () => {
  const small = picture(90, 42, GROUND)
  const source = sourceOf(small)
  expect([source.width, source.height, source.rgba.length]).toEqual([90, 42, 4 * Math.ceil((90 * 42 * 4) / 3)])
  expect(tiles(small, 21).map(tile => [tile.rows, tile.source.height])).toEqual([[2, 42]])

  // 837 x 777 pixels is 37 rows of 21: 2.6 MB, over the 2 MiB one image may hold
  const tall = picture(837, 777, GROUND)
  rrect(tall, { x: 0, y: 0, w: 837, h: 777, r: 0, fill: FILL })
  // a mark near the bottom: it must come out in the last band, at its own place
  rrect(tall, { x: 400, y: 700, w: 10, h: 10, r: 0, fill: EDGE })
  const cut = tiles(tall, 21)
  expect(cut.length).toBe(2)
  const bytes = cut.flatMap(tile => Array.from(atob(tile.source.rgba), ch => ch.charCodeAt(0)))
  expect(bytes.length).toBe(tall.data.length)
  expect(bytes.slice((705 * 837 + 405) * 4, (705 * 837 + 405) * 4 + 4)).toEqual([0xd9, 0x48, 0x0f, 255])
  expect(bytes.slice((705 * 837 + 300) * 4, (705 * 837 + 300) * 4 + 4)).toEqual([0xff, 0xd8, 0xa8, 255])
  expect(cut.map(tile => tile.rows).reduce((a, b) => a + b, 0)).toBe(37)
  cut.forEach(tile => {
    expect(tile.source.height).toBe(tile.rows * 21)
    expect(tile.source.width * tile.source.height * 4).toBeLessThanOrEqual(2 * 1024 * 1024)
  })
})
