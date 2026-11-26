// Starts the engine a document reads and writes with, from the files the host names in `assets`.
// The engine's module is imported here, at the first open, through its entry that names no file
// locations, so importing core loads nothing of it and a host's bundle carries no second copy of
// its files.
import { fontUrls } from '@inkbar/fonts'

import { engineFactory } from './engine-factory'
import { InkError } from './errors'

import type { PdfAssets } from './assets'
import type { CoreEngine } from '../engine-reader/types'
import type * as Bare from '@inkbar/engine/bare'

type EngineModule = typeof Bare

/** The engine's module once imported. A failed import is not kept: the next open tries again. */
let engineModule: Promise<EngineModule> | undefined

const importEngine = (): Promise<EngineModule> => {
  if (engineModule) return engineModule
  const made = import('@inkbar/engine/bare')
  engineModule = made
  made.catch(() => {
    if (engineModule === made) engineModule = undefined
  })
  return made
}

/** Whether this is Node, where the engine runs in the calling thread and reads files from disk. */
const isNode = (): boolean =>
  typeof process !== 'undefined' && typeof process.versions?.node === 'string'

/**
 * `url` resolved against the page, so a relative URL means the same in the engine's worker,
 * whose own URL is the worker script's. Unchanged where there is no page (Node).
 */
function fromPage(url: string): string {
  const base = (globalThis as { document?: { baseURI?: string } }).document?.baseURI
  return base ? new URL(url, base).href : url
}

/** The fallback fonts `fonts` names, each URL resolved against the page. */
function fallbackFonts(
  fonts: PdfAssets['fonts']
): Partial<Record<string, string>> | undefined {
  if (fonts === false) return undefined
  if (typeof fonts === 'string') return fontUrls(fromPage(fonts))
  return Object.fromEntries(
    Object.entries(fonts).flatMap(([key, url]) =>
      typeof url === 'string' ? [[key, fromPage(url)]] : []
    )
  )
}

/** The engine's binary as `createEngine` takes it: its URL, or in Node its bytes, read from disk. */
async function wasmOf(engine: string): Promise<string | Uint8Array> {
  if (!isNode() || typeof Worker !== 'undefined' || /^(https?|data|blob):/i.test(engine))
    return fromPage(engine)
  const { readFile } = process.getBuiltinModule('node:fs/promises')
  const { fileURLToPath } = process.getBuiltinModule('node:url')
  const path = engine.startsWith('file:') ? fileURLToPath(engine) : engine
  return new Uint8Array(await readFile(path))
}

const loadFailed = (message: string, cause: unknown): InkError =>
  new InkError('AssetLoadFailed', message, { cause }, cause)

/**
 * A function that starts a new engine from `assets` each time it is called. It rejects with
 * `AssetLoadFailed`, with the `cause` in its details, when the engine's module cannot be
 * imported, its binary cannot be fetched or read, or its worker cannot start. A font is fetched
 * only when a page needs it, so one that cannot be fetched fails nothing here. While tests set an
 * engine factory, the factory makes the engine instead.
 */
export function engineStarter(assets: PdfAssets): () => Promise<CoreEngine> {
  return async () => {
    const factory = engineFactory()
    if (factory) return factory()
    let module: EngineModule
    try {
      module = await importEngine()
    } catch (cause) {
      throw loadFailed("The engine's module could not be loaded", cause)
    }
    const fonts = fallbackFonts(assets.fonts)
    try {
      const engine = await module.createEngine({
        wasm: await wasmOf(assets.engine),
        worker: fromPage(assets.worker),
        ...(fonts && { fallbackFonts: fonts }),
      })
      return engine
    } catch (cause) {
      throw loadFailed(
        `The engine could not be started from ${assets.engine} and ${assets.worker}`,
        cause
      )
    }
  }
}
