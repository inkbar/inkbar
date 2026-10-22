import { emptyFormExtras, readFormExtras, type FormExtras } from '../pdf/form-fields'
import { openPdfObjects } from '../pdf/objects'
import { pageGlyphs } from '../pdfjs/glyphs'
import { assertAssets, loadPdfjs, openProxy } from '../pdfjs/load'
import { createFormScripting } from '../pdfjs/scripting'

import { staticDefaults, type AnnotationDefaults } from './annotations/defaults'
import {
  importEmbeddedPage,
  summarise,
  type EmbeddedSummary,
  type EmbeddedTarget,
} from './annotations/embedded'
import { readEmbeddedFields } from './annotations/embedded-fields'
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
import { InkError, isInkError } from './errors'
import { createFormController, type FormController } from './form/controller'
import { fieldsToGloss } from './form/gloss'
import { buildFormFields, type RawWidget } from './form/structure'
import { canvasMeasureChar } from './measure-char'
import { createPageCache, type PageCache } from './page-cache'
import { pageInfoFromProxy, type PageInfo } from './pages'
import { readonly, writable, type Readable } from './readable'
import {
  matchPage,
  type SearchHit,
  type SearchOptions,
  type SearchResults,
} from './search'
import { searchableText, type SearchableText } from './search-text'
import { resolveSource, type DocumentSource } from './source'
import { textContentFromPdfjs, type TextContent } from './text'

import type { AnnotationDocument, ForeignAnnotation } from './annotations/types'
import type { FieldsMode, FormField } from './form/types'
import type {
  PdfAssets,
  PdfjsAnnotationData,
  PdfjsDocument,
  PdfjsModule,
  PdfjsPage,
} from '../pdfjs/types'

export type DocumentStatus =
  { state: 'loading' } | { state: 'ready' } | { state: 'error'; error: InkError }

/** A document's status plus `idle`, for a host with no document open. */
export type InkStatus = DocumentStatus | { state: 'idle' }

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
   */
  readonly annotations: AnnotationStore
  /** What the file contained, by PDF subtype, including subtypes Inkbar does not show. */
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
  /** Writes the document with its annotations. Needs @inkbar/engine; rejects with EngineUnavailable otherwise. */
  save(): Promise<Uint8Array>
  destroy(): void
  /** @internal PDF.js handles for the DOM layer. Not part of the public contract. */
  readonly _pdfjs: {
    module: PdfjsModule
    proxy: PdfjsDocument
    getPage(index: number): Promise<PdfjsPage>
  }
}

interface PdfjsInfoDict {
  Title?: unknown
  Author?: unknown
  EncryptFilterName?: unknown
}

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
  const measure = canvasMeasureChar()
  let destroyTask: (() => Promise<void>) | undefined

  const store = createAnnotationStore({
    mode: options.annotations ?? { mode: 'uncontrolled' },
    defaults: options.defaults ?? staticDefaults,
  })
  const embedded: EmbeddedSummary[] = []
  let preserved: ForeignAnnotation[] = []
  /** Embedded annotations whose PDF.js data lacks fields the file holds; read after `ready`. */
  const targets: EmbeddedTarget[] = []
  /** The file's form fields and what was read for them from its objects, filled before `ready`. */
  const formData: { fields: FormField[]; extras: FormExtras } = {
    fields: [],
    extras: emptyFormExtras(),
  }
  const fieldsMode = options.fields ?? { mode: 'uncontrolled' }
  /** One undo step once the history exists, which is after `ready`. */
  let step = (fn: () => void): void => fn()
  // Built before the fields are read, so it exists from the start; they load before `ready`.
  const form = createFormController({
    fields: [],
    mode: fieldsMode,
    // Script errors stay off `status`: the document has no error event, so they reach the
    // form's own `on('error')`, which the form layer subscribes to.
    onError: () => undefined,
    batch: (fn) => step(fn),
  })

  const destroyedError = (): InkError =>
    new InkError('DocumentDestroyed', 'The document has been destroyed')

  const load = (async () => {
    const pdfjs = await loadPdfjs(options.assets)
    const bytes = await resolved.bytes()
    const { task, proxy } = await openProxy(pdfjs, bytes, {
      assets: options.assets,
      password: options.password,
      verbosity: options.verbosity,
    })
    destroyTask = () => task.destroy()
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
    handles = { module: pdfjs, proxy, getPage }
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
    for (let i = 0; i < proxy.numPages; i++)
      pages.push(pageInfoFromProxy(await getPage(i), i))

    const importedAt = new Date().toISOString()
    const perPage = await mapInOrder(proxy.numPages, EMBEDDED_CONCURRENCY, async (i) => {
      const page = await getPage(i)
      const raw: PdfjsAnnotationData[] = await page.getAnnotations().catch(() => {
        // A page whose annotations PDF.js cannot parse still renders; it just has none to show.
        return []
      })
      const widgets = raw.flatMap((data): RawWidget[] =>
        data.subtype === 'Widget' ? [{ page: i, data }] : []
      )
      return { ...importEmbeddedPage(i, raw, importedAt), widgets }
    })
    embedded.push(...summarise(perPage.map((r) => r.counts)))
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
        widgets.map((w) => w.data.id)
      )
      formData.fields = buildFormFields(widgets, formData.extras)
    }
    form._load(formData.fields)
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
  if (
    historyOption !== false &&
    store.mode === 'uncontrolled' &&
    fieldsMode.mode === 'uncontrolled'
  )
    history.track(form._store)
  step = (fn) => history.batch(fn)

  // Fills in fields PDF.js leaves out, read from the file's own bytes. It runs after `ready`
  // so it never delays it, and a failure leaves the annotations as PDF.js imported them.
  void ready.then(
    () => {
      if (destroyed || !handles) return
      const { proxy } = handles
      void readEmbeddedFields(store.list.get(), targets, () => proxy.getData())
        .then((patched) => {
          if (!destroyed && patched.size > 0) store._patchEmbedded(patched)
        })
        .catch(() => undefined)
    },
    () => undefined
  )

  /**
   * A page's text with item boundaries measured or, with `glyphs`, taken from where the page
   * draws each glyph. Reading the glyphs means reading the page's drawing commands, which also
   * decodes its images, so search does it only for pages with hits.
   */
  async function pageContent(page: number, glyphs: boolean): Promise<TextContent> {
    if (destroyed) throw destroyedError()
    if (!handles) throw statusError(status.get())
    const p = await handles.getPage(page)
    const tc = await p.getTextContent()
    // A page with no text (a scan) has no glyphs worth reading its drawing commands for.
    const placed =
      glyphs && tc.items.length > 0
        ? await pageGlyphs(p, handles.module).catch(() => undefined)
        : undefined
    return textContentFromPdfjs(page, tc, measure, placed)
  }

  /** Each page's searchable text, and whether its boundaries come from the page's glyphs. */
  const searchable = new Map<number, Promise<{ st: SearchableText; placed: boolean }>>()
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
    embedded,
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
    save() {
      return Promise.reject(
        new InkError(
          'EngineUnavailable',
          'Saving needs @inkbar/engine, which is not registered. Use exportAnnotations("json") to keep annotations without writing the PDF.'
        )
      )
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      history.destroy()
      form._destroy()
      store.destroy()
      pageCache?.clear()
      searchable.clear()
      if (destroyTask) {
        teardown(destroyTask)
      }
    },
    get _pdfjs() {
      if (!handles) throw statusError(status.get())
      return handles
    },
  }
  return doc
}

const EMBEDDED_CONCURRENCY = 8

/** Runs `task(0..count-1)` with at most `limit` in flight; results come back in index order. */
async function mapInOrder<T>(
  count: number,
  limit: number,
  task: (index: number) => Promise<T>
): Promise<T[]> {
  const results = new Array<T>(count)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < count) {
      const i = next++
      results[i] = await task(i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, count) }, worker))
  return results
}

function teardown(destroyTask: () => Promise<void>): void {
  destroyTask().catch(() => {
    // Teardown is best effort: the document is already marked destroyed and every later call
    // rejects with DocumentDestroyed, so a worker that fails to shut down cleanly changes nothing
    // the host can act on.
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
