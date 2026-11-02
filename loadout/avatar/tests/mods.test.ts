import { expect, test } from 'claude-code/testing'

import { toPack } from '../../flow/hooks/palette'
import { PACK_TEXT } from '../../flow/tests/packs'
import { MODS, NEW, PROBLEM_AT, cells, backCard, clearCard, drawCard, dueCards, headOf, kindOf, lastAsk, minutes, recallCard, recallRate, reviewed, statusLine, streakAfter, width, wrap } from '../hooks/mods'
import type { ModsState } from '../../types'

const PACKS = Object.values(PACK_TEXT).map(text => toPack(JSON.parse(text)))
const WIDTHS = [34, 53, 96] as const
const DAY = 86_400_000
const NOW = 100 * DAY
const text = (line: { t: string; key?: string }[]) => line.map(s => (s.key === undefined ? s.t : `${s.key}: ${s.t}`)).join('')
const failing = (n: number): ModsState => ({ ...MODS, endAt: 5, streak: { n, kind: 'DENIED', what: 'Bash git push', at: NOW - 60_000 } })

test('every pack draws every card and status line within 34, 53 and 96 columns, a card exactly as wide as asked', () => {
  const card = { id: 'a', q: 'Edit fails: "old_string not found": what do you check first, before anything else?', a: 're-Read the file: it changed since your last Read, so the old text is gone', src: 't' }
  let lines = 0
  for (const pack of PACKS) {
    expect(pack).not.toBeNull()
    if (pack === null) continue
    const { palette: P, steps: S } = pack
    for (const w of WIDTHS) {
      const inner = Math.min(w, 96) - 4
      const cards = [
        clearCard(91, ['/a/draw.ts', '/a/register.tsx', '/a/mods.ts'], false, P),
        backCard(47 * 60_000, 'Done.\nShould I approve the schema for T8, then go on to T9 and T10 right away?', { done: 7, of: 10, now: 'T8 auth retry on 401' }, P, S, inner),
        recallCard(card, 4, 84, null, P, inner),
        recallCard(card, 4, 84, { knew: true, next: 6 }, P, inner),
      ]
      for (const one of cards) {
        for (const line of drawCard(one, P, S, w)) {
          expect([pack.slug, w, width(line)]).toEqual([pack.slug, w, Math.min(w, 96)])
          lines += 1
        }
      }
      const states: ModsState[] = [MODS, { ...MODS, endAt: 5, turnAt: 1 }, failing(2), failing(PROBLEM_AT)]
      for (const s of states) {
        for (const working of [false, true]) {
          const line = statusLine(s, { working, agents: 2, tool: 'Bash npm test -- --watch=false', now: NOW }, P, w)
          expect([pack.slug, w, width(line) <= w]).toEqual([pack.slug, w, true])
          lines += 1
        }
      }
    }
  }
  expect(lines).toBeGreaterThan(200)
})

test('the head of the status line: PROBLEM over RUNNING over YOUR TURN over IDLE, each a word as well as a colour', () => {
  expect(headOf(MODS, false, 0)).toBe('IDLE')
  expect(headOf({ ...MODS, endAt: 5 }, false, 0)).toBe('YOUR TURN')
  expect(headOf({ ...MODS, endAt: 5 }, false, 1)).toBe('RUNNING') // an agent still at work: Claude resumes alone
  expect(headOf(failing(PROBLEM_AT), true, 1)).toBe('PROBLEM')
  const P = PACKS[0]?.palette
  if (P === undefined) return
  expect(text(statusLine(MODS, { working: false, agents: 0, now: NOW }, P, 53))).toBe('○ IDLE')
  expect(text(statusLine({ ...MODS, endAt: NOW - 3 * 60_000 }, { working: false, agents: 0, now: NOW }, P, 53))).toBe(' ● YOUR TURN   answered 3m ago')
  expect(text(statusLine({ ...MODS, turnAt: NOW - 4 * 60_000 }, { working: true, agents: 0, tool: 'Bash npm test', now: NOW }, P, 53))).toBe('▶ RUNNING  4m · Bash npm test')
  expect(text(statusLine(failing(2), { working: true, agents: 0, now: NOW }, P, 53))).toContain('△ 2× DENIED')
  expect(text(statusLine(failing(3), { working: true, agents: 0, now: NOW }, P, 53))).toBe(' ▲ PROBLEM   3× DENIED · Bash git push · esc steer')
  // Narrow, the facts give way from the end; the glyph and the word never do.
  expect(text(statusLine(failing(3), { working: true, agents: 0, now: NOW }, P, 34))).toBe(' ▲ PROBLEM   3× DENIED')
})

test('the alarm glyph alternates every 500 ms for 3 s after a failure, then holds', () => {
  const P = PACKS[0]?.palette
  if (P === undefined) return
  const at = (ms: number) => text(statusLine({ ...failing(3), streak: { ...failing(3).streak, at: NOW } }, { working: true, agents: 0, now: NOW + ms }, P, 20))
  expect([at(0), at(600), at(1100), at(3600), at(60_000)].map(t => t.includes('▲'))).toEqual([true, false, true, true, true])
})

test('a run of failures: its kind, and the first call that goes through ends it', () => {
  expect(kindOf('Bash', 'Permission for this action was denied')).toBe('DENIED')
  expect(kindOf('mcp__claude-in-chrome__computer', 'Cannot access a chrome-extension URL')).toBe('CHROME')
  expect(kindOf('mcp__supabase__execute_sql', 'relation "tickets" does not exist')).toBe('SQL')
  expect(kindOf('Edit', 'String to replace not found')).toBe('EDIT')
  expect(kindOf('Bash', 'command timed out')).toBe('TIMEOUT')
  let s = MODS.streak
  for (let i = 0; i < 3; i++) s = streakAfter(s, true, 'Bash', 'exit 1', 'npm test', i)
  expect([s.n, s.kind, s.what]).toEqual([3, 'BASH', 'Bash npm test'])
  expect(streakAfter(s, false, 'Bash', '', '', 9).n).toBe(0)
})

test('recall: SM-2 on two grades, the cards due first, the rate over 30 days', () => {
  const one = reviewed(NEW, true, 0)
  const two = reviewed(one, true, 0)
  const three = reviewed(two, true, 0)
  expect([one.interval, two.interval, three.interval]).toEqual([1, 6, Math.round(6 * two.ef)])
  const lost = reviewed(three, false, 0)
  expect([lost.reps, lost.due, lost.ef < three.ef]).toEqual([0, 10 * 60_000, true])
  const cards = [{ id: 'a', q: 'qa', a: 'aa', src: '' }, { id: 'b', q: 'qb', a: 'ab', src: '' }, { id: 'c', q: 'qc', a: 'ac', src: '' }]
  const deck = { sched: { a: { ...NEW, due: NOW + DAY }, b: { ...NEW, due: NOW - DAY } }, log: [{ at: NOW, id: 'b', knew: true }, { at: NOW, id: 'a', knew: false }, { at: NOW - 40 * DAY, id: 'a', knew: false }] }
  expect(dueCards(deck, cards, NOW).map(c => c.id)).toEqual(['b', 'c']) // a seen card due first (a forgotten one is back in 10 minutes), then the new ones
  expect(recallRate(deck, NOW)).toBe(50)
  expect(recallRate({ sched: {}, log: [] }, NOW)).toBeUndefined()
})

test('durations to the minute, what the last answer asks, text wrapped in two lines', () => {
  expect([minutes(59_999), minutes(4 * 60_000), minutes(72 * 60_000)]).toEqual(['0m', '4m', '1h12'])
  expect(lastAsk('Done: **3 files**.\n\n1. Should I commit?\nThat is all.')).toBe('Should I commit?')
  expect(lastAsk('All green.\n')).toBe('All green.')
  expect(wrap('one two three four five six', 9, 2)).toEqual(['one two', 'three fo…'])
})

test('a card says its sentence whole, on as many lines as it takes: the recall question, the answer and the ask', () => {
  const pack = PACKS[0]
  if (pack === null || pack === undefined) return
  const { palette: P, steps: S } = pack
  const q = 'Your Bash call failed with "command not found" for a tool you installed this morning in a new shell: what do you check before you try it again?'
  const ask = 'Do you want me to push the branch, open the pull request and ask for a review now, or wait until the tests are green on CI?'
  const text = (lines: ReturnType<typeof drawCard>) => lines.map(line => line.map(seg => seg.t).join('')).join(' ').replace(/[│╭╮╰╯─]/g, ' ').replace(/\s+/g, ' ')
  for (const w of [34, 53]) {
    const inner = Math.min(w, 96) - 4
    const recall = text(drawCard(recallCard({ id: 'q', q, a: 'which -a, then the PATH of that shell', src: 't' }, 1, undefined, null, P, inner), P, S, w))
    const back = text(drawCard(backCard(20 * 60_000, `Done.\n${ask}`, null, P, S, inner), P, S, w))
    expect([w, recall.includes(q), recall.includes('…')]).toEqual([w, true, false])
    expect([w, back.includes(ask), back.includes('…')]).toEqual([w, true, false])
  }
  // Short of rows, the question gives up lines, never the keys nor the frame.
  const tight = drawCard(recallCard({ id: 'q', q, a: 'a', src: 't' }, 1, undefined, null, P, 30, 2), P, S, 34)
  expect([tight.length, tight.flat().filter(seg => seg.key !== undefined).length]).toEqual([5, 2])
  // Its keys are the pane's free ones: f and k (1 to 9 and 0 pick a theme, l opens the picker, p pets).
  const keys = drawCard(recallCard({ id: 'q', q, a: 'a', src: 't' }, 1, undefined, null, P, 49), P, S, 53).flat().flatMap(seg => (seg.key === undefined ? [] : [seg.key]))
  expect([...keys, ...clearCard(80, [], true, P).rows.flat().flatMap(seg => (seg.key === undefined ? [] : [seg.key]))]).toEqual(['f', 'k', 'h', 'e'])
})

test('widths are terminal cells: an emoji or a CJK character is two, a joiner none, the theme glyphs one', () => {
  expect([cells('ok'), cells('🎓 ok'), cells('漢字'), cells('★♥▶●'), cells('e\u0301')]).toEqual([2, 5, 4, 4, 1])
  const pack = PACKS[0]
  if (pack === null || pack === undefined) return
  const said = 'Fini.\n🎓 Leçon en préparation → /prof ouvre, et la suite du travail est décrite dans le fichier de passation 漢字'
  for (const w of WIDTHS) for (const line of drawCard(backCard(20 * 60_000, said, null, pack.palette, pack.steps, Math.min(w, 96) - 4), pack.palette, pack.steps, w)) expect([w, width(line)]).toEqual([w, Math.min(w, 96)])
})
