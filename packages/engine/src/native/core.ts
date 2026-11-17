import { ArgumentError, EngineError, fromPdfiumError } from '../errors.ts'

import { writeAnnotation } from './annotations.ts'
import { checkAppearance } from './appearance.ts'
import { writeFields } from './fields.ts'
import { FUNCTIONS } from './functions.ts'

import type {
  OpenOptions,
  PageInfo,
  Rect,
  RenderedPage,
  SaveMode,
  WriteInput,
} from '../types.ts'
import type { Native } from './functions.ts'
import type { NativeModule } from './module.ts'
import type { Heap } from './strings.ts'

const BITMAP_BGRA = 4
const FPDF_ANNOT = 0x01
const FPDF_REVERSE_BYTE_ORDER = 0x10
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
  error instanceof EngineError || error instanceof ArgumentError

interface OpenDocument {
  doc: number
  // PDFium reads the file lazily, so the copy lives until the document closes. `write` loads the
  // document again from it, with the password it was opened with.
  data: number
  size: number
  password: string | undefined
  pageCount: number
  /** True when `doc` holds a write; false when it is the file as opened. */
  written: boolean
}

export class EngineCore {
  readonly #native: NativeModule
  /** The module's functions. A throw out of one is a trap: it stops the engine at once. */
  readonly #fn: Native
  readonly #documents = new Map<number, OpenDocument>()
  readonly #heap: Heap
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
    const isStopped = () => this.#stopped
    this.#heap = {
      fn: this.#fn,
      native,
      get stopped() {
        return isStopped()
      },
    }
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
      const password = options.password === '' ? undefined : options.password
      doc = this.#load(data, bytes.length, password)
      const pageCount = fn.FPDF_GetPageCount(doc)
      if (pageCount <= 0)
        throw new EngineError('invalid-pdf', 'The file is not a valid PDF.')
      const id = this.#nextId++
      this.#documents.set(id, {
        doc,
        data,
        size: bytes.length,
        password,
        pageCount,
        written: false,
      })
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

  /** Loads a document from bytes already in engine memory. */
  #load(data: number, size: number, password: string | undefined): number {
    const fn = this.#fn
    const pointer = password === undefined ? 0 : this.#allocString(password)
    let doc: number
    try {
      doc = fn.FPDF_LoadMemDocument64(data, size, pointer)
    } finally {
      if (pointer !== 0 && !this.#stopped) fn.free(pointer)
    }
    if (doc === 0) throw fromPdfiumError(fn.FPDF_GetLastError(), password !== undefined)
    // Writing ignores the file's permission flags, so every handle has owner permissions: parts
    // of PDFium that consult them would otherwise skip a write the caller asked for.
    fn.EPDF_SetRuntimeOwnerPermissions(doc, 1)
    return doc
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
          box: this.#pageBox(page),
        }
      })
    )
  }

  /** The page box in PDF user space, from PDFium's FS_RECTF (left, top, right, bottom). */
  #pageBox(page: number): Rect {
    const fn = this.#fn
    const rect = fn.malloc(16)
    if (rect === 0)
      throw new EngineError('out-of-memory', 'The engine ran out of memory.')
    try {
      if (!fn.FPDF_GetPageBoundingBox(page, rect))
        throw new EngineError('engine-failure', 'The page box could not be read.')
      const at = rect / 4
      const heap = this.#native.HEAPF32
      const left = heap[at] as number
      const top = heap[at + 1] as number
      const right = heap[at + 2] as number
      const bottom = heap[at + 3] as number
      return { x: left, y: bottom, width: right - left, height: top - bottom }
    } finally {
      if (!this.#stopped) fn.free(rect)
    }
  }

  renderPage(id: number, index: number, scale: number, annotations = true): RenderedPage {
    const entry = this.#get(id)
    this.#checkIndex(entry, index)
    if (!Number.isFinite(scale) || scale <= 0)
      throw new ArgumentError('scale must be a finite number above 0')
    return this.#guard(() => this.#render(entry, index, scale, annotations))
  }

  #render(
    entry: OpenDocument,
    index: number,
    scale: number,
    annotations: boolean
  ): RenderedPage {
    return this.#withPage(entry, index, (page) => {
      const fn = this.#fn
      const width = Math.ceil(fn.FPDF_GetPageWidthF(page) * scale)
      const height = Math.ceil(fn.FPDF_GetPageHeightF(page) * scale)
      if (width < 1 || height < 1 || width * height > MAX_PIXELS)
        throw new ArgumentError('the rendered page would be too large')
      const flags = (annotations ? FPDF_ANNOT : 0) | FPDF_REVERSE_BYTE_ORDER
      const bitmap = fn.FPDFBitmap_CreateEx(width, height, BITMAP_BGRA, 0, 0)
      if (bitmap === 0)
        throw new EngineError('out-of-memory', 'The engine ran out of memory.')
      try {
        fn.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xffffffff)
        fn.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, 0, flags)
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

  /** Saves with `mode`, or with none: incrementally when the file has a signature field. */
  save(id: number, mode: SaveMode | undefined): Uint8Array {
    const entry = this.#get(id)
    return this.#guard(() => this.#save(entry, mode))
  }

  #save(entry: OpenDocument, mode: SaveMode | undefined): Uint8Array {
    const fn = this.#fn
    const chosen =
      mode ?? (fn.FPDF_GetSignatureCount(entry.doc) > 0 ? 'incremental' : 'rewrite')
    const writer = fn.INK_Save(entry.doc, SAVE_FLAGS[chosen])
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

  /**
   * Writes `input` into the document as opened: the document is loaded again from its bytes, and
   * replaced only when every part of the input is written. A bad argument is an `ArgumentError`
   * before any native call; a part that cannot be written is `write-failed`, and the document is
   * then the file as opened.
   */
  write(id: number, input: WriteInput): void {
    const entry = this.#get(id)
    this.#checkWrite(entry, input)
    this.#guard(() => {
      this.#write(entry, input)
    })
  }

  #checkWrite(entry: OpenDocument, input: WriteInput): void {
    for (const ref of input.remove ?? []) {
      this.#checkIndex(entry, ref.page)
      if (!Number.isInteger(ref.objectNumber) || ref.objectNumber <= 0)
        throw new ArgumentError(
          `object number ${ref.objectNumber} is not a whole number above 0`
        )
    }
    for (const item of input.annotations ?? []) {
      this.#checkIndex(entry, item.page)
      const id = item.annotation.id
      if (typeof id !== 'string')
        throw new ArgumentError('an annotation has no string id')
      if (typeof item.data !== 'string')
        throw new ArgumentError(`annotation ${id}: data must be a string`)
      if (item.appearance) checkAppearance(item.appearance, `annotation ${id}`)
    }
    for (const [name, field] of Object.entries(input.fields ?? {})) {
      const { value, text } = field
      const strings =
        typeof value === 'string' ||
        (Array.isArray(value) && value.every((v) => typeof v === 'string'))
      if (!strings)
        throw new ArgumentError(
          `field "${name}": value must be a string or a list of strings`
        )
      if (text !== undefined && typeof text !== 'string')
        throw new ArgumentError(`field "${name}": text must be a string`)
    }
  }

  #write(entry: OpenDocument, input: WriteInput): void {
    const fn = this.#fn
    const fresh = this.#load(entry.data, entry.size, entry.password)
    try {
      this.#apply(fresh, input)
    } catch (error) {
      if (!this.#stopped) {
        fn.FPDF_CloseDocument(fresh)
        if (entry.written) this.#reopen(entry)
      }
      throw error
    }
    fn.FPDF_CloseDocument(entry.doc)
    entry.doc = fresh
    entry.written = true
  }

  /** Puts the document back to the file as opened, after a failed write. */
  #reopen(entry: OpenDocument): void {
    let doc: number
    try {
      doc = this.#load(entry.data, entry.size, entry.password)
    } catch {
      // It loaded before, so only a lack of memory stops it now; keep the last write.
      return
    }
    this.#fn.FPDF_CloseDocument(entry.doc)
    entry.doc = doc
    entry.written = false
  }

  /**
   * Sets form values first, then removes annotations, then appends, in input order. A page
   * stays loaded until its last use, or to the end when it holds the parent of a reply, whose
   * handle stays open for the reply to link to.
   */
  #apply(doc: number, input: WriteInput): void {
    const fn = this.#fn
    writeFields(this.#heap, doc, input.fields ?? {})
    const remove = input.remove ?? []
    const annotations = input.annotations ?? []
    const steps = [
      ...remove.map((ref) => ref.page),
      ...annotations.map((item) => item.page),
    ]
    const lastUse = new Map<number, number>()
    steps.forEach((page, step) => lastUse.set(page, step))
    const parentIds = new Set(annotations.map((item) => item.annotation.inReplyTo))
    const pages = new Map<number, number>()
    const parents = new Map<string, number>()
    const pinned = new Set<number>()
    const page = (index: number) => {
      let loaded = pages.get(index)
      if (loaded === undefined) {
        loaded = fn.FPDF_LoadPage(doc, index)
        if (loaded === 0)
          throw new EngineError('write-failed', `Page ${index} could not be loaded.`, {
            pdfiumError: fn.FPDF_GetLastError(),
          })
        pages.set(index, loaded)
      }
      return loaded
    }
    const done = (index: number, step: number) => {
      const loaded = pages.get(index)
      if (loaded === undefined || pinned.has(index) || lastUse.get(index) !== step) return
      pages.delete(index)
      fn.FPDF_ClosePage(loaded)
    }
    try {
      remove.forEach((ref, step) => {
        if (!fn.EPDFPage_RemoveAnnotByObjectNumber(page(ref.page), ref.objectNumber))
          throw new EngineError(
            'write-failed',
            `The annotation in object ${ref.objectNumber} on page ${ref.page} could not be removed.`
          )
        done(ref.page, step)
      })
      annotations.forEach((item, index) => {
        const id = item.annotation.id
        const annot = writeAnnotation(this.#heap, doc, page(item.page), item, parents)
        if (parentIds.has(id) && !parents.has(id)) {
          parents.set(id, annot)
          pinned.add(item.page)
        } else fn.FPDFPage_CloseAnnot(annot)
        done(item.page, remove.length + index)
      })
    } finally {
      if (!this.#stopped) {
        for (const annot of parents.values()) fn.FPDFPage_CloseAnnot(annot)
        for (const loaded of pages.values()) fn.FPDF_ClosePage(loaded)
      }
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
