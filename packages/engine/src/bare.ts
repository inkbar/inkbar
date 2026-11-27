import { createEngineWith } from './engine.ts'

import type { Engine, EngineOptions } from './engine.ts'

export * from './public.ts'

/** `EngineOptions` with the two file locations required. */
export interface BareEngineOptions extends EngineOptions {
  /** URL or bytes of `inkbar-pdfium.wasm`. */
  wasm: string | URL | Uint8Array
  /**
   * URL of the worker script, a Worker, or false to run in the calling thread. Where there is no
   * `Worker` global, a URL is ignored and the engine runs in the calling thread.
   */
  worker: string | URL | Worker | false
}

/**
 * Starts an engine from the files the caller names. Unlike the main entry it has no default
 * locations, so a bundler emits no copy of the wasm or the worker for it. It rejects with a
 * `TypeError` when `wasm` or `worker` is missing; otherwise it behaves as the main entry does.
 */
export function createEngine(options: BareEngineOptions): Promise<Engine> {
  return createEngineWith(options)
}
