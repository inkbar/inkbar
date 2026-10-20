// Watches the device pixel ratio for the layers that render at it: the page canvas and the
// loupes. The media query matches only the ratio it was built for, so it is rebuilt after
// every change. During a browser-zoom or screen transition the query can fire while
// devicePixelRatio still reports the old value, so each change also schedules follow-up checks.

const RECHECK_MS = [100, 500]

export interface DprWatch {
  /** Watches for a change away from `dpr`, the ratio just rendered at. */
  watch(dpr: number): void
  destroy(): void
}

/**
 * Calls `onChange` when `view`'s device pixel ratio moves away from the one last passed to
 * `watch`. `current` reads the ratio now. Does nothing where `matchMedia` is missing.
 */
export function watchDevicePixelRatio(
  view: Window | null | undefined,
  current: () => number,
  onChange: () => void
): DprWatch {
  let query: MediaQueryList | undefined
  let watched: number | undefined
  let rechecks: ReturnType<typeof setTimeout>[] = []
  let destroyed = false

  const clearRechecks = (): void => {
    rechecks.forEach(clearTimeout)
    rechecks = []
  }
  const fire = (): void => {
    if (destroyed) return
    arm(current(), true)
    onChange()
    clearRechecks()
    rechecks = RECHECK_MS.map((ms) =>
      setTimeout(() => {
        if (!destroyed && current() !== watched) fire()
      }, ms)
    )
  }
  function arm(dpr: number, force = false): void {
    if (destroyed || !view?.matchMedia) return
    if (dpr === watched && !force) return
    watched = dpr
    query?.removeEventListener('change', fire)
    query = view.matchMedia(`(resolution: ${dpr}dppx)`)
    query.addEventListener('change', fire)
  }

  return {
    watch: (dpr) => arm(dpr),
    destroy() {
      destroyed = true
      query?.removeEventListener('change', fire)
      query = undefined
      clearRechecks()
    },
  }
}
