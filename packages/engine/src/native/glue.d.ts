// The Emscripten glue is plain JavaScript; only the surface this package uses is typed.
declare module '*/inkbar-pdfium.mjs' {
  export interface EmscriptenModule {
    HEAPU8: Uint8Array
    HEAPF32: Float32Array
    stringToUTF8(str: string, ptr: number, maxBytes: number): void
    lengthBytesUTF8(str: string): number
    [exportName: `_${string}`]: unknown
  }
  const factory: (options?: {
    wasmBinary?: Uint8Array
    locateFile?: (path: string) => string
  }) => Promise<EmscriptenModule>
  export default factory
}
