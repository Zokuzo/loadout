// The bubble map in the pane: where the terminal draws pictures the Flow map is the plan, the map as an image, the keys.
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { answer, engine, HIST, inAgent, lines, pane, solo, spawn, step } from './kit'
import type { Node } from './kit'

type Dollar = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]
type Found = { key: string | undefined; text: string; props: Record<string, unknown> }
type Ui = { drawn: () => Promise<unknown>; press: (q: { key: string }) => Promise<unknown>; findAll: (q: { type: string }) => Promise<Found[]> }
const START = { cwd: '/repo', surface: 'terminal', isInteractive: false } as const
const KITTY = { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1' }
const PLAN = { tool: 'mcp__loadout__steps', tool_use_id: 'plan-1', title: 'Review the auth module', steps: [{ label: 'Map the module', status: 'done' }, { label: 'Review with a workflow', status: 'active' }, { label: 'Write the summary', status: 'pending' }] } as const

/** A session in a terminal that draws pictures (`env`), its cells 9 by 21 pixels, the Flow map mounted. */
const up = async ($: Dollar, on: On, o: { env?: Record<string, string>; columns?: number; rows?: number; blit?: () => { value: { deny?: string } }; probe?: () => string } = {}) => {
  mock.env(on, o.env ?? KITTY)
  on('process.run', () => ({ value: { exitCode: 0, stdout: o.probe?.() ?? '45 209 1881 945', stderr: '' } }) as never)
  on('ui.blit', o.blit ?? (() => ({ value: {} })))
  const kit = engine(on, { hist: HIST })
  kit.world.isUp = true
  await $.session.start(START)
  const ui: Ui = await $.ui.mount(pane(o.columns ?? 94, o.rows ?? 37))

  return { ...kit, ui }
}
const text = async (ui: Ui) => lines((await ui.drawn()) as Node).map(l => l.trimEnd())
const images = async (ui: Ui) => (await ui.findAll({ type: 'Image' })).map(i => i.props as { source: { rgba: string; width: number; height: number }; columns: number; rows: number; alt: string })
/** What the map says, in words: the picture's alt, one line per agent. */
const said = async (ui: Ui) => ((await images(ui))[0]?.alt ?? '').split('\n')

test('where the terminal draws pictures the Flow map is the step plan, then the bubble map as one image, then the keys', async ($, on) => {
  const { ui, clock } = await up($, on)
  await $.tool.call(PLAN)
  await $.agent.spawn(solo('explorer'))
  const reading = inAgent($, 'solo-1', { tool: 'Read', tool_use_id: 'r1', file_path: '/repo/src/auth/token.ts' })
  await clock.advance(500)
  const [image, ...more] = await images(ui)
  expect(more).toEqual([])
  // the picture is the pane's width in device pixels, and a whole number of rows tall
  expect([image!.columns, image!.source.width, image!.source.height]).toEqual([94, 94 * 9, image!.rows * 21])
  expect(image!.source.rgba.length).toBe(4 * Math.ceil((image!.source.width * image!.source.height * 4) / 3))
  const seen = await text(ui)
  // the plan first, folded to a row a step; no text card of the agent; the keys last
  expect(seen.findIndex(l => l.includes('Review with a workflow'))).toBeLessThan(6)
  expect(seen.some(l => /╭─ agents|explorer/.test(l))).toBe(false)
  expect(seen.slice(-2).join(' ')).toMatch(/k: ↑.*j: ↓.*n: narrow.*w: wide.*s: steer.*z: hide/)
  // a picture has no row for the ring to walk and no run to fold: those keys are the text cards'
  expect(seen.slice(-2).join(' ')).not.toMatch(/select|actions|fold/)
  // plan + picture + keys fill the pane exactly: the picture counts for its rows
  expect(seen.length - 1 + image!.rows).toBe(37)
  expect(await said(ui)).toEqual([
    'main session: no call in progress; 0 s · 0 calls · 0 tok',
    'explorer (sonnet): Read auth/token.ts; 0 s · 1 call · 0 tok',
  ])
  await clock.advance(600)
  await reading
  // the call ended: it is the call before, and the agent thinks
  expect((await said(ui))[1]).toBe('explorer (sonnet): thinking; 1 s · 1 call · 0 tok')
})

test('the main session is followed as an agent: its calls in progress and before, its requests, its cache', async ($, on) => {
  const { ui, clock, world } = await up($, on)
  await $.turn.start({ turnId: 't1' } as never)
  expect((await said(ui))[0]).toBe('main session: thinking; 0 s · 0 calls · 0 tok')
  const bash = $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' })
  await clock.advance(1000)
  expect((await said(ui))[0]).toBe('main session: Bash npm test; 0 s · 1 call · 0 tok')
  await clock.advance(4000)
  await bash
  // a request: 100 fresh, 900 read from the cache, 1000 written again for an hour
  world.usage = { model: 'claude-fable-5-2', input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 1000, ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1000 }
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-fable-5-2', messageCount: 1 })) void _
  await $.turn.complete({ reason: 'answer', answer: '' } as never)
  // an agent's turn does not make the main session think
  await $.agent.spawn(solo('explorer'))
  await $.turn.start({ turnId: 't2', agentId: 'solo-1' } as never)
  await clock.advance(2000)
  expect((await said(ui))[0]).toMatch(/^main session \(fable 5\.2\): no call in progress; \d s · 1 call · 2\.0k tok; cache 45% read, expires 59 min$/)
})

test('an agent\'s cache share is its last request\'s, and its cache expires five minutes after it unless the request says an hour', async ($, on) => {
  const { ui, clock, world } = await up($, on)
  await $.agent.spawn(solo('explorer'))
  await step($, 'solo-1')
  await clock.advance(3000)
  expect((await said(ui))[1]).toMatch(/^explorer \(sonnet\): thinking; \d s · 0 calls · 1\.0k tok; cache 90% read, expires 4:5\d$/)
  world.usage = { input_tokens: 0, cache_read_input_tokens: 500, cache_creation_input_tokens: 1500, ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1500 }
  await step($, 'solo-1')
  await clock.advance(2000)
  expect((await said(ui))[1]).toMatch(/2\.0k tok; cache 25% read, expires 59 min$/)
  // a request that only reads keeps the lifetime of the last write
  world.usage = { input_tokens: 0, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 }
  await step($, 'solo-1')
  await clock.advance(2000)
  expect((await said(ui))[1]).toMatch(/cache 100% read, expires 59 min$/)
})

test('an agent whose turn ends while its background work runs is waiting, not finished; it ends when the engine says so', async ($, on) => {
  const { ui, clock, world } = await up($, on)
  await $.agent.spawn(solo('builder'))
  const listed = (status: string) => [{ id: 'solo-1', type: 'general-purpose', description: 'builder', status, provider: { plugin: 'engine', tier: 'core' } }] as never
  world.agents = listed('waiting')
  await answer($, 'solo-1')
  await clock.advance(2000)
  expect((await said(ui))[1]).toMatch(/^builder \(sonnet\), waiting: waiting on background work; \d s · 0 calls · 0 tok$/)
  // it works again: a bubble at work
  const reading = inAgent($, 'solo-1', { tool: 'Read', tool_use_id: 'r1', file_path: '/repo/a.ts' })
  await clock.advance(500)
  expect((await said(ui))[1]).toMatch(/^builder \(sonnet\): Read repo\/a\.ts; \d s · 1 call · 0 tok$/)
  await clock.advance(600)
  await reading
  await answer($, 'solo-1')
  expect((await said(ui))[1]).toContain('builder (sonnet), waiting')
  world.agents = listed('completed')
  await clock.advance(1500)
  expect((await said(ui))[1]).toMatch(/^builder \(sonnet\) finished in \d s$/)
})

test('a run is a zone: its name, its phase, its agents; a run that is over is one line', async ($, on) => {
  const { ui, clock } = await up($, on)
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: "export const meta = { name: 'review-auth', phases: ['Review', 'Verify'] }\nphase('Review')\nawait agent('x', { label: 'review:bugs' })" })
  await $.agent.spawn(spawn(1, 'review:bugs'))
  await clock.advance(1000)
  expect(await said(ui)).toEqual([
    'main session: no call in progress; 1 s · 1 call · 0 tok',
    'run review-auth, phase 1/2 Review',
    'review:bugs (sonnet): thinking; 1 s · 0 calls · 0 tok',
  ])
  await answer($, 'agent-1')
  await $.prompt.submit({ text: '<task-notification><task-id>task-9</task-id><status>completed</status></task-notification>', wait: false, origin: { kind: 'task-notification' } } as never)
  await clock.advance(1000)
  expect((await said(ui)).slice(1)).toEqual(['review-auth finished in 1 s'])
})

test('j and k choose an agent, which the map marks and a steer reaches', async ($, on) => {
  const { ui, clock } = await up($, on)
  await $.agent.spawn(solo('first'))
  await $.agent.spawn(solo('second'))
  await clock.advance(1000)
  expect((await said(ui)).filter(l => l.includes('selected'))).toEqual([])
  await ui.press({ key: 'key:j' })
  expect((await said(ui)).filter(l => l.includes('selected')).map(l => l.split(' ')[0])).toEqual(['first'])
  await ui.press({ key: 'key:j' })
  expect((await said(ui)).filter(l => l.includes('selected')).map(l => l.split(' ')[0])).toEqual(['second'])
  await ui.press({ key: 'key:s' })
  expect((await text(ui)).some(l => /steer second ›/.test(l))).toBe(true)
})

test('the text cards stay wherever the picture cannot be: another terminal, a multiplexer, a short pane, a picture the terminal refuses', async ($, on) => {
  const cards = async (o: Parameters<typeof up>[2]) => {
    const { ui, clock } = await up($, on, o)
    await $.agent.spawn(solo('explorer'))
    await clock.advance(1000)

    return { images: (await images(ui)).length, hasCard: (await text(ui)).some(l => /│ explorer/.test(l)), ui, clock }
  }
  expect(await cards({ env: { TERM: 'xterm-256color' } })).toMatchObject({ images: 0, hasCard: true })
})

test('behind a multiplexer the text cards stay', async ($, on) => {
  const { ui, clock } = await up($, on, { env: { ...KITTY, TMUX: '/tmp/tmux-1000/default,1,0' } })
  await $.agent.spawn(solo('explorer'))
  await clock.advance(1000)
  expect([(await images(ui)).length, (await text(ui)).some(l => /│ explorer/.test(l))]).toEqual([0, true])
})

test('the picture is painted once a second at the most: an agent\'s calls in between change its words at once, its pixels at the next beat', async ($, on) => {
  const { ui, clock } = await up($, on)
  await $.agent.spawn(solo('explorer'))
  await clock.advance(3000)
  // a print of the picture's bytes (a failed comparison of the bytes themselves would print megabytes)
  const pixels = async () => {
    const rgba = (await images(ui))[0]!.source.rgba
    let print = rgba.length
    for (let i = 0; i < rgba.length; i += 89) print = (print * 31 + rgba.charCodeAt(i)) | 0

    return print
  }
  // wait for a painting: the second it opens is the one the calls fall in
  const stale = await pixels()
  for (let i = 0; i < 40 && (await pixels()) === stale; i++) await clock.advance(50)
  const before = await pixels()
  expect(before).not.toBe(stale)
  // five calls in half a second
  const calls: Promise<unknown>[] = []
  for (const what of ['a', 'b', 'c', 'd', 'e']) {
    calls.push(inAgent($, 'solo-1', { tool: 'Read', tool_use_id: what, file_path: `/repo/${what}.ts` }))
    await clock.advance(100)
    expect((await said(ui))[1]).toContain(`Read repo/${what}.ts`)
  }
  expect(await pixels()).toBe(before)
  // the beat after the second has passed paints what is owed, with nothing else to wake the pane
  await clock.advance(1600)
  await Promise.all(calls)
  expect(await pixels()).not.toBe(before)
  expect((await said(ui))[1]).toContain('5 calls')
})

test('seated inline above the prompt the text cards stay: the picture is the dock\'s', async ($, on) => {
  mock.env(on, KITTY)
  const { clock } = engine(on, { hist: HIST })
  await $.session.start(START)
  const inline = { ...pane(94, 37), props: { ...pane(94, 37).props, placement: 'inline' } } as const
  const ui: Ui = await $.ui.mount(inline as never)
  await $.agent.spawn(solo('explorer'))
  await clock.advance(1000)
  expect([(await images(ui)).length, (await text(ui)).some(l => /│ explorer/.test(l))]).toEqual([0, true])
})

test('in a pane too short for the smallest picture the text cards stay', async ($, on) => {
  const { ui, clock } = await up($, on, { rows: 14 })
  await $.agent.spawn(solo('explorer'))
  await clock.advance(1000)
  expect([(await images(ui)).length, (await text(ui)).some(l => /│ explorer/.test(l))]).toEqual([0, true])
})

test('a terminal that draws the picture\'s words in its place gets the text cards back', async ($, on) => {
  const { ui, clock } = await up($, on, { blit: () => ({ value: { deny: 'an Image draws its alt here: a placeholder' } }) })
  await $.agent.spawn(solo('explorer'))
  await clock.advance(1000)
  await clock.advance(1000)
  expect([(await images(ui)).length, (await text(ui)).some(l => /│ explorer/.test(l))]).toEqual([0, true])
})

test('a pane taller than one image may hold is two images, one over the other', async ($, on) => {
  const { ui, clock } = await up($, on, { rows: 60 })
  await $.agent.spawn(solo('explorer'))
  for (const what of ['a', 'b', 'c', 'd', 'e', 'f']) {
    const reading = inAgent($, 'solo-1', { tool: 'Read', tool_use_id: what, file_path: `/repo/${what}.ts` })
    await clock.advance(1100)
    await reading
  }
  const shown = await images(ui)
  shown.forEach(image => expect(image.source.width * image.source.height * 4).toBeLessThanOrEqual(2 * 1024 * 1024))
  expect(shown.map(image => image.source.height)).toEqual(shown.map(image => image.rows * 21))
  expect(shown.map(i => i.alt).slice(1)).toEqual(shown.slice(1).map(() => ' '))
})

test('a cell measured once is kept when a later probe fails: the picture stays at the terminal\'s own pixels', async ($, on) => {
  let probes = 0
  const { ui, clock } = await up($, on, { probe: () => (probes++ === 0 ? '45 209 1881 945' : '') })
  await clock.advance(1000)
  expect((await images(ui)).map(i => [i.source.width, i.source.height / i.rows])).toEqual([[94 * 9, 21]])
  // a pane of another width asks again; the probe answers nothing this time
  await (ui as Ui & { unmount: () => Promise<void> }).unmount()
  const narrow: Ui = await $.ui.mount(pane(80, 37))
  await clock.advance(1000)
  expect(probes).toBeGreaterThan(1)
  expect((await images(narrow)).map(i => [i.source.width, i.source.height / i.rows])).toEqual([[80 * 9, 21]])
})

test('the Flow map asks for 94 columns: the width the bubble map is drawn for', async ($, on) => {
  const { world } = await up($, on)
  await $.command.run({ command: 'flow', args: '' } as never)
  expect(world.opened.filter(c => c !== 56).slice(-1)).toEqual([94])
})
