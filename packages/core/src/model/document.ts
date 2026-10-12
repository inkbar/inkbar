import { assertAssets, loadPdfjs, openProxy } from '../pdfjs/load'

import { InkError, isInkError } from './errors'
import { pageInfoFromProxy, type PageInfo } from './pages'
import { readonly, writable, type Readable } from './readable'
import { resolveSource, type DocumentSource } from './source'
import { textContentFromPdfjs, type TextContent } from './text'

import type { PdfAssets, PdfjsDocument, PdfjsModule, PdfjsPage } from '../pdfjs/types'

export type DocumentStatus =
  { state: 'loading' } | { state: 'ready' } | { state: 'error'; error: InkError }

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
}

export interface InkDocument {
  readonly key: string
  readonly status: Readable<DocumentStatus>
  /** Resolves when status is ready; rejects with the InkError when it is error. */
  readonly ready: Promise<void>
  readonly pages: readonly PageInfo[]
  readonly info: DocumentInfo
  text(page: number): Promise<TextContent>
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
  const pageCache = new Map<number, Promise<PdfjsPage>>()
  let destroyed = false
  let handles: InkDocument['_pdfjs'] | undefined
  let destroyTask: (() => Promise<void>) | undefined

  const destroyedError = (): InkError =>
    new InkError('DocumentDestroyed', 'The document has been destroyed')

  const load = (async () => {
    const pdfjs = await loadPdfjs(options.assets)
    const bytes = await resolved.bytes()
    const { task, proxy } = await openProxy(pdfjs, bytes, {
      assets: options.assets,
      password: options.password,
    })
    destroyTask = () => task.destroy()
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
      let p = pageCache.get(index)
      if (!p) {
        p = proxy.getPage(index + 1)
        pageCache.set(index, p)
      }
      return p
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
    destroy() {
      if (destroyed) return
      destroyed = true
      pageCache.clear()
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
