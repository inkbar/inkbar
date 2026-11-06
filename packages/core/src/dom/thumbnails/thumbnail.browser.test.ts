import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { writable } from '../../model/readable'
import { oneOfEach } from '../../test-support/annotations'
import { definePlugin } from '../plugins/define'
import { mountContainer, openFixtureInBrowser, settle, until } from '../test-utils'
import { createViewer, type Viewer } from '../viewer/create-viewer'

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
