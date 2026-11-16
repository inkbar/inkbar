import { EngineError, fromPdfiumError } from '../errors.ts'

import type { OpenOptions, PageInfo, RenderedPage, SaveMode } from '../types.ts'
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

const isOwnError = (error: unknown) =>
  error instanceof EngineError || error instanceof RangeError

interface OpenDocument {
  doc: number
  // PDFium reads the file lazily, so the copy lives until the document closes.
  data: number
  pageCount: number
}

export class EngineCore {
  readonly #native: NativeModule
  readonly #documents = new Map<number, OpenDocument>()
  #nextId = 1
  #destroyed = false
  #stopped = false

  constructor(native: NativeModule) {
    this.#native = native
    try {
      native.fn.INK_Init()
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
    const { fn } = this.#native
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
        if (password !== 0) fn.free(password)
      }
      if (doc === 0) throw fromPdfiumError(fn.FPDF_GetLastError(), hadPassword)
      const pageCount = fn.FPDF_GetPageCount(doc)
      if (pageCount <= 0)
        throw new EngineError('invalid-pdf', 'The file is not a valid PDF.')
      const id = this.#nextId++
      this.#documents.set(id, { doc, data, pageCount })
      return { id, pageCount }
    } catch (error) {
      // A trap leaves the heap unusable; otherwise free what is not registered yet.
      if (isOwnError(error)) {
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
        const { fn } = this.#native
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
      throw new RangeError('scale must be a finite number above 0')
    return this.#guard(() => this.#render(entry, index, scale))
  }

  #render(entry: OpenDocument, index: number, scale: number): RenderedPage {
    return this.#withPage(entry, index, (page) => {
      const { fn } = this.#native
      const width = Math.ceil(fn.FPDF_GetPageWidthF(page) * scale)
      const height = Math.ceil(fn.FPDF_GetPageHeightF(page) * scale)
      if (width < 1 || height < 1 || width * height > MAX_PIXELS)
        throw new RangeError('the rendered page would be too large')
      const bitmap = fn.FPDFBitmap_CreateEx(width, height, BITMAP_BGRA, 0, 0)
      if (bitmap === 0)
        throw new EngineError('out-of-memory', 'The engine ran out of memory.')
      try {
        fn.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xffffffff)
        fn.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, 0, RENDER_FLAGS)
        const stride = fn.FPDFBitmap_GetStride(bitmap)
        const buffer = fn.FPDFBitmap_GetBuffer(bitmap)
        const heap = this.#native.HEAPU8
        const data = new Uint8ClampedArray(width * height * 4)
        for (let y = 0; y < height; y++) {
          const from = buffer + y * stride
          data.set(heap.subarray(from, from + width * 4), y * width * 4)
        }
        return { width, height, data }
      } finally {
        fn.FPDFBitmap_Destroy(bitmap)
      }
    })
  }

  save(id: number, mode: SaveMode): Uint8Array {
    const entry = this.#get(id)
    return this.#guard(() => this.#save(entry, mode))
  }

  #save(entry: OpenDocument, mode: SaveMode): Uint8Array {
    const { fn } = this.#native
    const writer = fn.INK_Save(entry.doc, SAVE_FLAGS[mode])
    if (writer === 0)
      throw new EngineError('engine-failure', 'The document could not be saved.')
    try {
      const data = fn.INK_WriterData(writer)
      const size = fn.INK_WriterSize(writer)
      return this.#native.HEAPU8.slice(data, data + size)
    } finally {
      fn.INK_WriterFree(writer)
    }
  }

  /** Closes a document. After an internal error it only forgets it: the module is not called. */
  close(id: number): void {
    const entry = this.#documents.get(id)
    if (!entry) return
    this.#documents.delete(id)
    if (this.#stopped) return
    this.#guard(() => {
      this.#native.fn.FPDF_CloseDocument(entry.doc)
      this.#native.fn.free(entry.data)
    })
  }

  /** Closes every document and shuts PDFium down. After an internal error the module is not called. */
  destroy(): void {
    if (this.#stopped) {
      this.#documents.clear()
      this.#destroyed = true
      return
    }
    for (const id of [...this.#documents.keys()]) this.close(id)
    if (this.#destroyed || this.#stopped) return
    this.#destroyed = true
    this.#guard(() => {
      this.#native.fn.INK_Destroy()
    })
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
      throw new RangeError(`page index ${index} is outside 0..${entry.pageCount - 1}`)
  }

  #withPage<T>(entry: OpenDocument, index: number, use: (page: number) => T): T {
    const { fn } = this.#native
    const page = fn.FPDF_LoadPage(entry.doc, index)
    if (page === 0)
      throw new EngineError('engine-failure', `Page ${index} could not be loaded.`, {
        pdfiumError: fn.FPDF_GetLastError(),
      })
    try {
      return use(page)
    } finally {
      fn.FPDF_ClosePage(page)
    }
  }

  #allocString(text: string): number {
    const size = this.#native.lengthBytesUTF8(text) + 1
    const ptr = this.#native.fn.malloc(size)
    if (ptr === 0) throw new EngineError('out-of-memory', 'The engine ran out of memory.')
    this.#native.stringToUTF8(text, ptr, size)
    return ptr
  }
}
