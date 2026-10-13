// The pane as the Halo skins draw it: the game's own HUD in place of the cyber one. A comm line in a round-cornered box, the
// figure, then the suit's instruments: the context left as a shield bar, a motion tracker with a contact per agent at work,
// and each limit as rounds left in a magazine. Same rows as the cyber HUD (HUD_ROWS), so the layout is one for both.
import type { ElementTable, RenderElement } from 'claude-code'

import { hex, mix } from './hud'
import type { HudView, Meter } from './hudpane'

const pad2 = (n: number) => String(n).padStart(2, '0')
const cut = (text: string, room: number): string => (text.length <= room ? text : room < 1 ? '' : `${text.slice(0, room - 1)}…`)

/**
 * The colours a run of cells goes through, end to end, on each skin: the game's own. By night the shield's blues, the visor's
 * gold to orange, a plasma violet; hers the hologram's range, from the projector's blue through violet to orchid. A magazine
 * goes from its last rounds (hot) to a full one (calm), so a nearly empty one shows only its hot end.
 */
const HUES = {
  mjolnir: { shield: [0x9be8ff, 0x74c7ff, 0x3d8bff], rounds: [0xff6a3a, 0xffb238, 0xd6d85a, 0x9fd86a], name: [0xffe08a, 0xffb238, 0xff8a3a], frame: [0x74c7ff, 0x5fe0c8, 0xa3b86c], rule: [0xa3b86c, 0x74c7ff, 0xb48cff] },
  cortana: { shield: [0xb8f0ff, 0x6fb6ff, 0x7a6cf0], rounds: [0xff5470, 0xe08cff, 0x8f9cff, 0x6fd0ff], name: [0xb8f0ff, 0x8fa8ff, 0xe08cff], frame: [0x6fd0ff, 0x8f7cff, 0xe08cff], rule: [0x6fb6ff, 0x8f7cff, 0xe08cff] },
} as const

/** The colour `u` of the way (0 to 1) along a list of stops. */
export const along = (stops: readonly number[], u: number): string => {
  const at = Math.max(0, Math.min(1, u)) * (stops.length - 1)
  const from = Math.min(stops.length - 2, Math.floor(at))

  return hex(mix(stops[from]!, stops[from + 1]!, at - from))
}

export const TRACKER_COLUMNS = 11
const TRACKER_ROWS = 5
// A Braille cell's dots, two across and four down, by the bit each sets.
const DOTS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]] as const

/**
 * The motion tracker, TRACKER_COLUMNS by five cells of Braille dots: a ring, a fainter one inside it, the wearer in the middle
 * and a blip per contact, each at a place of its own. A row's text, and which of its cells hold a contact.
 */
export function trackerRows(contacts: number): { text: string; hot: boolean[] }[] {
  const [width, height] = [TRACKER_COLUMNS * 2, TRACKER_ROWS * 4]
  const lit = new Uint8Array(width * height)
  const hot = new Uint8Array(TRACKER_COLUMNS * TRACKER_ROWS)
  const [cx, cy, radius] = [(width - 1) / 2, (height - 1) / 2, height / 2 - 0.5]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = Math.hypot(x - cx, y - cy)
      // (The inner ring is dotted: every other dot along it.)
      if (Math.abs(r - radius) < 0.55 || (Math.abs(r - radius / 2) < 0.5 && (x + y) % 2 === 0) || r < 1) lit[y * width + x] = 1
    }
  }
  for (let i = 0; i < Math.min(contacts, 8); i++) {
    const [turn, out] = [0.7 + 2.4 * i, 3.5 + ((i * 37) % 5)]
    const [x, y] = [Math.round(cx + out * Math.cos(turn) - 0.5), Math.round(cy + out * Math.sin(turn) - 0.5)]
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      lit[(y + dy) * width + x + dx] = 1
      hot[((y + dy) >> 2) * TRACKER_COLUMNS + ((x + dx) >> 1)] = 1
    }
  }

  return Array.from({ length: TRACKER_ROWS }, (_row, y) => ({
    text: Array.from({ length: TRACKER_COLUMNS }, (_cell, x) => String.fromCodePoint(0x2800 + DOTS.reduce((bits, pair, j) => bits | (lit[(y * 4 + j) * width + x * 2] ? pair[0] : 0) | (lit[(y * 4 + j) * width + x * 2 + 1] ? pair[1] : 0), 0))).join(''),
    hot: Array.from({ length: TRACKER_COLUMNS }, (_cell, x) => hot[y * TRACKER_COLUMNS + x] === 1),
  }))
}

export function haloTree({ Box, Button, Text }: ElementTable, view: HudView): RenderElement {
  const { skin, columns } = view
  const words = view.captions ?? { link: 'UNSC LINK', crew: 'FIRETEAM', unit: 'SPARTANS', banner: 'COMM', meters: 'SUIT' }
  const [primary, bright, dim, cyan, alert, value, ink, shadow] = [skin.primary, skin.bright, skin.dim, skin.cyan, skin.alert, skin.value, skin.ink, skin.shadow].map(hex) as [string, string, string, string, string, string, string, string]
  const hues = HUES[skin.variant === 'cortana' ? 'cortana' : 'mjolnir']
  /** A run of characters, each in its own colour along `stops`; `of` is the whole run's length where this is a part of one. */
  const shaded = (text: string, stops: readonly number[], isBold = false, from = 0, of = [...text].length) =>
    [...text].map((glyph, i) => <Text key={String(from + i)} color={along(stops, of < 2 ? 0 : (from + i) / (of - 1))} bold={isBold}>{glyph}</Text>)
  const rule = (caption: string) => {
    const line = `╭─ ${caption} ${'─'.repeat(Math.max(0, columns - 5 - caption.length))}╮`

    return <Text wrap="truncate-end">{shaded(line.slice(0, 3), hues.rule, false, 0, line.length)}{shaded(caption, hues.rule, true, 3, line.length)}{shaded(line.slice(3 + caption.length), hues.rule, false, 3 + caption.length, line.length)}</Text>
  }
  const address = view.session.replace(/[^0-9a-z]/gi, '').toUpperCase()
  const clock = view.minutes === undefined ? '' : `T+${pad2(Math.floor(view.minutes / 60))}:${pad2(view.minutes % 60)}`
  const isAlarm = view.mood === 'worried' && !view.isCall
  const tone = isAlarm ? alert : view.isCall || view.mood === 'working' ? cyan : view.mood === 'happy' ? value : primary
  // The comm line: who speaks and of what on the box's top edge, the words inside it.
  const inner = Math.max(1, columns - 4)
  // (Its frame starts in the turn's tone and runs into the skin's own frame colours; an alarm stays one colour.)
  const comm = isAlarm ? [skin.alert, skin.alert, skin.alert] : [Number.parseInt(tone.slice(1), 16), hues.frame[1], hues.frame[2]]
  const head = cut(`${words.banner} ▸ ${view.title.toUpperCase()}`, Math.max(1, columns - 6))
  const said = cut(view.said, inner)
  const id = view.model.replace(/^claude-/, '').replace(/-\d{8}$/, '').toUpperCase()
  const model = cut(id, Math.max(0, columns - view.name.length - 7))
  const critical = ['[!] SHIELDS DOWN > /clear', '[!] /clear'].find(text => text.length <= columns) ?? '[!]'

  const [five, week, context] = view.meters as [Meter | undefined, Meter | undefined, Meter | undefined]
  // The shield: what is left of the context, as the game's bar across the top of the visor.
  const bar = Math.max(4, columns - 5)
  const left = context?.percent === undefined ? undefined : 100 - Math.min(100, context.percent)
  const charged = left === undefined ? 0 : Math.round((left / 100) * bar)
  const isLow = context?.isAlert === true
  // A limit: the rounds left in its magazine, and when the next one comes.
  const side = Math.max(8, columns - TRACKER_COLUMNS - 1)
  const magazine = (meter: Meter | undefined, key: string) => {
    const rounds = meter?.percent === undefined ? undefined : 100 - Math.min(100, meter.percent)
    const loaded = rounds === undefined ? 0 : Math.round((rounds / 100) * side)
    const count = rounds === undefined ? 'N/A' : String(Math.round(rounds)).padStart(3)

    return [
      <Box key={`${key}-label`} width={side} justifyContent="space-between">
        <Text color={dim} wrap="truncate-end">{cut(`${(meter?.label ?? key).replace(/ limit$/i, '')} · ${(meter?.detail ?? '').replace(/^resets in /i, '')}`.toUpperCase(), side - 4)}</Text>
        {meter?.isAlert === true ? <Text color={ink} backgroundColor={alert} bold>{count}</Text> : <Text color={primary} bold>{count}</Text>}
      </Box>,
      <Text key={`${key}-rounds`} wrap="truncate-end">
        {shaded('▮'.repeat(loaded), hues.rounds, false, 0, side)}
        <Text color={shadow}>{'▯'.repeat(side - loaded)}</Text>
      </Text>,
    ]
  }
  const tracker = trackerRows(view.alive)
  // The shield is blue on both skins: his count's colour, her projector's.
  const blue = skin.variant === 'cortana' ? primary : value

  return (
    <Box flexDirection="column" height={view.height} justifyContent="flex-end" {...(view.ground === undefined ? {} : { width: view.ground.columns, backgroundColor: view.ground.color })}>
      <Box width={columns} justifyContent="space-between">
        <Text color={dim} wrap="truncate-end">{words.link}{address.length < 8 ? '' : ` ${address.slice(0, 4)}.${address.slice(4, 6)}.${address.slice(6, 8)}`}</Text>
        {columns >= 30 && <Text color={dim}>{clock}</Text>}
      </Box>
      {view.agents !== null && rule(`${words.crew} // ${pad2(view.alive)} ${words.unit}`)}
      {view.agents}
      <Text wrap="truncate-end">
        <Text color={tone}>╭─ </Text>
        <Text color={tone} bold>{head}</Text>
        {shaded(` ${'─'.repeat(Math.max(0, columns - 5 - head.length))}╮`, comm)}
      </Text>
      <Text wrap="truncate-end">
        <Text color={tone}>│ </Text>
        {isAlarm ? <Text color={ink} backgroundColor={alert} bold>{said.padEnd(inner)}</Text> : <Text color={bright} bold>{said.padEnd(inner)}</Text>}
        <Text color={hex(comm[2]!)}> │</Text>
      </Text>
      <Text wrap="truncate-end">{shaded(`╰${'─'.repeat(Math.max(0, columns - 2))}╯`, comm)}</Text>
      {view.mask !== null && <Box width={columns} justifyContent="center">{view.mask}</Box>}
      <Box width={columns} justifyContent="center">
        <Text wrap="truncate-end">
          <Text color={cyan}>◂ </Text>
          {shaded(view.name.toUpperCase(), hues.name, true)}
          {model !== '' && <Text color={dim}> · {model}</Text>}
          <Text color={cyan}> ▸</Text>
        </Text>
      </Box>
      <Box width={columns} justifyContent="center" gap={1}>
        <Button key="pet" label="PET" hotkey="p" variant="primary" onPress={view.onPet} />
        <Text color={value}>[ ♥ {view.petted} ]</Text>
      </Box>
      {rule(words.meters)}
      <Box width={columns} justifyContent="space-between">
        <Text wrap="truncate-end">
          <Text color={isLow ? alert : blue} bold>SHIELD</Text>
          <Text color={dim}>{cut(` // CONTEXT ${context?.detail ?? ''}`.toUpperCase(), Math.max(0, columns - 11))}</Text>
        </Text>
        {left === undefined ? <Text color={dim}>N/A</Text> : isLow ? <Text color={ink} backgroundColor={alert} bold>{String(Math.round(left)).padStart(3)}</Text> : <Text color={blue} bold>{String(Math.round(left)).padStart(3)}</Text>}
      </Box>
      <Text wrap="truncate-end">
        <Text color={dim}>▐</Text>
        {isLow ? <Text color={alert}>{'█▓'.repeat(charged).slice(0, charged)}</Text> : shaded('█'.repeat(charged), hues.shield, false, 0, bar)}
        <Text color={shadow}>{'░'.repeat(bar - charged)}</Text>
        <Text color={dim}>▌</Text>
      </Text>
      <Box width={columns} gap={1}>
        <Box flexDirection="column" width={TRACKER_COLUMNS}>
          {tracker.map((row, y) => (
            <Text key={String(y)}>{[...row.text].map((glyph, x) => <Text key={String(x)} color={row.hot[x] === true ? (skin.variant === 'cortana' ? value : cyan) : along(hues.shield, y / (tracker.length - 1))} bold={row.hot[x] === true}>{glyph}</Text>)}</Text>
          ))}
        </Box>
        <Box flexDirection="column" width={side}>
          {magazine(five, '5h')}
          {magazine(week, 'week')}
          <Box width={side} justifyContent="space-between">
            <Text color={dim}>CREDITS</Text>
            <Text color={value} bold>{view.cost}</Text>
          </Box>
        </Box>
      </Box>
      {view.isFull && <Text color={alert} bold wrap="truncate-end">{critical}</Text>}
      <Text wrap="truncate-end">{shaded(`╰${'─'.repeat(Math.max(0, columns - 2))}╯`, [...hues.rule].reverse())}</Text>
    </Box>
  )
}
