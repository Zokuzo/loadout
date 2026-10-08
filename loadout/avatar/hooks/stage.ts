// The stage: every running subagent as a mini mascot, playing out what the agents really do.
// Pure: a scene is derived from (frame, now, agents) alone, so previews and tests draw what the pane draws.
import { formOf } from './look'
import type { Family, Pixels } from './look'
import { BODY_ROWS, CYAN, DUST, FX, GOLD, GRASS, HAND_ROW, MINI_WIDTH, PENCIL, REACH, SKY_SPARK, SKY_STAR, SOIL, SOIL_LIT, STEEL, STREAK, WHITE, byDay, headOf, miniOf, pixelsByDay } from './minis'
import type { Mini, Pose } from './minis'

export const TICK_MS = 400
export const STAGE_ROWS = 13 // a mini, the hat of its agent's model on its head, and the sky over it
const HEIGHT = STAGE_ROWS * 2
const GROUND = HEIGHT - 2 // the ground strip's first pixel row: the minis stand on it
/** The first pixel row the minis and their effects may use: the rows above are the sky's, with the enemy, the queue and the scenery. */
export const SKY = 8
const PAD = 1 // columns kept clear at each end of the stage
const ZONE_MIN = 10 // a mini's own columns at the least: its body, its hand's column and a clear one
const ROOMY = 4 // columns from its hand on that let a mini strike and run ahead
const HURT_TICKS = 4
const DANCE_TICKS = 9 // about three and a half seconds
const EXIT_TICKS = 8
const RIDE_TICKS = 2 // of its exit, the ticks a mini is still on stage, riding up: then its zone closes
const ENTER_TICKS = 4
const RESPAWN_TICKS = 11 // after a pop, until the next enemy flies in: it hovers before the agent that popped it is forgotten
const FLY_IN = 3 // ticks an enemy takes to fly in, three pixels each
const FLYER_ROOM = 12 // the columns at the sky's right end the enemy hovers in
const ON_STAGE_MAX = 4
const OPENING = [0.3, 0.6, 0.85] // how much of its zone a mini dropping in has, tick by tick

/** How long a failed call knocks a mini over, and how long a finished agent dances. */
export const HURT_MS = HURT_TICKS * TICK_MS
export const DANCE_MS = DANCE_TICKS * TICK_MS

/** How long a finished agent stays: its dance, then its ride off. */
export const LEAVE_MS = (DANCE_TICKS + EXIT_TICKS) * TICK_MS

/** The narrowest stage: one mini. */
export const NARROWEST = ZONE_MIN + 2 * PAD

/**
 * What the scene needs of a subagent: times are the clock's, absent for "never" (or, for `joinedAt`,
 * "long ago"). `isLost` says its end, at `doneAt`, was no answer: it was stopped, or failed.
 */
export type Agent = {
  slot: number
  calls: readonly { tool: string }[]
  joinedAt?: number
  hurtAt?: number
  hitAt?: number
  doneAt?: number
  isLost?: boolean
  /** When what it does last changed (a call began, or its newest ended), and the tool it ran until then, absent for none. */
  turnedAt?: number
  wasTool?: string
  /** What it runs on, where that was told: its mini wears that model's form. */
  model?: string
}

export type Kind = 'shell' | 'read' | 'edit' | 'web' | 'agent' | 'skill' | 'ask' | 'mcp' | 'other'

const TOOLS: Readonly<Record<string, Kind>> = {
  Bash: 'shell', PowerShell: 'shell', Monitor: 'shell', BashOutput: 'shell', KillShell: 'shell',
  Read: 'read', Glob: 'read', Grep: 'read', LS: 'read', NotebookRead: 'read', ToolSearch: 'read',
  ListMcpResourcesTool: 'read', ReadMcpResourceTool: 'read', ReadMcpResourceDirTool: 'read',
  Edit: 'edit', MultiEdit: 'edit', Write: 'edit', NotebookEdit: 'edit',
  WebFetch: 'web', WebSearch: 'web',
  Agent: 'agent', Workflow: 'agent', SendMessage: 'agent', ListAgents: 'agent',
  Skill: 'skill',
  AskUserQuestion: 'ask',
}

export function kindOf(tool: string): Kind {
  if (tool.startsWith('mcp__')) return /chrome|browser|playwright/i.test(tool.split('__')[1] ?? '') ? 'web' : 'mcp'
  if (tool.startsWith('Task')) return 'agent'

  return (Object.hasOwn(TOOLS, tool) ? TOOLS[tool] : undefined) ?? 'other'
}

/**
 * What a mini is doing: one act per kind of running tool; between calls `idle`, or `dazed`
 * while its last call to end was a failure; then how a call fails and how the agent ends:
 * a `dance` for an answer, a `faint` for none, and the `exit`.
 */
export type Act = 'idle' | 'dazed' | 'inhale' | 'sword' | 'dash' | 'ride' | 'call' | 'sparkle' | 'ask' | 'hop' | 'hurt' | 'dance' | 'faint' | 'exit'

const ACTS: Record<Kind, Act> = {
  read: 'inhale', edit: 'sword', shell: 'dash', web: 'ride', agent: 'call', skill: 'sparkle', ask: 'ask', mcp: 'hop', other: 'hop',
}

/** The act a running call of `tool` is played as. */
export const toolAct = (tool: string): Act => ACTS[kindOf(tool)]

/** Whole ticks since `at`: Infinity for never, negative for not yet. */
const ticksSince = (at: number | undefined, now: number) => (at === undefined ? Infinity : Math.floor((now - at) / TICK_MS))
/** The same, for what has happened: Infinity while it has not. */
const ticksAfter = (at: number | undefined, now: number) => (at === undefined || at > now ? Infinity : ticksSince(at, now))

/** A failed call no later success has made up for. */
const isShaken = (agent: Agent) => agent.hurtAt !== undefined && (agent.hitAt ?? -Infinity) < agent.hurtAt

export function actOf(agent: Agent, now: number): Act {
  const done = ticksAfter(agent.doneAt, now)
  if (done < DANCE_TICKS) return agent.isLost === true ? 'faint' : 'dance'
  if (done !== Infinity) return 'exit'
  if (ticksAfter(agent.hurtAt, now) < HURT_TICKS) return 'hurt'
  const call = agent.calls[agent.calls.length - 1]
  if (call !== undefined) return ACTS[kindOf(call.tool)]

  return isShaken(agent) ? 'dazed' : 'idle'
}

/** How many of `alive` agents get a mini on a stage `columns` wide. */
export const capOf = (columns: number, alive: number): number =>
  Math.min(alive, Math.max(1, Math.min(ON_STAGE_MAX, Math.floor((columns - 2 * PAD) / ZONE_MIN))))

type Span = readonly [from: number, to: number]

/** An agent with a mini: its columns, the ticks since it got them, and how far into its ride off it is (-1 before). */
type Role = { agent: Agent; zone: Span; since: number; leaving: number }

/**
 * Who is on stage at `now`, and who waits. The first agents get a zone each, side by side; a
 * zone opens as its mini drops in and closes as it flies off, the others' moving over a little
 * each tick, so nothing ever jumps however the comings and goings overlap. The place of an
 * agent that starts its ride off goes at once to the first in the queue.
 */
function castOf(agents: readonly Agent[], now: number, columns: number): { roles: Role[]; queued: Agent[] } {
  const room = capOf(columns, Infinity)
  const exits: number[] = [] // when each earlier agent started its ride off
  const cast: (Omit<Role, 'zone'> & { weight: number })[] = []
  const queued: Agent[] = []
  agents.filter(a => (a.joinedAt ?? -Infinity) <= now).forEach((agent, i) => {
    const out = agent.doneAt === undefined ? Infinity : agent.doneAt + DANCE_TICKS * TICK_MS
    const gone = exits.filter(at => at <= Math.min(now, out)).sort((a, b) => a - b)
    const leaving = out <= now ? ticksSince(out, now) : -1
    if (i - gone.length >= room) {
      if (leaving < 0) queued.push(agent)
    } else if (leaving < EXIT_TICKS) {
      const since = ticksSince(Math.max(agent.joinedAt ?? -Infinity, i < room ? -Infinity : gone[i - room]!), now)
      cast.push({ agent, since, leaving, weight: leaving >= RIDE_TICKS ? 1 - (leaving - RIDE_TICKS + 1) / (EXIT_TICKS - RIDE_TICKS) : OPENING[since] ?? 1 })
    }
    if (out <= now) exits.push(out)
  })
  const zone = (columns - 2 * PAD) / Math.max(1, cast.reduce((sum, one) => sum + one.weight, 0))
  let before = 0
  const roles = cast.map(({ weight, ...role }) => {
    const from = PAD + Math.round(zone * before)
    before += weight

    return { ...role, zone: [from, PAD + Math.round(zone * before)] as const }
  })

  return { roles, queued }
}

/** The agents with a mini on a stage `columns` wide, flying off ones aside: the others wait in the queue. */
export const stagedOf = (agents: readonly Agent[], now: number, columns: number): readonly Agent[] =>
  castOf(agents, now, columns).roles.filter(role => role.leaving < 0).map(role => role.agent)

type Canvas = (number | null)[][]

/** Draws `px` at (x, y), mirrored when `flip`, inside the columns of `span`: never outside the canvas. */
function put(canvas: Canvas, px: Pixels, x: number, y: number, flip = false, [from, to]: Span = [0, canvas[0]!.length]) {
  px.forEach((row, dy) => row.forEach((color, dx) => {
    const line = canvas[y + dy]
    const at = x + (flip ? row.length - 1 - dx : dx)
    if (line && color !== null && at >= Math.max(0, from) && at < Math.min(line.length, to)) line[at] = color
  }))
}

const WALK: readonly Pose[] = ['walk1', 'walk2']

/** A thinking mini's pacing: `step` pixels from home, which way it looks, and where in a pause it is (-1 while walking). */
function pacing(frame: number, reach: number, isMirrored: boolean) {
  const u = frame % (4 * reach + 8)
  const [step, dir, pause] =
    u < reach ? [u + 1, 1, -1]
    : u < reach + 4 ? [reach, 1, u - reach]
    : u < 3 * reach + 4 ? [2 * reach + 3 - u, -1, -1]
    : u < 3 * reach + 8 ? [-reach, -1, u - 3 * reach - 4]
    : [u - 4 * reach - 7, 1, -1]

  return isMirrored ? { step: -step, dir: -dir, pause } : { step, dir, pause }
}

type Move = readonly [pose: Pose, right: number, up: number, isFlipped: boolean]

// The dance: three steps side to side, a spin, a jump, and the cheer, twice.
const DANCE: readonly Move[] = [
  ['walk1', -2, 0, true], ['walk2', 2, 0, false], ['walk1', -2, 0, true], ['half', 0, 0, false], ['thin', 0, 0, false],
  ['half', 0, 0, true], ['jump', 0, 3, false], ['cheer', 0, 0, false], ['cheer2', 0, 1, false],
]
// A hurt tumble: knocked up, over, down, and sat in a heap.
const HURT: readonly Move[] = [['hurt', 0, 2, false], ['hurt', 0, 3, true], ['hurt', 0, 1, false], ['dazed', 0, 0, false]]
const SPIN: readonly (readonly [Pose, boolean])[] = [['stand', false], ['half', false], ['thin', false], ['half', true]]

/** What a mini is drawn as: its act; `arrive` while it drops in (`age` is the step of the drop); `walk` while its zone moves (`age` is the way: right when positive, left when negative). */
type Part = Act | 'arrive' | 'walk'

/** One mini on the canvas, in the columns of its zone: its body and what its act adds, the effects in the day's colours on a light theme. */
function drawMini(canvas: Canvas, family: Family, agent: Agent, part: Part, frame: number, age: number, [lo, end]: Span, isLight: boolean) {
  const form = formOf(agent.model ?? '')
  const mini: Mini = miniOf(family, agent.slot, form, isLight)
  const width = MINI_WIDTH[family]
  // The zone's last column stays clear, so nothing of one mini ever touches the next: but for one dropping in, the last in line.
  const span: Span = [lo, part === 'arrive' ? end : end - 1]
  const hi = Math.max(lo, span[1] - width)
  const home = lo + ((hi - lo) >> 1)
  const middle = lo + ((span[1] - lo) >> 1)
  const back = Math.max(lo, home - 3) // where it stands to strike or run: back a little, to leave room ahead
  const free = span[1] - back - REACH // the columns ahead of it there, from its hand's on
  const isRoomy = free >= ROOMY
  const top = GROUND - mini.stand.length // of its hat, where it wears one: what floats over its head starts from here
  const brow = GROUND - BODY_ROWS[family] // of its body: its hand and its mouth are counted from here
  const f = frame + agent.slot * 5 // neighbours are out of step

  const body = (pose: Pose, x: number, up = 0, flip = false) => {
    const at = Math.max(lo, Math.min(hi, x))
    put(canvas, mini[pose], at, Math.max(SKY, GROUND - mini[pose].length - up), flip, span)

    return at
  }
  const add = (px: Pixels, x: number, y: number) => put(canvas, pixelsByDay(px, isLight), x, Math.max(SKY, y), false, span)
  const dot = (x: number, y: number, color: number) => y < GROUND && put(canvas, [[byDay(color, isLight)]], x, Math.max(SKY, y), false, span)
  /** Over the head of a mini stood at `x`, a row clear of it. */
  const above = (px: Pixels, x: number) => add(px, x + ((width - px[0]!.length) >> 1), top - 1 - px.length)
  /** Stood at `x` on a warp star, `up` pixels off the ground: the star hides its feet. */
  const riding = (x: number, up: number) => {
    const y = GROUND - up - FX.warp.length - 5
    const at = body('stand', x, GROUND - y - BODY_ROWS[family])
    add(FX.warp, Math.max(lo, Math.min(span[1] - FX.warp[0]!.length, at + ((width - FX.warp[0]!.length) >> 1))), y + 5)

    return at
  }
  /** Stars circle its head: one to each side, then one before it while the other is behind. */
  const seeingStars = (x: number) => {
    const [first, second] = [FX.dizzy[(f >> 1) % 2]!, FX.dizzy[1 - ((f >> 1) % 2)]!]
    if (f % 2 === 0) {
      add(first, x, top - 3)
      add(second, x + width - 3, top - 3)
    } else add(first, x + ((width - 3) >> 1), top - 4)
  }

  if (part === 'arrive') {
    // In with a twinkle, then down from where it shone.
    if (age === 0) add(FX.twinkle, middle - 1, SKY + 1)
    else if (age === 1) add(FX.star[1], middle - 2, SKY)
    else if (age === 2) body('jump', home, 4)
    else body('duck', home)
  } else if (part === 'walk') {
    body(WALK[f % WALK.length]!, back, 0, age < 0)
  } else if (part === 'idle') {
    const { step, dir, pause } = pacing(f, Math.min(3, home - lo, hi - home), agent.slot % 2 === 1)
    const pose = pause < 0 ? WALK[f % WALK.length]! : pause === 1 ? 'jump' : pause === 3 ? 'blink' : 'stand'
    body(pose, home + step, pause === 1 ? 2 : 0, dir < 0)
  } else if (part === 'dazed') {
    seeingStars(body('dazed', home))
  } else if (part === 'faint') {
    // Out for the count: on its back, feet up.
    seeingStars(body('hurt', home))
  } else if (part === 'inhale') {
    const x = body(f % 2 === 0 ? 'gulp1' : 'gulp2', back)
    const [from, mouth] = [x + REACH, brow + 3]
    if (isRoomy) {
      // A cone of wind closing on the mouth, and a star drawn in along it.
      for (let d = 0; d < Math.min(free, 6); d++) {
        if ((d + f) % 3 === 0) continue
        dot(from + d, mouth - 1 - (d >> 1), STREAK)
        dot(from + d, mouth + 2 + (d >> 1), STREAK)
      }
      const far = [4, 2, 0][f % 3]!
      if (far === 0) dot(from, mouth + (family === 'kirby' ? 0 : 1), GOLD)
      else add(FX.twinkle, from + far - 1, mouth - 1)
    } else {
      // No room for the wind: a crumb goes in.
      dot(from, mouth + 1 + (f % 2), f % 2 === 0 ? GOLD : STREAK)
    }
  } else if (part === 'sword') {
    // A chop: the blade up, through an arc, then struck out ahead; with no room ahead, straight down.
    // Fire Kirby's is a tongue of flame, yellow at his mouth and red at its tip; Beam Kirby's a whip of gold and white beads;
    // plain Kirby has no sword (that is Sword Kirby's): his is a pencil, eraser in hand, and what flies off it is what he writes.
    const [hilt, steel, tip, arc] = family !== 'kirby' || form === 'sonnet' ? [GOLD, STEEL, WHITE, CYAN] : form === 'fable' ? [0xf8f040, 0xf8a800, 0xe82000, 0xf8a800] : form === 'haiku' ? [WHITE, GOLD, WHITE, GOLD] : [PENCIL[0], PENCIL[1], PENCIL[2], STREAK]
    const beat = f % 3
    const x = body(beat === 1 ? 'jump' : 'stand', back, beat === 1 ? 1 : 0)
    const hand = x + REACH
    const y = brow + HAND_ROW[family] - (beat === 1 ? 1 : 0)
    const blade = (dx: number, dy: number, length = 3) => {
      dot(hand, y, hilt)
      for (let k = 1; k < length; k++) dot(hand + dx * k, y + dy * k, form === 'haiku' && family === 'kirby' && k % 2 === 0 ? WHITE : steel)
      dot(hand + dx * length, y + dy * length, tip)
    }
    if (beat === 0) blade(0, -1)
    else if (beat === 1 && isRoomy) {
      blade(1, -1)
      for (const [dx, dy] of [[0, -3], [1, -4], [2, -4]] as const) dot(hand + dx, y + dy, arc)
    } else if (beat === 1) blade(0, -1)
    else if (isRoomy) {
      blade(1, 0, Math.min(4, free - 1))
      for (const [dx, dy] of [[1, -3], [2, -2]] as const) dot(hand + dx, y + dy, arc)
    } else {
      blade(0, 1)
      for (const dy of [-2, -3]) dot(hand, y + dy, arc)
    }
  } else if (part === 'dash') {
    if (isRoomy) {
      // A lunge: crouch, shoot ahead with streaks behind, skid in the dust, and walk back.
      const far = Math.min(6, hi - back)
      const beat = f % 6
      if (beat === 0) body('duck', back)
      else if (beat === 3) {
        const x = body('stand', back + far)
        dot(x - 1, GROUND - 1, DUST)
        dot(x - 2, GROUND - 2, DUST)
      } else if (beat > 3) body(WALK[beat % 2]!, back + Math.round((far * (6 - beat)) / 3), 0, true)
      else {
        const x = body(WALK[beat - 1]!, back + Math.round((far * beat) / 2))
        for (let k = 0; k < 3; k++) for (let n = 0; n < 4 - beat - (k % 2) && x - 1 - n >= lo; n++) dot(x - 1 - n, brow + 1 + k * 2, STREAK)
      }
    } else {
      // No room to run: on the spot, sparks flying.
      const x = body(WALK[f % 2]!, back)
      if (f % 2 === 0) above(FX.bolt, x)
      else dot(x + REACH, GROUND - 1, DUST)
    }
  } else if (part === 'ride') {
    const x = riding(home, [1, 2, 2, 1][f % 4]!)
    if (f % 2 === 0 && x - 5 >= lo) add(FX.twinkle, x - 5, GROUND - 6)
  } else if (part === 'call') {
    const x = body(f % 2 === 1 ? 'jump' : 'stand', home, f % 2)
    // A heart held up for a friend.
    if (f % 4 < 3) add(FX.heart, x + ((width - 5) >> 1), top - 6)
  } else if (part === 'sparkle') {
    const [pose, flip] = SPIN[f % SPIN.length]!
    above(FX.star[f % 2]!, body(pose, home, 0, flip))
  } else if (part === 'ask') {
    above(FX.ask, body(f % 6 === 5 ? 'blink' : 'stand', home))
  } else if (part === 'hop') {
    const up = [0, 2, 3, 2][f % 4]!
    const x = body(up === 0 ? 'stand' : 'jump', home, up)
    if (up === 0) for (const dx of [-1, REACH]) dot(x + dx, GROUND - 1, DUST)
  } else if (part === 'hurt') {
    const [pose, dx, up, flip] = HURT[Math.min(age, HURT.length - 1)]!
    const x = body(pose, home + dx, up, flip)
    // The knock comes down on its head.
    if (age === 0) add(FX.impact, x + ((width - 5) >> 1), top - up - 4)
  } else if (part === 'dance') {
    const [pose, dx, up, flip] = DANCE[Math.min(age, DANCE.length - 1)]!
    const x = body(pose, home + dx, up, flip)
    if (pose === 'cheer' || pose === 'cheer2') add(FX.twinkle, pose === 'cheer' ? x : x + width - 3, top - 5)
  } else if (agent.isLost === true) {
    // Stopped short: gone in a puff.
    if (age < 2) add(FX.puff[age + 1]!, middle - 3, GROUND - 7)
  } else if (age < 2) {
    // The level is cleared: off on a warp star, away to a twinkle.
    riding(home, age + 1)
  } else if (age === 2) add(FX.star[0], middle - 2, SKY + 1)
  else if (age === 3) add(FX.twinkle, middle - 1, SKY)
  else if (age === 4) dot(middle, SKY, GOLD)
}

/** The enemy at (x, y): flapping, flinching when a call lands, popped in a puff when an agent finishes. */
function drawFlyer(canvas: Canvas, x: number, y: number, frame: number, sinceHit: number, sincePop: number) {
  if (sincePop <= FX.puff.length) {
    if (sincePop > 0) return put(canvas, FX.puff[sincePop - 1]!, x + 1, 0)
    put(canvas, FX.flyerHit, x, y)

    return put(canvas, FX.impact, x - 1, y + 1)
  }
  // A thrown star takes two ticks to land.
  put(canvas, sinceHit === 2 || sinceHit === 3 ? FX.flyerHit : FX.flyer[frame % 2]!, x, y)
  if (sinceHit === 2) put(canvas, FX.impact, x - 1, y + 1)
}

function drawGround(canvas: Canvas) {
  for (let x = 0; x < canvas[0]!.length; x++) {
    canvas[GROUND]![x] = GRASS
    canvas[GROUND + 1]![x] = x % 4 === 1 ? SOIL_LIT : SOIL
  }
}

/** One far cloud drifts across the sky's columns `from` to `to`, whole all the way: it dims in at the right and out at the left. */
function drawCloud(canvas: Canvas, frame: number, from: number, to: number, isLight: boolean) {
  const clouds = isLight ? FX.cloudDay : FX.cloud
  const cloud = clouds[0]
  const steps = to - from - cloud[0]!.length + 1
  const step = (frame >> 1) % (Math.max(0, steps) + 6)
  if (steps > 2 && step < steps) put(canvas, clouds[step === 0 || step === steps - 1 ? 1 : 0], from + steps - 1 - step, 3)
}

/** A few stars that twinkle out of step, each only where the sky around it is empty. */
function drawStars(canvas: Canvas, frame: number, isLight: boolean) {
  const columns = canvas[0]!.length
  for (let k = 0; k < 4; k++) {
    const x = Math.floor(((k * 2 + 1) * columns) / 8) + (k % 2) * 2
    const y = [5, 1, 6, 2][k]!
    const isClear = [-1, 0, 1].every(dy => [-1, 0, 1].every(dx => (canvas[y + dy]?.[x + dx] ?? null) === null))
    if ((frame + k * 3) % 8 < 6 && isClear && x < columns) canvas[y]![x] = isLight ? SKY_SPARK : SKY_STAR
  }
}

/** The queue, in the sky's left corner: how many agents wait, and the heads of the first, in their colours. Returns the column it ends at. */
function drawQueue(canvas: Canvas, family: Family, queued: readonly Agent[], to: number, isLight: boolean): number {
  if (queued.length === 0) return 0
  put(canvas, FX.plus, 0, 0)
  let x = 4
  for (const digit of String(queued.length)) {
    put(canvas, FX.digits[Number(digit)]!, x, 0)
    x += 4
  }
  for (const agent of queued) {
    if (x + 6 > to) break
    put(canvas, headOf(family, agent.slot, formOf(agent.model ?? ''), isLight), x + 1, 0)
    x += 6
  }

  return x
}

const lerp = (a: number, b: number, q: number) => Math.round(a + (b - a) * q)

/**
 * One frame of the stage, `columns` wide and STAGE_ROWS * 2 pixels tall, null where nothing is drawn.
 * The minis stand on the ground, each in its zone; the sky above them holds the queue, a cloud,
 * and, while two or more agents are at it, the enemy they fight. On a light theme (`isLight`) the sky is a day's.
 */
export function sceneOf(family: Family, agents: readonly Agent[], frame: number, now: number, columns: number, isLight = false): Pixels {
  const canvas: Canvas = Array.from({ length: HEIGHT }, () => Array<number | null>(columns).fill(null))
  const { roles, queued } = castOf(agents, now, columns)
  const was = castOf(agents, now - TICK_MS, columns).roles
  drawGround(canvas)

  // The enemy: there once the second of those on stage has landed, away for a while after a pop.
  const present = roles.filter(role => role.leaving < 0)
  const battle = present.map(role => role.since).sort((a, b) => b - a)[1] ?? -1
  const sincePop = Math.min(Infinity, ...agents.filter(a => a.isLost !== true).map(a => ticksAfter(a.doneAt, now)))
  const flown = Math.min(battle - ENTER_TICKS, sincePop - RESPAWN_TICKS)
  const isPopping = sincePop <= FX.puff.length && battle >= ENTER_TICKS + FLY_IN
  const hasFlyer = present.length > 1 && (flown >= 0 || isPopping)
  // Its fight called off, one of two stopped short: it flies off as that one goes.
  const off = present.length === 1 ? Math.min(Infinity, ...roles.filter(role => role.agent.isLost === true && role.leaving >= 0).map(role => role.leaving)) : Infinity
  const isFlyerUp = hasFlyer && flown >= FLY_IN
  const sinceHit = isFlyerUp ? Math.min(Infinity, ...present.filter(role => role.agent.doneAt === undefined).map(role => ticksAfter(role.agent.hitAt, now))) : Infinity
  const hover = columns - FLYER_ROOM + [0, 1, 2, 1][(frame >> 2) % 4]!
  const flyerAt = [hover + (isPopping ? 0 : Math.max(0, FLY_IN - flown) * 3), 1 + ((frame >> 1) % 2)] as const
  const skyEnd = present.length > 1 ? columns - FLYER_ROOM - 1 : columns

  drawCloud(canvas, frame, drawQueue(canvas, family, queued, skyEnd, isLight) + 1, skyEnd, isLight)
  if (hasFlyer) drawFlyer(canvas, flyerAt[0], flyerAt[1], frame, sinceHit, isPopping ? sincePop : Infinity)
  else if (off < FLY_IN && sincePop >= RESPAWN_TICKS + FLY_IN) drawFlyer(canvas, hover + (off + 1) * 3, flyerAt[1], frame, Infinity, Infinity)

  for (const { agent, zone, since, leaving } of roles) {
    const act = actOf(agent, now)
    const old = was.find(role => role.agent === agent)?.zone ?? zone
    const moved = zone[0] + zone[1] - old[0] - old[1]
    const isBusy = act === 'hurt' || act === 'dance' || act === 'faint'
    if (leaving >= 0) drawMini(canvas, family, agent, 'exit', frame, leaving, zone, isLight)
    else if (since < ENTER_TICKS) drawMini(canvas, family, agent, 'arrive', frame, since, zone, isLight)
    else if (moved !== 0 && !isBusy) drawMini(canvas, family, agent, 'walk', frame, moved, zone, isLight)
    else drawMini(canvas, family, agent, act, frame, ticksAfter(act === 'hurt' ? agent.hurtAt : agent.doneAt, now), zone, isLight)
    // A call that ended well: a star shot across the sky, under the queue, landing on the enemy two ticks later.
    const thrown = ticksAfter(agent.hitAt, now)
    if (isFlyerUp && thrown < 2 && leaving < 0 && agent.doneAt === undefined) {
      put(canvas, pixelsByDay(FX.shot, isLight), lerp(zone[0] + 3, flyerAt[0] - 3, (thrown + 1) / 3), SKY - 2)
    }
  }
  drawStars(canvas, frame, isLight)

  return canvas
}
