// The stage in true pixels: every running subagent as a mini, acting out what its agent really does.
// Pure: a frame is derived from (agents, now) alone, so previews and tests draw what the pane draws.
// The acts and their timing are stage.ts's (the cell-block stage draws the same story); here time is
// milliseconds, so everything moves a pixel at a time.
import { CLEAR, blank, paint, stand } from './canvas'
import type { Canvas, Span, Sprite } from './canvas'
import { HI } from './hires'
import type { MiniSet, Pose } from './hires'
import { formOf } from './look'
import type { Form } from './look'
import { DUST, GOLD, GRASS, SKY_SPARK, SKY_STAR, SOIL, SOIL_LIT, STREAK, byDay, pixelsByDay } from './minis'
import { DANCE_MS, HURT_MS, LEAVE_MS, actOf, toolAct } from './stage'
import type { Act, Agent } from './stage'

/** The stage's least height in art pixels: the ground, a mini's reach, and a strip of sky that holds a waiting mini, the tallest hat and all, on its cloud. */
export const STAGE_PX = 70
export const GROUND_PX = 5
/**
 * The rows above the ground the minis use, whatever they wear and do: the tallest of them on its ride
 * at the top of its bob, a sword held high, what floats over a head. The sky above is the queue's, the clouds' and the enemy's.
 */
export const REACH_PX = 39
const GRASS_LIT = 0x58c070
const CLOUD_DIM = 0x2a2d44
const CLOUD_DIM_DAY = 0xf1d2e1
const ENEMY_ROOM = 26 // the pixels at the sky's right end the enemy hovers in
const CALL_MS = 270 // of its ride off, the hop its ride flashes in under
const PAD = 1 // pixels kept clear at each end of the stage
const GAP = 1 // and at the end of each mini's zone, so no two ever touch
const ZONE_MIN = 24 // a mini's own pixels at the least: its widest self (stuffed, afloat) and the gap
const ON_STAGE_MAX = 5
const ROOMY = 34 // a zone this wide lets a mini swing its sword and run
const OPEN_MS = 800 // a zone opens under a mini dropping in
const ENTER_MS = 1600
const EXIT_MS = LEAVE_MS - DANCE_MS
const RIDE_MS = 1000 // of its exit, how long a mini is still on stage, riding up: then its zone closes
const RESPAWN_MS = 4400 // after a pop, until the next enemy flies in
const FLY_MS = 900
const SHOT_MS = 500 // a thrown star's flight to the enemy
const DIVE_MS = 180 // the enemy's dive at a mini whose call failed: the knock lands at its end
const RISE_MS = 720 // and its climb back
const FRAME_MS = 90
const QUEUE_DROP = 2 // the rows of sky kept under the feet of the minis that wait in it: their cloud's
const FLAME = [0xf8f040, 0xf8a800, 0xe82000] as const // a fire's heart, its body, its edge

/** A family's mini for an agent's colour slot and its model's form. */
export type MiniOf = (slot: number, form?: Form) => MiniSet

/** The form an agent's mini wears: its model's, plain while nobody told. */
const formIn = (agent: Agent): Form => formOf(agent.model ?? '')

/** The narrowest stage: one mini. */
export const NARROWEST_PX = ZONE_MIN + 2 * PAD

const ease = (u: number) => u * u * (3 - 2 * u)
const arc = (u: number) => 4 * u * (1 - u)
const unit = (u: number) => Math.max(0, Math.min(1, u))
const wave = (t: number, period: number) => Math.sin((2 * Math.PI * t) / period)
const since = (at: number | undefined, now: number) => (at === undefined || at > now ? Infinity : now - at)

/** How many of `alive` agents get a mini on a stage `width` pixels wide. */
export const capOf = (width: number, alive: number): number =>
  Math.min(alive, Math.max(1, Math.min(ON_STAGE_MAX, Math.floor((width - 2 * PAD) / ZONE_MIN))))

/** An agent with a mini: its pixels, how long it has had them, and how far into its ride off it is (-1 before). */
type Role = { agent: Agent; zone: Span; age: number; leaving: number }

/**
 * Who is on stage at `now`, and who waits. The first agents get a zone each, side by side; a zone
 * opens as its mini drops in and closes as it flies off, the others' sliding over, so nothing ever
 * jumps however the comings and goings overlap. The place of an agent that starts its ride off goes
 * at once to the first in the queue.
 */
function castOf(agents: readonly Agent[], now: number, width: number): { roles: Role[]; queued: Agent[] } {
  const room = capOf(width, Infinity)
  const exits: number[] = [] // when each earlier agent started its ride off
  const cast: (Omit<Role, 'zone'> & { weight: number })[] = []
  const queued: Agent[] = []
  agents.filter(a => (a.joinedAt ?? -Infinity) <= now).forEach((agent, i) => {
    const out = agent.doneAt === undefined ? Infinity : agent.doneAt + DANCE_MS
    const gone = exits.filter(at => at <= Math.min(now, out)).sort((a, b) => a - b)
    const leaving = out <= now ? now - out : -1
    if (i - gone.length >= room) {
      if (leaving < 0) queued.push(agent)
    } else if (leaving < EXIT_MS) {
      const age = now - Math.max(agent.joinedAt ?? -Infinity, i < room ? -Infinity : gone[i - room]!)
      const weight = leaving >= RIDE_MS ? 1 - ease(unit((leaving - RIDE_MS) / (EXIT_MS - RIDE_MS))) : ease(unit(age / OPEN_MS))
      cast.push({ agent, age, leaving, weight })
    }
    if (out <= now) exits.push(out)
  })
  const zone = (width - 2 * PAD) / Math.max(1, cast.reduce((sum, one) => sum + one.weight, 0))
  let before = 0
  const roles = cast.map(({ weight, ...role }) => {
    const from = PAD + Math.round(zone * before)
    before += weight

    return { ...role, zone: [from, PAD + Math.round(zone * before)] as const }
  })

  return { roles, queued }
}

/** The agents with a mini on a stage `width` pixels wide, flying off ones aside: the others wait in the queue. */
export const stagedOf = (agents: readonly Agent[], now: number, width: number): readonly Agent[] =>
  castOf(agents, now, width).roles.filter(role => role.leaving < 0).map(role => role.agent)

/** What a mini is drawn as: its act; `arrive` while it drops in; `walk` while its zone slides (`age` is the way: right when positive). */
type Part = Act | 'arrive' | 'walk'

const PIROUETTE: readonly (readonly [Pose, boolean])[] = [['stand', false], ['turn', false], ['back', false], ['turn', true]]

const FLASH = 0xffffff // the enemy, the moment before it pops

/**
 * One mini on the canvas, inside its zone: its body and what its act adds. `age` is how long the
 * part has lasted, in milliseconds; `landed` is when it finished dropping in. Returns the column it stands at.
 */
function drawMini(canvas: Canvas, set: MiniSet, agent: Agent, part: Part, act: Act, now: number, age: number, zone: Span, ground: number, landed: number, isLight: boolean): number {
  // The zone's last pixel stays clear, so nothing of one mini ever touches the next.
  const [lo, hi] = [zone[0], Math.max(zone[0], zone[1] - GAP)]
  const clip = { columns: [lo, hi] as Span, rows: [ground - REACH_PX, canvas.height] as Span }
  const home = (lo + hi) / 2
  // Where an act has it stand: back a little to breathe in or to run, so it lands and walks there too.
  // (A fire's breath and a beam's whip reach ahead, as a breath in does.)
  const backOf = (of: Act) => Math.max(lo + set.half + 1, home - (of === 'inhale' ? 16 : of === 'dash' ? 18 : of === 'sword' && set.attack !== undefined ? 12 : 0))
  const rest = backOf(act)
  const clock = (at: number) => at + agent.slot * 370 // neighbours are out of step
  const t = clock(now)
  const beat = (ms: number, count: number) => Math.floor(t / ms) % count
  // A hat that is alive (a fire's flames) is two drawings, shown in turn.
  const poses = set.flicker !== undefined && Math.floor(now / 180) % 2 === 1 ? set.flicker : set.poses
  const frame = (pose: Pose, i = 0): Sprite => poses[pose][Math.min(Math.max(0, i), poses[pose].length - 1)]!
  const sway = Math.min(6, Math.max(0, (hi - lo) / 2 - 13))
  const reach = Math.min(16, Math.floor((hi - lo) / 2) - set.half - 1)

  /** A thinking mini's walk to and fro at `at` of its clock: where it is, which way it looks, and how far into its pause at an end (`p`). */
  const pace = (at: number) => {
    const [leg, pause] = [Math.max(1, reach) * 2 * FRAME_MS, 1100]
    const v = (at + (agent.slot % 2) * (leg + pause)) % (2 * (leg + pause))
    const [isBack, w] = v < leg + pause ? [false, v] : [true, v - leg - pause]
    const end = isBack ? -1 : 1
    const isWalking = reach >= 2 && w < leg

    return { x: isWalking ? home + end * reach * (2 * ease(w / leg) - 1) : home + (reach >= 2 ? end * reach : 0), isBack, isWalking, p: reach >= 2 ? w - leg : w % pause }
  }
  /** A lunge at `at` of its clock: crouch, slide ahead, turn, walk back. `far` under ten pixels is no room to run. */
  const lunge = (at: number) => {
    const back = backOf('dash')
    const far = Math.min(30, hi - set.half - back)
    const v = at % 2300
    const x = far < 10 ? home : v < 260 ? back : v < 760 ? back + far * (1 - (1 - (v - 260) / 500) ** 2) : v < 1060 ? back + far : v < 2060 ? back + far * (1 - (v - 1060) / 1000) : back

    return { back, far, v, x }
  }
  /** Where an act has its mini at `at`, once it is settled in it. */
  const spot = (of: Act, at: number): number =>
    of === 'idle' ? pace(clock(at)).x
    : of === 'inhale' ? backOf(of)
    : of === 'sword' ? (set.attack !== undefined ? backOf(of) : hi - lo >= ROOMY ? home + 4 : Math.max(lo + set.half, home - 2))
    : of === 'dash' ? lunge(clock(at)).x
    : of === 'ride' ? home + sway * wave(clock(at), 2900)
    : home

  // Nothing is ever somewhere else from one frame to the next: when what it does changes, it starts
  // from where the act before left it and makes the way up over a moment; knocked over, it is
  // thrown that way; fainted, it stays where it was.
  let drift = 0
  if (part === act && (act !== 'exit' || agent.isLost === true)) {
    const turned = agent.turnedAt ?? -Infinity
    const calm: Act = agent.calls.length > 0 ? toolAct(agent.calls[agent.calls.length - 1]!.tool) : 'idle'
    const before = (at: number): Act => (turned !== at ? calm : agent.wasTool === undefined ? 'idle' : toolAct(agent.wasTool))
    const isEnd = act === 'dance' || act === 'faint' || act === 'exit'
    const shaken = (agent.hurtAt ?? -Infinity) + HURT_MS
    const began = act === 'hurt' ? agent.hurtAt ?? -Infinity : isEnd ? agent.doneAt ?? -Infinity : Math.max(turned, shaken, landed)
    if (Number.isFinite(began)) {
      const from = act === 'hurt' || isEnd || began === turned ? spot(before(began), began) : began === shaken ? home : rest
      const off = from - (act === 'hurt' || isEnd ? home : spot(act, began))
      const [start, span] = act === 'hurt' ? [began + DIVE_MS, 700] : [began, act === 'faint' || act === 'exit' ? Infinity : Math.max(300, Math.abs(off) * 45)]
      drift = off * (1 - ease(unit((now - start) / span)))
    }
  }

  /** The frame stood at `x`, `up` pixels off the ground, kept whole inside the zone where it fits (`isPinned`: at `x` whatever is cut). Returns where it stands. */
  const body = (one: Sprite, x: number, up = 0, flip = false, isPinned = false) => {
    const width = one.px[0]!.length
    const [left, right] = flip ? [width - one.ax, one.ax] : [one.ax, width - one.ax]
    const at = isPinned ? x : hi - lo < width ? home + (left - right) / 2 : Math.max(lo + left, Math.min(hi - right, x + drift))
    // Never higher than its reach: a hat is not cut off at the sky.
    stand(canvas, one, at, ground - Math.round(Math.min(up, Math.max(0, REACH_PX - one.ay))), { ...clip, flip })

    return Math.round(at)
  }
  // An effect is whole or lower: never cut off at the sky. By day it is in the day's colours (but what has a line round it: that reads on any ground).
  const fx = (one: Sprite, x: number, y: number, tint = CLEAR) =>
    stand(canvas, one === HI.ask || one === HI.impact ? one : { ...one, px: pixelsByDay(one.px, isLight) }, x, Math.max(Math.round(y), ground - REACH_PX + one.ay), { ...clip, tint })
  const dot = (x: number, y: number, color: number) => paint(canvas, [[byDay(color, isLight)]], Math.round(x), Math.round(y), clip)
  const tall = (one: Sprite) => one.ay
  // What floats over its head starts clear of it, hat and all.
  const over = ground - set.tall - 3
  /** Stars circle its head. */
  const seeingStars = (x: number, top: number) => {
    for (const k of [0, 1]) fx(HI.dizzy[k]!, x + 8 * Math.cos(t / 260 + k * Math.PI), top + 2 + 2 * Math.sin(t / 260 + k * Math.PI))

    return x
  }
  const dustAt = (x: number) => fx(HI.dust[beat(120, 2)]!, x, ground, DUST)
  /**
   * On its ride at `x`, `up` pixels off the ground, whole: where the zone is narrower than the
   * ride, stood on a small star instead. `rows` are the rows it may be drawn in.
   */
  const riding = (x: number, up: number, flip = false, rows: Span = clip.rows) => {
    const one = frame('ride')
    const width = one.px[0]!.length
    const within = { columns: clip.columns, rows }
    if (width <= hi - lo) {
      const at = Math.max(lo + (flip ? width - one.ax : one.ax), Math.min(hi - (flip ? one.ax : width - one.ax), x))
      stand(canvas, one, at, ground - Math.round(up), { ...within, flip })

      return Math.round(at)
    }
    const [star, rider] = [HI.star[0]!, frame('stand')]
    const at = Math.max(lo + set.half, Math.min(hi - set.half, x))
    stand(canvas, star, at, ground - Math.round(up), within)
    stand(canvas, rider, at, ground - Math.round(up) - 9, { ...within, flip })

    return Math.round(at)
  }

  if (part === 'arrive') {
    // In with a twinkle, then down from where it shone, landing in a squash.
    if (age < 700) fx(age < 350 ? HI.twinkle : HI.spark, rest, ground - REACH_PX + (age < 350 ? 12 : 17))
    else if (age < 1200) return body(frame('fall'), rest, (REACH_PX - set.tall) * (1 - ((age - 700) / 500) ** 2))
    else if (age < 1350) {
      // (The landing's first moment is the deeper squash, where the set has one: then the crouch, then up.)
      const x = body(frame('duck', age < 1290 ? 1 : 0), rest)
      for (const side of [-1, 1]) dot(x + side * (set.half + 1 + (age - 1200) / 50), ground - 1 - (age - 1200) / 75, DUST)

      return x
    } else return body(frame('stand'), rest)

    return Math.round(rest)
  }
  if (part === 'walk') return body(frame('walk', beat(110, 4)), rest, 0, age < 0)
  if (part === 'idle') {
    // Thinking: a walk to and fro, a blink at one end, a hop at the other.
    const { x, isBack, isWalking, p } = pace(t)
    if (isWalking) return body(frame('walk', Math.floor(Math.abs(x - home + reach) / 3) % 4), x, 0, isBack)
    if (isBack && p >= 300 && p < 800) return body(frame(p < 550 ? 'jump' : 'fall'), x, 9 * arc((p - 300) / 500), isBack)
    if (isBack && p >= 800 && p < 920) return body(frame('duck', p < 860 ? 1 : 0), x, 0, isBack)

    return body(frame(!isBack && p >= 500 && p < 650 ? 'blink' : 'stand'), x, 0, isBack)
  }
  if (part === 'dazed' || part === 'faint') {
    // Sat in a heap, or out for the count (down through the heap, never from its feet to flat in one frame): either way it sees stars.
    const one = frame(part === 'dazed' || age < 180 ? 'sit' : 'flat')

    return seeingStars(body(one, home), ground - tall(one) - 6)
  }
  if (part === 'inhale') {
    const v = t % 2400
    const back = rest
    if (v < 1500) {
      // A breath in to begin with, then wide open for as long as it pulls: the swell happens once, not to and fro.
      const x = body(frame('inhale', v < 180 ? 0 : 1), back)
      const [mouth, y] = [x + set.half, ground - 8]
      const range = Math.min(26, hi - mouth - 2)
      // Wind streaming into the mouth along a closing cone, and a star drawn in with it.
      for (let k = 0; k < 5 && range >= 5; k++) {
        const far = (1 - ((t / 420 + k / 5) % 1)) * range
        const dy = ((k % 2 === 0 ? -1 : 1) * (1 + (k % 3)) * far) / 6
        for (const n of [0, 1]) dot(mouth + 2 + far + n, y + dy, STREAK)
      }
      if (range >= 5) fx(HI.glint, mouth + 3 + (1 - ease(v / 1500)) * range, y + 2)
      else dot(mouth + 1, y + beat(120, 2), beat(120, 2) === 0 ? GOLD : STREAK)

      return x
    }
    if (v < 1860) return body(frame('full', v < 1680 ? 0 : 1), back, 2 * arc((v - 1500) / 360))
    // Swallowed: down through a breath to its own size, never from stuffed to flat in one frame.
    if (v < 1960) return body(frame('puff'), back)

    return body(frame(v >= 2100 && v < 2250 ? 'blink' : 'stand'), back)
  }
  if (part === 'sword' && set.attack === 'pencil') {
    // Plain Kirby edits with a pencil: three lines written in the air ahead of him, his pencil at the head of each, and a hop when the page is full.
    const v = t % 2100
    const isDone = v >= 1800
    const x = body(frame(isDone ? 'cheer' : v % 600 > 520 ? 'blink' : 'stand', 2), rest, isDone ? 3 * arc((v - 1800) / 300) : 0)
    const from = Math.min(x + set.half + 2, hi - HI.pencil.px[0]!.length)
    const wide = Math.min(12, hi - from - HI.pencil.px[0]!.length)
    if (wide < 4) {
      // No room for a page: the pencil scratches on the spot, a crumb of lead under it.
      fx(HI.pencil, from + beat(110, 2), ground - 5 - beat(220, 2))
      dot(from - 1 + beat(110, 3), ground - 4, STREAK)

      return x
    }
    for (let k = 0; k < 3; k++) {
      const long = Math.round((k === 2 ? wide - 4 : wide) * (isDone ? 1 : unit((v - k * 600) / 520)))
      for (let i = 0; i < long; i++) dot(from + i, ground - 15 + k * 4, STREAK)
      if (!isDone && Math.floor(v / 600) === k) fx(HI.pencil, from + long, ground - 14 + k * 4 - beat(90, 2))
    }

    return x
  }
  if (part === 'sword' && set.attack === 'fire') {
    // Fire Kirby edits with his breath: a breath in, then a flame out of his mouth, licking ahead.
    const v = t % 1900
    if (v < 220) return body(frame('puff'), rest)
    if (v >= 1500) return body(frame(v >= 1650 && v < 1800 ? 'blink' : 'stand'), rest)
    const x = body(frame('inhale', 1), rest)
    const [mouth, y] = [x + set.half + 3, ground - 9]
    const long = Math.round(Math.min(20, hi - mouth - 1) * Math.min(1, (v - 220) / 260, (1500 - v) / 160))
    for (let i = 0; i < long; i++) {
      // A teardrop that flickers: thickest two thirds of the way along, its heart yellow, its edge red.
      const thick = Math.round(3.4 * Math.sin((Math.PI * (i + 1)) / (long + 2)) ** 0.7 + ((i + beat(90, 3)) % 3 === 0 ? 1 : 0))
      for (let dy = -thick; dy <= thick; dy++) dot(mouth + i, y + dy, FLAME[Math.abs(dy) >= thick || i >= long - 2 ? 2 : Math.abs(dy) >= thick - 1 || i > long * 0.6 ? 1 : 0])
    }

    return x
  }
  if (part === 'sword' && set.attack === 'beam') {
    // Beam Kirby edits with his whip: a string of beads cracked from over his head to the ground ahead, its tip the last to come round.
    const v = t % 990
    const x = body(frame(v < 540 ? 'cheer' : 'stand', 2), rest, v < 540 ? 2 * arc(v / 540) : 0)
    const [hand, y] = [x + set.half - 2, ground - 11]
    const reach = Math.min(4, (hi - hand - 3) / 5)
    if (v < 720 && reach >= 2) {
      for (let k = 1; k <= 5; k++) {
        const turn = -1.9 + 2.5 * ease(unit((v - k * 45) / 360))
        const [bx, by] = [Math.round(hand + k * reach * Math.cos(turn)), Math.round(y + k * reach * Math.sin(turn))]
        if (k === 5) fx(v % 180 < 90 ? HI.twinkle : HI.glint, bx, Math.min(ground, by + 2))
        else paint(canvas, pixelsByDay([[GOLD, 0xffffff], [0xffffff, GOLD]], isLight), bx, Math.min(ground - 2, by), clip)
      }
    }

    return x
  }
  if (part === 'sword') {
    if (hi - lo >= ROOMY) {
      // The sword tilts back, a jump into the swing (wound up low behind, round over the head), the flash, a settle past
      // upright, and held high. The swing is a pose a frame: the clock's own step, so none is shown twice and none skipped.
      const v = t % (20 * FRAME_MS)
      const k = Math.floor(v / FRAME_MS)
      const i = k === 0 ? 8 : k < 4 ? 0 : k < 8 ? k - 3 : k === 8 ? 5 : k === 9 ? 6 : k === 10 ? 9 : 7
      const one = frame('slash', i)
      // The swing begins in the air, the blade under him: he is lifted so that nothing of it is in the ground.
      const hop = i === 0 ? 3 * arc((v - FRAME_MS) / (3 * FRAME_MS)) : i === 7 ? 2 * arc(unit((v - 11 * FRAME_MS) / 200)) : [0, 2, 3, 1][i] ?? 0

      return body(one, home + 4, Math.min(REACH_PX - one.ay, Math.max(0, one.px.length - one.ay) + hop))
    }
    // No room to swing: the sword held high, flashing on a hop.
    const v = t % 1300
    const i = v < 500 || v >= 800 ? 7 : v < 650 ? 5 : 6

    return body(frame('slash', i), Math.max(lo + set.half, home - 2), i === 7 ? 0 : 5 * arc((v - 500) / 300), false, true)
  }
  if (part === 'dash') {
    const { back, far, v, x: at } = lunge(t)
    if (far >= 10) {
      // A lunge: crouch, slide ahead in the dust, turn and walk back.
      if (v < 260) return body(frame('duck'), at)
      if (v < 760) {
        const x = body(frame('slide'), at)
        if ((v - 260) / 500 < 0.85 && x - set.half - 10 >= lo) dustAt(x - set.half - 5)

        return x
      }
      if (v < 960) return body(frame('stand'), at)
      if (v < 1060) return body(frame('turn'), at)
      if (v < 2060) return body(frame('walk', Math.floor((back + far - at) / 3) % 4), at, 0, true)

      return body(frame(v < 2160 ? 'turn' : 'stand'), at)
    }
    // No room to run: on the spot, the dust flying.
    const x = body(frame('walk', beat(70, 4)), home)
    for (let k = 0; k < 3; k++) dot(x - set.half - 1 - ((t / 40 + k * 3) % 6), ground - 2 - k * 4, k === 1 ? DUST : STREAK)

    return x
  }
  if (part === 'ride') {
    // The web: aloft on a warp star, twinkles in its wake.
    // It bobs as high as its reach lets all of it: a taller hat rides a little lower, never with its tip cut off at the sky.
    const way = Math.cos((2 * Math.PI * t) / 2900) < 0
    const one = frame('ride')
    const high = one.px[0]!.length <= hi - lo ? one.px.length : set.tall + 9
    const x = riding(home + sway * wave(t, 2900) + drift, Math.max(0, Math.min(6, REACH_PX - high - 3) + 3 * wave(t, 1300)), way)
    for (const k of [0, 1]) if ((beat(130, 4) + k) % 2 === 0) fx(HI.glint, x + (way ? 1 : -1) * (14 + k * 5), ground - 8 - k * 5 - 3 * wave(t, 1300))

    return x
  }
  if (part === 'call') {
    // A heart held up for a friend.
    const up = beat(350, 2) === 1 ? 3 * arc((t % 350) / 350) : 0
    const x = body(frame('cheer', beat(350, 2) * 2), home, up)
    fx(HI.heart, x, over - 1 - up - 2 * wave(t, 900)) // up with its hop: never down on its hat

    return x
  }
  if (part === 'sparkle') {
    const [pose, flip] = PIROUETTE[beat(120, PIROUETTE.length)]!
    const x = body(frame(pose), home, 0, flip)
    fx(beat(240, 2) === 0 ? HI.twinkle : HI.glint, x + 6 * wave(t, 700), over - beat(120, 4))

    return x
  }
  if (part === 'ask') {
    const x = body(frame(t % 2600 > 2450 ? 'blink' : 'stand'), home)
    fx(HI.ask, x + 1, over - Math.round(1.5 * wave(t, 1000)))

    return x
  }
  if (part === 'hop') {
    // Puffed up and afloat, then out with the breath and down.
    const v = t % 2600
    if (v < 220) return body(frame('puff'), home)
    if (v < 2000) return body(frame('float', beat(160, 4)), home, 9 * ease(unit((v - 220) / 500)) + 1.5 * wave(v, 700))
    if (v < 2250) {
      const x = body(frame('fall'), home, 9 * (1 - ((v - 2000) / 250) ** 2))
      fx(HI.air, x + set.half + 6 + (v - 2000) / 40, ground - 4)

      return x
    }

    return body(v < 2380 ? frame('duck', v < 2320 ? 1 : 0) : frame('stand'), home)
  }
  if (part === 'hurt') {
    // It sees the enemy coming, is knocked head over heels toward the middle of its zone, lands in a squash, and sits in a heap.
    const fell = age - DIVE_MS
    if (fell < 0) return body(frame('stand'), home)
    if (fell < 700) {
      const x = body(frame('tumble', Math.floor(fell / 90) % 4), home, 12 * arc(fell / 700))
      if (fell < 400) fx(HI.impact, x, over + 1 - 12 * arc(fell / 700))

      return x
    }
    if (fell < 820) return body(frame('duck', fell < 760 ? 1 : 0), home)
    // Sat where it fell, the stars already round its head: the dazed wait that follows is this same picture.
    const one = frame('sit')

    return seeingStars(body(one, home), ground - tall(one) - 6)
  }
  if (part === 'dance') {
    // The victory dance: three steps side to side (the first from wherever it stood), a pirouette, a somersault, and the cheer.
    const step = (from: number, to: number, u: number, flip: boolean) => body(frame('dance', 6), home + from + (to - from) * ease(u), 4 * arc(u), flip)
    const wide = Math.min(8, Math.max(0, (hi - lo) / 2 - set.half))
    if (age < 450) return step(0, -wide, age / 450, true)
    if (age < 1050) return step(-wide, wide, (age - 450) / 600, false)
    if (age < 1500) return step(wide, 0, (age - 1050) / 450, true)
    if (age < 2100) {
      const [pose, flip] = PIROUETTE[Math.floor((age - 1500) / 100) % PIROUETTE.length]!

      return body(frame(pose), home, 0, flip)
    }
    if (age < 2800) {
      const u = (age - 2100) / 700

      return body(u < 0.25 ? frame('dance', 1) : u < 0.8 ? frame('tumble', Math.floor(age / 80) % 4) : frame('fall'), home, 16 * arc(u))
    }
    if (age < 2950) return body(frame('cheer', 1), home)
    const isUp = Math.floor(age / 220) % 2 === 1
    const x = body(frame('cheer', isUp ? 2 : 0), home, isUp ? 2 : 0)
    fx(HI.glint, x + (isUp ? 1 : -1) * (set.half + 2), over - 1)

    return x
  }
  if (agent.isLost === true) {
    // Stopped short: gone in a puff, where it lay.
    if (age < 450) fx(HI.pop[Math.floor(age / 150)]!, home + drift, ground)
  } else if (age < CALL_MS) {
    // The level is cleared: a hop, and its ride flashes in under its feet.
    const one = frame('ride')
    const x = body(frame('jump'), home, Math.min(10, one.px.length - tall(frame('stand'))) * ease(age / CALL_MS))
    fx(age < 90 ? HI.glint : age < 180 ? HI.twinkle : HI.spark, x, ground - (age < 180 ? 1 : 0))
  } else if (age < RIDE_MS) {
    // Off on it, faster and faster, up out of the picture.
    const flown = age - CALL_MS
    const up = flown < 110 ? 0 : (ground + 26) * ((flown - 110) / (RIDE_MS - CALL_MS - 110)) ** 2
    riding(home, up, false, [0, canvas.height])
    if (flown >= 110) for (const k of [0, 1]) paint(canvas, pixelsByDay(HI.glint.px, isLight), Math.round(home) - 4 + k * 6, Math.round(ground - up * (0.55 - k * 0.2)) - 6, { columns: clip.columns, rows: [0, ground] })
  }

  return Math.round(home + drift)
}

/** The enemy with its feet at (x, y): flapping on an even beat, knocked back when hit, flashing then popped when `pop` (milliseconds into it) is not Infinity. */
function drawEnemy(canvas: Canvas, x: number, y: number, now: number, isHit: boolean, pop: number) {
  // Coming in or leaving at the picture's edge, it is not there until some of its body is: never a sliver of its outline alone.
  if (Math.round(x) - HI.burt[0]!.ax > canvas.width - 4) return
  if (pop >= 150 && pop < 600) return stand(canvas, HI.pop[Math.floor((pop - 150) / 150)]!, x, y)

  stand(canvas, HI.burt[Math.floor(now / (2 * FRAME_MS)) % HI.burt.length]!, x + (isHit ? 2 : 0), y, pop < 150 ? { tint: FLASH } : {})
  if (isHit) stand(canvas, HI.impact, x - 7, y - 5)
}

function drawScenery(canvas: Canvas, now: number, ground: number, sky: Span, isLight: boolean) {
  const star = isLight ? SKY_SPARK : SKY_STAR
  const { width } = canvas
  // A few stars that twinkle out of step, two clouds drifting at their own pace, the far one slower:
  // all in the free sky, never behind the queue or the enemy.
  for (let k = 0; k < 5; k++) {
    const [x, y] = [Math.floor(((k * 2 + 1) * width) / 10) + ((k * 7) % 5), 2 + ((k * 5) % (ground - REACH_PX - 3))]
    const glow = (now / 300 + k * 2.3) % 8
    if (glow < 6 && x - 2 >= sky[0] && x + 2 < sky[1]) paint(canvas, glow > 2.5 && glow < 3.5 ? HI.glint.px : [[star]], glow > 2.5 && glow < 3.5 ? x - 1 : x, glow > 2.5 && glow < 3.5 ? y - 1 : y, { tint: star })
  }
  ;(isLight ? HI.cloudDay : HI.cloud).forEach((cloud, k) => {
    const wide = cloud[0]!.length
    const x = width - Math.floor((now / (k === 0 ? 260 : 520) + k * 57) % (width + wide + 30 * (k + 1)))
    // It slides in and out at the picture's own edges; where the free sky ends short of them it is whole or not there, dim as it nears the end.
    const [isIn, isOut] = [sky[0] <= 0 || x >= sky[0], sky[1] >= width || x + wide <= sky[1]]
    const isDim = (sky[0] > 0 && x - sky[0] < 6) || (sky[1] < width && sky[1] - x - wide < 6)
    if (isIn && isOut) paint(canvas, cloud, x, k === 0 ? 8 : 2, isDim ? { tint: isLight ? CLOUD_DIM_DAY : CLOUD_DIM } : {})
  })
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < GROUND_PX; y++) canvas.data[(ground + y) * width + x] = y === 0 ? GRASS_LIT : y < 3 ? GRASS : (x * 7 + y * 3) % 11 === 0 ? SOIL_LIT : SOIL
  }
  // Tufts of grass along the ground.
  for (let k = 0; 4 + k * 11 + ((k * 7) % 5) < width - 2; k++) {
    const x = 4 + k * 11 + ((k * 7) % 5)
    paint(canvas, k % 3 === 0 ? [[GRASS_LIT, null, GRASS_LIT], [null, GRASS, null]] : [[null, GRASS_LIT], [GRASS, GRASS]], x, ground - 2)
  }
}

/**
 * The queue, in the sky's left corner: the agents that wait, each its own mini in its own colours
 * on a cloud, as many as fit before `to`; then, only if some did not fit, "+" and how many those
 * are. `feet` is the row under their feet. Returns the column it ends at.
 */
function drawQueue(canvas: Canvas, miniOf: MiniOf, queued: readonly Agent[], to: number, isLight: boolean, feet: number): number {
  const cloud = (isLight ? HI.cloudDay : HI.cloud)[1]!
  if (queued.length === 0) return 0
  const waiting = queued.map(agent => miniOf(agent.slot, formIn(agent)).poses.stand[0]!)
  const countOf = (rest: number) => (rest === 0 ? 0 : 8 + 8 * String(rest).length)
  let [shown, x] = [0, 1]
  for (const one of waiting) {
    const wide = one.px[0]!.length + 2
    if (x + wide + countOf(queued.length - shown - 1) + 2 > to) break
    paint(canvas, cloud, x + ((wide - cloud[0]!.length) >> 1), feet - 2)
    stand(canvas, one, x + 1 + one.ax, feet)
    x += wide
    shown += 1
  }
  if (shown < queued.length) {
    paint(canvas, HI.plus, x + 1, feet - 11)
    x += 8
    for (const digit of String(queued.length - shown)) {
      paint(canvas, HI.digits[Number(digit)]!, x, feet - 11)
      x += 8
    }
  }

  return x + 2
}

/**
 * One frame of the stage, `width` by `height` art pixels, clear where nothing is drawn. The minis
 * stand on the ground, each in its zone; the sky above them holds the queue, the clouds and, while
 * two or more agents are at it, the enemy they fight: a call that ends well throws a star at it, an
 * agent that finishes pops it with one, and a call that fails is its dive at that agent's mini.
 * On a light theme (`isLight`) the sky is a day's: white clouds, sparkles for stars.
 */
export function stageFrame(miniOf: MiniOf, agents: readonly Agent[], now: number, width: number, height: number, isLight = false): Canvas {
  const canvas = blank(width, height)
  const ground = height - GROUND_PX
  const { roles, queued } = castOf(agents, now, width)
  const was = castOf(agents, now - FRAME_MS, width).roles

  // The enemy: there once the second of those on stage has landed, away for a while after a pop.
  // An agent that finishes throws its star first: the pop is when that lands.
  const present = roles.filter(role => role.leaving < 0)
  const battle = present.map(role => role.age).sort((a, b) => b - a)[1] ?? -1
  const pop = Math.min(Infinity, ...agents.filter(a => a.isLost !== true).map(a => since(a.doneAt, now) - SHOT_MS).filter(ms => ms >= 0))
  const flown = Math.min(battle - ENTER_MS, pop - RESPAWN_MS)
  const isPopping = pop < 600 && battle >= ENTER_MS + FLY_MS
  const hasEnemy = present.length > 1 && (flown >= 0 || isPopping)
  // Its fight called off, one of two stopped short: it flies off as that one goes.
  const off = present.length === 1 ? Math.min(Infinity, ...roles.filter(role => role.agent.isLost === true && role.leaving >= 0).map(role => role.leaving)) : Infinity
  const isUp = hasEnemy && flown >= FLY_MS
  const hit = isUp ? Math.min(Infinity, ...present.filter(role => role.agent.doneAt === undefined).map(role => since(role.agent.hitAt, now))) : Infinity
  const hover = [width - 12 + Math.round(2 * wave(now, 2600)), 18 + Math.round(2 * wave(now, 14 * FRAME_MS))] as const
  const enemyX = hover[0] + (isPopping ? 0 : Math.round(30 * (1 - unit(flown / FLY_MS)) ** 2))

  // The scenery first, in the sky the queue and the enemy leave it; the queue is drawn over it.
  const skyEnd = present.length > 1 || off < FLY_MS ? width - ENEMY_ROOM : width
  // The queue stands at the foot of the sky, its clouds' two rows under it: a picture STAGE_PX tall holds the tallest mini there, whole.
  const feet = ground - REACH_PX - QUEUE_DROP
  drawScenery(canvas, now, ground, [queued.length === 0 ? 0 : drawQueue(blank(width, 1), miniOf, queued, skyEnd, isLight, feet), skyEnd], isLight)
  drawQueue(canvas, miniOf, queued, skyEnd, isLight, feet)

  let strike: { x: number; age: number } | undefined
  for (const { agent, zone, age, leaving } of roles) {
    const act = actOf(agent, now)
    const old = was.find(role => role.agent === agent)?.zone ?? zone
    const moved = zone[0] + zone[1] - old[0] - old[1]
    const isBusy = act === 'hurt' || act === 'dance' || act === 'faint'
    const set = miniOf(agent.slot, formIn(agent))
    const part: Part = leaving >= 0 ? 'exit' : age < ENTER_MS ? 'arrive' : moved !== 0 && !isBusy ? 'walk' : act
    const lasted = part === 'exit' ? leaving : part === 'arrive' ? age : part === 'walk' ? moved : since(act === 'hurt' ? agent.hurtAt : agent.doneAt, now)
    const x = drawMini(canvas, set, agent, part, act, now, lasted, zone, ground, now - age + ENTER_MS, isLight)
    if (part === 'hurt' && (strike === undefined || lasted < strike.age)) strike = { x, age: lasted }
    // A call that ended well, or the agent's whole task: a star thrown in an arc at the enemy, which flinches, or pops, as it lands.
    const thrown = Math.min(since(agent.hitAt, now), agent.isLost === true ? Infinity : since(agent.doneAt, now))
    if (isUp && thrown < SHOT_MS && leaving < 0) {
      const at = (u: number) => [x + (enemyX - x) * u, ground - 20 + (hover[1] - 8 - ground + 20) * u - 8 * arc(u)] as const
      const u = thrown / SHOT_MS
      const shot = HI.shot[Math.floor(now / FRAME_MS) % HI.shot.length]!
      if (u > 0.15) stand(canvas, { ...HI.glint, px: pixelsByDay(HI.glint.px, isLight) }, ...at(u - 0.15))
      stand(canvas, { ...shot, px: pixelsByDay(shot.px, isLight) }, at(u)[0], at(u)[1] + 5)
    }
  }

  // The enemy last, over all: a failed call is its doing. It dives at that mini from its corner (from
  // off stage where it has none), lands the knock, and climbs back.
  if (strike !== undefined && strike.age < DIVE_MS + RISE_MS && !isPopping) {
    const perch = hasEnemy ? [enemyX, hover[1]] as const : [width + 14, 10] as const
    const u = strike.age < DIVE_MS ? (strike.age / DIVE_MS) ** 2 : 1 - ease((strike.age - DIVE_MS) / RISE_MS)
    drawEnemy(canvas, perch[0] + (strike.x + 9 - perch[0]) * u, perch[1] + (ground - 13 - perch[1]) * u, now, false, Infinity)
  } else if (hasEnemy) drawEnemy(canvas, enemyX, hover[1], now, hit >= SHOT_MS && hit < SHOT_MS + 200, isPopping ? pop : Infinity)
  else if (off < FLY_MS && pop >= RESPAWN_MS + FLY_MS) drawEnemy(canvas, hover[0] + Math.round(30 * (off / FLY_MS) ** 2), hover[1], now, false, Infinity)

  return canvas
}
