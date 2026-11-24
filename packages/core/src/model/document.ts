import { refOfPdfjsId } from '../pdf/annotation-fields'
import { emptyFormExtras, readFormExtras, type FormExtras } from '../pdf/form-fields'
import { openPdfObjects, type PdfObjects } from '../pdf/objects'
import { destinationPage } from '../pdfjs/destinations'
import { assertAssets, loadPdfjs, openProxy } from '../pdfjs/load'
import { createPdfjsReader } from '../pdfjs/reader'
import { createFormScripting } from '../pdfjs/scripting'
import { structureAnnotationOrder } from '../pdfjs/structure'
import { createTextReads, type TextReads } from '../pdfjs/text-reads'
import { readerKind } from '../reader/select'

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
import { InkError, isInkError } from './errors'
import { createFormController, type FormController } from './form/controller'
import { fieldsToGloss } from './form/gloss'
import { buildFormFields, type RawWidget } from './form/structure'
import { mapInOrder } from './map-in-order'
import { canvasMeasureChar } from './measure-char'
import { createPageCache, type PageCache } from './page-cache'
import { type PageInfo } from './pages'
import { readonly, writable, type Readable } from './readable'
import {
  applyRedactions,
  redactionPreview,
  type AppliedRedactions,
  type RedactionState,
} from './redaction/apply'
import {
  canonical,
  canonicalAnnotation,
  changedFields,
  hasChanges,
  takeSnapshot,
  type FieldChange,
  type Snapshot,
} from './save/changes'
import { createSaver, type EngineLoader, type Saver } from './save/saver'
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
import type {
  PdfAssets,
  PdfjsAnnotationData,
  PdfjsDocument,
  PdfjsModule,
  PdfjsPage,
} from '../pdfjs/types'
import type { DocumentReader } from '../reader/types'
import type { AnnotationRef } from '@inkbar/engine'

export type DocumentStatus =
  { state: 'loading' } | { state: 'ready' } | { state: 'error'; error: InkError }

/** An open that failed with PasswordRequired and is waiting for the reader's password. */
export type LockedStatus = { state: 'locked'; incorrect: boolean }

/** A document's status plus `idle`, for a host with no document open, and `locked`. */
export type InkStatus = DocumentStatus | { state: 'idle' } | LockedStatus

export type {
  EngineLoader,
  RedactEngineResult,
  RedactionCandidate,
  RedactionFindings,
  RedactionRegion,
  RedactionSanitised,
  RedactSaveInput,
  SaveEngine,
  SaveEngineDocument,
  SaveInput,
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
  /** PDF.js verbosity level; 0 = errors only. Defaults to PDF.js's own level. */
  verbosity?: number | undefined
  /**
   * Loads @inkbar/engine, for `save()`: `() => import('@inkbar/engine')`. Called on the first
   * save with changes, never before. Absent: such a save rejects with EngineUnavailable.
   */
  engine?: EngineLoader | undefined
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
   * mode they never reach `onChange`. Fields PDF.js leaves out (a FreeText's callout, fringe,
   * head and font, a note's icon) are read from the file after `ready` and fill in later, as a
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
   * `ready`; rejects as `ready` does. Download and print hand this over when the document was
   * opened without an `engine` loader, and `save()` with one.
   */
  getData(): Promise<Uint8Array>
  /**
   * The PDF with this session's annotations and changed form values written into it. Waits for
   * `ready` and for the annotations Inkbar saved to be lifted. With no changes it resolves with
   * `getData()`'s bytes and loads no engine. With changes it needs the `engine` option, and
   * rejects with EngineUnavailable without it, and with SaveFailed when the engine cannot write
   * the file: its `details.stage` is `'engine'` when the engine could not be loaded or started,
   * `'write'` when it could not open or write this file, with the id of the annotation that
   * could not be painted or written in `details.annotation` when it was one annotation. The
   * written copy is kept until the next change, and calls made while a write runs share it.
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
   * Applies every redaction mark of the session to the file as opened: removes the text, image
   * samples and drawing under each one, leaves an opaque box in its place, removes the
   * annotations a mark overlaps, writes the others and the changed form values after, sanitises
   * the file and rewrites it. Then checks the bytes, under each mark, by their objects. Resolves
   * with the redacted bytes and what was done; the open document, its annotations and `changed`
   * stay as they were. Needs the `engine` option: rejects with EngineUnavailable without it, with
   * NothingToRedact when there is no mark, and with RedactionFailed when the engine could not be
   * started (`details.stage: 'engine'`), could not apply the marks or write the rest (`'apply'`,
   * with `details.page` and `details.annotation` when it names them), or the check could not
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
   * @internal True when the document was opened with an `engine` loader: download and print
   * then hand over `save()`, else `getData()`.
   */
  readonly _saves: boolean
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
  /** @internal PDF.js handles for the DOM layer. Not part of the public contract. */
  readonly _pdfjs: {
    module: PdfjsModule
    proxy: PdfjsDocument
    getPage(index: number): Promise<PdfjsPage>
    /** Running text reads, so `destroy()` can wait for PDF.js to finish them. */
    textReads: TextReads
  }
  /** @internal Page facts and pixels for the DOM layer. Not part of the public contract. */
  readonly _reader: DocumentReader
}

interface PdfjsInfoDict {
  Title?: unknown
  Author?: unknown
  EncryptFilterName?: unknown
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
  let pageCache: PageCache<PdfjsPage> | undefined
  let destroyed = false
  let handles: InkDocument['_pdfjs'] | undefined
  let reader: DocumentReader | undefined
  const measure = canvasMeasureChar()
  let destroyTask: (() => Promise<void>) | undefined

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
  /**
   * Each page's annotations as PDF.js reads them, read once while the document opens: the open
   * and the reader share them. Cleared when the open has read every page.
   */
  const annotationsRead = new Map<number, Promise<PdfjsAnnotationData[]>>()
  const destinationCache = new Map<string, Promise<Destination | undefined>>()
  /**
   * Each page's searchable text, and whether its boundaries come from the page's glyphs. Declared
   * here: the engine reader clears it if it turns to PDF.js while the document opens.
   */
  const searchable = new Map<number, Promise<{ st: SearchableText; placed: boolean }>>()
  /** The outline, read on the first `outline()` call: most viewers never show it. */
  let outlineRead: Promise<readonly OutlineItem[]> | undefined
  let preserved: ForeignAnnotation[] = []
  /** Embedded annotations whose PDF.js data lacks fields the file holds; read after `ready`. */
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
   * With the internal switch on, pages are drawn and their text, links, outline and destinations
   * read by an engine reader over the file PDF.js opened; PDF.js still reads annotations and
   * forms. Its module loads only then. When an engine started to replace one that stopped
   * cannot start, the PDF.js reader answers for the rest of the document's life.
   */
  const engineReader =
    readerKind() === 'engine'
      ? async (
          proxy: PdfjsDocument,
          fallback: DocumentReader
        ): Promise<DocumentReader> => {
          const { createEngineReader } = await import('../engine-reader/reader')
          return createEngineReader({
            loader: options.engine!,
            bytes: () => proxy.getData(),
            password: options.password,
            fallback,
            // Search keeps no text read before the switch.
            onFallback: () => searchable.clear(),
          })
        }
      : undefined

  const load = (async () => {
    if (engineReader && !options.engine)
      throw new InkError(
        'EngineUnavailable',
        'Drawing pages with the engine needs the engine option'
      )
    const pdfjs = await loadPdfjs(options.assets)
    const bytes = await resolved.bytes()
    const { task, proxy } = await openProxy(pdfjs, bytes, {
      assets: options.assets,
      password: options.password,
      verbosity: options.verbosity,
    })
    const textReads = createTextReads()
    // PDF.js warns in the console when it is destroyed while a page's text is being read.
    destroyTask = async () => {
      await textReads.settle()
      await task.destroy()
    }
    const cache = createPageCache((index) => proxy.getPage(index + 1))
    pageCache = cache
    const getPage = (index: number): Promise<PdfjsPage> => {
      if (destroyed) return Promise.reject(destroyedError())
      if (!Number.isInteger(index) || index < 0 || index >= proxy.numPages) {
        return Promise.reject(
          new InkError('PageOutOfRange', `Page ${index} does not exist`, {
            index,
            pageCount: proxy.numPages,
          })
        )
      }
      // A failed lookup is not cached: the next mount of the page asks PDF.js again.
      return cache.get(index)
    }
    handles = { module: pdfjs, proxy, getPage, textReads }
    const annotationsOf = (index: number): Promise<PdfjsAnnotationData[]> => {
      let read = annotationsRead.get(index)
      if (!read) {
        // A page whose annotations PDF.js cannot parse still renders; it just has none to show.
        const made = getPage(index).then((page) =>
          page.getAnnotations().catch((): PdfjsAnnotationData[] => [])
        )
        // A page that could not be had is not cached: the next read asks again.
        made.catch(() => {
          if (annotationsRead.get(index) === made) annotationsRead.delete(index)
        })
        annotationsRead.set(index, made)
        read = made
      }
      return read
    }
    const pdfjsReader = createPdfjsReader(handles, {
      measure,
      annotations: annotationsOf,
    })
    reader = engineReader ? await engineReader(proxy, pdfjsReader) : pdfjsReader
    const meta = await proxy.getMetadata().catch(() => {
      // Metadata is optional: PDF.js throws on malformed Info dictionaries or XMP, and
      // title/author are nice-to-have. The document itself has opened, so carry on without it.
      return undefined
    })
    const docInfo = (meta?.info ?? {}) as PdfjsInfoDict
    const title = nonEmptyString(docInfo.Title)
    const author = nonEmptyString(docInfo.Author)
    if (title !== undefined) info.title = title
    if (author !== undefined) info.author = author
    info.pageCount = proxy.numPages
    info.isEncrypted =
      docInfo.EncryptFilterName !== null && docInfo.EncryptFilterName !== undefined
    for (let i = 0; i < proxy.numPages; i++) pages.push(await reader.pageInfo(i))

    const importedAt = new Date().toISOString()
    const opened = reader
    const perPage = await mapInOrder(proxy.numPages, EMBEDDED_CONCURRENCY, async (i) => {
      const raw = await annotationsOf(i)
      // Widgets and links keep their place in `/Annots`, which Tab order shares between them.
      const widgets = raw.flatMap((data, at): RawWidget[] =>
        data.subtype === 'Widget' ? [{ page: i, data, at }] : []
      )
      const links = await opened.links(i)
      // A reply Inkbar saved is hidden, so PDF.js leaves it out; its parent is not.
      const others = raw.flatMap((d) =>
        d.subtype !== 'Widget' && d.subtype !== 'Link' ? [[d.id, d.subtype] as const] : []
      )
      return { ...importEmbeddedPage(i, raw, importedAt), widgets, links, others }
    }).finally(() => {
      // Nothing reads them after the open, so they are not held: a later read asks PDF.js again.
      annotationsRead.clear()
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

    const widgets = perPage.flatMap((r) => r.widgets)
    if (widgets.length > 0) {
      // PDF.js has detached the bytes it was given, so the file's objects are read from a copy.
      const objs = await proxy
        .getData()
        .then(openPdfObjects)
        .catch(() => undefined)
      formData.extras = await readFormExtras(
        objs,
        widgets.map((w) => w.data.id),
        { destinationPage: (name) => destinationPage(proxy, name) }
      )
      formData.fields = buildFormFields(widgets, formData.extras)
      // A page whose `/Tabs` is `S` and that holds fields is read in its structure tree's
      // order. Tagged files often set S on every page, so pages without fields are skipped.
      const withFields = new Set(
        formData.fields.flatMap((f) => f.widgets.map((w) => w.page))
      )
      const structured = [...formData.extras.tabs].flatMap(([page, order]) =>
        order === 'S' && withFields.has(page) ? [page] : []
      )
      const orders = await mapInOrder(
        structured.length,
        EMBEDDED_CONCURRENCY,
        async (i) => structureAnnotationOrder(await getPage(structured[i]!))
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
      proxy,
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
    if (scripting) form._attachScripting(scripting)
  })()

  const ready = load.then(
    () => {
      status.set({ state: 'ready' })
    },
    (cause: unknown) => {
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

  // Fills in fields PDF.js leaves out, and lifts the annotations Inkbar saved and other
  // programs' redaction marks, read from the file's own bytes. It runs after `ready` so it
  // never delays it, and a failure leaves the annotations as PDF.js imported them. Both read
  // one copy of the file's objects.
  const liftSettled = ready.then(
    async () => {
      if (destroyed || !handles) return
      const { proxy } = handles
      // PDF.js has detached the bytes it was given, so the objects are read from a copy.
      let objs: Promise<PdfObjects | undefined> | undefined
      const objects = () =>
        (objs ??= proxy
          .getData()
          .then(openPdfObjects)
          .catch(() => undefined))
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
  // document destroyed while the pass waits on PDF.js does not wait for it.
  const _liftSettled = Promise.race([liftSettled, destroyedSignal]).catch(() => undefined)

  // Saving. The engine is loaded through the host's loader, on the first save with changes.
  const saver: Saver | undefined = options.engine
    ? createSaver({
        loader: options.engine,
        bytes: () =>
          handles ? handles.proxy.getData() : Promise.reject(statusError(status.get())),
        password: options.password,
      })
    : undefined
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
    if (!handles || !baseline) throw statusError(status.get())
    if (!saver)
      throw new InkError(
        'EngineUnavailable',
        'Applying redactions needs @inkbar/engine: pass the engine option.'
      )
    const { measure, ...helpers } = options.pictures ?? {}
    return applyRedactions({
      ...redactionState(),
      pages,
      lifted: liftedRefs('RedactionFailed'),
      fileParents: fileParents(),
      helpers,
      measure,
      saver,
    })
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
   * A page's text with item boundaries measured or, with `glyphs`, taken from where the page
   * draws each glyph. Reading the glyphs means reading the page's drawing commands, which also
   * decodes its images, so search does it only for pages with hits. Rejects with
   * `DocumentDestroyed` once the document is destroyed, whether or not the read has finished.
   */
  async function pageContent(page: number, glyphs: boolean): Promise<TextContent> {
    if (destroyed) throw destroyedError()
    if (!reader) throw statusError(status.get())
    // PDF.js leaves a read of the drawing commands unsettled when it is destroyed, so the read
    // ends here with the document.
    const content = await Promise.race([
      reader.text(page, { glyphs }),
      destroyedSignal.then(() => Promise.reject<TextContent>(destroyedError())),
    ])
    if (destroyed) throw destroyedError()
    return content
  }

  const abortError = (signal: AbortSignal | undefined): unknown =>
    signal?.reason ?? new DOMException('Aborted', 'AbortError')
  const searchableFor = (page: number, placed: boolean): Promise<SearchableText> => {
    let cached = searchable.get(page)
    if (!cached) {
      cached = pageContent(page, placed).then((c) => ({ st: searchableText(c), placed }))
    } else if (placed) {
      // Only the boundaries change, so hits found in the measured text keep their offsets.
      cached = cached.then((c) =>
        c.placed
          ? c
          : pageContent(page, true).then((pc) => ({
              st: searchableText(pc),
              placed: true,
            }))
      )
    } else return cached.then((c) => c.st)
    const entry = cached
    searchable.set(page, entry)
    // A failed page is not cached: the next search asks again.
    entry.catch(() => {
      if (searchable.get(page) === entry) searchable.delete(page)
    })
    return entry.then((c) => c.st)
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
        hits = matchPage(await searchableFor(order[n]!, false), query, matchOpts)
        // Hit boxes are cut where the page draws its glyphs, read only for pages with hits.
        if (hits.length > 0) {
          check()
          hits = matchPage(await searchableFor(order[n]!, true), query, matchOpts)
        }
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

  const doc: InkDocument = {
    key: resolved.key,
    fileName: options._fileName ?? sourceFileName(source),
    async getData() {
      if (destroyed) throw destroyedError()
      await ready
      if (destroyed) throw destroyedError()
      if (!handles) throw statusError(status.get())
      return handles.proxy.getData()
    },
    status: readonly(status),
    ready,
    pages,
    info,
    text(page) {
      return pageContent(page, true)
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
      if (!handles || !baseline) throw statusError(status.get())
      const now = snapshot()
      if (!hasChanges(now, baseline)) return handles.proxy.getData()
      if (!saver)
        throw new InkError(
          'EngineUnavailable',
          'Saving changes needs @inkbar/engine: pass the engine option. Use exportAnnotations("json") to keep annotations without writing the PDF.'
        )
      const lifted = liftedRefs()
      const parents = fileParents()
      const { measure, ...helpers } = options.pictures ?? {}
      return saver.write(now.key, () => {
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
    },
    changed: readonly(changed),
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
      saver?.destroy()
      history.destroy()
      form._destroy()
      store.destroy()
      pageCache?.clear()
      searchable.clear()
      annotationsRead.clear()
      destinationCache.clear()
      const openReader = reader
      if (openReader) teardown(() => openReader.destroy())
      if (destroyTask) {
        teardown(destroyTask)
      }
    },
    _saves: saver !== undefined,
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
    get _pdfjs() {
      if (!handles) throw statusError(status.get())
      return handles
    },
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
    // rejects with DocumentDestroyed, so a PDF.js worker or reader engine that fails to shut down
    // cleanly changes nothing the host can act on.
  })
}

function statusError(s: DocumentStatus): InkError {
  return s.state === 'error'
    ? s.error
    : new InkError('InvalidPdf', 'The document has not finished loading')
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}
