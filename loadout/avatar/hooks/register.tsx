import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMeasureInput } from 'claude-code'

import { ASSUMED, sourceOf } from './canvas'
import type { Cell } from './canvas'
import { beatAfter, heroCanvas, heroGrid, isAtRest } from './cyber'
import { CAST, frameAt, playedOf, reelOf, slotOf, SLOTS } from './reel'
import type { Reel, Slot } from './reel'
import type { Beat, Moment } from './cyber'
import { frameOf, nameOf, themed } from './families'
import type { Acting, FamilyDef, Worry } from './families'
import { chromeFrame, isChrome } from './chrome'
import { cueOf, haloLive, isHalo } from './halo'
import { haloTree } from './halopane'
import { NONE, STATES, agentRows, hex, maskFrame } from './hud'
import type { Grid, State } from './hud'
import { HUD_ROWS, hudTree } from './hudpane'
import { CHROME_ROWS, LEGEND_MAX, encoded, laidOut, laidOutArt, laidOutText, mascotBlocks } from './layout'
import type { Layout } from './layout'
import { formOf } from './look'
import type { Form } from './look'
import { mascotFrame } from './mascot'
import { packFiles, packsOf } from './packs'
import type { Pack } from './packs'
import { HELP, USAGE, listed, loadoutAsk, loadoutSuggestions } from './loadout'
import type { LoadoutAsk } from './loadout'
import { pickerRows, pickerTree } from './picker'
import { BUILT_IN, LIVE, askOf, builtInOffer, customOffer, findTheme, isLive, liveOf, liveSource, liveText, pinLines, quoted, settingOf, slugOf, withTheme, writeLive } from './themes'
import type { Disk, Offer } from './themes'
import type { Mood } from './mascot'
import { alone } from '../../hooks/part'
import type { Part } from '../../hooks/part'
import { SWAPS, colorOf } from './minis'
import { stageFrame, stagedOf as stagedArt } from './scene'
import { LEAVE_MS, NARROWEST as STAGE_NARROWEST, TICK_MS, sceneOf, stagedOf, toolAct } from './stage'
import { FLOW_PANE, VIEW as FLOW_VIEW } from '../../flow/hooks/register'
import type { KirbyHudCall, KirbyHudHelper, KirbyHudLimit, KirbyHudUsage } from '../../types'

const usage = atom({ plugin: 'loadout', key: 'usage' } as const, null)
const isWorking = atom({ plugin: 'loadout', key: 'isWorking' } as const, false)
const happyUntil = atom({ plugin: 'loadout', key: 'happyUntil' } as const, 0)
const model = atom({ plugin: 'loadout', key: 'model' } as const, '')
// The theme this terminal shows, as the pane, the tint and the picker take it: a live theme file's source, any other setting itself.
const theme = atom({ plugin: 'loadout', key: 'theme' } as const, '')
// The setting this terminal paints from (`custom:loadout`, `custom:kirby`, `dark`): its start's, which the settings file may have left behind since.
const painted = atom({ plugin: 'loadout', key: 'painted' } as const, '')
const calls = atom({ plugin: 'loadout', key: 'calls' } as const, [])
const helpers = atom({ plugin: 'loadout', key: 'helpers' } as const, [])
const pets = atom({ plugin: 'loadout', key: 'pets' } as const, 0)
const isPicking = atom({ plugin: 'loadout', key: 'isPicking' } as const, false)
// The frames part's switch (frames/hooks/register.tsx, where /colors writes it): `/loadout frames` writes it from here, a reference being read from the file that spells it.
const framesOn = atom({ plugin: 'loadout', key: 'isOn' } as const, true)
// The Flow map's view, the same way (flow/hooks/register.tsx): `/loadout flow` unfolds its pane.
const flowView = atom({ plugin: 'loadout', key: 'view' } as const, FLOW_VIEW)
// The Flow map's theme, the same way: told at once what a live file's source is.
const flowTheme = atom({ plugin: 'loadout', key: 'flowTheme' } as const, '')

const PANE = 'kirby'
const PANE_COLUMNS = 34 // Sword Kirby, the widest form, and a column to spare
const OPEN = { id: PANE, title: 'Avatar', columns: PANE_COLUMNS }
const FRAME_MS = 90 // the pictures' clock: eleven frames a second
const FEED_MS = 45 // half of it: what moves finer than that clock (a camera feed cut so, an object in ASCII) gets a frame of its own between two
const FILM_MS = 30 // a camera feed cut finer still (a video's own thirty frames a second) has a clock of its own, started when one first plays
const CALM_EVERY = 3 // idle, alone and at rest, one frame in three
const SLOW_MS = 4000 // between re-reads of the usage figures, the model, the theme and the agents
const STUCK_FRAMES = 22 // a frame not drawn after two seconds no longer holds the next ones back
const REFUSED_FRAMES = 6 // a picture the engine refused a frame for is tried again after these, then twice as many, and so on
const REFUSED_MAX = 44
/**
 * How many times each art pixel is sent, each way. At 1 the terminal enlarges the picture (kitty
 * does it pixel for pixel); a terminal that smooths what it enlarges wants `unitOf(cell)` here,
 * the whole enlarging done before sending, at that many times the bytes squared.
 */
const PRESCALE = 1
const HAPPY_MS = 4000
const CONTEXT_FULL = 70
const HELPERS_KEPT = 32
const HELPER_IDLE_MS = 5 * 60_000 // a helper no list names, silent this long, has ended unseen
const LIMIT_NEAR = 85

// One accent per meaning, each a key of the person's theme: every theme recolours the pane by itself.
const COST = 'claude'
const FIVE = 'suggestion'
const WEEK = 'planMode'
const CONTEXT = 'merged' // (not the theme's orange: beside a bar that turns amber it reads as a warning)
const TRACK = 'subtle'
const DIM = 'inactive'

/** The figures as the pane keeps them; a measurement does not say when the session began, so that is carried over. */
const toUsage = (u: Pick<SessionMeasureInput, 'context' | 'rateLimits' | 'cost'>, startedAt: number | undefined): KirbyHudUsage => ({
  ...(startedAt === undefined ? {} : { startedAt }),
  usd: u.cost?.usd,
  limits: u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
  tokens: u.context.tokens,
  window: u.context.window,
  percent: u.context.percent,
})

const LIMIT_NAMES: Record<string, string> = { five_hour: '5h', seven_day: 'weekly' }

const WORRY: Worry = { full: 'context is getting full… /clear?', near: limit => `${limit} limit is almost used up…` }

/** What worries the mascot, in the family's words where it has its own; undefined for nothing. */
function worryOf(u: KirbyHudUsage | null, { full, near }: Worry = WORRY): string | undefined {
  if (u === null) return undefined
  if ((u.percent ?? 0) >= CONTEXT_FULL) return full
  const limit = u.limits.find(l => l.percentUsed >= LIMIT_NEAR)

  return limit && near(LIMIT_NAMES[limit.kind] ?? limit.kind)
}

const moodOf = (u: KirbyHudUsage | null, working: boolean, isHappy: boolean): Mood =>
  isHappy ? 'happy' : worryOf(u) !== undefined ? 'worried' : working ? 'working' : 'idle'

// What a call is about, from the first telling field of its input.
const SUMMARY_KEYS = ['description', 'command', 'file_path', 'path', 'pattern', 'query', 'url', 'skill', 'prompt', 'name']

function summaryOf(input: unknown): string {
  if (typeof input !== 'object' || input === null) return ''
  const fields = input as Record<string, unknown>
  const value = SUMMARY_KEYS.map(key => fields[key]).find(v => typeof v === 'string' && v !== '')

  return typeof value === 'string' ? value.replace(/\s+/g, ' ').slice(0, 200) : ''
}

// --- the crew --------------------------------------------------------------

const quiet = (work: Promise<unknown>) => work.catch(() => {})
const last = <T,>(list: readonly T[]): T | undefined => list[list.length - 1]
const withCall = (list: readonly KirbyHudCall[], call: KirbyHudCall) => [...list.filter(c => c.id !== call.id), call]

/**
 * The helpers with agent `id` among them, heard from at `at`; a new one takes the colour the
 * fewest of them wear, the first of those.
 */
function joined(list: readonly KirbyHudHelper[], id: string, at: number, known: Partial<KirbyHudHelper> = {}): KirbyHudHelper[] {
  const old = list.find(h => h.id === id)
  // ponytail: past as many helpers at once as there are colours, two share one; draw more colours if crews that big turn up.
  const worn = SWAPS.map((_swap, slot) => list.filter(h => h.slot % SWAPS.length === slot).length)
  const slot = worn.indexOf(Math.min(...worn))
  const helper = { id, label: '', slot, calls: [], joinedAt: at, ...old, ...known, seenAt: at }

  return (old ? list.map(h => (h === old ? helper : h)) : [...list, helper]).slice(-HELPERS_KEPT)
}

/** The helper back at work: an agent that finished and is called on again has not left. */
const revived = ({ doneAt: _left, isLost: _how, ...helper }: KirbyHudHelper): KirbyHudHelper => helper

/** The helper, what it does having changed at `at`: until then it ran `tool`, or nothing. Its mini moves on from where that left it. */
const turned = ({ wasTool: _was, ...helper }: KirbyHudHelper, at: number, tool: string | undefined): KirbyHudHelper =>
  ({ ...helper, turnedAt: at, ...(tool === undefined ? {} : { wasTool: tool }) })

/** A call began: the main loop's joins its running calls, a subagent's its helper's. */
async function enter($: EngineInterface, agent: string | undefined, call: KirbyHudCall) {
  if (agent === undefined) return void (await update($, calls, list => withCall(list, call)))
  const at = await $.clock.now()
  await update($, helpers, list => joined(list, agent, at).map(h => (h.id === agent ? turned({ ...revived(h), calls: withCall(h.calls, call) }, at, last(h.calls)?.tool) : h)))
}

/** A call ended: only that one leaves, an older one still running stays shown. Its helper is hurt by a failure, lands a hit otherwise. */
async function exit($: EngineInterface, agent: string | undefined, id: string, isFailed: boolean) {
  const without = (list: readonly KirbyHudCall[]) => list.filter(c => c.id !== id)
  if (agent === undefined) return void (await update($, calls, without))
  const at = await $.clock.now()
  const mark = isFailed ? { hurtAt: at } : { hitAt: at }
  // Only the newest call is acted out: one that ends under it changes nothing of what the mini does.
  const ended = (h: KirbyHudHelper): KirbyHudHelper => (last(h.calls)?.id === id ? turned(h, at, last(h.calls)?.tool) : h)
  await update($, helpers, list => list.map(h => (h.id === agent ? { ...ended(h), ...mark, calls: without(h.calls), seenAt: at } : h)))
}

const hasLeft = (h: KirbyHudHelper, now: number) => h.doneAt !== undefined && now - h.doneAt >= LEAVE_MS

/** Drops the helpers whose dance and ride off are over. */
async function sweep($: EngineInterface) {
  const now = await $.clock.now()
  if ((await read($, helpers)).some(h => hasLeft(h, now))) await update($, helpers, list => list.filter(h => !hasLeft(h, now)))
}

/** The agent ended: its helper dances for an answer, faints when `isLost` (stopped, or failed), then leaves. */
async function finish($: EngineInterface, id: string, isLost: boolean) {
  const at = await $.clock.now()
  await update($, helpers, list => list.map(h => (h.id === id && h.doneAt === undefined ? { ...turned(h, at, last(h.calls)?.tool), calls: [], doneAt: at, isLost } : h)))
  $.clock.after(LEAVE_MS + 50, () => void quiet(sweep($)))
}

const leave = ($: EngineInterface, id: string, isLost = false) => quiet(finish($, id, isLost))

const ENDED = ['completed', 'failed', 'killed', 'idle']

/** Drops the helpers whose end no event told: ended in the engine's list, or unlisted and long silent. */
async function prune($: EngineInterface) {
  const now = await $.clock.now()
  const listed = new Map((await $.agent.list().catch(() => [])).map(a => [a.id, a.status as string]))
  const isGone = (h: KirbyHudHelper) => {
    if (h.doneAt !== undefined) return hasLeft(h, now)
    const status = listed.get(h.id)

    return status === undefined ? h.calls.length === 0 && now - h.seenAt > HELPER_IDLE_MS : ENDED.includes(status)
  }
  if ((await read($, helpers)).some(isGone)) await update($, helpers, list => list.filter(h => !isGone(h)))
}

// --- the pictures ------------------------------------------------------------

/** A grid of cells as RasterProps has them: where a cell shows the terminal's own background, the pane's `ground` instead. */
function packed({ words }: Grid, ground: number): string {
  const cells = ground === NONE ? words : words.map((word, i) => (i % 3 === 2 && word === NONE ? ground : word))

  return btoa(String.fromCharCode(...new Uint8Array(cells.buffer)))
}

// --- the characters' time ------------------------------------------------------
//
// A character (cyber.ts) is drawn from a moment: the mood, since when, and the mood before, which its
// pose leaves smoothly; and the working kata's own clock, which runs faster while a tool does. Not
// drawn state: a reload starts them over, and the pose blends in from the stance.
let beat: Beat = { mood: 'idle', since: 0 }
let kata = 0
let kataAt = 0
// How a character is drawn, as the store has it: in pictures, in text, or (auto) in pictures where the terminal draws them.
type Style = 'pixel' | 'text' | 'auto'
const STYLES: readonly Style[] = ['pixel', 'text', 'auto']
let style: Style = 'auto'

/** The character's moment at `now`. `happyUntil` is when the last cheer ends: one that comes while she is still glad starts her flip over. */
function momentOf(mood: Mood, now: number, isBusy: boolean, happyUntil: number): Moment {
  beat = beatAfter(beat, mood, now, mood === 'happy' ? happyUntil - HAPPY_MS : undefined)
  kata += Math.max(0, Math.min(500, now - kataAt)) * (isBusy ? 1.3 : 0.8)
  kataAt = now

  return { mood, now, since: beat.since, clock: kata, ...(beat.was === undefined ? {} : { was: beat.was }) }
}

// A mascot that acts (Clawd, in true pixels) keeps its own beat: its pose leaves the mood before smoothly too.
let stride: Beat = { mood: 'idle', since: 0 }

function actingOf(mood: Mood, now: number): Acting {
  stride = beatAfter(stride, mood, now)

  return { mood, now, since: stride.since, ...(stride.was === undefined ? {} : { was: stride.was.mood }) }
}

/** Where the pictures are, once found: a folder per slot (reel.ts), `<assets>/<slot>/`. */
let assets: string | null = null
const PORTRAIT_FRAMES = 12
const PORTRAIT_MS: Readonly<Record<Mood, number>> = { idle: 160, working: 110, happy: 90, worried: 110 }

// Footage per slot, where its manifest was found (`<slot>/manifest.json`, loops at `<slot>/<clip>/NNN.png`).
const reels = new Map<Slot, Reel>()
// The slots with still portrait frames (`<slot>/<mood>-NN.png`, twelve a loop): what an Opus without a manifest shows.
const stills = new Set<Slot>()
// When the mood on screen began and whose it is, so a mood's loops start from their first frame, and again when the character changes.
let reelMood: { slot: Slot; mood: string; since: number } | null = null
let reelsTriedAt = -Infinity

/**
 * Looks for the slots' manifests (and the Opus slots' stills) not found yet. Footage can arrive
 * after the session began, a folder at a time: looked for again a few times a minute, until all
 * twelve manifests are found. Never throws.
 */
async function findAssets($: EngineInterface) {
  if (reels.size >= SLOTS.length) return
  const now = await $.clock.now()
  if (now - reelsTriedAt < 15_000) return
  reelsTriedAt = now
  for (const dir of assets === null ? [`${$.plugin.root}/assets`, `${$.plugin.root}/../assets`] : [assets]) {
    for (const slot of SLOTS) {
      if (reels.has(slot)) continue
      const reel = reelOf(await $.fs.read(`${dir}/${slot}/manifest.json`).then(read => (typeof read === 'string' ? read : ''), () => ''))
      if (reel !== null) reels.set(slot, reel)
      else if (slot.endsWith('-opus') && !stills.has(slot) && (await $.fs.exists(`${dir}/${slot}/idle-00.png`).then(found => found === true, () => false))) stills.add(slot)
    }
    if (reels.size + stills.size > 0) {
      assets = dir
      break
    }
  }
}

/** Whether a slot has pictures for the camera feed: its footage, or its stills. */
const hasPictures = (slot: Slot): boolean => assets !== null && (reels.has(slot) || stills.has(slot))

/** The feed's frame at `now`: the slot's loop for the mood, from the first frame of a mood or a character new on screen; without footage its still portrait, a happy one played from the cheer's start, the others looping on the clock. */
function portraitOf(slot: Slot, mood: Mood, now: number, happyUntil: number, doing: State | undefined = undefined): { file: string; format: 'png' } {
  const reel = reels.get(slot)
  if (reel !== undefined) {
    // (A reel may have loops for a kind of call too, under its state's name: `scan`, `edit`, `exec`... They play while such a call runs.)
    const played = playedOf(reel, mood, cueOf(mood, doing))
    if (reelMood === null || reelMood.mood !== played || reelMood.slot !== slot) reelMood = { slot, mood: played, since: now }
    const at = frameAt(reel, played, now - reelMood.since)
    if (at !== null) return { file: `${assets}/${slot}/${at.clip}/${String(at.frame).padStart(3, '0')}.png`, format: 'png' }
  }
  const step = mood === 'happy' ? Math.min(PORTRAIT_FRAMES - 1, Math.max(0, Math.floor((now - (happyUntil - HAPPY_MS)) / PORTRAIT_MS.happy))) : Math.floor(now / PORTRAIT_MS[mood]) % PORTRAIT_FRAMES

  return { file: `${assets}/${slot}/${mood}-${String(step).padStart(2, '0')}.png`, format: 'png' }
}

/** What a Raster or an Image shows: cells, or a source. */
type Picture = { cells: string } | { source: ReturnType<typeof sourceOf> | { file: string; format: 'png' } }

/** The mascot at `now`: a true-pixel frame where the layout has them (clear where nothing is drawn: the pane's ground shows through), else the cell-block step of that moment on `ground`. */
function mascotPicture(drawn: Layout, mood: Mood, now: number, ground: number, isBusy = false, happyUntil = 0, isLight = false, doing: State | undefined = undefined): Picture {
  if ('text' in drawn && drawn.feed !== undefined) return { source: portraitOf(drawn.feed, mood, now, happyUntil, doing) }
  if ('text' in drawn && drawn.hero !== undefined) {
    const moment = momentOf(mood, now, isBusy, happyUntil)

    return drawn.art === undefined ? { cells: packed(heroGrid(drawn.hero, moment, drawn.size.columns, drawn.size.rows), ground) }
      : { source: sourceOf(heroCanvas(drawn.hero, moment, drawn.art.mascot.width, drawn.art.mascot.height), PRESCALE) }
  }
  // (The chrome skins have no mask: their mascot is the model's object, in ASCII. Nor the Halo ones: theirs acts out the call that runs.)
  if ('text' in drawn && isHalo(drawn.text.skin)) return { cells: packed(haloLive(drawn.text.skin, drawn.text.form, mood, now, drawn.size.columns, drawn.size.rows, doing), ground) }
  if ('text' in drawn) return { cells: packed((isChrome(drawn.text.skin) ? chromeFrame : maskFrame)(drawn.text.skin, drawn.text.form, mood, now, drawn.size.columns, drawn.size.rows), ground) }
  if (drawn.art === undefined) return { cells: encoded(mascotBlocks(drawn, mood, Math.floor(now / TICK_MS)), ground) }
  const { mascot, scale } = drawn.art
  const acted = drawn.look.family.acted
  if (acted !== undefined) return { source: sourceOf(acted.frame(drawn.look.form, actingOf(mood, now), mascot.width, mascot.height, scale, isLight), PRESCALE) }

  return { source: sourceOf(mascotFrame(frameOf(drawn.look, mood, now), mood, now, mascot.width, mascot.height, scale), PRESCALE) }
}

/** The stage at `now`, the same way; the layout has one. */
function stagePicture(drawn: Layout, crew: readonly KirbyHudHelper[], now: number, ground: number, isLight: boolean): Picture {
  if ('text' in drawn) return { cells: packed(agentRows(drawn.text.skin, crew, now, drawn.stage?.columns ?? 1, drawn.stage?.rows ?? 1), ground) }
  const { family } = drawn.look
  const art = drawn.art?.stage
  if (art) return { source: sourceOf(stageFrame(family.mini, crew, now, art.width, art.height, isLight), PRESCALE) }

  return { cells: encoded(sceneOf(family.blocks, crew, Math.floor(now / TICK_MS), now, drawn.stage?.columns ?? STAGE_NARROWEST, isLight), ground) }
}

// --- text ------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0')

function countdown(resetsAt: string | undefined, now: number): string {
  const minutes = Math.floor((Date.parse(resetsAt ?? '') - now) / 60000)
  if (Number.isNaN(minutes)) return ''
  if (minutes <= 0) return 'reset due' // the reading is older than its window
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60

  return `resets in ${d > 0 ? `${d}d${pad2(h)}h` : h > 0 ? `${h}h${pad2(m)}` : `${m}m`}`
}

const tokens = (n: number) =>
  n >= 1e6 ? `${Number((n / 1e6).toFixed(1))}M` : `${Math.round(n / 1000)}k`

const money = (usd: number | undefined) => (usd === undefined ? '$ n/a' : `$${usd.toFixed(2)}`)

const tone = (percent: number, warnAt: number, badAt: number) =>
  percent < warnAt ? 'success' : percent < badAt ? 'warning' : 'error'

const limitTone = (percent: number) => tone(percent, 60, LIMIT_NEAR)
const contextTone = (percent: number) => tone(percent, 50, CONTEXT_FULL)

/** `text` on at most `max` lines of `width`, broken at spaces where it can, the last cut with an ellipsis. */
function wrapped(text: string, width: number, max: number): string[] {
  const lines: string[] = []
  let rest = text.trim()
  while (rest.length > width && lines.length < max - 1) {
    const space = rest.lastIndexOf(' ', width)
    const at = space > width / 2 ? space : width
    lines.push(rest.slice(0, at))
    rest = rest.slice(at).trimStart()
  }

  return [...lines, rest.length > width ? `${rest.slice(0, width - 1)}…` : rest]
}

// --- life ------------------------------------------------------------------

// Not drawn state: the timers die with the module, so these may too.
let isSeeded = false
let isTicking = false
let shape = '' // the pane's size when the cell was last measured

// --- the terminal ------------------------------------------------------------

// Whether this terminal draws pictures: kitty and Ghostty do, a multiplexer passes none through. Unknown
// until asked; a blit told "an Image draws its alt here" turns it off for a while, not for good:
// the engine says so too while it is still asking the terminal, or is out of image ids.
let canPicture: boolean | undefined
const RETRY_MS = 15_000 // after the first such denial; doubled by each one in a row
const RETRY_MAX_MS = 10 * 60_000
let retryMs = RETRY_MS
let retryAt = 0 // when pictures are tried again, 0 for no retry due
// A cell in device pixels, null while nobody could measure it.
let cell: Cell | null = null

async function detect($: EngineInterface) {
  const read = (value: Promise<string | undefined>) => value.catch(() => undefined)
  const [term, program, kitty] = [await read($.env.get('TERM')), await read($.env.get('TERM_PROGRAM')), await read($.env.get('KITTY_WINDOW_ID'))]
  // A multiplexer between the session and the terminal: tmux, screen or zellij here, or one reached over ssh, told by the TERM it sets.
  const muxes = [await read($.env.get('TMUX')), await read($.env.get('STY')), await read($.env.get('ZELLIJ'))]
  const isMuxed = /^(screen|tmux)/.test(term ?? '') || muxes.some(value => value !== undefined)
  canPicture = !isMuxed && (kitty !== undefined || /kitty|ghostty/i.test(`${term ?? ''} ${program ?? ''}`))
  // A terminal that can be told its colours: not a multiplexer's pane (the pty is the multiplexer's, which keeps its own), not the console, not no terminal at all.
  isColourable = !isMuxed && term !== undefined && !/^(dumb|linux)?$/.test(term)
}

// --- the theme packs -------------------------------------------------------------
//
// What a theme asks of the pane is data: the packs of `<mods>/themes/` (packs.ts). They are read at
// the start and again when a file of theirs changes; the families' own tables answer where no pack does.
let packs: readonly Pack[] = []
// Where they were read from (null: nowhere), what its listing was then, and the files left out, each with why.
let packsAt: string | null = null
let packsPrint: string | undefined
let packsSkipped: readonly string[] = []

/**
 * Reads the packs where the folder's listing changed (a name, a size, a time); resolves true when
 * what was read did. Never throws: a folder or a file that cannot be read is left out, and a file
 * that is no pack is skipped by name.
 */
async function loadPacks($: EngineInterface): Promise<boolean> {
  for (const dir of [`${$.plugin.root}/themes`, `${$.plugin.root}/../themes`]) {
    const entries = await $.fs.list(dir).catch(() => null)
    if (!Array.isArray(entries)) continue
    const { files, print } = packFiles(entries)
    if (files.length === 0) continue
    if (packsAt === dir && packsPrint === print) return false
    const texts = new Map<string, string | null>()
    for (const file of files) texts.set(file.name, await $.fs.read(`${dir}/${file.name}`).then(text => (typeof text === 'string' ? text : null), () => null))
    const read = packsOf(texts)
    ;[packs, packsSkipped, packsAt, packsPrint] = [read.packs, read.skipped, dir, print]

    return true
  }
  if (packsAt === null) return false
  ;[packs, packsSkipped, packsAt, packsPrint] = [[], [], null, undefined]

  return true
}

// --- the terminal's background -------------------------------------------------
//
// A theme cannot set the terminal's own background; the terminal can be told: OSC 11 sets it, OSC 111
// gives back the one the person configured. The engine has no word for writing to the terminal, so
// the escape is written to the pty the session runs on, by a child that finds it from its parents
// (Linux). Nothing here ever throws into a hook, and nothing is written anywhere but a pty of the
// person's own: the path is checked here before the child is started, and again by the child on the
// file it has opened.

// Whether this session is one a person sits at in a terminal, and whether that terminal takes colours.
let isAtTerminal = false
let isColourable = false
// The /kirby background switch, as the store has it (on while nobody said).
let isTinting = true
// The session's pty: undefined until looked for, null where there is none to write to.
let tty: string | null | undefined
// What the terminal was last told, for sure (the write ended well): a colour, '' for its own background back; undefined while nothing was.
let tinted: string | undefined
// What the write under way asks for, undefined for none: a tick that comes meanwhile sends nothing.
let asking: string | undefined
// A colour was written, or tried (a write that failed may have reached the terminal all the same), and its own background not since given back for sure.
let isDirty = false
// The writes that failed in a row. After GIVE_UP of them the ticks stop trying; the person's own word, and the session's end, try once more.
let failures = 0
const GIVE_UP = 3
// The session is over and the terminal has its own background back: a timer still running tells it nothing more.
let isEnded = false
// The writes, one after the other: each is a child of its own, and children started together do not write in the order they were started.
let writing: Promise<unknown> = Promise.resolve()

// Prints the nearest parent's pty, whether it is a character device, whose it is, and who asks.
const FIND_TTY = `import os, stat
pid = os.getppid()
for _ in range(4):
    for fd in (1, 0, 2):
        try:
            path = os.readlink(f'/proc/{pid}/fd/{fd}')
            if path.startswith('/dev/pts/'):
                info = os.stat(path)
                print(path, int(stat.S_ISCHR(info.st_mode)), info.st_uid, os.getuid())
                raise SystemExit
        except OSError:
            pass
    try:
        pid = int(open(f'/proc/{pid}/stat').read().rsplit(')', 1)[1].split()[1])
    except (OSError, ValueError):
        break
`

// Writes to the pty named: OSC 11 with the colour given, OSC 111 with none, and the foreground that goes with it. Anything that
// is not a pty of the caller's own, or not a colour, is refused before a byte is written.
const SET_GROUND = `import os, re, stat, sys
path, color = sys.argv[1], sys.argv[2]
if not re.fullmatch('/dev/pts/[0-9]+', path) or not re.fullmatch('(#[0-9a-f]{6})?', color):
    sys.exit(2)
fd = os.open(path, os.O_WRONLY | os.O_NOCTTY | os.O_NOFOLLOW | os.O_NONBLOCK)
info = os.fstat(fd)
if not (stat.S_ISCHR(info.st_mode) and info.st_uid == os.getuid() and os.isatty(fd)):
    sys.exit(3)
# A light background takes the rest with it: the terminal's own foreground, cursor and sixteen colours were chosen for its
# own background, and plain text and highlighted code are written in them. The foreground (OSC 10) and cursor (OSC 12) become the
# background's hue darkened to a near-black, the sixteen (OSC 4) inks that read on a pale ground. A dark one keeps the person's (OSC 110, 112, 104).
ink = '\\033]110\\a\\033]112\\a\\033]104\\a'
if color:
    r, g, b = (int(color[i:i + 2], 16) for i in (1, 3, 5))
    if 2126 * r + 7152 * g + 722 * b > 1500000:
        dark = f'#{r * 6 // 100:02x}{g * 9 // 100:02x}{b * 23 // 100:02x}'
        inks = [dark, '#c81e2c', '#0f7f52', '#8a6a00', '#1c3fd6', '#8a3fc0', '#00798a', '#5c6f94', '#6b7a9c', '#d81e2c', '#0b8f5c', '#a07a00', '#2a62c9', '#a23bb5', '#00857a', '#3d4c72']
        ink = f'\\033]10;{dark}\\a\\033]12;{dark}\\a' + ''.join(f'\\033]4;{n};{one}\\a' for n, one in enumerate(inks))
os.write(fd, ((f'\\033]11;{color}\\a' if color else '\\033]111\\a') + ink).encode())
`

const PTY = /^\/dev\/pts\/\d+$/

/** The pty this session runs on, or null: looked for once. Only a `/dev/pts/N` that is a character device owned by the person is one. */
async function ttyOf($: EngineInterface): Promise<string | null> {
  if (tty !== undefined) return tty
  const got = await $.process.run(['python3', '-I', '-c', FIND_TTY], { timeoutMs: 3000 }).catch(() => null)
  const [path = '', isDevice, owner, me] = (got?.stdout ?? '').trim().split(' ')
  tty = got?.exitCode === 0 && PTY.test(path) && isDevice === '1' && owner !== undefined && owner === me ? path : null

  return tty
}

/**
 * Tells the terminal the background `theme` calls for (its own back for a theme that brings none,
 * or with the switch off), once per change. A theme not read yet changes nothing. Where it cannot
 * work (no pty, not a person's terminal) it does nothing. A write that fails is not taken for done:
 * the next tick tries again, GIVE_UP times in a row at the most, so one lost write never leaves the
 * terminal in another theme's colour.
 */
async function tint($: EngineInterface, theme: string) {
  if (isEnded || !isAtTerminal || !isColourable || theme === '') return
  const ground = isTinting ? themed(theme, packs).ground : undefined
  const want = ground === undefined ? '' : hex(ground.terminal)
  if (want === (asking ?? tinted) || failures >= GIVE_UP) return
  const path = await ttyOf($)
  if (isEnded || path === null || want === (asking ?? tinted)) return
  await written($, path, want)
}

/** Writes `want` and records what became of it: `tinted` only once the write has ended well. */
async function written($: EngineInterface, path: string, want: string) {
  asking = want
  if (want !== '') isDirty = true
  const sent = await told($, path, want)
  if (asking === want) asking = undefined
  if (sent?.exitCode !== 0) return void (failures += 1)
  failures = 0
  tinted = want
  // (A colour asked for while this restore was running is written after it: the terminal is not clean then.)
  if (want === '' && (asking === undefined || asking === '')) isDirty = false
}

/** One escape written to the pty, after every write asked for before it. */
function told($: EngineInterface, path: string, color: string) {
  // (While it is written, nothing is drawn between two frames: a feed's picture sent that instant could land inside the escape and break it.)
  const sent = writing.then(async () => {
    grounding += 1
    try {
      return await $.process.run(['python3', '-I', '-c', SET_GROUND, path, color], { timeoutMs: 3000 })
    } catch {
      return null
    } finally {
      grounding -= 1
    }
  })
  writing = sent

  return sent
}

/** The terminal's own background back, if a colour was ever written or tried since it last had it: for the session's end, whatever failed before. */
async function untint($: EngineInterface) {
  if (!isDirty || tty === undefined || tty === null) return
  await written($, tty, '')
}

// The terminal's size in cells and in pixels, asked of the pty the session runs on: the engine
// has no word for it, and a child has no terminal of its own, so it looks up its parents' (Linux).
const PROBE = `import fcntl, os, struct, termios
pid = os.getpid()
for _ in range(16):
    for fd in (0, 1, 2):
        try:
            path = os.readlink(f'/proc/{pid}/fd/{fd}')
            if path.startswith('/dev/pts/'):
                size = fcntl.ioctl(os.open(path, os.O_RDONLY | os.O_NOCTTY), termios.TIOCGWINSZ, bytes(8))
                print(*struct.unpack('HHHH', size))
                raise SystemExit
        except OSError:
            pass
    try:
        pid = int(open(f'/proc/{pid}/stat').read().rsplit(')', 1)[1].split()[1])
    except (OSError, ValueError):
        break
`

/** Measures a cell; resolves true when it changed. Where it cannot, the cell stays unknown and is taken for one by two. */
async function measure($: EngineInterface): Promise<boolean> {
  const got = await $.process.run(['python3', '-I', '-c', PROBE], { timeoutMs: 3000 }).catch(() => null)
  const [rows = 0, columns = 0, x = 0, y = 0] = (got?.stdout ?? '').trim().split(/\s+/).map(Number)
  const next = { w: Math.round(x / columns), h: Math.round(y / rows) }
  const found = next.w >= 4 && next.w <= 64 && next.h >= next.w && next.h <= 160 ? next : null
  const isNew = JSON.stringify(found) !== JSON.stringify(cell)
  cell = found

  return isNew
}

/** Re-reads the engine's figures; writes (and so redraws) only when they moved. */
async function refresh($: EngineInterface) {
  const live = await $.session.usage()
  const fresh = toUsage(live, live.startedAt)
  if (JSON.stringify(fresh) !== JSON.stringify(await read($, usage))) await update($, usage, () => fresh)
}

async function seed($: EngineInterface) {
  if (isSeeded) return
  isSeeded = true
  try {
    const petted = await $.store.get('pets')
    if (typeof petted === 'number') await update($, pets, () => petted)
    isTinting = (await $.store.get('background')) !== false
    const kept = await $.store.get('style')
    style = STYLES.find(one => one === kept) ?? 'auto'
  } catch (error) {
    isSeeded = false // try again: a pet must not overwrite a count never read

    throw error
  }
}

/** Re-reads what picks the mascot: the session's model, its form, and the theme, its family. */
async function sync($: EngineInterface) {
  const id = await $.session.model().catch(() => '')
  if (id !== (await read($, model))) await update($, model, () => id)
  const known = await themesOf($)
  if (!known.isListed) return
  const row = String(known.row?.value ?? '')
  // What this terminal paints from. A running session keeps the theme it started with whatever the
  // settings file says later (themes.ts): where a live theme is in play, a change of the row is
  // never followed. What the person picks in this session (/theme, /config) is told by `config.set`
  // (`chose`), not read from the row. Any other change is followed as it always was.
  const kept = (await read($, painted)) || paintedHere
  const isMoved = lastRow !== undefined && row !== lastRow
  const runs = kept === '' || (isMoved && liveOf(row) === undefined && liveOf(kept) === undefined) ? row : kept
  lastRow = row
  paintedHere = runs
  if (runs !== (await read($, painted))) await update($, painted, () => runs)
  const name = await sourced($, runs, known)
  if (name !== (await read($, theme))) await update($, theme, () => name)
  if (name !== (await read($, flowTheme))) await quiet(update($, flowTheme, () => name))
  await quiet(tint($, name))
}

const sessionLook = async ($: EngineInterface): Promise<{ family: FamilyDef; form: Form }> => ({
  family: themed(await read($, theme), packs).family,
  form: formOf(await read($, model)),
})

/** The slow work: what the engine does not tell by an event is read again. */
async function slow($: EngineInterface) {
  await seed($)
  // session.measure is not raised by a /clear or a /compact: without this
  // re-read the context row would keep the old fill until the next turn ends.
  await refresh($)
  // A pack edited, added or taken away shows within a tick: the pane is drawn from it, the terminal told its colour.
  const isRepacked = await loadPacks($).catch(() => false)
  const isReoffered = await loadOffers($).catch(() => false)
  await sync($)
  if (isRepacked || isReoffered) $.ui.invalidate('ui.render')
  await quiet(prune($))
  if (retryAt !== 0 && (await $.clock.now()) >= retryAt) {
    retryAt = 0
    await quiet(detect($))
  }
  // A pane behind another tab, or closed, is not drawn: its frames stop, and nothing asks for a
  // redraw that would start them again. Shown again, the engine draws it and they resume.
  if (!(await $.ui.panes()).some(pane => pane.id === PANE && pane.isShown && pane.isPlaced)) {
    isPaneUp = false
    shown = null

    return
  }
  $.ui.invalidate('ui.render') // keeps the countdowns moving
}

// What the pane's last draw mounted and drew from: a frame repaints exactly those pictures, with
// no render pass and without asking the engine for anything but the time.
// `keys` are the pictures mounted.
// `ground` is the pane's own background, NONE for the terminal's; `isLight` whether the theme is a light one.
type Shown = { layout: Layout; ground: number; isLight: boolean; usage: KirbyHudUsage | null; isWorking: boolean; isBusy: boolean; doing: State | undefined; happyUntil: number; crew: readonly KirbyHudHelper[]; keys: Set<string> }
let shown: Shown | null = null
let isPaneUp = false
// What each picture last showed: a frame equal to it is not sent.
const sent = new Map<string, string>()
const printOf = (picture: Picture) => ('cells' in picture ? picture.cells : 'file' in picture.source ? picture.source.file : picture.source.rgba)
// The pictures the engine refused a frame for, by key: the frame count at which each is tried again, and how long it waited.
const refused = new Map<string, { until: number; wait: number }>()

/**
 * Swaps one mounted picture for its next frame, unless nothing in it moved. A frame the engine
 * refuses means the picture is not there as drawn (not mounted yet, another size): it is tried
 * again a few frames later, then more and more sparsely, and at once when the pane is drawn again.
 */
async function put($: EngineInterface, key: string, box: { columns: number; rows: number }, picture: Picture) {
  if (sent.get(key) === printOf(picture) || frames < (refused.get(key)?.until ?? 0)) return
  sent.set(key, printOf(picture))
  const got = await $.ui.blit({ requestId: PANE, key, ...picture, columns: box.columns, rows: box.rows })
  if (got.deny === undefined) {
    if ('source' in picture) retryMs = RETRY_MS
    refused.delete(key)

    return
  }
  sent.delete(key)
  const wait = Math.min(REFUSED_MAX, (refused.get(key)?.wait ?? REFUSED_FRAMES / 2) * 2)
  refused.set(key, { until: frames + wait, wait })
  // An Image drawing its alt: no pictures here for now, the cell blocks take over until the retry.
  if ('source' in picture && /placeholder|\balt\b/i.test(got.deny)) {
    canPicture = false
    retryAt = (await $.clock.now()) + retryMs
    retryMs = Math.min(RETRY_MAX_MS, retryMs * 2)
    $.ui.invalidate('ui.render')
  }
}

let frames = 0
let isCalm = false

/** One frame of the pictures. Idle with no agents, little moves: most frames are skipped before anything is asked. */
async function draw($: EngineInterface) {
  frames += 1
  const mounted = shown
  if (mounted === null || mounted.keys.size === 0 || (isCalm && frames % CALM_EVERY !== 0)) return
  const now = await $.clock.now()
  const mood = moodOf(mounted.usage, mounted.isWorking, now < mounted.happyUntil)
  // (A mask in text never rests: its scan line and its glow are the whole of its idling, and a frame of cells is small.)
  // A character rests too, but only while nothing of it moves faster than its breathing, nor is about to: a head that turns, fingers on a deck, a flourish are drawn every frame.
  const hero = 'text' in mounted.layout ? mounted.layout.hero : undefined
  // (A mascot that acts rests the same way: between a blink, a look, a shuffle and a hop, nothing of it moves but its breathing.)
  const acted = 'look' in mounted.layout && mounted.layout.art !== undefined ? mounted.layout.look.family.acted : undefined
  // (A camera feed never rests: its loops are the whole of it.)
  const isStill = 'text' in mounted.layout ? mounted.layout.feed === undefined && hero !== undefined && isAtRest(hero, momentOf(mood, now, false, mounted.happyUntil)) : acted === undefined || acted.isAtRest(actingOf(mood, now))
  isCalm = mood === 'idle' && mounted.crew.length === 0 && isStill
  if (mounted.keys.has('kirby')) await put($, 'kirby', mounted.layout.size, mascotPicture(mounted.layout, mood, now, mounted.ground, mounted.isBusy, mounted.happyUntil, mounted.isLight, mounted.doing))
  if (mounted.keys.has('stage') && mounted.layout.stage !== null && mounted.crew.length > 0) await put($, 'stage', mounted.layout.stage, stagePicture(mounted.layout, mounted.crew, now, mounted.ground, mounted.isLight))
}

// The frame being drawn, 0 for none, and for how many ticks: a slow blit makes the clock skip
// frames, never queue them, and one that never answers is given up on.
let drawing = 0
let waited = 0
let turn = 0

function frame($: EngineInterface) {
  if (!isPaneUp) return
  if (drawing !== 0 && (waited += 1) < STUCK_FRAMES) return
  const mine = (turn += 1)
  drawing = mine
  waited = 0
  void draw($).catch(() => {}).finally(() => {
    if (drawing === mine) drawing = 0
  })
}

// The beats of the clock (FEED_MS): the even ones are the pictures' frames.
let beats = 0
// Whether the finer clock (FILM_MS) runs: it starts with the first feed cut finer than FEED_MS, and then draws that feed alone.
let isFilming = false
// How many writes of the terminal's ground are under way: none of the finer clocks draws meanwhile.
let grounding = 0

/**
 * Between two frames, what is cut finer than the pictures' clock, and nothing else: the camera feed's next picture where
 * its footage has such a loop, and the chrome skins' object and the Halo skins' figure, which move in ASCII. Twenty-two frames a second; thirty-three for a feed cut finer than FEED_MS.
 */
function between($: EngineInterface, isFilmBeat = false) {
  if (!isPaneUp || drawing !== 0 || grounding > 0) return
  const mounted = shown
  if (mounted === null || !('text' in mounted.layout) || !mounted.keys.has('kirby')) return
  const { feed, hero, text } = mounted.layout
  const reel = feed === undefined ? undefined : reels.get(feed)
  const isFine = feed === undefined ? hero === undefined && (isChrome(text.skin) || isHalo(text.skin)) : reel !== undefined && Object.values(reel.clips).some(clip => clip.ms < FRAME_MS)
  const isFilm = reel !== undefined && Object.values(reel.clips).some(clip => clip.ms < FEED_MS)
  if (isFilm && !isFilming) {
    isFilming = true
    $.clock.every(FILM_MS, () => between($, true))
  }
  // (Each clock draws its own: a feed cut that fine is the finer clock's, everything else this one's.)
  if (!isFine || isFilm !== isFilmBeat) return
  const mine = (turn += 1)
  drawing = mine
  waited = 0
  void $.clock.now()
    .then(now => put($, 'kirby', mounted.layout.size, mascotPicture(mounted.layout, moodOf(mounted.usage, mounted.isWorking, now < mounted.happyUntil), now, mounted.ground, mounted.isBusy, mounted.happyUntil, mounted.isLight, mounted.doing)))
    .catch(() => {})
    .finally(() => {
      if (drawing === mine) drawing = 0
    })
}

function startTicking($: EngineInterface) {
  if (isTicking) return
  isTicking = true
  // One clock for both, so the two never drift apart: every other beat is a frame of everything, the ones between the feed's alone.
  $.clock.every(FEED_MS, () => ((beats += 1) % 2 === 0 ? frame($) : between($)))
  $.clock.every(SLOW_MS, () => void slow($).catch(() => {}))
}

async function cheer($: EngineInterface) {
  const now = await $.clock.now()
  await update($, happyUntil, () => now + HAPPY_MS)
  $.clock.after(HAPPY_MS + 50, () => $.ui.invalidate('ui.render'))
}

// --- hooks -----------------------------------------------------------------

/** A source's own theme, undefined where it sets none (or cannot be read). */
async function themeIn($: EngineInterface, source: 'user' | 'project' | 'local' | 'flag' | 'policy'): Promise<string | undefined> {
  const value = (await $.settings.read({ source }).catch(() => null))?.['theme']

  return typeof value === 'string' && value !== '' ? value : undefined
}

// The settings files that outrank the user's, as the person knows them.
const OVER = { policy: "your organization's managed settings", local: ".claude/settings.local.json of this project", project: ".claude/settings.json of this project" } as const

/** A path with its `.`, `..`, doubled and closing slashes taken out: two spellings of one file compare equal. */
const tidied = (path: string): string => {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '' && part !== '.') parts.push(part)
  }

  return `/${parts.join('/')}`
}

/**
 * Whether the project's settings file is the user's own: a session started in the home directory,
 * where `<cwd>/.claude/settings.json` is `~/.claude/settings.json`. Both paths are resolved: as
 * written first, then through their links (`realpath`, where the two still differ).
 */
async function isUsersFile($: EngineInterface, users: string): Promise<boolean> {
  const cwd = await $.session.cwd().catch(() => '')
  if (cwd === '') return false
  const projects = `${cwd}/.claude/settings.json`
  if (tidied(projects) === tidied(users)) return true
  const got = await $.process.run(['realpath', '-m', '--', projects, users], { timeoutMs: 3000 }).catch(() => null)
  const [one, other] = (got?.exitCode === 0 ? got.stdout : '').trim().split('\n')

  return one !== undefined && one !== '' && one === other
}

/** Where the settings and the themes are, and the themes there are: the engine's own row, and the files of `<config>/themes`. */
async function themesOf($: EngineInterface) {
  const rows = await $.config.list().catch(() => null)
  const row = rows?.find(one => one.key === 'theme')
  const home = (await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined)) ?? `${(await $.env.get('HOME').catch(() => undefined)) ?? '~'}/.claude`
  const listed = await $.fs.list(`${home}/themes`).catch(() => null)
  const all = (Array.isArray(listed) ? listed : []).filter(one => one.kind === 'file' && one.name.endsWith('.json')).sort((x, y) => (x.name.slice(0, -5) < y.name.slice(0, -5) ? -1 : 1))
  // The live files (themes.ts) are Loadout's own copies: never a source, never offered, never matched by name.
  const files = all.filter(one => !isLive(one.name.slice(0, -5)))

  return { row, isListed: rows !== null, home, files, lives: all.filter(one => isLive(one.name.slice(0, -5))), builtIns: row?.options ?? BUILT_IN, customs: files.map(one => one.name.slice(0, -5)) }
}

type Themes = Awaited<ReturnType<typeof themesOf>>

/**
 * Puts the colour files the plugin ships (`colors/<slug>.json`) in `<config>/themes` where no file of
 * that name is there: a first start has the themes to pick. A file already there is the person's own
 * and is never written over. Resolves the names written.
 */
async function installColours($: EngineInterface): Promise<string[]> {
  const shipped = await $.fs.list(`${$.plugin.root}/colors`).catch(() => null)
  if (!Array.isArray(shipped)) return []
  const { home, files, lives } = await themesOf($)
  // (No home to name: `~` is no place to write.)
  if (!/^(\/|[A-Za-z]:[\\/])/.test(home)) return []
  const there = new Set([...files, ...lives].map(one => one.name))
  const written: string[] = []
  for (const one of shipped) {
    if (one.kind !== 'file' || !/^[a-z0-9]+(-[a-z0-9]+)*\.json$/.test(one.name) || there.has(one.name)) continue
    const text = await $.fs.read(`${$.plugin.root}/colors/${one.name}`).catch(() => null)
    if (typeof text !== 'string' || liveText(one.name.slice(0, -5), text) === undefined) continue
    // A folder that could not be listed, or a link there: what stands is the person's. In doubt, nothing is written.
    if (await $.fs.exists(`${home}/themes/${one.name}`).catch(() => true)) continue
    await $.fs.write(`${home}/themes/${one.name}`, text)
    written.push(one.name)
  }

  return written
}

// --- the live theme files (themes.ts says why) --------------------------------------------------

// This terminal's painted setting again, for where the session's state starts over and the module does not (a /clear).
let paintedHere = ''
// The settings row as last read: a change of it is what `sync` weighs.
let lastRow: string | undefined

/**
 * The person picked a theme in this session, with Claude Code's own /theme or /config: this terminal
 * paints it from now on, whatever the settings row said before (the same theme picked again, or the
 * live theme on a terminal that was not on it, moves no row). Probed: /theme raises `config.set`
 * with the theme picked, a `custom:` one too, and raises nothing when left with Esc.
 */
async function chose($: EngineInterface, setting: string) {
  paintedHere = setting
  await update($, painted, () => setting)
  await sync($)
}
// Each live file's source, with the size and time it was read at.
const liveSeen = new Map<string, { print: string; source: string }>()

/** A theme setting as the theme it shows: a live file's source (read again where the file's size or time changed), any other setting itself. */
async function sourced($: EngineInterface, setting: string, { home, lives, builtIns }: Pick<Themes, 'home' | 'lives' | 'builtIns'>): Promise<string> {
  const slug = liveOf(setting)
  const entry = slug === undefined ? undefined : lives.find(one => one.name === `${slug}.json`)
  if (slug === undefined || entry === undefined) return setting
  const print = `${entry.size}:${entry.mtimeMs}`
  const seen = liveSeen.get(slug)
  if (seen?.print === print) return seen.source
  const text = await $.fs.read(`${home}/themes/${slug}.json`).then(got => (typeof got === 'string' ? got : ''), () => '')
  const source = liveSource(text, builtIns) ?? setting
  liveSeen.set(slug, { print, source })

  return source
}

// Whether `mv` can be run here, once it was seen to.
let canMove = false

/** The file system as `writeLive` takes it. The engine has no rename, and no removal: both are a process's (`mv`, `rm`). */
async function diskOf($: EngineInterface): Promise<Disk> {
  const read: Disk['read'] = path => $.fs.read(path).then(got => (typeof got === 'string' ? got : null), () => null)
  canMove ||= await $.process.run(['sh', '-c', 'command -v mv'], { timeoutMs: 3000 }).then(got => got.exitCode === 0, () => false)
  if (!canMove) {
    // ponytail: where no `mv` can be run the file is written in place, not atomically (one small write), and no temporary file is made: nothing here could remove it. A rename in `$.fs` would lift this.
    const held = new Map<string, string>()

    return {
      read,
      write: async (path, text) => void held.set(path, text),
      move: async (from, to) => {
        const text = held.get(from)
        if (text === undefined) throw new Error('nothing to write')
        await $.fs.write(to, text)
      },
    }
  }

  return {
    read,
    write: (path, text) => $.fs.write(path, text),
    move: async (from, to) => {
      const got = await $.process.run(['mv', '-f', '--', from, to], { timeoutMs: 3000 }).catch(error => ({ exitCode: -1, stderr: String(error) }))
      if (got.exitCode === 0) return
      await quiet($.process.run(['rm', '-f', '--', from], { timeoutMs: 3000 })) // no temporary file is left in the themes folder
      throw new Error(got.stderr.trim() || 'the rename failed')
    },
  }
}

/** A live file's text for `setting`'s theme, read from its file: `text`, or `failed`, why there is none. Asked before anything is written or set. */
async function liveFor($: EngineInterface, home: string, setting: string): Promise<{ text: string; failed?: undefined } | { failed: string }> {
  const slug = slugOf(setting)
  const source = setting.startsWith('custom:') ? await $.fs.read(`${home}/themes/${slug}.json`).then(got => (typeof got === 'string' ? got : ''), () => '') : null
  const text = liveText(slug, source)

  return text === undefined ? { failed: `Not changed: ${home}/themes/${slug}.json could not be read as a theme.` } : { text }
}

/** Rewrites the live files named with `text` (`liveFor`), each only where it says something else. Resolves why not, undefined once all say it. */
async function putLive($: EngineInterface, home: string, text: string, lives: readonly string[]): Promise<string | undefined> {
  const stamp = (await $.session.id().catch(() => '')).replace(/[^\w-]/g, '') || 'x'
  const disk = await diskOf($)
  for (const live of lives) {
    const failed = await writeLive(disk, `${home}/themes`, live, text, stamp).then(() => undefined, error => String(error))
    if (failed !== undefined) return `Not changed: ${home}/themes/${live}.json could not be written (${failed}).`
    liveSeen.delete(live) // read again at once, whatever its size and time say
  }

  return undefined
}

/**
 * What a theme change must know: the themes, the theme this session runs under and what set it
 * (`pinned`: its own `--settings`, since its start; `over`: a project's, a local or a managed file
 * that outranks the user's), the global one, and whether an organization holds it. `isHome` where
 * the project's file that sets it is the user's own (a session started in the home directory): that
 * is the global theme, set by the global settings, and nothing outranks them.
 */
async function themeFacts($: EngineInterface) {
  await quiet(sync($)) // what this terminal paints from, as of now and not of the last tick
  const known = await themesOf($)
  const { home, builtIns, customs } = known
  const row = String(known.row?.value ?? '')
  // `runs` is the setting this terminal paints from, `active` the theme that shows; `global` and `globalSource` the same of the user's file.
  const runs = (await read($, painted)) || paintedHere || row
  const active = await sourced($, runs, known)
  const global = await themeIn($, 'user')
  const globalSource = global === undefined ? undefined : await sourced($, global, known)
  const lives = known.lives.map(one => one.name.slice(0, -5))
  // Live here: this terminal paints from a live file that is there, so a rewrite of it shows at once. `own`: a file of its own.
  const liveHere = liveOf(runs)
  const isLiveHere = liveHere !== undefined && lives.includes(liveHere)
  const own = isLiveHere && liveHere !== LIVE ? liveHere : undefined
  // What outranks the user's file here, highest first (the types: 'user' | 'project' | 'local' | 'flag' | 'policy', lowest first).
  // A project's, a local or a managed file counts only where the session does run under its theme: that the engine takes `theme` from them is not probed.
  let held: { source: 'policy' | 'flag' | 'local' | 'project'; theme: string } | undefined
  let isHome = false
  for (const source of ['policy', 'flag', 'local', 'project'] as const) {
    const theme = await themeIn($, source)
    if (held !== undefined || theme === undefined || (source !== 'flag' && theme !== row)) continue
    if (source === 'project' && (await isUsersFile($, `${home}/settings.json`))) isHome = true
    else held = { source, theme }
  }
  // `pinned`: held by its start's `--settings` to a theme that is no live file (one that is can be rewritten: `own`).
  const pinned = held?.source === 'flag' && liveOf(held.theme) === undefined ? held.theme : undefined
  const over = held === undefined || held.source === 'flag' ? undefined : { theme: held.theme, where: OVER[held.source] }
  const isLocked = known.row?.isLocked === true || held?.source === 'policy'
  const session = await $.session.id().catch(() => '')
  // Left behind: the global setting moved on since this terminal's start, and it still paints its start's theme.
  const isBehind = pinned === undefined && over === undefined && own === undefined && global !== undefined && runs !== global

  return { runs, active, builtIns, customs, home, global, globalSource, lives, own, isLiveHere, isBehind, pinned, over, isHome, isLocked, session, path: `${home}/settings.json` }
}

type ThemeFacts = Awaited<ReturnType<typeof themeFacts>>

/**
 * Sets the theme every terminal follows: the "theme" key of the user's settings, and nothing else
 * of that file. Resolves why it was not changed, undefined once it is. Refused under a managed theme.
 */
async function setEverywhere($: EngineInterface, { isLocked, path }: ThemeFacts, setting: string): Promise<string | undefined> {
  if (isLocked) return 'Not changed: your organization sets the theme.'
  if (setting.startsWith('custom:')) {
    // The settings row takes a built-in name alone: a custom theme is written where /theme writes it, the user's settings file, its other keys as they are.
    // (No settings file yet is an empty one; one that is there and cannot be read is left alone.)
    const isThere = await $.fs.exists(path).then(found => found === true, () => true)
    const text = isThere ? await $.fs.read(path).then(got => (typeof got === 'string' ? got : null), () => null) : ''
    const next = text === null ? null : withTheme(text, setting)
    if (next === null) return `Not changed: ${path} could not be read as settings. Pick the theme with /theme.`
    const failed = await $.fs.write(path, next).then(() => undefined, error => String(error))
    if (failed !== undefined) return `Not changed: ${path} could not be written (${failed}). Pick the theme with /theme.`
  } else {
    const got = await $.config.set({ key: 'theme', value: setting }).catch(error => ({ deny: String(error) }))
    if (got.deny !== undefined) return `Not changed: ${got.deny}.`
  }
  // The engine reads the file again by itself; the pane follows as soon as it has.
  $.clock.after(1500, () => void quiet(sync($)))

  return undefined
}

/** The line that starts this conversation again in this terminal, with nothing pinned: it then follows the global theme. */
const plainLine = (session: string): string => `claude ${session === '' ? '--continue' : `--resume ${quoted(session)}`}`

/**
 * `/loadout <theme>`, and a press in the picker: the theme for every terminal. Rewrites every live
 * file (the shared one and each terminal's own), and where the global setting is not the live
 * theme yet, makes it so. `text` says what became of it and no more; `restart` is the line that
 * brings this terminal onto the live theme, where it is not on one.
 */
async function switchAll($: EngineInterface, setting: string, known?: ThemeFacts): Promise<{ text: string; restart?: string }> {
  const facts = known ?? (await themeFacts($))
  const name = slugOf(setting)
  if (facts.isLocked) return { text: 'Not changed: your organization sets the theme.' }
  if (setting === 'auto') {
    // No theme file can follow the terminal's light or dark ground: `auto` is the setting itself, read at a session's start.
    const failed = await setEverywhere($, facts, setting)

    return { text: failed ?? 'The theme setting is now auto. Nothing changed on screen: each terminal takes it at its next start.' }
  }
  // The theme is read before anything is written or set: one that cannot be read changes nothing.
  const made = await liveFor($, facts.home, setting)
  if (made.failed !== undefined) return { text: made.failed }
  const isFirst = facts.global !== `custom:${LIVE}`
  if (isFirst) {
    // The live file before the setting where there is none (nobody uses a file that is not there): no terminal starts on a theme without a file.
    const unmade = facts.lives.includes(LIVE) ? undefined : await putLive($, facts.home, made.text, [LIVE])
    const failed = unmade ?? (await setEverywhere($, facts, `custom:${LIVE}`))
    if (failed !== undefined) return { text: failed }
  }
  const failed = await putLive($, facts.home, made.text, [LIVE, ...facts.lives.filter(one => one !== LIVE)])
  if (failed !== undefined) return { text: failed }
  await quiet(sync($))
  if (facts.over !== undefined) return { text: `Loadout ${name} is now the global theme. This terminal stays on ${facts.over.theme}: ${facts.over.where} sets it.` }
  if (facts.pinned !== undefined) return { text: `Loadout ${name} set for the terminals that follow the global theme. This one stays on ${facts.pinned} (pinned at its start): /loadout follow releases it.` }
  if (facts.isLiveHere) return { text: `Loadout ${name}: every terminal.${isFirst ? ' One started on another theme shows it at its next start.' : ''}` }

  return {
    text: `Loadout ${name} is set, and nothing changed here yet: a running session keeps the theme it started with (${slugOf(facts.active) || 'unknown'}). This terminal, and any other not yet on a Loadout theme, shows it at its next start; from then on switching is instant.`,
    restart: plainLine(facts.session),
  }
}

/** The line that starts this conversation again in this terminal on `setting`, through the launcher where the plugin's copy has `bin/loadout` (it then has a live file of its own), else pinned by `--settings`. */
async function pinLine($: EngineInterface, setting: string, session: string): Promise<{ line: string; isLauncher: boolean }> {
  const file = `${$.plugin.root}/bin/loadout`
  const lines = pinLines(setting, session, file)
  // (The launcher is the mod's own file: a copy of the mod without it gets the plain line, which needs nothing.
  // And it takes only a name the settings spell in lower case, digits and dashes: any other theme gets the plain line.)
  const isLauncher = (await $.fs.exists(file).then(found => found === true, () => false)) && /^[a-z0-9-]+$/.test(slugOf(setting))

  return { line: isLauncher ? lines.short : lines.plain, isLauncher }
}

/**
 * `/loadout <theme> here`: this terminal alone. Live where it has a theme file of its own (the
 * launcher gave it one at its start): that file is rewritten. Anywhere else nothing changes, and
 * the answer is the line that starts it again with one.
 */
async function switchHere($: EngineInterface, setting: string, facts: ThemeFacts): Promise<string> {
  const name = slugOf(setting)
  if (facts.isLocked) return 'Not possible: your organization sets the theme.'
  if (facts.own !== undefined && setting !== 'auto') {
    const made = await liveFor($, facts.home, setting)
    const failed = made.failed ?? (await putLive($, facts.home, made.text, [facts.own]))
    if (failed !== undefined) return failed
    await quiet(sync($))

    return `Loadout ${name}: this terminal.`
  }
  if (facts.pinned === setting) return `Nothing to do: this terminal is already pinned to ${name}.`
  const { line, isLauncher } = await pinLine($, setting, facts.session)

  return handed($, line, isLauncher && setting !== 'auto'
    ? `Nothing changed yet: this terminal has no theme file of its own to rewrite. That line starts this conversation again here on ${name}, with one: from then on "/loadout <theme> here" is instant. The others keep theirs.`
    : `Nothing changed yet: a running session cannot change its own theme. That line starts this conversation again in this terminal, pinned to ${name}; the others keep theirs.`)
}

/** A theme asked for by name, everywhere or here, said in full: with the restart line on the clipboard where one is needed. */
async function switched($: EngineInterface, setting: string, scope: 'all' | 'here', facts: ThemeFacts): Promise<string> {
  if (scope === 'here') return switchHere($, setting, facts)
  const got = await switchAll($, setting, facts)

  return got.restart === undefined ? got.text : handed($, got.restart, got.text)
}

/** `/loadout follow`: the way back to the global theme, which only a start without the pin gives. */
async function followed($: EngineInterface, facts: ThemeFacts): Promise<string> {
  const { over, pinned, own, isLocked, isBehind, active, globalSource, session } = facts
  const global = globalSource === undefined ? 'not set' : slugOf(globalSource)
  if (over !== undefined) return isLocked ? 'Not possible: your organization sets the theme.' : `Nothing changed: this terminal's theme (${over.theme}) is set by ${over.where}. Remove the "theme" key there and it follows the global theme (${global}).`
  if (own !== undefined) return handed($, plainLine(session), `Nothing changed yet: this terminal has its own theme (${slugOf(active)}) since its start. That line starts this conversation again without it: it then follows the global theme (${global}).`)
  if (pinned !== undefined) return handed($, plainLine(session), `Nothing changed yet: this terminal is pinned to ${slugOf(pinned)} since its start. That line starts this conversation again without the pin: it then follows the global theme (${global}).`)

  return isBehind ? `Nothing to do: this terminal follows the global theme, and shows it (${global}) at its next start.` : `Nothing to do: this terminal already follows the global theme (${slugOf(active)}).`
}

/**
 * `/avatar theme`: the themes and this terminal's, then `/loadout`'s own answers under the older
 * words (a name as the setting spells it, and `all` or `here` said): a theme for every terminal, for
 * this one, or `follow`, the way back. Says what it did, and no more.
 */
async function themeCommand($: EngineInterface, words: readonly string[]): Promise<string> {
  const ask = askOf(words)
  const facts = await themeFacts($)
  const { active, builtIns, customs, home } = facts
  const themes = `Built-in: ${builtIns.join(', ')}.\nCustom: ${customs.join(', ') || 'none'} (${home}/themes).`
  const usage = 'Change it: /avatar theme <name> all (every terminal) · /avatar theme <name> here (this terminal) · /avatar theme follow (this terminal follows the global theme again).'

  if (ask.kind === 'list') return `Theme here: ${active || 'not read yet'} (${scopeOf(facts)}).\n${themes}\n${usage}`
  if (ask.kind === 'follow') return followed($, facts)
  if (ask.name === '' || ask.scope === undefined) return `Say which theme and where: /avatar theme ${ask.name || '<name>'} all, or /avatar theme ${ask.name || '<name>'} here.\n${themes}`
  const setting = settingOf(ask.name, builtIns, customs)
  if (setting === undefined) return `No theme "${ask.name}".\n${themes}`

  return switched($, setting, ask.scope, facts)
}

// --- the loadouts ------------------------------------------------------------------
//
// What the pane's picker offers: the custom themes (the files of `<config>/themes`, each with four of
// its own colours) and then the built-in ones. Read at the start and again when a file there changes.
let offers: readonly Offer[] = []
let offersPrint: string | undefined
/** The picker was asked for by `/loadout`: the next drawing of the pane says so where it has no room to unfold it. */
let isPickerAsked = false
const NO_ROOM = 'The Avatar pane is too short to list the themes here: make it taller, or type /loadout <theme>.'

/** Reads the themes on offer where their listing changed; resolves true when it did. Never throws. */
async function loadOffers($: EngineInterface): Promise<boolean> {
  const { home, files, builtIns } = await themesOf($)
  const print = `${builtIns.join(',')}|${files.map(one => `${one.name}:${one.size}:${one.mtimeMs}`).join('|')}`
  if (print === offersPrint) return false
  const customs: Offer[] = []
  for (const file of files.slice(0, 40)) customs.push(customOffer(file.name.slice(0, -5), await $.fs.read(`${home}/themes/${file.name}`).then(text => (typeof text === 'string' ? text : ''), () => '')))
  ;[offers, offersPrint] = [[...customs, ...builtIns.map(builtInOffer)], print]

  return true
}

/** Opens the Avatar pane; with `isPicker`, its Loadouts picker unfolded. */
async function openAvatar($: EngineInterface, isPicker = false): Promise<void> {
  if (isPicker) {
    await quiet(loadOffers($))
    await quiet(update($, isPicking, () => true))
    isPickerAsked = true
    $.ui.invalidate('ui.render') // an open pane whose picker was already asked for draws again, to say where it has no room
  }
  await $.ui.open(OPEN)
}

/** A row of the picker was pressed: that theme for every terminal, the picker folded, and a word of what became of it. */
async function pick($: EngineInterface, setting: string) {
  const told = await switchAll($, setting).catch(error => ({ text: `Not changed: ${String(error)}.`, restart: undefined }))
  await quiet(update($, isPicking, () => false))
  $.ui.toast(told.restart === undefined ? told.text : `${told.text} "/loadout ${slugOf(setting)}" gives the line that starts it again.`)
}

/** What `/avatar status` and `/loadout status` tell of this part. */
async function avatarStatus($: EngineInterface) {
  reelsTriedAt = -Infinity
  await quiet(findAssets($))
  await quiet(loadPacks($))
  const name = await read($, theme)
  const served = themed(name, packs)

  return {
    theme: name,
    by: served.pack === undefined ? 'the built-in table' : `pack ${served.pack.slug}`,
    told: `${served.family.key}${'skin' in served.family ? ` ${served.family.skin.variant}` : ''}, ${served.isLight ? 'light' : 'dark'}, background ${served.ground === undefined ? "the terminal's own" : hex(served.ground.terminal)}`,
    packs: packsAt === null ? 'none found (the built-in tables answer)' : `${packs.map(pack => pack.slug).join(', ') || 'none'} from ${packsAt}${packsSkipped.length === 0 ? '' : `; skipped: ${packsSkipped.join(', ')}`}`,
    pictures: assets ?? 'not found',
    // Each slot: found, with its character's name and how many loops, or missing.
    footage: SLOTS.map(slot => [slot, reels.get(slot)] as const).map(([slot, reel]) => (reel === undefined ? `${slot} missing` : `${slot} ${reel.name ?? `${CAST[slot]} [no name in its manifest]`} (${Object.keys(reel.clips).length} loops)`)).join(', '),
    style,
    isTinting,
  }
}

/**
 * `/avatar` and `/kirby`, whose words `/loadout` takes too (`cmd` is the command as typed, for the
 * usage lines): the status, the theme, the two switches, or the pane. `also` is the same in /loadout's words.
 */
async function avatarCommand($: EngineInterface, args: string, cmd = '/avatar'): Promise<{ text: string; also: string }> {
  const [word, value] = args.trim().toLowerCase().split(/\s+/)
  if (word === 'status') {
    const now = await avatarStatus($)

    return { also: '/loadout status', text: `Pictures: ${now.pictures}. Footage: ${now.footage}. Style: ${now.style}. Theme: ${now.theme || 'not read yet'}, by ${now.by} (${now.told}). Packs: ${now.packs}. Plugin folder: ${$.plugin.root}.` }
  }
  if (word === 'theme') return { also: '/loadout <theme> · /loadout <theme> here · /loadout follow', text: await themeCommand($, args.trim().toLowerCase().split(/\s+/).slice(1)) }
  if (word === 'background' && (value === 'on' || value === 'off')) {
    isTinting = value === 'on'
    failures = 0 // the person asks: tried again, whatever failed before
    await quiet($.store.set('background', isTinting))
    await quiet(tint($, await read($, theme)))

    return { also: '/loadout background on|off', text: isTinting ? 'The terminal background follows the theme.' : 'The terminal background is your own again.' }
  }
  if (word === 'background') return { also: '/loadout background on|off', text: `Usage: ${cmd} background on|off (now ${isTinting ? 'on' : 'off'}).` }
  if (word === 'style') {
    const asked = STYLES.find(one => one === value)
    if (asked === undefined) return { also: '/loadout style pixel|text|auto', text: `Usage: ${cmd} style pixel|text|auto (now ${style}).` }
    style = asked
    await quiet($.store.set('style', style))
    $.ui.invalidate('ui.render')

    return { also: '/loadout style pixel|text|auto', text: style === 'auto' ? 'The character is drawn in pixel art where the terminal draws pictures, in text characters elsewhere.' : style === 'pixel' ? 'The character is drawn in pixel art (in text characters where the terminal draws no pictures).' : 'The character is drawn in text characters.' }
  }
  await openAvatar($)

  return { also: '/loadout avatar (the pane) · /loadout (the theme picker)', text: 'Avatar pane opened.' }
}

/** `/avatar` and `/kirby`: thin names for the above, each answer ending with its /loadout form. */
async function onCommand($: EngineInterface, e: { args: string }) {
  const { text, also } = await avatarCommand($, e.args)

  return { text: `${text}\nAlso: ${also}.` }
}

// --- /loadout -------------------------------------------------------------------------

/** The restart line on the clipboard where there is one, and what to do with it: nothing of the session changed. */
async function handed($: EngineInterface, line: string, why: string): Promise<string> {
  const got = await $.ui.copy({ text: line }).catch(() => ({ isCopied: false }))

  return `${got.isCopied ? 'Copied. Press Ctrl+D, paste, Enter.' : 'Not copied: no clipboard here. Press Ctrl+D, then run the line below.'}\n${line}\n${why}`
}

/** What set this terminal's theme, in a few words. */
function scopeOf({ over, pinned, own, isBehind, globalSource, isHome }: ThemeFacts): string {
  const global = globalSource ?? 'not set'
  if (over !== undefined) return `set by ${over.where}`
  if (own !== undefined) return `this terminal's own theme; the global theme is ${global}`
  if (pinned !== undefined) return `pinned to this terminal at its start; the global theme is ${global}`
  if (isBehind) return `the theme this terminal started with; the global theme is now ${global}, shown at its next start`

  return isHome ? 'set by your global settings' : 'the global theme'
}

/** `/loadout status`: the three parts in four lines. */
async function loadoutStatus($: EngineInterface): Promise<string> {
  const now = await avatarStatus($)
  const facts = await themeFacts($)
  const up = await $.ui.panes().catch(() => [])
  const paneOf = (id: string) => (up.some(pane => pane.id === id && pane.isShown) ? 'open' : 'closed')

  return [
    `Theme: ${now.theme || 'not read yet'} (${scopeOf(facts)}${facts.isLiveHere ? `, live through ${liveOf(facts.runs)}.json` : ''}).`,
    `Pack: ${now.by} (${now.told}). Packs: ${now.packs}.`,
    `Pictures: ${now.pictures}. Footage: ${now.footage}.`,
    `Avatar pane: ${paneOf(PANE)}, style ${now.style}, background ${now.isTinting ? 'on' : 'off'}. Flow map: ${paneOf(FLOW_PANE.id)}. Frames: ${(await read($, framesOn)) ? 'on' : 'off'}.`,
  ].join('\n')
}

/** `/loadout`: every form of it (loadout.ts has the words). */
async function loadoutCommand($: EngineInterface, ask: LoadoutAsk): Promise<string> {
  if (ask.kind === 'help') return HELP
  if (ask.kind === 'status') return loadoutStatus($)
  if (ask.kind === 'pane' && ask.pane === 'flow') {
    // As /flow does: unfolded, at the width last asked for. (Not through /flow itself: a command's hook cannot run a command.)
    const seen = await update($, flowView, was => ({ ...FLOW_VIEW, ...was, hidden: false }))
    const opened = await $.ui.open({ ...FLOW_PANE, columns: seen.cols || FLOW_PANE.columns })

    return opened.isPlaced ? 'Flow map opened.' : `Flow map is open but not drawn yet: ${opened.reason}`
  }
  if (ask.kind === 'pane') return (await avatarCommand($, '')).text
  if (ask.kind === 'background' || ask.kind === 'style') return (await avatarCommand($, `${ask.kind} ${ask.value}`, '/loadout')).text
  if (ask.kind === 'frames') {
    if (ask.value !== 'on' && ask.value !== 'off') return `Usage: /loadout frames on|off (now ${(await read($, framesOn)) ? 'on' : 'off'}).`
    const isDrawn = await update($, framesOn, () => ask.value === 'on')
    await quiet($.store.set('isOn', isDrawn))

    return isDrawn ? 'Frames on: every conversation row is framed in the colour of its kind.' : 'Frames off: every row is drawn as Claude Code draws it.'
  }
  const facts = await themeFacts($)
  const { builtIns, customs, active } = facts
  if (ask.kind === 'pick') {
    await openAvatar($, true)

    return `Loadout: ${slugOf(active) || 'not read yet'} (${scopeOf(facts)}). Pick one in the Avatar pane, or by name.\nThemes: ${listed(customs, builtIns, active)}.\n${USAGE}`
  }
  if (ask.kind === 'follow') return followed($, facts)
  if (ask.name === '') return `Say which theme: /loadout <theme>${ask.scope === 'here' ? ' here' : ''}. Themes: ${listed(customs, builtIns, active)}.`
  const found = findTheme(ask.name, builtIns, customs)
  if ('among' in found) return found.among.length === 0 ? `No theme "${ask.name}". Themes: ${listed(customs, builtIns, active)}.` : `"${ask.name}" fits ${found.among.join(', ')}: say which.`

  return switched($, found.setting, ask.scope, facts)
}

// --- the events Loadout's parts share (hooks/part.ts): this part's work on each, kept from costing the others ---

const started: Part<'session.start'> = async ($, e, next) => {
  isAtTerminal = e.surface === 'terminal' && e.isInteractive
  isEnded = false
  failures = 0
  await seed($)
  await refresh($)
  await quiet(detect($))
  await quiet(loadPacks($))
  await quiet(sync($))
  await quiet(measure($))
  startTicking($)
  await $.command.register({ name: 'avatar', description: 'Open the Avatar pane (mascot, agents, usage meters)', argumentHint: '[status | theme … | background on|off | style pixel|text|auto]' })
  await $.command.register({ name: 'kirby', description: 'Same as /avatar' })
  await $.command.register({ name: 'loadout', description: 'Pick the theme (terminal, avatar, Flow map, frames); "/loadout help" lists the rest', argumentHint: '[<theme> [here] | follow | avatar | flow | frames on|off | background on|off | style pixel|text|auto | status | help]' })
  await quiet(findAssets($))
  await quiet(installColours($))
  await quiet(loadOffers($))
  // Unasked, the pane only seats on a wide terminal; /kirby seats it at any width.
  void $.ui.open(OPEN).catch(() => {})

  return next(e)
}

// What runs now: the main loop's calls fill the bubble, a subagent's move its
// mini and fill its legend line. A failed write never costs the call.
const called: Part<'tool.call'> = async ($, e, next) => {
  const call: KirbyHudCall = { id: e.tool_use_id, tool: String(e.tool), summary: summaryOf(e) } // a call's input is flat on the event
  await quiet(enter($, e.agentId, call))
  let isFailed = true // until the call answers: one that throws has failed
  try {
    const got = await next(e)
    isFailed = got.deny !== undefined || got.isError === true

    return got
  } finally {
    await quiet(exit($, e.agentId, call.id, isFailed))
  }
}

// A subagent started: its mini walks on stage, in the form of the model it runs on.
const spawned: Part<'agent.spawn'> = async ($, e, next) => {
  const got = await next(e)
  const id = got.agentId
  if (id !== undefined) {
    const known = { label: e.description, ...(got.model === undefined ? {} : { model: got.model }) }
    await quiet($.clock.now().then(at => update($, helpers, list => joined(list, id, at, known))))
  }

  return got
}

// turn.start is the main loop's alone: no call of an earlier turn still runs.
const turnStarted: Part<'turn.start'> = async ($, e, next) => {
  await update($, isWorking, () => true)
  await quiet(update($, calls, () => []))

  return next(e)
}

// A subagent's turn.complete has an agentId: its mini dances and leaves; one interrupted, refused or ended by an error faints.
const turnCompleted: Part<'turn.complete'> = async ($, e, next) => {
  if (e.agentId !== undefined) await leave($, e.agentId, e.reason !== 'answer')
  else {
    await update($, isWorking, () => false)
    await quiet(update($, calls, () => []))
    if (e.reason === 'answer') await cheer($)
  }

  return next(e)
}

export const register: Register = on => {
  // Each under `{}`, any input: an event takes a single hook without a matcher in a module, and the parts share these.
  on('session.start', {}, ($, e, next) => alone(e, under => next(under), under => started($, e, under)))

  // The terminal gets its own background back when the person leaves; a /clear or a resume goes on in the same terminal, under the same theme.
  on('session.end', async ($, e, next) => {
    if (e.reason !== 'clear' && e.reason !== 'resume') {
      isEnded = true // before the write: no tick that comes during it, or after, tints again
      await quiet(untint($))
    }

    return next(e)
  })

  on('command.run', { command: 'kirby' }, onCommand)
  on('command.run', { command: 'avatar' }, onCommand)

  on('command.run', { command: 'loadout' }, async ($, e) => ({ text: await loadoutCommand($, loadoutAsk(e.args)) }))

  // `/loadout` as it is typed: the themes and the command's words join the typeahead.
  on('prompt.autocomplete', {}, async ($, e, next) => {
    const { suggestions } = await next(e)
    if (!e.text.startsWith('/loadout')) return { suggestions }
    await quiet(loadOffers($))

    return { suggestions: [...suggestions, ...loadoutSuggestions(e.text, e.token, e.start, offers, await read($, theme))] }
  })

  // The person changes the theme in this session, with Claude Code's own /theme or the row in /config: this terminal then paints that theme.
  // (Only the person's own change: a plugin's `$.config.set`, this one's `auto` among them, writes the setting and repaints nothing, as a probe session showed.)
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const got = await next(e)
    if (got.deny === undefined && e.origin.kind !== 'plugin' && typeof e.value === 'string' && e.value !== '') await quiet(chose($, e.value))

    return got
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, old => toUsage(e, old?.startedAt))

    return next(e)
  })

  on('tool.call', {}, ($, e, next) => alone(e, under => next(under), under => called($, e, under)))

  on('agent.spawn', {}, ($, e, next) => alone(e, under => next(under), under => spawned($, e, under)))

  on('turn.start', {}, ($, e, next) => alone(e, under => next(under), under => turnStarted($, e, under)))

  on('turn.complete', {}, ($, e, next) => alone(e, under => next(under), under => turnCompleted($, e, under)))

  // The classic event says no more than that it ended: only an end no turn.complete told is taken for an answer.
  on('classic.SubagentStop', async ($, e, next) => {
    await leave($, e.agent_id)

    return next(e)
  })

  // The band: nothing while the pane shows, so the conversation reaches the
  // prompt; one line of meters otherwise, with a button that opens the pane.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    startTicking($)
    const isUp = (await $.ui.panes()).some(pane => pane.id === PANE && pane.isShown && pane.isPlaced)
    if (e.props.hasSurvey || isUp) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const u = await read($, usage)
    const five = u?.limits.find(l => l.kind === 'five_hour')
    const week = u?.limits.find(l => l.kind === 'seven_day')
    const part = (label: string, hue: string, percent: number | undefined, toneOf: typeof limitTone) => (
      <Text>
        <Text color={DIM}> · </Text>
        <Text color={hue}>{label} </Text>
        {percent === undefined
          ? <Text color={DIM}>n/a</Text>
          : <Text color={toneOf(percent)} bold>{Math.round(percent)}%</Text>}
      </Text>
    )

    return (
      <Box width={e.props.bodyColumns} justifyContent="flex-end">
        <Text wrap="truncate-end">
          <Text color={COST} bold>{money(u?.usd)}</Text>
          {part('5h', FIVE, five?.percentUsed, limitTone)}
          {part('wk', WEEK, week?.percentUsed, limitTone)}
          {part('ctx', CONTEXT, u?.percent, contextTone)}
          {(u?.percent ?? 0) >= CONTEXT_FULL && <Text color="error" bold> time to /clear</Text>}
          <Text> </Text>
        </Text>
        <Button key="open" label="kirby" onPress={() => $.ui.open(OPEN).then(() => {})} />
      </Box>
    )
  })

  // The pane: Kirby and the meters at the bottom of a narrow column beside
  // the transcript, on a background of its own where the theme brings one.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    isPaneUp = true
    startTicking($)
    const { Box, Button, Text } = $.ui.resolve(e)
    const table = e.surface === 'terminal' ? $.ui.resolve(e) : undefined
    if (canPicture === undefined) await quiet(detect($))
    const u = await read($, usage)
    const now = await $.clock.now()
    const width = e.props.bodyColumns
    const five = u?.limits.find(l => l.kind === 'five_hour')
    const week = u?.limits.find(l => l.kind === 'seven_day')
    const isFull = (u?.percent ?? 0) >= CONTEXT_FULL
    const working = await read($, isWorking)
    const call = last(await read($, calls))
    const alive = await read($, helpers)
    const wanted = await sessionLook($)
    const look = themed(await read($, theme), packs)
    const paneGround = look.ground?.pane
    const ground = paneGround ?? NONE
    const isLight = look.isLight
    const filled = paneGround === undefined ? {} : { width, backgroundColor: hex(paneGround) }
    const bodyRows = e.props.scroll.bodyRows
    // A pane of another size may be a terminal of another font: the cell is measured again.
    // A text family's character is a picture too, where the terminal draws them and the person has not asked for text.
    await quiet(findAssets($)) // a reload mid-session raises no session.start
    // The camera feed: the pictures of the slot the theme's world and the session's model name, where there are any.
    const slot = 'skin' in wanted.family ? slotOf(wanted.family.world, wanted.form) : undefined
    // (A pack may keep its family's drawn figure: `film` false.)
    const feed = slot !== undefined && hasPictures(slot) && look.pack?.film !== false ? slot : undefined
    // A world with cars is theirs wherever its feed does not play: they are drawn as any sprite family, never the mask.
    const cars = 'skin' in wanted.family && !(canPicture === true && table !== undefined && style !== 'text' && feed !== undefined) ? wanted.family.cars : undefined
    const session = cars === undefined ? wanted : { family: cars, form: wanted.form }
    const hero = 'skin' in session.family && session.form === 'opus' ? session.family.hero : undefined
    const isArt = canPicture === true && table !== undefined && ('skin' in session.family ? style !== 'text' && (hero !== undefined || feed !== undefined) : true)
    if (isArt && shape !== `${width}x${bodyRows}`) {
      shape = `${width}x${bodyRows}`
      void measure($).then(isNew => isNew && $.ui.invalidate('ui.render')).catch(() => {})
    }
    const { family, form } = session
    /** What a pane of `rows` rows draws: pure, so the picker asks it what it would leave the mascot. */
    const laid = (rows: number): Layout => ('skin' in family ? laidOutText({ skin: family.skin, form }, alive.length, width, rows, table !== undefined, hero === undefined && !(isArt && feed !== undefined) ? undefined
      : { ...(hero === undefined ? {} : { who: hero.who }), ...(isArt ? { cell: cell ?? ASSUMED, ...(feed === undefined ? {} : { feed }) } : {}) })
      : canPicture === true && table !== undefined ? laidOutArt({ family, form }, alive.length, width, rows, cell ?? ASSUMED)
      : laidOut({ family, form }, alive.length, width, rows, table !== undefined))
    // The Loadouts picker heads the pane: one line folded, a row per theme open. It opens only where
    // the mascot still has its rows under it (and is not dropped for it): on a shorter pane it stays folded.
    const room = bodyRows - (isFull ? 1 : 0)
    const openRows = pickerRows(offers.length, 'skin' in family)
    // Folded, its line gives way where it would cost the pane its mascot: the avatar is drawn as without the picker.
    const foldRows = laid(room).size.rows > 0 && laid(room - 1).size.rows === 0 ? 0 : 1
    const holds = (rows: number) => {
      const left = laid(rows)

      return rows >= ('text' in left ? HUD_ROWS : CHROME_ROWS) + left.size.rows && (left.size.rows > 0 || laid(room - foldRows).size.rows === 0)
    }
    const canOpen = offers.length > 0 && holds(room - openRows)
    const isPickerOpen = (await read($, isPicking)) && canOpen
    const headRows = isPickerOpen ? openRows : foldRows
    // `/loadout` asked for the picker and this pane cannot unfold it: said once, not left to look like a dead command.
    if (isPickerAsked && !canOpen) $.ui.toast(NO_ROOM)
    isPickerAsked = false
    const rows = room - headRows
    const drawn = laid(rows)
    // The name is the name of what is drawn: on a pane too small for the model's form, the plain one's.
    // (A character has its own name and voice, where it is the one drawn.)
    const voice = 'text' in drawn && drawn.hero !== undefined ? hero : undefined
    // (And the one on the camera feed is who its manifest says, speaking its manifest's lines where it has any.)
    const onAir = 'text' in drawn ? drawn.feed : undefined
    const playing = onAir !== undefined ? reels.get(onAir) : undefined
    // (A manifest with no usable name plays under the slot's own character's, never the mask's.)
    const name = 'look' in drawn ? nameOf(drawn.look) : (playing !== undefined && onAir !== undefined ? playing.name ?? CAST[onAir] : undefined) ?? voice?.name ?? nameOf(session)
    const happy = await read($, happyUntil)
    const petted = await read($, pets)
    const keys = new Set<string>()
    const size = drawn.size
    const mood = moodOf(u, working, now < happy)
    /** A picture's element, mounted under `key` for the frames to swap: an Image in true pixels, a Raster in cell blocks. */
    const pictured = (key: string, box: { columns: number; rows: number }, picture: Picture, alt: string) => {
      if (table === undefined) return null
      sent.set(key, printOf(picture))
      refused.delete(key)
      keys.add(key)

      return 'cells' in picture
        ? <table.Raster key={key} columns={box.columns} rows={box.rows} cells={picture.cells} />
        : <table.Image key={key} columns={box.columns} rows={box.rows} source={picture.source} alt={alt} />
    }

    // The bubble: always four rows, so Kirby never moves when what it says changes. Its border is the
    // prompt's; a worry turns it the warning's colour, a context to clear the error's.
    const bubbleColumns = Math.max(8, width - 1)
    const inner = bubbleColumns - 4
    const [speech, hue] = (voice ?? session.family).speech[working ? 'working' : mood]
    const title = call === undefined ? '' : call.tool.replace(/^mcp__/, '').slice(0, inner - 2)
    const said = wrapped(call?.summary ?? (mood === 'worried' && !working ? worryOf(u) ?? '' : speech), inner, 2)
    const isWorried = mood === 'worried' && !working && call === undefined
    const border = isWorried ? (isFull ? 'error' : 'warning') : 'promptBorder'
    const row = (line: string | undefined) => (
      <Box>
        <Text color={border}>│ </Text>
        <Box width={inner}>
          <Text color={call !== undefined ? 'text' : isWorried ? border : hue} bold={call === undefined} wrap="truncate-end">{line || ' '}</Text>
        </Box>
        <Text color={border}> │</Text>
      </Box>
    )
    const tailAt = Math.floor((bubbleColumns - 3) / 2)
    const bubble = (
      <Box flexDirection="column" width={bubbleColumns}>
        <Text wrap="truncate-end">
          <Text color={border}>{title === '' ? '╭' : '╭─ '}</Text>
          <Text color="suggestion" bold>{title}</Text>
          <Text color={border}>{title === '' ? '─'.repeat(bubbleColumns - 2) : ` ${'─'.repeat(Math.max(0, bubbleColumns - 5 - title.length))}`}╮</Text>
        </Text>
        {row(said[0])}
        {row(said[1])}
        <Text color={border}>╰{'─'.repeat(tailAt)}▼{'─'.repeat(bubbleColumns - 3 - tailAt)}╯</Text>
      </Box>
    )

    // Over the stage, a line per agent, its dot in its mini's colour; the last line counts those it has no room for.
    // A full dot for an agent with a mini on stage, a hollow one for an agent waiting in the queue.
    const named = alive.slice(0, alive.length > Math.min(drawn.lines, LEGEND_MAX) ? Math.max(0, drawn.lines - 1) : drawn.lines)
    const staged = drawn.art?.stage ? stagedArt(alive, now, drawn.art.stage.width) : drawn.stage ? stagedOf(alive, now, drawn.stage.columns) : alive
    const legend = (one: KirbyHudHelper) => {
      const doing = last(one.calls)
      // Between calls, its last one to end a failure: its mini sits dazed, and its line says why.
      const isShaken = one.hurtAt !== undefined && (one.hitAt ?? -Infinity) < one.hurtAt

      return (
        <Text color="text" wrap="truncate-end">
          {/* (On a HUD skin the dot is the skin's light blue: a mini's own colour is not one of the skin's.) */}
          <Text color={'skin' in family ? hex(family.skin.cyan) : colorOf(one.slot, isLight)}>{one.doneAt !== undefined || staged.includes(one) ? '● ' : '○ '}</Text>
          {one.label !== '' && `${one.label.length > 16 ? `${one.label.slice(0, 15)}…` : one.label} `}
          {one.doneAt !== undefined ? <Text color={one.isLost === true ? 'error' : 'success'} bold>{one.isLost === true ? 'stopped ✘' : 'done ✔'}</Text>
            : doing !== undefined ? <Text color="suggestion" bold>{doing.tool.replace(/^mcp__/, '')}</Text>
            : isShaken ? <Text color="warning">a call failed…</Text>
            : <Text color={DIM}>thinking…</Text>}
          {one.doneAt === undefined && doing !== undefined && <Text color={DIM}>{` ${doing.summary}`}</Text>}
        </Text>
      )
    }
    const bar = Math.max(4, width - 13) // the inset's cell, and two spare: the dock clips its last column

    const meter = (label: string, hue: string, percent: number | undefined, toneOf: typeof limitTone, detail: string) => (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text color={hue} bold>{label.padEnd(5)}</Text>
          {percent !== undefined && <Text color={toneOf(percent)}>{'█'.repeat(Math.round((Math.min(100, percent) / 100) * bar))}</Text>}
          {percent !== undefined && <Text color={TRACK}>{'░'.repeat(bar - Math.round((Math.min(100, percent) / 100) * bar))}</Text>}
          {percent !== undefined && <Text color={toneOf(percent)} bold>{`${Math.round(percent)}%`.padStart(5)}</Text>}
        </Text>
        <Text color={DIM} wrap="truncate-end">{'     '}{detail}</Text>
      </Box>
    )
    const reset = (l: KirbyHudLimit | undefined) => (l ? countdown(l.resetsAt, now) : 'unavailable')

    const pet = async () => {
      const count = await update($, pets, n => n + 1)
      await cheer($)
      await $.store.set('pets', count)
    }

    // The banner tells the turn before the worry: at work it is the working line, whatever the meters say (they say it themselves).
    const told: Mood = working ? 'working' : mood
    // What the call that runs is, as a HUD tells it: the Halo figures act it out.
    const act = call === undefined ? undefined : toolAct(call.tool)
    const doing = act === undefined || act === 'exit' ? undefined : STATES[act]
    const limit = (label: string, l: KirbyHudLimit | undefined) => ({ label, percent: l?.percentUsed, isAlert: (l?.percentUsed ?? 0) >= LIMIT_NEAR, detail: reset(l) })
    const tree = 'skin' in family ? (isHalo(family.skin) ? haloTree : hudTree)($.ui.resolve(e), {
      skin: family.skin,
      ...(family.captions === undefined ? {} : { captions: family.captions }),
      ...(paneGround === undefined ? {} : { ground: { color: hex(paneGround), columns: width } }),
      columns: bubbleColumns,
      height: bodyRows - headRows,
      session: await $.session.id().catch(() => ''),
      model: await read($, model),
      minutes: u?.startedAt === undefined ? undefined : Math.max(0, Math.floor((now - u.startedAt) / 60_000)),
      name,
      mood: told,
      title: call === undefined ? told : call.tool.replace(/^mcp__/, ''),
      said: (call?.summary ?? playing?.speech?.[told] ?? (told === 'worried' ? worryOf(u, (voice ?? family).worry) ?? '' : speech)).trim(),
      isCall: call !== undefined,
      // The blocks where a Raster draws; elsewhere the agents are lines of legend.
      agents: drawn.stage !== null ? pictured('stage', drawn.stage, stagePicture(drawn, alive, now, ground, isLight), 'the agents at work')
        : table === undefined && alive.length > 0 ? <Box flexDirection="column">{alive.slice(0, LEGEND_MAX).map(legend)}</Box> : null,
      alive: alive.length,
      mask: size.rows > 0 ? pictured('kirby', size, mascotPicture(drawn, mood, now, ground, call !== undefined, happy, false, doing), name) : null,
      petted,
      onPet: pet,
      cost: money(u?.usd),
      meters: [
        limit('5h limit', five),
        limit('week limit', week),
        { label: 'context', percent: u?.percent, isAlert: isFull, detail: u?.tokens === undefined ? 'pending' : `${tokens(u.tokens)} / ${tokens(u.window)}` },
      ],
      isFull,
    }) : (
      <Box flexDirection="column" height={bodyRows - headRows} justifyContent="flex-end" {...filled}>
        <Box flexDirection="column" alignItems="center" width={width}>
          <Box flexDirection="column" width={Math.max(8, width - 1)}>
            {named.map(legend)}
            {alive.length > named.length && drawn.lines > 0 && <Text color={DIM}>+{alive.length - named.length} more</Text>}
          </Box>
          {drawn.stage !== null && pictured('stage', drawn.stage, stagePicture(drawn, alive, now, ground, isLight), 'the agents at work')}
          {bubble}
          {width >= size.columns && pictured('kirby', size, mascotPicture(drawn, mood, now, ground, false, 0, isLight), name)}
          <Text color="claude">{name}</Text>
          <Box gap={1}>
            <Button key="pet" label="pet" hotkey="p" variant="primary" onPress={pet} />
            <Text color={CONTEXT}>♥ {petted}</Text>
          </Box>
        </Box>
        <Text> </Text>
        {/* The meters, a cell in from the pane's edge: its ground frames them. */}
        <Box flexDirection="column" paddingLeft={1}>
          <Text wrap="truncate-end">
            <Text color={COST} bold>{'cost'.padEnd(5)}{money(u?.usd)}</Text>
            <Text color={DIM}> session</Text>
          </Text>
          {meter('5h', FIVE, five?.percentUsed, limitTone, reset(five))}
          {meter('week', WEEK, week?.percentUsed, limitTone, reset(week))}
          {meter('ctx', CONTEXT, u?.percent, contextTone, u?.tokens === undefined ? 'pending' : `${tokens(u.tokens)} / ${tokens(u.window)}`)}
          {isFull && <Text color="error" bold inverse> time to /clear </Text>}
        </Box>
      </Box>
    )
    const head = headRows === 0 ? null : pickerTree($.ui.resolve(e), {
      offers, active: await read($, theme), isOpen: isPickerOpen, columns: bubbleColumns,
      ...('skin' in family ? { skin: family.skin } : {}),
      onPick: setting => pick($, setting),
      // The button always answers: it folds an open picker, unfolds it where there is room, and says so where there is none.
      onToggle: async () => {
        await update($, isPicking, () => !isPickerOpen && canOpen)
        if (!isPickerOpen && !canOpen) $.ui.toast(NO_ROOM)
      },
    })
    // What the frames repaint is published last, with nothing awaited after it: a frame never sees
    // pictures the tree handed back does not hold. (Only a terminal mounts pictures: elsewhere there is nothing to repaint.)
    shown = table === undefined ? null : { layout: drawn, ground, isLight, usage: u, isWorking: working, isBusy: call !== undefined, doing, happyUntil: happy, crew: alive, keys }

    return <Box flexDirection="column" height={bodyRows} {...filled}>{head}{tree}</Box>
  })
}
