// The Loadouts picker at the top of the Avatar pane: one row per theme, or, folded, one line naming
// the theme with a button that opens it. Drawn in the family's skin: HUD captions on a text family,
// a rounded frame on Kirby and Clawd. Pure: what a press does is handed in.
import type { ElementTable, RenderElement } from 'claude-code'

import { hex } from './hud'
import type { Skin } from './hud'
import type { Offer } from './themes'

export type PickerView = {
  offers: readonly Offer[]
  /** The setting this session runs under: its row is marked. */
  active: string
  isOpen: boolean
  /** The columns the picker is laid out in: no line of it is wider. */
  columns: number
  /** A text family's skin; absent for Kirby and Clawd. */
  skin?: Skin
  onPick: (setting: string) => Promise<void>
  onToggle: () => Promise<void>
}

/** The rows the open picker takes: a row per theme under a caption, and on Kirby and Clawd the frame's foot. Folded, it is one. */
export const pickerRows = (count: number, isHud: boolean): number => count + (isHud ? 1 : 2)

const cut = (text: string, room: number): string => (text.length <= room ? text : room <= 1 ? text.slice(0, Math.max(0, room)) : `${text.slice(0, room - 1)}…`)

export function pickerTree({ Box, Button, Text }: ElementTable, view: PickerView): RenderElement {
  const { skin, columns } = view
  const isHud = skin !== undefined
  const said = (text: string) => (isHud ? text.toUpperCase() : text)
  const [edge, title, lit] = isHud ? [hex(skin.dim), hex(skin.primary), hex(skin.cyan)] : ['promptBorder', 'claude', 'success']
  const current = view.offers.find(one => one.setting === view.active)
  const name = current?.name ?? (view.active.replace(/^custom:/, '') || '?')

  if (!view.isOpen) {
    // "loadout: <name> [ change ]": the caption is cut down where the line is short, then the name's end.
    const button = said('change')
    const caption = [said(isHud ? 'loadout // ' : 'loadout: '), isHud ? '// ' : '', ''].find(one => one.length + name.length + 5 + button.length <= columns) ?? ''

    return (
      <Box width={columns}>
        <Text wrap="truncate-end">
          <Text color={edge}>{caption}</Text>
          <Text color={title} bold>{said(cut(name, Math.max(1, columns - caption.length - 5 - button.length)))}</Text>
          <Text> </Text>
        </Text>
        <Button key="loadout" label={button} hotkey="l" onPress={view.onToggle} />
      </Box>
    )
  }

  // The caption: its title, a rule, and the key that folds the picker again ("0: close", eight cells).
  const close = said('close')
  const [head, tail] = isHud ? ['╱─ ', ' ┐'] : ['╭─ ', ' ╮']
  const caption = said('loadouts')
  const rule = columns - head.length - caption.length - 2 - (3 + close.length) - tail.length
  // A row: four cells of the theme's own colours, its digit and name, a mark on the one in use.
  const inner = columns - (isHud ? 0 : 4)
  const room = Math.max(1, inner - 5 - 3 - 2)
  const row = (one: Offer, i: number) => (
    <Box width={columns}>
      {!isHud && <Text color={edge}>│ </Text>}
      {one.swatch.slice(0, 4).map(color => <Text color={color}>█</Text>)}
      <Text>{i < 9 ? ' ' : '    '}</Text>
      <Button key={`loadout:${one.setting}`} plain label={said(cut(one.name, room)).padEnd(room)} {...(i < 9 ? { hotkey: String(i + 1) } : {})} onPress={() => view.onPick(one.setting)} />
      <Text color={lit} bold>{one.setting === view.active ? (isHud ? ' ◆' : ' ●') : '  '}</Text>
      {!isHud && <Text color={edge}> │</Text>}
    </Box>
  )

  return (
    <Box flexDirection="column" width={columns}>
      <Box width={columns}>
        <Text color={edge}>{rule >= 0 ? head : head.slice(0, 1)}</Text>
        {rule >= 0 && <Text color={title} bold>{caption}</Text>}
        <Text color={edge}>{rule >= 0 ? ` ${'─'.repeat(rule)} ` : '─'.repeat(Math.max(0, columns - 1 - (3 + close.length) - tail.length))}</Text>
        <Button key="loadout" plain label={close} hotkey="0" onPress={view.onToggle} />
        <Text color={edge}>{tail}</Text>
      </Box>
      {view.offers.map(row)}
      {!isHud && <Text color={edge} wrap="truncate-end">╰{'─'.repeat(Math.max(0, columns - 2))}╯</Text>}
    </Box>
  )
}
