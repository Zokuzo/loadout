import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { wordOf } from '../hooks/register'

const VIEW = { columns: 100, rows: 40 }
const mount = <C extends 'ToolUse' | 'UserMessage' | 'ToolGroup' | 'AssistantMessage' | 'Spinner'>(component: C) =>
  ({ plugin: 'loadout', surface: 'terminal', component, viewport: VIEW }) as const
const call = (tool: string, input: unknown, more: object = {}) => ({
  tool_use_id: 't1', tool, input, isRunning: false, isErrored: false, isInterrupted: false, ...more,
})
const said = (kind: 'composer' | 'task-notification', more: object = {}) => ({
  text: 'hello', origin: { kind }, isExpanded: false, ...more,
})

/** The engine beneath the mod: each row drawn as one Text saying what it was handed. */
function engine(on: On) {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`engine ${e.component} ${JSON.stringify(e.props)}`}</Text>
  })
}

/** The ribbon's marks, as [glyph, hue]: the Texts drawn on a background. */
const marks = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string; props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Text' })).filter(t => t.props.backgroundColor !== undefined).map(t => [t.text, t.props.backgroundColor])

test('a Bash row carries the shell mark and the engine row with its command', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...mount('ToolUse'), props: call('Bash', { command: 'ls -la' }) })
  expect(await marks(ui)).toEqual([['$', 'bashBorder']])
  expect(await ui.find({ type: 'Text', text: /engine ToolUse .*"command":"ls -la"/ })).toBeDefined()
  await ui.unmount()
})

test('an errored call is red whatever its kind; an interrupted one is marked stopped', async ($, on) => {
  engine(on)
  const failed = await $.ui.mount({ ...mount('ToolUse'), props: call('Bash', { command: 'false' }, { isErrored: true }) })
  expect(await marks(failed)).toEqual([['✖', 'error']])
  await failed.unmount()
  const cut = await $.ui.mount({ ...mount('ToolUse'), props: call('Read', { file_path: '/a' }, { isInterrupted: true }) })
  expect(await marks(cut)).toEqual([['■', 'warning']])
  await cut.unmount()
})

test('tools map to their kind; an unknown one falls to other', async ($, on) => {
  engine(on)
  const cases = [
    ['Frobnicate', '•'], ['constructor', '•'], ['Read', '◇'], ['Write', '±'], ['WebFetch', '@'], ['TaskStop', '◈'], ['Skill', '✦'],
    ['AskUserQuestion', '?'], ['mcp__github__list', '◆'], ['mcp__claude-in-chrome__navigate', '@'],
  ] as const
  for (const [tool, glyph] of cases) {
    const ui = await $.ui.mount({ ...mount('ToolUse'), props: call(tool, { anything: [1, null] }) })
    expect((await marks(ui)).map(m => m[0])).toEqual([glyph])
    await ui.unmount()
  }
})

test('user rows: your prompt, a task notification by status, and an expanded row passed through', async ($, on) => {
  engine(on)
  const mine = await $.ui.mount({ ...mount('UserMessage'), props: said('composer') })
  expect(await marks(mine)).toEqual([['❯', 'text']])
  await mine.unmount()
  const failed = await $.ui.mount({ ...mount('UserMessage'), props: said('task-notification', { task: { status: 'failed' } }) })
  expect(await marks(failed)).toEqual([['✖', 'error']])
  await failed.unmount()
  const peer = await $.ui.mount({ ...mount('UserMessage'), props: { text: 'hi', origin: { kind: 'unclassified' }, isExpanded: false, from: { name: 'scout' } } })
  expect(await marks(peer)).toEqual([['◈', 'permission']])
  await peer.unmount()

  const expanded = await $.ui.mount({ ...mount('UserMessage'), props: said('composer', { isExpanded: true }) })
  expect(await marks(expanded)).toEqual([])
  expect(await expanded.find({ type: 'Box' })).toBeUndefined()
  expect(await expanded.find({ type: 'Text', text: /engine UserMessage/ })).toBeDefined()
  await expanded.unmount()
})

test('a folded group shows one mark per kind, red first; Claude gets a bare bar', async ($, on) => {
  engine(on)
  const calls = [call('Read', {}), call('Read', {}), call('Bash', {}), call('Grep', {}, { isErrored: true })]
  const group = await $.ui.mount({ ...mount('ToolGroup'), props: { calls, isActive: false, isExpanded: false } })
  expect(await marks(group)).toEqual([['✖', 'error'], ['◇', 'suggestion'], ['$', 'bashBorder']])
  await group.unmount()
  const open = await $.ui.mount({ ...mount('ToolGroup'), props: { calls, isActive: false, isExpanded: true } })
  expect(await marks(open)).toEqual([])
  await open.unmount()
  const reply = await $.ui.mount({ ...mount('AssistantMessage'), props: { text: '# hi', isFirstOfReply: true } })
  expect(await marks(reply)).toEqual([[' ', 'claude']])
  expect(await reply.find({ type: 'Text', text: /engine AssistantMessage .*"isFirstOfReply":true/ })).toBeDefined()
  await reply.unmount()
})

test('/colors off passes every row through and is kept; on prints the legend', async ($, on) => {
  engine(on)
  const kept = new Map<string, unknown>()
  on('store.get', (_$, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_$, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  const off = await $.command.run({ command: 'colors', args: 'off', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 100 } })
  expect(off.text).toMatch(/Colours off/)
  expect(kept.get('isOn')).toBe(false)
  const plain = await $.ui.mount({ ...mount('ToolUse'), props: call('Bash', { command: 'ls' }) })
  expect(await plain.find({ type: 'Box' })).toBeUndefined()
  expect(await plain.find({ type: 'Text', text: /engine ToolUse/ })).toBeDefined()

  // The toggle redraws the mounted row: $.state, not a reload.
  const back = await $.command.run({ command: 'colors', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 100 } })
  expect(back.text).toMatch(/Colours on\. \$ shell/)
  expect(await marks(plain)).toEqual([['$', 'bashBorder']])
  await plain.unmount()

  const legend = await $.ui.mount({
    plugin: 'loadout', surface: 'terminal', component: 'CommandOutput', viewport: VIEW,
    props: { command: 'colors', args: '', text: back.text ?? '', isErrored: false },
  })
  expect(await legend.find({ type: 'Text', text: /shell {3}Bash, Monitor/ })).toBeDefined()
  await legend.unmount()
})

test('the spinner is marked by mode, and a ribbon around the engine element itself validates', async ($, on) => {
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as const)
  const spin = await $.ui.mount({
    plugin: 'loadout', surface: 'terminal', component: 'Spinner', viewport: VIEW,
    props: { word: 'Baking', message: null, suffix: '…', mode: 'thinking' },
  })
  expect(await marks(spin)).toEqual([['∴', 'claude']])
  await spin.unmount()
  const row = await $.ui.mount({ ...mount('ToolUse'), props: call('Edit', { file_path: '/a' }, { isRunning: true }) })
  expect(await marks(row)).toEqual([['±', 'autoAccept']])
  await row.unmount()
})

test('the working line on a theme without words of its own: the engine\'s word behind the mode\'s mark', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...mount('Spinner'), props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' } })
  expect(await marks(ui)).toEqual([['∴', 'claude']])
  expect(await ui.find({ type: 'Text', text: /engine Spinner .*"word":"Sauteing"/ })).toBeDefined()
  await ui.unmount()
  // A theme's word for the engine's: one of its own, and the same one each time.
  const verbs = ['Inhaling', 'Floating', 'Poyo-ing']
  expect([verbs.includes(wordOf(verbs, 'Sauteing')), wordOf(verbs, 'Sauteing') === wordOf(verbs, 'Sauteing'), wordOf([], 'Sauteing')]).toEqual([true, true, 'Sauteing'])
})
