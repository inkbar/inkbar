// The engine reader's field appearances, drawn by the engine: each on the page canvas's pixel
// grid, in the state each look names, and never on a canvas whose draw was given up.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { hiddenFromIds, pageCanvasSize } from '../dom/draw-request'
import { annotsOrder } from '../dom/form-order'
import { openFixtureInBrowser } from '../dom/test-utils'
import {
  createPageTransform,
  type PageTransform,
  type ViewRotation,
} from '../dom/transform'

import type { InkDocument, EngineLoader } from '../model/document'
import type { FormWidget } from '../model/form/types'
import type { Rect } from '../model/geometry'
import type { FieldLook } from '../reader/types'
import type { FixtureName } from '@inkbar/fixtures/urls'

const flag = globalThis as { __INKBAR_READER__?: unknown }

let cleanup: (() => unknown)[] = []
beforeEach(() => {
  flag.__INKBAR_READER__ = 'engine'
})
afterEach(async () => {
  delete flag.__INKBAR_READER__
  for (const f of cleanup.reverse()) await f()
  cleanup = []
})

/** The real engine; `onFieldDraw` is called as each field draw is asked of it. */
const engine =
  (onFieldDraw?: () => void): EngineLoader =>
  async () => {
    const real = await import('@inkbar/engine')
    return {
      createEngine: async () => {
        const made = await real.createEngine()
        const open = made.open.bind(made)
        made.open = async (...args) => {
          const doc = await open(...args)
          const draw = doc.renderAnnotations.bind(doc)
          doc.renderAnnotations = (...drawArgs) => {
            const drawing = draw(...drawArgs)
            onFieldDraw?.()
            return drawing
          }
          return doc
        }
        return made
      },
    }
  }

/** `name` read by the engine reader, or by PDF.js with `pdfjs`. */
async function open(
  name: FixtureName,
  opts: { pdfjs?: boolean; engine?: EngineLoader } = {}
): Promise<InkDocument> {
  if (opts.pdfjs) delete flag.__INKBAR_READER__
  const doc = await openFixtureInBrowser(name, { engine: opts.engine ?? engine() })
  flag.__INKBAR_READER__ = 'engine'
  cleanup.push(() => doc.destroy())
  return doc
}

/** The page's widgets in `/Annots` order, each with the look the form layer shows for it. */
function widgetsOf(doc: InkDocument, page: number) {
  const values = doc.form.values.get()
  const found = doc.form.fields.get().flatMap((field) =>
    field.widgets
      .filter((w) => w.page === page && !w.hidden)
      .map((widget) => {
        const toggle = field.type === 'checkbox' || field.type === 'radio'
        const look: FieldLook = !toggle
          ? 'own'
          : widget.onState !== undefined && values[field.name] === widget.onState
            ? 'checked'
            : 'unchecked'
        return { widget, toggle, look }
      })
  )
  return annotsOrder(found, (f): Pick<FormWidget, 'order'> => f.widget)
}

/** Whether the file has an appearance for `look` of `widget`, as the form layer expects one. */
const hasLook = (widget: FormWidget, look: FieldLook): boolean =>
  !!(look === 'own'
    ? widget.appearance.fileAppearance
    : look === 'checked'
      ? widget.appearance.onAppearance
      : widget.appearance.offAppearance)

/** A widget's canvas in device pixels of the page canvas, placed as the form layer places it. */
function geometry(t: PageTransform, dpr: number, rect: Rect) {
  const PAD = 1
  const r = t.toCssRect(rect)
  const x = Math.floor(r.left * dpr) - PAD
  const y = Math.floor(r.top * dpr) - PAD
  const width = Math.max(1, Math.ceil((r.left + r.width) * dpr) + PAD - x)
  const height = Math.max(1, Math.ceil((r.top + r.height) * dpr) + PAD - y)
  return { x, y, width, height }
}

/** The page drawn by the reader as the page canvas draws it, leaving out `hide`. */
async function drawPage(
  doc: InkDocument,
  page: number,
  t: PageTransform,
  dpr: number,
  hide: string[]
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  await doc._reader.draw(
    {
      page,
      rotation: t.totalRotation,
      zoom: t.zoom,
      pixelRatio: dpr,
      ...pageCanvasSize(t, dpr),
      hide: hiddenFromIds(hide, page),
    },
    canvas
  )
  return canvas
}

/** `ids` in `look` drawn by the reader into a canvas `g` places on the page canvas. */
async function drawFields(
  doc: InkDocument,
  page: number,
  t: PageTransform,
  dpr: number,
  g: { x: number; y: number; width: number; height: number },
  ids: string[],
  look: FieldLook
) {
  const canvas = document.createElement('canvas')
  canvas.width = g.width
  canvas.height = g.height
  const found = await doc._reader.drawFields(
    {
      page,
      look,
      ids: new Set(ids),
      zoom: t.zoom,
      rotation: t.totalRotation,
      pixelRatio: dpr,
      x: g.x,
      y: g.y,
    },
    canvas
  )
  return { canvas, found }
}

const pixels = (canvas: HTMLCanvasElement): Uint8ClampedArray =>
  canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data

describe('field appearances drawn by the engine', () => {
  it.each([0, 1])(
    'a field canvas over the page canvas equals the engine’s page with the field, page %i',
    async (page) => {
      const doc = await open('form-fields')
      const widgets = widgetsOf(doc, page)
      expect(widgets.length).toBeGreaterThan(2)
      const ids = widgets.map((w) => w.widget.id)
      for (const zoom of [1, 1.25, 2.37])
        for (const rotation of [0, 90, 180, 270] as ViewRotation[])
          for (const dpr of [1, 2]) {
            const at = `zoom ${zoom}, rotation ${rotation}, pixel ratio ${dpr}`
            const t = createPageTransform(doc.pages[page]!, zoom, rotation)
            const expected = await drawPage(doc, page, t, dpr, [])
            const bare = await drawPage(doc, page, t, dpr, ids)
            // Every field alone too, to tell the fields' pixels.
            const fields = document.createElement('canvas')
            fields.width = bare.width
            fields.height = bare.height
            const layered = bare.getContext('2d')!
            for (const { widget, look } of widgets) {
              const g = geometry(t, dpr, widget.rect)
              const { canvas, found } = await drawFields(
                doc,
                page,
                t,
                dpr,
                g,
                [widget.id],
                look
              )
              expect(found, `${widget.id} ${look}, ${at}`).toEqual(
                new Set(hasLook(widget, look) ? [widget.id] : [])
              )
              layered.drawImage(canvas, g.x, g.y)
              fields.getContext('2d')!.drawImage(canvas, g.x, g.y)
            }
            const got = pixels(bare)
            const want = pixels(expected)
            const alpha = pixels(fields)
            let fieldPixels = 0
            let differing = 0
            let byTwo = 0
            let worstInside = 0
            let worstOutside = 0
            for (let i = 0; i < got.length; i += 4) {
              const inside = alpha[i + 3]! > 0
              if (inside) fieldPixels++
              let d = 0
              for (let c = 0; c < 3; c++)
                d = Math.max(d, Math.abs(got[i + c]! - want[i + c]!))
              if (d > 0) differing++
              if (d > 1) byTwo++
              if (inside) worstInside = Math.max(worstInside, d)
              else worstOutside = Math.max(worstOutside, d)
            }
            // Measured over every case here: a channel is off by at most 1 outside the fields and
            // 2 inside them; at most 0.53% of the fields' pixels differ at all, and 0.015% by 2.
            // Each field is drawn alone over a cut of the page, which the engine places by a
            // whole-pixel offset: drawn over the whole page instead, every channel is within 1.
            // The cut's offset most likely moves an antialiased edge by a hair through PDFium's
            // single-precision matrix. A field set a pixel off would differ by far more than 2
            // at its hard edges.
            expect(worstOutside, at).toBeLessThanOrEqual(1)
            expect(worstInside, at).toBeLessThanOrEqual(2)
            expect(differing / fieldPixels, at).toBeLessThanOrEqual(0.01)
            expect(byTwo / fieldPixels, at).toBeLessThanOrEqual(0.0005)

            // The same fields drawn over the whole page, one pass per look: every channel within 1.
            const whole = await drawPage(doc, page, t, dpr, ids)
            const all = { x: 0, y: 0, width: whole.width, height: whole.height }
            for (const look of ['own', 'checked', 'unchecked'] as const) {
              const of = widgets.filter((w) => w.look === look).map((w) => w.widget.id)
              if (of.length === 0) continue
              const { canvas } = await drawFields(doc, page, t, dpr, all, of, look)
              whole.getContext('2d')!.drawImage(canvas, 0, 0)
            }
            const over = pixels(whole)
            let worstWhole = 0
            for (let i = 0; i < over.length; i += 4)
              for (let c = 0; c < 3; c++)
                worstWhole = Math.max(worstWhole, Math.abs(over[i + c]! - want[i + c]!))
            expect(worstWhole, `whole page, ${at}`).toBeLessThanOrEqual(1)
          }
    }
  )

  it.each([
    ['form-fields', 0],
    ['form-fields', 1],
    ['form-rollover', 0],
  ] as const)(
    'resolves the ids PDF.js resolves for each look, %s page %i',
    async (name, page) => {
      const doc = await open(name)
      const plain = await open(name, { pdfjs: true })
      expect(plain._reader.kind).toBe('pdfjs')
      // Every widget of the page, those it hides included, each asked for in every look.
      const ids = doc.form.fields
        .get()
        .flatMap((f) => f.widgets)
        .filter((w) => w.page === page)
        .map((w) => w.id)
      expect(ids.length).toBeGreaterThan(1)
      const t = createPageTransform(doc.pages[page]!, 1, 0)
      const g = { x: 0, y: 0, ...pageCanvasSize(t, 1) }
      // The one difference: PDF.js gives every button widget a canvas of its own, so it has a
      // run, an empty one, for a push button with no normal appearance. The engine has nothing to
      // draw for it and leaves it out. Neither draws a pixel of it.
      const blank = doc.form.fields
        .get()
        .filter((f) => f.type === 'button')
        .flatMap((f) => f.widgets)
        .filter((w) => w.page === page && !w.hidden && !w.appearance.fileAppearance)
        .map((w) => w.id)
      for (const look of ['own', 'checked', 'unchecked'] as const) {
        const drawn = await drawFields(doc, page, t, 1, g, ids, look)
        const pdfjs = await drawFields(plain, page, t, 1, g, ids, look)
        const expected = [...pdfjs.found].filter(
          (id) => look !== 'own' || !blank.includes(id)
        )
        expect([...drawn.found].sort(), look).toEqual(expected.sort())
        if (look === 'own')
          for (const id of blank)
            expect(pdfjs.found.has(id), `${id} with PDF.js`).toBe(true)
      }
    }
  )

  it('draws a toggle’s on-state for checked and its Off state for unchecked', async () => {
    const doc = await open('form-fields')
    const t = createPageTransform(doc.pages[0]!, 2, 0)
    const toggles = widgetsOf(doc, 0).filter(
      ({ widget, toggle }) =>
        toggle && widget.appearance.onAppearance && widget.appearance.offAppearance
    )
    // Toggles off in the file and on.
    const looks = toggles.map((w) => w.look)
    expect(looks).toContain('checked')
    expect(looks).toContain('unchecked')
    for (const { widget, look } of toggles) {
      const g = geometry(t, 1, widget.rect)
      const draw = async (as: FieldLook) =>
        pixels((await drawFields(doc, 0, t, 1, g, [widget.id], as)).canvas)
      const own = await draw('own')
      // The look its state names is the appearance the file selects; the other one is not.
      expect(await draw(look)).toEqual(own)
      expect(await draw(look === 'checked' ? 'unchecked' : 'checked')).not.toEqual(own)
    }
  })

  it('resolves without a checkbox’s id for unchecked when it has no Off appearance', async () => {
    // Its one state is the on-state `Yes No`, which the file selects.
    const doc = await open('form-rollover')
    const [agree] = doc.form.fields.get().find((f) => f.name === 'agree')!.widgets
    const t = createPageTransform(doc.pages[0]!, 1, 0)
    const g = geometry(t, 1, agree!.rect)
    const checked = await drawFields(doc, 0, t, 1, g, [agree!.id], 'checked')
    expect(checked.found).toEqual(new Set([agree!.id]))
    expect(pixels(checked.canvas).some((v, i) => i % 4 === 3 && v > 0)).toBe(true)
    // Its on-state, named with a space, is the appearance the file selects.
    const own = await drawFields(doc, 0, t, 1, g, [agree!.id], 'own')
    expect(pixels(checked.canvas)).toEqual(pixels(own.canvas))
    const unchecked = await drawFields(doc, 0, t, 1, g, [agree!.id], 'unchecked')
    expect(unchecked.found).toEqual(new Set())
    expect(pixels(unchecked.canvas).every((v) => v === 0)).toBe(true)
  })
})

describe('a field draw given up', () => {
  const GREEN = [10, 200, 30, 255]

  /** A canvas for `widget`'s first field, filled with green. */
  function filled(doc: InkDocument) {
    const { widget } = widgetsOf(doc, 0)[0]!
    const t = createPageTransform(doc.pages[0]!, 1, 0)
    const g = geometry(t, 1, widget.rect)
    const canvas = document.createElement('canvas')
    canvas.width = g.width
    canvas.height = g.height
    const context = canvas.getContext('2d')!
    context.fillStyle = `rgb(${GREEN.slice(0, 3).join(',')})`
    context.fillRect(0, 0, g.width, g.height)
    const request = {
      page: 0,
      look: 'own' as const,
      ids: new Set([widget.id]),
      zoom: 1,
      rotation: 0 as const,
      pixelRatio: 1,
      x: g.x,
      y: g.y,
    }
    const untouched = () => {
      expect([canvas.width, canvas.height]).toEqual([g.width, g.height])
      const data = pixels(canvas)
      expect(data.every((v, i) => v === GREEN[i % 4])).toBe(true)
    }
    return { canvas, request, untouched }
  }

  it('rejects with the signal’s reason once it aborts mid-draw, the canvas untouched', async () => {
    const controller = new AbortController()
    const reason = new Error('moved on')
    let asked = 0
    const doc = await open('form-fields', {
      engine: engine(() => {
        asked++
        controller.abort(reason)
      }),
    })
    const { canvas, request, untouched } = filled(doc)
    await expect(doc._reader.drawFields(request, canvas, controller.signal)).rejects.toBe(
      reason
    )
    expect(asked).toBe(1)
    untouched()
  })

  it('rejects with DocumentDestroyed once the document is destroyed mid-draw, the canvas untouched', async () => {
    const held: { doc?: InkDocument } = {}
    let asked = 0
    const doc = await open('form-fields', {
      engine: engine(() => {
        asked++
        void held.doc?.destroy()
      }),
    })
    held.doc = doc
    const { canvas, request, untouched } = filled(doc)
    await expect(doc._reader.drawFields(request, canvas)).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
    expect(asked).toBe(1)
    untouched()
  })
})
