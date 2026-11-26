/*
 * The real engine as the one every document in the page starts, with its every write, and every
 * apply of redaction marks, waiting for the test, reached from the page as `window.__heldEngine`:
 * `writing()` says whether one is waiting, `finish()` lets it through and `fail()` makes it
 * reject. A finished apply hands back the file as it was opened, which its check finds clean
 * under every mark. `loads` counts the engines made. It reads the file as the real engine does.
 */
import { _setEngineFactory } from '@inkbar/core'
import { browserAssets } from '@inkbar/fixtures/urls'

export interface HeldEngine {
  /** Engines made. */
  loads: number
  writing: () => boolean
  /** The types of the annotations the last apply wrote after its marks. */
  written: () => string[]
  finish: () => void
  fail: () => void
}

declare global {
  interface Window {
    __heldEngine?: HeldEngine
  }
}

/** What a stopped engine rejects every call with, as the engine does once it traps. */
const stoppedError = (): Error =>
  Object.assign(new Error('The engine stopped'), {
    name: 'EngineError',
    code: 'engine-failure',
  })

/**
 * Makes the held engine the one every document in the page starts, as core's engine factory.
 * The returned function clears the factory. With `unavailable`, the first engine's first write
 * stops it, and no engine starts after it, as when the engine cannot be fetched again.
 */
export function holdEngine(unavailable = false): () => void {
  let settle: { finish: () => void; fail: () => void } | undefined
  let written: string[] = []
  const held: HeldEngine = {
    loads: 0,
    writing: () => settle !== undefined,
    written: () => written,
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

  _setEngineFactory(async () => {
    if (unavailable && held.loads > 0) throw new TypeError('Failed to fetch')
    held.loads++
    const { createEngine } = await import('@inkbar/engine/bare')
    const assets = browserAssets()
    const real = await createEngine({ wasm: assets.engine, worker: assets.worker })
    let stopped = false
    /** `call` on an engine that has not stopped. */
    const live =
      <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
      (...args: A): Promise<R> =>
        stopped ? Promise.reject(stoppedError()) : call(...args)
    return {
      open: live(async (bytes: Uint8Array, options?: { password?: string }) => {
        const doc = await real.open(bytes, options)
        /** The bytes this document opened: a finished apply saves them unchanged. */
        const opened = bytes.slice()
        /** Whether marks have been applied to this document. */
        let redacted = false
        const standIns = {
          write: () => {
            if (!unavailable) return hold()
            stopped = true
            return Promise.reject(stoppedError())
          },
          // A PDF header is enough for a download to carry; after an apply, the file opened.
          save: () =>
            Promise.resolve(
              redacted ? opened : new TextEncoder().encode('%PDF-1.7 written')
            ),
          redact: (input: {
            marks: readonly object[]
            annotations?: readonly { annotation: { type: string } }[]
          }) => {
            written = (input.annotations ?? []).map((a) => a.annotation.type)
            return hold().then(() => {
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
            })
          },
        }
        return new Proxy(doc, {
          get(target, key, receiver) {
            if (key in standIns)
              return live(
                standIns[key as keyof typeof standIns] as (
                  ...a: unknown[]
                ) => Promise<unknown>
              )
            const value = Reflect.get(target, key, receiver) as unknown
            if (typeof value !== 'function') return value
            const call = (value as (...a: unknown[]) => Promise<unknown>).bind(target)
            return key === 'close' ? call : live(call)
          },
        })
      }),
      // A finished apply's file is the one opened, which the check finds clean under every mark.
      checkRedaction: live(
        (_bytes: Uint8Array, options?: { regions?: readonly { page: number }[] }) =>
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
          })
      ),
      destroy: () => real.destroy(),
    }
  })
  return () => _setEngineFactory(undefined)
}
