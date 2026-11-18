/*
 * A stand-in for @inkbar/engine whose every write, and every apply of redaction marks, waits for
 * the test, reached from the page as `window.__heldEngine`: `writing()` says whether one is
 * waiting, `finish()` lets it save and `fail()` makes it reject. `loads` counts the loader's calls. `unavailable` makes the loader
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
  const hold = (): Promise<void> =>
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
    })
  const doc = {
    pageCount: 1,
    write: hold,
    // A PDF header is enough for a download to carry.
    save: () => Promise.resolve(new TextEncoder().encode('%PDF-1.7 written')),
    // An apply waits like a write; let through, it still fails: there is no file to redact.
    redact: () => hold().then(() => Promise.reject(new Error('unused'))),
    close: () => Promise.resolve(),
  }
  const engine = {
    open: () => Promise.resolve(doc),
    checkRedaction: () => Promise.reject(new Error('unused')),
    destroy: () => Promise.resolve(),
  }
  return () => {
    held.loads++
    return unavailable
      ? Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
      : Promise.resolve({ createEngine: () => Promise.resolve(engine) })
  }
}
