// Which reader a document opens with: the engine reader, always.

/** @internal Always `'engine'`. */
export function readerKind(): 'pdfjs' | 'engine' {
  return 'engine'
}
