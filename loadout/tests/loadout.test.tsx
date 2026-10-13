// Loadout as one plugin: the /loadout command in every form, forgiving theme names, the live theme files
// a switch rewrites, the old commands as aliases, the picker in the Avatar pane, what the three old mods
// kept carried over, and the three parts standing together on the events they share.
import { expect, mock, test } from 'claude-code/testing'
import type { On, SessionUsage, UiPane } from 'claude-code'

import { HELP, loadoutAsk } from '../avatar/hooks/loadout'
import { BUILT_IN, customOffer, findTheme, isLive, liveOf, liveSource, liveText, withTheme, writeLive } from '../avatar/hooks/themes'
import type { Disk } from '../avatar/hooks/themes'
import { PALETTES } from '../flow/hooks/palette'

const NOW = Date.parse('2026-10-08T10:00:00Z')
const USAGE: SessionUsage = { startedAt: NOW, context: { tokens: 40_000, window: 200_000, percent: 20 }, rateLimits: [], cost: { usd: 1 } }
const HOME = '/home/u'
const SETTINGS = `${HOME}/.claude/settings.json`
const THEMES = `${HOME}/.claude/themes`
const STORES = `${HOME}/.claude/plugins/store`
const CUSTOMS = ['cyberpunk-edgerunners', 'ghostrunner', 'kirby', 'kirby-pink']
const themeFile = (slug: string) => JSON.stringify({ name: slug.split('-').map(word => word[0]!.toUpperCase() + word.slice(1)).join(' '), base: 'dark', overrides: { claude: '#9be564', text: '#f2f5e6', success: '#4fd6a0', warning: 'ansi:yellow' } })
/** A live file's text as Loadout writes it from a theme: a file of the themes folder, or a built-in one. */
const liveFile = (slug: string) => liveText(slug, CUSTOMS.includes(slug) ? themeFile(slug) : null)!
const LIVE_PATH = `${THEMES}/loadout.json`

type Init = {
  theme?: string
  model?: string
  /** What `--settings` pinned this terminal to at its start. */
  pinned?: string
  /** A managed theme. */
  policy?: string
  /** Where the session was started, and whether `<cwd>/.claude/settings.json` sets the theme: `true` where that file is the user's own (its theme is the user's), a theme where it is a project's. */
  cwd?: string
  project?: string | true
  /** What `realpath` makes of a path, where links are in the way. */
  real?: Record<string, string>
  /** This plugin's store, and the old mods' store files by name. */
  store?: Record<string, unknown>
  old?: Record<string, string>
  hasClipboard?: boolean
  /** The engine refuses the Flow map's tool: that part's start fails. */
  noTool?: boolean
  /** The live theme files there are at the start, each by the theme it was written from: `{ loadout: 'kirby', 'loadout-pts3': 'dark' }`. */
  live?: Record<string, string>
  /** `mv` cannot be run. */
  noMv?: boolean
  /** The colour files the plugin ships (`<plugin root>/colors`), by file name. */
  shipped?: Record<string, string>
  /** `mv` runs and fails. */
  badMv?: boolean
}

/** The engine beneath the plugin: settings, themes folder, store, panes, clipboard; and what the plugin did to each. */
function world(on: On, init: Init = {}) {
  const w = {
    file: `{\n  "model": "opus",\n  "theme": "${init.theme ?? 'custom:ghostrunner'}"\n}\n`,
    sets: [] as unknown[], writes: [] as string[], opened: [] as string[], copied: [] as string[], toasts: [] as string[], commands: [] as string[], tools: [] as string[],
    kept: new Map(Object.entries(init.store ?? {})),
    panes: [] as UiPane[],
    reads: [] as string[],
    /** The themes folder: each file's text and time. `moves` are the renames `mv` made there. */
    disk: new Map<string, { text: string; mtimeMs: number }>([...CUSTOMS.map(slug => [`${slug}.json`, { text: themeFile(slug), mtimeMs: 1 }] as const), ...Object.entries(init.live ?? {}).map(([live, slug]) => [`${live}.json`, { text: liveFile(slug), mtimeMs: 1 }] as const)]),
    moves: [] as [string, string][],
    removed: [] as string[],
    stamp: 1,
  }
  const inThemes = (path: string) => (path.startsWith(`${THEMES}/`) ? path.slice(THEMES.length + 1) : undefined)
  const user = () => String((JSON.parse(w.file) as { theme?: string }).theme ?? '')
  const project = () => (init.project === true ? user() : init.project)
  const active = () => init.policy ?? init.pinned ?? project() ?? user()
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { HOME })
  on('config.list', () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: active(), provider: { plugin: 'engine', tier: 'core' }, isLocked: false }] }))
  on('config.set', (_$, e) => {
    w.sets.push(e.value)
    // (Probed: the person's own pick, in /theme, sets a `custom:` theme too; a plugin's call is held to the built-in names.)
    if ((e.origin as { kind?: string } | undefined)?.kind !== 'composer' && !BUILT_IN.some(name => name === e.value)) return { deny: `takes one of: ${BUILT_IN.join(', ')}` }
    w.file = withTheme(w.file, String(e.value))!

    return { value: e.value }
  })
  on('settings.read', (_$, e) => {
    const theme = e.source === 'user' ? user() : e.source === 'flag' ? init.pinned : e.source === 'policy' ? init.policy : e.source === 'project' ? project() : e.source === undefined ? active() : undefined

    return { value: theme === undefined ? {} : { theme } }
  })
  on('session.id', () => ({ value: 'abc-123' }))
  on('session.cwd', () => ({ value: init.cwd ?? '/work/app' }))
  on('process.run', (_$, e) => {
    const ran = (exitCode: number, stderr = '') => ({ value: { exitCode, stdout: '', stderr, isStdoutTruncated: false, isStderrTruncated: false } })
    if (e.argv[0] === 'sh' && e.argv[2] === 'command -v mv' && init.noMv !== true) return ran(0)
    if (e.argv[0] === 'rm' && init.noMv !== true) {
      const name = inThemes(e.argv[3] ?? '')
      if (name !== undefined && w.disk.delete(name)) w.removed.push(name)

      return ran(0)
    }
    if (e.argv[0] === 'mv' && init.badMv === true) return ran(1, 'mv: cannot move: Permission denied\n')
    if (e.argv[0] === 'mv' && init.noMv !== true) {
      const [from = '', to = ''] = e.argv.slice(3)
      const [source, target] = [inThemes(from), inThemes(to)]
      const moved = source === undefined ? undefined : w.disk.get(source)
      if (source === undefined || target === undefined || moved === undefined) throw new Error('ENOENT')
      w.disk.delete(source)
      w.disk.set(target, moved)
      w.moves.push([from, to])

      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    if (e.argv[0] !== 'realpath') throw new Error('ENOENT')

    return { value: { exitCode: 0, stdout: `${e.argv.slice(3).map(path => init.real?.[path] ?? path).join('\n')}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.model', () => ({ value: init.model ?? 'claude-sonnet-5-5' }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('agent.list', () => ({ value: [] }))
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('command.register', (_$, e) => {
    w.commands.push(e.name)

    return { value: { command: e.name } }
  })
  on('tool.register', (_$, e) => {
    if (init.noTool === true) throw new Error('no tools here')
    w.tools.push(e.name)

    return { value: { tool: `mcp__loadout__${e.name}` } }
  })
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('ui.panes', () => ({ value: w.panes }))
  on('ui.open', (_$, e) => {
    w.opened.push(e.id)

    return { value: { isPlaced: true as const } }
  })
  on('ui.copy', (_$, e) => {
    if (init.hasClipboard === false) return { value: { isCopied: false as const, reason: 'no-clipboard' as const } }
    w.copied.push(e.text)

    return { value: { isCopied: true as const } }
  })
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.blit', () => ({ value: {} }))
  on('store.get', (_$, e) => ({ value: w.kept.get(e.key) }))
  on('store.keys', () => ({ value: [...w.kept.keys()] }))
  on('store.set', (_$, e) => {
    w.kept.set(e.key, e.value)

    return { value: undefined }
  })
  const entry = (name: string, text: string) => ({ name, kind: 'file' as const, size: text.length, mtimeMs: 1, isLink: false })
  on('fs.list', (_$, e) => {
    if (e.path === THEMES) return { value: [...w.disk].map(([name, file]) => ({ ...entry(name, file.text), mtimeMs: file.mtimeMs })) }
    if (e.path === STORES && init.old !== undefined) return { value: Object.entries(init.old).map(([name, text]) => entry(name, text)) }
    if (e.path.endsWith('/colors') && init.shipped !== undefined) return { value: Object.entries(init.shipped).map(([name, text]) => entry(name, text)) }
    throw new Error('ENOENT')
  })
  on('fs.exists', (_$, e) => ({ value: e.path === SETTINGS || e.path.endsWith('/bin/loadout') || e.path.endsWith('/bin/claude-theme') }))
  on('fs.read', (_$, e) => {
    w.reads.push(e.path)
    if (e.path === SETTINGS) return { value: w.file }
    const name = e.path.split('/').pop() ?? ''
    const themed = w.disk.get(inThemes(e.path) ?? '')
    if (themed !== undefined) return { value: themed.text }
    const old = e.path.startsWith(`${STORES}/`) ? init.old?.[name] : e.path.includes('/colors/') ? init.shipped?.[name] : undefined
    if (old !== undefined) return { value: old }
    throw new Error('ENOENT')
  })
  on('fs.write', (_$, e) => {
    w.writes.push(e.path)
    if (e.path === SETTINGS) w.file = e.text
    const name = inThemes(e.path)
    if (name !== undefined) w.disk.set(name, { text: e.text, mtimeMs: ++w.stamp })

    return { value: undefined }
  })
  /** A live file's text now, and the theme it was written from. */
  const live = (slug = 'loadout') => w.disk.get(`${slug}.json`)?.text
  const source = (slug = 'loadout') => liveSource(live(slug) ?? '', BUILT_IN)

  return { ...w, w, clock, user, live, source }
}

/** A theme picked in Claude Code's own /theme, as the engine raises it (probed, 2.1.293). */
const picked = (value: string) => ({ key: 'theme', value, previous: '', provider: { plugin: 'engine', tier: 'core' }, origin: { kind: 'composer' } }) as const
const typed = (command: string, args = '') => ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } }) as const
const START = { cwd: '/', surface: 'terminal', isInteractive: false } as const
const pane = (bodyRows = 60, bodyColumns = 34) => ({
  plugin: 'loadout', surface: 'terminal', component: 'Pane', requestId: 'kirby',
  props: { title: 'Avatar', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
}) as const

type Node = string | number | null | boolean | Node[] | { type: string; key?: unknown; props?: Record<string, unknown>; children?: Node[] }
const kidsOf = (node: Node): Node[] => (typeof node === 'object' && node !== null && !Array.isArray(node) ? node.children ?? [] : [])
/** The cells a node takes on a row, as the terminal draws it: a plain Button is its label ("1: " before it with a hotkey), another one `[ label ]`. */
function wide(node: Node): number {
  if (typeof node === 'string' || typeof node === 'number') return String(node).length
  if (Array.isArray(node)) return node.reduce((sum: number, one) => sum + wide(one), 0)
  if (typeof node !== 'object' || node === null) return 0
  const props = node.props ?? {}
  if (node.type === 'Button') return String(props.label).length + (props.plain === true ? (props.hotkey === undefined ? 0 : 3) : 4)
  const inner = kidsOf(node).map(wide)

  return props.flexDirection === 'column' ? Math.max(0, ...inner) : inner.reduce((sum, one) => sum + one, 0)
}
const textOf = (node: Node): string =>
  typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(textOf).join('') : typeof node !== 'object' || node === null ? ''
    : node.type === 'Button' ? `${node.props?.plain === true ? (node.props.hotkey === undefined ? '' : `${String(node.props.hotkey)}: `) : '[ '}${String(node.props?.label)}${node.props?.plain === true ? '' : ' ]'}` : kidsOf(node).map(textOf).join('')
const NO_ROOM = 'The Avatar pane is too short to list the themes here: make it taller, or type /loadout <theme>.'
/** The picker as drawn: the pane's first child, as lines of text and their widths. */
const pickerOf = (root: unknown) => {
  const head = kidsOf(root as Node)[0] ?? null
  const rows = typeof head === 'object' && head !== null && !Array.isArray(head) && head.props?.flexDirection === 'column' ? kidsOf(head) : [head]

  return { lines: rows.map(textOf), widths: rows.map(wide) }
}

// --- names and words -------------------------------------------------------------------

test('a theme name is forgiving: exact, any case, spaces or dashes, a unique prefix or word; ambiguous and unknown names say so', () => {
  const find = (name: string) => findTheme(name, BUILT_IN, CUSTOMS)
  // Exact, as the setting spells it or as a person writes it.
  expect([find('kirby'), find('KIRBY'), find('Cyberpunk Edgerunners'), find('cyberpunk_edgerunners'), find('cyberpunk-edgerunners'), find('custom:kirby-pink'), find('dark'), find('Light Ansi')]).toEqual([
    { setting: 'custom:kirby' }, { setting: 'custom:kirby' }, { setting: 'custom:cyberpunk-edgerunners' }, { setting: 'custom:cyberpunk-edgerunners' }, { setting: 'custom:cyberpunk-edgerunners' }, { setting: 'custom:kirby-pink' }, { setting: 'dark' }, { setting: 'light-ansi' },
  ])
  // An exact slug wins over the themes it begins: `kirby` is not ambiguous with kirby-pink.
  expect([find('ghostrunner'), find('Ghostrunner'), find('custom:ghostrunner')]).toEqual([{ setting: 'custom:ghostrunner' }, { setting: 'custom:ghostrunner' }, { setting: 'custom:ghostrunner' }])
  // A unique prefix, or a word of the name: `cyberpunk` now begins one theme alone.
  const EDGE = { setting: 'custom:cyberpunk-edgerunners' }
  expect([find('ghost'), find('pink'), find('Kirby P'), find('au'), find('GHOST')]).toEqual([{ setting: 'custom:ghostrunner' }, { setting: 'custom:kirby-pink' }, { setting: 'custom:kirby-pink' }, { setting: 'auto' }, { setting: 'custom:ghostrunner' }])
  expect([find('edgerunners'), find('edge'), find('Edge'), find('cyberpunk'), find('cyber'), find('Cyberpunk E')]).toEqual([EDGE, EDGE, EDGE, EDGE, EDGE, EDGE])
  // The names from before the rename are aliases, in any spelling: old habits and old restart lines keep working.
  expect([find('cyberpunk-soft'), find('Cyberpunk Soft'), find('custom:cyberpunk-soft'), find('soft'), find('SOFT')]).toEqual([EDGE, EDGE, EDGE, EDGE, EDGE])
  expect([find('cyberpunk-classic'), find('Cyberpunk Classic'), find('classic')]).toEqual([{ setting: 'custom:ghostrunner' }, { setting: 'custom:ghostrunner' }, { setting: 'custom:ghostrunner' }])
  // (An alias only: a theme of that very name wins, and where the renamed theme is not there the old name is no theme.)
  expect(findTheme('soft', BUILT_IN, [...CUSTOMS, 'soft'])).toEqual({ setting: 'custom:soft' })
  expect([findTheme('soft', BUILT_IN, ['kirby']), findTheme('classic', BUILT_IN, ['kirby'])]).toEqual([{ among: [] }, { among: [] }])
  // Ambiguous: the candidates. Unknown: none. The middle of a word is no match.
  expect(find('ki')).toEqual({ among: ['kirby', 'kirby-pink'] })
  expect(find('dal')).toEqual({ among: ['light-daltonized', 'dark-daltonized'] })
  expect(find('ansi')).toEqual({ among: ['light-ansi', 'dark-ansi'] })
  expect([find('vaporwave'), find('unk'), find('runners'), find(''), find('custom:dark')]).toEqual([{ among: [] }, { among: [] }, { among: [] }, { among: [] }, { among: [] }])
  // A theme's four colours are its own, its base's where it names none as #rrggbb.
  expect(customOffer('kirby', themeFile('kirby'))).toEqual({ setting: 'custom:kirby', slug: 'kirby', name: 'Kirby', swatch: ['#9be564', '#f2f5e6', '#4fd6a0', '#ffc107'] })
  expect(customOffer('odd', '{ not json').name).toBe('odd')
})

test('the words of /loadout: nothing, a switch, a pane, or a theme of one or several words with "here" last', () => {
  expect(['', 'help', 'status', 'follow', 'avatar', 'flow', 'frames off', 'frames', 'background on', 'style text'].map(loadoutAsk)).toEqual([
    { kind: 'pick' }, { kind: 'help' }, { kind: 'status' }, { kind: 'follow' }, { kind: 'pane', pane: 'avatar' }, { kind: 'pane', pane: 'flow' },
    { kind: 'frames', value: 'off' }, { kind: 'frames', value: '' }, { kind: 'background', value: 'on' }, { kind: 'style', value: 'text' },
  ])
  expect(['kirby', 'Cyberpunk Edgerunners', 'cyberpunk edgerunners here', 'kirby here', 'dark all', 'here'].map(loadoutAsk)).toEqual([
    { kind: 'theme', name: 'kirby', scope: 'all' }, { kind: 'theme', name: 'cyberpunk edgerunners', scope: 'all' }, { kind: 'theme', name: 'cyberpunk edgerunners', scope: 'here' },
    { kind: 'theme', name: 'kirby', scope: 'here' }, { kind: 'theme', name: 'dark', scope: 'all' }, { kind: 'theme', name: '', scope: 'here' },
  ])
})

// --- the command ---------------------------------------------------------------------------

test('/loadout alone opens the picker and lists the themes, the current one marked, with one usage line', async ($, on) => {
  const { w } = world(on)
  await $.session.start(START)
  const got = (await $.command.run(typed('loadout'))).text ?? ''
  expect(w.opened).toContain('kirby')
  expect(got.split('\n')).toEqual([
    'Loadout: ghostrunner (the global theme). Pick one in the Avatar pane, or by name.',
    'Themes: cyberpunk-edgerunners, ▸ghostrunner, kirby, kirby-pink, auto, dark, light, light-daltonized, dark-daltonized, light-ansi, dark-ansi.',
    'Change it: /loadout <theme> (every terminal) · /loadout <theme> here (this terminal) · /loadout help.',
  ])
  expect([w.sets, w.writes]).toEqual([[], []])
  // The picker is open in the pane: a row per theme.
  const ui = await $.ui.mount(pane())
  expect((await ui.findAll({ type: 'Button' })).filter(button => String(button.props.key ?? '').startsWith('loadout:')).length).toBe(11)
  await ui.unmount()
})

// --- live theme files ------------------------------------------------------------------------

const BEHIND = (name: string, old: string) => `Loadout ${name} is set, and nothing changed here yet: a running session keeps the theme it started with (${old}). This terminal, and any other not yet on a Loadout theme, shows it at its next start; from then on switching is instant.`
const TEMP = `${THEMES}/.loadout.abc-123.tmp`

test('a live file is a theme file named "Loadout: <source>" with the source\'s base and overrides; its source is read back from it; it is written by a rename, and not at all when unchanged', async () => {
  // A custom source: its base and overrides, nothing else of it. A built-in one: its own base, nothing overridden.
  const kirby = JSON.stringify({ name: 'Kirby', base: 'dark', overrides: { claude: '#9be564', text: 'ansi:white' }, note: 'left behind' })
  expect(liveText('kirby', kirby)).toBe('{\n  "name": "Loadout: kirby",\n  "base": "dark",\n  "overrides": {\n    "claude": "#9be564",\n    "text": "ansi:white"\n  }\n}\n')
  for (const builtIn of BUILT_IN.filter(name => name !== 'auto')) expect(liveText(builtIn, null)).toBe(`{\n  "name": "Loadout: ${builtIn}",\n  "base": "${builtIn}",\n  "overrides": {}\n}\n`)
  expect(JSON.parse(liveText('bare', '{ "name": "Bare" }')!)).toEqual({ name: 'Loadout: bare', overrides: {} })
  // A source that is no theme object gives no live file.
  expect([liveText('odd', '{ not json'), liveText('odd', '[1]'), liveText('odd', '"dark"'), liveText('odd', '')]).toEqual([undefined, undefined, undefined, undefined])

  // The source, from the name: a file of the themes folder, or a built-in theme where nothing is overridden.
  expect([liveSource(liveText('kirby', kirby)!, BUILT_IN), liveSource(liveText('dark', null)!, BUILT_IN), liveSource(liveText('light-ansi', null)!, BUILT_IN), liveSource(liveText('Kirby Pink', '{}')!, BUILT_IN)])
    .toEqual(['custom:kirby', 'dark', 'light-ansi', 'custom:Kirby Pink'])
  // (A theme file named after a built-in one is that file, by what it overrides.)
  expect(liveSource(liveText('dark', kirby)!, BUILT_IN)).toBe('custom:dark')
  // Not a live file: no source. Nor is a live file ever one.
  expect([liveSource(kirby, BUILT_IN), liveSource('', BUILT_IN), liveSource('{ broken', BUILT_IN), liveSource('[]', BUILT_IN), liveSource('{"name":"Loadout: loadout-pts3"}', BUILT_IN), liveSource('{"name":"Loadout: "}', BUILT_IN)])
    .toEqual([undefined, undefined, undefined, undefined, undefined, undefined])

  // Which files are live, and which settings name one.
  expect(['loadout', 'loadout-pts3', 'loadout-tty-1', 'loadouts', 'loadout-', 'my-loadout', 'kirby', 'loadout-PTS3'].map(isLive)).toEqual([true, true, true, false, false, false, false, false])
  expect(['custom:loadout', 'custom:loadout-pts3', 'loadout', 'custom:kirby', 'dark', ''].map(liveOf)).toEqual(['loadout', 'loadout-pts3', undefined, undefined, undefined, undefined])

  // Written atomically: the text goes to a temporary file of the same folder (no theme: no `.json`), which is renamed over the live file.
  const files = new Map<string, string>()
  const ops: string[] = []
  const disk: Disk = {
    read: async path => files.get(path) ?? null,
    write: async (path, text) => {
      ops.push(`write ${path}`)
      files.set(path, text)
    },
    move: async (from, to) => {
      ops.push(`move ${from} ${to}`)
      files.set(to, files.get(from)!)
      files.delete(from)
    },
  }
  expect(await writeLive(disk, '/t', 'loadout', 'one', 7)).toBe(true)
  expect([ops, [...files]]).toEqual([['write /t/.loadout.7.tmp', 'move /t/.loadout.7.tmp /t/loadout.json'], [['/t/loadout.json', 'one']]])
  // Unchanged: nothing is written, nothing renamed.
  expect([await writeLive(disk, '/t', 'loadout', 'one', 8), ops.length]).toEqual([false, 2])
  expect([await writeLive(disk, '/t', 'loadout-pts3', 'two', 9), await writeLive(disk, '/t', 'loadout', 'two', 9), ops.length]).toEqual([true, true, 6])
  expect(ops.filter(op => op.startsWith('write')).every(op => /^write \/t\/\.[\w.-]+\.tmp$/.test(op))).toBe(true)
  // A disk that fails is not hidden.
  expect(await writeLive({ ...disk, move: async () => Promise.reject(new Error('EXDEV')) }, '/t', 'loadout', 'three', 1).then(() => 'written', error => String(error))).toBe('Error: EXDEV')
})

test('on a terminal that runs the live theme, /loadout <theme> is instant: the live file is rewritten from the theme, no setting touched, and said in one line', async ($, on) => {
  const { w, live, source } = world(on, { theme: 'custom:loadout', live: { loadout: 'ghostrunner' } })
  await $.session.start(START)
  const run = async (args: string) => (await $.command.run(typed('loadout', args))).text ?? ''
  const settings = w.file
  // The theme here is the live file's source; the live file is no theme to pick.
  expect((await run('')).split('\n').slice(0, 2)).toEqual([
    'Loadout: ghostrunner (the global theme). Pick one in the Avatar pane, or by name.',
    'Themes: cyberpunk-edgerunners, ▸ghostrunner, kirby, kirby-pink, auto, dark, light, light-daltonized, dark-daltonized, light-ansi, dark-ansi.',
  ])
  // A unique word of the name is enough. One line, and no more than happened.
  expect(await run('edge')).toBe('Loadout cyberpunk-edgerunners: every terminal.')
  expect([live(), w.file, w.sets, w.writes, w.moves]).toEqual([liveFile('cyberpunk-edgerunners'), settings, [], [TEMP], [[TEMP, LIVE_PATH]]])
  // The plugin follows at once, with no tick: the theme, its pack, the picker's mark.
  expect((await run('status')).split('\n').slice(0, 2)).toEqual(['Theme: custom:cyberpunk-edgerunners (the global theme, live through loadout.json).', (await run('status')).split('\n')[1]])
  expect((await run('status')).split('\n')[1]).toMatch(/^Pack: the built-in table \([\w-]+ yellow, dark, background #[0-9a-f]{6}\)/)
  expect((await run('')).split('\n')[1]).toContain('▸cyberpunk-edgerunners, ghostrunner,')
  // The same theme again: nothing is written.
  expect(await run('Cyberpunk Edgerunners')).toBe('Loadout cyberpunk-edgerunners: every terminal.')
  expect([w.writes.length, w.moves.length]).toEqual([1, 1])
  // A built-in theme is a live file too (its base, nothing overridden): not the engine's setting.
  expect(await run('DARK')).toBe('Loadout dark: every terminal.')
  expect([live(), source(), w.sets, w.file]).toEqual(['{\n  "name": "Loadout: dark",\n  "base": "dark",\n  "overrides": {}\n}\n', 'dark', [], settings])
  expect((await run('status')).split('\n')[0]).toBe('Theme: dark (the global theme, live through loadout.json).')
  expect(await run('light ansi all')).toBe('Loadout light-ansi: every terminal.')
  expect(source()).toBe('light-ansi')
  // The renamed themes by any of their names, old ones among them.
  for (const [name, slug] of [['ghost', 'ghostrunner'], ['cyberpunk', 'cyberpunk-edgerunners'], ['Ghostrunner', 'ghostrunner'], ['cyberpunk-soft', 'cyberpunk-edgerunners'], ['classic', 'ghostrunner'], ['soft', 'cyberpunk-edgerunners'], ['cyberpunk-classic', 'ghostrunner'], ['edgerunners', 'cyberpunk-edgerunners'], ['Kirby Pink', 'kirby-pink']] as const) {
    expect([name, await run(name), source()]).toEqual([name, `Loadout ${slug}: every terminal.`, `custom:${slug}`])
  }

  // Ambiguous or unknown: one line naming the candidates, nothing changed. A live file is no name: `load` fits nothing.
  const before = JSON.stringify([w.file, w.sets, w.writes, [...w.disk]])
  expect(await run('ki')).toBe('"ki" fits kirby, kirby-pink: say which.')
  const unknown = await run('vaporwave')
  expect(unknown).toMatch(/^No theme "vaporwave"\. Themes: cyberpunk-edgerunners, ghostrunner, kirby, ▸kirby-pink, auto, .*dark-ansi\.$/)
  expect(unknown.includes('\n')).toBe(false)
  for (const name of ['loadout', 'load', 'custom:loadout', 'Loadout: kirby']) expect(await run(name)).toMatch(/^No theme "/)
  expect(await run('here')).toContain('Say which theme: /loadout <theme> here.')
  expect(JSON.stringify([w.file, w.sets, w.writes, [...w.disk]])).toBe(before)

  // "here" on a terminal that follows the global live theme has no file of its own to rewrite: nothing changes,
  // and the answer is the line that starts it again with one (the launcher's).
  const [first, line, why] = (await run('kirby here')).split('\n')
  expect(first).toBe('Copied. Press Ctrl+D, paste, Enter.')
  expect(line).toMatch(/^\S+\/bin\/loadout kirby --resume abc-123$/)
  expect(why).toBe('Nothing changed yet: this terminal has no theme file of its own to rewrite. That line starts this conversation again here on kirby, with one: from then on "/loadout <theme> here" is instant. The others keep theirs.')
  expect([w.copied, JSON.stringify([w.file, w.sets, w.writes, [...w.disk]])]).toEqual([[line], before])
  expect(/\b(set|switched|now on)\b/i.test(`${first}${why}`)).toBe(false)
  // A forgiving name here too; an ambiguous one copies nothing.
  expect((await run('soft here')).split('\n')[1]).toMatch(/\/bin\/loadout cyberpunk-edgerunners --resume abc-123$/)
  expect((await run('classic here')).split('\n')[1]).toMatch(/\/bin\/loadout ghostrunner --resume abc-123$/)
  expect(await run('ki here')).toBe('"ki" fits kirby, kirby-pink: say which.')
  expect([w.copied.length, JSON.stringify([w.file, w.sets, w.writes, [...w.disk]])]).toEqual([3, before])
  expect(await run('follow')).toBe('Nothing to do: this terminal already follows the global theme (kirby-pink).')

  // `auto` can be no theme file: it is the engine's own setting, read at a start. Said so; the live file stays, and so does what this terminal shows.
  expect(await run('auto')).toBe('The theme setting is now auto. Nothing changed on screen: each terminal takes it at its next start.')
  expect([w.sets, source(), (await run('status')).split('\n')[0]]).toEqual([['auto'], 'custom:kirby-pink', 'Theme: custom:kirby-pink (the theme this terminal started with; the global theme is now auto, shown at its next start, live through loadout.json).'])
})

test('on a terminal that runs another theme, the first /loadout <theme> writes the live file and makes it the global theme, and says this terminal shows it at its next start: never that it changed', async ($, on) => {
  const { w, user, live, source, clock } = world(on)
  on('command.run', { command: 'theme' }, () => ({ text: '' }))
  await $.session.start(START)
  const run = async (args: string) => (await $.command.run(typed('loadout', args))).text ?? ''
  // The live file, then the "theme" key alone of the settings (its other keys kept); the line that starts this terminal again is copied.
  expect((await run('edge')).split('\n')).toEqual(['Copied. Press Ctrl+D, paste, Enter.', 'claude --resume abc-123', BEHIND('cyberpunk-edgerunners', 'ghostrunner')])
  expect([w.file, w.sets, w.writes, w.moves, w.copied]).toEqual(['{\n  "model": "opus",\n  "theme": "custom:loadout"\n}\n', [], [TEMP, SETTINGS], [[TEMP, LIVE_PATH]], ['claude --resume abc-123']])
  expect(live()).toBe(liveFile('cyberpunk-edgerunners'))
  // The settings row now says the live theme, and this terminal still paints the one it started with: the plugin
  // goes on saying so, in every form, however long it runs.
  await clock.advance(9000)
  expect((await run('status')).split('\n')[0]).toBe('Theme: custom:ghostrunner (the theme this terminal started with; the global theme is now custom:cyberpunk-edgerunners, shown at its next start).')
  expect((await run('')).split('\n').slice(0, 2)).toEqual([
    'Loadout: ghostrunner (the theme this terminal started with; the global theme is now custom:cyberpunk-edgerunners, shown at its next start). Pick one in the Avatar pane, or by name.',
    'Themes: cyberpunk-edgerunners, ▸ghostrunner, kirby, kirby-pink, auto, dark, light, light-daltonized, dark-daltonized, light-ansi, dark-ansi.',
  ])
  expect(await run('follow')).toBe('Nothing to do: this terminal follows the global theme, and shows it (cyberpunk-edgerunners) at its next start.')
  // Again, before any restart: the live file is rewritten for the terminals on it, the setting is left, and this one is still not said to change.
  const again = (await run('Kirby Pink')).split('\n')
  expect(again).toEqual(['Copied. Press Ctrl+D, paste, Enter.', 'claude --resume abc-123', BEHIND('kirby-pink', 'ghostrunner')])
  expect([source(), user(), w.writes.filter(path => path === SETTINGS).length]).toEqual(['custom:kirby-pink', 'custom:loadout', 1])
  for (const said of [again.join(' '), await run('dark')]) expect(/every terminal\.|this terminal\.$/.test(said)).toBe(false)
  expect((await run('status')).split('\n')[0]).toContain('Theme: custom:ghostrunner (the theme this terminal started with; the global theme is now dark')
  // "here" gives the launcher's line, which starts it with a file of its own.
  expect((await run('kirby here')).split('\n')[1]).toMatch(/\/bin\/loadout kirby --resume abc-123$/)

  // The person picks a theme with Claude Code's own /theme in this session: the plugin follows what is then active, as it always did.
  // (Probed: the pick raises `config.set` from the composer with the theme picked; the settings file follows.)
  await $.command.run(typed('theme'))
  await $.config.set(picked('custom:kirby'))
  expect((await run('status')).split('\n')[0]).toBe('Theme: custom:kirby (the global theme).')
  await clock.advance(4400)
  expect((await run('status')).split('\n')[0]).toBe('Theme: custom:kirby (the global theme).')

  // A settings file that is not one is left alone: nothing is said to have changed.
  w.file = '{ not json'
  expect(await run('soft')).toContain(`Not changed: ${SETTINGS} could not be read as settings`)
  expect(w.file).toBe('{ not json')
})

test('a terminal started by the launcher has a live file of its own: "here" rewrites that one alone, "all" every one, and follow gives the plain line', async ($, on) => {
  const { w, live, source } = world(on, { theme: 'custom:loadout', pinned: 'custom:loadout-pts3', live: { loadout: 'ghostrunner', 'loadout-pts3': 'kirby', 'loadout-pts9': 'dark' } })
  await $.session.start(START)
  const run = async (args: string) => (await $.command.run(typed('loadout', args))).text ?? ''
  expect((await run('')).split('\n')[0]).toBe("Loadout: kirby (this terminal's own theme; the global theme is custom:ghostrunner). Pick one in the Avatar pane, or by name.")
  // Here: this terminal's file, live; the shared one and another terminal's are not touched.
  expect(await run('pink here')).toBe('Loadout kirby-pink: this terminal.')
  expect([source('loadout-pts3'), source(), source('loadout-pts9'), w.moves.length, w.copied, w.sets, w.writes.includes(SETTINGS)]).toEqual(['custom:kirby-pink', 'custom:ghostrunner', 'dark', 1, [], [], false])
  expect(live('loadout-pts3')).toBe(liveFile('kirby-pink'))
  expect((await run('status')).split('\n')[0]).toBe("Theme: custom:kirby-pink (this terminal's own theme; the global theme is custom:ghostrunner, live through loadout-pts3.json).")
  expect(await run('light here')).toBe('Loadout light: this terminal.')
  expect([source('loadout-pts3'), source()]).toEqual(['light', 'custom:ghostrunner'])
  // All: the shared file and every terminal's own.
  expect(await run('edge')).toBe('Loadout cyberpunk-edgerunners: every terminal.')
  expect(['loadout', 'loadout-pts3', 'loadout-pts9'].map(slug => source(slug))).toEqual(Array<string>(3).fill('custom:cyberpunk-edgerunners'))
  expect((await run('')).split('\n')[0]).toContain('Loadout: cyberpunk-edgerunners (this terminal\'s own theme;')
  // No live file is ever removed by the plugin: another terminal may be on it.
  expect([...w.disk.keys()].filter(name => name.startsWith('loadout')).sort()).toEqual(['loadout-pts3.json', 'loadout-pts9.json', 'loadout.json'])
  // `auto` here cannot be a file: the launcher's line, which pins it; nothing changed.
  expect((await run('auto here')).split('\n').slice(1)).toEqual([(await run('auto here')).split('\n')[1], 'Nothing changed yet: a running session cannot change its own theme. That line starts this conversation again in this terminal, pinned to auto; the others keep theirs.'])
  // Follow: this terminal has its own theme; the plain line starts it again on the global one.
  w.copied.length = 0
  expect((await run('follow')).split('\n')).toEqual([
    'Copied. Press Ctrl+D, paste, Enter.', 'claude --resume abc-123',
    'Nothing changed yet: this terminal has its own theme (cyberpunk-edgerunners) since its start. That line starts this conversation again without it: it then follows the global theme (cyberpunk-edgerunners).',
  ])
  expect(w.copied).toEqual(['claude --resume abc-123'])
})

test('a terminal with its own live file while the global theme is still another: "all" switches it at once and says the others follow at their next start', async ($, on) => {
  const { user, source } = world(on, { theme: 'custom:kirby', pinned: 'custom:loadout-pts3', live: { 'loadout-pts3': 'kirby' } })
  await $.session.start(START)
  expect((await $.command.run(typed('loadout', 'ghost'))).text).toBe('Loadout ghostrunner: every terminal. One started on another theme shows it at its next start.')
  expect([user(), source(), source('loadout-pts3')]).toEqual(['custom:loadout', 'custom:ghostrunner', 'custom:ghostrunner'])
  // From then on it is one line.
  expect((await $.command.run(typed('loadout', 'kirby'))).text).toBe('Loadout kirby: every terminal.')
})

for (const [live, init, scope] of [
  ['loadout', { theme: 'custom:loadout' }, 'the global theme'],
  ['loadout-pts3', { theme: 'custom:kirby', pinned: 'custom:loadout-pts3' }, "this terminal's own theme; the global theme is custom:kirby"],
] as const) {
  test(`everything that asks which theme is active reads a live theme's source (${live}.json): the family, the pack, the Flow map's palette, the picker's mark, /loadout and the status; and again when another terminal rewrites the file`, async ($, on) => {
    const { w, clock } = world(on, { ...init, live: { [live]: 'ghostrunner' } })
    await $.session.start(START)
    const run = async (args: string) => (await $.command.run(typed('loadout', args))).text ?? ''
    const seen = async () => {
      const list = (await run('')).split('\n').slice(0, 2).join(' | ') // (and /loadout unfolds the picker)
      const ui = await $.ui.mount(pane(60, 34))
      const open = pickerOf(await ui.drawn())
      await ui.press({ key: 'loadout' })
      const folded = pickerOf(await ui.drawn()).lines[0]
      await ui.unmount()
      const map = await $.ui.mount({ ...pane(60, 56), requestId: 'flow-map' })
      const ground = ((await map.drawn()) as { props: { backgroundColor?: string } }).props.backgroundColor
      await map.unmount()
      const status = (await run('status')).split('\n')

      return { rows: open.lines.length, marked: open.lines.filter(line => /[●◆]/.test(line)).map(line => line.replace(/^│ /, '').replace(/^████ +(\d: )?/, '').replace(/[ ●◆│]+$/, '')), folded, ground, theme: status[0], pack: status[1]?.split('.')[0], list }
    }
    // The red HUD (the cyber family, its pack), the Ghostrunner palette, one mark, on Ghostrunner; the live file is no row.
    expect(await seen()).toEqual({
      rows: 12, marked: ['GHOSTRUNNER'], folded: 'LOADOUT // GHOSTRUNNER [ CHANGE ]', ground: PALETTES.ghostrunner.bg,
      theme: `Theme: custom:ghostrunner (${scope}, live through ${live}.json).`, pack: 'Pack: the built-in table (ghostrunner red, dark, background #120608)',
      list: `Loadout: ghostrunner (${scope}). Pick one in the Avatar pane, or by name. | Themes: cyberpunk-edgerunners, ▸ghostrunner, kirby, kirby-pink, auto, dark, light, light-daltonized, dark-daltonized, light-ansi, dark-ansi.`,
    })
    // Another terminal switches: the file's content, size and time change. Within the slow tick everything here follows.
    w.disk.set(`${live}.json`, { text: liveFile('kirby-pink'), mtimeMs: 50 })
    const reads = w.reads.length
    await clock.advance(4400)
    expect(await seen()).toEqual({
      rows: 13, marked: ['Kirby Pink'], folded: 'loadout: Kirby Pink [ change ]', ground: PALETTES['kirby-pink'].bg,
      theme: `Theme: custom:kirby-pink (${scope}, live through ${live}.json).`, pack: 'Pack: the built-in table (kirby, dark, background #2b1724)',
      list: `Loadout: kirby-pink (${scope}). Pick one in the Avatar pane, or by name. | Themes: cyberpunk-edgerunners, ghostrunner, kirby, ▸kirby-pink, auto, dark, light, light-daltonized, dark-daltonized, light-ansi, dark-ansi.`,
    })
    // An unchanged file is not read again, tick after tick.
    const settled = w.reads.filter(path => path.endsWith(`/${live}.json`)).length
    await clock.advance(12_000)
    expect(w.reads.filter(path => path.endsWith(`/${live}.json`)).length).toBe(settled)
    expect(w.reads.length).toBeGreaterThan(reads)
    // A built-in source: Clawd and the default look.
    w.disk.set(`${live}.json`, { text: liveFile('dark'), mtimeMs: 51 })
    await clock.advance(4400)
    expect(await seen()).toMatchObject({ marked: ['dark'], folded: 'loadout: dark [ change ]', ground: PALETTES.handoff.bg, theme: `Theme: dark (${scope}, live through ${live}.json).` })
    // A live file that is no longer Loadout's (or gone) is no theme known here: nothing is made up.
    w.disk.set(`${live}.json`, { text: '{ broken', mtimeMs: 52 })
    await clock.advance(4400)
    expect((await run('status')).split('\n')[0]).toContain(`Theme: custom:${live} (`)
  })
}

test('another terminal makes the live theme the global one: this one, started on another theme, keeps saying the theme it shows', async ($, on) => {
  const { w, clock } = world(on, { theme: 'custom:kirby' })
  await $.session.start(START)
  // (What Loadout does from another terminal: the live file, then the setting.)
  w.disk.set('loadout.json', { text: liveFile('ghostrunner'), mtimeMs: 9 })
  w.file = withTheme(w.file, 'custom:loadout')!
  await clock.advance(9000)
  const status = (await $.command.run(typed('loadout', 'status'))).text ?? ''
  expect(status.split('\n').slice(0, 2)).toEqual(['Theme: custom:kirby (the theme this terminal started with; the global theme is now custom:ghostrunner, shown at its next start).', status.split('\n')[1]])
  expect(status.split('\n')[1]).toContain('Pack: the built-in table (kirby, dark,')
})

test('where mv cannot be run the live file is still written, in place; a theme file that is no theme changes nothing', async ($, on) => {
  const { w, source } = world(on, { theme: 'custom:loadout', live: { loadout: 'ghostrunner' }, noMv: true })
  await $.session.start(START)
  expect((await $.command.run(typed('loadout', 'kirby'))).text).toBe('Loadout kirby: every terminal.')
  // No temporary file is made where nothing could rename or remove it.
  expect([source(), w.writes, [...w.disk.keys()].filter(name => name.endsWith('.tmp'))]).toEqual(['custom:kirby', [LIVE_PATH], []])
  w.disk.set('kirby-pink.json', { text: '[1]', mtimeMs: 3 })
  const before = JSON.stringify([w.file, [...w.disk]])
  expect((await $.command.run(typed('loadout', 'pink'))).text).toBe(`Not changed: ${THEMES}/kirby-pink.json could not be read as a theme.`)
  expect(JSON.stringify([w.file, [...w.disk]])).toBe(before)
})

test('where mv runs and fails the live file is left as it was, said so, and no temporary file stays in the themes folder', async ($, on) => {
  const { w, source } = world(on, { theme: 'custom:loadout', live: { loadout: 'ghostrunner' }, badMv: true })
  await $.session.start(START)
  expect((await $.command.run(typed('loadout', 'kirby'))).text).toBe(`Not changed: ${THEMES}/loadout.json could not be written (Error: mv: cannot move: Permission denied).`)
  expect([source(), w.removed, [...w.disk.keys()].filter(name => name.endsWith('.tmp'))]).toEqual(['custom:ghostrunner', ['.loadout.abc-123.tmp'], []])
  expect((await $.command.run(typed('loadout', 'status'))).text?.split('\n')[0]).toBe('Theme: custom:ghostrunner (the global theme, live through loadout.json).')
})

test('/theme opened and left with Esc is no change of theme: a first /loadout <theme> soon after still leaves this terminal on its start theme, and every later answer says so', async ($, on) => {
  const { w, user, source, clock } = world(on, { theme: 'custom:kirby' })
  on('command.run', { command: 'theme' }, () => ({ text: '' }))
  await $.session.start(START)
  const run = async (args: string) => (await $.command.run(typed('loadout', args))).text ?? ''
  // The picker opened and escaped (probed: nothing is set), or the theme it runs picked again: this terminal is where it was.
  await $.command.run(typed('theme'))
  await $.command.run(typed('theme'))
  await $.config.set(picked('custom:kirby'))
  await clock.advance(20_000)
  expect((await run('ghost')).split('\n')).toEqual(['Copied. Press Ctrl+D, paste, Enter.', 'claude --resume abc-123', BEHIND('ghostrunner', 'kirby')])
  expect([user(), source()]).toEqual(['custom:loadout', 'custom:ghostrunner'])
  // The setting now names the live theme, by the plugin's own write: this terminal is not on it, however long it runs.
  for (const wait of [1600, 4400, 60_000]) {
    await clock.advance(wait)
    expect((await run('status')).split('\n')[0]).toBe('Theme: custom:kirby (the theme this terminal started with; the global theme is now custom:ghostrunner, shown at its next start).')
  }
  const again = (await run('edge')).split('\n')
  expect(again).toEqual(['Copied. Press Ctrl+D, paste, Enter.', 'claude --resume abc-123', BEHIND('cyberpunk-edgerunners', 'kirby')])
  expect(/every terminal/.test(again.join(' '))).toBe(false)
  expect((await run('status')).split('\n')[0]).toContain('Theme: custom:kirby (the theme this terminal started with;')
  expect(w.sets).toEqual(['custom:kirby'])
})

test('a terminal left on its start theme whose person picks "Loadout: …" in /theme is on the live theme from then on: followed at once, and switching is instant', async ($, on) => {
  const { w, user, source, clock } = world(on, { theme: 'custom:kirby' })
  await $.session.start(START)
  const run = async (args: string) => (await $.command.run(typed('loadout', args))).text ?? ''
  expect((await run('ghost')).split('\n')[2]).toBe(BEHIND('ghostrunner', 'kirby'))
  await clock.advance(9000)
  // The pick is the theme the setting already names: no settings row moves, and the terminal repaints all the same.
  await $.config.set(picked('custom:loadout'))
  expect([user(), (await run('status')).split('\n')[0]]).toEqual(['custom:loadout', 'Theme: custom:ghostrunner (the global theme, live through loadout.json).'])
  expect((await run('status')).split('\n')[1]).toContain('Pack: the built-in table (ghostrunner red, dark,')
  const writes = w.writes.length
  expect(await run('edge')).toBe('Loadout cyberpunk-edgerunners: every terminal.')
  expect([source(), w.copied.length, w.writes.slice(writes)]).toEqual(['custom:cyberpunk-edgerunners', 1, [TEMP]])
  // And off it again, by the same way: a theme that is no live file is what this terminal then shows.
  await $.config.set(picked('dark'))
  await clock.advance(4400)
  expect((await run('status')).split('\n')[0]).toBe('Theme: dark (the global theme).')
  expect((await run('kirby')).split('\n')[2]).toBe(BEHIND('kirby', 'dark'))
})

test('a theme whose file cannot be read changes nothing at all, the setting neither, where a live file is already there and the global theme is another', async ($, on) => {
  const { w, source } = world(on, { theme: 'custom:ghostrunner', live: { loadout: 'kirby' } })
  w.disk.set('kirby-pink.json', { text: '{ not json', mtimeMs: 3 })
  await $.session.start(START)
  const before = JSON.stringify([w.file, [...w.disk]])
  expect((await $.command.run(typed('loadout', 'pink'))).text).toBe(`Not changed: ${THEMES}/kirby-pink.json could not be read as a theme.`)
  expect([JSON.stringify([w.file, [...w.disk]]), w.writes, w.sets, w.copied, source()]).toEqual([before, [], [], [], 'custom:kirby'])
  // The picker's press, the same: it does offer such a file.
  const ui = await $.ui.mount(pane(60, 34))
  await ui.press({ key: 'loadout' })
  await ui.press({ key: 'loadout:custom:kirby-pink' })
  await ui.unmount()
  expect([JSON.stringify([w.file, [...w.disk]]), w.writes, w.toasts.at(-1)]).toEqual([before, [], `Not changed: ${THEMES}/kirby-pink.json could not be read as a theme.`])
})

test('with no clipboard the restart line is still given, and said not to be copied', async ($, on) => {
  const { w } = world(on, { hasClipboard: false })
  await $.session.start(START)
  const here = ((await $.command.run(typed('loadout', 'kirby here'))).text ?? '').split('\n')
  expect(here[0]).toBe('Not copied: no clipboard here. Press Ctrl+D, then run the line below.')
  expect(here[1]).toMatch(/\/bin\/loadout kirby --resume abc-123$/)
  expect([w.copied, w.writes, w.sets]).toEqual([[], [], []])
  // The same for the first switch everywhere, which did write: the setting is said, the line given.
  const all = ((await $.command.run(typed('loadout', 'kirby'))).text ?? '').split('\n')
  expect(all).toEqual(['Not copied: no clipboard here. Press Ctrl+D, then run the line below.', 'claude --resume abc-123', BEHIND('kirby', 'ghostrunner')])
})

test('on a terminal pinned at its start to a theme that is no live file: /loadout <theme> changes the others and says this one stays; follow hands the line that releases it', async ($, on) => {
  const { w, user, source } = world(on, { pinned: 'custom:kirby' })
  await $.session.start(START)
  const run = async (args: string) => (await $.command.run(typed('loadout', args))).text ?? ''
  expect((await run('')).split('\n')[0]).toBe('Loadout: kirby (pinned to this terminal at its start; the global theme is custom:ghostrunner). Pick one in the Avatar pane, or by name.')
  expect(await run('light')).toBe('Loadout light set for the terminals that follow the global theme. This one stays on custom:kirby (pinned at its start): /loadout follow releases it.')
  expect([user(), source(), w.copied]).toEqual(['custom:loadout', 'light', []])
  expect(await run('kirby here')).toBe('Nothing to do: this terminal is already pinned to kirby.')
  const follow = (await run('follow')).split('\n')
  expect(follow.slice(0, 2)).toEqual(['Copied. Press Ctrl+D, paste, Enter.', 'claude --resume abc-123'])
  expect(follow[2]).toBe('Nothing changed yet: this terminal is pinned to kirby since its start. That line starts this conversation again without the pin: it then follows the global theme (light).')
  expect(w.copied).toEqual(['claude --resume abc-123'])
  expect((await run('status')).split('\n')[0]).toBe('Theme: custom:kirby (pinned to this terminal at its start; the global theme is light).')
})

for (const [where, init] of [
  ['started in the home directory', { cwd: HOME }],
  ['started there by another spelling of the path', { cwd: `${HOME}/projects/../` }],
  ['where the home directory is reached through a link', { cwd: '/data/home/u', real: { [SETTINGS]: '/data/home/u/.claude/settings.json' } }],
] as const) {
  test(`a session ${where} reads the user's own settings file as the project's: that is "your global settings", and the theme still changes everywhere`, async ($, on) => {
    const { w, user, source } = world(on, { ...init, project: true, theme: 'custom:loadout', live: { loadout: 'ghostrunner' } })
    await $.session.start(START)
    const run = async (args: string) => (await $.command.run(typed('loadout', args))).text ?? ''
    expect((await run('')).split('\n')[0]).toBe('Loadout: ghostrunner (set by your global settings). Pick one in the Avatar pane, or by name.')
    expect((await run('status')).split('\n')[0]).toBe('Theme: custom:ghostrunner (set by your global settings, live through loadout.json).')
    expect(`${await run('')}${await run('status')}`.includes('of this project')).toBe(false)
    // Nothing outranks the global settings there: a change reaches this terminal too, and follow has nothing to release.
    expect(await run('follow')).toBe('Nothing to do: this terminal already follows the global theme (ghostrunner).')
    expect(await run('kirby')).toBe('Loadout kirby: every terminal.')
    expect([user(), source(), w.writes.includes(SETTINGS)]).toEqual(['custom:loadout', 'custom:kirby', false])
    expect((await run('')).split('\n')[0]).toBe('Loadout: kirby (set by your global settings). Pick one in the Avatar pane, or by name.')
    // /avatar theme says the same.
    expect(((await $.command.run(typed('avatar', 'theme'))).text ?? '').split('\n')[0]).toBe('Theme here: custom:kirby (set by your global settings).')
  })
}

test('a project whose own settings file sets the theme keeps the project wording: it really is another file', async ($, on) => {
  const { user, source } = world(on, { cwd: '/work/app', project: 'light' })
  await $.session.start(START)
  const run = async (args: string) => (await $.command.run(typed('loadout', args))).text ?? ''
  expect((await run('')).split('\n')[0]).toBe('Loadout: light (set by .claude/settings.json of this project). Pick one in the Avatar pane, or by name.')
  expect((await run('status')).split('\n')[0]).toBe('Theme: light (set by .claude/settings.json of this project).')
  expect(await run('kirby')).toBe('Loadout kirby is now the global theme. This terminal stays on light: .claude/settings.json of this project sets it.')
  expect([user(), source()]).toEqual(['custom:loadout', 'custom:kirby'])
  expect(await run('follow')).toBe('Nothing changed: this terminal\'s theme (light) is set by .claude/settings.json of this project. Remove the "theme" key there and it follows the global theme (kirby).')
})

test('under a managed theme /loadout changes nothing and says who sets it', async ($, on) => {
  const { w } = world(on, { policy: 'dark' })
  await $.session.start(START)
  for (const args of ['kirby', 'kirby here', 'follow']) expect((await $.command.run(typed('loadout', args))).text).toContain('your organization sets the theme')
  expect([w.sets, w.writes, w.copied]).toEqual([[], [], []])
})

test('/loadout avatar and flow open that pane; frames, background and style are switched and kept; status and help say it all', async ($, on) => {
  const { w } = world(on)
  on('ui.render', ($e, e) => {
    const { Text } = $e.ui.resolve(e)

    return <Text>{`engine ${e.component}`}</Text>
  })
  await $.session.start(START)
  const run = async (args: string) => (await $.command.run(typed('loadout', args))).text ?? ''
  w.opened.length = 0
  expect(await run('avatar')).toBe('Avatar pane opened.')
  expect(await run('flow')).toBe('Flow map opened.')
  expect(w.opened).toEqual(['kirby', 'flow-map'])

  // Frames: a conversation row is framed, then drawn as the engine draws it.
  const row = { plugin: 'loadout', surface: 'terminal', component: 'ToolUse', viewport: { columns: 100, rows: 40 }, props: { tool_use_id: 't1', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false } } as const
  const ui = await $.ui.mount(row)
  expect((await ui.find({ type: 'Box' }))?.props.borderStyle).toBe('round')
  expect(await run('frames off')).toMatch(/^Frames off/)
  expect(w.kept.get('isOn')).toBe(false)
  expect(await ui.find({ type: 'Box' })).toBeUndefined()
  expect(await run('frames')).toBe('Usage: /loadout frames on|off (now off).')
  expect(await run('frames on')).toMatch(/^Frames on/)
  expect([w.kept.get('isOn'), (await ui.find({ type: 'Box' }))?.props.borderStyle]).toEqual([true, 'round'])
  await ui.unmount()

  expect(await run('background off')).toBe('The terminal background is your own again.')
  expect(w.kept.get('background')).toBe(false)
  expect(await run('background')).toBe('Usage: /loadout background on|off (now off).')
  expect(await run('background on')).toBe('The terminal background follows the theme.')
  expect(await run('style text')).toBe('The character is drawn in text characters.')
  expect(w.kept.get('style')).toBe('text')
  expect(await run('style')).toBe('Usage: /loadout style pixel|text|auto (now text).')

  // Status: the three parts in four lines.
  w.panes = [{ id: 'kirby', title: 'Avatar', isShown: true, isFocused: false, isPlaced: true }]
  const status = (await run('status')).split('\n')
  expect(status.length).toBe(4)
  expect(status[0]).toBe('Theme: custom:ghostrunner (the global theme).')
  expect(status[1]).toMatch(/^Pack: the built-in table \(\w+ red, dark, background #[0-9a-f]{6}\)\. Packs: none found/)
  expect(status[2]).toBe(`Pictures: not found. Footage: ${['ghostrunner', 'edgerunners', 'initiald', 'y2k', 'y2kdark', 'halo', 'halodark'].flatMap(world => ['opus', 'sonnet', 'haiku', 'fable'].map(form => `${world}-${form} missing`)).join(', ')}.`)
  expect(status[3]).toBe('Avatar pane: open, style text, background on. Flow map: closed. Frames: on.')

  expect(await run('help')).toBe(HELP)
  for (const form of ['/loadout <theme> ', '/loadout <theme> here', '/loadout follow', '/loadout avatar | flow', '/loadout frames on|off', '/loadout background on|off', '/loadout style pixel|text|auto', '/loadout status']) expect(HELP).toContain(form)
  expect(HELP.split('\n').every(line => line.length <= 100)).toBe(true)
})

// --- the aliases -----------------------------------------------------------------------------

test('/avatar, /kirby, /flow and /colors still answer as before, each ending with its /loadout form', async ($, on) => {
  const { w, user, source } = world(on, { theme: 'custom:loadout', live: { loadout: 'ghostrunner' } })
  await $.session.start(START)
  const last = async (command: string, args = '') => {
    const text = (await $.command.run(typed(command, args))).text ?? ''

    return [text.split('\n')[0], text.split('\n').pop()]
  }
  expect(await last('avatar')).toEqual(['Avatar pane opened.', 'Also: /loadout avatar (the pane) · /loadout (the theme picker).'])
  expect(await last('kirby')).toEqual(['Avatar pane opened.', 'Also: /loadout avatar (the pane) · /loadout (the theme picker).'])
  // (`/avatar theme` is /loadout's own switch under the older words: the same live files, the same answers.)
  expect(await last('avatar', 'theme kirby all')).toEqual(['Loadout kirby: every terminal.', 'Also: /loadout <theme> · /loadout <theme> here · /loadout follow.'])
  expect([user(), source()]).toEqual(['custom:loadout', 'custom:kirby'])
  expect((await last('kirby', 'theme soft here'))[0]).toBe('No theme "soft".') // the alias keeps its exact names
  expect(((await $.command.run(typed('avatar', 'theme cyberpunk-edgerunners here'))).text ?? '').split('\n')[1]).toMatch(/^\S+\/bin\/loadout cyberpunk-edgerunners --resume abc-123$/)
  expect(await last('avatar', 'background off')).toEqual(['The terminal background is your own again.', 'Also: /loadout background on|off.'])
  expect(await last('avatar', 'style')).toEqual(['Usage: /avatar style pixel|text|auto (now auto).', 'Also: /loadout style pixel|text|auto.'])
  expect((await last('avatar', 'status'))[1]).toBe('Also: /loadout status.')
  expect(await last('flow')).toEqual(['Flow map opened.', 'Also: /loadout flow.'])
  expect(await last('colors', 'off')).toEqual(['Colours off: every row is drawn as Claude Code draws it. /colors turns them back on.', 'Also: /loadout frames on|off.'])
  expect((await last('colors', 'on'))[1]).toBe('Also: /loadout frames on|off.')
  expect(await last('colors', 'maybe')).toEqual(['Usage: /colors [on|off]. Also: /loadout frames on|off.', 'Usage: /colors [on|off]. Also: /loadout frames on|off.'])
  expect(w.opened.filter(id => id === 'flow-map').length).toBeGreaterThan(0)
})

// --- the picker --------------------------------------------------------------------------------

for (const [theme, skin] of [['custom:kirby', 'rounded'], ['dark', 'rounded'], ['custom:ghostrunner', 'hud'], ['custom:cyberpunk-edgerunners', 'hud']] as const) {
  test(`the picker heads the Avatar pane in the family's skin (${theme}): folded to one line, open a row per theme with digits, swatches and a mark; a press switches every terminal and folds it`, async ($, on) => {
    // (The terminal runs the live theme, written from ${theme}: the picker shows the source, and never the live file.)
    const { w, user, source, clock } = world(on, { theme: 'custom:loadout', live: { loadout: theme.replace('custom:', '') } })
    await $.session.start(START)
    const ui = await $.ui.mount(pane(60, 34))
    const name = { 'custom:kirby': 'Kirby', dark: 'dark', 'custom:ghostrunner': 'Ghostrunner', 'custom:cyberpunk-edgerunners': 'Cyberpunk Edgerunners' }[theme]
    const said = (text: string) => (skin === 'hud' ? text.toUpperCase() : text)

    // Folded: "loadout: <name> [ change ]" (the caption gives way where the name is long), never wider than the pane's 33 columns.
    const folded = pickerOf(await ui.drawn())
    expect(folded.lines.length).toBe(1)
    expect(folded.lines[0]).toMatch(new RegExp(`^(${said(skin === 'hud' ? 'loadout // ' : 'loadout: ')}|// )?${said(name)} \\[ ${said('change')} \\]$`))
    if (name.length <= 9) expect(folded.lines[0]?.startsWith(said('loadout'))).toBe(true)
    expect(folded.widths[0]).toBeLessThan(34)
    const mascotRows = (await ui.find({ key: 'kirby' }))?.props.rows

    // Open: the caption, one row per theme (customs first), a foot on the rounded skin.
    await ui.press({ key: 'loadout' })
    const open = pickerOf(await ui.drawn())
    expect(open.lines.length).toBe(11 + (skin === 'hud' ? 1 : 2))
    expect(open.lines[0]).toMatch(skin === 'hud' ? /^╱─ LOADOUTS ─+ 0: CLOSE ┐$/ : /^╭─ loadouts ─+ 0: close ╮$/)
    const rows = open.lines.slice(1, 12)
    expect(rows.map(line => line.replace(/^│ /, '').slice(0, 4))).toEqual(Array<string>(11).fill('████'))
    expect(rows.slice(0, 9).map(line => /█ (\d): /.exec(line)?.[1])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(rows.slice(9).some(line => /\d: /.test(line))).toBe(false)
    // (The rounded frame leaves a name 19 cells: the longest is cut there, and whole on the HUD.)
    expect(rows.map(line => line.replace(/^│ /, '').replace(/^████ +(\d: )?/, '').replace(/[ ●◆│]+$/, ''))).toEqual([skin === 'hud' ? 'Cyberpunk Edgerunners' : 'Cyberpunk Edgerunn…', 'Ghostrunner', 'Kirby', 'Kirby Pink', ...BUILT_IN].map(said))
    // The mark is on the theme in use, and on it alone.
    expect(rows.filter(line => /[●◆]/.test(line)).map(line => line.includes(said(name)))).toEqual([true])
    if (skin === 'rounded') expect(open.lines[12]).toBe(`╰${'─'.repeat(31)}╯`)
    // Its own colours: a custom theme's four, in a row of its own.
    const swatches = (await ui.findAll({ type: 'Text' })).filter(text => text.text === '█' && /^#/.test(String(text.props.color))).map(text => text.props.color)
    expect(swatches.slice(0, 4)).toEqual(['#9be564', '#f2f5e6', '#4fd6a0', '#ffc107'])
    expect(swatches.length).toBe(44)
    // Every line is the pane's 33 columns, no more.
    expect(open.widths.every(width => width === 33)).toBe(true)
    // The avatar is still there under it, its size unchanged on a tall pane; the pane's other controls too.
    expect((await ui.find({ key: 'kirby' }))?.props.rows).toBe(mascotRows)
    expect(await ui.find({ key: 'pet' })).toBeDefined()

    // A press on a row (or its digit): that theme for every terminal, the picker folded to its line.
    const target = 'custom:kirby-pink'
    expect((await ui.find({ key: `loadout:${target}` }))?.props.hotkey).toBe('4')
    await ui.press({ key: `loadout:${target}` })
    expect([user(), source()]).toEqual(['custom:loadout', target])
    expect(w.toasts).toEqual([`Loadout ${target.slice(7)}: every terminal.`])
    // At once, with no tick: the line names it, and the mark has moved to its row.
    expect(pickerOf(await ui.drawn()).lines).toEqual(['loadout: Kirby Pink [ change ]'])
    await ui.press({ key: 'loadout' })
    expect(pickerOf(await ui.drawn()).lines.filter(line => /[●◆]/.test(line)).map(line => line.includes('Kirby Pink'))).toEqual([true])
    await clock.advance(4400)
    expect(pickerOf(await ui.drawn()).lines.filter(line => /[●◆]/.test(line)).map(line => line.includes('Kirby Pink'))).toEqual([true])
    // A built-in theme is a live file too, not the engine's setting; 0 folds the picker without choosing.
    await ui.press({ key: 'loadout:light' })
    expect([user(), source(), w.sets]).toEqual(['custom:loadout', 'light', []])
    await ui.press({ key: 'loadout' })
    expect((await ui.find({ key: 'loadout' }))?.props.hotkey).toBe('0')
    await ui.press({ key: 'loadout' })
    expect(pickerOf(await ui.drawn()).lines.length).toBe(1)
    expect(source()).toBe('light')
    await ui.unmount()
  })
}

test('a press in the picker on a terminal that runs another theme sets the live theme and says this terminal shows it at its next start; the mark stays on what it shows', async ($, on) => {
  const { w, user, source, clock } = world(on, { theme: 'custom:kirby' })
  await $.session.start(START)
  const ui = await $.ui.mount(pane(60, 34))
  await ui.press({ key: 'loadout' })
  await ui.press({ key: 'loadout:custom:ghostrunner' })
  expect([user(), source()]).toEqual(['custom:loadout', 'custom:ghostrunner'])
  expect(w.toasts).toEqual([`${BEHIND('ghostrunner', 'kirby')} "/loadout ghostrunner" gives the line that starts it again.`])
  expect(pickerOf(await ui.drawn()).lines).toEqual(['loadout: Kirby [ change ]'])
  await clock.advance(9000)
  await ui.press({ key: 'loadout' })
  expect(pickerOf(await ui.drawn()).lines.filter(line => /[●◆]/.test(line)).map(line => line.includes('Kirby '))).toEqual([true])
  await ui.unmount()
})

for (const theme of ['custom:kirby', 'custom:ghostrunner'] as const) {
  test(`on a short pane the picker stays folded so the avatar keeps its rows; in a narrow one no line is wider than the pane (${theme})`, async ($, on) => {
    const { w } = world(on, { theme })
    let lastMascot = 0
    const trace: string[] = []
    await $.session.start(START)
    await $.command.run(typed('loadout')) // asks for the picker open
    // Tall: open, the mascot under it.
    const tall = await $.ui.mount(pane(60))
    expect(pickerOf(await tall.drawn()).lines.length).toBeGreaterThan(11)
    expect(Number((await tall.find({ key: 'kirby' }))?.props.rows)).toBeGreaterThan(0)
    await tall.unmount()
    // Shorter and shorter: the picker folds to its line before the avatar loses a row it needs, whatever was asked;
    // the pane is never taller than its rows.
    const heads: number[] = []
    for (const rows of [44, 34, 30, 26, 20]) {
      const short = await $.ui.mount(pane(rows))
      const head = pickerOf(await short.drawn()).lines.length
      heads.push(head)
      const mascot = Number((await short.find({ key: 'kirby' }))?.props.rows ?? 0)
      // Open, the avatar's own rows (its chrome and its mascot) still fit under the picker.
      if (head > 1) expect(head + 14 + mascot).toBeLessThan(rows + 1)
      expect(((await short.drawn()) as { props: { height: number } }).props.height).toBe(rows)
      await short.unmount()
    }
    expect(heads.slice(-2)).toEqual([1, 1])
    expect(heads[0]).toBeGreaterThan(11)
    // Too short to unfold, the button and the command still answer: a word of why, and the button is not left a press behind.
    const low = await $.ui.mount(pane(26))
    expect(w.toasts).toEqual([])
    await low.press({ key: 'loadout' })
    await low.press({ key: 'loadout' })
    expect(w.toasts).toEqual([NO_ROOM, NO_ROOM])
    expect(pickerOf(await low.drawn()).lines.length).toBe(1)
    await $.command.run(typed('loadout'))
    await low.drawn()
    expect(w.toasts).toEqual([NO_ROOM, NO_ROOM, NO_ROOM])
    await low.unmount()
    // A taller pane after that unfolds it at the first press, and says nothing.
    const high = await $.ui.mount(pane(60))
    await high.drawn()
    expect(pickerOf(await high.drawn()).lines.length).toBeGreaterThan(11)
    await high.press({ key: 'loadout' })
    expect(pickerOf(await high.drawn()).lines.length).toBe(1)
    await high.press({ key: 'loadout' })
    expect(pickerOf(await high.drawn()).lines.length).toBeGreaterThan(11)
    expect(w.toasts.length).toBe(3)
    await high.unmount()
    // The folded line never costs the pane its mascot: at every height the avatar draws one without the picker's
    // line (a pane one row taller than a pane of `rows - 1`), it draws one with it, the line given up where it must.
    let given = 0
    for (let rows = 12; rows <= 40; rows++) {
      const ui = await $.ui.mount(pane(rows))
      await ui.drawn()
      const mascot = Number((await ui.find({ key: 'kirby' }))?.props.rows ?? 0)
      if ((await ui.find({ key: 'loadout' })) === undefined) {
        given++
        expect(mascot).toBeGreaterThan(0)
      }
      trace.push(`${rows}:${mascot}`)
      if (mascot === 0 && rows > 12) expect(lastMascot).toBe(0)
      lastMascot = mascot
      expect(((await ui.drawn()) as { props: { height: number } }).props.height).toBe(rows)
      await ui.unmount()
    }
    // (Kirby's mascot is drawn at every height: its line is never given up. The mask's first height is the one row that gives it up.)
    expect(given).toBe(theme === 'custom:ghostrunner' ? 1 : 0)
    if (theme === 'custom:ghostrunner') expect(trace.slice(10, 13)).toEqual(['22:0', '23:6', '24:6'])
    // Narrow and wide: every line of the picker, open and folded, fits the pane (its body less the dock's last column).
    for (const columns of [22, 28, 34, 46]) {
      const ui = await $.ui.mount(pane(60, columns))
      const head = pickerOf(await ui.drawn())
      expect(head.lines.length).toBeGreaterThan(11)
      expect(head.widths.every(width => width === columns - 1)).toBe(true)
      await ui.press({ key: 'loadout' })
      expect(pickerOf(await ui.drawn()).widths.every(width => width <= columns - 1)).toBe(true)
      await ui.press({ key: 'loadout' })
      await ui.unmount()
    }
  })
}

// --- what the old mods kept --------------------------------------------------------------------

test('what the three old mods kept is copied into this plugin\'s store, once: the installed copy\'s, known keys only, a key already set left alone', async ($, on) => {
  const { w } = world(on, {
    theme: 'custom:kirby',
    store: { style: 'pixel' },
    old: {
      'kirby-hud_mods-111111111111.json': JSON.stringify({ pets: 7, background: false, style: 'text', other: 'left behind' }),
      'kirby-hud_inline-3d0def710133.json': JSON.stringify({ pets: 99 }),
      'flow-map_mods-222222222222.json': JSON.stringify({ hist: { 'a:fix': [2, 2_897_622] } }),
      'color-rows_mods-000000000000.json': JSON.stringify({ isOn: false }),
      'someone-else_x-1.json': JSON.stringify({ pets: 1 }),
      'flow-map_inline-7abd5e8868a7.json': '{ broken',
    },
  })
  await $.session.start(START)
  expect(Object.fromEntries(w.kept)).toEqual({
    style: 'pixel', pets: 7, background: false, hist: { 'a:fix': [2, 2_897_622] }, isOn: false,
    migrated: { from: ['kirby-hud_mods-111111111111.json', 'flow-map_mods-222222222222.json', 'color-rows_mods-000000000000.json'], keys: ['pets', 'background', 'hist', 'isOn'] },
  })
  expect(w.reads.filter(path => path.startsWith(STORES)).length).toBe(3)
  // The parts start from it: the pets counted, the frames off, the background switch off.
  const ui = await $.ui.mount(pane())
  expect((await ui.findAll({ type: 'Text' })).map(text => text.text)).toContain('♥ 7')
  await ui.unmount()
  expect((await $.command.run(typed('loadout', 'status'))).text).toContain('style pixel, background off. Flow map: closed. Frames: off.')
  // Once: a later start reads no old store again, and what changed since is not overwritten.
  w.kept.set('pets', 8)
  await $.session.start(START)
  expect(w.reads.filter(path => path.startsWith(STORES)).length).toBe(3)
  expect(w.kept.get('pets')).toBe(8)
})

test('with no old store nothing is copied or recorded', async ($, on) => {
  const { w } = world(on)
  await $.session.start(START)
  expect([...w.kept.keys()]).toEqual([])
})

test('a development copy\'s store is taken when no installed one is there', async ($, on) => {
  const { w } = world(on, { old: { 'kirby-hud_inline-3d0def710133.json': JSON.stringify({ pets: 3 }) } })
  await $.session.start(START)
  expect([w.kept.get('pets'), w.kept.get('migrated')]).toEqual([3, { from: ['kirby-hud_inline-3d0def710133.json'], keys: ['pets'] }])
})

// --- three parts, one plugin ---------------------------------------------------------------------

test('the three parts start together in one plugin: every command, the tool under the plugin\'s name and the prompt section that names it', async ($, on) => {
  const { w } = world(on, { theme: 'custom:kirby' })
  on('prompt.compose', () => ({ sections: [] }))
  await $.session.start(START)
  expect([...w.commands].sort()).toEqual(['avatar', 'colors', 'flow', 'kirby', 'loadout'])
  expect(w.tools).toEqual(['steps'])
  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], outputStyle: null, traits: [], tools: ['mcp__loadout__steps'] })
  expect(composed.sections.map(section => section.id)).toEqual(['flow-map:steps'])
  expect(composed.sections[0]?.text).toContain('call the mcp__loadout__steps tool')
  // The tool answers under that name, with the input it always took.
  const posted = await $.tool.call({ tool: 'mcp__loadout__steps', tool_use_id: 's1', title: 'Ship it', steps: [{ label: 'Build', status: 'active' }, { label: 'Test', status: 'pending' }] })
  expect(posted.result).toBe('Plan shown: step 1 of 2.')
  // One subagent through the events the parts share (agent.spawn, tool.call, turn.complete): both panes tell of it.
  await $.turn.start({ text: 'go on', turnId: 'main' })
  await $.agent.spawn({ tool_use_id: 'spawn-1', prompt: 'look around', description: 'scout', subagentType: 'general-purpose', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-sonnet-5-5', background: false, fork: false })
  expect((await $.tool.call({ tool: 'Read', tool_use_id: 't1', file_path: '/tmp/a', agentId: 'a1' } as never)).result).toBe('ok')
  const texts = async (requestId: 'kirby' | 'flow-map') => {
    const ui = await $.ui.mount({ ...pane(60, 56), requestId })
    const all = (await ui.findAll({ type: 'Text' })).map(text => String(text.text)).join('\n')
    await ui.unmount()

    return all
  }
  expect(await texts('kirby')).toContain('scout')
  expect(await texts('flow-map')).toContain('scout')
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 1, isAborted: false, turnId: 'a1', agentId: 'a1' } as never)
  expect(await texts('kirby')).toContain('done ✔')
  expect(await texts('flow-map')).toMatch(/scout[^\n]*|done/)
})

test('a part that fails at the start does not cost the others their own', async ($, on) => {
  const { w } = world(on, { noTool: true })
  await $.session.start(START)
  // The Flow map could not register its tool; the avatar, the frames and /loadout are there all the same.
  expect(w.tools).toEqual([])
  for (const command of ['avatar', 'kirby', 'loadout', 'colors']) expect(w.commands).toContain(command)
  expect((await $.command.run(typed('loadout', 'kirby'))).text).toContain('Loadout kirby is set')
})

test('a first start puts the colour files the plugin ships in the themes folder: the missing ones only, a file already there left as it is, and nothing that is no theme', async ($, on) => {
  const mine = themeFile('kirby')
  const shipped = { 'kirby.json': '{ "name": "Kirby", "base": "dark", "overrides": { "claude": "#000000" } }', 'initial-d.json': '{ "name": "Initial D", "base": "dark", "overrides": {} }', 'broken.json': '[1]', '../evil.json': '{ "base": "dark", "overrides": {} }', 'Evil.json': '{ "base": "dark", "overrides": {} }', 'a..b.json': '{ "base": "dark", "overrides": {} }', 'notes.txt': 'x' }
  const { w } = world(on, { shipped })
  await $.session.start(START)
  expect(w.writes).toEqual([`${THEMES}/initial-d.json`])
  expect([w.disk.get('initial-d.json')?.text, w.disk.get('kirby.json')?.text]).toEqual([shipped['initial-d.json'], mine])
  // The theme is there to pick from then on.
  expect((await $.command.run(typed('loadout', 'initial'))).text).toContain('Loadout initial-d is set')
})
