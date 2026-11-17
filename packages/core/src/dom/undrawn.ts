import type { Annotation } from '../model/annotations/types'

/**
 * Isolates the drawing of one annotation from the rest: a drawing that throws is reported once
 * per annotation and left to the caller to leave empty, so the others on the page still draw.
 */
export interface UndrawnGuard {
  /**
   * Runs `fn`. True when it returned; false when it threw, after one `console.warn` naming the
   * annotation (`what` says what could not be done, e.g. "was left undrawn"). A success ends the
   * report: an annotation that draws again is reported afresh if it fails later.
   */
  attempt(a: Annotation, what: string, fn: () => void): boolean
  /**
   * What `fn` returns, or `undefined` when it threw (reported as `attempt` does). A success does
   * not end the report, since a drawing that describes can still fail to paint: pair it with an
   * `attempt` for the paint, and that succeeding is what ends it.
   */
  value<T>(a: Annotation, what: string, fn: () => T): T | undefined
  /** Drops what is remembered of `id`: its annotation is gone. */
  forget(id: string): void
  /** Drops everything remembered. */
  clear(): void
}

export function createUndrawnGuard(): UndrawnGuard {
  /** Ids already reported, so a zoom does not report them again. */
  const reported = new Set<string>()
  /** Runs `fn`; a throw is reported once and returned as `false`. */
  function run(a: Annotation, what: string, fn: () => void): boolean {
    try {
      fn()
    } catch (error) {
      if (!reported.has(a.id)) {
        reported.add(a.id)
        console.warn(
          `[inkbar] annotation ${a.id} (${a.type}) ${what}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
      return false
    }
    return true
  }
  const guard: UndrawnGuard = {
    attempt(a, what, fn) {
      const ok = run(a, what, fn)
      if (ok) reported.delete(a.id)
      return ok
    },
    value(a, what, fn) {
      let out: ReturnType<typeof fn> | undefined
      run(a, what, () => {
        out = fn()
      })
      return out
    },
    forget: (id) => void reported.delete(id),
    clear: () => reported.clear(),
  }
  return guard
}
