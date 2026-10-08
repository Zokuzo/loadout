// One plugin has one hooks module, and there an event takes a single hook without a matcher: where
// several of Loadout's parts (avatar, flow, frames) hook the same event, each stands under `{}`, the
// matcher any input matches. They are then one plugin's hooks, nested: one that throws is skipped and
// takes the parts beneath it along. `alone` keeps a part's fault its own, as when the parts were three plugins.
import type { EngineInterface, EventName, EventResult, Hook } from 'claude-code'

type Plain = Exclude<EventName, 'turn.step' | 'process.spawn'>
type Input<E extends Plain> = Parameters<Hook<E>>[1]

/** A part's work on `E`, as a function of its file: the hook's `($, e, next)`, `next` being what stands beneath the part. */
export type Part<E extends Plain> = ($: EngineInterface, e: Input<E>, next: (e: Input<E>) => Promise<EventResult<E>>) => Promise<EventResult<E>>

/**
 * Runs `part` over `next` so that it fails alone: where it throws, what it had asked of `next`
 * stands, and had it asked nothing, `next` answers the event as raised. `next` is called once at the most.
 */
export async function alone<E, R>(e: E, next: (e: E) => Promise<R>, part: (under: (e: E) => Promise<R>) => Promise<R>): Promise<R> {
  let asked: Promise<R> | undefined
  try {
    return await part(passed => (asked ??= next(passed)))
  } catch {
    return asked ?? next(e)
  }
}
