// Test support only, never production code: browser tests import it. Real engines from
// @inkbar/engine as core's engine factory, which a test can stop as a trap in PDFium does, keep
// from starting again, or hold while they start.
import { setEngineFactory } from '../model/engine-factory'

import type { CoreEngine } from '../engine-reader/types'
import type { InkDocument } from '../model/document'

/** What a stopped engine rejects every call with, as the engine does once PDFium traps. */
const stoppedError = (): Error =>
  Object.assign(new Error('stopped'), { code: 'engine-failure' })

/**
 * Makes every engine core starts until `restore()`. `stop(doc)` stops the engines running and
 * keeps new ones from starting, then has `doc` read, so the document finds no engine and stops.
 * `allow()` lets engines start again; `hold()` keeps the next ones waiting until the function it
 * returns is called.
 */
export function stoppableEngines() {
  let refusing = false
  let held: Promise<void> | undefined
  const running: { stopped: boolean }[] = []
  /** `call` on an engine that has not stopped; a stopped one rejects. */
  const live =
    (state: { stopped: boolean }, call: (...args: unknown[]) => unknown) =>
    (...args: unknown[]): unknown =>
      state.stopped ? Promise.reject(stoppedError()) : call(...args)

  const factory = async (): Promise<CoreEngine> => {
    if (held) await held
    if (refusing) throw new Error('no engine')
    const { createEngine } = await import('@inkbar/engine')
    const engine = await createEngine()
    const state = { stopped: false }
    running.push(state)
    return new Proxy(engine, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver) as unknown
        if (typeof value !== 'function') return value
        const bound = (value as (...a: unknown[]) => unknown).bind(target)
        if (key === 'destroy') return bound
        if (key !== 'open') return live(state, bound)
        return live(state, async (...args: unknown[]) => {
          const doc = (await bound(...args)) as object
          return new Proxy(doc, {
            get(d, name, r) {
              const member = Reflect.get(d, name, r) as unknown
              if (typeof member !== 'function') return member
              const call = (member as (...a: unknown[]) => unknown).bind(d)
              return name === 'close' ? call : live(state, call)
            },
          })
        })
      },
    })
  }
  setEngineFactory(factory)

  return {
    async stop(doc: InkDocument): Promise<void> {
      refusing = true
      for (const state of running) state.stopped = true
      const canvas = document.createElement('canvas')
      await doc._reader
        .draw(
          {
            page: 0,
            rotation: 0,
            zoom: 0.1,
            pixelRatio: 1,
            width: 8,
            height: 8,
            hide: [],
          },
          canvas
        )
        .catch(() => undefined)
      if (!doc.engineStopped.get()) throw new Error('The document did not stop')
    },
    allow(): void {
      refusing = false
    },
    hold(): () => void {
      let release!: () => void
      held = new Promise<void>((resolve) => (release = resolve))
      return () => {
        held = undefined
        release()
      }
    },
    restore(): void {
      setEngineFactory(undefined)
    },
  }
}
