import { defaults } from './defaults.ts'
import { createEngineWith } from './engine.ts'

import type { Engine, EngineOptions } from './engine.ts'

export * from './public.ts'

/**
 * Starts an engine. It loads the WebAssembly module and, in a worker, the worker script. Later it
 * fetches only the `fallbackFonts` a page needs. It rejects with `engine-failure`, naming the
 * URL, when the module or the worker cannot be loaded, or a font URL is not valid.
 */
export function createEngine(options: EngineOptions = {}): Promise<Engine> {
  return createEngineWith(options, defaults)
}
