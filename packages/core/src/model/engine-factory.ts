// A way for tests to hand core the engine a document uses, in place of the one core starts from
// the host's assets.
import type { CoreEngine } from '../engine-reader/types'

let factory: (() => Promise<CoreEngine>) | undefined

/** Sets, or with `undefined` clears, the factory that makes every engine core starts. */
export function setEngineFactory(next: (() => Promise<CoreEngine>) | undefined): void {
  factory = next
}

/** The factory tests set, while one is set. */
export function engineFactory(): (() => Promise<CoreEngine>) | undefined {
  return factory
}
