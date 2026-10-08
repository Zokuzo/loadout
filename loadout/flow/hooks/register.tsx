import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, FsEntry, Register, RenderElement, Timer } from 'claude-code'

import type { Agent, Call, History, Run, View } from '../../types'
import { agentKey, compose, isSeg, runKey, soloKey, tab, widthOf } from './draw'
import type { Act, Btn, Line, Seg } from './draw'
import { brief, chart, declared, enlist, frameOf, heal, healRun, histKey, isOver, isWayfinder, keepRuns, kindOf, lingering, MAX_CALLS, newRun, noted, parseMeta, parseSites, phaseKey, pickEffort, QUEUE_MS, runView, scratchOf, settled, soloAgent, sweep, toHistory, toPlan, withSolo } from './lib'
import { lookOf, toPack } from './palette'
import type { Pack } from './palette'
import { alone } from '../../hooks/part'
import type { Part } from '../../hooks/part'
import { liveOf } from '../../avatar/hooks/themes'

const PANE = 'flow-map'
const TITLE = 'Flow map'
const TOOL = 'mcp__loadout__steps'
// The dock width asked for: the handoff's default. The person's own drag or keys win over it.
const COLUMNS = 56
const [NARROWEST, WIDEST] = [34, 96]
// The live beat: the handoff redraws every 150 ms; the pane is drawn again only when a spinner frame (450 ms) or a second turned.
const FAST_MS = 150
const SLOW_MS = 1000
const MAP_MS = 5000
// The themes folder is listed again this often: an edited pack shows within a few seconds. With no folder found, far less often.
const PACKS_MS = 4000
const NO_PACKS_MS = 60_000
// With nothing running, the one thing still watched is the theme.
const IDLE_MS = 4000
// A stop is asked, then confirmed: not sooner than this after the question showed (a key held down, a double Enter), not later than that.
const ARM_MS = 500
const CONFIRM_MS = 15_000

/** The pane as `$.ui.open` takes it, and the view nobody touched yet: `/loadout flow` opens it from the avatar's file. */
export const FLOW_PANE = { id: PANE, title: TITLE, columns: COLUMNS } as const
export const VIEW: View = { folded: [], sel: '', open: [], mode: '', target: '', at: 0, hidden: false, cols: 0, colsFrom: 0, colsAt: 0 }
const runs = atom({ plugin: 'loadout', key: 'runs' } as const, [])
const plan = atom({ plugin: 'loadout', key: 'plan' } as const, null)
const now = atom({ plugin: 'loadout', key: 'now' } as const, 0)
const view = atom({ plugin: 'loadout', key: 'view' } as const, VIEW)
const way = atom({ plugin: 'loadout', key: 'way' } as const, { active: false, root: '', touched: '', chosen: '', hint: '', open: [] })
const wayMap = atom({ plugin: 'loadout', key: 'map' } as const, null)
const hist = atom({ plugin: 'loadout', key: 'hist' } as const, {})
const theme = atom({ plugin: 'loadout', key: 'flowTheme' } as const, '')
// The avatar part's (avatar/hooks/register.tsx writes them): the theme this terminal shows, a live theme file resolved to its source, and the setting it paints from.
const shownTheme = atom({ plugin: 'loadout', key: 'theme' } as const, '')
const painted = atom({ plugin: 'loadout', key: 'painted' } as const, '')
const solo = atom({ plugin: 'loadout', key: 'solo' } as const, [])
const packs = atom({ plugin: 'loadout', key: 'packs' } as const, { sig: '', list: [] })

/** The view as this version writes it: one kept in $.state by an earlier load has only its first two fields. */
const healView = (v: View): View => ({ ...VIEW, ...v })

const SECTION = {
  id: 'flow-map:steps',
  scope: 'session',
  text:
    `Step map: at the start of any task with 3 or more steps (a build, a video edit, research), call the ${TOOL} tool with a short title and the full ordered step list, one step "active". ` +
    'Call it again with the full list whenever a step changes status. It only updates a side pane the user watches; skip it for shorter tasks and inside subagents. ' +
    'While the wayfinder skill is active the pane already shows the wayfinder map read from its files: do not re-post the map through this tool.',
} as const

const STEPS_SCHEMA = {
  type: 'object',
  required: ['title', 'steps'],
  properties: {
    title: { type: 'string', description: 'What the task is, a few words.' },
    steps: {
      type: 'array',
      description: 'Every step of the plan, in order. Replaces the plan shown.',
      items: {
        type: 'object',
        required: ['label', 'status'],
        properties: {
          label: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'active', 'done', 'blocked'] },
        },
      },
    },
  },
}

const patchAgent = (list: Run[], hit: (a: Agent) => boolean, change: (a: Agent, r: Run) => [Agent, Partial<Run>?]) =>
  list.map(r => {
    const at = r.agents.findIndex(hit)
    const old = r.agents[at]
    if (old === undefined) return r
    const [agent, extra] = change(old, r)
    return { ...r, ...extra, agents: r.agents.map((a, i) => (i === at ? agent : a)) }
  })

// Bookkeeping never costs the event it watches: a write that fails is dropped.
const quiet = (work: Promise<unknown>) => work.catch(() => undefined)

const isAbsolute = (path: string) => /^(\/|[A-Za-z]:[\\/])/.test(path)

/**
 * Reads the wayfinder map from disk into the pane's state, when wayfinder is on.
 * Lists first: the files are read again only when a name, size or time changed,
 * so the slow tick costs a few listings. Every miss (no directory, a file gone
 * or too big) is an empty answer, never a throw.
 */
async function refresh($: EngineInterface) {
  const w = await read($, way)
  if (!w.active) return
  const ls = (path: string) => $.fs.list(path).catch((): FsEntry[] => [])
  const cat = (path: string) => $.fs.read(path).catch(() => null)
  const cwd = (await $.session.cwd().catch(() => '')).replace(/[\\/]+$/, '')
  // Where the session's own file calls pointed, then the working directory and up to the git root.
  const places = w.root === '' ? [] : [isAbsolute(w.root) ? w.root : `${cwd}/${w.root}`]
  for (let dir = cwd, i = 0; dir !== '' && i < 12; i++) {
    places.push(`${dir}/.scratch`)
    if (await $.fs.exists(`${dir}/.git`).catch(() => true)) break
    dir = dir.slice(0, Math.max(0, dir.replace(/\\/g, '/').lastIndexOf('/')))
  }
  type Effort = { name: string; mtimeMs: number; files: FsEntry[]; issues: FsEntry[] }
  let scratch = ''
  let efforts: Effort[] = []
  for (const place of places) {
    for (const d of await ls(place)) {
      if (d.kind !== 'dir') continue
      const files = (await ls(`${place}/${d.name}`)).filter(f => f.kind === 'file' && (f.name === 'map.md' || f.name === 'gitlab.json'))
      if (!files.some(f => f.name === 'map.md')) continue
      const issues = (await ls(`${place}/${d.name}/issues`)).filter(f => f.kind === 'file' && /^\d+.*\.md$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name))
      efforts.push({ name: d.name, mtimeMs: Math.max(0, ...[...files, ...issues].map(f => f.mtimeMs)), files, issues })
    }
    if (efforts.length > 0) {
      scratch = place
      break
    }
  }
  efforts = efforts.sort((a, b) => a.name.localeCompare(b.name))
  // A /wayfinder argument that names an effort is the person's own pick: it wins over an earlier one.
  const words = w.hint.split(/[\s/]+/)
  const named = efforts.find(e => words.includes(e.name))?.name
  if (w.hint !== '' && efforts.length > 0) await update($, way, v => ({ ...v, hint: '', ...(named === undefined ? {} : { touched: named, chosen: '' }) }))
  const name = pickEffort(efforts, named === undefined ? [w.chosen, w.touched] : [named])
  const mine = efforts.find(e => e.name === name)
  const old = await read($, wayMap)
  if (mine === undefined) {
    if (old !== null) await update($, wayMap, () => null)
    return
  }
  const names = efforts.map(e => e.name)
  const sig = [scratch, name, names.join(','), ...[...mine.files, ...mine.issues].map(f => `${f.name}:${f.size}:${f.mtimeMs}`)].join('|')
  if (old?.sig === sig) return
  const dir = `${scratch}/${name}`
  const issues: { name: string; text: string | null }[] = []
  for (const f of mine.issues) issues.push({ name: f.name, text: await cat(`${dir}/issues/${f.name}`) })
  const read1 = chart(name, (await cat(`${dir}/map.md`)) ?? '', issues, mine.files.some(f => f.name === 'gitlab.json') ? await cat(`${dir}/gitlab.json`) : null)
  await update($, wayMap, () => ({ ...read1, scratch, efforts: names, sig }))
}

/**
 * The active theme's name, what picks the palette: the config row "theme". Where a Loadout live theme
 * file is in play (the row or what this terminal paints from is `custom:loadout…`), the name is the
 * avatar part's, which reads the file's source and knows what this terminal still shows.
 */
async function syncTheme($: EngineInterface) {
  const rows = await $.config.list().catch(() => null)
  if (rows === null) return
  const row = String(rows.find(one => one.key === 'theme')?.value ?? '')
  const shown = await read($, shownTheme)
  const name = shown !== '' && (liveOf(row) !== undefined || liveOf(await read($, painted)) !== undefined) ? shown : row
  if (name !== (await read($, theme))) await update($, theme, () => name)
}

/**
 * The theme packs, read from the themes folder beside the mod (or inside it). Lists first: the files are read
 * again only when a name, size or time changed. A file that does not parse or is not a pack is skipped; with
 * no folder there is no pack and the built-in palettes draw. Never throws.
 */
async function loadPacks($: EngineInterface) {
  const root = $.plugin.root.replace(/[\\/]+$/, '')
  for (const dir of [`${root}/themes`, `${root.slice(0, Math.max(0, root.replace(/\\/g, '/').lastIndexOf('/')))}/themes`]) {
    const found = await $.fs.list(dir).catch(() => null)
    if (found === null) continue
    const files = found.filter(f => f.kind === 'file' && f.name.endsWith('.json') && f.name !== 'schema.json').sort((a, b) => a.name.localeCompare(b.name))
    const sig = [dir, ...files.map(f => `${f.name}:${f.size}:${f.mtimeMs}`)].join('|')
    if (sig === (await read($, packs)).sig) return
    const read1: Pack[] = []
    for (const f of files.slice(0, 60)) {
      const text = await $.fs.read(`${dir}/${f.name}`).catch(() => null)
      let json: unknown = null
      try {
        json = JSON.parse(text ?? 'null')
      } catch {
        // not JSON: skipped
      }
      const pack = toPack(json)
      if (pack !== null) read1.push(pack)
    }
    await update($, packs, () => ({ sig, list: read1 }))
    return
  }
  if ((await read($, packs)).sig !== '') await update($, packs, () => ({ sig: '', list: [] }))
}

// When the last run started or was resumed: the finished run still on screen leaves then (lib's lingering).
// Not kept in $.state: after a reload a finished run sent away less than 3 minutes before shows for what is left of them.
let begunAt = 0
/** The runs on screen: the live ones, then the finished one that lingers. Read at the engine's clock: the drawing's stands still while nothing moves. */
async function onScreen($: EngineInterface, list: Run[], clock: number): Promise<Run[]> {
  const live = list.filter(r => r.endedAt === null)
  if (live.length === list.length) return live
  const kept = lingering(list, await $.clock.now().catch(() => clock), begunAt)
  return kept === undefined ? live : [...live, kept]
}

// Agent ids seen on a tool call that $.agent.list() does not name: a workflow's agent whose spawn was missed, an engine fork. Not asked about twice.
const strangers = new Set<string>()
/**
 * A tool call from an agent the pane does not know: a plain subagent whose start was not seen (the mod loaded
 * after it) is taken in from $.agent.list(), which names plain subagents and teammates and no workflow agent.
 */
async function adopt($: EngineInterface, id: string): Promise<boolean> {
  if (strangers.has(id)) return false
  const row = (await $.agent.list().catch(() => [])).find(r => r.id === id)
  if (row === undefined || row.teammateId !== undefined) {
    if (strangers.size > 400) strangers.clear()
    strangers.add(id)
    return false
  }
  const at = await $.clock.now()
  await update($, solo, list => (list.some(a => a.id === id) ? list : withSolo(list, soloAgent({ key: `a:${id}`, id, label: row.description || row.type, kind: row.type, startedAt: at }))))
  return true
}

/** What $.agent.list() says ended, for a plain subagent whose last turn the pane did not see end. */
async function reconcile($: EngineInterface) {
  const rows = await $.agent.list().catch(() => null)
  if (rows === null) return
  const ends = new Map(rows.filter(r => r.status === 'completed' || r.status === 'failed' || r.status === 'killed').map(r => [r.id, r.status]))
  if (!(await read($, solo)).some(a => !isOver(a) && ends.has(a.id))) return
  const at = await $.clock.now()
  await update($, solo, list => list.map(a => {
    const how = isOver(a) ? undefined : ends.get(a.id)
    return how === undefined ? a : { ...a, status: how === 'completed' ? 'done' as const : 'failed' as const, stopped: how === 'killed', endedAt: Math.max(at, a.startedAt), calls: [] }
  }))
}

/** Whether anything of the mod is on screen: its pane shown and placed, or its folded tab. Unknown reads as shown. */
async function isOnScreen($: EngineInterface) {
  if (healView(await read($, view)).hidden) return true
  const panes = await $.ui.panes().catch(() => null)
  return panes === null || panes.some(pane => pane.id === PANE && pane.isShown && pane.isPlaced)
}

/** One more duration under each key, in the session's state and, for the sessions after, in the store. */
async function learn($: EngineInterface, facts: readonly (readonly [key: string, ms: number])[]) {
  if (facts.length === 0) return
  const next = await update($, hist, (h: History) => facts.reduce((all, [key, ms]) => noted(all, key, ms), h))
  await $.store.set('hist', next)
}

/** A run that completed teaches how long each of its phases took. */
const phaseFacts = (r: Run, h: History) =>
  runView(settled(healRun(r)), r.endedAt ?? 0, h).phases.filter(p => p.status === 'done' && p.agents.length > 0).map(p => [phaseKey(r.name, p.title), p.el] as const)

// The one timer. While a run is live and the mod is on screen it beats every FAST_MS and writes the clock the
// drawing reads when a spinner frame or a second turned; with the pane hidden, or only the wayfinder map to
// re-read, it beats every SLOW_MS and draws nothing; with neither a live run nor wayfinder it beats every IDLE_MS,
// only to see the theme change (the palette is redrawn when it does) and a finished run's 3 minutes pass (the pane is
// drawn once more, without it), and draws at no other beat.
// Not drawing state: a hot reload drops it and session.start or the next event starts it again.
let timer: Timer | undefined
let period = 0
let isBusy = false
let skipped = 0
let isShown = true
let seenAt = 0
let mapAt = 0
let packsAt = 0
let frame = ''
// The main conversation's turn is running: the active step's node turns while it does, and stands still after.
let isWorking = false
function tick($: EngineInterface) {
  const arm = (ms: number) => {
    timer?.cancel()
    period = ms
    timer = ms === 0 ? undefined : $.clock.every(ms, beat)
  }
  const bump = async () => {
    const all = await read($, runs)
    const isLive = all.some(r => r.endedAt === null)
    const isWay = (await read($, way)).active
    const t = await $.clock.now()
    let mine = await read($, solo)
    if (t - seenAt >= SLOW_MS || t < seenAt) {
      seenAt = t
      isShown = await isOnScreen($)
      await syncTheme($)
      if (t - packsAt >= ((await read($, packs)).sig === '' ? NO_PACKS_MS : PACKS_MS) || t < packsAt) {
        packsAt = t
        await loadPacks($)
      }
      if (mine.some(a => !isOver(a))) await reconcile($)
      // A plain subagent asked for long ago whose spawn never answered: nothing will end it, so it is given up.
      if (mine.some(a => a.status === 'queued' && t - a.startedAt >= QUEUE_MS)) {
        mine = await update($, solo, list => list.map(a => (a.status === 'queued' && t - a.startedAt >= QUEUE_MS ? { ...a, status: 'failed' as const, endedAt: t } : a)))
      }
    }
    // A finished plain subagent leaves a while after its end.
    if (sweep(mine, t) !== mine) mine = await update($, solo, list => sweep(list, t))
    // The active step's node turns at the pack's rate, while the model works on it.
    const stepMs = isWorking && ((await read($, plan))?.steps.some(x => x.status === 'active') === true || (await read($, wayMap))?.tickets.some(x => x.state === 'claimed') === true)
      ? lookOf(await read($, theme), (await read($, packs)).list).S.cycle?.ms ?? 0 : 0
    const next = frameOf({ isLive, solo: mine, stepMs, t, isKept: lingering(all, t, begunAt) !== undefined })
    // Drawn again when the frame changed, and once more when the last thing that moved stopped: what was mid-way
    // (a finished row still bright, a border still lit) is drawn settled. Hidden, the frame stands: the first beat
    // back on screen draws.
    if (isShown && next !== frame) {
      await update($, now, () => t)
      frame = next
    }
    if (isWay && (t - mapAt >= MAP_MS || t < mapAt)) {
      mapAt = t
      await refresh($)
    }
    const isMoving = isLive || mine.length > 0 || stepMs > 0
    const want = isMoving && isShown ? FAST_MS : isMoving || isWay ? SLOW_MS : IDLE_MS
    if (want !== period) arm(want)
  }
  const beat = () => {
    // One beat at a time; a beat that never settles (a call on $ left unanswered) is given up after 40 more.
    if (isBusy && ++skipped < 40) return
    skipped = 0
    isBusy = true
    void bump().catch(() => undefined).finally(() => { isBusy = false })
  }
  // Already beating: a slow beat is brought forward, so a run that just started is live at once.
  if (timer === undefined) arm(FAST_MS)
  else if (period === FAST_MS) return
  beat()
}

/**
 * A path under .scratch/<effort>/ says which effort the session is on, when that directory holds a map.md:
 * a loose file in .scratch/ or a directory without a map is no effort and leaves the remembered one alone.
 * `isPick` is the person naming it (a /wayfinder argument): it also drops the pane's earlier choice.
 */
async function touch($: EngineInterface, hit: { root: string; effort: string } | null, isPick = false) {
  if (hit === null) return
  const w = await read($, way)
  if (w.root === hit.root && w.touched === hit.effort && !(isPick && w.chosen !== '')) return
  const cwd = (await $.session.cwd().catch(() => '')).replace(/[\\/]+$/, '')
  const dir = isAbsolute(hit.root) ? hit.root : `${cwd}/${hit.root}`
  if (!(await $.fs.exists(`${dir}/${hit.effort}/map.md`).catch(() => false))) return
  await update($, way, v => ({ ...v, root: hit.root, touched: hit.effort, ...(isPick ? { chosen: '' } : {}) }))
}

/** Wayfinder was used: the map shows from now on. Its argument may name a map path or an effort. */
async function wake($: EngineInterface, args: string) {
  await update($, way, v => ({ ...v, active: true, hint: args.slice(0, 300) || v.hint }))
  await touch($, args.split(/\s+/).map(scratchOf).find(h => h !== null) ?? null, true)
  tick($)
  await refresh($)
}


/** What the drawing knew when a Button was drawn: the agents in order, the selected one, whom a steer and a stop would reach. */
type Ctx = { order: string[]; target: string; stop: string; cols: number }

/** A press, run: every write goes through the state the press finds, never the one the drawing saw. */
async function act($: EngineInterface, a: Act, c: Ctx) {
  const t = await $.clock.now()
  const set = (change: (v: View) => View) => update($, view, v => change(healView(v)))
  const focus = (key: string) => quiet($.ui.focus({ requestId: PANE, key }))
  if (a.a === 'agent') {
    await set(v => ({ ...v, sel: a.key, mode: '', open: v.open.includes(a.key) ? v.open.filter(k => k !== a.key) : [...v.open, a.key].slice(-40) }))
  } else if (a.a === 'move') {
    const from = healView(await read($, view)).sel
    const at = c.order.indexOf(c.order.includes(from) ? from : c.target)
    const next = c.order[Math.max(0, Math.min(c.order.length - 1, at + a.d))]
    if (next === undefined) return
    await set(v => ({ ...v, sel: next, mode: '' }))
    await focus(next)
  } else if (a.a === 'steer') {
    if (c.target === '') return
    await set(v => ({ ...v, mode: 'steer', target: c.target, at: t }))
    await focus('steer')
  } else if (a.a === 'stop') {
    if (c.stop === '') return
    await set(v => ({ ...v, mode: 'confirm', target: c.stop, at: t }))
    await focus('stop:no')
  } else if (a.a === 'no') {
    await set(v => ({ ...v, mode: '' }))
  } else if (a.a === 'yes') {
    const asked = healView(await read($, view))
    // Only the answer to a question that is showing, and has been for a moment, stops anything.
    if (asked.mode !== 'confirm' || t - asked.at < ARM_MS) return
    await set(v => ({ ...v, mode: '' }))
    if (t - asked.at > CONFIRM_MS) return
    const run = (await read($, runs)).find(r => runKey(r) === asked.target && r.endedAt === null && r.taskId !== '')
    if (run === undefined) return
    // The engine's own way to stop a background task: the TaskStop tool, on the run's task. It stops the whole run.
    const got = await $.tool.call({ tool: 'TaskStop', task_id: run.taskId, consent: `The user pressed "y: yes" under "stop ${run.name}?" in the flow map pane to stop the workflow "${run.name}".` })
      .catch((err: unknown) => ({ deny: String(err), isError: undefined }))
    if (got.deny !== undefined || got.isError === true) return $.ui.toast(`flow map: the run was not stopped${got.deny === undefined ? '' : `: ${got.deny.slice(0, 120)}`}`)
    // TaskStop answered that the task is stopped: the run is over now, whether or not a notification follows.
    // It stays on screen a while, as any finished run, with its phases stopped and on hold.
    await update($, runs, list => list.map(r => (runKey(r) === asked.target && r.endedAt === null ? { ...r, stop: t, endedAt: t, outcome: 'killed' } : r)))
  } else if (a.a === 'hide') {
    const next = await set(v => ({ ...v, hidden: !v.hidden, mode: '' }))
    if (next.hidden) {
      await quiet($.ui.close({ id: PANE }))
      $.ui.toast('Flow map folded: the tab above the prompt, or /flow, brings it back.')
    } else await quiet($.ui.open({ id: PANE, title: TITLE, columns: next.cols || COLUMNS, focus: true }))
    tick($)
  } else if (a.a === 'size') {
    // From the width the pane has, not the one last asked for: an ask the dock did not take never adds up.
    const want = Math.max(NARROWEST, Math.min(WIDEST, c.cols + a.d))
    const old = healView(await read($, view))
    // A request, not a grant: a width the person dragged or keyed the dock to wins over it, and the inline block
    // ignores it. The pane is as wide as it was before the last ask, a while after it: that ask was not taken.
    if (old.colsFrom === c.cols && old.cols !== c.cols && t - old.colsAt >= SLOW_MS) {
      await set(v => ({ ...v, colsFrom: 0 }))
      return $.ui.toast('flow map: the pane kept its width. A width you dragged or keyed the dock to wins, and so does a terminal with no room to spare: drag the pane\'s edge.')
    }
    if (want === c.cols) return
    await set(v => ({ ...v, cols: want, colsFrom: c.cols, colsAt: t }))
    await quiet($.ui.open({ id: PANE, title: TITLE, columns: want }))
  } else if (a.a === 'fold') {
    await set(v => ({ ...v, folded: v.folded.includes(a.run) ? v.folded.filter(x => x !== a.run) : [...v.folded, a.run].slice(-20) }))
  } else if (a.a === 'effort') {
    await update($, way, v => ({ ...v, chosen: a.name }))
    await refresh($)
  } else {
    await update($, way, v => ({ ...v, open: v.open.includes(a.id) ? v.open.filter(x => x !== a.id) : [...v.open, a.id] }))
  }
}

/** The steer field's Enter: the text goes to the agent as a message, the engine's SendMessage delivery. */
async function steer($: EngineInterface, value: string) {
  const asked = healView(await read($, view))
  await update($, view, (v): View => ({ ...healView(v), mode: '' }))
  const text = value.trim()
  if (asked.mode !== 'steer' || text === '') return
  // A run's agent or a plain subagent: both are reached by their loop's id, the engine's SendMessage delivery.
  const hit = [...(await read($, solo)).map(a => ({ key: soloKey(a), a })), ...(await read($, runs)).flatMap(r => r.agents.map(a => ({ key: agentKey(r, a), a })))].find(x => x.key === asked.target)
  if (hit === undefined || hit.a.id === '' || hit.a.status !== 'running') return
  const sent = await $.session.send({ to: { agentId: hit.a.id }, text }).catch((err: unknown) => ({ isDelivered: false as const, reason: String(err) }))
  if (!sent.isDelivered) return $.ui.toast(`flow map: not delivered to ${hit.a.label}: ${sent.reason.slice(0, 120)}`)
  const marked = (a: Agent): Agent => (a.key === hit.a.key && a.id === hit.a.id ? { ...a, steer: text.slice(0, 200) } : a)
  await update($, solo, list => list.map(marked))
  await update($, runs, list => patchAgent(list, a => a.key === hit.a.key && a.id === hit.a.id, a => [marked(a)]))
}

type Els = Elements['terminal']
/** Lines of cells as elements: each line `width` cells of the palette's background, a Text of spans around its Buttons and field. */
function paint($: EngineInterface, els: Pick<Els, 'Box' | 'Text' | 'Button'> & { Input?: Els['Input'] }, lines: Line[], width: number, bg: string | undefined, fg: string, ctx: Ctx): RenderElement[] {
  const { Box, Text, Button, Input } = els
  const span = (seg: Seg) => {
    const back = seg.bg ?? bg
    const struck = seg.x === true ? { strikethrough: true as const } : {}
    return back === undefined
      ? <Text color={seg.c ?? fg} bold={seg.b === true} {...struck}>{seg.t}</Text>
      : <Text color={seg.c ?? fg} backgroundColor={back} bold={seg.b === true} {...struck}>{seg.t}</Text>
  }
  const button = (b: Btn) => (
    <Box width={widthOf(b)} flexShrink={0} {...(b.bg ?? bg) === undefined ? {} : { backgroundColor: b.bg ?? bg }}>
      <Button key={b.key} plain {...(b.hotkey === undefined ? {} : { hotkey: b.hotkey })} {...(b.auto === true ? { autoFocus: true as const } : {})} dimColor={b.dim === true} onPress={() => void act($, b.act, ctx).catch(() => undefined)}>{b.label}</Button>
    </Box>
  )
  return lines.map(line => {
    const used = line.reduce((n, p) => n + (isSeg(p) ? p.t.length : 'btn' in p ? widthOf(p.btn) : p.inp.width), 0)
    const whole: Line = bg === undefined ? line : [...line, { t: ' '.repeat(Math.max(0, width - used)) }]
    if (whole.every(isSeg)) return <Text wrap="truncate-end">{whole.length === 0 ? ' ' : whole.map(span)}</Text>
    const parts: RenderElement[] = []
    let run: Seg[] = []
    const flush = () => {
      if (run.length > 0) parts.push(<Text wrap="truncate-end">{run.map(span)}</Text>)
      run = []
    }
    for (const piece of whole) {
      if (isSeg(piece)) run.push(piece)
      else {
        flush()
        if ('btn' in piece) parts.push(button(piece.btn))
        else if (Input !== undefined) {
          parts.push(
            <Box width={piece.inp.width} flexShrink={0} {...(bg === undefined ? {} : { backgroundColor: bg })}>
              <Input key={piece.inp.key} submitLabel="send" onSubmit={value => void steer($, value).catch(() => undefined)} />
            </Box>,
          )
        }
      }
    }
    flush()
    return <Box flexDirection="row" {...(bg === undefined ? {} : { width, backgroundColor: bg })}>{parts}</Box>
  })
}

/** Opens the pane (unfolded), and says what became of it: `/flow`, and `/loadout flow`. */
export async function openFlow($: EngineInterface): Promise<string> {
  const seen = await update($, view, (v): View => ({ ...healView(v), hidden: false }))
  const opened = await $.ui.open({ id: PANE, title: TITLE, columns: seen.cols || COLUMNS })
  await quiet(syncTheme($))

  return opened.isPlaced ? 'Flow map opened.' : `Flow map is open but not drawn yet: ${opened.reason}`
}

// --- the events Loadout's parts share (hooks/part.ts): this part's work on each, kept from costing the others ---

const started: Part<'session.start'> = async ($, e, next) => {
  await $.command.register({ name: 'flow', description: 'Open the Flow map pane (runs, agents, steps)' })
  await $.tool.register({
    name: 'steps',
    description:
      'Shows the user the plan of a multi-step task in the Flow map pane: a title and every step with its status. Call it at the start of a task with 3+ steps and again, with the full list, whenever a step changes status.',
    inputSchema: STEPS_SCHEMA,
  })
  // What earlier sessions learned about how long agents and phases take; this session's own figures win.
  const kept = toHistory(await $.store.get('hist').catch(() => null))
  await quiet(update($, hist, (h: History) => ({ ...kept, ...h })))
  await quiet(syncTheme($))
  await quiet(loadPacks($))
  // The plain subagents already running (the mod loaded, or loaded again, after they started).
  const rows = await $.agent.list().catch(() => [])
  const at = await $.clock.now().catch(() => 0)
  for (const row of rows.filter(r => r.teammateId === undefined && (r.status === 'running' || r.status === 'pending' || r.status === 'waiting'))) {
    await quiet(update($, solo, list => (list.some(a => a.id === row.id) ? list : withSolo(list, soloAgent({ key: `a:${row.id}`, id: row.id, label: row.description || row.type, kind: row.type, startedAt: at })))))
  }
  const seen = healView(await read($, view))
  if (e.isInteractive && !seen.hidden) void $.ui.open({ id: PANE, title: TITLE, columns: seen.cols || COLUMNS }).catch(() => undefined)
  tick($)

  return next(e)
}

// The main conversation's turn starts: the active step's node turns until it ends.
const turnStarted: Part<'turn.start'> = async ($, e, next) => {
  isWorking = true
  tick($)
  return next(e)
}

// An agent of a run is asked for, then started.
const spawned: Part<'agent.spawn'> = async ($, e, next) => {
  const wf = e.workflow
  if (wf === undefined) {
    // A plain subagent: the Agent tool's, a fork, a background agent. A teammate idles between turns and is not one.
    if (e.isTeammate === true) return next(e)
    const raised = await $.clock.now()
    const key = `s:${raised}:${e.tool_use_id}`
    const kind = e.fork ? 'fork' : e.subagentType
    await quiet(update($, solo, list => withSolo(list, soloAgent({ key, label: e.description || e.name || kind, kind, status: 'queued', startedAt: raised }))))
    tick($)
    let got: Awaited<ReturnType<typeof next>> | undefined
    try {
      got = await next(e)
      return got
    } finally {
      const answer = got
      const at = await $.clock.now().catch(() => raised)
      await quiet(update($, solo, (list): Agent[] => {
        // The spawn threw, or was refused: it failed.
        if (answer === undefined || answer.deny !== undefined) return list.map(a => (a.key !== key ? a : { ...a, status: 'failed', endedAt: Math.max(at, a.startedAt) }))
        const id = answer.agentId
        // Started with no id (a hook answered for the engine): no event will name it, so it cannot be followed and is not shown.
        // A tool call of its that outran this answer took it in already: that row stays, this one goes.
        if (id === undefined || list.some(a => a.id === id)) return list.filter(a => a.key !== key)
        return list.map(a => (a.key !== key ? a : { ...a, id, model: answer.model, status: 'running', startedAt: at }))
      }))
      tick($)
    }
  }
  const asked = await $.clock.now()
  const key = `${wf.agentIndex}@${asked}`
  const isRun = (r: Run) => r.id === wf.runId || (r.id === '' && r.callId !== '' && r.callId === e.tool_use_id)
  // A run first seen by its agent, or one that had ended, starts here.
  if ((await read($, runs)).find(isRun)?.endedAt !== null) begunAt = asked
  const agent: Agent = {
    key, n: wf.agentIndex, id: '', label: e.description || `agent ${wf.agentIndex}`, model: '',
    status: 'queued', startedAt: asked, endedAt: 0, tools: 0, calls: [], phase: 0, tokIn: 0, tokOut: 0, log: [], steer: '', stepIn: 0, stepOut: 0,
  }
  await update($, runs, list =>
    (list.some(isRun) ? list : keepRuns([...list, newRun({ id: wf.runId, callId: e.tool_use_id, name: 'workflow', phases: [], startedAt: asked })])).map(r =>
      isRun(r) ? { ...r, id: wf.runId, endedAt: null, outcome: '', ...enlist(healRun(r), agent, e.prompt) } : r,
    ),
  )
  tick($)
  const got = await next(e)
  const at = await $.clock.now()
  await quiet(
    update($, runs, list =>
      patchAgent(list, a => a.key === key, (a, r) =>
        got.deny !== undefined
          ? [{ ...a, status: 'failed', endedAt: at }, { failed: r.failed + 1 }]
          : [{ ...a, id: got.agentId ?? '', model: got.model, status: 'running', startedAt: at }],
      ),
    ),
  )

  return got
}

// Every tool call, for two things (one hook: an event takes a single hook without a matcher).
// A run's agent calls a tool: count it, show it while it runs, and keep how it ended. An agent runs several at once.
// A file call under .scratch/<effort>/ says which effort the session is on, and one that may have written there has the map read again.
const called: Part<'tool.call'> = async ($, e, next) => {
  const input: Record<string, unknown> = e
  const tool = String(e.tool)
  const path = [input.file_path, input.notebook_path, input.path].find(p => typeof p === 'string')
  const hit = typeof path === 'string' ? scratchOf(path) : null
  const isMap = hit !== null || (kindOf(tool) === 'shell' && typeof input.command === 'string' && input.command.includes('.scratch'))
  const id = e.agentId
  const isAgent = (a: Agent) => a.id === id
  const isRun = id !== undefined && (await read($, runs)).some(r => r.agents.some(isAgent))
  // Not a run's agent: a plain subagent the pane tracks, or one it meets here for the first time.
  const isSolo = id !== undefined && !isRun && ((await read($, solo)).some(isAgent) || (await adopt($, id).catch(() => false)))
  if (!isMap && !isRun && !isSolo) return next(e)
  const call: Call = { id: e.tool_use_id, tool, what: brief(tool, input), at: isRun || isSolo ? await $.clock.now() : 0 }
  const started = (a: Agent): Agent => ({ ...a, tools: a.tools + 1, calls: [...(a.calls ?? []), call].slice(-MAX_CALLS) })
  if (isRun) {
    await quiet(update($, runs, list => patchAgent(list, isAgent, a => [started(a)])))
    tick($)
  }
  if (isSolo) {
    // A finished agent that works again (a message woke it) runs again.
    await quiet(update($, solo, list => list.map(a => (isAgent(a) ? { ...started(heal(a)), status: 'running' as const, endedAt: 0 } : a))))
    tick($)
  }
  let failed = true
  try {
    const got = await next(e)
    failed = got.deny !== undefined || got.isError === true
    return got
  } finally {
    if (isRun || isSolo) {
      const at = await $.clock.now().catch(() => call.at)
      const done = { tool, what: call.what, ms: at - call.at, failed }
      const ended = (a: Agent): Agent => ({ ...a, calls: (a.calls ?? []).filter(c => c.id !== call.id), log: [...(a.log ?? []), done].slice(-5) })
      if (isRun) await quiet(update($, runs, list => patchAgent(list, isAgent, a => [ended(a)])))
      // The card's border is lit for a moment: green, red for a call that failed.
      else await quiet(update($, solo, list => list.map(a => (isAgent(a) ? { ...ended(a), flashAt: at, flashBad: failed } : a))))
      tick($)
    }
    // After the call: a Write that creates the effort's map.md has made it one by now.
    await quiet(touch($, hit))
    if (isMap) await quiet(refresh($))
  }
}

// A run's agent finished its turn.
const turnCompleted: Part<'turn.complete'> = async ($, e, next) => {
  const id = e.agentId
  if (id !== undefined && (await read($, runs)).some(r => r.agents.some(a => a.id === id))) {
    const at = await $.clock.now()
    const u = e.usage
    const facts: [string, number][] = []
    await update($, runs, list =>
      patchAgent(list, a => a.id === id, (a, r) => {
        // The turn's usage is its whole cost: what this turn's steps already counted is not counted twice.
        // An agent may run several turns, so only the steps since its last turn ended are taken off.
        const tokIn = Math.max(0, (u === undefined ? 0 : u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens) - (a.stepIn ?? 0))
        const tokOut = Math.max(0, (u?.output_tokens ?? 0) - (a.stepOut ?? 0))
        const spent = { tokIn: r.tokIn + tokIn, tokOut: r.tokOut + tokOut }
        const mine = { ...a, tokIn: a.tokIn + tokIn, tokOut: a.tokOut + tokOut, stepIn: 0, stepOut: 0 }
        if (a.status !== 'running') return [mine, spent]
        const isDone = e.reason === 'answer'
        if (isDone) facts.push([`a:${histKey(a.label)}`, at - a.startedAt])
        return [
          { ...mine, status: isDone ? 'done' : 'failed', endedAt: at, calls: [] },
          isDone ? { ...spent, done: r.done + 1, doneMs: r.doneMs + (at - a.startedAt) } : { ...spent, failed: r.failed + 1 },
        ]
      }),
    )
    // The last write's facts: an update that ran twice on a miss gathered them twice.
    await quiet(learn($, facts.slice(-1)))
  }
  if (id === undefined) isWorking = false
  // A plain subagent's turn ended: answered (done), interrupted (stopped), or dead on an error or a refusal (failed).
  else if ((await read($, solo)).some(a => a.id === id)) {
    const at = await $.clock.now()
    const u = e.usage
    await quiet(update($, solo, list => list.map(a => {
      if (a.id !== id) return a
      const tokIn = Math.max(0, (u === undefined ? 0 : u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens) - a.stepIn)
      const mine = { ...a, tokIn: a.tokIn + tokIn, tokOut: a.tokOut + Math.max(0, (u?.output_tokens ?? 0) - a.stepOut), stepIn: 0, stepOut: 0 }
      return a.status !== 'running' ? mine : { ...mine, status: e.reason === 'answer' ? 'done' as const : 'failed' as const, stopped: e.reason === 'aborted', endedAt: Math.max(at, a.startedAt), calls: [] }
    })))
    tick($)
  }

  return next(e)
}

export const register: Register = on => {
  // Each under `{}`, any input: an event takes a single hook without a matcher in a module, and the parts share these.
  on('session.start', {}, ($, e, next) => alone(e, under => next(under), under => started($, e, under)))

  on('command.run', { command: 'flow' }, async $ => ({ text: `${await openFlow($)}\nAlso: /loadout flow.` }))

  // The theme changed in the config menu: the palette follows at once.
  on('config.set', async ($, e, next) => {
    const got = await next(e)
    if (e.key === 'theme') {
      await quiet(syncTheme($))
      await quiet(loadPacks($))
    }
    return got
  })

  on('turn.start', {}, ($, e, next) => alone(e, under => next(under), under => turnStarted($, e, under)))

  // The ring moved onto an agent's row (Tab, a click, or the pane's own j and k): that agent is the selection.
  on('ui.focus', async ($, e, next) => {
    const got = await next(e)
    const key = e.element
    if (e.requestId !== PANE || key === undefined || got.deny !== undefined) return got
    await quiet(update($, view, v => {
      const old = healView(v)
      const sel = key.startsWith('ag:') ? key : old.sel
      // Leaving the steer field or the stop question for another element drops it.
      const isKept = old.mode === '' || key.startsWith(old.mode === 'steer' ? 'steer' : 'stop:')
      return sel === old.sel && isKept ? v : { ...old, sel, mode: isKept ? old.mode : '' }
    }))
    return got
  })

  on('prompt.compose', async ($, e, next) => {
    const got = await next(e)

    return e.tools.includes(TOOL) ? { sections: [...got.sections, SECTION] } : got
  })

  // B. STEPS: the model posts its plan.
  on('tool.call', { tool: TOOL }, async ($, e) => {
    if (e.agentId !== undefined) return { result: 'Not shown: only the main conversation posts the plan.' }
    const next = toPlan(e)
    if (typeof next === 'string') return { deny: next }
    await update($, plan, () => next)
    const at = next.steps.findIndex(s => s.status === 'active')

    return { result: at < 0 ? `Plan shown: ${next.steps.length} steps.` : `Plan shown: step ${at + 1} of ${next.steps.length}.` }
  })

  // C. WAYFINDER: the skill is used, by the model's Skill call, its slash command, or its prompt being expanded.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    if (isWayfinder(e.skill)) await quiet(wake($, e.args ?? ''))
    return next(e)
  })
  on('command.run', async ($, e, next) => {
    if (isWayfinder(e.command)) await quiet(wake($, e.args))
    return next(e)
  })
  on('skill.prompt', async ($, e, next) => {
    if (isWayfinder(e.skill)) await quiet(wake($, ''))
    return next(e)
  })

  // A. WORKFLOWS: a run starts.
  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const callId = e.tool_use_id
    const startedAt = await $.clock.now()
    // The script as the call carries it, or the file it names: its meta gives the phases in order, its agent() calls say which phase each agent is in.
    // A scriptPath wins over a script, as the tool itself reads them.
    const filed = e.scriptPath === undefined ? '' : await $.fs.read(e.scriptPath).catch(() => '')
    const source = filed !== '' ? filed : e.script ?? ''
    const meta = parseMeta(source)
    const sites = parseSites(source)
    const resumed = e.resumeFromRunId
    const begunBefore = begunAt
    begunAt = startedAt
    // What the resumed run was, to put back if the resume does not start.
    let before = undefined as Pick<Run, 'callId' | 'startedAt' | 'endedAt' | 'outcome' | 'agents' | 'done' | 'failed' | 'stop' | 'sites'> | undefined
    await update($, runs, list => {
      const old = resumed === undefined ? undefined : list.map(healRun).find(r => r.id === resumed)
      before = old && { callId: old.callId, startedAt: old.startedAt, endedAt: old.endedAt, outcome: old.outcome, agents: old.agents, done: old.done, failed: old.failed, stop: old.stop, sites: old.sites }
      return old !== undefined
        // The start moves forward by the time the run was not running, so ELAPSED counts the work alone.
        ? list.map(r => (r.id === old.id ? { ...settled(old), callId, startedAt: old.startedAt + Math.max(0, startedAt - (old.endedAt ?? startedAt)), endedAt: null, outcome: '', stop: 0, phases: declared(meta.phases, old.phases), sites: sites.length > 0 ? sites : old.sites } : r))
        : keepRuns([...list, newRun({ callId, name: meta.name ?? e.name ?? 'workflow', phases: meta.phases, sites, startedAt })])
    })
    tick($)
    const ran = await next(e)
    const endedAt = await $.clock.now()
    const out = ran.deny === undefined && ran.isError !== true ? ran.result : undefined
    if (out === undefined || out.error !== undefined) {
      const back = before ?? { endedAt, outcome: 'not started' }
      // It did not start: the finished run it sent away is back.
      if (begunAt === startedAt) begunAt = begunBefore
      await quiet(update($, runs, list => list.map(r => (r.callId === callId ? { ...r, ...back } : r))))
      return ran
    }
    // The engine saves every script and names the file: where a named run's phases and call sites are read.
    // ponytail: an agent such a run spawns before this read lands is seated by the waves, not by the script.
    const path = out.scriptPath ?? e.scriptPath
    const text = source === '' && path !== undefined ? await $.fs.read(path).catch(() => '') : ''
    const saved = text === '' ? { meta, sites } : { meta: parseMeta(text), sites: parseSites(text) }
    const isRemote = out.status === 'remote_launched'
    await quiet(
      update($, runs, list => {
        const mine = list.find(r => r.callId === callId)
        if (mine === undefined) return list
        // An agent.spawn that outran this answer and carried no call id made the run already: it keeps its agents and takes what this call knows.
        const early = list.find(r => r.id === out.runId && r.callId !== callId)
        const kept = early ?? mine
        const known = {
          id: out.runId ?? mine.id,
          callId,
          taskId: out.taskId,
          name: out.workflowName ?? saved.meta.name ?? mine.name,
          // The declared phases, and what the run holds past them: it may have added one a phase() call named.
          phases: declared(saved.meta.phases, kept.phases),
          sites: saved.sites.length > 0 ? saved.sites : (kept.sites ?? []),
          startedAt: mine.startedAt,
          // A cloud run has no local loop: nothing of it can be watched from here.
          ...(isRemote ? { endedAt, outcome: 'remote' } : {}),
        }
        return list.filter(r => early === undefined || r !== mine).map(r => (r === kept ? { ...r, ...known } : r))
      }),
    )

    return ran
  })

  on('agent.spawn', {}, ($, e, next) => alone(e, under => next(under), under => spawned($, e, under)))

  on('tool.call', {}, ($, e, next) => alone(e, under => next(under), under => called($, e, under)))

  // A model request of a run's agent answered: its tokens count at once, so the card's figure moves while the agent runs.
  on('turn.step', async function* ($, e, next) {
    const got = yield* next(e)
    const id = e.agentId
    const u = got.usage
    if (id !== undefined && u !== null && (await read($, runs).catch(() => [])).some(r => r.agents.some(a => a.id === id && a.status === 'running'))) {
      const tokIn = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      await quiet(update($, runs, list =>
        patchAgent(list, a => a.id === id, (a, r) => [{ ...a, tokIn: a.tokIn + tokIn, tokOut: a.tokOut + u.output_tokens, stepIn: (a.stepIn ?? 0) + tokIn, stepOut: (a.stepOut ?? 0) + u.output_tokens }, { tokIn: r.tokIn + tokIn, tokOut: r.tokOut + u.output_tokens }]),
      ))
    }
    if (id !== undefined && u !== null && (await read($, solo).catch(() => [])).some(a => a.id === id && a.status === 'running')) {
      const tokIn = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      await quiet(update($, solo, list => list.map(a => (a.id === id ? { ...a, tokIn: a.tokIn + tokIn, tokOut: a.tokOut + u.output_tokens, stepIn: a.stepIn + tokIn, stepOut: a.stepOut + u.output_tokens } : a))))
    }
    return got
  })

  on('turn.complete', {}, ($, e, next) => alone(e, under => next(under), under => turnCompleted($, e, under)))

  // A run ended: its background task's notification names the task id.
  // ponytail: the id and status are read out of the notification's text, no
  // typed field carries them here; classic.Stop below is the typed backstop.
  on('prompt.submit', async ($, e, next) => {
    // ponytail: a typed /wayfinder is caught by command.run or skill.prompt where the engine raises them; this is the text's own word for it.
    const typed = e.origin.kind === 'composer' ? e.text.match(/^\/(\S+)[ \t]*(.*)/) : null
    if (typed !== null && isWayfinder(typed[1])) await quiet(wake($, typed[2] ?? ''))
    if (e.origin.kind === 'task-notification') {
      const at = await $.clock.now()
      const outcome = e.text.match(/<status>\s*([a-z_]+)\s*<\/status>/i)?.[1] ?? 'ended'
      // 'ended' is the Stop backstop's guess: the notification that names the real status replaces it.
      const isMine = (r: Run) => (r.endedAt === null || r.outcome === 'ended') && r.taskId !== '' && e.text.includes(r.taskId)
      const closed = (await read($, runs)).filter(isMine).map(r => ({ ...r, endedAt: r.endedAt ?? at, outcome }))
      await update($, runs, list => list.map(r => (isMine(r) ? { ...r, endedAt: r.endedAt ?? at, outcome } : r)))
      const known = await read($, hist)
      await quiet(learn($, closed.filter(r => r.outcome === 'completed').flatMap(r => phaseFacts(r, known))))
    }

    return next(e)
  })

  // The main turn stopped: a run whose task is no longer in flight has ended.
  on('classic.Stop', async ($, e, next) => {
    const flying = e.background_tasks
    if (flying !== undefined) {
      const at = await $.clock.now()
      await update($, runs, list =>
        list.map(r => (r.endedAt === null && r.taskId !== '' && !flying.some(t => t.id === r.taskId) ? { ...r, endedAt: at, outcome: 'ended' } : r)),
      )
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box } = els
    const { P, S } = lookOf(await read($, theme), (await read($, packs)).list)
    const w = Math.max(24, e.props.bodyColumns)
    const rows = e.props.scroll.bodyRows
    const clock = await read($, now)
    const known = await read($, hist)
    const seen = healView(await read($, view))
    const list = (await read($, runs)).map(r => settled(healRun(r)))
    const shown = (await onScreen($, list, clock)).map(r => runView(r, clock, known))
    // The stop question stands only while the pane holds the keyboard and for a few seconds: after that the hints are back.
    const isAsking = seen.mode !== 'confirm' || (e.props.isFocused && clock - seen.at <= CONFIRM_MS)
    // Docked, the pane is the dock's height and paints all of it; inline above the prompt the frame fits the tree.
    const isInline = e.props.placement === 'inline'
    const drawn = compose({
      w, rows, inline: isInline, P, now: clock, runs: shown, view: isAsking ? seen : { ...seen, mode: '' },
      plan: await read($, plan), way: await read($, way), map: await read($, wayMap), S, solo: (await read($, solo)).map(heal),
    })
    const ctx: Ctx = { order: drawn.order, target: drawn.steer, stop: drawn.stoppable === undefined ? '' : runKey(drawn.stoppable), cols: w }

    return (
      <Box flexDirection="column" width={w} {...(isInline ? {} : { minHeight: rows })} backgroundColor={P.bg}>
        {paint($, els, drawn.lines, w, P.bg, P.fg, ctx)}
      </Box>
    )
  })

  // Folded with z: the pane is closed and one tab stands above the prompt, over whatever else draws there.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const seen = healView(await read($, view))
    if (!seen.hidden || e.props.hasSurvey) return next(e)
    tick($)
    const els = $.ui.resolve(e)
    const { Box } = els
    const { P } = lookOf(await read($, theme), (await read($, packs)).list)
    const clock = await read($, now)
    const known = await read($, hist)
    const list = (await read($, runs)).map(r => settled(healRun(r)))
    const [run] = await onScreen($, list, clock)
    const lines = tab(P, run === undefined ? undefined : runView(run, clock, known), clock, (await read($, solo)).map(heal))
    const below = await next(e).catch(() => null)

    return (
      <Box flexDirection="column">
        {paint($, els, lines, e.props.bodyColumns, undefined, P.fg, { order: [], target: '', stop: '', cols: seen.cols || COLUMNS })}
        {below}
      </Box>
    )
  })
}
