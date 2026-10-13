// The pane as a text family's skin draws it: a HUD in one colour on the dark, thin rules with a cut
// corner (the block of meters closed by one at its foot), small uppercase captions that carry real
// values, the speech as a filled banner beside a boxed sign, flat bars with their number at the right. What moves (the mask, the agents' blocks)
// is handed in already mounted; everything here is redrawn only when what it says changes.
import type { ElementTable, RenderElement } from 'claude-code'

import { hex, mix } from './hud'
import type { Skin } from './hud'
import type { Mood } from './mascot'

/** The rows the HUD takes besides the mask and the agents: a caption, the banner's three, the name, the controls, a rule, the cost, three meters of two, the frame's foot. */
export const HUD_ROWS = 15

/** A HUD's own words: what heads the pane, the agents' rule and what it counts them as, the banner's head, the meters' rule. */
export type Captions = { link: string; crew: string; unit: string; banner: string; meters: string }
const CAPTIONS: Captions = { link: 'CONNECTION', crew: 'SUBNET', unit: 'PROC', banner: 'PROTOCOL', meters: 'MONITOR' }

export type Meter = { label: string; percent: number | undefined; isAlert: boolean; detail: string }

export type HudView = {
  skin: Skin
  /** The family's own words, where it has them: the cyber ones otherwise. */
  captions?: Captions
  /** The pane's own background and how many columns it fills, for a theme that brings one. */
  ground?: { color: string; columns: number }
  /** The columns everything is laid out in, and the pane's rows. */
  columns: number
  height: number
  /** The session's id and model, and for how long it has run, in minutes: absent while unknown. */
  session: string
  model: string
  minutes: number | undefined
  name: string
  /** What the banner tells: the turn's mood, `working` for all of a turn. */
  mood: Mood
  /** What the banner is headed and says (one line: what does not fit is cut); `isCall` when that is a running call. */
  title: string
  said: string
  isCall: boolean
  /** The agents' blocks and how many agents there are; the mask. Null for none. */
  agents: RenderElement | null
  alive: number
  mask: RenderElement | null
  petted: number
  onPet: () => Promise<void>
  cost: string
  meters: readonly Meter[]
  isFull: boolean
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** A session id as the game writes an address: the first eight of its letters and digits, grouped. */
const addressOf = (id: string): string => {
  const plain = id.replace(/[^0-9a-z]/gi, '').toUpperCase()

  return plain.length < 8 ? '' : ` ${plain.slice(0, 4)}.${plain.slice(4, 6)}.${plain.slice(6, 8)}`
}

/**
 * A run of cells shaded as a polished bar: darker toward its right end, one hard light a third of the way along.
 * The colour of each cell of `length`, around `tone`.
 */
export const sheen = (tone: number, length: number): string[] =>
  Array.from({ length }, (_cell, i) => {
    const u = length < 2 ? 0.3 : i / (length - 1)

    return hex(mix(mix(tone, 0x000000, 0.4 * Math.abs(u - 0.3)), 0xffffff, 0.55 * Math.exp(-(((u - 0.3) / 0.14) ** 2))))
  })

const SIGNS: Readonly<Record<Mood, string>> = { idle: ':', working: '~', worried: '!', happy: '✓' }

export function hudTree({ Box, Button, Text }: ElementTable, view: HudView): RenderElement {
  const { skin, columns } = view
  const words = view.captions ?? CAPTIONS
  const [primary, dim, cyan, alert, value, ink, shadow] = [skin.primary, skin.dim, skin.cyan, skin.alert, skin.value, skin.ink, skin.shadow].map(hex) as [string, string, string, string, string, string, string]
  // A rule that opens a block: cut at its left end, cornered at its right, the caption on it.
  const rule = (caption: string) => (
    <Text wrap="truncate-end">
      <Text color={dim}>╱─ </Text>
      <Text color={primary}>{caption}</Text>
      <Text color={dim}> {'─'.repeat(Math.max(0, columns - 5 - caption.length))}┐</Text>
    </Text>
  )
  const clock = view.minutes === undefined ? '' : `T+${pad2(Math.floor(view.minutes / 60))}:${pad2(view.minutes % 60)}`
  const isAlarm = view.mood === 'worried' && !view.isCall
  const tone = isAlarm ? alert : view.isCall || view.mood === 'working' ? cyan : view.mood === 'happy' ? value : primary
  // The chrome skins: what is a flat bar elsewhere (the banner, the name, a meter's fill) is polished metal, a cell at a time.
  const isChrome = skin.variant === 'chrome' || skin.variant === 'midnight'
  const polished = (text: string, of: number, isGround = false) =>
    sheen(of, [...text].length).map((color, i) => <Text key={String(i)} {...(isGround ? { color: ink, backgroundColor: color } : { color })} bold>{[...text][i]}</Text>)
  const inner = Math.max(1, columns - 4)
  // The banner's line: cut to the bar, an alarm's bar ending in hazard stripes.
  const room = Math.max(1, inner - 2 - (isAlarm ? 3 : 0))
  const said = view.said.length > room ? `${view.said.slice(0, room - 1)}…` : view.said
  // The model beside the name, its date left out, cut to what the line holds: '─┤ ' and ' // ' and ' ├─' are ten.
  const id = view.model.replace(/^claude-/, '').replace(/-\d{8}$/, '').toUpperCase()
  const fits = columns - view.name.length - 10
  const model = id.length <= fits ? id : fits >= 4 ? `${id.slice(0, fits - 1)}…` : ''
  const critical = ['[!] CONTEXT CRITICAL > /clear', '[!] CTX FULL > /clear', '[!] /clear'].find(text => text.length <= columns) ?? '[!]'
  const bar = Math.max(4, columns - 8)

  const meter = ({ label, percent, isAlert, detail }: Meter) => {
    const filled = percent === undefined ? 0 : Math.round((Math.min(100, percent) / 100) * bar)

    return (
      <Box flexDirection="column">
        <Text color={dim} wrap="truncate-end">{`${label} // ${detail}`.toUpperCase()}</Text>
        <Text wrap="truncate-end">
          {/* Past its threshold a bar is notched, as hazard tape, at the height of any bar, and its number a filled tag: an alarm is told by more than a colour. */}
          {isChrome && !isAlert ? polished('▄'.repeat(filled), skin.primary) : <Text color={isAlert ? alert : primary}>{isAlert ? '▄▂'.repeat(filled).slice(0, filled) : '▄'.repeat(filled)}</Text>}
          <Text color={shadow}>{'▄'.repeat(bar - filled)}</Text>
          {percent === undefined
            ? <Text color={dim}>{'N/A'.padStart(8)}</Text>
            : isAlert ? <Text> <Text color={ink} backgroundColor={alert} bold>{String(Math.round(percent)).padStart(3)}</Text></Text>
            : <Text color={primary} bold>{String(Math.round(percent)).padStart(4)}</Text>}
          {percent !== undefined && <Text color={dim}> 100</Text>}
        </Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" height={view.height} justifyContent="flex-end" {...(view.ground === undefined ? {} : { width: view.ground.columns, backgroundColor: view.ground.color })}>
      <Box width={columns} justifyContent="space-between">
        <Text color={dim} wrap="truncate-end">{words.link}{addressOf(view.session)}</Text>
        {columns >= 30 && <Text color={dim}>{clock}</Text>}
      </Box>
      {view.agents !== null && rule(`${words.crew} // ${pad2(view.alive)} ${words.unit}`)}
      {view.agents}
      <Text wrap="truncate-end">
        <Text color={tone}>┌─┐ </Text>
        <Text color={dim}>{words.banner} // {view.title.toUpperCase()}</Text>
      </Text>
      <Text wrap="truncate-end">
        <Text color={tone}>│</Text>
        <Text color={tone} bold>{view.isCall ? '>' : SIGNS[view.mood]}</Text>
        <Text color={tone}>│</Text>
        {isChrome && !isAlarm ? polished(` ${said.padEnd(room)} `, Number.parseInt(tone.slice(1), 16), true) : <Text color={ink} backgroundColor={tone} bold>{` ${said.padEnd(room)} `}{isAlarm && '▞▞▞'}</Text>}
        <Text color={tone}>▛</Text>
      </Text>
      <Text wrap="truncate-end">
        <Text color={tone}>└─┘ </Text>
        <Text color={dim}>{'▔'.repeat(Math.max(0, inner - 6))} ▀▀ ▀▀</Text>
      </Text>
      {/* (In the middle: a picture is whole art pixels wide, which may be a column short of the pane.) */}
      {view.mask !== null && <Box width={columns} justifyContent="center">{view.mask}</Box>}
      <Box width={columns} justifyContent="center">
        <Text wrap="truncate-end">
          <Text color={dim}>─┤ </Text>
          {isChrome ? polished(view.name.toUpperCase(), skin.primary) : <Text color={primary} bold>{view.name.toUpperCase()}</Text>}
          {model !== '' && <Text color={dim}> // {model}</Text>}
          <Text color={dim}> ├─</Text>
        </Text>
      </Box>
      <Box width={columns} justifyContent="center" gap={1}>
        <Button key="pet" label="PET" hotkey="p" variant="primary" onPress={view.onPet} />
        <Text color={value}>[ ♥ {view.petted} ]</Text>
      </Box>
      {rule(words.meters)}
      <Box width={columns} justifyContent="space-between">
        <Text color={dim}>SESSION COST</Text>
        <Text color={value} bold>{view.cost}</Text>
      </Box>
      {view.meters.map(meter)}
      {view.isFull && <Text color={alert} bold wrap="truncate-end">{critical}</Text>}
      <Text color={dim} wrap="truncate-end">└{'─'.repeat(Math.max(0, columns - 2))}╱</Text>
    </Box>
  )
}
