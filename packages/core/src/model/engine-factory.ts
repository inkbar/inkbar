// A way for tests to hand core the engine a document uses, in place of the host's loader.
import type { EngineLoader, SaveEngine } from './save/saver'

let factory: (() => Promise<SaveEngine>) | undefined

/** Sets, or with `undefined` clears, the factory that makes every engine core starts. */
export function setEngineFactory(next: (() => Promise<SaveEngine>) | undefined): void {
  factory = next
}

/**
 * The loader core uses: while a factory is set it makes the engine and the host's loader is not
 * called; otherwise it is the host's loader, as given.
 */
export function effectiveLoader(
  host: EngineLoader | undefined
): EngineLoader | undefined {
  if (!host && !factory) return undefined
  return () =>
    factory
      ? Promise.resolve({ createEngine: factory })
      : host
        ? host()
        : Promise.reject(new Error('No engine loader'))
}
