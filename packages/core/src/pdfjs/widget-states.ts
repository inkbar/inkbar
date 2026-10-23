import type { PdfjsDocument } from './types'

/**
 * Tells PDF.js whether each checkbox or radio widget (by id) is on, so a render with
 * `AnnotationMode.ENABLE_STORAGE` draws each in the PDF's own on or off appearance. The states
 * live in the document's annotation storage, which only such renders read; Inkbar never saves
 * through PDF.js.
 */
export function storeButtonStates(
  proxy: PdfjsDocument,
  states: Iterable<readonly [string, boolean]>
): void {
  for (const [id, on] of states) proxy.annotationStorage.setValue(id, { value: on })
}
