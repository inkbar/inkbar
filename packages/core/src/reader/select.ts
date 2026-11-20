// Which reader a document opens with. The engine reader is for tests while it is brought up to
// the PDF.js reader: only a global set on the page selects it.

/** @internal `'engine'` only while `globalThis.__INKBAR_READER__` is `'engine'`. */
export function readerKind(): 'pdfjs' | 'engine' {
  return (globalThis as { __INKBAR_READER__?: unknown }).__INKBAR_READER__ === 'engine'
    ? 'engine'
    : 'pdfjs'
}
