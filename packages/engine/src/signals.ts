/** A signal that follows others, and `dispose` to stop following them. */
export interface CombinedSignal {
  signal: AbortSignal
  /** Removes the listeners on the source signals. Call it once the signal is no longer needed. */
  dispose: () => void
}

const NOTHING = () => undefined

/**
 * A signal that aborts, with the same reason, as soon as any of `signals` does. Written by hand
 * rather than with `AbortSignal.any`, which older browsers lack. Missing entries are skipped.
 */
export function anySignal(signals: readonly (AbortSignal | undefined)[]): CombinedSignal {
  const sources = signals.filter((s): s is AbortSignal => s !== undefined)
  if (sources.length === 1) return { signal: sources[0]!, dispose: NOTHING }
  const controller = new AbortController()
  const already = sources.find((s) => s.aborted)
  if (already) {
    controller.abort(already.reason)
    return { signal: controller.signal, dispose: NOTHING }
  }
  const listeners = sources.map((source) => {
    const onAbort = () => {
      dispose()
      controller.abort(source.reason)
    }
    source.addEventListener('abort', onAbort, { once: true })
    return { source, onAbort }
  })
  const dispose = () => {
    for (const { source, onAbort } of listeners)
      source.removeEventListener('abort', onAbort)
  }
  return { signal: controller.signal, dispose }
}

/**
 * A signal that aborts after `ms`, and `dispose` to clear its timer. Written with a timer rather
 * than `AbortSignal.timeout`, which older browsers lack.
 */
export function timeoutSignal(ms: number): CombinedSignal & { timedOut: () => boolean } {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new DOMException('The fetch took too long.', 'TimeoutError'))
  }, ms)
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
    },
    timedOut: () => controller.signal.aborted,
  }
}
