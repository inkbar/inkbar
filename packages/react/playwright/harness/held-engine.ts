/*
 * A stand-in for @inkbar/engine whose every write waits for the test, reached from the page as
 * `window.__heldEngine`: `writing()` says whether one is waiting, `finish()` lets it save and
 * `fail()` makes it reject. `loads` counts the loader's calls. `unavailable` makes the loader
 * itself fail, as it would offline.
 */
import type { EngineLoader } from '@inkbar/core'

export interface HeldEngine {
  loads: number
  writing(): boolean
  finish(): void
  fail(): void
}

declare global {
  interface Window {
    __heldEngine?: HeldEngine
  }
}

export function heldEngine(unavailable = false): EngineLoader {
  let settle: { finish: () => void; fail: () => void } | undefined
  const held: HeldEngine = {
    loads: 0,
    writing: () => settle !== undefined,
    finish: () => settle?.finish(),
    fail: () => settle?.fail(),
  }
  window.__heldEngine = held
  const doc = {
    pageCount: 1,
    write: () =>
      new Promise<void>((resolve, reject) => {
        settle = {
          finish: () => {
            settle = undefined
            resolve()
          },
          fail: () => {
            settle = undefined
            reject(new Error('write failed'))
          },
        }
      }),
    // A PDF header is enough for a download to carry.
    save: () => Promise.resolve(new TextEncoder().encode('%PDF-1.7 written')),
    close: () => Promise.resolve(),
  }
  const engine = { open: () => Promise.resolve(doc), destroy: () => Promise.resolve() }
  return (() => {
    held.loads++
    return unavailable
      ? Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
      : Promise.resolve({ createEngine: () => Promise.resolve(engine) })
  }) as unknown as EngineLoader
}
