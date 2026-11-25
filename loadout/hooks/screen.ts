// What this terminal can show, as the parts that draw pictures know it. The Avatar pane and the Flow map
// share one answer: a picture refused to one of them is not tried by the other, and a cell is measured once.
import type { EngineInterface } from 'claude-code'

import type { Cell } from '../avatar/hooks/canvas'

export const RETRY_MS = 15_000 // after the first refusal; doubled by each one in a row
const RETRY_MAX_MS = 10 * 60_000

export const screen: {
  /**
   * Whether this terminal draws pictures: kitty and Ghostty do, a multiplexer passes none through. Unknown
   * until asked; a blit told "an Image draws its alt here" turns it off for a while, not for good:
   * the engine says so too while it is still asking the terminal, or is out of image ids.
   */
  canPicture: boolean | undefined
  /** A cell in device pixels, null while nobody could measure it. */
  cell: Cell | null
  retryMs: number
  /** When pictures are tried again, 0 for no retry due. */
  retryAt: number
} = { canPicture: undefined, cell: null, retryMs: RETRY_MS, retryAt: 0 }

/**
 * Reads which terminal this is, and so whether it draws pictures; answers its name and whether a multiplexer
 * stands between the session and it.
 */
export async function look($: EngineInterface): Promise<{ term: string | undefined; isMuxed: boolean }> {
  const read = (value: Promise<string | undefined>) => value.catch(() => undefined)
  const [term, program, kitty] = [await read($.env.get('TERM')), await read($.env.get('TERM_PROGRAM')), await read($.env.get('KITTY_WINDOW_ID'))]
  // A multiplexer between the session and the terminal: tmux, screen or zellij here, or one reached over ssh, told by the TERM it sets.
  const muxes = [await read($.env.get('TMUX')), await read($.env.get('STY')), await read($.env.get('ZELLIJ'))]
  const isMuxed = /^(screen|tmux)/.test(term ?? '') || muxes.some(value => value !== undefined)
  screen.canPicture = !isMuxed && (kitty !== undefined || /kitty|ghostty/i.test(`${term ?? ''} ${program ?? ''}`))

  return { term, isMuxed }
}

/** An Image drew its alt: no pictures here for now. They are tried again later, each refusal in a row doubling the wait. */
export async function refuse($: EngineInterface): Promise<void> {
  screen.canPicture = false
  screen.retryAt = (await $.clock.now()) + screen.retryMs
  screen.retryMs = Math.min(RETRY_MAX_MS, screen.retryMs * 2)
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

/**
 * Measures a cell; resolves true when it changed. Where it cannot, a cell never measured stays unknown and is taken
 * for one by two; one measured before is kept: a probe that failed once (a busy machine) says nothing of the font.
 */
export async function measure($: EngineInterface): Promise<boolean> {
  const got = await $.process.run(['python3', '-I', '-c', PROBE], { timeoutMs: 3000 }).catch(() => null)
  const [rows = 0, columns = 0, x = 0, y = 0] = (got?.stdout ?? '').trim().split(/\s+/).map(Number)
  const next = { w: Math.round(x / columns), h: Math.round(y / rows) }
  const found = next.w >= 4 && next.w <= 64 && next.h >= next.w && next.h <= 160 ? next : screen.cell
  const isNew = JSON.stringify(found) !== JSON.stringify(screen.cell)
  screen.cell = found

  return isNew
}
