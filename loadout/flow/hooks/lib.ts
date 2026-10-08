import type { Agent, Chart, History, Plan, Run, Site, Step, Ticket, TicketState, TicketType } from '../../types'

export const MAX_CALLS = 20

export const MAX_AGENTS = 200
export const KEEP_ENDED = 5
const STATUSES = ['pending', 'active', 'done', 'blocked'] as const

/**
 * Reads meta.name and the phase titles out of a workflow script's text.
 * ponytail: regex over source, not a parser; a `]` inside a phase string or a
 * computed meta fools it and the run then shows no phases. Parse properly if
 * that ever matters.
 */
export function parseMeta(script: string): { name?: string; phases: string[] } {
  const at = script.search(/\bmeta\s*=\s*\{/)
  if (at < 0) return { phases: [] }
  const meta = script.slice(at, at + 8000)
  let rest = meta
  let phases: string[] = []
  const open = meta.search(/\bphases\s*:\s*\[/)
  if (open >= 0) {
    const start = meta.indexOf('[', open)
    let depth = 0
    let end = meta.length
    for (let i = start; i < meta.length; i++) {
      if (meta[i] === '[') depth++
      else if (meta[i] === ']' && --depth === 0) {
        end = i
        break
      }
    }
    const body = meta.slice(start + 1, end)
    rest = meta.slice(0, open) + meta.slice(end)
    const titled = [...body.matchAll(/\b(?:title|name|label)\s*:\s*(['"`])((?:\\.|(?!\1).)*?)\1/g)]
    const plain = body.includes('{') ? [] : [...body.matchAll(/(['"`])((?:\\.|(?!\1).)*?)\1/g)]
    phases = (titled.length > 0 ? titled : plain).map(m => (m[2] ?? '').slice(0, 40)).slice(0, 12)
  }
  const name = rest.match(/\bname\s*:\s*(['"`])((?:\\.|(?!\1).)*?)\1/)?.[2]
  return name === undefined ? { phases } : { name: name.slice(0, 60), phases }
}

/** The model's input for the steps tool, checked: a Plan, or why it is not one. */
export function toPlan(input: Record<string, unknown>): Plan | string {
  const { title, steps } = input
  if (typeof title !== 'string' || !Array.isArray(steps) || steps.length === 0) {
    return 'steps: pass { title: string, steps: [{ label, status }] } with at least one step.'
  }
  const out: Step[] = []
  for (const one of steps.slice(0, 50) as unknown[]) {
    const { label, status } = (one ?? {}) as Record<string, unknown>
    const known = STATUSES.find(s => s === status)
    if (typeof label !== 'string' || known === undefined) {
      return `steps: each step is { label: string, status: ${STATUSES.join(' | ')} }.`
    }
    out.push({ label: label.slice(0, 120), status: known })
  }
  return { title: title.slice(0, 80), steps: out }
}

/**
 * A run's phase titles once its script's meta is read (again, on a resume): the declared ones in their places, then
 * what the run holds past them (a title a phase() call added).
 * ponytail: by position. A resume whose script reorders the phases shows the agents already seated under the
 * titles now at their old places; seat by title if scripts ever do that.
 */
export const declared = (meta: string[], held: string[]): string[] => (meta.length === 0 ? held : [...meta, ...held.slice(meta.length)])

export const newRun = (seed: Pick<Run, 'callId' | 'name' | 'phases' | 'startedAt'> & { id?: string; sites?: Site[] }): Run => ({
  id: '', taskId: '', endedAt: null, outcome: '', sites: [], stop: 0,
  spawned: 0, done: 0, failed: 0, doneMs: 0, tokIn: 0, tokOut: 0, agents: [],
  ...seed,
})

/** Every live run, and the last KEEP_ENDED that ended: what a resume or a late notification still finds. */
export function keepRuns(list: Run[]): Run[] {
  const ended = list.filter(r => r.endedAt !== null).slice(-KEEP_ENDED)
  return list.filter(r => r.endedAt === null || ended.includes(r))
}

/** At most MAX_AGENTS rows, the oldest finished dropped first (the run's counters keep them). */
export function capAgents(agents: Agent[]): Agent[] {
  let extra = agents.length - MAX_AGENTS
  if (extra <= 0) return agents
  return agents.filter(a => !((a.status === 'done' || a.status === 'failed') && extra-- > 0)).slice(-MAX_AGENTS)
}

export function dur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export function tok(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

export const fit = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, Math.max(1, n - 1))}…`)

// The kinds of the color-rows mod, so a call is classed the same in both; the pane colours them from its palette.
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

/** A tool's short name: an MCP tool's last part. */
export const toolName = (tool: string): string => (tool.startsWith('mcp__') ? tool.split('__').pop() || tool : tool)

const PATHS = ['file_path', 'notebook_path', 'path']
const WHAT = ['command', ...PATHS, 'pattern', 'query', 'url', 'description', 'skill', 'prompt']

/** A call's input in a few words: its command, file, pattern... '' when it has none of them. */
export function gist(input: Record<string, unknown>): string {
  const key = WHAT.find(k => typeof input[k] === 'string' && input[k] !== '')
  if (key === undefined) return ''
  const text = String(input[key]).replace(/\s+/g, ' ').trim()
  return (PATHS.includes(key) ? text.split('/').slice(-2).join('/') : text).slice(0, 80)
}

/** An agent as this version writes it: one kept in $.state by an earlier load has no calls, phase, log, steer or step counts. */
export const heal = (a: Agent): Agent => ({ ...a, calls: a.calls ?? [], phase: a.phase ?? 0, log: a.log ?? [], steer: a.steer ?? '', stepIn: a.stepIn ?? 0, stepOut: a.stepOut ?? 0 })
/** A run as this version writes it, its agents healed. */
export const healRun = (r: Run): Run => ({ ...r, sites: r.sites ?? [], stop: r.stop ?? 0, agents: r.agents.map(heal) })

export const isOver = (a: Agent): boolean => a.status === 'done' || a.status === 'failed'

/**
 * The diagram box a new agent goes in.
 * ponytail: no event names an agent's phase, so a box is a wave: agents that
 * overlap in time share one, and an agent started once every earlier one has
 * finished opens the next. A phase that runs its agents one after the other
 * therefore spreads over several boxes. Use the real phase if the engine ever
 * puts it on agent.spawn.
 */
export function nextPhase(agents: Agent[]): number {
  const all = agents.map(heal)
  const top = Math.max(-1, ...all.map(a => a.phase))
  return all.some(a => !isOver(a)) ? Math.max(top, 0) : top + 1
}

/**
 * A run as it reads once over: an agent that never reported its end (a cloud
 * agent, one cut with its run) took the run's, done if the run completed and
 * failed otherwise. Derived, so a later outcome is read again.
 */
export function settled(run: Run): Run {
  const at = run.endedAt
  const open = run.agents.filter(a => !isOver(a)).length
  if (at === null || open === 0) return run
  const isDone = run.outcome === 'completed'
  return {
    ...run,
    done: run.done + (isDone ? open : 0),
    failed: run.failed + (isDone ? 0 : open),
    agents: run.agents.map(a => (isOver(a) ? a : { ...a, status: isDone ? 'done' : 'failed', endedAt: Math.max(at, a.startedAt), calls: [] })),
  }
}

/**
 * A run's agents and counters with one more asked for. A script that starts
 * over (a resume) raises again, under the same agentIndex, the agents that did
 * not finish: such an agent takes the failed one's row and box.
 * ponytail: matched on agentIndex alone; if a child workflow() ever reuses its
 * parent's indexes, a failed parent agent would be replaced by a child's.
 */
export function enlist(run: Run, agent: Agent, prompt = ''): Pick<Run, 'agents' | 'spawned' | 'failed' | 'phases'> {
  const stale = run.agents.find(a => a.n === agent.n && a.status === 'failed')
  if (stale === undefined) {
    const seat = seatOf(run, agent.label, prompt)
    return { spawned: run.spawned + 1, failed: run.failed, phases: seat?.phases ?? run.phases, agents: capAgents([...run.agents, { ...agent, phase: seat?.phase ?? nextPhase(run.agents) }]) }
  }
  return { spawned: run.spawned, failed: Math.max(0, run.failed - 1), phases: run.phases, agents: run.agents.map(a => (a === stale ? { ...agent, phase: heal(stale).phase } : a)) }
}

// ── Which phase an agent belongs to, read from the script ──

const ESCAPES: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r' }

/** The string or template literal that starts at `i` (after blanks): its text, each ${...} hole as \u0000, and where it ends. */
function literalAt(src: string, i: number): { text: string; end: number } | undefined {
  while (/\s/.test(src[i] ?? '')) i++
  const quote = src[i]
  if (quote !== "'" && quote !== '"' && quote !== '`') return undefined
  let text = ''
  for (let j = i + 1; j < src.length; j++) {
    const ch = src[j] ?? ''
    if (ch === '\\') {
      const next = src[++j] ?? ''
      text += ESCAPES[next] ?? next
    } else if (ch === quote) return { text, end: j + 1 }
    else if (quote === '`' && ch === '$' && src[j + 1] === '{') {
      let depth = 0
      for (j++; j < src.length; j++) {
        if (src[j] === '{') depth++
        else if (src[j] === '}' && --depth === 0) break
      }
      text += '\u0000'
    } else text += ch
  }
  return undefined
}

/** Where the call opened just before `open` closes: its `)`, strings skipped; the script's end when it never does. */
function closeOf(src: string, open: number): number {
  let depth = 1
  for (let i = open; i < src.length; i++) {
    const ch = src[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const lit = literalAt(src, i)
      if (lit === undefined) break
      i = lit.end - 1
    } else if (ch === '(') depth++
    else if (ch === ')' && --depth === 0) return i
  }
  return src.length
}

/**
 * The agent() call sites of a workflow script, in source order, each with the phase it runs under:
 * its own `phase: '...'` option, else the title of the last phase('...') call written above it.
 * ponytail: read off the source text, not run. Source order is not run order, so an agent() inside a
 * helper function written above the phase() that precedes its call gets the wrong phase or none; a
 * phase or label computed at run time (a variable, a call) is unknown; "agent(" or "phase(" inside a
 * comment or a string is taken for a call. An agent no site matches falls back to nextPhase's waves.
 */
export function parseSites(script: string): Site[] {
  const src = script.slice(0, 200_000)
  const sites: Site[] = []
  let current = ''
  const calls = /(?<![.\w$])(agent|phase)\s*\(/g
  for (let m = calls.exec(src); m !== null && sites.length < 80; m = calls.exec(src)) {
    const open = m.index + m[0].length
    const first = literalAt(src, open)
    if (m[1] === 'phase') {
      current = first === undefined || first.text.includes('\u0000') ? '' : first.text.slice(0, 40)
      continue
    }
    const rest = src.slice(first?.end ?? open, closeOf(src, open))
    const option = (name: string) => {
      const at = rest.search(new RegExp(`\\b${name}\\s*:\\s*['"\`]`))
      return at < 0 ? undefined : literalAt(rest, rest.indexOf(':', at) + 1)?.text
    }
    const own = option('phase')
    sites.push({
      phase: own === undefined ? current : own.includes('\u0000') ? '' : own.slice(0, 40),
      label: (option('label') ?? '').slice(0, 120),
      prompt: (first?.text ?? '').slice(0, 200),
    })
  }
  return sites
}

/** How well `text` is the pattern (literal text, \u0000 for each hole): the literal characters matched, -1 for no match. */
function fits(pattern: string, text: string): number {
  if (pattern === '') return -1
  const parts = pattern.split('\u0000')
  const [head = '', tail = ''] = [parts[0], parts[parts.length - 1]]
  if (parts.length === 1) return text === head ? head.length : -1
  if (!text.startsWith(head) || !text.endsWith(tail) || text.length < head.length + tail.length) return -1
  let at = head.length
  for (const part of parts.slice(1, -1)) {
    const found = text.indexOf(part, at)
    if (found < 0) return -1
    at = found + part.length
  }
  return pattern.length - (parts.length - 1)
}

/**
 * The phase a new agent sits in, by the script's call sites: the site whose label reads as the spawn's
 * description, else the one whose prompt opens as the spawn's prompt does (or as its description, which
 * the engine cuts from the prompt when the call gives no label). Null when no site says: see parseSites.
 * A title the script uses twice (review, polish, review) is the first of its phases not yet passed; one
 * meta.phases does not list gets a phase of its own at the end, as the engine's own display groups it.
 */
export function seatOf(run: Run, description: string, prompt: string): { phase: number; phases: string[] } | null {
  const said = description.replace(/(…|\.\.\.)$/, '').trim()
  let best = 0
  let titles: string[] = []
  for (const site of run.sites ?? []) {
    const head = site.prompt.split('\u0000')[0] ?? ''
    const score = Math.max(
      fits(site.label, description) >= 0 ? 1000 + fits(site.label, description) : 0,
      head.length >= 12 && prompt.startsWith(head) ? head.length : 0,
      site.label === '' && said.length >= 8 && head.startsWith(said) ? said.length : 0,
    )
    if (score === 0 || score < best) continue
    titles = score > best ? [site.phase] : [...titles, site.phase]
    best = score
  }
  // The best match with no phase known (a computed title) says nothing: better the waves than a worse match's phase.
  titles = titles.filter(title => title !== '')
  if (titles.length === 0) return null
  const top = Math.max(-1, ...run.agents.map(a => heal(a).phase))
  const seats = run.phases.flatMap((title, i) => (titles.includes(title) ? [i] : []))
  const phase = seats.find(i => i >= top) ?? seats[seats.length - 1]
  if (phase !== undefined) return { phase, phases: run.phases }
  return run.phases.length >= 24 ? null : { phase: run.phases.length, phases: [...run.phases, titles[0] ?? ''] }
}

/** How long a finished run's diagram stays on screen when no run starts after it. */
export const RUN_LINGER_MS = 180_000

/**
 * The finished run still on screen at `t`: the last one to end, in its final state, until a run starts after it
 * (`begunAt`: when the last run started or was resumed) or RUN_LINGER_MS pass. A run that never started is not one.
 */
export function lingering(runs: readonly Run[], t: number, begunAt: number): Run | undefined {
  let last: Run | undefined
  for (const r of runs) if (r.endedAt !== null && r.outcome !== 'not started' && r.endedAt >= (last?.endedAt ?? -Infinity)) last = r
  const at = last?.endedAt ?? null
  return at !== null && begunAt <= at && t - at < RUN_LINGER_MS ? last : undefined
}

// ── History: how long an agent of that name, a phase of that title, took before ──

/** An agent label as history keys it: lowercase, each number as '#', so "polish:round-2" finds "polish:round-1". */
export const histKey = (label: string): string => label.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 80)
export const phaseKey = (run: string, title: string): string => `p:${histKey(run)}/${histKey(title)}`

export function meanOf(h: History, key: string): number | null {
  const one = h[key]
  return one !== undefined && one[0] > 0 ? one[1] / one[0] : null
}

/** History with one more duration under `key`; past 400 names the oldest 100 go. */
export function noted(h: History, key: string, ms: number): History {
  const [n, sum] = h[key] ?? [0, 0]
  const next = { ...h, [key]: [n + 1, sum + Math.max(0, Math.round(ms))] as [number, number] }
  const keys = Object.keys(next)
  return keys.length <= 400 ? next : Object.fromEntries(keys.slice(100).map(k => [k, next[k] ?? [0, 0]]))
}

/** What was read from $.store as a History: anything that is not one is empty. */
export function toHistory(value: unknown): History {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const out: History = {}
  for (const [k, v] of Object.entries(value)) {
    if (Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number' && v[0] > 0) out[k] = [v[0], v[1]]
  }
  return out
}

// ── The run as the pane draws it: each agent's progress, each phase's status, the whole run's ETA ──

export type AgentView = {
  a: Agent
  state: 'done' | 'run' | 'stop' | 'pend'
  /** How long it has run, or ran. */
  el: number
  /** The mean duration of past agents of its name, else of this run's finished agents; null with neither. */
  est: number | null
  /** 0..1; null while it runs with no estimate: the bar is indeterminate. */
  prog: number | null
  /** What is left of the estimate; null when there is none. */
  rem: number | null
  /** By how much it is past its estimate, 0 when it is not. */
  over: number
}
export type PhaseStatus = 'done' | 'run' | 'stop' | 'pend' | 'hold'
export type PhaseView = { index: number; title: string; status: PhaseStatus; agents: AgentView[]; el: number; rem: number | null; word: string }
export type RunView = {
  run: Run
  phases: PhaseView[]
  /** The clock the run is read at: now, or when it ended. */
  t: number
  /** 0..1: the mean over the phases of their agents' mean progress (a phase not started is 0). */
  pct: number
  /** The remaining time that is known, and whether some of it is not (an agent or phase with no history). */
  eta: number
  isOpen: boolean
  /** Stopped or failed for good: the phases not reached are on hold. */
  isHeld: boolean
  /** The index of the phase running now (else of the next one); -1 when none is left or the run is over. */
  at: number
}

export function agentView(run: Run, a: Agent, t: number, h: History): AgentView {
  const state = a.status === 'done' ? 'done' : a.status === 'failed' ? 'stop' : a.status === 'running' ? 'run' : 'pend'
  const est = meanOf(h, `a:${histKey(a.label)}`) ?? (run.done > 0 ? run.doneMs / run.done : null)
  const el = state === 'pend' ? 0 : Math.max(0, (state === 'run' ? t : a.endedAt) - a.startedAt)
  const part = est === null || est <= 0 ? null : Math.min(0.99, el / est)
  return {
    a, state, el, est,
    prog: state === 'done' ? 1 : state === 'pend' ? 0 : state === 'stop' ? part ?? 0 : part,
    rem: state === 'done' || state === 'stop' ? 0 : est === null ? null : state === 'pend' ? est : Math.max(0, est - el),
    over: state === 'run' && est !== null && el > est ? el - est : 0,
  }
}

/**
 * How long the spans cover, each counted once where they overlap: a phase's own time. Not first start to last end:
 * a phase the script comes back to (review, polish, review) or a run resumed hours later would count the time between.
 */
export function busy(spans: readonly (readonly [number, number])[]): number {
  let sum = 0
  let end = -Infinity
  for (const [from, to] of [...spans].sort((a, b) => a[0] - b[0])) {
    if (to <= end) continue
    sum += to - Math.max(from, end)
    end = to
  }
  return sum
}

/** The run's phases in order (the declared ones, and one more per wave past them), as the handoff's "State & data" reads them. */
export function runView(run: Run, now: number, h: History): RunView {
  const t = run.endedAt ?? Math.max(now, run.startedAt)
  const isOver = run.endedAt !== null
  const isHeld = (run.stop ?? 0) > 0 || (isOver && (run.outcome === 'killed' || run.outcome === 'failed'))
  const top = Math.max(-1, ...run.agents.map(a => a.phase))
  const phases = Array.from({ length: Math.max(run.phases.length, top + 1) }, (_, index): PhaseView => {
    const title = run.phases[index] ?? `stage ${index + 1}`
    const agents = run.agents.filter(a => a.phase === index).map(a => agentView(run, a, t, h))
    const live = agents.filter(v => v.state !== 'pend')
    const el = busy(live.map(v => [v.a.startedAt, Math.max(v.a.startedAt, Math.min(t, v.state === 'run' ? t : v.a.endedAt))]))
    const est = meanOf(h, phaseKey(run.name, title))
    const status: PhaseStatus = agents.some(v => v.state === 'run' || v.state === 'pend') ? 'run'
      : agents.some(v => v.state === 'stop') ? 'stop'
        : agents.length > 0 || index < top ? 'done'
          : isHeld ? 'hold' : 'pend'
    const rems = agents.map(v => v.rem)
    const rem = status === 'run' ? (rems.some(r => r === null) ? null : Math.max(0, ...rems.map(r => r ?? 0))) : status === 'pend' ? est : 0
    const word = status === 'done' || status === 'run' ? dur(el)
      : status === 'stop' ? (isHeld ? 'stopped' : 'failed')
        : status === 'hold' ? 'on hold'
          : isOver ? (run.outcome === 'completed' ? 'skipped' : '') : est === null ? '' : `~${dur(est)}`
    return { index, title, status, agents, el, rem, word }
  })
  const ahead = isOver || isHeld ? [] : phases.filter(p => p.status === 'run' || p.status === 'pend')
  const share = (p: PhaseView) => (p.status === 'done' ? 1 : p.agents.length === 0 ? 0 : p.agents.reduce((sum, v) => sum + (v.prog ?? 0), 0) / p.agents.length)
  return {
    run, phases, t, isHeld,
    pct: run.outcome === 'completed' ? 1 : phases.length === 0 ? 0 : phases.reduce((sum, p) => sum + share(p), 0) / phases.length,
    eta: ahead.reduce((sum, p) => sum + (p.rem ?? 0), 0),
    isOpen: ahead.some(p => p.rem === null),
    at: isOver ? -1 : (phases.find(p => p.status === 'run') ?? phases.find(p => p.status === 'pend'))?.index ?? -1,
  }
}

// ── What a running agent is doing, in the handoff's words ──

const FILE_TOOLS = ['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'NotebookRead']
const VERBS: Readonly<Record<string, string>> = {
  Read: 'reading', NotebookRead: 'reading', LS: 'listing', Grep: 'searching', Glob: 'searching', ToolSearch: 'searching', WebSearch: 'searching',
  Edit: 'editing', MultiEdit: 'editing', NotebookEdit: 'editing', Write: 'writing', WebFetch: 'fetching', Skill: 'loading', AskUserQuestion: 'asking',
}

/** The handoff's verb for a tool: reading, searching, editing, writing, running; "calling" for one it does not name. */
export const verbOf = (tool: string): string =>
  (Object.hasOwn(VERBS, tool) ? VERBS[tool] : undefined) ?? (kindOf(tool) === 'shell' ? 'running' : kindOf(tool) === 'agent' ? 'spawning' : 'calling')

/** What the verb is about: a file tool's file name, any other tool's command, pattern or summary, and the tool's own name with none. */
export const targetOf = (tool: string, what: string): string =>
  what === '' ? toolName(tool) : FILE_TOOLS.includes(tool) ? what.split('/').pop() || what : what

/** A call's summary for the pane: gist's, but a search by its pattern, not the directory it looks in. */
export const brief = (tool: string, input: Record<string, unknown>): string =>
  (tool === 'Grep' || tool === 'Glob') && typeof input.pattern === 'string' && input.pattern !== '' ? gist({ pattern: input.pattern }) : gist(input)

/** A short duration: tenths of a second under ten seconds, then as dur. */
export const brisk = (ms: number): string => (ms < 10_000 ? `${(Math.max(0, ms) / 1000).toFixed(1)}s` : dur(ms))

// ── Wayfinder: the map of an effort, read from .scratch/<effort>/ ──

/** A skill or command name that is wayfinder, bare or under its plugin's prefix. */
export const isWayfinder = (name: unknown): boolean => typeof name === 'string' && /(^|[:/])wayfinder$/i.test(name.trim())

/** The .scratch directory and the effort a path is under, null for any other path. */
export function scratchOf(path: string): { root: string; effort: string } | null {
  const m = path.replace(/\\/g, '/').match(/^(.*\/)?\.scratch\/([^/]+)(?:\/|$)/)
  const effort = m?.[2]
  return effort === undefined ? null : { root: `${m?.[1] ?? ''}.scratch`, effort }
}

/** Markdown down to its words: comments, links, emphasis and code marks removed. */
const plain = (s: string): string =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim()

/** A list split on the commas outside brackets: "10 (a, b), 25" is two entries. */
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  return [...out, cur].map(x => x.trim()).filter(x => x !== '')
}

const TYPES = ['research', 'grilling', 'prototype', 'task'] as const

export type RawTicket = { n: number; title: string; type: TicketType; status: 'open' | 'claimed' | 'resolved'; blockedBy: string[] }

/**
 * One issues/NN-slug.md: its number from the file name, its title from the
 * first line, and the header lines above the first "## " section. Null when
 * the name has no number or the file no "# title": not a ticket that can be shown.
 * A file with no Status line is open, as the skill writes a new ticket.
 */
export function parseTicket(file: string, text: string): RawTicket | null {
  const n = file.match(/^(\d+)/)?.[1]
  const lines = text.split(/\r?\n/)
  const first = lines.findIndex(l => l.trim() !== '')
  const title = plain(lines[first]?.match(/^#\s+(.+)/)?.[1] ?? '')
  if (n === undefined || title === '') return null
  const head = new Map<string, string>()
  for (const l of lines.slice(first + 1)) {
    if (/^##\s/.test(l)) break
    const m = l.match(/^([\p{L} ]{2,30}?)\s*:\s*(.*)$/u)
    const key = m?.[1]?.toLowerCase()
    if (key !== undefined && !head.has(key)) head.set(key, (m?.[2] ?? '').trim())
  }
  const word = (head.get('type') ?? '').toLowerCase()
  const status = (head.get('status') ?? '').toLowerCase()
  return {
    n: Number(n),
    title: title.slice(0, 120),
    type: TYPES.find(t => word.startsWith(t)) ?? 'other',
    status: /^(resolved|closed|done)/.test(status) ? 'resolved' : status.startsWith('claimed') ? 'claimed' : 'open',
    blockedBy: splitTop(head.get('blocked by') ?? ''),
  }
}

/** A bullet's lead: its bold opening when it has one, else its first sentence. */
const lead = (item: string): string => plain(item.match(/^\*\*([\s\S]+?)\*\*/)?.[1] ?? item.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0] ?? item).slice(0, 100)

/**
 * map.md: its title, the Destination's first sentence, and the top-level
 * bullets of each "## " section by lowercased heading.
 * ponytail: a sentence ends at the first ". ", so an abbreviation ("sept. 2026")
 * cuts the destination short; it is a pane line, not a quote.
 */
export function parseMapDoc(text: string): { title: string; destination: string; bullets: (section: string) => string[] } {
  const lines = text.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)
  const title = plain(lines.find(l => /^#\s+\S/.test(l))?.replace(/^#\s+/, '') ?? '').replace(/^(carte|map)\s*[—–:-]\s*/i, '')
  const sections = new Map<string, string[]>()
  let cur: string[] | undefined
  for (const l of lines) {
    const h = l.match(/^##\s+(.+?)\s*$/)?.[1]
    if (h !== undefined) sections.set(h.toLowerCase(), (cur = []))
    else cur?.push(l)
  }
  const body = (section: string) => [...sections].find(([name]) => name.startsWith(section))?.[1] ?? []
  const bullets = (section: string) => {
    const items: string[] = []
    let isOpen = false
    for (const l of body(section)) {
      const b = l.match(/^[-*]\s+(.*)$/)?.[1]
      if (b !== undefined) {
        items.push(b)
        isOpen = true
      } else if (l.trim() === '') isOpen = false
      else if (isOpen && /^\s/.test(l)) items[items.length - 1] += ` ${l.trim()}`
    }
    return items
  }
  const dest = body('destination')
  const from = dest.findIndex(l => l.trim() !== '')
  const until = dest.findIndex((l, i) => i > from && l.trim() === '')
  const para = plain(from < 0 ? '' : dest.slice(from, until < 0 ? undefined : until).join(' '))
  return { title: title.slice(0, 120), destination: (para.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? para).slice(0, 200), bullets }
}

/** gitlab.json's mirror: the map's issue and each ticket's, by ticket number. Anything else in it is ignored. */
function parseGitlab(text: string | null): { carte: number | null; iid: Map<number, number> } {
  const iid = new Map<number, number>()
  let carte: number | null = null
  try {
    const json = JSON.parse(text ?? 'null') as { carte?: unknown; tickets?: unknown } | null
    if (typeof json?.carte === 'number') carte = json.carte
    for (const [nn, one] of Object.entries((json?.tickets ?? {}) as Record<string, { iid?: unknown } | null>)) {
      if (typeof one?.iid === 'number' && /^\d+$/.test(nn)) iid.set(Number(nn), one.iid)
    }
  } catch {
    // no mirror, or not JSON: the map shows without GitLab numbers
  }
  return { carte, iid }
}

/**
 * The effort as it stands in its files. A ticket is resolved or claimed as its
 * Status says; an open one is blocked while a numbered blocker is unresolved
 * (one with no file reads "#NN ?") or an outside, free-text blocker is named,
 * and on the frontier otherwise. Tickets come out in number order: the first
 * frontier one is what the skill takes next.
 */
export function chart(effort: string, mapText: string, issues: readonly { name: string; text: string | null }[], gitlab: string | null): Chart {
  const doc = parseMapDoc(mapText)
  const { carte, iid } = parseGitlab(gitlab)
  const raw = issues.map(f => (f.text === null ? null : parseTicket(f.name, f.text)))
  const read = raw.filter(t => t !== null).sort((a, b) => a.n - b.n)
  const byN = new Map(read.map(t => [t.n, t]))
  const tickets = read.map((t): Ticket => {
    const blockers = t.blockedBy.flatMap(entry => {
      const nn = entry.match(/^#?(\d{1,4})\s*(\(.*\))?$/)?.[1]
      if (nn === undefined) return [entry.slice(0, 100)]
      const other = byN.get(Number(nn))
      return other === undefined ? [`#${nn.padStart(2, '0')} ?`] : other.status === 'resolved' ? [] : [other.title]
    })
    const state: TicketState = t.status !== 'open' ? t.status : blockers.length > 0 ? 'blocked' : 'frontier'
    return { n: t.n, title: t.title, type: t.type, state, iid: iid.get(t.n) ?? null, blockers: t.status === 'open' ? blockers : [] }
  })
  return {
    effort,
    title: doc.title || effort,
    destination: doc.destination,
    carte,
    tickets,
    decisions: doc.bullets('decisions so far').length,
    fog: doc.bullets('not yet specified').slice(0, 60).map(lead),
    out: doc.bullets('out of scope').slice(0, 60).map(lead),
    unreadable: raw.length - read.length,
  }
}

/** The effort to show: the first wanted one that exists, else the one whose files changed last. */
export function pickEffort(efforts: readonly { name: string; mtimeMs: number }[], wanted: readonly string[]): string {
  const asked = wanted.find(w => efforts.some(e => e.name === w))
  if (asked !== undefined) return asked
  return [...efforts].sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name))[0]?.name ?? ''
}

export const inState = (c: Chart, state: TicketState): Ticket[] => c.tickets.filter(t => t.state === state)

// ── Plain subagents: agents started outside a workflow (the Agent tool, a fork, a background agent) ──

/** How long a card takes to come in, a finished tool call lights its border, a finished agent stays, and its row takes to go. */
export const ENTER_MS = 600
export const FLASH_MS = 450
export const LINGER_MS = 30_000
export const LEAVE_MS = 600
export const MAX_SOLO = 12
/** A running tool's highlight moves once per this, by TOOL_STEP cells: the rate the pane is drawn again at while a tool runs. */
export const TOOL_MS = 300
export const TOOL_STEP = 2
/** A plain subagent asked for and not started after this long is given up: its spawn never answered. */
export const QUEUE_MS = 120_000

export const soloAgent = (seed: Pick<Agent, 'key' | 'label' | 'startedAt'> & Partial<Agent>): Agent => ({
  n: 0, id: '', model: '', status: 'running', endedAt: 0, tools: 0, calls: [], phase: 0, tokIn: 0, tokOut: 0, log: [], steer: '', stepIn: 0, stepOut: 0, ...seed,
})

/** The list with one more, the oldest finished dropped first past MAX_SOLO. */
export function withSolo(list: Agent[], agent: Agent): Agent[] {
  let extra = list.length + 1 - MAX_SOLO
  return [...list.filter(a => !(isOver(a) && extra-- > 0)), agent].slice(-MAX_SOLO)
}

/** The plain subagents still shown at `t`: a finished one leaves LINGER_MS after its end. */
export const sweep = (list: Agent[], t: number): Agent[] => (list.some(a => isOver(a) && t - a.endedAt >= LINGER_MS) ? list.filter(a => !isOver(a) || t - a.endedAt < LINGER_MS) : list)

/** Whether a plain subagent is in one of its short transitions at `t`: coming in, flashing after a tool call or its end, or going. */
export const isMoving = (a: Agent, t: number): boolean =>
  isOver(a) ? t - a.endedAt < FLASH_MS || t - a.endedAt >= LINGER_MS - LEAVE_MS : t - a.startedAt < ENTER_MS || (a.flashAt !== undefined && t - a.flashAt < FLASH_MS)

/**
 * The frame the pane is on at `t`: it is drawn again when this changes, and at no other beat. A pure function of the
 * clock and of what is live: the spinner's 450 ms and the second while a run or a plain subagent runs, TOOL_MS while
 * a plain subagent's tool runs (its bar's highlight travels), 150 ms during a transition, the steps' own cycle while
 * the model works on an active step (`stepMs`, 0 when it does not). A finished run still on screen (`isKept`) is a
 * frame that stands: the pane is drawn once more when it leaves. '' when nothing moves: nothing is drawn.
 */
export function frameOf(o: { isLive: boolean; solo: readonly Agent[]; stepMs: number; t: number; isKept?: boolean }): string {
  const running = o.solo.filter(a => !isOver(a))
  return [
    ...(o.isLive || running.length > 0 ? [Math.floor(o.t / 450), Math.floor(o.t / 1000)] : []),
    ...(running.some(a => a.calls.length > 0) ? [`t${Math.floor(o.t / TOOL_MS)}`] : []),
    ...(o.solo.some(a => isMoving(a, o.t)) ? [`m${Math.floor(o.t / 150)}`] : []),
    ...(o.stepMs > 0 ? [`s${Math.floor(o.t / o.stepMs)}`] : []),
    ...(o.isKept === true ? ['kept'] : []),
  ].join(':')
}
