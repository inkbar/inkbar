import { EngineError } from './errors.ts'

import type { EngineDefaults } from './engine.ts'

const isNode = () =>
  typeof process !== 'undefined' && typeof process.versions?.node === 'string'

/**
 * The default wasm and worker, found beside this module. A bundler follows the literal
 * `new URL('./…', import.meta.url)` forms and emits both files. Only `index.ts` imports this
 * file, so the `bare` entry carries none of it.
 */
const wasmUrl = () => new URL('./inkbar-pdfium.wasm', import.meta.url)

/**
 * The worker's URL, for messages only. A bundler copies the file at a literal
 * `new URL('./…', import.meta.url)` as an asset, so only the `new Worker(...)` call below names
 * it literally; this one goes through a variable the bundler leaves alone.
 */
const WORKER_FILE = './worker.mjs'

export const defaults: EngineDefaults = {
  wasmUrl,
  async readWasm() {
    const url = wasmUrl()
    if (!isNode()) return url
    try {
      // A module import of a `node:` specifier would be resolved, and rejected, by a browser
      // bundler. This branch runs only in Node, which has `getBuiltinModule` from 22.3.
      const { readFile } = process.getBuiltinModule('node:fs/promises')
      return new Uint8Array(await readFile(url))
    } catch (cause) {
      throw new EngineError(
        'engine-failure',
        `Could not read the PDF engine from ${url.href}.`,
        { cause }
      )
    }
  },
  // The literal `new Worker(new URL(..., import.meta.url))` form is what bundlers look for.
  startWorker: () =>
    new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' }),
  workerHref: () => new URL(WORKER_FILE, import.meta.url).href,
}
