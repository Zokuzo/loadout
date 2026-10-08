// Every colour the pane draws, behind the handoff's token names, one palette per theme family.
// The handoff's own tokens are the palette of Claude Code's built-in themes; a custom theme named
// kirby, kirby-pink, ghostrunner or cyberpunk-edgerunners has its own, aligned with ~/.claude/themes/<name>.json.

import type { Pack, Palette, StepState, StepsStyle, StepStatusName, Token } from '../../types'

export type { Pack, Palette, StepState, StepsStyle, StepStatusName, Token }

export type PaletteName = 'handoff' | 'kirby' | 'kirby-pink' | 'ghostrunner' | 'cyberpunk-edgerunners'

export const PALETTES: Readonly<Record<PaletteName, Palette>> = {
  handoff: {
    bg: '#262626', page: '#1c1c1c', fg: '#e4e4e4', text2: '#9e9e9e', text3: '#999999', text4: '#949494',
    border: '#4e4e4e', cardBorder: '#5a5a5a', track: '#3a3a3a', select: '#303030',
    cyan: '#5fd7ff', green: '#5fd75f', yellow: '#ffd75f', orange: '#ffaf5f', red: '#ff5f5f', blue: '#5fafff', violet: '#af87ff',
    railDone: '#5f875f', railRun: '#8a7a45', tabActive: '#d3c7ab',
  },
  // Dream Land: a dark green with a yellow tint beside a #1b2414 terminal; grass green, star yellow, sky blue.
  kirby: {
    bg: '#1b2414', page: '#1b2414', fg: '#f2f5e6', text2: '#aebb9f', text3: '#a3b196', text4: '#98a68c',
    border: '#4c5e3a', cardBorder: '#627848', track: '#425534', select: '#2e3c22',
    cyan: '#63bbff', green: '#9be564', yellow: '#ffd23c', orange: '#ffaa4d', red: '#ff6f61', blue: '#7fdcf0', violet: '#c5befe',
    railDone: '#6a9a48', railRun: '#8f8232', tabActive: '#ffd23c',
  },
  // Kirby Pink: Dream Land at dusk, Kirby's pink on a deep berry ground.
  'kirby-pink': {
    bg: '#2b1724', page: '#2b1724', fg: '#fbe8f0', text2: '#dcc3d0', text3: '#c4a8b7', text4: '#ad8fa0',
    border: '#6b4159', cardBorder: '#9c5f82', track: '#5a3350', select: '#4a2a3e',
    cyan: '#7fd8f0', green: '#7fe0a8', yellow: '#ffd75e', orange: '#ffa05c', red: '#ff6b7d', blue: '#8ccfff', violet: '#cbb4ff',
    railDone: '#4f9a72', railRun: '#b8963c', tabActive: '#ff9ec4',
  },
  // Cyberpunk 2077's inventory screen: only red, dark red and light blue. What runs is red, what is done is light blue.
  ghostrunner: {
    bg: '#120608', page: '#120608', fg: '#ffaca1', text2: '#cf8f88', text3: '#c3857f', text4: '#b77c77',
    border: '#6a2228', cardBorder: '#8a2c33', track: '#56212b', select: '#331017',
    cyan: '#2fb8c4', green: '#5ef6ff', yellow: '#ff6158', orange: '#ffd2cb', red: '#ff1f47', blue: '#8feaf2', violet: '#ff8a80',
    railDone: '#1f7f8a', railRun: '#8a2c33', tabActive: '#ff6158',
  },
  // Cyberpunk Edgerunners: the same HUD leaning yellow, on near-black.
  'cyberpunk-edgerunners': {
    bg: '#0b0b06', page: '#0b0b06', fg: '#efe8b0', text2: '#b9b18a', text3: '#ada581', text4: '#a19a7a',
    border: '#4f4a24', cardBorder: '#665f2e', track: '#403d20', select: '#262410',
    cyan: '#5ef6ff', green: '#3ddc84', yellow: '#fcee0a', orange: '#ff9a04', red: '#ff5a4a', blue: '#39aef0', violet: '#bb78ff',
    railDone: '#2a8a55', railRun: '#8f860a', tabActive: '#fcee0a',
  },
}

/** The palette a theme calls for, by the theme's name as the config row "theme" gives it (the kirby-hud mod's reading). */
export const paletteOf = (theme: string): PaletteName =>
  /kirby/i.test(theme) ? (/pink/i.test(theme) ? 'kirby-pink' : 'kirby')
    : /ghostrunner/i.test(theme) ? 'ghostrunner'
      : /edgerunners/i.test(theme) ? 'cyberpunk-edgerunners'
        : 'handoff'

// ── Theme packs: ../themes/<slug>.json, read at run time (see ../../THEMES.md). The tables above are the fallback. ──

const state = (glyph: string, color: Token, bold: boolean, rail: string, railColor: Token): StepState =>
  ({ glyph, color, labelColor: color, bold, strike: false, rail, railColor, edge: rail, edgeColor: railColor, ground: null })

/** The steps as the pane drew them before packs, and as it draws them when no pack serves the theme. */
export const STEPS: StepsStyle = {
  header: { style: 'boxed', prefix: '', color: 'cyan', frame: 'border', upper: false, corners: '╭╮╰╯' },
  layout: 'path',
  meter: { style: 'bar', fill: '■', empty: '■' },
  states: {
    done: state('●', 'text2', false, '│', 'railDone'),
    active: state('◐', 'yellow', true, '┆', 'railRun'),
    pending: state('○', 'text4', false, '┆', 'border'),
    blocked: state('■', 'red', true, '┆', 'border'),
  },
  cycle: { glyphs: ['◐', '◓', '◑', '◒'], ms: 450 },
  captions: { title: 'steps', active: '', blocked: 'blocked', optional: '', progress: 'step {i} of {n} · {done} of {n} done', idle: 'no step active · {done} of {n} done' },
}

const TOKENS = Object.keys(PALETTES.handoff) as Token[]
const STATES = ['done', 'active', 'pending', 'blocked'] as const

/**
 * A pack file's parsed JSON as the pane uses it, or null when it is not one: a missing or mistyped field of
 * flow.palette or flow.steps. Only what the pane reads is checked; validate.py checks the rest. Never throws.
 */
export function toPack(raw: unknown): Pack | null {
  const bad = (): never => { throw new Error('not a pack') }
  const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : bad())
  const text = (v: unknown, max: number, or?: string): string => (v === undefined && or !== undefined ? or : typeof v === 'string' && v.length <= max ? v : bad())
  // One UTF-16 unit: the drawing counts a cell per unit.
  const cell = (v: unknown, or?: string): string => (v === undefined && or !== undefined ? or : typeof v === 'string' && v.length === 1 ? v : bad())
  const token = (v: unknown, or?: Token): Token => (v === undefined && or !== undefined ? or : TOKENS.find(t => t === v) ?? bad())
  const flag = (v: unknown, or: boolean): boolean => (v === undefined ? or : typeof v === 'boolean' ? v : bad())
  const pick = <T extends string>(v: unknown, all: readonly T[], or: T): T => (v === undefined ? or : all.find(x => x === v) ?? bad())
  try {
    const top = rec(raw)
    const flow = rec(top.flow)
    const colours = rec(flow.palette)
    const palette = Object.fromEntries(TOKENS.map(t => [t, typeof colours[t] === 'string' && /^#[0-9a-f]{6}$/i.test(colours[t]) ? colours[t].toLowerCase() : bad()])) as Palette
    const steps = rec(flow.steps)
    const header = rec(steps.header)
    const states = rec(steps.states)
    const captions = rec(steps.captions)
    const meter = steps.meter === undefined ? {} : rec(steps.meter)
    const one = (name: StepStatusName): StepState => {
      const st = rec(states[name])
      const color = token(st.color)
      const rail = cell(st.rail)
      const railColor = token(st.railColor)
      return {
        glyph: cell(st.glyph), color, labelColor: token(st.labelColor, color), bold: flag(st.bold, false), strike: flag(st.strike, false),
        rail, railColor, edge: cell(st.edge, rail), edgeColor: token(st.edgeColor, railColor), ground: st.ground === undefined ? null : token(st.ground),
      }
    }
    const cycle = steps.cycle === undefined ? null : rec(steps.cycle)
    const glyphs = cycle === null ? [] : Array.isArray(cycle.glyphs) && cycle.glyphs.length >= 2 && cycle.glyphs.length <= 8 ? cycle.glyphs.map(g => cell(g)) : bad()
    const ms = cycle === null ? 0 : typeof cycle.ms === 'number' && cycle.ms >= 100 && cycle.ms <= 2000 ? Math.round(cycle.ms) : bad()
    const corners = text(header.corners, 4, STEPS.header.corners)
    const spin = top.spinner === undefined ? null : rec(top.spinner)
    const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) && v.length >= 1 && v.length <= max ? v : bad())
    const spinner = spin === null ? null : {
      verbs: list(spin.verbs, 40).map(v => text(v, 32) || bad()), frames: list(spin.frames, 8).map(g => cell(g)),
      ms: typeof spin.ms === 'number' && spin.ms >= 100 && spin.ms <= 2000 ? Math.round(spin.ms) : bad(),
    }
    return {
      slug: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(text(top.slug, 60)) ? text(top.slug, 60) : bad(),
      match: top.match === undefined ? [] : Array.isArray(top.match) ? top.match.map(m => text(m, 60)) : bad(),
      palette,
      steps: {
        header: {
          style: pick(header.style, ['plain', 'boxed', 'banner', 'bracketed'] as const, 'boxed'), prefix: text(header.prefix, 16, ''),
          color: token(header.color), frame: token(header.frame), upper: flag(header.upper, false), corners: corners.length === 4 ? corners : bad(),
        },
        layout: pick(steps.layout, ['path', 'list'] as const, 'path'),
        meter: { style: pick(meter.style, ['bar', 'pips'] as const, 'bar'), fill: cell(meter.fill, '■'), empty: cell(meter.empty, '■') },
        states: { done: one('done'), active: one('active'), pending: one('pending'), blocked: one('blocked') },
        cycle: cycle === null ? null : { glyphs, ms },
        captions: {
          title: text(captions.title, 16), active: text(captions.active, 16), blocked: text(captions.blocked, 16), optional: text(captions.optional, 16, ''),
          progress: text(captions.progress, 60, STEPS.captions.progress), idle: text(captions.idle, 60, STEPS.captions.idle),
        },
      },
      spinner,
    }
  } catch {
    return null
  }
}

/** A theme's name as packs key it: trimmed, lower case, without "custom:", blanks and underscores as "-". */
export const themeKey = (theme: string): string => theme.trim().toLowerCase().replace(/^custom:/, '').replace(/[\s_]+/g, '-')

/**
 * The pack that serves a theme: the one of that slug, else the one with the longest `match` string the name
 * holds (then the first slug in alphabetical order), else `default`. Null with no theme read yet, or no such pack.
 */
export function packOf(theme: string, packs: readonly Pack[]): Pack | null {
  const name = themeKey(theme)
  if (name === '') return null
  const hits = packs.flatMap(p => p.match.filter(m => m !== '' && name.includes(m)).map(m => ({ p, m })))
    .sort((a, b) => b.m.length - a.m.length || a.p.slug.localeCompare(b.p.slug))
  return packs.find(p => p.slug === name) ?? hits[0]?.p ?? packs.find(p => p.slug === 'default') ?? null
}

/**
 * What the pane draws with on a theme: its pack's palette and steps style, else the built-in palette and steps.
 * A theme of a built-in family (kirby, kirby-pink, ghostrunner, cyberpunk-edgerunners) whose own pack is missing or broken
 * keeps its built-in palette, as before packs: another family's pack, or the default one, is not its look.
 */
export const lookOf = (theme: string, packs: readonly Pack[]): { P: Palette; S: StepsStyle } => {
  const pack = packOf(theme, packs)
  const own = paletteOf(theme)
  const isOrphan = pack !== null && own !== 'handoff' && pack.slug !== themeKey(theme) && !packs.some(p => p.slug === own)
  return pack === null || isOrphan ? { P: PALETTES[own], S: STEPS } : { P: pack.palette, S: pack.steps }
}

/** A caption template filled: {i} the active step, {n} how many, {done} and {left}. */
export const filled = (template: string, values: Readonly<Record<string, number>>): string =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => (values[key] === undefined ? whole : String(values[key])))

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** `a` moved toward `b` by `t` (0 is a, 1 is b), channel by channel. */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)]
  const k = Math.max(0, Math.min(1, t))
  return `#${x.map((c, i) => Math.round(c + ((y[i] ?? c) - c) * k).toString(16).padStart(2, '0')).join('')}`
}

/** The colour at `x` (0..1) of a gradient given as [position, colour] stops in order. */
export function gradient(stops: readonly (readonly [number, string])[], x: number): string {
  const first = stops[0]
  const last = stops[stops.length - 1]
  if (first === undefined || last === undefined) return '#000000'
  if (x <= first[0]) return first[1]
  for (let i = 1; i < stops.length; i++) {
    const [a, b] = [stops[i - 1], stops[i]]
    if (a !== undefined && b !== undefined && x <= b[0]) return mix(a[1], b[1], (x - a[0]) / Math.max(1e-9, b[0] - a[0]))
  }
  return last[1]
}

/** WCAG contrast ratio of two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = rgb(hex).map(c => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4))
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0)
  }
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}
