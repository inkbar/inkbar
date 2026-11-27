// When the engine reader gives up on its engine: the stops it counts, the pages it blocks, and
// when it stops the document. What it learns about pages lasts as long as the reader: a restart
// by hand forgets only the counted stops, so a page that keeps stopping the engine stays blocked.
import { InkError } from '../model/errors'

/** How many counted stops within `STOP_WINDOW` stop the document. */
export const STOPS_TO_STOP = 3

/** The time, in milliseconds, in which `STOPS_TO_STOP` stops stop the document. */
export const STOP_WINDOW = 60_000

/** How many stops a page's reads may cause before the page is blocked. */
export const PAGE_STOPS = 2

/**
 * What follows a stop: `go-on` starts another engine, `blocked` refuses the page from now on with
 * `error`, and `stop` stops the document.
 */
export type StopOutcome =
  { kind: 'go-on' } | { kind: 'blocked'; error: InkError } | { kind: 'stop' }

/** @internal The engine reader's count of stops. */
export interface StopCount {
  /**
   * Records a stop found by a call: `page` is the page whose block it counts towards, when it
   * counts towards one (a link read's stop counts towards none), and `counts`
   * is false for a stop that does not count towards `STOPS_TO_STOP`: one on a call's second
   * attempt, so a page that stops every engine it is read on costs one count, not two, and one
   * whose reads have a limit of their own. The stop that brings a page to `PAGE_STOPS` blocks it
   * and is not counted either.
   */
  found(page: number | undefined, counts: boolean, cause: unknown): StopOutcome
  /** The error a blocked page's reads reject with; `undefined` for a page that is not blocked. */
  blocked(page: number): InkError | undefined
  /**
   * Forgets the stops counted towards `STOPS_TO_STOP`, for an engine started again by hand. Each
   * page's stops and blocks stay: a page that stopped the engine once is blocked at its next stop,
   * which is not counted, so the same pages cannot stop the document again and again.
   */
  forgetCounted(): void
  /** An engine started to replace a stopped one: the stop that dropped the last one stands. */
  replaced(): void
  /**
   * An engine started to replace a stopped one could not start. The page whose call found the
   * stop that dropped the last engine loses that stop, unless it blocked the page: an engine
   * that cannot start points at the engine, not the page. Each page loses at most one stop this
   * way, so a page whose stops also keep the next engine from starting is still blocked at its
   * third. A page's stops last until the file is opened again.
   */
  notReplaced(): void
}

/** @internal `now` gives the time in milliseconds; tests pass their own. */
export function createStopCount(now: () => number = Date.now): StopCount {
  const pageStops = new Map<number, number>()
  const blocks = new Map<number, InkError>()
  /** When each counted stop was found, the earliest first. */
  let times: number[] = []
  /** The page charged with the last stop, until an engine starts to replace the one it dropped. */
  let unproven: number | undefined
  /** The pages that have had a stop taken back. */
  const forgiven = new Set<number>()

  return {
    found(page, counts, cause) {
      unproven = undefined
      if (page !== undefined) {
        const stops = (pageStops.get(page) ?? 0) + 1
        pageStops.set(page, stops)
        if (stops >= PAGE_STOPS) {
          const error = new InkError(
            'EngineUnavailable',
            `Reading page ${page + 1} stopped the engine twice; the page is not read again`,
            { page, cause },
            cause
          )
          blocks.set(page, error)
          return { kind: 'blocked', error }
        }
        unproven = page
      }
      if (!counts) return { kind: 'go-on' }
      const at = now()
      times = times.filter((t) => at - t < STOP_WINDOW)
      times.push(at)
      return times.length >= STOPS_TO_STOP ? { kind: 'stop' } : { kind: 'go-on' }
    },
    blocked: (page) => blocks.get(page),
    forgetCounted() {
      times = []
      unproven = undefined
    },
    replaced() {
      unproven = undefined
    },
    notReplaced() {
      if (unproven === undefined || forgiven.has(unproven)) {
        unproven = undefined
        return
      }
      forgiven.add(unproven)
      const stops = (pageStops.get(unproven) ?? 1) - 1
      if (stops > 0) pageStops.set(unproven, stops)
      else pageStops.delete(unproven)
      unproven = undefined
    },
  }
}
