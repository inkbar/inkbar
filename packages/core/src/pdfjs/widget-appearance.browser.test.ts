// The PDF.js operator-list layout the widget appearances rely on (widget-appearance.ts). A
// pdfjs-dist upgrade that changes it fails here by name, not as a blank appearance.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { openFixtureInBrowser } from '../dom/test-utils'

import { renderAppearances } from './widget-appearance'

import type { InkDocument } from '../model/document'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((f) => f())
  vi.restoreAllMocks()
})

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

describe('renderAppearances', () => {
  /** A pass over the whole of page 0 at zoom 1, for `ids` in `look`. */
  const pass = (ids: string[], look: 'own' | 'checked' = 'own') => ({
    page: 0,
    look,
    ids: new Set(ids),
    zoom: 1,
    rotation: 0 as const,
    pixelRatio: 1,
    x: 0,
    y: 0,
  })
  const canvasFor = (doc: InkDocument) => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(doc.pages[0]!.width)
    canvas.height = Math.round(doc.pages[0]!.height)
    return canvas
  }
  const nameId = (doc: InkDocument) =>
    doc.form.fields.get().find((f) => f.name === 'name')!.widgets[0]!.id

  it('rejects with the signal’s reason, and cancels the render, once it aborts mid-render', async () => {
    const doc = await open()
    const page = await doc._pdfjs.getPage(0)
    const render = page.render.bind(page)
    const controller = new AbortController()
    const reason = new Error('moved on')
    const cancels = vi.fn()
    vi.spyOn(page, 'render').mockImplementation((params) => {
      const task = render(params)
      const cancel = task.cancel.bind(task)
      task.cancel = (...args) => {
        cancels()
        cancel(...args)
      }
      // Aborted once the render has started.
      queueMicrotask(() => controller.abort(reason))
      return task
    })
    await expect(
      renderAppearances(
        doc._pdfjs,
        pass([nameId(doc)]),
        canvasFor(doc),
        controller.signal
      )
    ).rejects.toBe(reason)
    expect(cancels).toHaveBeenCalledTimes(1)
  })

  it('passes on a render that fails', async () => {
    const doc = await open()
    const page = await doc._pdfjs.getPage(0)
    const broken = new Error('broken')
    vi.spyOn(page, 'render').mockImplementation(
      () =>
        ({
          promise: Promise.reject(broken),
          cancel: () => undefined,
        }) as unknown as ReturnType<typeof page.render>
    )
    await expect(
      renderAppearances(doc._pdfjs, pass([nameId(doc)]), canvasFor(doc))
    ).rejects.toBe(broken)
  })

  it('resolves with no ids for a pass whose ids match nothing', async () => {
    const doc = await open()
    await expect(
      renderAppearances(doc._pdfjs, pass(['999R', 'nothing']), canvasFor(doc))
    ).resolves.toEqual(new Set())
    // A checked look of a text field finds nothing either.
    await expect(
      renderAppearances(doc._pdfjs, pass([nameId(doc)], 'checked'), canvasFor(doc))
    ).resolves.toEqual(new Set())
  })
})
