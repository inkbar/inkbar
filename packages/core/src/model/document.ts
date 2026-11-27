import { refOfPdfjsId } from '../pdf/annotation-fields'
import { emptyFormExtras, readFormExtras, type FormExtras } from '../pdf/form-fields'
import { openPdfObjects, type PdfObjects } from '../pdf/objects'

import { staticDefaults, type AnnotationDefaults } from './annotations/defaults'
import {
  importEmbeddedPage,
  summarise,
  type EmbeddedSummary,
  type EmbeddedTarget,
} from './annotations/embedded'
import { readEmbeddedFields, readLifted } from './annotations/embedded-fields'
import { createHistory, type History } from './annotations/history'
import {
  exportAnnotations,
  planImport,
  type ImportOptions,
  type ImportResult,
} from './annotations/json'
import {
  createAnnotationStore,
  type AnnotationStore,
  type StoreMode,
} from './annotations/store'
import { isThreadRoot } from './annotations/threads'
import { assertAssets, type PdfAssets } from './assets'
import { engineStarter } from './engine-start'
import { InkError, isInkError } from './errors'
import { createFormController, type FormController } from './form/controller'
import { fieldsToGloss } from './form/gloss'
import { createFormScripting } from './form/scripting'
import { buildFormFields } from './form/structure'
import { mapInOrder } from './map-in-order'
import { type PageInfo } from './pages'
import { readonly, writable, type Readable } from './readable'
import {
  applyRedactions,
  redactionPreview,
  type AppliedRedactions,
  type RedactionState,
} from './redaction/apply'
import { followEngineStopped } from './redaction/busy'
import {
  canonical,
  canonicalAnnotation,
  changedFields,
  hasChanges,
  takeSnapshot,
  type FieldChange,
  type Snapshot,
} from './save/changes'
import { createSaver, type BorrowedEngine } from './save/saver'
import { buildWriteInput, writeFields } from './save/write-input'
import {
  matchPage,
  type SearchHit,
  type SearchOptions,
  type SearchResults,
} from './search'
import { searchableText, type SearchableText } from './search-text'
import { resolveSource, sourceFileName, type DocumentSource } from './source'

import type { TextPicture, ToPng } from './annotations/drawing/pdf/pictures'
import type { TextMeasure } from './annotations/drawing/types'
import type {
  Annotation,
  AnnotationDocument,
  ForeignAnnotation,
} from './annotations/types'
import type { Destination, RawDestination } from './destination'
import type { FieldsMode, FormField } from './form/types'
import type { PageLink } from './links'
import type { OutlineItem } from './outline'
import type { RedactionPreview, RedactionResult } from './redaction/types'
import type { TextContent } from './text'
import type { EngineDocumentReader } from '../engine-reader/reader'
import type { CoreEngine } from '../engine-reader/types'
import type { AnnotationRef } from '@inkbar/engine/bare'

export type DocumentStatus =
  { state: 'loading' } | { state: 'ready' } | { state: 'error'; error: InkError }

/** An open that failed with PasswordRequired and is waiting for the reader's password. */
export type LockedStatus = { state: 'locked'; incorrect: boolean }

/** A document's status plus `idle`, for a host with no document open, and `locked`. */
export type InkStatus = DocumentStatus | { state: 'idle' } | LockedStatus

export type {
  RedactionCandidate,
  RedactionFindings,
  RedactionRegion,
  RedactionSanitised,
} from './save/saver'
export type { RedactionPreview, RedactionResult } from './redaction/types'
export type {
  TextPicture,
  TextPictureRequest,
  ToPng,
} from './annotations/drawing/pdf/pictures'
export type { TextFont, TextMeasure } from './annotations/drawing/types'

export interface DocumentInfo {
  title?: string | undefined
  author?: string | undefined
  pageCount: number
  isEncrypted: boolean
}

export interface OpenOptions {
  /**
   * Where Inkbar's own files are served from: the engine's binary and worker, the fallback
   * fonts and the form script sandbox. See `PdfAssets`.
   */
  assets: PdfAssets
  password?: string | undefined
  fetch?: typeof fetch | undefined
  /**
   * Defaults to uncontrolled. In controlled mode the host owns only session annotations:
   * embedded (`source: 'pdf'`) ones live in the store, are never passed to `onChange`, and stay
   * in `list` whatever the host pushes back.
   */
  annotations?: StoreMode | undefined
  /**
   * Form field values; defaults to uncontrolled, starting from the PDF's. In controlled mode a
   * commit applies at once and is reported with the full map, and the host's push wins.
   */
  fields?: FieldsMode | undefined
  /** Colour defaults. Pass `cssVariableDefaults(element)` from the DOM layer to read theme variables. */
  defaults?: AnnotationDefaults | undefined
  /**
   * Undo history, on by default. `false` disables it. In controlled mode history is always
   * inert: the host owns the list, so it owns undo too. Field values join it only while both
   * annotations and fields are uncontrolled.
   */
  history?: boolean | { limit?: number | undefined } | undefined
  /**
   * What `save()` needs from a browser to write the file as the screen shows it. Pass
   * `savePictures(document)` from `@inkbar/core/dom`; `createViewer` and the Vue, React and
   * Svelte bindings pass it for you. Without it a save lays text out with the standard fonts'
   * own widths, which may break lines where the screen does not, and rejects with SaveFailed
   * for text those fonts cannot set (CJK, Arabic, emoji) and for an image that is neither PNG
   * nor JPEG.
   */
  pictures?: SavePictures | undefined
  /**
   * @internal The name to save under, in place of the one the source gives: a viewer reopening
   * on redacted bytes keeps the name of the file they came from.
   */
  _fileName?: string | undefined
}

/** What a save needs from a browser: see `OpenOptions.pictures`. */
export interface SavePictures {
  /** Draws a run of text the standard fonts cannot set, as a picture. */
  textPicture?: TextPicture
  /** Converts an image that is neither PNG nor JPEG to PNG. */
  toPng?: ToPng
  /** The measure the screen lays text out with. Absent: the standard fonts' own widths. */
  measure?: TextMeasure
}

export interface InkDocument {
  readonly key: string
  readonly status: Readable<DocumentStatus>
  /** Resolves when status is ready; rejects with the InkError when it is error. */
  readonly ready: Promise<void>
  readonly pages: readonly PageInfo[]
  readonly info: DocumentInfo
  text(page: number): Promise<TextContent>
  /** The page's text as search sees it: items joined the way the page reads. */
  pageText(page: number): Promise<string>
  /**
   * Finds `query` in the document's text, a page at a time. A string matches ignoring case,
   * accents and quote style; a `RegExp` runs on the same normalised text.
   */
  search(query: string | RegExp, opts?: SearchOptions): SearchResults
  /**
   * Annotations embedded in the file arrive here as `source: 'pdf'`, `locked: true` before
   * `ready` resolves. They stay in `list` in both modes and cannot be removed; in controlled
   * mode they never reach `onChange`. Fields that first read leaves out (a FreeText's callout,
   * fringe, head and font, a note's icon) are read from the file after `ready` and fill in later, as a
   * `{ kind: 'replace', reason: 'embedded', fields }` change.
   *
   * Annotations Inkbar saved into the file, and that nothing has changed since, are read back
   * after `ready` too: their file copies leave the list and they join it as they were saved,
   * session annotations with their own ids, unlocked, as one `{ kind: 'replace', reason:
   * 'file' }` change that is not an undo step. Redaction marks another program left unapplied
   * join with them, as session marks: a save or an apply removes their file copies and pop-ups.
   * One stays in the file, locked, when its pop-up is not listed on its page or is not a pop-up
   * whose parent is the mark, or when an annotation staying in the file replies to it. In
   * controlled mode they are proposed to the host once, with that reason. An encrypted file
   * lifts nothing.
   */
  readonly annotations: AnnotationStore
  /**
   * The page's links, in file order. Complete once `ready` resolves, `[]` before. Links are
   * read-only structure of the file and never join `annotations`.
   */
  links(page: number): readonly PageLink[]
  /**
   * Looks a destination up in the file: a name through its name tree, or an explicit array.
   * `undefined` when it names no page, or when the file's data for it cannot be read. Answers
   * are cached per document by the destination. Only a lookup the reader could not answer at all
   * (with the engine reading the file, one made as its engine stopped) also gives `undefined`
   * but is not cached: the next call asks again.
   */
  resolveDestination(raw: RawDestination): Promise<Destination | undefined>
  /**
   * The document's outline (its bookmarks), each destination already resolved. Read on the first
   * call, after `ready`, and cached; `[]` when the file has none. A read that fails also gives
   * `[]`, and is not cached: the next call reads again. Rejects as `ready` does.
   */
  outline(): Promise<readonly OutlineItem[]>
  /**
   * What the file contains, by PDF subtype, including subtypes Inkbar does not show. Once the
   * annotations Inkbar saved and other programs' marks have been lifted (see `annotations`) they
   * are no longer counted, nor are the marks' pop-ups: the summary is then the file's
   * annotations less the lifted ones, and reading `embedded` again gives the new array.
   */
  readonly embedded: readonly EmbeddedSummary[]
  readonly history: History
  /** The form's fields and values; empty when the file has no fields. */
  readonly form: FormController
  /**
   * Session annotations only, plus unknown-type items kept from earlier imports, and `fields`
   * with every field value that is not no-export.
   */
  exportAnnotations(format: 'json'): AnnotationDocument
  /**
   * Defaults to `{ mode: 'replace' }`. Embedded annotations are never touched. `fields`, when
   * present, sets the values it names and leaves the rest; that is not an undo step.
   */
  importAnnotations(data: AnnotationDocument | string, opts?: ImportOptions): ImportResult
  /**
   * The name to save the file under: the opened File's name, else the URL's last path segment,
   * else `document.pdf`.
   */
  readonly fileName: string
  /**
   * The bytes the file was opened from, without this session's annotations. Waits for
   * `ready`; rejects as `ready` does. Download and print hand over `save()`.
   */
  getData(): Promise<Uint8Array>
  /**
   * The PDF with this session's annotations and changed form values written into it. Waits for
   * `ready` and for the annotations Inkbar saved to be lifted. With no changes it resolves with
   * `getData()`'s bytes and asks nothing of the engine. With changes it writes them with the
   * engine that reads the file. While that engine is stopped (see `engineStopped`) it starts an
   * engine of its own for the one write and destroys it after; it rejects with EngineUnavailable
   * only when that engine cannot start or stops too. It rejects with SaveFailed when the engine
   * cannot write the file: its `details.stage` is `'write'`,
   * with the id of the annotation that could not be painted or written in `details.annotation`
   * when it was one annotation. The written copy is kept until the next change, and calls made
   * while a write runs share it.
   */
  save(): Promise<Uint8Array>
  /**
   * True while the session differs from the file: its annotations from those lifted at open,
   * or a form value from the file's. The file's values are those the form holds when `ready`
   * resolves, with what the file's scripts calculated at open; values the host passed at open,
   * and any set after `ready`, are changes. False until lifting lands. In controlled mode the
   * lifted annotations proposed to the host count as kept until the host pushes a list, and a
   * save until then keeps them.
   */
  readonly changed: Readable<boolean>
  /**
   * True while the engine that reads the file is stopped: one started to replace an engine that
   * stopped could not start, or the engine stopped 3 times within 60 seconds. Reads then reject
   * with EngineUnavailable and `status` stays ready. `save()` with changes and
   * `applyRedactions()` each start an engine of their own for the one write, and reject with
   * EngineUnavailable only when it cannot start or stops too; `save()` with none resolves with the
   * opened bytes. Only `restartEngine()` ends it.
   */
  readonly engineStopped: Readable<boolean>
  /**
   * Starts a new engine for a stopped document and opens the file in it again. Resolves when the
   * document reads again, and rejects with EngineUnavailable when it does not; it then stays
   * stopped. It forgets the stops counted towards stopping the document, and keeps what it has
   * learnt about pages: a page whose reads stopped the engine twice stays blocked, and a page that
   * stopped it once is blocked at its next stop, which does not count towards stopping the
   * document. A blocked page stays blocked until the file is opened again. The session's
   * annotations, form values and history are untouched either way. Calls made while one runs share
   * it. Resolves at once, doing nothing, for a document that is not stopped. A blocked page's
   * reads reject with EngineUnavailable, its `details.page` naming the page. Rejects with
   * DocumentDestroyed once the document is destroyed, also when that happens while it runs.
   */
  restartEngine(): Promise<void>
  /**
   * Applies every redaction mark of the session to the file as opened: removes the text, image
   * samples and drawing under each one, leaves an opaque box in its place, removes the
   * annotations a mark overlaps, writes the others and the changed form values after, sanitises
   * the file and rewrites it. Then checks the bytes, under each mark, by their objects. Resolves
   * with the redacted bytes and what was done; the open document, its annotations and `changed`
   * stay as they were. While the engine that reads the file is stopped it applies and checks on
   * an engine of its own, started for the one apply and destroyed after. Rejects with
   * EngineUnavailable when that engine cannot start or stops too, with NothingToRedact when there is no mark, and with RedactionFailed when the engine could not
   * apply the marks or write the rest (`details.stage: 'apply'`, with `details.page` and
   * `details.annotation` when it names them), or the check could not
   * run or did not find every mark's place clean (`'verify'`, with those places in
   * `details.regions`). It never overlaps a save: a save that has started writing finishes
   * first, and one that has not may run after it. A call while one runs gets the same promise.
   *
   * It applies the session as it stands when called. In uncontrolled use, changes made to the
   * session through the API while it runs are not carried into the redacted document.
   */
  applyRedactions(): Promise<{ bytes: Uint8Array; result: RedactionResult }>
  /**
   * @internal `applyRedactions()`, the same run, with `_marks`: the ids of the session marks
   * applied, for the viewer to drop from a controlled host's list.
   */
  _applyRedactions(): Promise<{
    bytes: Uint8Array
    result: RedactionResult
    _marks: readonly string[]
  }>
  /**
   * What `applyRedactions()` would do, without loading the engine: the marks, the pages they are
   * on, the other annotations they overlap, whether the file is signed, and the locked marks an
   * encrypted file may hold from an earlier save.
   */
  redactionPreview(): RedactionPreview
  destroy(): void
  /**
   * @internal PDF.js ids of file annotations lifted into the session, and of the pop-ups of
   * other programs' marks lifted with them: the renders leave each out.
   */
  readonly _lifted: Readable<ReadonlySet<string>>
  /** @internal `embedded` as a readable, for a binding to follow when lifting changes it. */
  readonly _embedded: Readable<readonly EmbeddedSummary[]>
  /**
   * @internal The PDF.js id of the file copy of `a`, when `a` is an annotation lifted from the
   * file and unchanged since: the canvas may still paint that copy until a render leaves it out.
   * Undefined for anything else, an edited lifted annotation included.
   */
  _fileCopyOf(a: Annotation): string | undefined
  /**
   * @internal Resolves when the lift pass has landed or failed, or the document is destroyed.
   * Never rejects.
   */
  readonly _liftSettled: Promise<void>
  /** @internal Page facts and pixels for the DOM layer. Not part of the public contract. */
  readonly _reader: EngineDocumentReader
}

/** The PDF.js ids of a lifted annotation's file copies: its own, and its pop-up's if it has one. */
const fileCopies = (f: { pdfjsId: string; popupId?: string }): string[] =>
  f.popupId === undefined ? [f.pdfjsId] : [f.pdfjsId, f.popupId]

/**
 * Opens a document. Resolves once loading has finished, whether it succeeded or not:
 * check `status` or await `ready`, which rejects with the InkError. Only a missing
 * `assets` option (a programmer error) makes this promise itself reject.
 */
export async function openDocument(
  source: DocumentSource,
  options: OpenOptions
): Promise<InkDocument> {
  assertAssets(options?.assets)
  const resolved = resolveSource(source, options.fetch)
  const status = writable<DocumentStatus>({ state: 'loading' })
  const pages: PageInfo[] = []
  const info: DocumentInfo = { pageCount: 0, isEncrypted: false }
  let destroyed = false
  /**
   * The engine reader. Its engine has a copy of the file; core keeps the one below for
   * `getData()`, the object reader, a save and a restart.
   */
  let reader: EngineDocumentReader | undefined
  /** The bytes the file was opened from. */
  let fileBytes: Uint8Array | undefined

  const store = createAnnotationStore({
    mode: options.annotations ?? { mode: 'uncontrolled' },
    defaults: options.defaults ?? staticDefaults,
  })
  const embedded = writable<readonly EmbeddedSummary[]>([])
  /** Annotations the file holds on each page, by PDF subtype; widgets and links included. */
  let fileCounts: Record<string, number>[] = []
  /** The PDF subtype of each file annotation other than a widget or a link, by PDF.js id. */
  const fileSubtypes = new Map<string, string>()
  /**
   * PDF.js ids of the file annotations lifted into the session, and of adopted marks' pop-ups;
   * set once, when they land.
   */
  const lifted = writable<ReadonlySet<string>>(new Set())
  /**
   * Each lifted annotation as it was lifted, its file copy's PDF.js id and, for another
   * program's mark, its pop-up's, by id.
   */
  const liftedFrom = new Map<
    string,
    { annotation: Annotation; pdfjsId: string; popupId?: string }
  >()
  /** Signature links lifting restored: field name to the lifted annotation that signs it. */
  const restoredLinks = new Map<string, string>()
  /**
   * Controlled mode: the lifted annotations are proposed to the host and it has not pushed a
   * list since. Until it does they count as kept, so a save does not drop them.
   */
  let liftPending = false
  /** Resolves when the document is destroyed. */
  let markDestroyed!: () => void
  const destroyedSignal = new Promise<void>((resolve) => (markDestroyed = resolve))
  /** Whether the file has annotations other than widgets and links, which Inkbar may have saved. */
  let mayHaveSaved = false
  const linksByPage = new Map<number, PageLink[]>()
  const destinationCache = new Map<string, Promise<Destination | undefined>>()
  /** Each page's searchable text. */
  const searchable = new Map<number, Promise<SearchableText>>()
  /** The outline, read on the first `outline()` call: most viewers never show it. */
  let outlineRead: Promise<readonly OutlineItem[]> | undefined
  let preserved: ForeignAnnotation[] = []
  /**
   * Embedded annotations whose data from the reader lacks fields the file holds; read after
   * `ready`.
   */
  const targets: EmbeddedTarget[] = []
  /** The file's form fields and what was read for them from its objects, filled before `ready`. */
  const formData: {
    fields: FormField[]
    extras: FormExtras
    /** Annotation ids in structure order, for pages whose `/Tabs` is `S`. */
    structure: Map<number, string[]>
  } = {
    fields: [],
    extras: emptyFormExtras(),
    structure: new Map(),
  }
  const fieldsMode = options.fields ?? { mode: 'uncontrolled' }
  /** One undo step once the history exists, which is after `ready`. */
  let step = (fn: () => void): void => fn()
  /** No undo step: changes join the history's baseline once it exists. */
  let quietly = (fn: () => void): void => fn()
  // Built before the fields are read, so it exists from the start; they load before `ready`.
  const form = createFormController({
    fields: [],
    mode: fieldsMode,
    // Script errors stay off `status`: the document has no error event, so they reach the
    // form's own `on('error')`. One from before `ready` waits for the first listener.
    onError: () => undefined,
    batch: (fn) => step(fn),
    quiet: (fn) => quietly(fn),
  })

  const destroyedError = (): InkError =>
    new InkError('DocumentDestroyed', 'The document has been destroyed')

  /**
   * The engine opens the file: pages and the fields' appearances are drawn, and their text,
   * links, outline, destinations, and the file's facts, annotations, form fields, Tab order and
   * scripts read, by an engine reader, which also builds the sandbox's fields. Each engine it
   * runs is started from the host's assets.
   */
  const startEngine = engineStarter(options.assets)

  /** Opens the file in a new engine reader, from core's own copy of its bytes. */
  const openWithEngine = async (): Promise<EngineDocumentReader> => {
    const bytes = await resolved.bytes()
    fileBytes = bytes
    const { createEngineReader } = await import('../engine-reader/reader').catch(
      (cause: unknown) => {
        throw new InkError(
          'AssetLoadFailed',
          "The engine reader's module could not be loaded",
          { cause },
          cause
        )
      }
    )
    // The engine copies the bytes it is given, so it is given core's copy each time.
    const opened = await createEngineReader({
      start: startEngine,
      bytes: () => Promise.resolve(bytes),
      password: options.password,
    })
    reader = opened
    return opened
  }

  /** The engine reader's engine, lent for a write. Writes run only once the file is open. */
  const borrowReaderEngine = async (): Promise<BorrowedEngine> => {
    if (!reader) throw statusError(status.get())
    const lent = await reader.borrowEngine()
    return { engine: lent.engine, stopped: () => lent.stopped().then(() => undefined) }
  }

  /** The engines started for one write each while the reader is stopped, until each is done. */
  const writeEngines = new Set<CoreEngine>()

  /**
   * A new engine for one write while the reader is stopped. A write draws no pages, so it can
   * often finish where the reader's reads kept stopping the engine. The engine is destroyed once
   * the write is done, or when the document is. The reader stays stopped either way.
   */
  const startWriteEngine = async (): Promise<BorrowedEngine> => {
    let engine: CoreEngine
    try {
      engine = await startEngine()
    } catch (cause) {
      if (destroyed) throw destroyedError()
      throw new InkError(
        'EngineUnavailable',
        'No engine could be started for the write',
        { cause },
        cause
      )
    }
    if (destroyed) {
      teardown(() => engine.destroy())
      throw destroyedError()
    }
    writeEngines.add(engine)
    return {
      engine,
      stopped: () =>
        Promise.resolve(
          new InkError('EngineUnavailable', 'The engine started for the write stopped')
        ),
      done: async () => {
        writeEngines.delete(engine)
        await engine.destroy()
      },
    }
  }

  /** The engine for a write: the reader's, or one of its own while the reader is stopped. */
  const lendEngine = (): Promise<BorrowedEngine> =>
    reader?.unavailable() ? startWriteEngine() : borrowReaderEngine()

  /** A copy of the bytes the file was opened from, for the caller to keep. */
  const fileData = (): Promise<Uint8Array> =>
    fileBytes
      ? Promise.resolve(fileBytes.slice())
      : Promise.reject(statusError(status.get()))

  /** The file's objects, read from the bytes it was opened from; `undefined` when unreadable. */
  const readObjects = (): Promise<PdfObjects | undefined> =>
    fileBytes
      ? openPdfObjects(fileBytes).catch(() => undefined)
      : Promise.resolve(undefined)

  const load = (async () => {
    const opening = await openWithEngine()
    const pageCount = opening.pageCount
    const facts = await opening.facts()
    if (facts.title !== undefined) info.title = facts.title
    if (facts.author !== undefined) info.author = facts.author
    info.pageCount = pageCount
    info.isEncrypted = facts.encrypted
    for (let i = 0; i < pageCount; i++) pages.push(await opening.pageInfo(i))

    const importedAt = new Date().toISOString()
    const opened = opening
    const read = (async () => {
      const perPage = await mapInOrder(pageCount, EMBEDDED_CONCURRENCY, async (i) => {
        // A page whose reads stopped the engine twice gives no annotations, as it gives no
        // links: the file opens without them rather than not at all.
        const annotations = await opened.annotations(i).catch((error: unknown) => {
          if (blockedPage(error, i) && opened.unavailable() === undefined) return []
          throw error
        })
        const hasWidgets = annotations.some((d) => d.subtype === 'Widget')
        const links = await opened.links(i)
        // A reply Inkbar saved is hidden, so the reader leaves it out; its parent is not.
        const others = annotations.flatMap((d) =>
          d.subtype !== 'Widget' && d.subtype !== 'Link'
            ? [[d.id, d.subtype] as const]
            : []
        )
        return {
          ...importEmbeddedPage(i, annotations, importedAt),
          hasWidgets,
          links,
          others,
        }
      })
      // The form is read from the same page reads, before they are let go.
      const fileFields = perPage.some((r) => r.hasWidgets)
        ? await opened.form()
        : undefined
      return { perPage, fileFields }
    })()
    const { perPage, fileFields } = await read.finally(() => {
      // Nothing reads them after the open, so they are not held: a later read asks again.
      opening.forgetAnnotations()
    })
    perPage.forEach((r, i) => {
      if (r.links.length > 0) linksByPage.set(i, r.links)
    })
    mayHaveSaved = perPage.some((r) => r.others.length > 0)
    for (const r of perPage)
      for (const [id, subtype] of r.others) fileSubtypes.set(id, subtype)
    fileCounts = perPage.map((r) => r.counts)
    embedded.set(summarise(fileCounts))
    const fromFile = perPage.flatMap((r) => r.annotations)
    targets.push(...perPage.flatMap((r) => r.targets))
    if (fromFile.length > 0) store._setEmbedded(fromFile)

    // A file with widgets reads its page `/Tabs`, which order its links too, whether or not any
    // widget makes a field.
    if (fileFields) {
      const objs = await readObjects()
      formData.extras = await readFormExtras(
        objs,
        fileFields.flatMap((f) => f.widgets.map((w) => w.id)),
        {
          destinationPage: (name) =>
            opened.resolveDestination(name).then(
              (dest) => dest?.page,
              () => undefined
            ),
        }
      )
      formData.fields = buildFormFields(fileFields, formData.extras)
      // A page whose `/Tabs` is `S` and that holds fields is read in its structure tree's
      // order. Tagged files often set S on every page, so pages without fields are skipped.
      const withFields = new Set(
        formData.fields.flatMap((f) => f.widgets.map((w) => w.page))
      )
      const structured = [...formData.extras.tabs].flatMap(([page, order]) =>
        order === 'S' && withFields.has(page) ? [page] : []
      )
      // A page whose reads stopped the engine twice has no structure order, as a page whose
      // order the engine cannot read: its fields go in page order.
      const orders = await mapInOrder(structured.length, EMBEDDED_CONCURRENCY, (i) =>
        opened.tabOrder(structured[i]!).catch((error: unknown) => {
          if (blockedPage(error, structured[i]!) && opened.unavailable() === undefined)
            return []
          throw error
        })
      )
      structured.forEach((page, i) => formData.structure.set(page, orders[i]!))
    }
    form._load(formData.fields, formData.extras.tabs, formData.structure)
    // Scripts start before `ready`, so the form a host first sees has run its open scripts,
    // and they are not an undo step. Only a document with fields and JavaScript loads the
    // sandbox; one without fields does no extra work. A failure, or a sandbox that does not
    // load in time, leaves the form without scripts and never fails the document.
    if (formData.fields.length === 0) return
    const scripting = await createFormScripting({
      reader: opened,
      assets: options.assets,
      form,
      info,
      calculateAtStart: fieldsMode.mode === 'uncontrolled',
    }).catch((cause: unknown) => {
      form._error(
        new InkError(
          'FormScriptError',
          "The form's scripts could not start; it can still be filled in",
          {},
          cause
        )
      )
      return undefined
    })
    // What the scripts read of the form to start is not held after the open either.
    opening.forgetAnnotations()
    if (scripting) form._attachScripting(scripting)
  })()

  const ready = load.then(
    () => {
      status.set({ state: 'ready' })
    },
    (cause: unknown) => {
      // A failed open keeps no copy of the file: a retry with a password opens the source again.
      fileBytes = undefined
      const error = isInkError(cause)
        ? cause
        : new InkError('InvalidPdf', errorMessage(cause), {}, cause)
      if (error.code === 'PasswordRequired') info.isEncrypted = true
      status.set({ state: 'error', error })
      throw error
    }
  )
  // Keep the rejection observed so hosts that only watch `status` get no unhandled-rejection warning.
  await ready.catch(() => undefined)

  // Created after the embedded import, so loading the file is not an undoable step.
  const historyOption = options.history ?? true
  const historyLimit =
    historyOption === false ? 0 : historyOption === true ? undefined : historyOption.limit
  const history = createHistory(
    store,
    historyLimit === undefined ? {} : { limit: historyLimit }
  )
  const replays =
    historyOption !== false &&
    store.mode === 'uncontrolled' &&
    fieldsMode.mode === 'uncontrolled'
  if (replays) history.track(form._store)
  step = (fn) => history.batch(fn)
  quietly = (fn) => history.baseline(fn)
  // Signature fields and the annotations that sign them change together from here.
  form._linkAnnotations({ store, react: (fn) => history.react(fn), replays })

  // Fills in fields the reader leaves out of the file's annotations, and lifts the annotations
  // Inkbar saved and other programs' redaction marks, read from the file's own bytes. It runs
  // after `ready` so it never delays it, and a failure leaves the annotations as the open
  // imported them. Both read one copy of the file's objects.
  const liftSettled = ready.then(
    async () => {
      if (destroyed || !reader) return
      let objs: Promise<PdfObjects | undefined> | undefined
      const objects = () => (objs ??= readObjects())
      const fields = readEmbeddedFields(store.list.get(), targets, objects).then(
        (patched) => {
          if (!destroyed && patched.size > 0) store._patchEmbedded(patched)
        }
      )
      // A reply Inkbar saved to one of the file's own annotations lifts with that one in place.
      // Only a note or text markup takes replies, as when a save writes one.
      const inFile = new Set(
        store.list
          .get()
          .filter((a) => a.source === 'pdf' && isThreadRoot(a))
          .map((a) => a.id)
      )
      // Another program's Redact annotations, as imported, are adopted as session marks.
      const marks = new Map(
        store.list
          .get()
          .filter((a) => a.source === 'pdf' && a.type === 'redact')
          .map((a) => [a.id, a])
      )
      const lift = (
        mayHaveSaved ? readLifted(objects, inFile, marks) : Promise.resolve([])
      ).then((found) => {
        if (destroyed || found.length === 0) return
        for (const f of found)
          liftedFrom.set(f.annotation.id, {
            annotation: f.annotation,
            pdfjsId: f.pdfjsId,
            ...(f.popupId !== undefined ? { popupId: f.popupId } : {}),
          })
        // The renders leave the file copies, and the pop-ups of adopted marks, out in the same
        // turn as they leave the list.
        const copies = new Set(found.flatMap(fileCopies))
        lifted.set(copies)
        // The summary of the file no longer counts them, each once.
        const gone: Record<string, number> = {}
        for (const id of copies) {
          const subtype = fileSubtypes.get(id)
          if (subtype !== undefined) gone[subtype] = (gone[subtype] ?? 0) - 1
        }
        embedded.set(summarise([...fileCounts, gone]))
        // A controlled host has them proposed; until it answers, they still count as kept.
        liftPending = store.mode === 'controlled'
        store._setLifted(
          found.map((f) => f.annotation),
          found.map((f) => f.embeddedId)
        )
        // A signature that came back signs its field again, as part of what was lifted.
        quietly(() => {
          for (const { annotation, signs } of found) {
            if (signs === undefined) continue
            const field = form.fields.get().find((f) => f.name === signs)
            if (field?.type !== 'signature' || field.locked) continue
            if (form.get(signs) !== undefined) continue
            restoredLinks.set(signs, annotation.id)
            form._signWith(signs, annotation.id)
          }
        })
      })
      void fields.catch(() => undefined)
      await lift
    },
    () => undefined
  )
  // Settles whatever happens: a lift that fails leaves the file's copies as they are, and a
  // document destroyed while the pass waits on the reader does not wait for it.
  const _liftSettled = Promise.race([liftSettled, destroyedSignal]).catch(() => undefined)

  // Saving: a save and an apply write with the reader's engine, so a document runs one. While
  // the reader is stopped, each write starts an engine of its own.
  const saver = createSaver({
    borrow: lendEngine,
    // A copy each time: core goes on reading its own bytes, whatever an engine does with these.
    bytes: fileData,
    password: options.password,
  })
  const changed = writable(false)
  /**
   * The text each field shows now that `ready` has resolved, taken as the file's own: nothing
   * runs between `ready` and here, so a host has had no turn to set a value yet.
   */
  const fileFormatted: Readonly<Record<string, string>> = form.formatted.get()
  /** Fields whose values the host supplied at open: changes, unlike what scripts calculated. */
  const hostFields = Object.keys(fieldsMode.initial ?? {})
  /** The session as the file holds it: what was lifted, and the file's own values. */
  let baseline: Snapshot | undefined
  /**
   * The fields that differ from the file. A restored signature a controlled host has yet to
   * apply counts as signed, as it will be once the host takes the lifted list.
   */
  const fieldChanges = (): Record<string, FieldChange> => {
    const out = changedFields(
      {
        fields: form.fields.get(),
        values: form.values.get(),
        formatted: form.formatted.get(),
      },
      { formatted: fileFormatted }
    )
    for (const [name, id] of restoredLinks)
      if (out[name] === undefined && form._awaitingSignature(name))
        out[name] = { value: { signature: id } }
    return out
  }
  /** The session's annotations, with a lift still waiting for the host's answer as taken. */
  const sessionList = (): readonly Annotation[] => {
    const list = store.list.get()
    if (!liftPending) return list
    const ids = new Set(list.map((a) => a.id))
    const waiting = [...liftedFrom.values()]
      .map((f) => f.annotation)
      .filter((a) => !ids.has(a.id))
    return waiting.length > 0 ? [...list, ...waiting] : list
  }
  /** The last snapshot and what it was taken from, so each change takes one. */
  let taken:
    | {
        list: unknown
        values: unknown
        formatted: unknown
        pending: boolean
        snapshot: Snapshot
      }
    | undefined
  const snapshot = (): Snapshot => {
    const list = store.list.get()
    const values = form.values.get()
    const formatted = form.formatted.get()
    const pending = liftPending
    if (
      taken?.list === list &&
      taken.values === values &&
      taken.formatted === formatted &&
      taken.pending === pending
    )
      return taken.snapshot
    const next = takeSnapshot({ annotations: sessionList(), fields: fieldChanges() })
    taken = { list, values, formatted, pending, snapshot: next }
    return next
  }
  let update = (): void => undefined
  // The host's first push after the lift is its answer: from then on its list is the session.
  const unwatch: (() => void)[] = [
    store.on('change', (c) => {
      if (!liftPending || c.kind !== 'replace' || c.reason !== 'sync') return
      liftPending = false
      update()
    }),
  ]
  /**
   * The file's own values, where they differ from what its fields record: what its scripts
   * calculated at open. Taken now, as `ready` resolves, so whatever is set from here on (by
   * `set`, a commit, a reset or an import) is a change, also while lifting is still to land.
   * Values the host supplied at open are not the file's: they stay changes.
   */
  const fileFields = fieldChanges()
  for (const name of hostFields) delete fileFields[name]
  const baselineTaken = _liftSettled.then(() => {
    if (destroyed || status.get().state !== 'ready') return
    // The signature links lifting restored are the file's too.
    const fields = { ...fileFields }
    for (const [name, id] of restoredLinks)
      fields[name] ??= { value: Object.freeze({ signature: id }) }
    baseline = takeSnapshot({
      annotations: [...liftedFrom.values()].map((f) => f.annotation),
      fields,
    })
    const from = baseline
    update = () => changed.set(hasChanges(snapshot(), from))
    unwatch.push(
      store.list.subscribe(update),
      form.values.subscribe(update),
      form.formatted.subscribe(update)
    )
    update()
  })
  /** The file's own annotations a reply can hang from, by id, with their place in the file. */
  const fileParents = (): Map<string, AnnotationRef> =>
    new Map(
      store.list.get().flatMap((a): [string, AnnotationRef][] => {
        if (a.source !== 'pdf' || !isThreadRoot(a)) return []
        const ref = refOfPdfjsId(a.id.split(':')[2] ?? '')
        return ref ? [[a.id, { page: a.page, objectNumber: ref.num }]] : []
      })
    )
  /**
   * The file copies of the lifted annotations, which a save removes, each followed by its
   * pop-up when it has one, and each object once. One with no object to remove fails the save:
   * writing it again beside its file copy would leave two.
   */
  const liftedRefs = (
    code: 'SaveFailed' | 'RedactionFailed' = 'SaveFailed'
  ): AnnotationRef[] => {
    const seen = new Set<string>()
    return [...liftedFrom.values()].flatMap((from) =>
      fileCopies(from).flatMap((id) => {
        if (seen.has(id)) return []
        seen.add(id)
        const ref = refOfPdfjsId(id)
        if (!ref)
          throw new InkError(
            code,
            `The file's copy of the annotation ${from.annotation.id} cannot be found to replace`,
            {
              stage: code === 'SaveFailed' ? 'write' : 'apply',
              annotation: from.annotation.id,
            }
          )
        return [{ page: from.annotation.page, objectNumber: ref.num }]
      })
    )
  }

  /** The session as applying redactions reads it. */
  const redactionState = (): RedactionState => ({
    annotations: sessionList(),
    formFields: form.fields.get(),
    values: form.values.get(),
    fieldChanges: fieldChanges(),
    // The fact lifting rests on: an encrypted file lifts nothing, so Inkbar's marks and other
    // programs' stay locked.
    encrypted: info.isEncrypted,
  })
  /**
   * `write()`, which rejects with EngineUnavailable when the engine reader, reading when it
   * started, is stopped once it fails: the write found the engine could not start again, or
   * stopped it once too often. A write that starts while the reader is stopped runs on an engine
   * of its own and fails as that engine's write does.
   */
  const whileReading = <T>(write: () => Promise<T>): Promise<T> => {
    if (reader?.unavailable()) return write()
    return write().catch((error: unknown) => {
      const gone = destroyed ? undefined : reader?.unavailable()
      throw gone ?? error
    })
  }
  /** The apply running, which a second call shares. */
  let applying: Promise<AppliedRedactions> | undefined
  /** What `applyRedactions()` gives for the apply `of`, without its `_marks`. */
  let applyingPlain:
    | {
        of: Promise<AppliedRedactions>
        plain: Promise<{ bytes: Uint8Array; result: RedactionResult }>
      }
    | undefined
  const apply = async (): Promise<AppliedRedactions> => {
    if (destroyed) throw destroyedError()
    await ready
    await baselineTaken
    if (destroyed) throw destroyedError()
    if (!reader || !baseline) throw statusError(status.get())
    const { measure, ...helpers } = options.pictures ?? {}
    return whileReading(() =>
      applyRedactions({
        ...redactionState(),
        pages,
        lifted: liftedRefs('RedactionFailed'),
        fileParents: fileParents(),
        helpers,
        measure,
        saver,
      })
    )
  }
  /** The apply running, started if none is. */
  const applyShared = (): Promise<AppliedRedactions> => {
    if (applying) return applying
    const running = apply()
    applying = running
    const settle = () => {
      if (applying === running) applying = undefined
      // Its bytes are not held once it has settled.
      if (applyingPlain?.of === running) applyingPlain = undefined
    }
    running.then(settle, settle)
    return running
  }

  /**
   * A page's text, its boundaries from the engine's character boxes. Rejects with
   * `DocumentDestroyed` once the document is destroyed, whether or not the read has finished.
   */
  async function pageContent(page: number): Promise<TextContent> {
    if (destroyed) throw destroyedError()
    if (!reader) throw statusError(status.get())
    // A read still running when the document is destroyed ends here with it, rejecting with
    // `DocumentDestroyed` whatever the reader does with it.
    const content = await Promise.race([
      reader.text(page),
      destroyedSignal.then(() => Promise.reject<TextContent>(destroyedError())),
    ])
    if (destroyed) throw destroyedError()
    return content
  }

  const abortError = (signal: AbortSignal | undefined): unknown =>
    signal?.reason ?? new DOMException('Aborted', 'AbortError')
  const searchableFor = (page: number): Promise<SearchableText> => {
    // Once the engine is gone for good no page answers, so no kept page does either: a search
    // rejects rather than finding hits in some pages and failing on the others.
    const gone = reader?.unavailable()
    if (gone) {
      searchable.clear()
      return Promise.reject(gone)
    }
    const cached = searchable.get(page)
    if (cached) return cached
    const entry = pageContent(page).then(searchableText)
    searchable.set(page, entry)
    // A failed page is not cached: the next search asks again.
    entry.catch(() => {
      if (searchable.get(page) === entry) searchable.delete(page)
    })
    return entry
  }

  async function* scan(
    query: string | RegExp,
    opts: SearchOptions
  ): AsyncGenerator<SearchHit> {
    const { signal } = opts
    const matchOpts = {
      matchCase: opts.matchCase ?? false,
      wholeWord: opts.wholeWord ?? false,
    }
    const order = opts.pages ?? Array.from({ length: pages.length }, (_, i) => i)
    const check = () => {
      if (signal?.aborted || destroyed) throw abortError(signal)
    }
    check()
    for (let n = 0; n < order.length; n++) {
      if (n > 0) await new Promise<void>((r) => setTimeout(r))
      check()
      let hits: SearchHit[]
      try {
        hits = matchPage(await searchableFor(order[n]!), query, matchOpts)
      } catch (error) {
        check()
        throw error
      }
      check()
      for (const hit of hits) {
        yield hit
        check()
      }
    }
  }

  /**
   * The engine reader, once the document it read is ready. A document whose open failed has
   * none: it is never stopped, and `restartEngine` does nothing for it.
   */
  const readsWithEngine = status.get().state === 'ready' ? reader : undefined
  const engineStopped: Readable<boolean> =
    readsWithEngine?.engineStopped ?? readonly(writable(false))
  // The tool style's edits to the selection pause while stopped, as they do for a redaction.
  followEngineStopped(store, engineStopped)

  const doc: InkDocument = {
    key: resolved.key,
    fileName: options._fileName ?? sourceFileName(source),
    async getData() {
      if (destroyed) throw destroyedError()
      await ready
      if (destroyed) throw destroyedError()
      if (!reader) throw statusError(status.get())
      return fileData()
    },
    status: readonly(status),
    ready,
    pages,
    info,
    text(page) {
      return pageContent(page)
    },
    async pageText(page) {
      return searchableText(await doc.text(page)).raw
    },
    search(query, opts = {}) {
      return {
        [Symbol.asyncIterator]: () => scan(query, opts),
        async all() {
          const hits: SearchHit[] = []
          for await (const hit of scan(query, opts)) hits.push(hit)
          return hits
        },
      }
    },
    annotations: store,
    links: (page) => linksByPage.get(page) ?? [],
    resolveDestination(raw) {
      if (destroyed || !reader) return Promise.resolve(undefined)
      const key = JSON.stringify(raw)
      let found = destinationCache.get(key)
      if (!found) {
        const asked = reader.resolveDestination(raw)
        const made = asked.catch(() => undefined)
        // A lookup that failed is not kept: the next call asks again.
        asked.catch(() => {
          if (destinationCache.get(key) === made) destinationCache.delete(key)
        })
        destinationCache.set(key, made)
        found = made
      }
      return found
    },
    outline() {
      if (outlineRead) return outlineRead
      const made: Promise<readonly OutlineItem[]> = ready.then(() =>
        destroyed || !reader
          ? []
          : reader.outline().catch(() => {
              // A read that failed is not kept: the next call reads again.
              if (outlineRead === made) outlineRead = undefined
              return []
            })
      )
      outlineRead = made
      return made
    },
    get embedded() {
      return embedded.get()
    },
    history,
    form,
    exportAnnotations(format) {
      if (format !== 'json')
        throw new TypeError(`Unsupported export format ${String(format)}`)
      return exportAnnotations(
        store,
        preserved,
        resolved.key,
        fieldsToGloss(form.values.get(), form.fields.get())
      )
    },
    importAnnotations(data, opts = { mode: 'replace' }) {
      const plan = planImport(store, data, opts, form.fields.get())
      // Staged before the store publishes, so a change listener that exports sees it.
      preserved =
        opts.mode === 'replace'
          ? plan.result.unknown
          : [...preserved.filter((u) => !plan.ids.has(u.id)), ...plan.result.unknown]
      plan.apply()
      form._import(plan.fieldValues)
      return plan.result
    },
    async save() {
      if (destroyed) throw destroyedError()
      await ready
      await baselineTaken
      if (destroyed) throw destroyedError()
      if (!reader || !baseline) throw statusError(status.get())
      const now = snapshot()
      // With no changes the opened bytes need no engine, also while the reader is stopped.
      if (!hasChanges(now, baseline)) return fileData()
      const lifted = liftedRefs()
      const parents = fileParents()
      const { measure, ...helpers } = options.pictures ?? {}
      return whileReading(() =>
        saver.write(now.key, () => {
          const { fields, signs } = writeFields(now.fields, form.fields.get())
          return buildWriteInput({
            annotations: now.annotations,
            pages,
            lifted,
            fields,
            signs,
            helpers,
            measure,
            fileParents: parents,
          })
        })
      )
    },
    changed: readonly(changed),
    engineStopped,
    restartEngine() {
      if (destroyed) return Promise.reject(destroyedError())
      return readsWithEngine ? readsWithEngine.restart() : Promise.resolve()
    },
    applyRedactions() {
      const running = applyShared()
      if (applyingPlain?.of !== running)
        applyingPlain = {
          of: running,
          plain: running.then(({ bytes, result }) => ({ bytes, result })),
        }
      return applyingPlain.plain
    },
    _applyRedactions: applyShared,
    redactionPreview: () => redactionPreview(redactionState()),
    destroy() {
      if (destroyed) return
      destroyed = true
      markDestroyed()
      unwatch.splice(0).forEach((stop) => stop())
      saver.destroy()
      for (const engine of writeEngines) teardown(() => engine.destroy())
      writeEngines.clear()
      history.destroy()
      form._destroy()
      store.destroy()
      searchable.clear()
      destinationCache.clear()
      const openReader = reader
      if (openReader) teardown(() => openReader.destroy())
    },
    _lifted: readonly(lifted),
    _embedded: readonly(embedded),
    _fileCopyOf(a) {
      const from = liftedFrom.get(a.id)
      if (!from) return undefined
      // A controlled host may hand back an equal copy rather than the lifted object, with its
      // keys in another order.
      const same =
        from.annotation === a || canonicalAnnotation(from.annotation) === canonical(a)
      return same ? from.pdfjsId : undefined
    },
    _liftSettled,
    get _reader() {
      if (!reader) throw statusError(status.get())
      return reader
    },
  }
  return doc
}

const EMBEDDED_CONCURRENCY = 8

function teardown(destroyTask: () => Promise<void>): void {
  destroyTask().catch(() => {
    // Teardown is best effort: the document is already marked destroyed and every later call
    // rejects with DocumentDestroyed, so a reader engine that fails to shut down
    // cleanly changes nothing the host can act on.
  })
}

function statusError(s: DocumentStatus): InkError {
  return s.state === 'error'
    ? s.error
    : new InkError('InvalidPdf', 'The document has not finished loading')
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}

/** Whether `error` is the one a page's reads reject with once they stopped the engine twice. */
function blockedPage(error: unknown, page: number): boolean {
  return (
    isInkError(error) &&
    error.code === 'EngineUnavailable' &&
    (error.details as { page?: unknown } | undefined)?.page === page
  )
}
