import { expect, test } from 'claude-code/testing'

import { toPack } from '../../flow/hooks/palette'
import { PACK_TEXT } from '../../flow/tests/packs'
import { cells, clearLine, width } from '../hooks/mods'
import type { Line } from '../hooks/mods'

const PACKS = Object.values(PACK_TEXT).map(text => toPack(JSON.parse(text)))
// The dock's narrowest pane, the Avatar pane's own 40 cells, a wide pane, the band.
const WIDTHS = [24, 40, 53, 96] as const
const text = (line: Line) => line.map(s => (s.key === undefined ? s.t : `${s.key}: ${s.t}`)).join('')
const keysOf = (line: Line) => line.flatMap(seg => (seg.key === undefined ? [] : [seg.key]))

test('every pack draws the /clear line as one line, at most as wide as asked at 24, 40, 53 and 96 columns, its two keys whole at each', () => {
  let drawn = 0
  for (const pack of PACKS) {
    expect(pack).not.toBeNull()
    if (pack === null) continue
    const { palette: P, steps: S } = pack
    for (const w of WIDTHS) {
      for (const context of [undefined, 72, 100]) {
        const line = clearLine(context, false, P, S, w)
        // One line: a flat list of runs of text, none of them broken.
        expect([pack.slug, w, line.every(seg => typeof seg.t === 'string' && !seg.t.includes('\n'))]).toEqual([pack.slug, w, true])
        expect([pack.slug, w, width(line) <= w]).toEqual([pack.slug, w, true])
        // The pane's free keys: h and e (1 to 9 and 0 pick a theme, l opens the picker, p pets).
        expect([pack.slug, w, keysOf(line)]).toEqual([pack.slug, w, ['h', 'e']])
        expect([pack.slug, w, text(line).includes('h: handoff  e: lesson')]).toEqual([pack.slug, w, true])
        drawn += 1
      }
    }
  }
  expect(drawn).toBe(PACKS.length * WIDTHS.length * 3)
})

test('the /clear line gives way in order: the context figure, then the title shortens to /clear, then the title goes; a key never does', () => {
  const pack = PACKS[0]
  if (pack === null || pack === undefined) return
  const P = pack.palette
  const S = { ...pack.steps, header: { ...pack.steps.header, upper: false } }
  const at = (w: number) => text(clearLine(72, true, P, S, w))
  expect(at(96)).toBe('before /clear  h: handoff  e: lesson  ctx 72%')
  expect(at(45)).toBe('before /clear  h: handoff  e: lesson  ctx 72%')
  expect(at(44)).toBe('before /clear  h: handoff  e: lesson')
  expect(at(40)).toBe('before /clear  h: handoff  e: lesson') // the Avatar pane's own width
  expect(at(36)).toBe('before /clear  h: handoff  e: lesson')
  expect(at(35)).toBe('/clear  h: handoff  e: lesson')
  expect(at(29)).toBe('/clear  h: handoff  e: lesson')
  expect(at(28)).toBe('h: handoff  e: lesson')
  expect(at(24)).toBe('h: handoff  e: lesson')
  // The context figure is said only where it is known, to the whole percent.
  expect(text(clearLine(undefined, true, P, S, 96))).toBe('before /clear  h: handoff  e: lesson')
  expect(text(clearLine(99.6, true, P, S, 96))).toBe('before /clear  h: handoff  e: lesson  ctx 100%')

  // The title: bold, in the pack's header colour, with no prefix and no frame; the figure in the dim text colour.
  const full = clearLine(72, true, P, S, 96)
  expect(full[0]).toEqual({ t: 'before /clear', fg: P[S.header.color], bold: true })
  expect(full.at(-1)).toEqual({ t: '  ctx 72%', fg: P.text3 })
  // In capitals where the pack's header is, the keys' words never.
  const loud = { ...S, header: { ...S.header, upper: true, prefix: '▸ ' } }
  expect(text(clearLine(72, true, P, loud, 96))).toBe('BEFORE /CLEAR  h: handoff  e: lesson  ctx 72%')
  expect(text(clearLine(72, true, P, loud, 30))).toBe('/CLEAR  h: handoff  e: lesson')
})

test('the lesson key is dim where Professeur is off; the handoff key never is', () => {
  const pack = PACKS[0]
  if (pack === null || pack === undefined) return
  const dims = (isProf: boolean) => clearLine(72, isProf, pack.palette, pack.steps, 96).filter(seg => seg.key !== undefined).map(seg => seg.dim === true)
  expect([dims(false), dims(true)]).toEqual([[false, true], [false, false]])
})

test('widths are terminal cells: an emoji or a CJK character is two, a joiner none, the theme glyphs one', () => {
  expect([cells('ok'), cells('🎓 ok'), cells('漢字'), cells('★♥▶●'), cells('é')]).toEqual([2, 5, 4, 4, 1])
  // A line's width is its runs' cells, a key drawn with its hotkey before it (`h: handoff`).
  expect(width([{ t: '漢字 ' }, { t: 'handoff', key: 'h' }])).toBe(15)
})
