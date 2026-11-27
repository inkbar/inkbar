// Test support only, never production code: node tests import it. A factory of real engines, in
// this thread, for `setEngineFactory`, that counts the engines it makes and the documents opened
// and closed in each, and can stop an engine on demand as a trap in PDFium does.
import { createEngine, EngineError, type Engine } from '@inkbar/engine'
import { vi } from 'vitest'

import type { InkDocument } from '../model/document'

/** What the factory knows of one engine it made. */
export interface HeldEngine {
  /** Documents opened in it. */
  opened: number
  /** Documents closed in it. */
  closed: number
  /** Set once a call stopped it: every later call fails with `engine-failure`. */
  stopped: boolean
  destroyed: boolean
}

/**
 * `factory` makes each engine. `stopOnNext(method)` makes the next call of that document or
 * engine method, on whichever engine, stop its engine: it and every later call on that engine
 * reject with `engine-failure`, except `close` and `destroy`, which resolve, as the engine's do.
 * `stopOnEvery(method)` makes every call of it stop its engine, until `stopOnEvery(undefined)`.
 */
export function heldEngines() {
  const engines: HeldEngine[] = []
  let stopOn: string | undefined
  let stopEvery: string | undefined
  const stoppedError = () => new EngineError('engine-failure', 'PDFium stopped')

  /** `value` called on a live engine; the call `stopOn` names stops it. */
  const guarded =
    (held: HeldEngine, name: string, value: (...args: unknown[]) => unknown) =>
    (...args: unknown[]): unknown => {
      if (name === 'close' || name === 'destroy') return value(...args)
      if (stopOn === name) {
        stopOn = undefined
        held.stopped = true
      }
      if (stopEvery === name) held.stopped = true
      if (held.stopped) return Promise.reject(stoppedError())
      return value(...args)
    }

  const factory = async (): Promise<Engine> => {
    const engine = await createEngine({ worker: false })
    const held: HeldEngine = { opened: 0, closed: 0, stopped: false, destroyed: false }
    engines.push(held)
    return new Proxy(engine, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver) as unknown
        if (typeof value !== 'function') return value
        const name = String(key)
        const bound = (value as (...a: unknown[]) => unknown).bind(target)
        if (name === 'destroy')
          return () => {
            held.destroyed = true
            return bound()
          }
        if (name !== 'open') return guarded(held, name, bound)
        return guarded(held, name, async (...args: unknown[]) => {
          const doc = await (bound(...args) as ReturnType<Engine['open']>)
          held.opened++
          return new Proxy(doc, {
            get(d, docKey, r) {
              const member = Reflect.get(d, docKey, r) as unknown
              if (typeof member !== 'function') return member
              const docName = String(docKey)
              const call = (member as (...a: unknown[]) => unknown).bind(d)
              if (docName === 'close')
                return () => {
                  held.closed++
                  return call()
                }
              return guarded(held, docName, call)
            },
          })
        })
      },
    })
  }

  return {
    factory,
    engines,
    stopOnNext: (method: string) => {
      stopOn = method
    },
    stopOnEvery: (method: string | undefined) => {
      stopEvery = method
    },
  }
}

/** `ImageData` for node, which has none: the reader puts the engine's pixels in one. */
export class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number
  ) {}
}

/**
 * Whether the document's reader draws a small corner of its first page onto a canvas with a
 * stubbed 2D context. Node needs `ImageData` stubbed with `FakeImageData` first.
 */
export async function drawn(doc: InkDocument): Promise<boolean> {
  const putImageData = vi.fn()
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ putImageData, drawImage: vi.fn() }),
    ownerDocument: { createElement: () => undefined },
  } as unknown as HTMLCanvasElement
  await doc._reader.draw(
    { page: 0, rotation: 0, zoom: 1, pixelRatio: 1, width: 20, height: 20, hide: [] },
    canvas
  )
  return putImageData.mock.calls.length === 1
}
