// Loadout's contract: the types of its three parts (avatar, flow, frames) and every value it keeps in $.state.

// ── avatar ──
export type KirbyHudLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type KirbyHudUsage = {
  /** When the session began, in the clock's milliseconds; absent while nobody told. */
  startedAt?: number
  usd?: number
  limits: KirbyHudLimit[]
  tokens?: number
  window: number
  percent?: number
}

/** A tool call that is running: its id, tool and what it is about. */
export type KirbyHudCall = { id: string; tool: string; summary: string }

/**
 * A subagent on stage: its loop's id, its task, the colour slot it keeps for life, its running
 * calls (oldest first) and when it was last heard. Then when it was first heard, and, each absent
 * until it happens: when a call of its last failed, when one last ended well, and when it ended
 * (it leaves a little later), `isLost` when that end was no answer: an interrupt, a refusal, an error.
 * `turnedAt` is when what it does last changed (a call began, its newest ended, it ended) and
 * `wasTool` the tool it ran until then, absent for none: its mini moves on from where that left it.
 * `model` is what it runs on, where its spawn told: its mini wears that model's form.
 */
export type KirbyHudHelper = {
  id: string
  label: string
  slot: number
  calls: KirbyHudCall[]
  seenAt: number
  joinedAt?: number
  hurtAt?: number
  hitAt?: number
  doneAt?: number
  isLost?: boolean
  turnedAt?: number
  wasTool?: string
  model?: string
}

// ── flow ──
export type AgentStatus = 'queued' | 'running' | 'done' | 'failed'

/** One tool call in flight: its id, the tool, a short summary of its input, when it started. */
export type Call = { id: string; tool: string; what: string; at: number }
/** One tool call that ended: the tool, its summary, how long it took, whether it failed. */
export type Done = { tool: string; what: string; ms: number; failed: boolean }
/**
 * One agent() call site of a run's script: the phase it belongs to ('' when the script names none there) and
 * what its label and prompt read, the holes of a template literal as \u0000. See lib's parseSites.
 */
export type Site = { phase: string; label: string; prompt: string }

export type Agent = {
  /** Unique in the run: the spawn's agentIndex and when it was raised. */
  key: string
  /** agentIndex: the agent's place among the run's agent() calls, from 1. */
  n: number
  /** The loop's agentId once started, '' before. */
  id: string
  label: string
  model: string
  status: AgentStatus
  startedAt: number
  endedAt: number
  tools: number
  /** The tool calls running now, oldest first; the last one is the one shown. */
  calls: Call[]
  /** Which box of the diagram it sits in, from 0: see nextPhase. */
  phase: number
  tokIn: number
  tokOut: number
  /** The last tool calls that ended, oldest first, at most 5: what an expanded row lists. */
  log: Done[]
  /** The last message the person sent it from the pane, '' when none was delivered. */
  steer: string
  /** The tokens its model requests counted since its last turn ended: what that turn's own total must not count twice. */
  stepIn: number
  stepOut: number
  /** A plain subagent only (one started outside a workflow): its type, as agent.spawn's subagentType gives it, or "fork". */
  kind?: string
  /** A plain subagent only: when its last tool call ended and whether that call failed (the card's flash). */
  flashAt?: number
  flashBad?: boolean
  /** A plain subagent only: it ended by an interruption, not by an answer or an error. */
  stopped?: boolean
}

export type Run = {
  /** The run's id (wf_...), '' until the Workflow call answered. */
  id: string
  /** The Workflow tool call that started it. */
  callId: string
  taskId: string
  name: string
  /** Phase titles in order: the script's meta.phases, then each title a phase() call adds as an agent lands in it. */
  phases: string[]
  /** The script's agent() call sites, by which an agent is put in its phase. */
  sites: Site[]
  /** When the person confirmed a stop from the pane, 0 when they did not. */
  stop: number
  startedAt: number
  endedAt: number | null
  /** '' while running; then completed, failed, killed, ended, remote, not started. */
  outcome: string
  spawned: number
  done: number
  failed: number
  /** Summed duration of the agents that answered: the ETA's mean. */
  doneMs: number
  tokIn: number
  tokOut: number
  agents: Agent[]
}

export type StepStatus = 'pending' | 'active' | 'done' | 'blocked'
export type Step = { label: string; status: StepStatus }
export type Plan = { title: string; steps: Step[] }
/**
 * What the person chose in the pane: the runs whose finished agents are
 * folded, the selected agent's key, the agents expanded, the footer's mode (with the agent or run it is about
 * and when it was armed), whether the pane is folded to its tab, the dock width last asked for (0: the default),
 * and the width the pane had when it was asked and when (0: no ask to check).
 */
export type View = {
  folded: string[]
  sel: string; open: string[]
  mode: '' | 'steer' | 'confirm'; target: string; at: number
  hidden: boolean; cols: number; colsFrom: number; colsAt: number
}
/** Past durations by name, [how many, their summed ms]: "a:<agent label>" and "p:<run name>/<phase title>". */
export type History = Record<string, [number, number]>

export type TicketType = 'research' | 'grilling' | 'prototype' | 'task' | 'other'
/** resolved; claimed (where we are); frontier (open, nothing in its way); blocked. */
export type TicketState = 'resolved' | 'claimed' | 'frontier' | 'blocked'
export type Ticket = {
  /** The NN of issues/NN-slug.md. */
  n: number
  title: string
  type: TicketType
  state: TicketState
  /** Its GitLab issue number from gitlab.json, null without one. */
  iid: number | null
  /** What still blocks it, by name: a ticket's title, "#NN ?" for a number with no file, or the outside blocker's text. */
  blockers: string[]
}
/** One wayfinder effort as its files read: .scratch/<effort>/map.md, issues/ and gitlab.json. */
export type Chart = {
  effort: string
  title: string
  /** The Destination section's first sentence. */
  destination: string
  /** The map's own GitLab issue, null without gitlab.json. */
  carte: number | null
  tickets: Ticket[]
  /** Bullets under "Decisions so far". */
  decisions: number
  /** The bullets under "Not yet specified" and "Out of scope", each cut to its lead. */
  fog: string[]
  out: string[]
  /** Ticket files that could not be read or have no title. */
  unreadable: number
}
/** The chart drawn, where it was read, the efforts beside it, and the listing it was read at (names, sizes, times). */
export type WayMap = Chart & { scratch: string; efforts: string[]; sig: string }
/**
 * Wayfinder in this session: on once the skill was used; the .scratch directory and effort its file
 * calls last touched; the effort the person picked in the pane; a /wayfinder argument not yet matched
 * to an effort; the sections open in the pane (done, fog, out).
 */
export type Way = { active: boolean; root: string; touched: string; chosen: string; hint: string; open: string[] }

// ── Theme packs: ../themes/<slug>.json as the pane reads them (hooks/palette.ts parses, ../THEMES.md explains) ──

/** The handoff's tokens: text2..4 are text-2..4, cardBorder card-border, railDone rail-done, railRun rail-run, tabActive tab-active. */
export type Palette = {
  bg: string; page: string; fg: string; text2: string; text3: string; text4: string
  border: string; cardBorder: string; track: string; select: string
  cyan: string; green: string; yellow: string; orange: string; red: string; blue: string; violet: string
  railDone: string; railRun: string; tabActive: string
}

export type Token = keyof Palette
export type StepStatusName = StepStatus
/** One state of a step: its node, the node's and the label's colours, its rail (path layout) or left edge (list layout), its row's ground. */
export type StepState = {
  glyph: string; color: Token; labelColor: Token; bold: boolean; strike: boolean
  rail: string; railColor: Token; edge: string; edgeColor: Token; ground: Token | null
}
/** How the Steps list and the wayfinder map are drawn: a pack's flow.steps, every optional field filled. */
export type StepsStyle = {
  header: { style: 'plain' | 'boxed' | 'banner' | 'bracketed'; prefix: string; color: Token; frame: Token; upper: boolean; corners: string }
  layout: 'path' | 'list'
  meter: { style: 'bar' | 'pips'; fill: string; empty: string }
  states: Record<StepStatusName, StepState>
  cycle: { glyphs: string[]; ms: number } | null
  captions: { title: string; active: string; blocked: string; optional: string; progress: string; idle: string }
}
/** The working line of a theme: the words it says in place of Claude Code's own, and its icon's frames, each shown for `ms`. */
export type Spinner = { verbs: string[]; frames: string[]; ms: number }
export type Pack = { slug: string; match: string[]; palette: Palette; steps: StepsStyle; spinner: Spinner | null }

// ── frames ──
export type ColorRowsKind = 'shell' | 'read' | 'edit' | 'web' | 'agent' | 'skill' | 'ask' | 'mcp' | 'other'

declare module 'claude-code' {
  interface PluginState {
    loadout: {
      // avatar
      usage: KirbyHudUsage | null
      model: string
      /** The theme this terminal shows: a live theme file's source, any other setting itself. */
      theme: string
      /** The theme setting this terminal paints from: its start's, which the settings file may have left behind. */
      painted: string
      calls: KirbyHudCall[]
      helpers: KirbyHudHelper[]
      isWorking: boolean
      happyUntil: number
      pets: number
      /** The pane's theme picker: open (one row per theme) or folded to one line. */
      isPicking: boolean
      // flow
      runs: Run[]; plan: Plan | null; now: number; view: View; way: Way; map: WayMap | null; hist: History; flowTheme: string; solo: Agent[]; packs: { sig: string; list: Pack[] }
      // frames
      isOn: boolean
      /** The working line's icon: beats counted while a turn runs. */
      spin: number
    }
  }
}
