import type { PdfjsPage, PdfjsTextContent } from './types'

type Piece = Pick<PdfjsTextContent, 'items' | 'styles' | 'lang'>

/**
 * A page's text, as `PDFPageProxy.getTextContent()` gives it, read from `streamTextContent()`
 * with a reader. PDF.js reads the stream with `for await`, which needs async iteration over a
 * `ReadableStream`: iOS Safari 26 does not have it, and the call throws a TypeError there. The
 * pieces merge as PDF.js merges them: the first `lang` given, every piece's styles, and the items
 * in order. Inkbar never turns on PDF.js's XFA rendering, the one case `getTextContent()` reads
 * the text another way.
 *
 * Once `signal` aborts, the stream is cancelled and the read rejects with the signal's reason.
 */
export async function readTextContent(
  page: PdfjsPage,
  signal?: AbortSignal
): Promise<PdfjsTextContent> {
  signal?.throwIfAborted()
  const reader = (page.streamTextContent() as ReadableStream<Piece>).getReader()
  const content: PdfjsTextContent = {
    items: [],
    styles: Object.create(null) as PdfjsTextContent['styles'],
    lang: null,
  }
  // A cancelled stream ends its pending read as if it were done, so the signal is checked after
  // each read too.
  const cancel = () => void reader.cancel(signal?.reason).catch(() => undefined)
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    for (;;) {
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done) return content
      content.lang ??= value.lang
      Object.assign(content.styles, value.styles)
      content.items.push(...value.items)
    }
  } finally {
    signal?.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}
