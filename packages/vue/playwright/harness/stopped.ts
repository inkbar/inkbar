/*
 * What `StoppedHarness.vue` puts on the page: `window.__setStopped(on)` sets the stopped flag it
 * gives the open document in place of `engineStopped`.
 */
declare global {
  interface Window {
    __setStopped?: (stopped: boolean) => void
  }
}

export {}
