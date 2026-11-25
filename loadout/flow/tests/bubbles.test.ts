// The bubble map: what is drawn where, for the scene the mock-up fixed and for the ones it did not show.
import { expect, test } from 'claude-code/testing'

import { layout, MODELS, render, sceneOf, shownOf } from '../hooks/bubbles'
import type { Laid, MapScene, Shape } from '../hooks/bubbles'
import { FACES } from '../hooks/atlas'
import { newRun, runView, soloAgent } from '../hooks/lib'
import { rgb } from '../hooks/pixels'
import type { Agent, Run } from '../../types'

const NOW = 10_000_000
const INKS = { ground: rgb('#1b2414'), fg: rgb('#f2f5e6'), dim: rgb('#aebb9f') }
const [MIN, S] = [60_000, 1000]
/** The pane the mock-up was drawn for: 93 columns by 27 rows of 9 x 21 pixels. */
const ROOM = { width: 837, maxHeight: 567, cellHeight: 21 }

const agent = (label: string, model: string, more: Partial<Agent> = {}): Agent => soloAgent({ key: label, id: label, label, model, startedAt: NOW - MIN, ...more })
const ask = (total: number, read: number, left: number, ttlMs = 5 * MIN) => ({ at: NOW - (ttlMs - left), fresh: 0, read: Math.round(total * read), wrote: total - Math.round(total * read), ttlMs })
const call = (tool: string, what: string) => ({ id: `${tool}:${what}`, tool, what, at: NOW - S })
const ended = (tool: string, what: string) => ({ tool, what, ms: 900, failed: false })

const MAIN = agent('main session', 'claude-fable-5-2', {
  key: 'main', startedAt: NOW - 14 * MIN, tools: 23, ask: ask(212_000, 0.94, 52 * MIN, 60 * MIN),
  calls: [call('Workflow', 'review-auth')], log: [ended('Read', 'src/auth/token.ts'), ended('Agent', 'explorer')],
})
const EXPLORER = agent('explorer', 'claude-haiku-5-5', {
  startedAt: NOW - 108 * S, tools: 9, ask: ask(31_200, 0.81, 252 * S),
  calls: [call('Grep', 'verifyToken  src/')], log: [ended('Glob', 'src/**/*.ts'), ended('Read', 'src/auth/token.ts')],
})
const BUGS = agent('review:bugs', 'claude-sonnet-5-5', {
  startedAt: NOW - 185 * S, tools: 14, ask: ask(58_400, 0.88, 211 * S),
  calls: [call('Read', 'src/auth/session.ts')], log: [ended('Read', 'src/auth/token.ts'), ended('Grep', 'refreshToken  src/')],
})
const VERIFY = agent('verify:token.ts', 'claude-opus-5-5', {
  startedAt: NOW - 52 * S, tools: 4, ask: ask(12_900, 0.72, 280 * S),
  calls: [call('Bash', 'npm test -- auth')], log: [ended('Edit', 'src/auth/token.ts'), ended('Read', 'tests/token.spec.ts')],
})
const PERF = agent('review:perf', 'claude-sonnet-5-5', { status: 'done', startedAt: NOW - 200 * S, endedAt: NOW - 70 * S })
const STYLE = agent('review:style', 'claude-haiku-5-5', { status: 'failed', startedAt: NOW - 190 * S, endedAt: NOW - 142 * S })
const RUN: Run = { ...newRun({ callId: 'c1', name: 'review-auth', phases: ['Review', 'Verify'], startedAt: NOW - 201 * S }), id: 'wf_1', taskId: 't1', spawned: 7, agents: [{ ...PERF, phase: 0 }, { ...STYLE, phase: 0 }, { ...BUGS, phase: 1 }, { ...VERIFY, phase: 1 }] }

const scene = (solo: Agent[] = [EXPLORER], runs: Run[] = [RUN], sel = ''): MapScene => sceneOf({ main: MAIN, isWorking: true, solo, runs: runs.map(r => runView(r, NOW, {})), now: NOW, sel })

const of = <K extends Shape['kind']>(laid: Laid, kind: K) => laid.shapes.filter((s): s is Extract<Shape, { kind: K }> => s.kind === kind)
const texts = (laid: Laid) => of(laid, 'text').map(t => t.text)
const boxOf = (t: Extract<Shape, { kind: 'text' }>) => ({ x0: t.x, y0: t.y, x1: t.x + [...t.text].length * FACES[t.face]!.pitch, y1: t.y + FACES[t.face]!.height, text: t.text })
/** The filled boxes of a width: the bubbles (258), or the main session's. */
const filled = (laid: Laid, w: number) => of(laid, 'rrect').filter(r => r.w === w && r.fill !== undefined)

/** What every picture must hold to: nothing leaves it, no two texts share a pixel, each arrow is straight and numbered once. */
function sound(laid: Laid, room = ROOM) {
  expect(laid.width).toBe(room.width)
  expect(laid.height % room.cellHeight).toBe(0)
  expect(laid.height).toBeLessThanOrEqual(room.maxHeight)
  const boxes = of(laid, 'text').map(boxOf)
  boxes.forEach((a, i) => {
    if (a.x0 < 4 || a.y0 < 4 || a.x1 > laid.width - 4 || a.y1 > laid.height - 4) throw new Error(`"${a.text}" leaves the picture: ${JSON.stringify(a)} in ${laid.width}x${laid.height}`)
    boxes.slice(i + 1).forEach(b => {
      if (!(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0)) throw new Error(`"${a.text}" and "${b.text}" overlap`)
    })
  })
  of(laid, 'rrect').forEach(r => {
    if (r.x < 0 || r.y < 0 || r.x + r.w > laid.width || r.y + r.h > laid.height) throw new Error(`a box leaves the picture: ${JSON.stringify(r)}`)
  })
  const numbered = of(laid, 'arrow').filter(a => a.number !== undefined)
  numbered.forEach(a => expect(a.x1).toBe(a.x2))
  // an arrow leaves from under the main session (the first filled box), clear of its corners, and runs through no text
  const main = of(laid, 'rrect').find(r => r.fill !== undefined)!
  numbered.forEach(a => {
    if (a.x1 < main.x + 12 || a.x1 > main.x + main.w - 12) throw new Error(`arrow ${a.number} at ${a.x1} is not under the main session (${main.x}..${main.x + main.w})`)
    const [top, bottom] = [Math.min(a.y1, a.y2), Math.max(a.y1, a.y2)]
    boxes.forEach(b => {
      if (a.x1 >= b.x0 - 3 && a.x1 <= b.x1 + 3 && top < b.y1 && bottom > b.y0) throw new Error(`arrow ${a.number} at ${a.x1} runs through "${b.text}"`)
    })
  })
  expect(numbered.map(a => a.number).sort((a, b) => a! - b!)).toEqual(numbered.map((_, i) => i + 1))
  // two numbers never share a disc's room
  const xs = numbered.map(a => a.x1).sort((a, b) => a - b)
  xs.slice(1).forEach((x, i) => expect(x - xs[i]!).toBeGreaterThanOrEqual(20))
}

test('a scene words each agent: its model, its calls, its time, its tokens, its cache share and expiry', () => {
  const { main, groups } = scene()
  expect(main).toMatchObject({
    name: 'main session', model: 'fable', label: 'fable 5.2', now: { verb: 'Workflow', target: 'review-auth' }, before: ['Agent explorer', 'Read src/auth/token.ts'],
    elapsed: '14 min', calls: 23, tokens: '212k', read: 0.94, expiry: 'expires 52 min', isDashed: false,
  })
  expect(groups.map(g => [g.run?.name, g.run?.phase, g.running.map(b => b.name), g.finished.map(c => c.name), g.gone])).toEqual([
    [undefined, undefined, ['explorer'], [], 0],
    ['review-auth', 'phase 2/2 Verify', ['review:bugs', 'verify:token.ts'], ['review:perf', 'review:style'], 3],
  ])
  expect(groups[0]!.running[0]).toMatchObject({ model: 'haiku', label: 'haiku 5.5', elapsed: '1 min 48', calls: 9, tokens: '31.2k', read: 0.81, expiry: 'expires 4:12' })
  expect(groups[1]!.finished).toMatchObject([{ sign: 'done', took: '2 min 10', model: 'sonnet' }, { sign: 'failed', took: '48 s', model: 'haiku' }])
})

test('an agent with no request yet, one that waits, one whose cache is gone and one of an unknown model are each said as they are', () => {
  const fresh = agent('fresh', '', { status: 'queued' })
  const waiting = agent('waiter', 'claude-opus-5-5', { waiting: true, ask: ask(1000, 0.5, -3 * S) })
  const odd = agent('odd', 'gpt-oss-120b', { startedAt: NOW - 62 * MIN, ask: ask(1_250_000, 1, 9 * MIN + 59 * S, 60 * MIN) })
  const [a, b, c] = ['fresh', 'waiter', 'odd'].map(name => scene([fresh, waiting, odd], []).groups[0]!.running.find(x => x.name === name))
  expect(a).toMatchObject({ model: 'other', label: '', now: null, idle: 'starting', tokens: '0', read: null, expiry: '', isDashed: true })
  expect(b).toMatchObject({ idle: 'waiting on background work', expiry: 'expired', isDashed: true, read: 0.5 })
  expect(c).toMatchObject({ model: 'other', label: 'gpt-oss-120b', idle: 'thinking', elapsed: '1 h 02', tokens: '1.25M', expiry: 'expires 9:59', isDashed: false })
})

test('counts read well at the edges of their units, and an agent at work comes before one only asked for', () => {
  const sized = (total: number) => scene([agent('a', '', { ask: ask(total, 1, MIN) })], []).groups[0]!.running[0]!.tokens
  expect([999, 1000, 99_949, 99_960, 999_400, 999_600].map(sized)).toEqual(['999', '1.0k', '99.9k', '100k', '999k', '1.00M'])
  // asked first, not started yet: it does not take the bubble of one that works
  const asked = agent('asked', '', { status: 'queued', startedAt: NOW - 50 * S })
  const working = agent('working', '', { startedAt: NOW - 20 * S })
  expect(scene([asked, working], []).groups[0]!.running.map(b => b.name)).toEqual(['working', 'asked'])
})

test('a run that is over is one chip among the plain subagents, and the selected agent is marked', () => {
  const over: Run = { ...RUN, endedAt: NOW - 5 * S, outcome: 'completed' }
  const { groups } = scene([EXPLORER], [over], 'ag:solo:explorer')
  expect(groups.length).toBe(1)
  expect(groups[0]!.finished).toMatchObject([{ name: 'review-auth', sign: 'done', took: '3 min 16', model: 'other' }])
  expect(groups[0]!.running[0]!.isSelected).toBe(true)
  expect(scene([EXPLORER], [{ ...over, outcome: 'killed' }]).groups[0]!.finished[0]!.sign).toBe('failed')
})

test('the mock-up scene is laid out as the mock-up drew it', () => {
  const laid = layout(scene(), ROOM, INKS)!
  sound(laid)
  expect(laid.height).toBe(567)
  expect(filled(laid, 600).map(r => [r.x, r.y, r.h, r.fill, r.outline])).toEqual([[118, 8, 108, ...MODELS.fable]])
  expect(filled(laid, 258).map(r => [r.x, r.y, r.h, r.fill])).toEqual([[10, 276, 196, MODELS.haiku[0]], [289, 276, 196, MODELS.sonnet[0]], [559, 276, 196, MODELS.opus[0]]])
  expect(laid.order).toEqual(['ag:solo:explorer', 'ag:c1:review:bugs', 'ag:c1:verify:token.ts'])
  // the run zone: a dashed frame round its two bubbles, its name and its phase
  const zone = of(laid, 'rrect').find(r => r.fill === undefined && r.w > 300)!
  expect([zone.x, zone.y, zone.w, zone.h, zone.dash]).toEqual([279, 168, 548, 315, [7, 5]])
  expect(of(laid, 'text').filter(t => t.y > 150 && (t.text === 'review-auth' || t.text === 'phase 2/2 Verify')).map(t => [t.x, t.y, t.face])).toEqual([[291, 177, '8b'], [291, 196, '7b']])
  // two chips over the bubbles, then what has no chip
  const chips = of(laid, 'rrect').filter(r => r.h === 28)
  expect(chips.map(r => [r.x, r.y, r.w, r.dash !== undefined])).toEqual([[289, 222, 177, true], [500, 222, 156, true], [722, 222, 95, true]])
  expect(texts(laid)).toContain('+3 finished')
  // seven arrows, numbered as things happened, each number on the line between the session and the row
  const arrows = of(laid, 'arrow').filter(a => a.number !== undefined).sort((a, b) => a.number! - b.number!)
  expect(arrows.map(a => [a.number, a.dash === undefined ? 'launch' : 'reply', a.x1])).toEqual([
    [1, 'launch', 424], [2, 'launch', 614], [3, 'launch', 483], [4, 'reply', 640], [5, 'launch', 139], [6, 'reply', 450], [7, 'launch', 688],
  ])
  arrows.forEach(a => {
    expect(a.numberAt).toBe(142)
    expect(a.x1).toBeGreaterThan(118 + 12)
    expect(a.x1).toBeLessThan(718 - 12)
    // a launch goes down from the session, a reply comes back up to it
    expect([a.y1 < a.y2, Math.min(a.y1, a.y2)]).toEqual([a.dash === undefined, 117])
  })
  expect(arrows.filter(a => a.dash === undefined).map(a => a.y2).sort()).toEqual([221, 221, 275, 275, 275])
  // a bubble's rows, top to bottom
  const inExplorer = of(laid, 'text').filter(t => t.x >= 10 && t.x < 268 && t.y >= 276 && t.y < 472).map(t => [t.text, t.face])
  expect(inExplorer).toEqual([
    ['explorer', '9b'], ['haiku 5.5', '7b'], ['Grep', '8b'], ['verifyToken  src/', '8b'], ['Read src/auth/token.ts', '7'], ['Glob src/**/*.ts', '7'],
    ['1 min 48 · 9 calls · 31.2k tok', '7'], ['cache', '7b'], ['expires 4:12', '7'], ['81% read', '7'], ['19% rewritten', '7'],
  ])
  expect(of(laid, 'bar').map(b => Math.round(b.share * 100))).toEqual([94, 81, 88, 72])
  // the legend: always there, on one line
  const legend = of(laid, 'text').filter(t => ['fable', 'opus', 'sonnet', 'haiku', 'launches', 'replies', 'waiting or finished'].includes(t.text))
  expect(legend.map(t => t.text)).toEqual(['fable', 'opus', 'sonnet', 'haiku', 'launches', 'replies', 'waiting or finished'])
  expect(new Set(legend.map(t => t.y))).toEqual(new Set([520]))
})

test('with nobody but the main session the picture is the session and the legend, and takes only the rows it needs', () => {
  const laid = layout(scene([], []), ROOM, INKS)!
  sound(laid)
  expect(laid.height).toBeLessThan(200)
  expect(laid.order).toEqual([])
  expect(of(laid, 'arrow').filter(a => a.number !== undefined)).toEqual([])
  expect(texts(laid)).toContain('waiting or finished')
})

test('a single agent sits under the middle of the session', () => {
  const laid = layout(scene([EXPLORER], []), ROOM, INKS)!
  sound(laid)
  const [bubble] = filled(laid, 258)
  expect(bubble!.x + 129).toBeGreaterThanOrEqual(418)
  expect(bubble!.x + 129).toBeLessThanOrEqual(419)
  // no zone, no chip: the bubble comes right under the arrows
  expect(bubble!.y).toBe(168)
})

test('more agents at work than bubbles fit: the first launched keep a bubble, the selected one too, the others are chips', () => {
  const five = ['a1', 'a2', 'a3', 'a4', 'a5'].map((name, i) => agent(name, 'claude-sonnet-5-5', { startedAt: NOW - (50 - i) * S }))
  const laid = layout(scene(five, []), ROOM, INKS)!
  sound(laid)
  expect(laid.order).toEqual(['ag:solo:a1', 'ag:solo:a2', 'ag:solo:a3'])
  // the two without a bubble: a chip each, with a full outline (it still runs) and one arrow, its launch
  const chips = of(laid, 'rrect').filter(r => r.h === 28)
  expect(chips.map(r => r.dash)).toEqual([undefined, undefined])
  expect(of(laid, 'arrow').filter(a => a.number !== undefined && a.dash !== undefined)).toEqual([])
  expect(of(laid, 'arrow').filter(a => a.number !== undefined).length).toBe(5)

  const chosen = layout(scene(five, [], 'ag:solo:a5'), ROOM, INKS)!
  sound(chosen)
  expect(chosen.order).toEqual(['ag:solo:a1', 'ag:solo:a2', 'ag:solo:a5'])
  expect(filled(chosen, 258).map(r => r.width ?? 2)).toEqual([2, 2, 4])
})

test('what has no room is counted: finished agents past the chip row, and the agents of a run with no zone', () => {
  const many = Array.from({ length: 30 }, (_, i) => agent(`done-${i}`, 'claude-haiku-5-5', { status: 'done', startedAt: NOW - (400 - i) * S, endedAt: NOW - (300 - i) * S }))
  const crowded: Run = { ...RUN, agents: [...many, BUGS], spawned: 40 }
  const laid = layout(scene([], [crowded]), ROOM, INKS)!
  sound(laid)
  const shown = texts(laid).filter(t => t.startsWith('done-'))
  // the latest finished are the ones kept
  expect(shown.length).toBeGreaterThan(0)
  expect(shown).toContain('done-29')
  expect(texts(laid)).toContain(`+${9 + 30 - shown.length} finished`)

  // four live runs in the widest pane: two zones have room, the agents of the two others are counted in the last
  const runs = ['r1', 'r2', 'r3', 'r4'].map((name, i): Run => ({ ...RUN, callId: name, id: name, name, startedAt: NOW - (90 - i) * S, spawned: 1, agents: [{ ...BUGS, key: `${name}-a` }] }))
  const four = layout(scene([], runs), { ...ROOM, width: 864 }, INKS)!
  sound(four, { ...ROOM, width: 864 })
  expect(of(four, 'rrect').filter(r => r.fill === undefined && r.h > 100).length).toBe(2)
  expect(texts(four)).toContain('+2 more')
})

test('a group with no room is not shown, and no key reaches its agents', () => {
  const second: Run = { ...RUN, callId: 'c2', id: 'wf_2', name: 'second', agents: [{ ...BUGS, key: 'late' }], spawned: 1 }
  const crowded = scene([EXPLORER], [RUN, second])
  // 258 + 11 + 278 + 11 + 278 is one pixel too many for 817
  expect(shownOf(crowded, 837).map(g => g.run?.name)).toEqual([undefined, 'review-auth'])
  const laid = layout(crowded, ROOM, INKS)!
  sound(laid)
  expect(laid.order.some(key => key.includes('late'))).toBe(false)
  expect(texts(laid)).toContain('+4 more')
  expect(shownOf(crowded, 306).length).toBe(1)
})

test('in a pane wider than the main session can reach, the row stops where its outer bubbles still have a lane under it', () => {
  const four = ['a1', 'a2', 'a3', 'a4', 'a5'].map((name, i) => agent(name, 'claude-sonnet-5-5', { startedAt: NOW - (50 - i) * S }))
  const done = agent('done', 'claude-haiku-5-5', { status: 'done', startedAt: NOW - 90 * S, endedAt: NOW - 60 * S })
  for (const width of [1052, 1100, 1152, 1248]) {
    const room = { ...ROOM, width }
    const laid = layout(scene([...four, done], []), room, INKS)!
    sound(laid, room)
    // the finished agent keeps its chip, and each bubble's arrow lands on it, 16 pixels from its sides at least
    expect(texts(laid)).toContain('done')
    const down = of(laid, 'arrow').filter(a => a.number !== undefined)
    const lanes = down.filter(a => a.y2 === Math.max(...down.map(d => d.y2))).map(a => a.x1).sort((a, b) => a - b)
    expect(filled(laid, 258).map((r, i) => lanes[i]! >= r.x + 16 && lanes[i]! <= r.x + 258 - 16)).toEqual(filled(laid, 258).map(() => true))
  }
})

test('a bubble lists as many calls before as its agents have, up to five, and fewer when the pane is short; the legend stays', () => {
  const busy = { ...EXPLORER, log: ['a', 'b', 'c', 'd', 'e'].map(what => ended('Read', what)) }
  const tall = layout(scene([busy], []), { ...ROOM, maxHeight: 40 * 21 }, INKS)!
  sound(tall, { ...ROOM, maxHeight: 40 * 21 })
  expect(texts(tall).filter(t => /^Read [a-e]$/.test(t))).toEqual(['Read e', 'Read d', 'Read c', 'Read b', 'Read a'])
  expect(filled(tall, 258)[0]!.h).toBe(196 + 3 * 17)

  const short = layout(scene([busy], []), { ...ROOM, maxHeight: 17 * 21 }, INKS)!
  sound(short, { ...ROOM, maxHeight: 17 * 21 })
  expect(texts(short).filter(t => /^Read [a-e]$/.test(t)).length).toBeLessThan(5)
  expect(texts(short)).toContain('waiting or finished')
  // a pane too short for the smallest picture gets none: the text cards take over
  expect(layout(scene([busy], []), { ...ROOM, maxHeight: 10 * 21 }, INKS)).toBe(null)
  expect(layout(scene(), { ...ROOM, width: 200 }, INKS)).toBe(null)
})

test('one row short of the mock-up, the same scene closes up its spacing before it drops a line', () => {
  const laid = layout(scene(), { ...ROOM, maxHeight: 546 }, INKS)!
  sound(laid, { ...ROOM, maxHeight: 546 })
  expect(filled(laid, 258).map(r => r.h)).toEqual([196, 196, 196])
  expect(texts(laid)).toContain('Glob src/**/*.ts')
})

test('a waiting agent is drawn dashed, and long words are cut to their box', () => {
  const long = agent('a-very-long-agent-name-that-cannot-fit', 'claude-sonnet-5-5', { waiting: true, calls: [call('mcp__server__a_tool_with_a_long_name', 'and a target that goes on and on and on')], log: [ended('Read', 'x'.repeat(80))] })
  const laid = layout(scene([long], []), ROOM, INKS)!
  sound(laid)
  expect(filled(laid, 258)[0]!.dash).toEqual([5, 3])
  expect(texts(laid).filter(t => t.endsWith('…')).length).toBeGreaterThanOrEqual(3)
})

test('every scene, at every width and height a pane may have, is sound or has no picture', () => {
  const finished = (n: number) => Array.from({ length: n }, (_, i) => agent(`f${i}-${'x'.repeat(i % 9)}`, 'claude-haiku-5-5', { status: i % 3 === 0 ? 'failed' : 'done', startedAt: NOW - (500 - i) * S, endedAt: NOW - (200 - i * 3) * S }))
  const running = (n: number) => Array.from({ length: n }, (_, i) => agent(`r${i}`, ['claude-opus-5-5', 'claude-sonnet-5-5', '', 'claude-fable-5-2'][i % 4]!, { startedAt: NOW - (100 - i) * S, calls: i % 2 === 0 ? [call('Bash', 'npm test')] : [], log: [ended('Read', 'a.ts'), ended('Edit', 'b.ts'), ended('Bash', 'ls')].slice(0, i % 4) }))
  const run = (name: string, agents: Agent[], spawned = agents.length): Run => ({ ...RUN, callId: name, id: name, name, agents: agents.map(a => ({ ...a, key: `${name}:${a.key}` })), spawned })
  const scenes: MapScene[] = [
    scene([], []), scene(), scene(running(1), []), scene(running(6), []), scene(finished(4), []), scene([...running(2), ...finished(9)], []),
    scene([], [run('alpha', [...finished(12), ...running(5)], 40)]), scene(running(2), [run('alpha', running(3)), run('beta-with-a-very-long-run-name-indeed', finished(3))]),
    scene(finished(2), [run('a', []), run('b', finished(1)), run('c', running(4)), run('d', running(1))]),
    scene([], [{ ...run('over', finished(3)), endedAt: NOW - S, outcome: 'completed' }]),
  ]
  let drawn = 0
  for (const [i, one] of scenes.entries()) {
    for (let columns = 24; columns <= 96; columns += 3) {
      for (const rows of [8, 14, 19, 23, 26, 27, 31, 40]) {
        for (const cell of [{ w: 9, h: 21 }, { w: 10, h: 20 }, { w: 7, h: 15 }, { w: 13, h: 28 }]) {
          const room = { width: columns * cell.w, maxHeight: rows * cell.h, cellHeight: cell.h }
          const laid = layout(one, room, INKS)
          if (laid === null) continue
          drawn += 1
          try {
            sound(laid, room)
          } catch (err) {
            throw new Error(`scene ${i} at ${columns}x${rows} of ${cell.w}x${cell.h}: ${String(err)}`)
          }
        }
      }
    }
  }
  expect(drawn).toBeGreaterThan(1000)
})

test('the picture is the shapes drawn: a bubble in its model colour on the ground of the theme', () => {
  const laid = layout(scene(), ROOM, INKS)!
  const p = render(laid, INKS.ground)
  const at = (x: number, y: number) => (p.data[(y * p.width + x) * 4]! << 16) | (p.data[(y * p.width + x) * 4 + 1]! << 8) | p.data[(y * p.width + x) * 4 + 2]!
  expect([p.width, p.height]).toEqual([837, 567])
  expect(at(4, 4)).toBe(INKS.ground)
  expect(at(140, 300)).toBe(MODELS.haiku[0])
  expect(at(10, 380)).toBe(MODELS.haiku[1])
  expect(at(700, 20)).toBe(MODELS.fable[0])
  // the bar of the explorer's cache: read on the left, rewritten on the right
  expect(at(60, 435)).toBe(MODELS.haiku[1])
  expect(at(250, 435)).toBe(MODELS.haiku[0])
})
