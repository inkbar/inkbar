// Opening a file with PDF.js. The document loads this module only when PDF.js reads the file, so
// a bundler leaves it, and PDF.js, out of what the engine's open path loads.
import { InkError } from '../model/errors'
import { createPageCache, type PageCache } from '../model/page-cache'

import { destinationPage } from './destinations'
import { loadPdfjs, openProxy } from './load'
import { createPdfjsReader, type PdfjsReader } from './reader'
import { createTextReads } from './text-reads'

import type { PdfjsHandles } from './handles'
import type { PdfAssets, PdfjsPage } from './types'
import type { MeasureChar } from '../model/text'

/** @internal */
export interface PdfjsOpenOptions {
  assets: PdfAssets
  password: string | undefined
  verbosity: number | undefined
  /** The file's bytes, read once PDF.js has loaded. PDF.js takes them over. */
  bytes: () => Promise<Uint8Array>
  /** Whether the document has been destroyed: a page asked for then is refused. */
  destroyed: () => boolean
  destroyedError: () => InkError
  measure: MeasureChar | undefined
}

/** @internal The file open in PDF.js, and the reader over it. */
export interface PdfjsOpened {
  handles: PdfjsHandles
  reader: PdfjsReader
  pageCache: PageCache<PdfjsPage>
  /** Waits for PDF.js's text reads, then destroys its loading task. */
  destroy(): Promise<void>
  /** A copy of the bytes the file was opened from: PDF.js has taken over the ones it was given. */
  data(): Promise<Uint8Array>
  /** The page a named destination points at. */
  destinationPage(name: string): Promise<number | undefined>
}

/** @internal Loads PDF.js and opens the file in it. */
export async function openWithPdfjs(options: PdfjsOpenOptions): Promise<PdfjsOpened> {
  const pdfjs = await loadPdfjs(options.assets)
  const bytes = await options.bytes()
  const { task, proxy } = await openProxy(pdfjs, bytes, {
    assets: options.assets,
    password: options.password,
    verbosity: options.verbosity,
  })
  const textReads = createTextReads()
  const cache = createPageCache((index) => proxy.getPage(index + 1))
  const getPage = (index: number): Promise<PdfjsPage> => {
    if (options.destroyed()) return Promise.reject(options.destroyedError())
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
  const handles: PdfjsHandles = { module: pdfjs, proxy, getPage, textReads }
  return {
    handles,
    reader: createPdfjsReader(handles, { measure: options.measure }),
    pageCache: cache,
    // PDF.js warns in the console when it is destroyed while a page's text is being read.
    destroy: async () => {
      await textReads.settle()
      await task.destroy()
    },
    data: () => proxy.getData(),
    destinationPage: (name) => destinationPage(proxy, name),
  }
}
