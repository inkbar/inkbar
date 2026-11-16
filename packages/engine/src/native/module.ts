import factory from '../../vendor/inkbar-pdfium.mjs'
import { EngineError } from '../errors.ts'

import { FUNCTIONS, type Native } from './functions.ts'

export interface NativeModule {
  fn: Native
  // Getters: memory growth replaces the underlying buffer.
  readonly HEAPU8: Uint8Array
  readonly HEAPF32: Float32Array
  stringToUTF8(str: string, ptr: number, maxBytes: number): void
  lengthBytesUTF8(str: string): number
}

export async function loadNative(source: {
  wasm: string | URL | Uint8Array
}): Promise<NativeModule> {
  const { wasm } = source
  const where = wasm instanceof Uint8Array ? 'the supplied bytes' : String(wasm)
  try {
    const module = await factory(
      wasm instanceof Uint8Array
        ? { wasmBinary: wasm }
        : { locateFile: (path) => (path.endsWith('.wasm') ? String(wasm) : path) }
    )
    const fn: Record<string, (...args: number[]) => number> = {}
    for (const name of Object.keys(FUNCTIONS) as (keyof typeof FUNCTIONS)[]) {
      const bound = module[`_${name}`]
      if (typeof bound !== 'function')
        throw new Error(`the build does not export ${name}`)
      fn[name] = bound as (...args: number[]) => number
    }
    return {
      fn: fn as Native,
      get HEAPU8() {
        return module.HEAPU8
      },
      get HEAPF32() {
        return module.HEAPF32
      },
      stringToUTF8: (str, ptr, maxBytes) => {
        module.stringToUTF8(str, ptr, maxBytes)
      },
      lengthBytesUTF8: (str) => module.lengthBytesUTF8(str),
    }
  } catch (cause) {
    if (cause instanceof EngineError) throw cause
    throw new EngineError(
      'engine-failure',
      `Could not load the PDF engine from ${where}.`,
      { cause }
    )
  }
}
