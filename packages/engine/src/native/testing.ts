// Test support: not imported by the package itself.
import type { Native } from './functions.ts'
import type { NativeModule } from './module.ts'

/** The same module with its functions replaced. Memory views still follow the real module. */
export function withFunctions(native: NativeModule, fn: Native): NativeModule {
  return {
    fn,
    get HEAPU8() {
      return native.HEAPU8
    },
    get HEAPF32() {
      return native.HEAPF32
    },
    stringToUTF8: (str, ptr, maxBytes) => {
      native.stringToUTF8(str, ptr, maxBytes)
    },
    lengthBytesUTF8: (str) => native.lengthBytesUTF8(str),
  }
}
