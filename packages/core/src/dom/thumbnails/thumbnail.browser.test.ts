import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { GLYPHS } from '../../model/annotations/drawing/note'
import { writable } from '../../model/readable'
import { oneOfEach } from '../../test-support/annotations'
import { createOverlay } from '../overlay'
import { definePlugin } from '../plugins/define'
import { mountContainer, openFixtureInBrowser, settle, until } from '../test-utils'
import { createPageTransform } from '../transform'
import { createViewer, pluginHostOf, type Viewer } from '../viewer/create-viewer'

import { createThumbnail, createThumbnailPainter } from './thumbnail'

import type { InkDocument } from '../../model/document'
import type { Rect } from '../../model/geometry'
import type { RecordBase } from '../../model/records'
import type { InkPlugin } from '../plugins/define'

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = themeCss
  document.head.append(style)
})

let cleanup: (() => void)[] = []
afterEach(() => {
  vi.restoreAllMocks()
  cleanup.reverse().forEach((f) => f())
  cleanup = []
})

interface Finding extends RecordBase {
  page: number
  rect: Rect
}

/** A plugin keeping one finding on page 0 as `sandbox.findings`, drawn as a dashed mark. */
const findings = definePlugin('sandbox', (plugin) => {
  const records = plugin.records<Finding>('findings', {
    initial: () => [
      { id: 'f1', page: 0, rect: { x: 100, y: 500, width: 144, height: 40 } },
    ],
  })
  plugin.marks(records, {
    rect: (f) => f.rect,
    label: () => 'Finding',
    className: 'test-finding',
    style: () => ({ borderStyle: 'dashed', '--test-tint': 'red' }),
  })
})

/** A viewer on `text-simple`, ready, with its own host. */
async function viewerWith(plugins: InkPlugin[] = []): Promise<Viewer> {
  const host = mountContainer(400, 300)
  const viewer = createViewer(host, {
    source: fixtureUrl('text-simple'),
    assets: browserAssets(),
    zoom: 1,
    plugins,
  })
  cleanup.push(() => {
    viewer.destroy()
    host.remove()
  })
  await until(() => viewer.document.get() !== null)
  return viewer
}

/** Puts `el` at the top of the page, in view. */
function place(el: HTMLElement): HTMLElement {
  document.body.prepend(el)
  cleanup.push(() => el.remove())
  return el
}

async function openDoc(name: Parameters<typeof openFixtureInBrowser>[0] = 'text-simple') {
  const doc = await openFixtureInBrowser(name)
  cleanup.push(() => doc.destroy())
  return doc
}

const painted = (el: HTMLElement) => until(() => el.querySelector('canvas') !== null)
const annotationsOf = (el: HTMLElement) =>
  el.querySelectorAll(':scope > .ink-thumbnail-annotations > *').length

describe('createThumbnail', () => {
  it('labels itself "Page N"', async () => {
    const viewer = await viewerWith()
    const el = place(createThumbnail(viewer, { page: 2 }))
    expect(el.classList.contains('ink-thumbnail')).toBe(true)
    expect(el.getAttribute('role')).toBe('img')
    expect(el.getAttribute('aria-label')).toBe('Page 3')
    expect(el.tabIndex).toBe(-1)
    const other = place(createThumbnail(viewer, { page: 0, label: 'Cover' }))
    expect(other.getAttribute('aria-label')).toBe('Cover')
  })

  it('shows a sized placeholder with no document open', () => {
    const el = place(document.createElement('div'))
    const painter = createThumbnailPainter(el, { document: writable(null) }, { page: 0 })
    cleanup.push(() => painter.destroy())
    expect(el.style.width).toBe('120px')
    expect(parseFloat(el.style.height)).toBeGreaterThan(120)
    expect(el.getBoundingClientRect().height).toBeGreaterThan(120)
    expect(el.querySelector('canvas')).toBeNull()
    expect(el.getAttribute('aria-label')).toBe('Page 1')
  })

  it('sizes itself to the page', async () => {
    const viewer = await viewerWith()
    // text-simple is Letter: 612 × 792.
    const el = place(createThumbnail(viewer, { page: 0, width: 100 }))
    expect(el.style.width).toBe('100px')
    expect(parseFloat(el.style.height)).toBeCloseTo((792 / 612) * 100, 2)
    await painted(el)
    const canvas = el.querySelector('canvas')!
    expect(parseFloat(canvas.style.width)).toBeCloseTo(100, 4)
    for (const layer of el.querySelectorAll(':scope > *')) {
      expect(layer.getAttribute('aria-hidden')).toBe('true')
      expect(getComputedStyle(layer).pointerEvents).toBe('none')
    }
  })

  it('does not render until visible', async () => {
    const doc = await openDoc()
    const scroller = place(document.createElement('div'))
    scroller.style.cssText = 'height:200px;overflow:auto;'
    const spacer = document.createElement('div')
    spacer.style.height = '2000px'
    const el = document.createElement('div')
    scroller.append(spacer, el)
    const painter = createThumbnailPainter(el, { document: writable(doc) }, { page: 0 })
    cleanup.push(() => painter.destroy())
    await settle(300)
    expect(el.querySelector('canvas')).toBeNull()
    scroller.scrollTop = 2000
    await painted(el)
  })

  it('draws the page annotations', async () => {
    const doc = await openDoc()
    for (const input of oneOfEach()) doc.annotations.add(input)
    doc.annotations.add({
      type: 'square',
      page: 1,
      rect: { x: 72, y: 72, width: 50, height: 50 },
    })
    const el = place(document.createElement('div'))
    const painter = createThumbnailPainter(el, { document: writable(doc) }, { page: 0 })
    cleanup.push(() => painter.destroy())
    await painted(el)
    expect(annotationsOf(el)).toBe(doc.annotations.byPage(0).length)
    const child = el.querySelector<HTMLElement>('.ink-thumbnail-annotations > *')!
    expect(child.tabIndex).toBe(-1)
    expect(child.getAttribute('role')).toBeNull()
  })

  describe('an annotation whose drawing throws', () => {
    it('does not stop the store, the thumbnail or the overlay drawing the others', async () => {
      const doc = await openDoc()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      // A glyph that is not a list of nodes makes the note's description throw.
      const glyphs = GLYPHS as Record<string, unknown>
      glyphs.Broken = 5
      cleanup.push(() => void delete glyphs.Broken)
      const host = mountContainer(612, 792)
      const overlay = createOverlay({
        host,
        page: 0,
        store: doc.annotations,
        transform: createPageTransform(doc.pages[0]!, 1, 0),
      })
      cleanup.push(() => (overlay.destroy(), host.remove()))
      const el = place(document.createElement('div'))
      const painter = createThumbnailPainter(el, { document: writable(doc) }, { page: 0 })
      cleanup.push(() => painter.destroy())
      await painted(el)

      const rect = { x: 100, y: 500, width: 20, height: 20 }
      const bad = () =>
        doc.annotations.add({ type: 'text', page: 0, rect, icon: 'Broken' })
      expect(bad).not.toThrow()
      const good = doc.annotations.add({
        type: 'square',
        page: 0,
        rect: { x: 200, y: 500, width: 50, height: 50 },
      })
      doc.annotations.add({ type: 'text', page: 0, rect, icon: 'constructor' })

      const inThumbnail = (type: string) =>
        el.querySelector(`.ink-thumbnail-annotation[data-type="${type}"] svg`)
      expect(annotationsOf(el)).toBe(3)
      expect(inThumbnail('square')).not.toBeNull()
      expect(
        host.querySelector(`[data-annotation="${CSS.escape(good.id)}"] svg`)
      ).not.toBeNull()
      // The broken note is left empty in both, and reported once per id by each of them.
      const broken = doc.annotations.byPage(0).find((a) => a.type === 'text')!
      expect(
        host.querySelector(`[data-annotation="${CSS.escape(broken.id)}"] svg`)
      ).toBeNull()
      const warned = warn.mock.calls.filter((c) => String(c[0]).includes(broken.id))
      expect(warned).toHaveLength(2)
      expect(String(warned[0]![0])).toContain('(text)')
    })
  })

  describe('paints each annotation from its drawing', () => {
    /** A thumbnail 306 css px wide (half size) of page 0 with `inputs` added, painted. */
    async function thumbnailOf(
      ...inputs: Parameters<InkDocument['annotations']['add']>[0][]
    ) {
      const doc = await openDoc()
      for (const input of inputs) doc.annotations.add(input)
      const el = place(document.createElement('div'))
      const painter = createThumbnailPainter(
        el,
        { document: writable(doc) },
        { page: 0, width: 306 }
      )
      cleanup.push(() => painter.destroy())
      await painted(el)
      return el
    }
    const nodeOf = (el: HTMLElement, type: string) =>
      el.querySelector<HTMLElement>(`.ink-thumbnail-annotation[data-type="${type}"]`)!
    const mask = {
      type: 'mask',
      page: 0,
      rect: { x: 100, y: 500, width: 200, height: 100 },
      shape: 'rect',
      dim: 0.5,
      color: '#102030',
    } as const

    it('dims the page around a mask and leaves the cut-out clear', async () => {
      const el = await thumbnailOf(mask)
      const node = nodeOf(el, 'mask')
      // The dimming covers the whole thumbnail, not the mask's own box.
      expect(node.style.left).toBe('0px')
      expect(node.style.top).toBe('0px')
      expect(node.style.width).toBe('306px')
      expect(node.style.height).toBe('396px')
      const path = node.querySelector<SVGPathElement>('svg > path')!
      expect(path.getAttribute('fill')).toBe('#102030')
      expect(path.getAttribute('fill-opacity')).toBe('0.5')
      expect(path.getAttribute('fill-rule')).toBe('evenodd')
      // The cut-out is x 100..300, y 500..600 in points: x 50..150, y 96..146 at half size.
      expect(path.isPointInFill(new DOMPoint(10, 10))).toBe(true)
      expect(path.isPointInFill(new DOMPoint(100, 120))).toBe(false)
      expect(path.isPointInFill(new DOMPoint(160, 120))).toBe(true)
      expect(path.isPointInFill(new DOMPoint(100, 300))).toBe(true)
    })

    it('puts a mask under the other annotations whatever the order they were added in', async () => {
      const el = await thumbnailOf(
        { type: 'square', page: 0, rect: { x: 72, y: 72, width: 50, height: 50 } },
        mask,
        { type: 'circle', page: 0, rect: { x: 72, y: 172, width: 50, height: 50 } }
      )
      const types = [
        ...el.querySelectorAll<HTMLElement>('.ink-thumbnail-annotation'),
      ].map((n) => n.dataset.type)
      expect(types).toEqual(['mask', 'square', 'circle'])
    })

    it('dims the page for the first mask only, as a page does', async () => {
      const doc = await openDoc()
      // A file can hold two masks on a page, though the store adds one at a time.
      const first = doc.annotations.add(mask)
      doc.annotations.replaceAll(
        [
          first,
          {
            ...first,
            id: 'second-mask',
            rect: { x: 300, y: 300, width: 100, height: 100 },
            color: '#ff0000',
          },
        ],
        'import'
      )
      const el = place(document.createElement('div'))
      const painter = createThumbnailPainter(
        el,
        { document: writable(doc) },
        { page: 0, width: 306 }
      )
      cleanup.push(() => painter.destroy())
      await painted(el)
      const masks = el.querySelectorAll('.ink-thumbnail-annotation[data-type="mask"]')
      expect(masks).toHaveLength(1)
      expect(masks[0]!.querySelector('path')!.getAttribute('fill')).toBe('#102030')
    })

    it('dims for the same mask the page does when the first stored is not the first in reading order', async () => {
      const doc = await openDoc()
      const low = doc.annotations.add({
        ...mask,
        rect: { x: 100, y: 200, width: 100, height: 100 },
        color: '#102030',
      })
      doc.annotations.replaceAll(
        [
          low,
          {
            ...low,
            id: 'higher-mask',
            rect: { x: 100, y: 600, width: 100, height: 100 },
            color: '#ff0000',
          },
        ],
        'import'
      )
      const host = mountContainer(612, 792)
      const overlay = createOverlay({
        host,
        page: 0,
        store: doc.annotations,
        transform: createPageTransform(doc.pages[0]!, 1, 0),
      })
      cleanup.push(() => (overlay.destroy(), host.remove()))
      const el = place(document.createElement('div'))
      const painter = createThumbnailPainter(
        el,
        { document: writable(doc) },
        { page: 0, width: 306 }
      )
      cleanup.push(() => painter.destroy())
      await painted(el)
      const fill = (root: ParentNode, selector: string) =>
        root.querySelector(`${selector} path`)!.getAttribute('fill')
      expect(fill(el, '.ink-thumbnail-annotation[data-type="mask"]')).toBe('#ff0000')
      expect(fill(host, '.ink-mask-layer')).toBe('#ff0000')
    })

    it('paints nothing for an embedded annotation of any drawn kind, but a note with no appearance', async () => {
      const doc = await openDoc()
      const rect = { x: 100, y: 500, width: 120, height: 80 }
      const added = [
        ...oneOfEach(),
        { type: 'loupe', page: 0, rect, width: 2 },
        mask,
        { type: 'redact', page: 0, rect },
      ].map((input) => doc.annotations.add(input as never))
      doc.annotations._setEmbedded(
        added.map((a) => ({
          ...a,
          source: 'pdf' as const,
          locked: true,
          ...(a.type === 'text' ? { hasAppearance: false } : {}),
        }))
      )
      const el = place(document.createElement('div'))
      const painter = createThumbnailPainter(el, { document: writable(doc) }, { page: 0 })
      cleanup.push(() => painter.destroy())
      await painted(el)
      const types = [
        ...el.querySelectorAll<HTMLElement>('.ink-thumbnail-annotation'),
      ].map((n) => n.dataset.type)
      expect(types).toEqual(['text'])
    })

    it('draws a loupe as its rim, with no lens', async () => {
      const el = await thumbnailOf({
        type: 'loupe',
        page: 0,
        rect: { x: 200, y: 500, width: 120, height: 120 },
        width: 2,
      })
      const node = nodeOf(el, 'loupe')
      const rim = node.querySelector('circle.ink-loupe-rim')!
      expect(rim.getAttribute('stroke-width')).toBe('1')
      expect(rim.getAttribute('r')).toBe('29.5')
      expect(node.querySelectorAll('svg > *')).toHaveLength(1)
      expect(node.querySelector('image, canvas, foreignObject')).toBeNull()
    })

    it('adds no hit shape, handle or marker to any annotation', async () => {
      const doc = await openDoc()
      for (const input of oneOfEach()) doc.annotations.add(input)
      doc.annotations.add(mask)
      doc.annotations.add({
        type: 'loupe',
        page: 0,
        rect: { x: 200, y: 500, width: 120, height: 120 },
      })
      doc.annotations.add({
        type: 'highlight',
        page: 0,
        contents: 'A comment',
        quads: [
          {
            p1: { x: 72, y: 615 },
            p2: { x: 300, y: 615 },
            p3: { x: 72, y: 595 },
            p4: { x: 300, y: 595 },
          },
        ],
      })
      const el = place(document.createElement('div'))
      const painter = createThumbnailPainter(el, { document: writable(doc) }, { page: 0 })
      cleanup.push(() => painter.destroy())
      await painted(el)
      const layer = el.querySelector('.ink-thumbnail-annotations')!
      expect(annotationsOf(el)).toBe(doc.annotations.byPage(0).length)
      expect(
        layer.querySelector(
          '[data-ink-hit-area], [data-ink-hit-stroke], [data-ink-edge], [data-ink-text-area], [data-handle], .ink-comment-marker, .ink-selection-frame, .ink-mask-shape, [data-ink-note]'
        )
      ).toBeNull()
      expect(layer.querySelectorAll('rect[fill="transparent"]')).toHaveLength(0)
    })

    it('draws a note and a stamp as the page does, without the note shadow', async () => {
      const el = await thumbnailOf(
        { type: 'text', page: 0, rect: { x: 500, y: 700, width: 20, height: 20 } },
        {
          type: 'stamp',
          page: 0,
          rect: { x: 72, y: 150, width: 120, height: 40 },
          imagedata:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        }
      )
      expect(nodeOf(el, 'text').querySelectorAll('svg path.ink-note-icon')).toHaveLength(
        1
      )
      expect(nodeOf(el, 'stamp').querySelectorAll('svg image.ink-stamp')).toHaveLength(1)
      expect(nodeOf(el, 'stamp').querySelector('img')).toBeNull()
      expect(getComputedStyle(nodeOf(el, 'text').querySelector('svg')!).filter).toBe(
        'none'
      )
    })
  })

  it('draws an embedded note the file gives no appearance, but not its replies', async () => {
    const doc = await openDoc('annotated-notes-threaded')
    const el = place(document.createElement('div'))
    const painter = createThumbnailPainter(el, { document: writable(doc) }, { page: 0 })
    cleanup.push(() => painter.destroy())
    await painted(el)
    // Two notes start threads, and two notes reply to the first: only the two show.
    const roots = doc.annotations
      .byPage(0)
      .filter((a) => a.type === 'text' && a.inReplyTo === undefined)
    expect(roots).toHaveLength(2)
    await until(() => annotationsOf(el) === 2)
    expect(el.querySelectorAll('.ink-thumbnail-annotations .ink-note-icon')).toHaveLength(
      2
    )
  })

  it('follows annotation edits and undo', async () => {
    const viewer = await viewerWith()
    const doc = viewer.document.get()!
    const el = place(createThumbnail(viewer, { page: 0 }))
    await painted(el)
    expect(annotationsOf(el)).toBe(0)
    const a = doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 72, y: 72, width: 50, height: 50 },
    })
    expect(annotationsOf(el)).toBe(1)
    const box = el.querySelector<HTMLElement>('.ink-thumbnail-annotations > *')!
    const top = box.style.top
    doc.annotations.update(a.id, { rect: { x: 72, y: 300, width: 50, height: 50 } })
    expect(
      el.querySelector<HTMLElement>('.ink-thumbnail-annotations > *')!.style.top
    ).not.toBe(top)
    doc.history.undo()
    doc.history.undo()
    expect(annotationsOf(el)).toBe(0)
    doc.history.redo()
    expect(annotationsOf(el)).toBe(1)
  })

  it('annotations: false skips the layer', async () => {
    const viewer = await viewerWith()
    viewer.document.get()!.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 72, y: 72, width: 50, height: 50 },
    })
    const el = place(createThumbnail(viewer, { page: 0, annotations: false }))
    await painted(el)
    expect(el.querySelector('.ink-thumbnail-annotations')).toBeNull()
  })

  it('draws marks as static copies', async () => {
    const viewer = await viewerWith([findings()])
    const el = place(createThumbnail(viewer, { page: 0 }))
    await painted(el)
    const marks = el.querySelectorAll<HTMLElement>('.ink-thumbnail-marks > div')
    expect(marks).toHaveLength(1)
    const mark = marks[0]!
    expect(mark.classList.contains('test-finding')).toBe(true)
    expect(mark.style.borderStyle).toBe('dashed')
    expect(mark.style.getPropertyValue('--test-tint')).toBe('red')
    expect(el.querySelector('button, [tabindex]')).toBeNull()
    expect(mark.tabIndex).toBe(-1)
    // Placed through the thumbnail's transform: 144pt wide at 120 / 612.
    expect(parseFloat(mark.style.width)).toBeCloseTo((144 * 120) / 612, 3)

    const records = viewer.records<Finding>('sandbox.findings')
    records.add({ id: 'f2', page: 0, rect: { x: 100, y: 300, width: 50, height: 20 } })
    expect(el.querySelectorAll('.ink-thumbnail-marks > div')).toHaveLength(2)
    records.add({ id: 'f3', page: 1, rect: { x: 100, y: 300, width: 50, height: 20 } })
    expect(el.querySelectorAll('.ink-thumbnail-marks > div')).toHaveLength(2)
    viewer.document.get()!.history.undo()
    viewer.document.get()!.history.undo()
    expect(el.querySelectorAll('.ink-thumbnail-marks > div')).toHaveLength(1)
  })

  it('a new label alone renames it without drawing anything again', async () => {
    const viewer = await viewerWith([findings()])
    const host = pluginHostOf(viewer)
    const el = place(document.createElement('div'))
    const painter = createThumbnailPainter(
      el,
      {
        document: viewer.document,
        pluginHost: { get: () => host, subscribe: () => () => undefined },
      },
      { page: 0 }
    )
    cleanup.push(() => painter.destroy())
    await painted(el)
    const canvas = el.querySelector('canvas')
    const mark = el.querySelector('.ink-thumbnail-marks > div')
    expect(mark).not.toBeNull()
    // A binding passes every option, with a new label function on each render.
    painter.update({ page: 0, label: () => 'First' })
    expect(el.getAttribute('aria-label')).toBe('First')
    expect(el.querySelector('canvas')).toBe(canvas)
    expect(el.querySelector('.ink-thumbnail-marks > div')).toBe(mark)
  })

  it('marks: false skips them', async () => {
    const viewer = await viewerWith([findings()])
    const el = place(createThumbnail(viewer, { page: 0, marks: false }))
    await painted(el)
    expect(el.querySelector('.ink-thumbnail-marks')).toBeNull()
  })

  it('repaints when another document opens', async () => {
    const viewer = await viewerWith()
    const first = viewer.document.get()!
    first.annotations.add({
      type: 'square',
      page: 2,
      rect: { x: 72, y: 72, width: 50, height: 50 },
    })
    const el = place(createThumbnail(viewer, { page: 2 }))
    await painted(el)
    expect(annotationsOf(el)).toBe(1)
    // Letter portrait; page 3 of mixed-page-sizes is A4 landscape.
    expect(parseFloat(el.style.height)).toBeGreaterThan(120)
    const canvas = el.querySelector('canvas')
    viewer.open(fixtureUrl('mixed-page-sizes'))
    await until(() => viewer.document.get() !== null && viewer.document.get() !== first)
    expect(parseFloat(el.style.height)).toBeCloseTo((595 / 842) * 120, 1)
    expect(annotationsOf(el)).toBe(0)
    await until(() => {
      const next = el.querySelector('canvas')
      return next !== null && next !== canvas
    })
    expect(el.querySelectorAll('canvas')).toHaveLength(1)
    expect(parseFloat(el.querySelector('canvas')!.style.height)).toBeCloseTo(
      (595 / 842) * 120,
      1
    )
  })

  it('updates in place when its options change', async () => {
    const doc = await openDoc()
    doc.annotations.add({
      type: 'square',
      page: 1,
      rect: { x: 72, y: 72, width: 50, height: 50 },
    })
    const el = place(document.createElement('div'))
    const painter = createThumbnailPainter(el, { document: writable(doc) }, { page: 0 })
    cleanup.push(() => painter.destroy())
    await painted(el)
    expect(annotationsOf(el)).toBe(0)
    painter.update({ page: 1, width: 60 })
    expect(el.getAttribute('aria-label')).toBe('Page 2')
    expect(el.style.width).toBe('60px')
    expect(annotationsOf(el)).toBe(1)
    await until(() => parseFloat(el.querySelector('canvas')?.style.width ?? '0') === 60)
    painter.update({ annotations: false, label: 'Second' })
    expect(el.querySelector('.ink-thumbnail-annotations')).toBeNull()
    expect(el.getAttribute('aria-label')).toBe('Second')
    painter.update({ annotations: true })
    expect(annotationsOf(el)).toBe(1)
    // An option given as undefined, as a binding's unset prop is, goes back to its default.
    painter.update({ width: undefined, label: undefined, annotations: undefined })
    expect(el.style.width).toBe('120px')
    expect(el.getAttribute('aria-label')).toBe('Page 2')
    expect(annotationsOf(el)).toBe(1)
  })

  it('leaves the host element as it found it', async () => {
    const doc = await openDoc()
    const el = place(document.createElement('div'))
    el.className = 'mine'
    el.style.width = '10px'
    const own = el.appendChild(document.createElement('span'))
    const painter = createThumbnailPainter(el, { document: writable(doc) }, { page: 0 })
    await painted(el)
    painter.destroy()
    expect(el.className).toBe('mine')
    expect(el.style.width).toBe('10px')
    expect(el.style.height).toBe('')
    expect(el.getAttribute('role')).toBeNull()
    expect(el.getAttribute('aria-label')).toBeNull()
    expect([...el.children]).toEqual([own])
  })

  it('unmounting mid-render throws nothing', async () => {
    const errors = vi.spyOn(console, 'error')
    const rejections: unknown[] = []
    const onRejection = (e: PromiseRejectionEvent) => rejections.push(e.reason)
    window.addEventListener('unhandledrejection', onRejection)
    cleanup.push(() => window.removeEventListener('unhandledrejection', onRejection))
    const doc = await openDoc()
    const docs = writable<InkDocument | null>(doc)
    const el = place(document.createElement('div'))
    const painter = createThumbnailPainter(el, { document: docs }, { page: 0 })
    // The renderer adds its layer as it starts to paint, before the canvas lands.
    await until(() => el.querySelector('.ink-canvas-layer') !== null)
    expect(el.querySelector('canvas')).toBeNull()
    painter.destroy()
    docs.set(null)
    await settle(300)
    expect(el.children).toHaveLength(0)
    expect(errors).not.toHaveBeenCalled()
    expect(rejections).toEqual([])
  })

  it('stops with the viewer', async () => {
    const viewer = await viewerWith()
    const el = place(createThumbnail(viewer, { page: 0 }))
    await painted(el)
    viewer.destroy()
    expect(el.children).toHaveLength(0)
  })
})

describe('the --ink-thumbnail-width token', () => {
  /** A `[data-ink-root]` element in the page, with the token set to `token` when given. */
  function root(token?: string): HTMLElement {
    const el = place(document.createElement('div'))
    el.setAttribute('data-ink-root', '')
    if (token !== undefined) el.style.setProperty('--ink-thumbnail-width', token)
    return el
  }

  it('sizes a thumbnail with no width from the token on the root', async () => {
    const viewer = await viewerWith()
    // Created before it is placed, so the token is read once it is in the page.
    const el = createThumbnail(viewer, { page: 0 })
    root('160px').append(el)
    await until(() => el.style.width === '160px')
    expect(parseFloat(el.style.height)).toBeCloseTo((792 / 612) * 160, 2)
    await painted(el)
    expect(parseFloat(el.querySelector('canvas')!.style.width)).toBeCloseTo(160, 4)
  })

  it('sizes a painter on a placed element from the token at once', () => {
    const el = root('160px').appendChild(document.createElement('div'))
    const painter = createThumbnailPainter(el, { document: writable(null) }, { page: 0 })
    cleanup.push(() => painter.destroy())
    expect(el.style.width).toBe('160px')
  })

  it('reads the px unit in any case', () => {
    const el = root('160PX').appendChild(document.createElement('div'))
    const painter = createThumbnailPainter(el, { document: writable(null) }, { page: 0 })
    cleanup.push(() => painter.destroy())
    expect(el.style.width).toBe('160px')
  })

  it('lets a given width or height win over the token', async () => {
    const viewer = await viewerWith()
    const box = root('160px')
    const wide = box.appendChild(createThumbnail(viewer, { page: 0, width: 100 }))
    const tall = box.appendChild(createThumbnail(viewer, { page: 0, height: 100 }))
    await painted(wide)
    expect(wide.style.width).toBe('100px')
    expect(tall.style.height).toBe('100px')
  })

  it('falls back to 120 when the token is unset or not in px', async () => {
    const viewer = await viewerWith()
    for (const token of [undefined, '10rem', 'wide']) {
      const el = root(token).appendChild(createThumbnail(viewer, { page: 0 }))
      await painted(el)
      expect(el.style.width).toBe('120px')
    }
  })
})
