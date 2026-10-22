import { assertAssets, loadPdfjs, openProxy } from '../pdfjs/load'

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
import { createPageCache, type PageCache } from './page-cache'
import { pageInfoFromProxy, type PageInfo } from './pages'
import { readonly, writable, type Readable } from './readable'
import { resolveSource, type DocumentSource } from './source'
import { textContentFromPdfjs, type TextContent } from './text'

import type { AnnotationDocument, ForeignAnnotation } from './annotations/types'
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
  /** Colour defaults. Pass `cssVariableDefaults(element)` from the DOM layer to read theme variables. */
  defaults?: AnnotationDefaults | undefined
  /**
   * Undo history, on by default. `false` disables it. In controlled mode history is always
   * inert: the host owns the list, so it owns undo too.
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
  /** The page's text items joined with a single space. */
  pageText(page: number): Promise<string>
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
  /** Session annotations only, plus unknown-type items kept from earlier imports. */
  exportAnnotations(format: 'json'): AnnotationDocument
  /** Defaults to `{ mode: 'replace' }`. Embedded annotations are never touched. */
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
  let destroyTask: (() => Promise<void>) | undefined

  const store = createAnnotationStore({
    mode: options.annotations ?? { mode: 'uncontrolled' },
    defaults: options.defaults ?? staticDefaults,
  })
  const embedded: EmbeddedSummary[] = []
  let preserved: ForeignAnnotation[] = []
  /** Embedded annotations whose PDF.js data lacks fields the file holds; read after `ready`. */
  const targets: EmbeddedTarget[] = []

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
      return importEmbeddedPage(i, raw, importedAt)
    })
    embedded.push(...summarise(perPage.map((r) => r.counts)))
    const fromFile = perPage.flatMap((r) => r.annotations)
    targets.push(...perPage.flatMap((r) => r.targets))
    if (fromFile.length > 0) store._setEmbedded(fromFile)
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

  const doc: InkDocument = {
    key: resolved.key,
    status: readonly(status),
    ready,
    pages,
    info,
    async text(page) {
      if (destroyed) throw destroyedError()
      if (!handles) throw statusError(status.get())
      const p = await handles.getPage(page)
      return textContentFromPdfjs(page, await p.getTextContent())
    },
    async pageText(page) {
      return (await doc.text(page)).items.map((item) => item.str).join(' ')
    },
    annotations: store,
    embedded,
    history,
    exportAnnotations(format) {
      if (format !== 'json')
        throw new TypeError(`Unsupported export format ${String(format)}`)
      return exportAnnotations(store, preserved, resolved.key)
    },
    importAnnotations(data, opts = { mode: 'replace' }) {
      const plan = planImport(store, data, opts)
      // Staged before the store publishes, so a change listener that exports sees it.
      preserved =
        opts.mode === 'replace'
          ? plan.result.unknown
          : [...preserved.filter((u) => !plan.ids.has(u.id)), ...plan.result.unknown]
      plan.apply()
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
      store.destroy()
      pageCache?.clear()
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
