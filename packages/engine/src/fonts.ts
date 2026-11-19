import { EngineError } from './errors.ts'

import type { FontKey } from './types.ts'

/** Where a fallback font comes from: a URL (in Node, also a file path) or the bytes. */
export type FontSource = string | URL | Uint8Array

export type FontSources = Partial<Record<FontKey, FontSource>>

/** Each key's bit in the engine's key masks. */
export const FONT_BITS: Readonly<Record<FontKey, number>> = Object.freeze({
  japanese: 1,
  'simplified-chinese': 2,
  'traditional-chinese': 4,
  korean: 8,
  default: 16,
})

const KEYS = Object.keys(FONT_BITS) as FontKey[]

/** The keys whose bits are set in `bits`, in `FONT_BITS` order. */
export function keysOf(bits: number): FontKey[] {
  return KEYS.filter((key) => (bits & FONT_BITS[key]) !== 0)
}

export type FontState = 'registered' | 'failed'

const isNode = () =>
  typeof process !== 'undefined' && typeof process.versions?.node === 'string'

/** A Windows path such as `C:\fonts\a.ttf` parses as a URL with the scheme `c:`. */
const isUrl = (text: string) => URL.canParse(text) && !/^[a-z]:[\\/]/i.test(text)

const abortedError = () => new EngineError('aborted', 'The call was aborted.')

/** Settles as `work`, or rejects with `aborted` as soon as `signal` aborts. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return work
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(abortedError())
    }
    if (signal.aborted) onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    work.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort)
    })
  })
}

/** Reads a font: from disk for a Node path or `file:` URL, with `fetch` otherwise. */
async function read(source: string | URL, signal: AbortSignal | undefined) {
  const text = source instanceof URL ? source.href : source
  const fromDisk = isNode() && (!isUrl(text) || text.startsWith('file:'))
  if (fromDisk) {
    const { readFile } = process.getBuiltinModule('node:fs/promises')
    const path = isUrl(text) ? new URL(text) : text
    return new Uint8Array(await readFile(path, signal && { signal }))
  }
  const response = await fetch(text, signal && { signal })
  if (!response.ok) throw new Error(`${text} answered ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Fetches each key's font the first time it is needed and hands its bytes to `register`. A key
 * whose fetch fails (a network error, a status other than 2xx, bytes `register` refuses, or
 * `register` running out of memory) is failed for the loader's life and not fetched again. An
 * aborted fetch fails nothing: the key is fetched again next time. A source is dropped once its
 * key is settled, so its bytes are not kept once registered.
 */
export function createFontLoader(
  sources: FontSources | undefined,
  register: (key: FontKey, bytes: Uint8Array) => boolean
): {
  /** Resolves with the keys still missing. Rejects with `aborted` when `signal` aborts. */
  ensure(keys: readonly FontKey[], signal?: AbortSignal): Promise<FontKey[]>
  /** The keys of `keys` not registered, without fetching. */
  missing(keys: readonly FontKey[]): FontKey[]
  /** False when there is no source at all: `ensure` then only reports what is missing. */
  readonly fetches: boolean
} {
  const pending = new Map(
    Object.entries(sources ?? {}).filter(([, source]) => source !== undefined)
  ) as Map<FontKey, FontSource>
  const states = new Map<FontKey, FontState>()

  const settle = (key: FontKey, bytes: Uint8Array | undefined) => {
    let registered = false
    try {
      registered = bytes !== undefined && register(key, bytes)
    } catch (error) {
      // No memory for the engine's copy fails the font, not the call; anything else is the
      // engine's own failure and goes to the caller.
      if (!(error instanceof EngineError && error.code === 'out-of-memory')) throw error
    }
    states.set(key, registered ? 'registered' : 'failed')
    pending.delete(key)
  }

  const missing = (keys: readonly FontKey[]) =>
    keys.filter((key) => states.get(key) !== 'registered')

  return {
    missing,
    fetches: pending.size > 0,
    async ensure(keys, signal) {
      for (const key of keys) {
        if (states.has(key)) continue
        const source = pending.get(key)
        if (source === undefined) continue
        if (signal?.aborted) throw abortedError()
        if (source instanceof Uint8Array) {
          settle(key, source)
          continue
        }
        let bytes: Uint8Array | undefined
        try {
          bytes = await untilAborted(read(source, signal), signal)
        } catch {
          // An abort leaves the key to be fetched again; any other failure is final.
          if (signal?.aborted) throw abortedError()
          bytes = undefined
        }
        // A fetch that finished as the call was aborted is not registered either.
        if (signal?.aborted) throw abortedError()
        settle(key, bytes)
      }
      return missing(keys)
    },
  }
}
