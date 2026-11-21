// The document reader over @inkbar/engine: page facts, pixels and text from an engine of its
// own, loaded through the host's loader, with the file open in it. Nothing here imports the
// engine: its shapes are declared in ./types and checked when the file is opened.
import { InkError, isInkError } from '../model/errors'

import { runsFromChars, type GenericFamily } from './runs'

import type { ReaderEngine, ReaderEngineDocument } from './types'
import type { PageInfo, PageRotation } from '../model/pages'
import type { EngineLoader } from '../model/save/saver'
import type { TextContent } from '../model/text'
import type { DocumentReader, DrawRequest } from '../reader/types'

/**
 * @internal The most pixels the engine draws in one bitmap. A larger canvas is drawn at the
 * largest size with its shape under this and stretched to fill.
 */
export const MAX_PIXELS = 268_435_456

/** How many pages' text the reader keeps, the last ones read. */
const TEXT_PAGES = 8

/** @internal */
export interface EngineReaderOptions {
  loader: EngineLoader
  /** The bytes the document was opened from. Read again when a stopped engine is replaced. */
  bytes: () => Promise<Uint8Array>
  /** The password the document was opened with. */
  password: string | undefined
  /** Where a missing fallback font is reported. Default `console.warn`. */
  warn?: (message: string) => void
  /**
   * The reader this one hands links, the outline and destinations to. Absent: those reject
   * with EngineUnavailable.
   */
  delegate?: Delegated
}

/** @internal The engine reader: a `DocumentReader` that also gives the families its text is in. */
export interface EngineDocumentReader extends DocumentReader {
  /**
   * The CSS generic family of each of the page's text items, read with them. Once `signal`
   * aborts it rejects with `signal.reason`, as `text` does.
   */
  textFamilies(page: number, signal?: AbortSignal): Promise<readonly GenericFamily[]>
}

/** What the engine reader hands to another reader. */
type Delegated = Pick<DocumentReader, 'links' | 'outline' | 'resolveDestination'>

const cannotRead = (): Promise<never> =>
  Promise.reject(
    new InkError(
      'EngineUnavailable',
      'The engine reader was given no reader for links, the outline or destinations'
    )
  )

/** Stands in for `delegate` when none is given. */
const noDelegate: Delegated = {
  links: cannotRead,
  outline: cannotRead,
  resolveDestination: cannotRead,
}

/** An engine and the file open in it. */
interface Session {
  engine: ReaderEngine
  doc: ReaderEngineDocument
  /** Set when the session is freed, so it is freed once. */
  freed?: Promise<void>
  /** Set when the reader drops the session; its engine then rejects what it had with `aborted`. */
  dropped?: boolean
  /** Set once the engine is known to have stopped. */
  stopped?: boolean
  /** The check on whether the engine still works, while one is running. */
  probing?: Promise<boolean> | undefined
}

type EnginePageInfo = Awaited<ReturnType<ReaderEngineDocument['pageInfo']>>
type Bitmap = Awaited<ReturnType<ReaderEngineDocument['renderPage']>>

const destroyedError = (): InkError =>
  new InkError('DocumentDestroyed', 'The document has been destroyed')

/** The code of an `EngineError`, or of anything else carrying one. */
const codeOf = (error: unknown): unknown =>
  typeof error === 'object' && error !== null
    ? (error as { code?: unknown }).code
    : undefined

/** Runs `work`, ignoring how it ends: a throw as the call is made included. */
const quietly = (work: () => Promise<unknown>): Promise<void> => {
  try {
    return work().then(
      () => undefined,
      () => undefined
    )
  } catch {
    return Promise.resolve()
  }
}

/**
 * Closes the session's document and destroys its engine, once. Both are asked at once: the
 * destroy stops whatever the close would wait behind.
 */
const free = (s: Session): Promise<void> =>
  (s.freed ??= Promise.all([
    quietly(() => s.doc.close()),
    quietly(() => s.engine.destroy()),
  ]).then(() => undefined))

/**
 * Opens the file in a new engine, made through the host's loader, and resolves with a reader
 * over it. It rejects as a save would at the same stage: `SaveFailed` with `details.stage`
 * `'engine'` when the loader or `createEngine` fails, and `'write'` when the engine cannot open
 * the file; and `EngineUnavailable` when what the loader gave cannot draw pages.
 *
 * @internal
 */
export async function createEngineReader(
  options: EngineReaderOptions
): Promise<EngineDocumentReader> {
  const warn = options.warn ?? ((message: string) => console.warn(message))
  const delegate = options.delegate ?? noDelegate
  const passwordOption =
    options.password !== undefined ? { password: options.password } : {}
  let destroyed = false
  /** Aborted by `destroy`, with a DocumentDestroyed reason: every running draw listens. */
  const stopped = new AbortController()

  let make: () => Promise<ReaderEngine>
  try {
    const engineModule = await options.loader()
    // The loader's type is the saver's; what it makes is checked once a file is open.
    make = () => engineModule.createEngine() as unknown as Promise<ReaderEngine>
  } catch (error) {
    throw notStarted(error)
  }

  /** A new engine with the file open in it. */
  const start = async (): Promise<Session> => {
    let engine: ReaderEngine
    try {
      engine = await make()
    } catch (error) {
      throw notStarted(error)
    }
    let doc: ReaderEngineDocument
    try {
      doc = await engine.open(await options.bytes(), passwordOption)
    } catch (error) {
      void quietly(() => engine.destroy())
      throw isInkError(error) ? error : refused(error)
    }
    const s: Session = { engine, doc }
    if (typeof doc?.renderPage !== 'function' || typeof doc.pageInfo !== 'function') {
      void free(s)
      throw new InkError('EngineUnavailable', 'The engine given cannot draw pages')
    }
    // Destroyed while a replacement started: nothing will use it.
    if (destroyed) {
      void free(s)
      throw destroyedError()
    }
    return s
  }

  const first = await start()
  const pageCount = first.doc.pageCount
  /** The session in use, or starting; undefined once a stopped one is dropped or one failed to start. */
  let current: Promise<Session> | undefined = Promise.resolve(first)

  const session = (): Promise<Session> => {
    if (current) return current
    const made = start()
    current = made
    // One that failed to start is not kept: the next call tries again.
    made.catch(() => {
      if (current === made) current = undefined
    })
    return made
  }

  /** Frees a session whose engine stopped. The next call starts another, unless one has already. */
  const drop = (dead: Promise<Session>, s: Session): void => {
    if (current !== dead) return
    current = undefined
    s.dropped = true
    void free(s)
  }

  /** A page whose facts the engine has given: asking for them again is a cheap, sure call. */
  let knownPage: number | undefined

  /**
   * Whether the session's engine still works after a call failed with `engine-failure`, which the
   * engine also uses for a page it cannot load or draw. It asks again for the facts of a page it
   * has already read: on a working engine that call reads one page dictionary the engine has
   * parsed before and resolves; on a stopped one every call rejects with `engine-failure`. Calls
   * that fail at the same time share one check. With no such page yet, the engine is taken as
   * stopped.
   */
  const stillWorks = (s: Session): Promise<boolean> => {
    if (s.stopped || s.dropped || knownPage === undefined) return Promise.resolve(false)
    const page = knownPage
    s.probing ??= s.doc.pageInfo(page).then(
      () => true,
      // `aborted` here means the session was dropped or the reader destroyed under the check.
      (error: unknown) => {
        const code = codeOf(error)
        return code !== 'engine-failure' && code !== 'aborted'
      }
    )
    const probing = s.probing
    return probing.then((works) => {
      if (s.probing === probing) s.probing = undefined
      if (!works || s.dropped) s.stopped = true
      return works && !s.dropped
    })
  }

  /**
   * `work` on the session's document. When it fails with `engine-failure` and the engine has
   * really stopped, the engine is replaced and `work` runs once more on the new one. When the
   * engine still works the error is the call's own and goes to the caller. A call the engine
   * rejected with `aborted` because the reader dropped its session runs once more too. Never
   * for a call that was aborted or a reader that was destroyed.
   */
  const run = async <T>(
    work: (doc: ReaderEngineDocument) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> => {
    let retried = false
    for (;;) {
      if (destroyed) throw destroyedError()
      signal?.throwIfAborted()
      const used = session()
      const s = await used
      if (destroyed) throw destroyedError()
      signal?.throwIfAborted()
      try {
        return await work(s.doc)
      } catch (error) {
        if (destroyed || signal?.aborted || retried) throw error
        const code = codeOf(error)
        if (code === 'aborted' && s.dropped) {
          retried = true
          continue
        }
        if (code !== 'engine-failure') throw error
        if (await stillWorks(s)) throw error
        retried = true
        drop(used, s)
      }
    }
  }

  /** The engine's facts for each page, asked once: they do not change. */
  const facts = new Map<number, Promise<EnginePageInfo>>()
  const checkPage = (index: number): void => {
    if (!Number.isInteger(index) || index < 0 || index >= pageCount)
      throw new InkError('PageOutOfRange', `Page ${index} does not exist`, {
        index,
        pageCount,
      })
  }
  const pageInfo = async (index: number): Promise<PageInfo> => {
    if (destroyed) throw destroyedError()
    checkPage(index)
    let asked = facts.get(index)
    if (!asked) {
      const made = run((doc) => doc.pageInfo(index))
      facts.set(index, made)
      made.then(
        () => {
          knownPage ??= index
        },
        () => {
          if (facts.get(index) === made) facts.delete(index)
        }
      )
      asked = made
    }
    return toPageInfo(await asked, index)
  }

  const warned = new Set<string>()
  const reportMissing = (keys: readonly string[]): void => {
    for (const key of keys) {
      if (warned.has(key)) continue
      warned.add(key)
      warn(
        `Inkbar: no fallback font for "${key}" text; some text on this page is drawn with a substitute.`
      )
    }
  }

  const draw = async (
    request: DrawRequest,
    canvas: HTMLCanvasElement,
    signal?: AbortSignal
  ): Promise<void> => {
    // Stops the engine's render when the caller moves on or the reader is destroyed.
    const render = new AbortController()
    const stop = (): void => render.abort()
    signal?.addEventListener('abort', stop)
    stopped.signal.addEventListener('abort', stop)
    try {
      if (destroyed) throw destroyedError()
      signal?.throwIfAborted()
      const { page, width, height, region } = request
      const info = await pageInfo(page)
      let bitmap: Bitmap | undefined
      if (width >= 1 && height >= 1) {
        const hide = request.hide.flatMap((h) =>
          h.objectNumber === undefined ? [] : [h.objectNumber]
        )
        bitmap = await run(
          (doc) =>
            doc.renderPage(page, {
              ...(region && { region }),
              size: fit(width, height),
              rotation: normaliseRotation(request.rotation - info.rotate),
              ...(hide.length > 0 && { hide }),
              signal: render.signal,
            }),
          signal
        )
      }
      // Finished just as the caller moved on or the document went: the canvas is not touched.
      if (destroyed) throw destroyedError()
      signal?.throwIfAborted()
      if (!bitmap) {
        canvas.width = width
        canvas.height = height
        return
      }
      reportMissing(bitmap.missingFonts)
      paint(canvas, bitmap, width, height)
    } catch (error) {
      // The caller tells a superseded draw by its own reason, so that one wins.
      throw signal?.aborted ? signal.reason : destroyed ? destroyedError() : error
    } finally {
      signal?.removeEventListener('abort', stop)
      stopped.signal.removeEventListener('abort', stop)
    }
  }

  type Runs = ReturnType<typeof runsFromChars>
  /**
   * A page's text read, shared by every caller that asks for it. `waiting` counts the callers
   * still waiting on a read not yet settled, less those whose signal has aborted; a caller with
   * no signal never stops waiting.
   */
  interface TextRead {
    runs: Promise<Runs>
    waiting: number
    cancel: AbortController
  }
  /** The text of the last `TEXT_PAGES` pages read, the one read longest ago first. */
  const texts = new Map<number, TextRead>()
  const readOf = (page: number): TextRead => {
    const kept = texts.get(page)
    if (kept) {
      texts.delete(page)
      texts.set(page, kept)
      return kept
    }
    const cancel = new AbortController()
    const made: TextRead = {
      runs: run(
        (doc) => doc.pageText(page, { signal: cancel.signal }),
        cancel.signal
      ).then((chars) => runsFromChars(page, chars)),
      waiting: 0,
      cancel,
    }
    texts.set(page, made)
    if (texts.size > TEXT_PAGES) texts.delete(texts.keys().next().value!)
    // A failed or cancelled read is not kept: the next one asks again.
    made.runs.catch(() => {
      if (texts.get(page) === made) texts.delete(page)
    })
    return made
  }
  /**
   * The page's runs, for one caller. An abort of `signal` rejects this caller with its reason
   * and leaves the shared read to the others. The shared read is cancelled, in the engine
   * too, only once every caller waiting on it has aborted; it is then dropped at once, so a
   * caller that comes later starts a read of its own.
   */
  const runsOf = async (page: number, signal: AbortSignal | undefined): Promise<Runs> => {
    signal?.throwIfAborted()
    const read = readOf(page)
    if (!signal) {
      read.waiting = Infinity
      return read.runs
    }
    read.waiting++
    let onAbort!: () => void
    const aborted = new Promise<undefined>((resolve) => {
      onAbort = () => resolve(undefined)
      signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      const runs = await Promise.race([read.runs, aborted])
      if (runs) return runs
      if (--read.waiting <= 0) {
        if (texts.get(page) === read) texts.delete(page)
        read.cancel.abort()
      }
      signal.throwIfAborted()
      throw new Error('unreachable: the signal has aborted')
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  }
  /** `pick` of the page's text, read once for both its items and their families. */
  const readText = async <T>(
    page: number,
    pick: (runs: Runs) => T,
    signal: AbortSignal | undefined
  ): Promise<T> => {
    try {
      if (destroyed) throw destroyedError()
      checkPage(page)
      const runs = await runsOf(page, signal)
      if (destroyed) throw destroyedError()
      signal?.throwIfAborted()
      return pick(runs)
    } catch (error) {
      throw destroyed ? destroyedError() : error
    }
  }

  let destroying: Promise<void> | undefined
  return {
    kind: 'engine',
    pageCount,
    pageInfo,
    draw,
    // Boundaries always come from the engine's boxes, so `glyphs` changes nothing. Each caller
    // gets an object and list of its own, as the PDF.js reader gives: one that sorts or edits
    // them leaves the kept text as it was.
    text: (page, options): Promise<TextContent> =>
      readText(
        page,
        ({ content }) => ({ page: content.page, items: [...content.items] }),
        options?.signal
      ),
    textFamilies: (page, signal) => readText(page, (runs) => runs.families, signal),
    links: (page) => delegate.links(page),
    outline: () => delegate.outline(),
    resolveDestination: (raw) => delegate.resolveDestination(raw),
    destroy() {
      if (destroying) return destroying
      destroyed = true
      stopped.abort(destroyedError())
      texts.clear()
      const last = current
      current = undefined
      // A session still starting frees itself when it finds the reader destroyed.
      destroying = last ? last.then(free, () => undefined) : Promise.resolve()
      return destroying
    },
  }
}

const notStarted = (cause: unknown): InkError =>
  new InkError(
    'SaveFailed',
    'The engine could not be loaded or started',
    { stage: 'engine' },
    cause
  )

const refused = (cause: unknown): InkError =>
  new InkError(
    'SaveFailed',
    'The engine could not open this file',
    { stage: 'write' },
    cause
  )

function toPageInfo(info: EnginePageInfo, index: number): PageInfo {
  return {
    index,
    box: { ...info.box },
    rotate: normaliseRotation(info.rotation),
    userUnit: info.userUnit,
    width: info.width,
    height: info.height,
  }
}

function normaliseRotation(degrees: number): PageRotation {
  return ((((Math.round(degrees / 90) * 90) % 360) + 360) % 360) as PageRotation
}

/**
 * The bitmap size to ask for: the canvas's own, or for a canvas over `MAX_PIXELS` the largest
 * size of the same shape under it, in whole pixels.
 */
function fit(width: number, height: number): { width: number; height: number } {
  if (width * height <= MAX_PIXELS) return { width, height }
  const scale = Math.sqrt(MAX_PIXELS / (width * height))
  const w = Math.max(1, Math.min(Math.floor(width * scale), MAX_PIXELS))
  const h = Math.max(1, Math.min(Math.floor(height * scale), Math.floor(MAX_PIXELS / w)))
  return { width: w, height: h }
}

/**
 * The canvas keeps its pixels in memory, as PDF.js asks of the page canvas. The reader only ever
 * puts finished pixels on it, and a browser without a graphics card cannot read a canvas held on
 * one back.
 */
const CONTEXT: CanvasRenderingContext2DSettings = { willReadFrequently: true }

/**
 * Sizes the canvas to the request and puts the bitmap on it. A bitmap of another size (one
 * drawn smaller for `MAX_PIXELS`) goes through a scratch canvas and is stretched to fill.
 */
function paint(
  canvas: HTMLCanvasElement,
  bitmap: Bitmap,
  width: number,
  height: number
): void {
  const image = new ImageData(pixels(bitmap.data), bitmap.width, bitmap.height)
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', CONTEXT)
  if (!context) throw new Error('The canvas has no 2D context')
  if (bitmap.width === width && bitmap.height === height) {
    context.putImageData(image, 0, 0)
    return
  }
  const scratch = canvas.ownerDocument.createElement('canvas')
  scratch.width = bitmap.width
  scratch.height = bitmap.height
  try {
    const scratchContext = scratch.getContext('2d', CONTEXT)
    if (!scratchContext) throw new Error('The canvas has no 2D context')
    scratchContext.putImageData(image, 0, 0)
    context.drawImage(scratch, 0, 0, width, height)
  } finally {
    // Freed now rather than at garbage collection: Safari caps the total canvas memory.
    scratch.width = 0
    scratch.height = 0
  }
}

/**
 * The engine's pixels as `ImageData` takes them: an array over an `ArrayBuffer`, which is what
 * the engine hands back, so this copies nothing. Only an array over shared memory is copied.
 */
function pixels(data: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
  return data.buffer instanceof ArrayBuffer
    ? (data as Uint8ClampedArray<ArrayBuffer>)
    : new Uint8ClampedArray(data)
}
