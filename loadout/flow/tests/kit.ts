// What the tests read off a drawn tree: its lines as text, and as styled runs for the previews.
import { mock } from 'claude-code/testing'
import type { AgentInfo, ConfigRow } from 'claude-code'
import type { TestBody } from 'claude-code/testing'

import type { Palette } from '../hooks/palette'
import { PACK_TEXT } from './packs'

export const SLUGS = ['default', 'kirby', 'kirby-pink', 'ghostrunner', 'cyberpunk-edgerunners', 'initial-d', 'y2k', 'y2k-dark'] as const
export type Slug = typeof SLUGS[number]
/** A pack's palette as its file gives it. packs.ts is a generated copy of ../../themes/*.json (a test can read no file outside the mod). */
export const paletteIn = (slug: Slug): Palette => (JSON.parse(PACK_TEXT[slug] ?? '{}') as { flow: { palette: Palette } }).flow.palette
/** The themes folder as files: every pack, and the schema, which is not one. */
export const packFiles = (): Record<string, string> => ({ ...Object.fromEntries(Object.entries(PACK_TEXT).map(([slug, text]) => [`${slug}.json`, text])), 'schema.json': '{}' })

export type Node = string | { type: string; props?: Record<string, unknown>; children?: Node[] }
export type Run = { t: string; c?: string; bg?: string; b?: boolean; x?: boolean; kind?: 'button' | 'hotkey' | 'input' }

const kids = (n: Node): Node[] => (typeof n === 'string' ? [] : n.children ?? [])
const text = (n: Node): string => (typeof n === 'string' ? n : kids(n).map(text).join(''))

/** One line of the tree as styled runs: a Button as the terminal draws a plain one ("k: label", or the label alone). */
function runsOf(n: Node, bg: string | undefined): Run[] {
  if (typeof n === 'string') return [{ t: n }]
  const p = n.props ?? {}
  const back = typeof p.backgroundColor === 'string' ? p.backgroundColor : bg
  if (n.type === 'Text') {
    return kids(n).flatMap((k): Run[] => (typeof k === 'string'
      ? [{ t: k, ...(typeof p.color === 'string' ? { c: p.color } : {}), ...(back === undefined ? {} : { bg: back }), ...(p.bold === true ? { b: true } : {}), ...(p.strikethrough === true ? { x: true } : {}) }]
      : runsOf(k, back)))
  }
  if (n.type === 'Button') {
    const label = typeof p.label === 'string' ? p.label : text(n)
    return [...(typeof p.hotkey === 'string' ? [{ t: `${p.hotkey}: `, kind: 'hotkey' as const, ...(back === undefined ? {} : { bg: back }) }] : []), { t: label, kind: 'button' as const, ...(back === undefined ? {} : { bg: back }), ...(p.dimColor === true ? { c: 'dim' } : {}) }]
  }
  if (n.type === 'Input') return [{ t: `${typeof p.placeholder === 'string' ? p.placeholder : ''}▌`, kind: 'input', ...(back === undefined ? {} : { bg: back }) }]
  const inner = kids(n).flatMap(k => runsOf(k, back))
  const used = inner.reduce((sum, r) => sum + r.t.length, 0)
  const width = typeof p.width === 'number' ? p.width : used
  return width > used ? [...inner, { t: ' '.repeat(width - used), ...(back === undefined ? {} : { bg: back }) }] : inner
}

/** The drawn pane or band as lines of styled runs: the root's children, top to bottom. */
export const paint = (root: Node): Run[][] => {
  const bg = typeof root === 'string' ? undefined : (root.props?.backgroundColor as string | undefined)
  return kids(root).flatMap(k => (typeof k !== 'string' && k.type === 'Box' && k.props?.flexDirection === 'column' ? paint(k) : [runsOf(k, bg)]))
}
export const lines = (root: Node): string[] => paint(root).map(line => line.map(r => r.t).join(''))

export const SCRIPT = `export const meta = {
  name: 'ship-it',
  description: 'demo',
  phases: [{ title: 'Scan' }, { title: 'Review' }],
}
phase('Scan')
await parallel([() => agent('scan the repo for dead code and report', { label: 'scan the repo' }), () => agent('review the auth module', { label: 'review auth' })])
phase('Review')
await agent('write the report from the findings', { label: 'write the report' })`

export const pane = (bodyColumns = 56, bodyRows = 60, isFocused = true) => ({
  plugin: 'loadout', surface: 'terminal', component: 'Pane', requestId: 'flow-map',
  props: { title: 'Flow map', isFocused, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
}) as const

export const spawn = (agentIndex: number, description: string, prompt = 'p', runId = 'wf_1') => ({
  tool_use_id: 'call-1', prompt, description, subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' }, parentModel: 'opus', background: true, fork: false,
  workflow: { runId, agentIndex },
}) as const

export const USAGE = { model: 'sonnet', input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 }
export const notify = (status: string, task = 'task-9') =>
  ({ text: `<task-notification><task-id>${task}</task-id><status>${status}</status></task-notification>`, wait: false, origin: { kind: 'task-notification' } }) as const

/** The engine beneath the mod: a clock the test moves, a Workflow tool that launches, tools that take time, and what the pane's keys reach. */
export const engine = (on: Parameters<TestBody>[1], init: { theme?: string; hist?: Record<string, [number, number]>; files?: Record<string, string>; disk?: Record<string, string> } = {}) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  // `files` is the themes folder beside the mod (absent: no folder, so the built-in palettes draw) and `disk` any other file, by
  // absolute path, under the working directory /repo; `agents` is what $.agent.list() names; a plain subagent that starts is
  // "solo-1", "solo-2"... `deny` refuses the next one, `noId` starts it with no id,
  // and a promise under -1 in `held` keeps it from starting.
  const world = { files: init.files, disk: init.disk ?? {}, stamp: 1, agents: [] as AgentInfo[], solos: 0, deny: '', noId: false, isRefused: false, sent: [] as { to: string; text: string }[], stopped: [] as string[], focused: [] as string[], closed: 0, opened: [] as (number | undefined)[], store: { hist: init.hist ?? {} } as Record<string, unknown>, toasts: [] as string[], stepOut: 0, isUp: false, theme: init.theme ?? 'dark', isDelivered: true, held: new Map<number, Promise<void>>() }
  // Every tool beneath the mod, in one hook: Workflow launches, TaskStop stops, an Edit of float.ts fails after 2s,
  // Bash takes 5s, Read 1s, and any other tool 30s: long enough to be seen running.
  on('tool.call', async (_, e) => {
    const input: Record<string, unknown> = e
    const tool = String(e.tool)
    if (tool === 'Workflow') {
      const name = String(input.script ?? '').match(/name: '([^']+)'/)?.[1] ?? 'ship-it'
      return { result: (world.isRefused ? { error: 'no such run' } : { status: 'async_launched', taskId: 'task-9', runId: 'wf_1', workflowName: name }) as never }
    }
    if (tool === 'Skill') return { result: {} as never }
    if (tool === 'TaskStop') {
      world.stopped.push(String(input.task_id))
      return { result: { message: 'stopped', task_id: String(input.task_id), task_type: 'local_workflow' } as never }
    }
    const isBad = tool === 'Edit' && String(input.file_path).endsWith('float.ts')
    await clock.sleep(tool === 'Bash' ? 5_000 : tool === 'Read' ? 1_000 : isBad ? 2_000 : 30_000)
    return isBad ? { result: {} as never, isError: true } : { result: {} as never }
  })
  // An agent whose index is in world.held does not start until that promise settles: it stays queued.
  on('agent.spawn', (_, e) => {
    if (e.workflow === undefined && world.deny !== '') return { deny: world.deny }
    if (e.workflow === undefined && world.noId) return { model: 'sonnet' }
    const started = { model: 'sonnet', agentId: e.workflow === undefined ? `solo-${++world.solos}` : `agent-${e.workflow.agentIndex}` }
    const gate = world.held.get(e.workflow?.agentIndex ?? -1)
    return gate === undefined ? started : gate.then(() => started)
  })
  on('turn.complete', () => ({ text: '' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('agent.list', () => ({ value: world.agents }))
  on('fs.list', (_, e) => {
    if (e.path.endsWith('/themes')) {
      return world.files === undefined ? { deny: 'ENOENT' } : { value: Object.entries(world.files).map(([name, text]) => ({ name, kind: 'file' as const, size: text.length, mtimeMs: world.stamp, isLink: false })) }
    }
    const under = Object.keys(world.disk).filter(path => path.startsWith(`${e.path}/`))
    if (under.length === 0) return { deny: 'ENOENT' }
    return { value: [...new Set(under.map(path => path.slice(e.path.length + 1).split('/')[0] ?? ''))].map(name => {
      const text = world.disk[`${e.path}/${name}`]
      return text === undefined ? { name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false } : { name, kind: 'file' as const, size: text.length, mtimeMs: world.stamp, isLink: false }
    }) }
  })
  on('fs.read', (_, e) => {
    const text = e.path.includes('/themes/') ? world.files?.[e.path.split('/').pop() ?? ''] : world.disk[e.path]
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.exists', (_, e) => ({ value: e.path === '/repo/.git' || e.path in world.disk }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('prompt.submit', (_, e) => e)
  on('classic.Stop', () => ({}))
  on('session.send', (_, e) => {
    world.sent.push({ to: e.to, text: e.text })
    return world.isDelivered ? { isDelivered: true as const } : { isDelivered: false as const, reason: 'the recipient is gone' }
  })
  on('ui.focus', (_, e) => {
    world.focused.push(e.element ?? '')
    return {}
  })
  on('ui.close', () => {
    world.closed++
    return { value: undefined }
  })
  on('ui.open', (_, e) => {
    world.opened.push(e.columns)
    return { value: { isPlaced: true as const } }
  })
  // (The Avatar pane of the same plugin is always up here: its line of meters then leaves the band above the prompt to the others.)
  const AVATAR = { id: 'kirby', title: 'Avatar', isShown: true, isFocused: false, isPlaced: true }
  on('ui.panes', () => ({ value: world.isUp ? [AVATAR, { id: 'flow-map', title: 'Flow map', isShown: true, isFocused: false, isPlaced: true }] : [AVATAR] }))
  on('ui.toast', (_, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__loadout__${e.name}` } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use' as const, usage: { ...USAGE, output_tokens: world.stepOut } }
  })
  on('store.get', (_, e) => ({ value: world.store[e.key] }))
  on('store.set', (_, e) => {
    world.store[e.key] = e.value
    return { value: undefined }
  })
  on('config.list', () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: world.theme, provider: { plugin: 'engine', tier: 'core' } }] as ConfigRow[] }))

  return { clock, world }
}

type Dollar = Parameters<TestBody>[0]

// The handoff's own run: review, polish, review, polish, ship, the two rounds written as one loop.
export const ROUNDS = `export const meta = {
  name: 'kirby-polish',
  description: 'review, then polish, twice, then ship',
  phases: [{ title: 'review' }, { title: 'polish' }, { title: 'review' }, { title: 'polish' }, { title: 'ship' }],
}
for (const round of [1, 2]) {
  phase('review')
  await parallel([
    () => agent(\`Review the code of round \${round}\`, { label: \`code-review:round-\${round}\` }),
    () => agent(\`Review the art of round \${round}\`, { label: \`art-director:round-\${round}\` }),
  ])
  phase('polish')
  await parallel([
    () => agent(\`Polish the build of round \${round}\`, { label: \`polish:round-\${round}\` }),
    () => agent(\`Polish the sprites of round \${round}\`, { label: \`sprites:round-\${round}\` }),
  ])
}
phase('ship')
await agent('Check that the build ships', { label: 'ship-check' })`

const MIN = 60_000
/** What earlier runs taught: 22m10s for a polish agent, 12m for a sprites one, 7m and 5m40s and 3m for the phases. */
export const HIST: Record<string, [number, number]> = {
  'a:code-review:round-#': [2, 14 * MIN], 'a:art-director:round-#': [1, 258_000], 'a:polish:round-#': [1, 1_330_000], 'a:sprites:round-#': [1, 12 * MIN],
  'p:kirby-polish/review': [1, 7 * MIN], 'p:kirby-polish/polish': [1, 340_000], 'p:kirby-polish/ship': [1, 3 * MIN],
}

/** A subagent's tool call as the engine raises it: agentId is the engine's to stamp, so $.tool.call's argument type leaves it out. */
export const inAgent = ($: Dollar, agentId: string, call: Record<string, unknown>) => $.tool.call({ ...call, agentId } as never)
export const step = async ($: Dollar, agentId: string) => {
  for await (const _ of $.turn.step({ turnId: `t-${agentId}`, index: 0, model: 'sonnet', messageCount: 1, agentId })) void _
}
export const answer = ($: Dollar, agentId: string, output_tokens = 50) => $.turn.complete({ reason: 'answer', answer: '', agentId, usage: { ...USAGE, output_tokens } } as never)

/**
 * The handoff's picture: the first review done (7m 00s, 41.2k and 12.6k out), the first polish 17m 17s in with
 * its two agents running, one editing hud.tsx at 78%, the other past its estimate, and three phases to come.
 */
export async function midflight($: Dollar, kit: ReturnType<typeof engine>) {
  const { clock, world } = kit
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.tool.call({ tool: 'Workflow', tool_use_id: 'call-1', script: ROUNDS })
  await $.agent.spawn(spawn(1, 'code-review:round-1', 'Review the code of round 1'))
  await $.agent.spawn(spawn(2, 'art-director:round-1', 'Review the art of round 1'))
  const look = inAgent($, 'agent-1', { tool: 'Read', tool_use_id: 'r0', file_path: '/repo/src/scenes/title.ts' })
  await clock.advance(1_000)
  await look
  await clock.advance(257_000)
  await answer($, 'agent-2', 12_600)
  await clock.advance(7 * MIN - 258_000)
  await answer($, 'agent-1', 41_200)
  await $.agent.spawn(spawn(3, 'polish:round-1', 'Polish the build of round 1'))
  await $.agent.spawn(spawn(4, 'sprites:round-1', 'Polish the sprites of round 1'))
  await clock.advance(17 * MIN + 17_000 - 9_000)
  const read = inAgent($, 'agent-3', { tool: 'Read', tool_use_id: 'r1', file_path: '/repo/src/sprites/kirby.ts' })
  await clock.advance(1_000)
  await read
  const bash = inAgent($, 'agent-3', { tool: 'Bash', tool_use_id: 'b1', command: 'pnpm test' })
  await clock.advance(5_000)
  await bash
  const failed = inAgent($, 'agent-3', { tool: 'Edit', tool_use_id: 'e0', file_path: '/repo/src/physics/float.ts', old_string: 'a', new_string: 'b' })
  await clock.advance(2_000)
  await failed
  world.stepOut = 24_300
  await step($, 'agent-3')
  world.stepOut = 9_800
  await step($, 'agent-4')
  // Left running: what the cards show as the current action.
  const editing = inAgent($, 'agent-3', { tool: 'Edit', tool_use_id: 'e1', file_path: '/repo/src/ui/hud.tsx', old_string: 'a', new_string: 'b' })
  const grepping = inAgent($, 'agent-4', { tool: 'Grep', tool_use_id: 'g1', pattern: '"floatSpeed"', path: '/repo/src' })
  // A test that ends with them still running leaves them unanswered: that is no failure of its own.
  void editing.catch(() => undefined)
  void grepping.catch(() => undefined)
  // From here the pane is on screen: the live beat runs.
  world.isUp = true
  await clock.advance(1_000)
  /**
   * Lets the two calls end, off screen. A test calls it last: a call left running when a test ends is answered
   * while the next test runs, and that test's agents carry the same ids.
   */
  const land = async () => {
    world.isUp = false
    await clock.advance(31_000)
    await Promise.allSettled([editing, grepping])
  }
  return { editing, grepping, land }
}

/** A plain subagent's start as the engine raises it: the Agent tool's, outside any workflow. */
export const solo = (description: string, subagentType = 'general-purpose', more: { fork?: boolean; isTeammate?: true; tool_use_id?: string } = {}) => ({
  tool_use_id: more.tool_use_id ?? `agent-call-${description}`, prompt: 'p', description, subagentType,
  provider: { plugin: 'engine', tier: 'core' }, parentModel: 'opus', background: false, fork: more.fork ?? false,
  ...(more.isTeammate === true ? { isTeammate: true as const } : {}),
}) as const
