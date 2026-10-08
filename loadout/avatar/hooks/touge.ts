// The cars of a night mountain pass, one per model, each seen from the front: the windscreen, the bonnet,
// the bumper, a tyre under each corner. Rows are palette indices, '.' transparent. A car's headlights are
// its eyes: the three frames are lights up, half way and down for the pop-up ones, lit, dim and out for the fixed.
import { decode } from './forms'
import type { FormSprite } from './forms'

const TRIM = 0x434a59 // the black of bumpers, grilles and mirrors, a step off the night it stands on
const GLASS = 0x27405f
const SHINE = 0x7fb4e6
const LAMP = 0xfff3b0
const AMBER = 0xff9f43
const TYRE = 0x30353f

/** A car: what is above its lights, the lights' rows per frame, what is below. */
const car = (name: string, palette: readonly number[], above: readonly string[], lights: readonly (readonly string[])[], below: readonly string[]): FormSprite => ({
  name,
  frames: decode(palette, lights.map(rows => [...above, ...rows, ...below])),
})

/** Fixed lamps (ink 5): lit, dim (6), out (7). */
const dimmed = (rows: readonly string[]) => ['5', '6', '7'].map(ink => rows.map(row => row.replaceAll('5', ink)))

export const TOUGE = {
  // The panda hatchback: white over black, pop-up headlights, yellow fog lights in the bumper.
  opus: car(
    'Eight-Six',
    [0xf4f6f8, 0xc5ccd6, TRIM, GLASS, SHINE, LAMP, 0xffd23f, AMBER, TYRE],
    [
      '.....0000000000.....',
      '....011111111110....',
      '....033333333330....',
      '...03343333333330...',
      '.220343333333333022.',
      '...03333333333330...',
      '.000000000000000000.',
    ],
    [
      ['00222220000002222200', '00255520000002555200', '00255520000002555200'],
      ['00000000000000000000', '00222220000002222200', '00255520000002555200'],
      ['00000000000000000000', '00000000000000000000', '00111110000001111100'],
    ],
    [
      '00000222222222200000',
      '27222222222222222272',
      '22226622222222662222',
      '.222222222222222222.',
      '.888............888.',
      '.888............888.',
    ],
  ),
  // The yellow rotary coupe: low and round, pop-up lights, one wide mouth.
  sonnet: car(
    'Twin Rotor',
    [0xf7c81e, 0xc79a12, TRIM, GLASS, SHINE, LAMP, AMBER, TYRE],
    [
      '......00000000......',
      '.....0333333330.....',
      '....033433333330....',
      '.220334333333333022.',
    ],
    [
      ['..0000000000000000..', '.025552000000255520.', '00255520000002555200'],
      ['..0000000000000000..', '.022222000000222220.', '00255520000002555200'],
      ['..0000000000000000..', '.000000000000000000.', '00111110000001111100'],
    ],
    [
      '00000000000000000000',
      '06000222222222200060',
      '00000022222222000000',
      '.111111111111111111.',
      '.777............777.',
      '.777............777.',
    ],
  ),
  // The small red hatchback: narrow and tall, a big windscreen, wide fixed lamps.
  haiku: car(
    'Red Hatch',
    [0xe0323a, 0xa01f2b, TRIM, GLASS, SHINE, LAMP, 0xb9a86a, 0x5d6470, AMBER, TYRE],
    [
      '....0000000000....',
      '...011111111110...',
      '...033333333330...',
      '...033343333330...',
      '...033433333330...',
      '220343333333333022',
      '.0000000000000000.',
      '000000000000000000',
    ],
    dimmed(['055550222222055550']),
    [
      '000000000000000000',
      '282222222222222282',
      '.2222222222222222.',
      '.999..........999.',
      '.999..........999.',
    ],
  ),
  // The night-blue coupe: square and wide, a wing, four round lamps, an intercooler's fins in the bumper.
  fable: car(
    'Night Coupe',
    [0x5b6a86, 0x3d485e, TRIM, GLASS, SHINE, LAMP, 0xb9a86a, 0x5d6470, 0x8a93a3, AMBER, TYRE],
    [
      '..0000000000000000..',
      '...1............1...',
      '...1.0000000000.1...',
      '...10333333333301...',
      '...10334333333301...',
      '.220334333333333022.',
      '.000000000000000000.',
      '00000000000000000000',
    ],
    dimmed(['05505502222220550550']),
    [
      '00000000000000000000',
      '09008282822828280090',
      '00008282822828280000',
      '.111111111111111111.',
      '.aaa............aaa.',
      '.aaa............aaa.',
    ],
  ),
} satisfies Record<string, FormSprite>
