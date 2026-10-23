// The PDF.js operator-list layout the widget appearances rely on (widget-appearance.ts). A
// pdfjs-dist upgrade that changes it fails here by name, not as a blank appearance.
import { afterEach, describe, expect, it } from 'vitest'

import { openFixtureInBrowser } from '../dom/test-utils'

import type { InkDocument } from '../model/document'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

async function open(): Promise<InkDocument> {
  const doc = await openFixtureInBrowser('form-fields')
  cleanup.push(() => void doc.destroy())
  return doc
}

/** The annotation runs of page 0's operator list in `mode`: id, look name, balanced. */
async function runs(doc: InkDocument, mode: 'ENABLE' | 'ENABLE_FORMS') {
  const page = await doc._pdfjs.getPage(0)
  const { AnnotationMode, OPS } = doc._pdfjs.module
  const list = await page.getOperatorList({ annotationMode: AnnotationMode[mode] })
  const found: { id: unknown; look: unknown }[] = []
  let open = false
  list.fnArray.forEach((fn, i) => {
    if (fn === OPS.beginAnnotation) {
      expect(open).toBe(false)
      open = true
      const args = list.argsArray[i] as unknown[]
      found.push({ id: args[0], look: args[5] })
    } else if (fn === OPS.endAnnotation) {
      expect(open).toBe(true)
      open = false
    }
  })
  expect(open).toBe(false)
  return found
}

describe('PDF.js operator-list layout', () => {
  it('ENABLE has one run per shown widget, named by its id', async () => {
    const doc = await open()
    const found = await runs(doc, 'ENABLE')
    // The fixture's empty signature field has no /AP, so PDF.js has nothing to draw for it.
    const widgets = doc.form.fields
      .get()
      .filter((f) => f.type !== 'signature')
      .flatMap((f) => f.widgets)
      .filter((w) => w.page === 0 && !w.hidden && !w.printOnly)
    expect(widgets.length).toBeGreaterThan(10)
    for (const w of widgets) expect(found.filter((r) => r.id === w.id)).toHaveLength(1)
  })

  it('ENABLE_FORMS has a checked and an unchecked run per checkbox and radio', async () => {
    const doc = await open()
    const found = await runs(doc, 'ENABLE_FORMS')
    const toggles = doc.form.fields
      .get()
      .filter((f) => f.type === 'checkbox' || f.type === 'radio')
      .flatMap((f) => f.widgets)
      .filter((w) => w.page === 0)
    expect(toggles.length).toBeGreaterThan(2)
    for (const w of toggles)
      expect(
        found
          .filter((r) => r.id === w.id)
          .map((r) => r.look)
          .sort()
      ).toEqual(['checked', 'unchecked'])
  })
})
