/*
 * A stand-in for @inkbar/engine whose every write, and every apply of redaction marks, waits for
 * the test, reached from the page as `window.__heldEngine`: `writing()` says whether one is
 * waiting, `finish()` lets it through and `fail()` makes it reject. A finished apply hands back
 * the file as it was opened, which its check finds clean under every mark. `loads` counts the
 * loader's calls. `unavailable` makes the loader itself fail, as it would offline.
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
    /** The redaction harness: hands the host's held answer to the proposal back to the root. */
    __releaseAnswer?: () => void
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
  /** The bytes the engine last opened: a finished apply saves them unchanged. */
  let opened = new Uint8Array()
  /** Whether the open document has had marks applied since it opened. */
  let redacted = false
  const doc = {
    pageCount: 1,
    write: hold,
    // A PDF header is enough for a download to carry; after an apply, the file opened.
    save: () =>
      Promise.resolve(redacted ? opened : new TextEncoder().encode('%PDF-1.7 written')),
    redact: (input: { marks: readonly object[] }) =>
      hold().then(() => {
        redacted = true
        return {
          pages: [{ page: 0, marks: input.marks.length, annotationsRemoved: 0 }],
          ownLockedMarks: 0,
          ownLockedRegions: [],
          foreignMarks: 0,
          fieldsSkipped: [],
          sanitised: {
            metadata: false,
            attachments: 0,
            scripts: false,
            thumbnails: false,
            privateData: false,
          },
          hiddenLayers: false,
          signed: false,
        }
      }),
    close: () => Promise.resolve(),
  }
  const engine = {
    open: (bytes: Uint8Array) => {
      opened = bytes.slice()
      redacted = false
      return Promise.resolve(doc)
    },
    checkRedaction: (
      _bytes: Uint8Array,
      options?: { regions?: readonly { page: number }[] }
    ) =>
      Promise.resolve({
        candidates: (options?.regions ?? []).map((r, region) => ({
          page: r.page,
          region,
          rect: { x: 0, y: 0, width: 1, height: 1 },
          kind: 'region' as const,
          text: 'none' as const,
          image: 'none' as const,
          drawing: 'none' as const,
          verdict: 'clean' as const,
        })),
        file: {
          earlierVersions: 0,
          metadata: false,
          attachments: 0,
          scripts: false,
          hiddenLayers: false,
          signed: false,
        },
      }),
    destroy: () => Promise.resolve(),
  }
  return () => {
    held.loads++
    return unavailable
      ? Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
      : Promise.resolve({ createEngine: () => Promise.resolve(engine) })
  }
}
