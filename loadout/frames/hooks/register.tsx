import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement } from 'claude-code'
import { alone } from '../../hooks/part'
import type { Part } from '../../hooks/part'

import { packOf } from '../../flow/hooks/palette'
import type { ColorRowsKind } from '../../types'

const isOn = atom({ plugin: 'loadout', key: 'isOn' } as const, true)
// The working line's icon turns on this count, and only that line reads it: a beat draws nothing else again.
const spin = atom({ plugin: 'loadout', key: 'spin' } as const, 0)
// Read from the part that writes them: the theme and the packs are the Flow map's (flow/hooks/register.tsx).
const theme = atom({ plugin: 'loadout', key: 'flowTheme' } as const, '')
const packs = atom({ plugin: 'loadout', key: 'packs' } as const, { sig: '', list: [] })

/** What a ribbon shows: a glyph (or '' for a bare bar) on its hue. */
type Mark = readonly [glyph: string, hue: string]

// The one palette: a kind of action, its glyph, its hue and what it covers. Every hue is a
// theme key, so the frames take the colours of whichever theme is active.
const KIND: Readonly<Record<ColorRowsKind, readonly [glyph: string, hue: string, covers: string]>> = {
  shell: ['$', 'bashBorder', 'Bash, Monitor'],
  read: ['◇', 'suggestion', 'Read, Grep, Glob, ToolSearch'],
  edit: ['±', 'autoAccept', 'Edit, Write, NotebookEdit'],
  web: ['@', 'planMode', 'WebFetch, WebSearch, browser tools'],
  agent: ['◈', 'permission', 'Agent, Workflow, SendMessage, Task*; a message from another agent'],
  skill: ['✦', 'remember', 'Skill'],
  ask: ['?', 'merged', 'AskUserQuestion'],
  mcp: ['◆', 'ide', 'any other MCP tool'],
  other: ['•', 'inactive', 'anything else'],
}
// Who is speaking, and how a call or a task ended. The three status hues are
// the theme's own, and are used for nothing else.
const YOU: Mark = ['❯', 'text']
const CLAUDE: Mark = ['', 'claude']
const DONE: Mark = ['✔', 'success']
const ERRORED: Mark = ['✖', 'error']
const STOPPED: Mark = ['■', 'warning']

const TOOLS: Readonly<Record<string, ColorRowsKind>> = {
  Bash: 'shell', PowerShell: 'shell', Monitor: 'shell', BashOutput: 'shell', KillShell: 'shell',
  Read: 'read', Glob: 'read', Grep: 'read', LS: 'read', NotebookRead: 'read', ToolSearch: 'read',
  ListMcpResourcesTool: 'read', ReadMcpResourceTool: 'read', ReadMcpResourceDirTool: 'read',
  Edit: 'edit', MultiEdit: 'edit', Write: 'edit', NotebookEdit: 'edit',
  WebFetch: 'web', WebSearch: 'web',
  Agent: 'agent', Workflow: 'agent', SendMessage: 'agent', ListAgents: 'agent',
  Skill: 'skill',
  AskUserQuestion: 'ask',
}
const SPINNER: Readonly<Record<string, Mark>> = {
  thinking: ['∴', CLAUDE[1]],
  responding: ['»', CLAUDE[1]],
  requesting: ['↑', KIND.other[1]],
  'tool-input': ['▸', KIND.other[1]],
  'tool-use': ['▸', KIND.other[1]],
}

function kindOf(tool: string): ColorRowsKind {
  if (tool.startsWith('mcp__')) return /chrome|browser|playwright/i.test(tool.split('__')[1] ?? '') ? 'web' : 'mcp'
  if (tool.startsWith('Task')) return 'agent'

  // Own keys only: a tool named `constructor` is 'other', not Object's.
  return (Object.hasOwn(TOOLS, tool) ? TOOLS[tool] : undefined) ?? 'other'
}

const markOf = (kind: ColorRowsKind): Mark => [KIND[kind][0], KIND[kind][1]]

type Call = { tool: unknown; isErrored: unknown; isInterrupted: unknown }

/** A call's mark: red when it errored, whatever its kind; then interrupted; then its kind. */
const callMark = (call: Call): Mark =>
  call.isErrored === true ? ERRORED : call.isInterrupted === true ? STOPPED : markOf(kindOf(String(call.tool)))

/** The engine's own drawing with a ribbon at its left: nothing of the row is redrawn. */
function ribbon({ Box, Text }: Pick<Elements['terminal'], 'Box' | 'Text'>, marks: readonly Mark[], inner: RenderElement) {
  return (
    <Box flexDirection="row">
      {marks.map(([glyph, hue]) => (
        // The Box stretches to the row's height; its Text paints the first line whatever the Box fills.
        <Box flexShrink={0} backgroundColor={hue}>
          <Text color="inverseText" backgroundColor={hue} bold>{glyph === '' ? ' ' : glyph}</Text>
        </Box>
      ))}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} marginLeft={1}>{inner}</Box>
    </Box>
  )
}

/**
 * The engine's own drawing inside a rounded frame in the hue of its first
 * mark, the marks and a label sitting on the frame's top edge. Nothing of the
 * row is redrawn; the frame costs two rows and four columns.
 */
function frame({ Box, Text }: Pick<Elements['terminal'], 'Box' | 'Text'>, marks: readonly Mark[], label: string, inner: RenderElement) {
  const hue = marks[0]?.[1] ?? KIND.other[1]

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={hue} paddingX={1}>
      <Box position="absolute" top={-1} left={1}>
        {marks.map(([glyph, markHue]) => (
          <Text color="inverseText" backgroundColor={markHue} bold>{glyph === '' ? ' ' : glyph}</Text>
        ))}
        <Text color={hue} bold>{` ${label} `}</Text>
      </Box>
      {inner}
    </Box>
  )
}

/** A call's label: its kind, and how it ended when that was not well. */
const callLabel = (call: Call): string =>
  `${kindOf(String(call.tool)).toUpperCase()}${call.isErrored === true ? ' FAILED' : call.isInterrupted === true ? ' STOPPED' : ''}`

const LEGEND = `Colours on. ${Object.entries(KIND).map(([kind, [glyph]]) => `${glyph} ${kind}`).join('  ')}  ${YOU[0]} you  ${DONE[0]} done  ${ERRORED[0]} failed  ${STOPPED[0]} stopped`
const OFF = 'Colours off: every row is drawn as Claude Code draws it. /colors turns them back on.'
const HINT = 'Also: /loadout frames on|off.'

/** Turns the frames on or off (no word: the other way) and keeps the choice; undefined for any other word, nothing changed. */
async function setFrames($: EngineInterface, word: string): Promise<boolean | undefined> {
  if (word !== '' && word !== 'on' && word !== 'off') return undefined
  const now = await update($, isOn, was => (word === '' ? !was : word === 'on'))
  await $.store.set('isOn', now)

  return now
}

// --- the events Loadout's parts share (hooks/part.ts): this part's work on each, kept from costing the others ---

// The icon's beats run only while the working line is drawn: each draw asks for the next beat, and
// a beat that finds the line was not drawn since (for MISSES beats: a slow redraw is not the line gone) is the last.
const MISSES = 8
let beatMs = 0 // 0: no beat is due
let undrawn = 0

/** The working line was drawn with an icon of `ms` a frame: the beats start, or go on. */
function drew($: EngineInterface, ms: number) {
  undrawn = 0
  if (beatMs !== 0) return void (beatMs = ms)
  beatMs = ms
  try {
    $.clock.after(ms, () => void beat($).catch(() => void (beatMs = 0)))
  } catch {
    beatMs = 0
  }
}

async function beat($: EngineInterface) {
  if (++undrawn > MISSES) return void (beatMs = 0)
  await update($, spin, n => (n + 1) % 1_000_000)
  $.clock.after(beatMs, () => void beat($).catch(() => void (beatMs = 0)))
}

/** Which of a theme's words stands for the engine's: the same one as long as the engine keeps its own, so a turn says one thing. */
export const wordOf = (verbs: readonly string[], word: string): string =>
  verbs[[...word].reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) >>> 0, 7) % verbs.length] ?? word

const started: Part<'session.start'> = async ($, e, next) => {
  await $.command.register({
    name: 'colors',
    description: 'Turn the coloured row frames on or off',
    argumentHint: '[on|off]',
    immediate: true,
  })
  const kept = await $.store.get('isOn')
  if (typeof kept === 'boolean') await update($, isOn, () => kept)

  return next(e)
}

export const register: Register = on => {
  // Each under `{}`, any input: an event takes a single hook without a matcher in a module, and the parts share these.
  on('session.start', {}, ($, e, next) => alone(e, under => next(under), under => started($, e, under)))

  on('command.run', { command: 'colors' }, async ($, e) => {
    const now = await setFrames($, e.args.trim().toLowerCase())
    if (now === undefined) return { text: `Usage: /colors [on|off]. ${HINT}` }

    return { text: `${now ? LEGEND : OFF}\n${HINT}` }
  })

  // The legend in its own hues, in place of the plain line above.
  on('ui.render', { component: 'CommandOutput', props: { command: 'colors' } }, ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isErrored || !e.props.text.startsWith(LEGEND)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const row = ([glyph, hue]: Mark, name: string, covers: string) => (
      <Text wrap="truncate-end">
        <Text color="inverseText" backgroundColor={hue} bold>{glyph === '' ? ' ' : glyph}</Text>
        <Text color={hue} bold>{` ${name.padEnd(8)}`}</Text>
        <Text dimColor>{covers}</Text>
      </Text>
    )

    return (
      <Box flexDirection="column">
        <Text bold>Colours on. The frame around a row says what it is:</Text>
        {row(YOU, 'you', 'your own prompt')}
        {row(CLAUDE, 'claude', 'Claude speaking')}
        {Object.entries(KIND).map(([kind, [glyph, hue, covers]]) => row([glyph, hue], kind, covers))}
        {row(DONE, 'done', 'a background task completed')}
        {row(ERRORED, 'failed', 'a call or a task that errored: red wins over the kind')}
        {row(STOPPED, 'stopped', 'interrupted or killed')}
        <Text dimColor>/colors off turns the frames off. {HINT}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || typeof e.props.tool !== 'string' || !(await read($, isOn))) return next(e)

    return frame($.ui.resolve(e), [callMark(e.props)], callLabel(e.props), await next(e))
  })

  // The folded count line: one mark per kind it folds, a red one first when a call errored.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    // Unfolded, each call is a ToolUse row with a ribbon of its own.
    if (e.surface !== 'terminal' || e.props.isExpanded || !Array.isArray(e.props.calls) || !(await read($, isOn))) return next(e)
    if (e.props.calls.some(call => typeof call !== 'object' || call === null)) return next(e)
    const byHue = new Map(e.props.calls.map(call => [callMark(call)[1], callMark(call)] as const))
    const marks = [...byHue.values()].sort((a, b) => Number(b === ERRORED) - Number(a === ERRORED))
    if (marks.length === 0) return next(e)

    return frame($.ui.resolve(e), marks, `${e.props.calls.length} CALLS`, await next(e))
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    // ctrl+o shows the row in full, as the engine draws it.
    if (e.surface !== 'terminal' || e.props.isExpanded !== false || !(await read($, isOn))) return next(e)
    const kind = e.props.origin?.kind
    const status = e.props.task?.status
    const mark =
      kind === 'task-notification'
        ? status === 'completed' ? DONE : status === 'failed' ? ERRORED : status === 'killed' ? STOPPED : markOf('other')
        : e.props.from !== undefined || kind === 'peer' || kind === 'peer-send-message' ? markOf('agent')
        : kind === 'composer' || kind === 'bridge' ? YOU
        : undefined
    if (mark === undefined) return next(e)
    const label = mark === YOU ? 'YOU' : kind === 'task-notification' ? `TASK ${(status ?? 'update').toUpperCase()}` : (e.props.from?.name ?? 'AGENT').toUpperCase()

    return frame($.ui.resolve(e), [mark], label, await next(e))
  })

  // Claude speaking: a bare bar, the text beside it the engine's own markdown.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !(await read($, isOn))) return next(e)

    return ribbon($.ui.resolve(e), [CLAUDE], await next(e))
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const framed = await read($, isOn)
    const themed = packOf(await read($, theme), (await read($, packs)).list)?.spinner ?? null
    if (themed === null) {
      const mark = Object.hasOwn(SPINNER, e.props.mode) ? SPINNER[e.props.mode] : undefined

      return mark === undefined || !framed ? next(e) : ribbon($.ui.resolve(e), [mark], await next(e))
    }
    // The theme's own line: its word for the engine's, and its icon turning before it (on the ribbon with the frames on, bare with them off).
    const icon = themed.frames[(await read($, spin)) % themed.frames.length] ?? ''
    drew($, themed.ms)
    const inner = await next({ ...e, props: { ...e.props, word: wordOf(themed.verbs, e.props.word) } })
    const { Box, Text } = $.ui.resolve(e)
    if (framed) return ribbon({ Box, Text }, [[icon, CLAUDE[1]]], inner)

    return (
      <Box flexDirection="row">
        <Box flexShrink={0} marginRight={1}><Text color={CLAUDE[1]} bold>{icon}</Text></Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>{inner}</Box>
      </Box>
    )
  })
}
