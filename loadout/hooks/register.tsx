// Loadout: one plugin, three parts. The engine takes one hooks module per plugin (a second entry in
// hooks.json is refused), so this is the plugin's module: it loads the Flow map, the avatar (with
// the /loadout command, beside the theme code it runs) and the frames, each from its own folder. An event takes a single
// hook without a matcher in a module, so where several parts hook the same event each stands under
// `{}`, the matcher any input matches; the one hook without a matcher is this file's, below.
import type { EngineInterface, Register } from 'claude-code'

import { register as avatar } from '../avatar/hooks/register'
import { register as flow } from '../flow/hooks/register'
import { register as frames } from '../frames/hooks/register'

// What the three mods kept between sessions before they were one plugin, each in a store of its own.
// A store is its plugin's alone, so Loadout's starts empty: these keys are copied into it, once.
const KEPT = { 'kirby-hud': ['pets', 'background', 'style'], 'flow-map': ['hist'], 'color-rows': ['isOn'] } as const

/**
 * Copies what the three old mods kept into this plugin's store, once: read from their store files
 * (`<config>/plugins/store/<plugin>_<marketplace>-<id>.json`, as this build writes them), the
 * installed copy's before a development copy's, a key this store already has left as it is.
 * With no such folder nothing is recorded, and the next session looks again.
 */
async function migrate($: EngineInterface): Promise<void> {
  if ((await $.store.get('migrated')) !== undefined) return
  const home = (await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined)) ?? `${(await $.env.get('HOME').catch(() => undefined)) ?? '~'}/.claude`
  const dir = `${home}/plugins/store`
  const listed = await $.fs.list(dir).catch(() => null)
  if (!Array.isArray(listed)) return
  const mine = new Set(await $.store.keys().catch(() => []))
  const copied: string[] = []
  const from: string[] = []
  for (const [old, keys] of Object.entries(KEPT)) {
    const isDev = (name: string) => name.startsWith(`${old}_inline-`)
    const file = listed.filter(one => one.kind === 'file' && one.name.startsWith(`${old}_`) && one.name.endsWith('.json'))
      .sort((a, b) => Number(isDev(a.name)) - Number(isDev(b.name)) || b.mtimeMs - a.mtimeMs)[0]
    if (file === undefined) continue
    const text = await $.fs.read(`${dir}/${file.name}`).then(got => (typeof got === 'string' ? got : ''), () => '')
    let was: unknown
    try {
      was = JSON.parse(text)
    } catch {
      continue
    }
    if (typeof was !== 'object' || was === null || Array.isArray(was)) continue
    from.push(file.name)
    for (const key of keys) {
      if (!Object.hasOwn(was, key) || mine.has(key)) continue
      await $.store.set(key, (was as Record<string, unknown>)[key])
      copied.push(key)
    }
  }
  await $.store.set('migrated', { from, keys: copied })
}

export const register: Register = (on, options) => {
  // First, so outermost: the parts beneath read the store at their own start.
  on('session.start', async ($, e, next) => {
    await migrate($).catch(() => {})

    return next(e)
  })

  // The Flow map before the avatar: its folded tab stands over the avatar's line of meters above the prompt.
  flow(on, options)
  avatar(on, options)
  frames(on, options)
}
