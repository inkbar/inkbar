import { ArgumentError, EngineError, fromPdfiumError } from '../errors.ts'
import { createFontLoader, keysOf, type FontSources } from '../fonts.ts'
import { anySignal } from '../signals.ts'

import { writeAnnotation } from './annotations.ts'
import { checkAppearance } from './appearance.ts'
import { hasSignature, writeFields } from './fields.ts'
import { pageNeeds, registerFont } from './fonts.ts'
import { FUNCTIONS } from './functions.ts'
import { inspectDocument } from './inspect.ts'
import { applyRedactions } from './redact.ts'
import { hiddenObjects, renderGeometry } from './render.ts'
import { readPageText } from './text.ts'

import type { RenderRequestOptions } from '../protocol.ts'
import type {
  FontKey,
  OpenOptions,
  PageInfo,
  PageText,
  Rect,
  RedactInput,
  RedactionFindings,
  RedactionRegion,
  RedactResult,
  RenderedPage,
  SaveMode,
  WriteInput,
} from '../types.ts'
import type { Native } from './functions.ts'
import type { NativeModule } from './module.ts'
import type { Heap } from './strings.ts'

const BITMAP_BGRA = 4
const FPDF_ANNOT = 0x01
/** The build's flag for drawing form widgets, which the annotation flag alone leaves out. */
const RENDER_WIDGETS = 0x8000
const SAVE_FLAGS: Record<SaveMode, number> = { incremental: 1, rewrite: 2 }
/**
 * The longest one slice of a render runs, in milliseconds. Between slices a sliced render returns
 * to the event loop, so an abort is seen within about one slice.
 */
export const SLICE_MS = 8

const STOPPED = 'The engine stopped after an internal error; create a new engine.'
const CLOSED = 'The document is closed.'
const BUSY = 'A render is running; the engine runs one call at a time.'
const DESTROYED = 'The engine is destroyed.'

/**
 * Resolves in a later task, so messages and events that arrived meanwhile are handled first. A
 * channel message is used rather than `setTimeout(0)`, which browsers hold back to 4 ms once
 * timers nest, a third of every 8 ms slice. Each wait has its own channel, closed once used, so
 * no open port keeps a Node process alive.
 */
export function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel()
    port1.onmessage = () => {
      port1.close()
      resolve()
    }
    port2.postMessage(null)
  })
}

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
  /** True when `doc` holds a redaction, which only a full rewrite may save. */
  redacted: boolean
  /** Whether the file is encrypted. */
  encrypted: boolean
  /** The fallback fonts each page needs, by page index, as read so far from `doc`. */
  needs: Map<number, readonly FontKey[]>
}

/** Options for `EngineCore`. */
export interface CoreOptions {
  /** Where each fallback font comes from; with none, nothing is fetched. */
  fallbackFonts?: FontSources | undefined
}

/** A drawn page, before the fonts it missed are added. */
type Drawn = Omit<RenderedPage, 'missingFonts'>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** The fork takes 32-bit floats, so a number must stay finite as one. */
const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(Math.fround(n))
const isPoint = (p: unknown) => isRecord(p) && finite(p.x) && finite(p.y)
const isQuad = (q: unknown) => isRecord(q) && [q.p1, q.p2, q.p3, q.p4].every(isPoint)

/**
 * Throws an `ArgumentError` for a mark the apply cannot read: one that is not a `redact`
 * annotation, has no appearance, or has neither quads, each with four finite corners, nor a
 * finite rectangle.
 */
function checkMark(item: Record<string, unknown>, i: number): void {
  const annotation = item.annotation as Record<string, unknown>
  const name = typeof annotation.id === 'string' ? annotation.id : `mark ${i}`
  if (annotation.type !== 'redact')
    throw new ArgumentError(`${name}: a mark must be a redact annotation`)
  if (!isRecord(item.appearance))
    throw new ArgumentError(`${name}: a mark needs an appearance`)
  const { quads, rect } = annotation
  if (quads !== undefined && !Array.isArray(quads))
    throw new ArgumentError(`${name}: quads must be a list`)
  if (Array.isArray(quads) && quads.length > 0) {
    if (!quads.every(isQuad))
      throw new ArgumentError(
        `${name}: every quad needs p1 to p4, each with an x and y finite as 32-bit floats`
      )
    return
  }
  const box = isRecord(rect) && [rect.x, rect.y, rect.width, rect.height].every(finite)
  if (!box)
    throw new ArgumentError(
      `${name}: a mark without quads needs a rect with a finite x, y, width and height`
    )
}

/** Throws an `ArgumentError` for redact input whose shape `#checkWrite` cannot read. */
function checkRedactInput(input: unknown): void {
  if (!isRecord(input)) throw new ArgumentError('the input must be an object')
  const list = (key: string, required: boolean) => {
    const value = input[key]
    if (value === undefined && !required) return
    if (!Array.isArray(value)) throw new ArgumentError(`${key} must be a list`)
    if (!value.every(isRecord))
      throw new ArgumentError(`every item of ${key} must be an object`)
  }
  list('marks', true)
  list('remove', false)
  list('annotations', false)
  if (input.fields !== undefined && !isRecord(input.fields))
    throw new ArgumentError('fields must be an object')
  for (const key of ['marks', 'annotations'])
    for (const item of (input[key] as Record<string, unknown>[] | undefined) ?? [])
      if (!isRecord(item.annotation))
        throw new ArgumentError(`every item of ${key} must hold an annotation`)
  const marks = input.marks as Record<string, unknown>[]
  marks.forEach(checkMark)
}

/**
 * Throws an `ArgumentError` for regions `checkRedaction` cannot read. Whether each page is in
 * the file is checked once the file is loaded.
 */
function checkRegions(regions: unknown): void {
  if (regions === undefined) return
  if (!Array.isArray(regions)) throw new ArgumentError('regions must be a list')
  regions.forEach((region: unknown, i) => {
    if (!isRecord(region)) throw new ArgumentError(`region ${i} must be an object`)
    if (!Number.isInteger(region.page))
      throw new ArgumentError(`region ${i}: page must be a whole number`)
    const { quads } = region
    if (!Array.isArray(quads) || quads.length === 0)
      throw new ArgumentError(`region ${i} must have at least one quad`)
    for (const quad of quads as unknown[]) {
      if (!isQuad(quad))
        throw new ArgumentError(
          `region ${i}: every quad needs p1 to p4, each with an x and y finite as 32-bit floats`
        )
    }
  })
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
  /** True while a sliced render is between its first and last slice. */
  #rendering = false
  /** Set by `destroy()` during a sliced render, which then stops and destroys the engine. */
  #destroyAfterRender = false
  /** Aborted by `destroy()` during a sliced render, to stop a font fetch it is waiting on. */
  readonly #ending = new AbortController()
  readonly #fonts: ReturnType<typeof createFontLoader>

  constructor(native: NativeModule, options: CoreOptions = {}) {
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
    this.#fonts = createFontLoader(options.fallbackFonts, (key, bytes) =>
      this.#guard(() => registerFont(this.#heap, key, bytes))
    )
  }

  /**
   * True when the engine was given at least one fallback font source. Without one, `write` and
   * `redact` do no font work at all.
   */
  get fetchesFonts(): boolean {
    return this.#fonts.fetches
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
    this.#checkLive()
    this.#checkIdle()
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
      const loaded = this.#load(data, bytes.length, password)
      doc = loaded.doc
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
        redacted: false,
        encrypted: loaded.encrypted,
        needs: new Map(),
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

  /** Loads a document from bytes already in engine memory, and says whether it is encrypted. */
  #load(
    data: number,
    size: number,
    password: string | undefined
  ): { doc: number; encrypted: boolean } {
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
    // of PDFium that consult them would otherwise skip a write the caller asked for. The call
    // returns false only for a file with no encryption, which has no permission flags to lift.
    const encrypted = fn.EPDF_SetRuntimeOwnerPermissions(doc, 1) !== 0
    return { doc, encrypted }
  }

  pageInfo(id: number, index: number): PageInfo {
    const entry = this.#get(id)
    this.#checkIndex(entry, index)
    return this.#guard(() => this.#facts(entry, index))
  }

  /**
   * Reads the page's characters with the fallback fonts as they stand: it fetches none. Text read
   * before a page's fallback fonts are registered keeps PDFium's substitute in the document, which
   * a later render then draws, so the engine reads text through `pageTextAfterFonts`.
   */
  pageText(id: number, index: number): PageText {
    const entry = this.#get(id)
    this.#checkIndex(entry, index)
    return this.#guard(() => readPageText(this.#heap, entry.doc, index))
  }

  /**
   * `pageText`, after fetching and registering the fallback fonts the page needs, as a render
   * does before its first slice: the characters' fonts are the ones the page will be drawn with.
   * With no font sources it is `pageText`, with nothing read or awaited first.
   */
  async pageTextAfterFonts(
    id: number,
    index: number,
    signal?: AbortSignal
  ): Promise<PageText> {
    if (!this.#fonts.fetches) return this.pageText(id, index)
    const entry = this.#get(id)
    this.#checkIndex(entry, index)
    return this.#afterFonts(entry, [index], signal, () => this.pageText(id, index))
  }

  /**
   * A page's size, rotation, box and user unit, read from its dictionary without loading the
   * page: loading it would load its fonts, and a document keeps the fonts it loaded first.
   */
  #facts(entry: OpenDocument, index: number): PageInfo {
    const fn = this.#fn
    const out = fn.malloc(24)
    if (out === 0) throw new EngineError('out-of-memory', 'The engine ran out of memory.')
    try {
      if (!fn.INK_Page_Facts(entry.doc, index, out))
        throw new EngineError('engine-failure', `Page ${index} could not be loaded.`, {
          pdfiumError: fn.FPDF_GetLastError(),
        })
      const at = out / 4
      const heap = this.#native.HEAPF32
      const [left, bottom, right, top, rotation, userUnit] = Array.from(
        heap.subarray(at, at + 6)
      ) as [number, number, number, number, number, number]
      return {
        // As the loaded page reports them: computed in 32-bit floats.
        width: Math.fround(right - left),
        height: Math.fround(top - bottom),
        rotation: rotation as PageInfo['rotation'],
        box: { x: left, y: bottom, width: right - left, height: top - bottom },
        userUnit,
      }
    } finally {
      if (!this.#stopped) fn.free(out)
    }
  }

  #info(page: number): PageInfo {
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
      userUnit: fn.INK_Page_UserUnit(page),
    }
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

  /**
   * Draws a page in one go, with the fallback fonts already registered: it fetches none. Its
   * `missingFonts` lists every font the page needs that is not registered.
   */
  renderPage(
    id: number,
    index: number,
    options: RenderRequestOptions = {}
  ): RenderedPage {
    const { entry, steps } = this.#renderSteps(id, index, options)
    return this.#guard(() => {
      const missingFonts = this.#fonts.missing(this.#needs(entry, index))
      let step = steps.next()
      while (!step.done) step = steps.next()
      return { ...step.value, missingFonts }
    })
  }

  /**
   * Draws a page in slices of `SLICE_MS`, returning to the event loop between them. Before each
   * slice it asks `aborted`; once that says true, or `destroy()` has been called, the render
   * ends, frees what it took and rejects with `aborted`.
   *
   * Before the first slice it fetches and registers the fallback fonts the page needs and has
   * not had yet, so the page's first draw has every font it will ever get. `signal` stops that
   * fetch; it should abort whenever `aborted` turns true.
   */
  async renderPageSliced(
    id: number,
    index: number,
    options: RenderRequestOptions,
    aborted: () => boolean,
    signal?: AbortSignal
  ): Promise<RenderedPage> {
    const { entry, steps } = this.#renderSteps(id, index, options)
    this.#rendering = true
    const stop = () => aborted() || this.#destroyAfterRender
    try {
      const fonts = this.#ensureFonts(entry, [index], signal)
      const missingFonts = Array.isArray(fonts) ? fonts : await fonts
      for (;;) {
        if (stop()) throw new EngineError('aborted', 'The call was aborted.')
        const step = this.#guard(() => steps.next())
        if (step.done) return { ...step.value, missingFonts }
        await nextTask()
      }
    } finally {
      // A render stopped part way runs its cleanup here: it ends the render, then frees the
      // bitmap and the page. A finished or failed render has already done so. After a trap the
      // module is not called again.
      try {
        if (!this.#stopped) this.#guard(() => steps.return(undefined as never))
      } finally {
        this.#rendering = false
        if (this.#destroyAfterRender) this.destroy()
      }
    }
  }

  /**
   * Checks the arguments at once, then draws when stepped: the first step loads the page and
   * starts the render, and each step after runs one slice. It pauses after every slice that
   * leaves more to do, and returns the pixels. Ending it early (`return`) ends the render and
   * frees what it took.
   */
  #renderSteps(
    id: number,
    index: number,
    options: RenderRequestOptions
  ): { entry: OpenDocument; steps: Generator<undefined, Drawn> } {
    const entry = this.#get(id)
    this.#checkIndex(entry, index)
    if (!isRecord(options)) throw new ArgumentError('the options must be an object')
    const hide = hiddenObjects(options.hide)
    return { entry, steps: this.#render(entry, index, options, hide) }
  }

  /**
   * Fetches and registers the fallback fonts `pages` need and have not had, and resolves with
   * those still missing. With no needs, or no font sources, it answers at once without waiting.
   * Called while the core is busy, so no other call runs meanwhile. Rejects with `aborted` when
   * `signal` aborts or `destroy()` is called.
   */
  #ensureFonts(
    entry: OpenDocument,
    pages: Iterable<number>,
    signal: AbortSignal | undefined
  ): FontKey[] | Promise<FontKey[]> {
    const needs = new Set<FontKey>()
    this.#guard(() => {
      for (const index of pages)
        for (const key of this.#needs(entry, index)) needs.add(key)
    })
    if (needs.size === 0 || !this.#fonts.fetches) return this.#fonts.missing([...needs])
    const stop = anySignal([signal, this.#ending.signal])
    return this.#fonts.ensure([...needs], stop.signal).finally(stop.dispose)
  }

  /**
   * Runs `work` once the fonts of `pages` are fetched. Like a sliced render, the core refuses
   * other calls during the fetch, and a `destroy()` meanwhile stops it and rejects with
   * `aborted`.
   */
  async #afterFonts<T>(
    entry: OpenDocument,
    pages: Iterable<number>,
    signal: AbortSignal | undefined,
    work: () => T
  ): Promise<T> {
    this.#rendering = true
    try {
      await this.#ensureFonts(entry, pages, signal)
      if (this.#destroyAfterRender)
        throw new EngineError('aborted', 'The call was aborted.')
    } finally {
      this.#rendering = false
      if (this.#destroyAfterRender) this.destroy()
    }
    return work()
  }

  /** The fallback fonts a page needs, read once per document and page. */
  #needs(entry: OpenDocument, index: number): readonly FontKey[] {
    let keys = entry.needs.get(index)
    if (keys === undefined) {
      keys = keysOf(pageNeeds(this.#heap, entry.doc, index))
      entry.needs.set(index, keys)
    }
    return keys
  }

  /**
   * Draws a page through the fork's sliced render, which leaves out the annotations in `hide`
   * and puts the document back as it was before it returns from starting.
   */
  *#render(
    entry: OpenDocument,
    index: number,
    options: RenderRequestOptions,
    hide: readonly number[]
  ): Generator<undefined, Drawn> {
    const fn = this.#fn
    const page = this.#loadPage(entry, index)
    try {
      const geometry = renderGeometry(this.#info(page), options)
      const { width, height } = geometry
      // Not FPDF_REVERSE_BYTE_ORDER: with it, PDFium leaves a part-transparent pixel's alpha
      // as it was when a translucent fill is laid over it, which shows as a pale fringe on the
      // edges of text under a highlight. `#copyBitmap` puts the bytes in order instead.
      const flags = options.annotations === false ? 0 : FPDF_ANNOT | RENDER_WIDGETS
      const bitmap = fn.FPDFBitmap_CreateEx(width, height, BITMAP_BGRA, 0, 0)
      if (bitmap === 0)
        throw new EngineError('out-of-memory', 'The engine ran out of memory.')
      let skip = 0
      let render = 0
      try {
        // An empty page, not white paper: a blend mode mixes with what is under it, and under
        // the first thing drawn there is nothing. On white, Screen and SoftLight content
        // vanishes. `#copyBitmap` lays the result over white.
        fn.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0x00000000)
        if (hide.length > 0) {
          skip = fn.malloc(hide.length * 4)
          if (skip === 0)
            throw new EngineError('out-of-memory', 'The engine ran out of memory.')
          const heap = this.#native.HEAPU8
          new Uint32Array(heap.buffer, heap.byteOffset + skip, hide.length).set(hide)
        }
        render = fn.INK_Render_Start(
          bitmap,
          page,
          geometry.startX,
          geometry.startY,
          geometry.sizeX,
          geometry.sizeY,
          geometry.rotate,
          flags,
          skip,
          hide.length
        )
        if (render === 0)
          throw new EngineError('engine-failure', `Page ${index} could not be drawn.`)
        let state = fn.INK_Render_Continue(render, SLICE_MS)
        while (state === 0) {
          yield
          state = fn.INK_Render_Continue(render, SLICE_MS)
        }
        if (state !== 1)
          throw new EngineError('engine-failure', `Page ${index} could not be drawn.`)
        return this.#copyBitmap(bitmap, width, height)
      } finally {
        if (!this.#stopped) {
          // The render ends before the bitmap it draws into goes.
          fn.INK_Render_Close(render)
          if (skip !== 0) fn.free(skip)
          fn.FPDFBitmap_Destroy(bitmap)
        }
      }
    } finally {
      if (!this.#stopped) fn.FPDF_ClosePage(page)
    }
  }

  /** The bitmap's pixels as tightly packed RGBA rows over white, opaque, in memory the caller owns. */
  #copyBitmap(bitmap: number, width: number, height: number): Drawn {
    const fn = this.#fn
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
    overWhite(data)
    return { width, height, data }
  }

  /** Saves with `mode`, or with none: incrementally when the file holds a digital signature. */
  save(id: number, mode: SaveMode | undefined): Uint8Array {
    const entry = this.#get(id)
    // An incremental save keeps the earlier revision, and with it what the redaction removed.
    if (entry.redacted && mode === 'incremental')
      throw new ArgumentError(
        'a redacted document is saved by rewriting it, not incrementally'
      )
    return this.#guard(() => this.#save(entry, mode))
  }

  #save(entry: OpenDocument, mode: SaveMode | undefined): Uint8Array {
    const fn = this.#fn
    const chosen = entry.redacted
      ? 'rewrite'
      : (mode ?? (hasSignature(this.#heap, entry.doc) ? 'incremental' : 'rewrite'))
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
    // A write starts again from the opened bytes, so it would silently undo the redaction.
    if (entry.redacted)
      throw new ArgumentError(
        'the document holds a redaction; save it and open the redacted bytes as a new document to write to them'
      )
    this.#checkWrite(entry, input)
    this.#guard(() => {
      this.#write(entry, input)
    })
  }

  /**
   * `write`, after fetching the fallback fonts of the pages it loads: those it removes from,
   * appends to, and that hold an annotation replied to. With form values, every page: redrawing
   * a field loads the font its /DA names, and the text the appearance holds depends on it. That
   * loads each page once, which takes time on a long document.
   *
   * Not covered: a field font named only in the form's /DR and used by no page. The page needs
   * call counts page resources, not /DR, so that font is not fetched first, and the appearance
   * bytes then depend on whether an earlier render registered its key. The module writes a wrong
   * appearance string for such a two-byte font either way.
   *
   * With no font sources it is `write`, with nothing read or awaited first.
   */
  async writeAfterFonts(
    id: number,
    input: WriteInput,
    signal?: AbortSignal
  ): Promise<void> {
    const entry = this.#get(id)
    if (entry.redacted || !this.#fonts.fetches) return this.write(id, input)
    this.#checkWrite(entry, input)
    const pages = new Set<number>()
    if (Object.keys(input.fields ?? {}).length > 0)
      for (let i = 0; i < entry.pageCount; i++) pages.add(i)
    for (const ref of input.remove ?? []) pages.add(ref.page)
    for (const item of input.annotations ?? []) {
      pages.add(item.page)
      if (item.replyTo) pages.add(item.replyTo.page)
    }
    await this.#afterFonts(entry, pages, signal, () => {
      this.write(id, input)
    })
  }

  /**
   * `redact`, after fetching the fallback fonts of every page: the apply visits each page, not
   * only those with marks. With no font sources it is `redact`, with nothing read or awaited
   * first.
   */
  async redactAfterFonts(
    id: number,
    input: RedactInput,
    signal?: AbortSignal
  ): Promise<RedactResult> {
    if (!this.#fonts.fetches) return this.redact(id, input)
    const entry = this.#get(id)
    checkRedactInput(input)
    const pages = Array.from({ length: entry.pageCount }, (_, i) => i)
    return this.#afterFonts(entry, pages, signal, () => this.redact(id, input))
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
      if (item.replyTo !== undefined) {
        this.#checkIndex(entry, item.replyTo.page)
        if (
          !Number.isInteger(item.replyTo.objectNumber) ||
          item.replyTo.objectNumber <= 0
        )
          throw new ArgumentError(
            `annotation ${String(item.annotation.id)}: replyTo object number ${item.replyTo.objectNumber} is not a whole number above 0`
          )
      }
      const id = item.annotation.id
      if (typeof id !== 'string')
        throw new ArgumentError('an annotation has no string id')
      if (typeof item.data !== 'string')
        throw new ArgumentError(`annotation ${id}: data must be a string`)
      if (item.appearance) checkAppearance(item.appearance, `annotation ${id}`)
    }
    for (const [name, field] of Object.entries(input.fields ?? {})) {
      if (!isRecord(field)) throw new ArgumentError(`field "${name}" must be an object`)
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
    this.#replace(entry, false, (doc) => {
      this.#apply(doc, input)
    })
  }

  /**
   * Runs `work` on the document loaded again from its bytes, and puts the result in place of the
   * document when it succeeds. When it fails the document is put back to the file as opened.
   */
  #replace<T>(entry: OpenDocument, redacted: boolean, work: (doc: number) => T): T {
    const fn = this.#fn
    const fresh = this.#load(entry.data, entry.size, entry.password).doc
    let result: T
    try {
      result = work(fresh)
    } catch (error) {
      if (!this.#stopped) {
        fn.FPDF_CloseDocument(fresh)
        if (entry.written) this.#reopen(entry)
      }
      throw error
    }
    fn.FPDF_CloseDocument(entry.doc)
    entry.doc = fresh
    entry.needs.clear()
    entry.written = true
    entry.redacted = redacted
    return result
  }

  /**
   * Applies redaction marks and sanitises, on the document as opened, as `write` writes: the
   * document is replaced only when everything succeeds. Bad input is an `ArgumentError` before
   * any native call, checked as `write` checks it.
   */
  redact(id: number, input: RedactInput): RedactResult {
    const entry = this.#get(id)
    checkRedactInput(input)
    this.#checkWrite(entry, {
      ...(input.remove && { remove: input.remove }),
      annotations: [...input.marks, ...(input.annotations ?? [])],
      ...(input.fields && { fields: input.fields }),
    })
    return this.#guard(() =>
      this.#replace(entry, true, (doc) =>
        applyRedactions(this.#heap, doc, input, {
          data: entry.data,
          size: entry.size,
          pageCount: entry.pageCount,
          encrypted: entry.encrypted,
          pageBox: (page) => this.#pageBox(page),
          writeAnnotations: (annotations) => {
            this.#apply(doc, { annotations })
          },
        })
      )
    )
  }

  /**
   * Checks what is left under `regions` of a file, or, without regions, under the candidates
   * the fork finds. The file is loaded on its own and closed before the call returns; open
   * documents are not touched.
   */
  checkRedaction(
    bytes: Uint8Array,
    options: { password?: string; regions?: readonly RedactionRegion[] } = {}
  ): RedactionFindings {
    this.#checkLive()
    if (this.#stopped) throw new EngineError('engine-failure', STOPPED)
    this.#checkIdle()
    checkRegions(options.regions)
    return this.#guard(() => {
      const fn = this.#fn
      const data = fn.malloc(Math.max(bytes.length, 1))
      if (data === 0)
        throw new EngineError('out-of-memory', 'The engine ran out of memory.')
      let doc = 0
      try {
        this.#native.HEAPU8.set(bytes, data)
        const password = options.password === '' ? undefined : options.password
        doc = this.#load(data, bytes.length, password).doc
        const pageCount = fn.FPDF_GetPageCount(doc)
        if (pageCount <= 0)
          throw new EngineError('invalid-pdf', 'The file is not a valid PDF.')
        for (const { page } of options.regions ?? [])
          if (page < 0 || page >= pageCount)
            throw new ArgumentError(`page index ${page} is outside 0..${pageCount - 1}`)
        return inspectDocument(
          this.#heap,
          doc,
          { data, size: bytes.length, pageCount },
          options.regions
        )
      } finally {
        if (!this.#stopped) {
          if (doc !== 0) fn.FPDF_CloseDocument(doc)
          fn.free(data)
        }
      }
    })
  }

  /** Puts the document back to the file as opened, after a failed write. */
  #reopen(entry: OpenDocument): void {
    let doc: number
    try {
      doc = this.#load(entry.data, entry.size, entry.password).doc
    } catch (error) {
      // A trap has stopped the engine, and the caller must learn that rather than only why
      // the write failed.
      if (this.#stopped) throw error
      // It loaded before, so only a lack of memory stops it now; keep the last write.
      return
    }
    this.#fn.FPDF_CloseDocument(entry.doc)
    entry.doc = doc
    entry.needs.clear()
    entry.written = false
    entry.redacted = false
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
    // A page holding a file annotation replied to stays loaded to the end, for its lookups.
    const pinned = new Set(annotations.flatMap((item) => item.replyTo?.page ?? []))
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
        const target = item.replyTo
          ? fn.EPDFPage_GetAnnotByObjectNumber(
              page(item.replyTo.page),
              item.replyTo.objectNumber
            )
          : undefined
        let annot: number
        try {
          annot = writeAnnotation(this.#heap, doc, page(item.page), item, parents, target)
        } finally {
          if (target && !this.#stopped) fn.FPDFPage_CloseAnnot(target)
        }
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

  /**
   * Closes a document. After an internal error it only forgets it: the module is not called.
   * Once `destroy()` has been called it does nothing, since the destroy closes every document.
   */
  close(id: number): void {
    if (this.#destroyed || this.#destroyAfterRender) return
    this.#checkIdle()
    this.#close(id)
  }

  #close(id: number): void {
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
    if (this.#rendering) {
      // The render's page and bitmap are still in use: stop it, then destroy once it has ended.
      this.#destroyAfterRender = true
      this.#ending.abort()
      return
    }
    if (!this.#stopped && !this.#destroyed) {
      try {
        for (const id of [...this.#documents.keys()]) this.#close(id)
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
    this.#checkLive()
    if (this.#stopped) throw new EngineError('engine-failure', STOPPED)
    this.#checkIdle()
    const entry = this.#documents.get(id)
    if (!entry) throw new EngineError('engine-failure', CLOSED)
    return entry
  }

  #checkIndex(entry: OpenDocument, index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= entry.pageCount)
      throw new ArgumentError(`page index ${index} is outside 0..${entry.pageCount - 1}`)
  }

  /** Refuses a call once `destroy()` has been called, or is due once the running render ends. */
  #checkLive(): void {
    if (this.#destroyed || this.#destroyAfterRender)
      throw new EngineError('engine-failure', DESTROYED)
  }

  /** Refuses a call that arrives while a sliced render is between slices. */
  #checkIdle(): void {
    if (this.#rendering) throw new EngineError('engine-failure', BUSY)
  }

  #loadPage(entry: OpenDocument, index: number): number {
    const fn = this.#fn
    const page = fn.FPDF_LoadPage(entry.doc, index)
    if (page === 0)
      throw new EngineError('engine-failure', `Page ${index} could not be loaded.`, {
        pdfiumError: fn.FPDF_GetLastError(),
      })
    return page
  }

  #allocString(text: string): number {
    const size = this.#native.lengthBytesUTF8(text) + 1
    const ptr = this.#fn.malloc(size)
    if (ptr === 0) throw new EngineError('out-of-memory', 'The engine ran out of memory.')
    this.#native.stringToUTF8(text, ptr, size)
    return ptr
  }
}

/**
 * Turns PDFium's pixels (blue, green, red, alpha, with straight alpha) into opaque RGBA laid over
 * white, in place. A pixel is read as one 32-bit number with alpha in its top byte, which holds
 * on the little-endian machines WebAssembly runs on.
 */
function overWhite(data: Uint8ClampedArray): void {
  const pixels = new Uint32Array(data.buffer, data.byteOffset, data.length >>> 2)
  for (let i = 0; i < pixels.length; i++) {
    const pixel = pixels[i]!
    const alpha = pixel >>> 24
    if (alpha === 255) {
      // Opaque: blue and red change places.
      pixels[i] =
        ((pixel & 0xff00ff00) | ((pixel & 0xff) << 16) | ((pixel >>> 16) & 0xff)) >>> 0
      continue
    }
    if (alpha === 0) {
      pixels[i] = 0xffffffff
      continue
    }
    // Rounded down, as PDFium does when it draws onto white itself.
    const white = 255 * (255 - alpha)
    const b = (((pixel & 0xff) * alpha + white) / 255) | 0
    const g = ((((pixel >>> 8) & 0xff) * alpha + white) / 255) | 0
    const r = ((((pixel >>> 16) & 0xff) * alpha + white) / 255) | 0
    pixels[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0
  }
}
