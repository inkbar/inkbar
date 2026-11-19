import type { PdfjsPage, PdfjsTextContent } from './types'

type Piece = Pick<PdfjsTextContent, 'items' | 'styles' | 'lang'>

/**
 * A page's text, as `PDFPageProxy.getTextContent()` gives it, read from `streamTextContent()`
 * with a reader. PDF.js reads the stream with `for await`, which needs async iteration over a
 * `ReadableStream`: iOS Safari 26 does not have it, and the call throws a TypeError there. The
 * pieces merge as PDF.js merges them: the first `lang` given, every piece's styles, and the items
 * in order. Inkbar never turns on PDF.js's XFA rendering, the one case `getTextContent()` reads
 * the text another way.
 */
export async function readTextContent(page: PdfjsPage): Promise<PdfjsTextContent> {
  const reader = (page.streamTextContent() as ReadableStream<Piece>).getReader()
  const content: PdfjsTextContent = {
    items: [],
    styles: Object.create(null) as PdfjsTextContent['styles'],
    lang: null,
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return content
      content.lang ??= value.lang
      Object.assign(content.styles, value.styles)
      content.items.push(...value.items)
    }
  } finally {
    reader.releaseLock()
  }
}
