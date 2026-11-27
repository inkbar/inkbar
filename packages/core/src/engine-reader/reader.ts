// The document reader over @inkbar/engine: page facts, pixels, text, links, the outline,
// destinations, the file's facts, annotations, form fields, Tab order and JavaScript, and the
// sandbox's field objects, from an engine of its own, loaded through the host's loader, with the
// file open in it.
// Nothing here imports the engine: its shapes are declared in ./types and checked when the file
// is opened.
import {
  destinationFromArray,
  type Destination,
  type RawDestination,
} from '../model/destination'
import { InkError, isInkError } from '../model/errors'
import { sandboxFieldObjects } from '../pdfjs/sandbox-fields'

import { fileAnnotationsFromEngine } from './annotations'
import {
  fieldAnnotations,
  fieldPlaces,
  fieldRegion,
  type FieldPlaces,
} from './fields-draw'
import { annotationId, textOf } from './file-values'
import { fileFieldsFromEngine, widgetContexts } from './form'
import { linksFromFacts, outlineFromFacts } from './links'
import { runsFromChars, type GenericFamily } from './runs'
import { fileScriptsFromEngine, pageScriptsFromEngine } from './scripts'
import { nameBytes, rawDestination, refKey, type RefPages } from './targets'

import type {
  FileDestinationShape,
  FormFactsShape,
  PageAnnotationsShape,
  ReaderEngine,
  ReaderEngineDocument,
  ScriptFactsShape,
} from './types'
import type { PageLink } from '../model/links'
import type { OutlineItem } from '../model/outline'
import type { PageInfo, PageRotation } from '../model/pages'
import type { EngineLoader } from '../model/save/saver'
import type { TextContent } from '../model/text'
import type { FileAnnotation, FileFacts, FileField, FileScripts } from '../reader/file'
import type { DocumentReader, DrawRequest, FieldDrawRequest } from '../reader/types'

/**
 * @internal The most pixels the engine draws in one bitmap. A larger canvas is drawn at the
 * largest size with its shape under this and stretched to fill.
 */
export const MAX_PIXELS = 268_435_456

/** How many pages' text the reader keeps, the last ones read. */
const TEXT_PAGES = 8

/**
 * How many engines link reads, or the name lookups of one outline read, may stop in a row, with
 * none of them succeeding in between, before the reader stops asking: each stop costs a new
 * engine, which reads the whole file again. One item that stops the engine stops at most two:
 * the one it was read on, and the one its retry stops, which the next read then finds stopped.
 * So three in a row take more than one bad item.
 */
const STOPS_IN_A_ROW = 3

/** @internal */
export interface EngineReaderOptions {
  loader: EngineLoader
  /** The bytes the document was opened from. Read again when a stopped engine is replaced. */
  bytes: () => Promise<Uint8Array>
  /** The password the document was opened with. */
  password: string | undefined
  /**
   * Where a missing fallback font, and a page whose text the engine cut short, are reported.
   * Default `console.warn`.
   */
  warn?: (message: string) => void
}

/**
 * @internal The engine reader: a `DocumentReader` that also gives the families its text is in and
 * where its baselines lie.
 */
export interface EngineDocumentReader extends DocumentReader {
  /**
   * The CSS generic family of each of the page's text items, read with them. Once `signal`
   * aborts it rejects with `signal.reason`, as `text` does.
   */
  textFamilies(page: number, signal?: AbortSignal): Promise<readonly GenericFamily[]>
  /**
   * How far each of the page's text items' baselines lies from its quad's `p3`-`p4` edge towards
   * `p1`, in points, as `textFamilies` gives families: `NaN` for a vertical item.
   */
  textBaselines(page: number, signal?: AbortSignal): Promise<readonly number[]>
  /**
   * Stops keeping each page's annotations, the form's facts and the scripts worked out from them:
   * the open has read what it needs. Later reads ask again. The open calls it once it has read
   * every page and again once the form's scripts have started.
   */
  forgetAnnotations(): void
  /**
   * The `EngineUnavailable` error every call rejects with once an engine started to replace one
   * that stopped could not start; `undefined` until then.
   */
  unavailable(): InkError | undefined
  /**
   * The engine the file is open in, lent for writes, so a document runs one engine. The
   * reader keeps it: the borrower opens and closes documents of its own in it and never destroys
   * it. An engine that stopped is replaced first; when no engine can start it rejects with
   * `EngineUnavailable`, and once destroyed with `DocumentDestroyed`. Ask at each write: the
   * reader may have replaced the engine since.
   */
  borrowEngine(): Promise<LentEngine>
}

/** @internal The engine the reader lends, and how the borrower says a call stopped it. */
export interface LentEngine {
  engine: ReaderEngine
  /**
   * Tells the reader a call failed in a way that may have stopped the engine. The reader checks,
   * and drops an engine that has stopped, so its next call, and the next loan, start another.
   * Resolves once it knows.
   */
  stopped(): Promise<void>
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
 * over it. It rejects as PDF.js's open does for the file: `PasswordRequired` when the engine asks
 * for a password, with `details.incorrect` true when the one given is wrong, and `InvalidPdf`,
 * with the engine's `engineCode` and `engineMessage` in its details, for anything else the engine
 * refuses the file for. It rejects with `EngineUnavailable`, with the `cause` in its details,
 * when the loader or `createEngine` fails, and when what the loader gave cannot draw pages.
 *
 * An engine that stops is replaced, and the call that found it stopped runs once more on the new
 * one. A call whose replacement stops too, or cannot start, rejects with `EngineUnavailable`.
 * Once a replacement cannot start, no other is started: every call from then on, and every call
 * still waiting, rejects with `EngineUnavailable`.
 *
 * @internal
 */
export async function createEngineReader(
  options: EngineReaderOptions
): Promise<EngineDocumentReader> {
  const warn = options.warn ?? ((message: string) => console.warn(message))
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
      throw isInkError(error) ? error : refused(error, options.password)
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
  /**
   * The session in use, or starting; undefined once a stopped one is dropped or one failed to
   * start.
   */
  let current: Promise<Session> | undefined = Promise.resolve(first)
  /**
   * Set when an engine started to replace a stopped one fails to start. The reader then starts
   * no other: every call rejects with `error`.
   */
  let cannotStart: { error: InkError; start: Promise<Session> } | undefined

  const session = (): Promise<Session> => {
    if (current) return current
    if (cannotStart) return cannotStart.start
    const made = start()
    current = made
    // One attempt: an engine that cannot start is not started again for this document. This
    // handler runs before the callers waiting on `made` see it fail, so they find it set.
    made.catch((error: unknown) => {
      if (current !== made) return
      current = undefined
      if (destroyed) return
      cannotStart = { error: unavailable(error), start: made }
      // Nothing kept is given from here on.
      texts.clear()
    })
    return made
  }

  /**
   * `work` on the engine. Once an engine cannot start it rejects with `EngineUnavailable`
   * without asking, kept answers included; a call made on a destroyed reader, or with a signal
   * already aborted, rejects as it would on a working engine.
   */
  const onEngine = async <T>(
    work: () => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> => {
    if (destroyed) throw destroyedError()
    signal?.throwIfAborted()
    if (cannotStart) throw cannotStart.error
    return work()
  }

  /**
   * Frees a session whose engine stopped. The next call starts another, unless one has already.
   * True for the one call that dropped it; calls that failed with it at the same time get false.
   */
  const drop = (dead: Promise<Session>, s: Session): boolean => {
    if (current !== dead) return false
    current = undefined
    s.dropped = true
    void free(s)
    return true
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
   * for a call that was aborted or a reader that was destroyed. `onDrop` is called when this
   * call is the one that dropped the engine, so each drop is told to one caller only. `onGone`
   * is called when the call fails because no engine could answer it: the engine could not be
   * started, or the one that replaced a stopped engine stopped as well. Any other failure is the
   * call's own.
   */
  const run = async <T>(
    work: (doc: ReaderEngineDocument) => Promise<T>,
    signal?: AbortSignal,
    onDrop?: () => void,
    onGone?: () => void
  ): Promise<T> => {
    let retried = false
    for (;;) {
      if (destroyed) throw destroyedError()
      signal?.throwIfAborted()
      const used = session()
      let s: Session
      try {
        s = await used
      } catch (error) {
        if (destroyed) throw destroyedError()
        onGone?.()
        throw unavailable(error)
      }
      if (destroyed) throw destroyedError()
      signal?.throwIfAborted()
      try {
        return await work(s.doc)
      } catch (error) {
        if (destroyed || signal?.aborted) throw error
        if (retried) {
          // The engine that replaced a stopped one stopped too, or was dropped under the call.
          const code = codeOf(error)
          if (code !== 'engine-failure' && code !== 'aborted') throw error
          onGone?.()
          throw unavailable(error)
        }
        const code = codeOf(error)
        if (code === 'aborted' && s.dropped) {
          retried = true
          continue
        }
        if (code !== 'engine-failure') throw error
        if (await stillWorks(s)) throw error
        retried = true
        if (drop(used, s)) onDrop?.()
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
  /** A page's facts, from the engine, kept. */
  const pageInfo = async (index: number): Promise<PageInfo> => {
    if (destroyed) throw destroyedError()
    checkPage(index)
    let info: PageInfo
    try {
      info = await onEngine(() => enginePageInfo(index))
    } catch (error) {
      throw destroyed ? destroyedError() : error
    }
    if (destroyed) throw destroyedError()
    return info
  }
  const enginePageInfo = async (index: number): Promise<PageInfo> => {
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

  /**
   * A page with more characters than the engine reads gives the ones up to the cut, and those
   * read, search and select as on any page. The rest of the page has no text. The host is told
   * once per page.
   */
  const cutPages = new Set<number>()
  const reportTruncated = (page: number): void => {
    if (cutPages.has(page)) return
    cutPages.add(page)
    warn(
      `Inkbar: page ${page + 1} has more text than can be read; ` +
        'its text is read up to the first 1,000,000 characters.'
    )
  }

  const draw = (
    request: DrawRequest,
    canvas: HTMLCanvasElement,
    signal?: AbortSignal
  ): Promise<void> => onEngine(() => engineDraw(request, canvas, signal), signal)

  const engineDraw = async (
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
        // One written as a direct object is named by its place in `/Annots`, when known.
        const hide = request.hide.flatMap((h): (number | { index: number })[] =>
          h.objectNumber !== undefined
            ? [h.objectNumber]
            : h.index !== undefined
              ? [{ index: h.index }]
              : []
        )
        bitmap = await run(
          (doc) =>
            doc.renderPage(page, {
              ...(region && { region }),
              size: fit(width, height),
              rotation: normaliseRotation(request.rotation - info.rotate),
              ...(hide.length > 0 && { hide }),
              ...(request.background && { background: true }),
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

  const drawFields = (
    request: FieldDrawRequest,
    canvas: HTMLCanvasElement,
    signal?: AbortSignal
  ): Promise<Set<string>> =>
    onEngine(() => engineDrawFields(request, canvas, signal), signal)

  /**
   * Draws the pass's widgets with the engine in one call over the part of the page the canvas
   * shows, at the page canvas's size and turn, so each lands on the pixels the page gives it. The
   * canvas is left as it is until the engine answers, and when the pass has nothing to draw.
   */
  const engineDrawFields = async (
    request: FieldDrawRequest,
    canvas: HTMLCanvasElement,
    signal?: AbortSignal
  ): Promise<Set<string>> => {
    const render = new AbortController()
    const stop = (): void => render.abort()
    signal?.addEventListener('abort', stop)
    stopped.signal.addEventListener('abort', stop)
    try {
      if (destroyed) throw destroyedError()
      signal?.throwIfAborted()
      const { page } = request
      const info = await pageInfo(page)
      const { annotations, idAt } = fieldAnnotations(
        await placesOf(page),
        request.ids,
        request.look
      )
      const { width, height } = canvas
      const region =
        annotations.length > 0 && width >= 1 && height >= 1
          ? fieldRegion(info, request, width, height)
          : undefined
      const bitmap =
        region &&
        (await run(
          (doc) =>
            doc.renderAnnotations(page, {
              annotations,
              region,
              size: fit(width, height),
              rotation: normaliseRotation(request.rotation - info.rotate),
              signal: render.signal,
            }),
          signal
        ))
      // Finished just as the caller moved on or the document went: the canvas is not touched.
      if (destroyed) throw destroyedError()
      signal?.throwIfAborted()
      const found = new Set<string>()
      if (!bitmap) return found
      for (const index of bitmap.drawn) {
        const id = idAt.get(index)
        if (id !== undefined) found.add(id)
      }
      paint(canvas, bitmap, width, height)
      return found
    } catch (error) {
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
      ).then((chars) => {
        if (chars.truncated) reportTruncated(page)
        return runsFromChars(page, chars)
      }),
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

  /**
   * Engines that link reads dropped since a link read last succeeded. Each drop counts once,
   * however many reads failed with it: reads run several at a time on the engine's one queue,
   * and every read queued behind the one that stopped it fails too.
   */
  let linkStops = 0
  /**
   * A page's links. A page whose links the engine cannot read has none, as a page whose
   * annotations PDF.js cannot parse has none with the PDF.js reader. Once link reads have
   * dropped `STOPS_IN_A_ROW` engines with none succeeding in between, the rest of the pages have
   * none without asking: a file whose link reads stop the engine would otherwise start a new
   * engine for every page. Once an engine cannot start, the read rejects as every call does.
   */
  const links = async (page: number): Promise<PageLink[]> => {
    if (destroyed) throw destroyedError()
    checkPage(page)
    const found = await onEngine(async () => {
      if (linkStops >= STOPS_IN_A_ROW) return []
      const facts = await run(
        (doc) => doc.pageLinks(page),
        undefined,
        () => {
          linkStops++
        }
      )
      linkStops = 0
      return linksFromFacts(page, facts, refPages)
    }).catch((): PageLink[] => {
      if (cannotStart && !destroyed) throw cannotStart.error
      return []
    })
    if (destroyed) throw destroyedError()
    return found
  }

  /** The page of each page reference this reader has put in a destination's `raw`. */
  const refPages: RefPages = new Map()

  /** Named destinations looked up, by name. A failed lookup is not kept. */
  const named = new Map<string, Promise<Destination | undefined>>()
  /** `onDrop` is told when the lookup this call starts drops the engine. */
  const lookUp = (
    name: string,
    onDrop?: () => void
  ): Promise<Destination | undefined> => {
    let found = named.get(name)
    if (!found) {
      const made = onEngine(async () => {
        let gone = false
        let dest: FileDestinationShape | undefined
        try {
          dest = await run(
            (doc) => doc.namedDestination(nameBytes(name)),
            undefined,
            onDrop,
            () => {
              gone = true
            }
          )
        } catch (error) {
          // A working engine that cannot look the name up gives the same answer every time.
          if (gone || destroyed) throw error
          return undefined
        }
        const raw = dest && rawDestination(dest, refPages)
        return Array.isArray(raw) ? explicitDestination(raw) : undefined
      })
      named.set(name, made)
      made.catch(() => {
        if (named.get(name) === made) named.delete(name)
      })
      found = made
    }
    return found
  }
  /**
   * Where `raw` goes. An explicit destination is read here; a name is looked up in the engine
   * by the bytes it decodes from. A name the file does not hold, or that a working engine cannot
   * look up, resolves to nothing. It rejects only when no engine could answer (see `run`'s
   * `onGone`), and is then not kept.
   */
  const resolveDestination = async (
    raw: RawDestination
  ): Promise<Destination | undefined> => {
    if (destroyed) throw destroyedError()
    let dest: Destination | undefined
    try {
      dest = await onEngine(() =>
        typeof raw === 'string' ? lookUp(raw) : Promise.resolve(explicitDestination(raw))
      )
    } catch (error) {
      throw destroyed ? destroyedError() : error
    }
    if (destroyed) throw destroyedError()
    return dest
  }

  /**
   * Where an explicit destination goes. Its first entry is a page index, or a page reference
   * `{ num, gen }` as this reader gives one, found again by the page it was given with. A
   * reference this reader never gave resolves to nothing.
   */
  const explicitDestination = (raw: readonly unknown[]): Destination | undefined => {
    const first = raw[0]
    if (typeof first !== 'object' || first === null)
      return destinationFromArray(raw, pageCount)
    const { num, gen } = first as { num?: unknown; gen?: unknown }
    const page =
      typeof num === 'number' && typeof gen === 'number'
        ? refPages.get(refKey(num, gen))
        : undefined
    if (page !== undefined)
      return destinationFromArray([page, ...raw.slice(1)], pageCount)
    return undefined
  }

  /**
   * The outline. It rejects when the engine cannot read it. Once this read's lookups have dropped
   * `STOPS_IN_A_ROW` engines with none succeeding in between, counting each drop once, the rest
   * of its names resolve to
   * nothing without asking: a file whose lookups stop the engine would otherwise restart it for
   * every batch of names.
   */
  const outline = async (): Promise<OutlineItem[]> => {
    if (destroyed) throw destroyedError()
    let read: OutlineItem[]
    try {
      read = await onEngine(engineOutline)
    } catch (error) {
      throw destroyed ? destroyedError() : error
    }
    if (destroyed) throw destroyedError()
    return read
  }
  const engineOutline = async (): Promise<OutlineItem[]> => {
    const facts = await run((doc) => doc.outline())
    if (destroyed) throw destroyedError()
    let stops = 0
    const resolve = async (raw: RawDestination): Promise<Destination | undefined> => {
      if (typeof raw !== 'string') return resolveDestination(raw)
      if (destroyed) throw destroyedError()
      if (stops >= STOPS_IN_A_ROW) return undefined
      const dest = await lookUp(raw, () => {
        stops++
      }).then(
        (found) => {
          stops = 0
          return found
        },
        () => undefined
      )
      if (destroyed) throw destroyedError()
      return dest
    }
    return outlineFromFacts(facts.items, resolve, refPages)
  }

  /**
   * `work`'s answer, or `instead` when it fails for a reason of its own on a working engine, as
   * the PDF.js reader answers when PDF.js cannot read the part asked for. It rejects when no
   * engine could answer (`work` passes `onGone` to `run`, and `run` rejects with
   * `EngineUnavailable`, which a read made of others, as the form is of each page's annotations,
   * passes on), the engine cannot start, or the reader is destroyed.
   */
  const orElse = async <T>(
    work: (onGone: () => void) => Promise<T>,
    instead: () => T
  ): Promise<T> => {
    let gone = false
    try {
      return await work(() => {
        gone = true
      })
    } catch (error) {
      if (gone || isUnavailable(error) || destroyed || cannotStart) throw error
      return instead()
    }
  }

  /** `encrypted` from the last facts the engine gave. */
  let knownEncrypted = false
  /**
   * The file's facts: the title and author as PDF.js gives them, a text string that is empty
   * counting as none. A title or author the engine cut short is given as far as it was read.
   * When a working engine cannot read them, as when PDF.js cannot read the Info dictionary,
   * there is no title or author, and `encrypted` is what an earlier read gave, else false.
   */
  const fileFacts = async (): Promise<FileFacts> => {
    if (destroyed) throw destroyedError()
    try {
      return await onEngine(() =>
        orElse(
          async (onGone) => {
            // A page the engine has read lets `run` tell a stopped engine from a read the
            // engine fails on its own: the open asks for the facts before any page.
            if (knownPage === undefined && pageCount > 0)
              await enginePageInfo(0).catch(() => undefined)
            const facts = await run(
              (doc) => doc.documentFacts(),
              undefined,
              undefined,
              onGone
            )
            knownEncrypted = facts.encrypted
            const title = facts.title === undefined ? '' : textOf(facts.title)
            const author = facts.author === undefined ? '' : textOf(facts.author)
            return {
              ...(title !== '' ? { title } : {}),
              ...(author !== '' ? { author } : {}),
              encrypted: facts.encrypted,
            }
          },
          () => ({ encrypted: knownEncrypted })
        )
      )
    } catch (error) {
      throw destroyed ? destroyedError() : error
    }
  }

  /**
   * The form's facts, read once and kept until `forgetAnnotations`: each page's annotations and
   * the fields take what the form says about widgets, and the file does not change under the
   * reader. A failed read is not kept.
   */
  let formRead: Promise<FormFactsShape> | undefined
  /** What the form tells each page's widgets, worked out once from the kept facts. */
  let contexts: ReturnType<typeof widgetContexts> | undefined
  const formFacts = (onGone?: () => void): Promise<FormFactsShape> => {
    if (!formRead) {
      const made = run((doc) => doc.formFields(), undefined, undefined, onGone)
      formRead = made
      contexts = undefined
      made.catch(() => {
        if (formRead === made) formRead = undefined
      })
    }
    return formRead
  }

  /**
   * Each page's widgets the page canvas shows, where `/Annots` holds them and their states, for
   * drawing their appearances. Taken from the page's annotations read when the open reads them,
   * and kept after `forgetAnnotations`: a few numbers a widget. A read that rejects is not kept.
   */
  const fieldReads = new Map<number, Promise<FieldPlaces>>()
  const placesOf = (page: number): Promise<FieldPlaces> => {
    let read = fieldReads.get(page)
    if (!read) {
      const made = pageFacts(page).then(({ facts, form }) =>
        fieldPlaces(page, facts, form)
      )
      fieldReads.set(page, made)
      made.catch(() => {
        if (fieldReads.get(page) === made) fieldReads.delete(page)
      })
      read = made
    }
    return read
  }

  /**
   * A page's annotations from the engine, as the PDF.js reader lists them. A page with a widget
   * or a FreeText also takes what the form says about them; a form a working engine cannot read
   * leaves them without it. A page cut short at the engine's limit gives what was read.
   */
  const engineAnnotations = async (
    page: number,
    onGone: () => void
  ): Promise<FileAnnotation[]> => {
    const { facts, form } = await pageFacts(page, onGone)
    if (!fieldReads.has(page))
      fieldReads.set(page, Promise.resolve(fieldPlaces(page, facts, form)))
    let context
    if (form) {
      contexts ??= widgetContexts(form)
      context = contexts.get(page)
    }
    return fileAnnotationsFromEngine(page, facts, context)
  }

  /**
   * A page's annotation facts and, for a page with a widget or a FreeText, the form's; a form a
   * working engine cannot read is left out.
   */
  const pageFacts = async (
    page: number,
    onGone?: () => void
  ): Promise<{ facts: PageAnnotationsShape; form: FormFactsShape | undefined }> => {
    const facts = await run(
      (doc) => doc.pageAnnotations(page),
      undefined,
      undefined,
      onGone
    )
    const needsForm = facts.annotations.some(
      (a) => a.subtype === 'Widget' || a.subtype === 'FreeText'
    )
    const form = needsForm
      ? await orElse<FormFactsShape | undefined>(
          (gone) =>
            formFacts(() => {
              gone()
              onGone?.()
            }),
          () => undefined
        )
      : undefined
    return { facts, form }
  }

  /**
   * Each page's annotations read, kept until `forgetAnnotations`, so the open's reads of the
   * annotations and of the form share them, as the PDF.js reader's do. A read that rejects is
   * not kept.
   */
  const pageReads = new Map<number, Promise<FileAnnotation[]>>()
  /**
   * A page's annotations from the engine, not kept. A page whose annotations a working engine
   * cannot read has none, as a page whose annotations PDF.js cannot parse has none with the
   * PDF.js reader.
   */
  const readPage = (page: number): Promise<FileAnnotation[]> =>
    orElse(
      (onGone) => engineAnnotations(page, onGone),
      (): FileAnnotation[] => []
    )
  /** A page's annotations from the engine, kept until `forgetAnnotations`. */
  const pageAnnotations = (page: number): Promise<FileAnnotation[]> => {
    let read = pageReads.get(page)
    if (!read) {
      const made = readPage(page)
      pageReads.set(page, made)
      made.catch(() => {
        if (pageReads.get(page) === made) pageReads.delete(page)
      })
      read = made
    }
    return read
  }

  const annotations = async (page: number): Promise<FileAnnotation[]> => {
    if (destroyed) throw destroyedError()
    checkPage(page)
    let found: FileAnnotation[]
    try {
      // Each caller gets annotations of its own, as the PDF.js reader gives.
      found = await onEngine(async () => structuredClone(await pageAnnotations(page)))
    } catch (error) {
      throw destroyed ? destroyedError() : error
    }
    if (destroyed) throw destroyedError()
    return found
  }

  /**
   * The form's fields. A form refused for its size has none; PDF.js would read its fields. When
   * a working engine cannot read the form there are none, as when PDF.js cannot read a page's
   * annotations; a page whose annotations it cannot read lists none, so its widgets are left out.
   * `listed` gives each page's annotations.
   */
  const engineForm = (
    listed: (page: number) => Promise<FileAnnotation[]>
  ): Promise<FileField[]> =>
    orElse(
      async (onGone) => {
        const facts = await formFacts(onGone)
        if (facts.tooLarge) return []
        return fileFieldsFromEngine(facts, listed)
      },
      (): FileField[] => []
    )
  const form = async (): Promise<FileField[]> => {
    if (destroyed) throw destroyedError()
    try {
      const fields = await onEngine(() => engineForm(pageAnnotations))
      if (destroyed) throw destroyedError()
      return fields
    } catch (error) {
      throw destroyed ? destroyedError() : error
    }
  }

  /**
   * The page's annotations in the order its structure tree gives them, by id. A page whose order
   * a working engine cannot read has none, as with PDF.js.
   */
  const tabOrder = async (page: number): Promise<string[]> => {
    if (destroyed) throw destroyedError()
    checkPage(page)
    let found: string[]
    try {
      found = await onEngine(() =>
        orElse(
          async (onGone) => {
            const { order } = await run(
              (doc) => doc.structureOrder(page),
              undefined,
              undefined,
              onGone
            )
            if (order.length === 0) return []
            // The engine names each by object number; its id needs the generation too.
            const { annotations: entries } = await run(
              (doc) => doc.pageAnnotations(page),
              undefined,
              undefined,
              onGone
            )
            const generations = new Map<number, number>()
            for (const a of entries)
              if (a.objectNumber !== undefined && !generations.has(a.objectNumber))
                generations.set(a.objectNumber, a.generation ?? 0)
            return order.map((objectNumber) =>
              annotationId(page, {
                index: -1,
                objectNumber,
                generation: generations.get(objectNumber) ?? 0,
              })
            )
          },
          (): string[] => []
        )
      )
    } catch (error) {
      throw destroyed ? destroyedError() : error
    }
    if (destroyed) throw destroyedError()
    return found
  }

  /**
   * The engine's script facts, read once and kept, as the form's are. A read a working engine
   * cannot make gives none, as PDF.js gives none for JavaScript it cannot read. A failed read is
   * not kept.
   */
  let scriptRead: Promise<ScriptFactsShape> | undefined
  const scriptFacts = (): Promise<ScriptFactsShape> => {
    if (!scriptRead) {
      const made = orElse(
        (onGone) => run((doc) => doc.scripts(), undefined, undefined, onGone),
        (): ScriptFactsShape => ({
          document: [],
          documentActions: {},
          pageActions: [],
          truncated: false,
        })
      )
      scriptRead = made
      made.catch(() => {
        if (scriptRead === made) scriptRead = undefined
      })
    }
    return scriptRead
  }

  /**
   * The file's JavaScript from the engine, and whether it has any. A form a working engine cannot
   * read, or refuses for its size, has no fields and no field scripts.
   */
  const engineScripts = async (): Promise<{
    scripts: FileScripts
    hasScripts: boolean
  }> => {
    const [facts, form] = await Promise.all([
      scriptFacts(),
      orElse<FormFactsShape | undefined>(formFacts, () => undefined),
    ])
    return fileScriptsFromEngine(facts, form?.tooLarge ? undefined : form)
  }

  /**
   * `engineScripts`, worked out once for `scripts` and `sandboxFields`, which the open's scripts
   * ask for one after the other, and kept until `forgetAnnotations`. A failed read is not kept.
   */
  let scriptsShare: ReturnType<typeof engineScripts> | undefined
  const sharedScripts = (): ReturnType<typeof engineScripts> => {
    if (!scriptsShare) {
      const made = engineScripts()
      scriptsShare = made
      made.catch(() => {
        if (scriptsShare === made) scriptsShare = undefined
      })
    }
    return scriptsShare
  }

  /** `work` on the engine, as the reader's own call. */
  const ownCall = async <T>(work: () => Promise<T>): Promise<T> => {
    if (destroyed) throw destroyedError()
    let found: T
    try {
      found = await onEngine(work)
    } catch (error) {
      throw destroyed ? destroyedError() : error
    }
    if (destroyed) throw destroyedError()
    return found
  }

  /**
   * The file's JavaScript: `undefined` when, by PDF.js's rule, it has none. Each caller gets
   * objects of its own, as the PDF.js reader gives.
   */
  const scripts = (): Promise<FileScripts | undefined> =>
    ownCall(async () => {
      const { scripts: found, hasScripts } = await sharedScripts()
      return hasScripts ? structuredClone(found) : undefined
    })

  /** The page's actions by event, `{}` when it has none. */
  const pageScripts = (page: number): Promise<Record<string, string[]>> =>
    ownCall(async () => {
      checkPage(page)
      return pageScriptsFromEngine(await scriptFacts(), page)
    })

  /**
   * The sandbox's field objects, built from the engine's form and the fields `/Fields` reaches.
   * The page reads it makes are not kept: the open has let its own go before the scripts start.
   */
  const sandboxFields = (): Promise<Map<string, unknown[]> | null> =>
    ownCall(async () => {
      const [{ scripts: found }, fields] = await Promise.all([
        sharedScripts(),
        engineForm((page) => pageReads.get(page) ?? readPage(page)),
      ])
      return sandboxFieldObjects(fields, found)
    })

  const borrowEngine = async (): Promise<LentEngine> => {
    if (destroyed) throw destroyedError()
    if (cannotStart) throw cannotStart.error
    const used = session()
    let s: Session
    try {
      s = await used
    } catch (error) {
      throw destroyed ? destroyedError() : unavailable(error)
    }
    if (destroyed) throw destroyedError()
    return {
      engine: s.engine,
      stopped: async () => {
        if (!(await stillWorks(s))) drop(used, s)
      },
    }
  }

  let destroying: Promise<void> | undefined
  return {
    kind: 'engine',
    pageCount,
    facts: fileFacts,
    pageInfo,
    draw,
    drawFields,
    // Boundaries always come from the engine's boxes, so `glyphs` changes nothing. Each caller
    // gets an object and list of its own, as the PDF.js reader gives: one that sorts or edits
    // them leaves the kept text as it was.
    text: (page, options): Promise<TextContent> =>
      onEngine(
        () =>
          readText(
            page,
            ({ content }) => ({ page: content.page, items: [...content.items] }),
            options?.signal
          ),
        options?.signal
      ),
    textFamilies: (page, signal) =>
      onEngine(() => readText(page, (runs) => runs.families, signal), signal),
    textBaselines: (page, signal) =>
      onEngine(() => readText(page, (runs) => runs.baselines, signal), signal),
    links,
    annotations,
    form,
    tabOrder,
    forgetAnnotations() {
      pageReads.clear()
      formRead = undefined
      contexts = undefined
      scriptsShare = undefined
    },
    scripts,
    pageScripts,
    sandboxFields,
    outline,
    resolveDestination,
    unavailable: () => cannotStart?.error,
    borrowEngine,
    destroy() {
      if (destroying) return destroying
      destroyed = true
      stopped.abort(destroyedError())
      texts.clear()
      named.clear()
      formRead = undefined
      scriptRead = undefined
      scriptsShare = undefined
      contexts = undefined
      pageReads.clear()
      fieldReads.clear()
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
    'EngineUnavailable',
    'The engine could not be loaded or started',
    { cause },
    cause
  )

/** Whether `error` says no engine could answer. */
const isUnavailable = (error: unknown): boolean =>
  isInkError(error) && error.code === 'EngineUnavailable'

/** `cause` as the error of a call no engine could answer: the engine stopped for good under it. */
const unavailable = (cause: unknown): InkError =>
  isUnavailable(cause)
    ? (cause as InkError)
    : new InkError(
        'EngineUnavailable',
        'The engine stopped, and no engine could be started to answer',
        { cause },
        cause
      )

/**
 * Why the engine refused to open the file, as PDF.js's open says it: a password it needs or that
 * is wrong, and otherwise a file it cannot read, with the engine's own code and message.
 */
const refused = (cause: unknown, password: string | undefined): InkError => {
  const code = codeOf(cause)
  if (code === 'password-required' || code === 'password-incorrect') {
    // As PDF.js: an empty password is no password, so it asks for one rather than refusing it.
    const incorrect =
      code === 'password-incorrect' && password !== undefined && password !== ''
    return new InkError(
      'PasswordRequired',
      incorrect
        ? 'The password is incorrect'
        : 'This document is encrypted and needs a password',
      { passwordSupplied: password !== undefined, incorrect },
      cause
    )
  }
  const rawMessage = (cause as { message?: unknown } | null)?.message
  const message =
    typeof rawMessage === 'string' && rawMessage !== ''
      ? rawMessage
      : 'Unknown engine error'
  return new InkError(
    'InvalidPdf',
    message,
    { engineCode: typeof code === 'string' ? code : undefined, engineMessage: message },
    cause
  )
}

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
  bitmap: Pick<Bitmap, 'width' | 'height' | 'data'>,
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
