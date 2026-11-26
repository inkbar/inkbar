import type { TextReads } from './text-reads'
import type { PdfjsDocument, PdfjsModule, PdfjsPage } from './types'

/**
 * @internal A document's PDF.js handles, for the code under `pdfjs/` and for tests. Present only
 * while PDF.js reads the file: `InkDocument._pdfjs`.
 */
export interface PdfjsHandles {
  module: PdfjsModule
  proxy: PdfjsDocument
  getPage(index: number): Promise<PdfjsPage>
  /** Running text reads, so `destroy()` can wait for PDF.js to finish them. */
  textReads: TextReads
}
