import { EngineError, fromPdfiumError } from '../errors.ts'

import { FUNCTIONS } from './functions.ts'

import type { OpenOptions, PageInfo, RenderedPage, SaveMode } from '../types.ts'
import type { Native } from './functions.ts'
import type { NativeModule } from './module.ts'

const BITMAP_BGRA = 4
const RENDER_FLAGS = 0x01 | 0x10 // FPDF_ANNOT | FPDF_REVERSE_BYTE_ORDER
const SAVE_FLAGS: Record<SaveMode, number> = { incremental: 1, rewrite: 2 }
const MAX_PIXELS = 268_435_456

const STOPPED = 'The engine stopped after an internal error; create a new engine.'
const CLOSED = 'The document is closed.'
// Emscripten's abort texts when an allocation or memory growth fails.
const ALLOCATION_ABORT = /\bOOM\b|out of memory|Cannot enlarge memory|bad_alloc/i

/**
 * Maps an error thrown out of the module. A trap leaves the instance unusable, so anything other
 * than the engine's own errors is an internal error.
 */
function internalError(error: unknown): EngineError {
  const text = error instanceof Error ? error.message : String(error)
  if (ALLOCATION_ABORT.test(text))
    return new EngineError('out-of-memory', 'The engine ran out of memory.', {
      cause: error,
    })
  return new EngineError('engine-failure', `The engine failed: ${text}`, { cause: error })
}

/**
 * A bad argument from the caller. Callers see a plain `RangeError`; the subclass lets the engine
 * tell its own range errors from one thrown out of the module, such as a stack overflow.
 */
class ArgumentError extends RangeError {
  constructor(message: string) {
    super(message)
    this.name = 'RangeError'
  }
}

const isOwnError = (error: unknown) =>
  error instanceof EngineError || error instanceof ArgumentError

interface OpenDocument {
  doc: number
  // PDFium reads the file lazily, so the copy lives until the document closes.
  data: number
  pageCount: number
}

export class EngineCore {
  readonly #native: NativeModule
  /** The module's functions. A throw out of one is a trap: it stops the engine at once. */
  readonly #fn: Native
  readonly #documents = new Map<number, OpenDocument>()
  #nextId = 1
  #destroyed = false
  #stopped = false

  constructor(native: NativeModule) {
    this.#native = native
    const fn: Record<string, (...args: number[]) => unknown> = {}
    for (const name of Object.keys(FUNCTIONS) as (keyof Native)[])
      fn[name] = (...args) => {
        try {
          return native.fn[name](...args)
        } catch (error) {
          // Cleanup that runs while the error unwinds must not call into the module again.
          this.#stopped = true
          throw error
        }
      }
    this.#fn = fn as unknown as Native
    try {
      this.#fn.INK_Init()
    } catch (error) {
      throw internalError(error)
    }
  }

  /** True once a call into the module has failed; every later call is refused. */
  get stopped(): boolean {
    return this.#stopped
  }

  get openCount(): number {
    return this.#documents.size
  }

  /** Current size of the WASM heap in bytes. For tests and diagnostics. */
  get heapBytes(): number {
    return this.#native.HEAPU8.byteLength
  }

  open(bytes: Uint8Array, options: OpenOptions = {}): { id: number; pageCount: number } {
    if (this.#destroyed)
      throw new EngineError('engine-failure', 'The engine is destroyed.')
    return this.#guard(() => this.#open(bytes, options))
  }

  #open(bytes: Uint8Array, options: OpenOptions): { id: number; pageCount: number } {
    const fn = this.#fn
    const data = fn.malloc(Math.max(bytes.length, 1))
    if (data === 0)
      throw new EngineError('out-of-memory', 'The engine ran out of memory.')
    let doc = 0
    try {
      this.#native.HEAPU8.set(bytes, data)
      const hadPassword = options.password !== undefined && options.password !== ''
      const password = hadPassword ? this.#allocString(options.password as string) : 0
      try {
        doc = fn.FPDF_LoadMemDocument64(data, bytes.length, password)
      } finally {
        if (password !== 0 && !this.#stopped) fn.free(password)
      }
      if (doc === 0) throw fromPdfiumError(fn.FPDF_GetLastError(), hadPassword)
      const pageCount = fn.FPDF_GetPageCount(doc)
      if (pageCount <= 0)
        throw new EngineError('invalid-pdf', 'The file is not a valid PDF.')
      const id = this.#nextId++
      this.#documents.set(id, { doc, data, pageCount })
      return { id, pageCount }
    } catch (error) {
      // After a trap the heap is unusable; otherwise free what is not registered yet.
      if (!this.#stopped) {
        if (doc !== 0) fn.FPDF_CloseDocument(doc)
        fn.free(data)
      }
      throw error
    }
  }

  pageInfo(id: number, index: number): PageInfo {
    const entry = this.#get(id)
    this.#checkIndex(entry, index)
    return this.#guard(() =>
      this.#withPage(entry, index, (page) => {
        const fn = this.#fn
        const width = fn.FPDF_GetPageWidthF(page)
        const height = fn.FPDF_GetPageHeightF(page)
        const rotation = (((fn.FPDFPage_GetRotation(page) % 4) + 4) % 4) * 90
        // PDFium reports the size after /Rotate; the public size is before it.
        const turned = rotation === 90 || rotation === 270
        return {
          width: turned ? height : width,
          height: turned ? width : height,
          rotation: rotation as PageInfo['rotation'],
        }
      })
    )
  }

  renderPage(id: number, index: number, scale: number): RenderedPage {
    const entry = this.#get(id)
    this.#checkIndex(entry, index)
    if (!Number.isFinite(scale) || scale <= 0)
      throw new ArgumentError('scale must be a finite number above 0')
    return this.#guard(() => this.#render(entry, index, scale))
  }

  #render(entry: OpenDocument, index: number, scale: number): RenderedPage {
    return this.#withPage(entry, index, (page) => {
      const fn = this.#fn
      const width = Math.ceil(fn.FPDF_GetPageWidthF(page) * scale)
      const height = Math.ceil(fn.FPDF_GetPageHeightF(page) * scale)
      if (width < 1 || height < 1 || width * height > MAX_PIXELS)
        throw new ArgumentError('the rendered page would be too large')
      const bitmap = fn.FPDFBitmap_CreateEx(width, height, BITMAP_BGRA, 0, 0)
      if (bitmap === 0)
        throw new EngineError('out-of-memory', 'The engine ran out of memory.')
      try {
        fn.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xffffffff)
        fn.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, 0, RENDER_FLAGS)
        const stride = fn.FPDFBitmap_GetStride(bitmap)
        const buffer = fn.FPDFBitmap_GetBuffer(bitmap)
        const heap = this.#native.HEAPU8
        const row = width * 4
        let data: Uint8ClampedArray
        try {
          data = new Uint8ClampedArray(row * height)
        } catch (cause) {
          // JavaScript could not allocate the copy. The module is unharmed.
          throw new EngineError('out-of-memory', 'The engine ran out of memory.', {
            cause,
          })
        }
        if (stride === row) data.set(heap.subarray(buffer, buffer + row * height))
        else
          for (let y = 0; y < height; y++) {
            const from = buffer + y * stride
            data.set(heap.subarray(from, from + row), y * row)
          }
        return { width, height, data }
      } finally {
        if (!this.#stopped) fn.FPDFBitmap_Destroy(bitmap)
      }
    })
  }

  save(id: number, mode: SaveMode): Uint8Array {
    const entry = this.#get(id)
    return this.#guard(() => this.#save(entry, mode))
  }

  #save(entry: OpenDocument, mode: SaveMode): Uint8Array {
    const fn = this.#fn
    const writer = fn.INK_Save(entry.doc, SAVE_FLAGS[mode])
    if (writer === 0)
      throw new EngineError('engine-failure', 'The document could not be saved.')
    try {
      const data = fn.INK_WriterData(writer)
      const size = fn.INK_WriterSize(writer)
      return this.#native.HEAPU8.slice(data, data + size)
    } finally {
      if (!this.#stopped) fn.INK_WriterFree(writer)
    }
  }

  /** Closes a document. After an internal error it only forgets it: the module is not called. */
  close(id: number): void {
    const entry = this.#documents.get(id)
    if (!entry) return
    this.#documents.delete(id)
    if (this.#stopped) return
    this.#guard(() => {
      this.#fn.FPDF_CloseDocument(entry.doc)
      this.#fn.free(entry.data)
    })
  }

  /**
   * Closes every document and shuts PDFium down. After an internal error the module is not
   * called. A trap while shutting down stops the engine but does not make `destroy` throw.
   */
  destroy(): void {
    if (!this.#stopped && !this.#destroyed) {
      try {
        for (const id of [...this.#documents.keys()]) this.close(id)
        this.#guard(() => {
          this.#fn.INK_Destroy()
        })
      } catch {
        // The guard has marked the core stopped; nothing more can be freed safely.
      }
    }
    this.#documents.clear()
    this.#destroyed = true
  }

  /** Runs a call into the module. A trap stops the engine for good. */
  #guard<T>(work: () => T): T {
    if (this.#stopped) throw new EngineError('engine-failure', STOPPED)
    try {
      return work()
    } catch (error) {
      if (isOwnError(error)) throw error
      this.#stopped = true
      throw internalError(error)
    }
  }

  #get(id: number): OpenDocument {
    if (this.#stopped) throw new EngineError('engine-failure', STOPPED)
    const entry = this.#documents.get(id)
    if (!entry) throw new EngineError('engine-failure', CLOSED)
    return entry
  }

  #checkIndex(entry: OpenDocument, index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= entry.pageCount)
      throw new ArgumentError(`page index ${index} is outside 0..${entry.pageCount - 1}`)
  }

  #withPage<T>(entry: OpenDocument, index: number, use: (page: number) => T): T {
    const fn = this.#fn
    const page = fn.FPDF_LoadPage(entry.doc, index)
    if (page === 0)
      throw new EngineError('engine-failure', `Page ${index} could not be loaded.`, {
        pdfiumError: fn.FPDF_GetLastError(),
      })
    try {
      return use(page)
    } finally {
      if (!this.#stopped) fn.FPDF_ClosePage(page)
    }
  }

  #allocString(text: string): number {
    const size = this.#native.lengthBytesUTF8(text) + 1
    const ptr = this.#fn.malloc(size)
    if (ptr === 0) throw new EngineError('out-of-memory', 'The engine ran out of memory.')
    this.#native.stringToUTF8(text, ptr, size)
    return ptr
  }
}
