/** Timings the end-to-end tests read. Present in development builds only. */
export interface SandboxMetrics {
  /** `performance.now()` of each `ready` event, oldest first. */
  ready: number[]
  /** Set by the tests' init script: the frame after page 1's canvas first appears. */
  firstPaint?: number
}

declare global {
  interface Window {
    __inkbarMetrics?: SandboxMetrics
  }
}

export function recordReady(): number {
  const metrics = (window.__inkbarMetrics ??= { ready: [] })
  metrics.ready ??= []
  metrics.ready.push(performance.now())
  return metrics.ready.length
}
