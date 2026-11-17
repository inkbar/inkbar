import { afterEach, describe, expect, it, vi } from 'vitest'

import { staticDefaults } from '../model/annotations/defaults'
import * as describeModule from '../model/annotations/drawing/describe'
import { createAnnotationStore } from '../model/annotations/store'
import { writable } from '../model/readable'

import { drawingFor } from './drawing-context'
import { createOverlay } from './overlay'
import { mountContainer, openFixtureInBrowser, until } from './test-utils'
import { createThumbnailPainter } from './thumbnails/thumbnail'
import { createPageTransform } from './transform'

import type { PageInfo } from '../model/pages'

vi.mock('../model/annotations/drawing/describe', async (importOriginal) => {
  const actual = await importOriginal<typeof describeModule>()
  return { ...actual, describeDrawing: vi.fn(actual.describeDrawing) }
})

const page: PageInfo = {
  index: 0,
  box: { x: 0, y: 0, width: 612, height: 792 },
  rotate: 0,
  userUnit: 1,
  width: 612,
  height: 792,
}

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

describe('the drawing cache', () => {
  it('zooming does not describe a 5,000-point stroke again', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const host = mountContainer(612, 792)
    const overlay = createOverlay({
      host,
      page: 0,
      store,
      transform: createPageTransform(page, 1, 0),
      onActivate: vi.fn(),
    })
    cleanup.push(() => (overlay.destroy(), host.remove()))
    const stroke = Array.from({ length: 5000 }, (_, i) => ({
      x: 20 + (i / 5000) * 560,
      y: 400 + Math.sin(i / 40) * 100,
    }))
    const spy = vi.mocked(describeModule.describeDrawing)
    spy.mockClear()
    const ink = store.add({ type: 'ink', page: 0, inklist: [stroke], width: 2 })
    for (const zoom of [1, 2, 4]) overlay.update(createPageTransform(page, zoom, 0))
    const forInk = spy.mock.calls.filter(([a]) => a.id === ink.id)
    expect(forInk).toHaveLength(1)
    expect(overlay.elementFor(ink.id)!.querySelector('path.ink-stroke')).not.toBeNull()
  })
})

describe('the drawing cache and the page it was made for', () => {
  it('describes again when the page changes its own box in place', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const mine: PageInfo = { ...page, box: { ...page.box } }
    const a = store.add({
      type: 'mask',
      page: 0,
      rect: { x: 100, y: 500, width: 100, height: 100 },
      shape: 'rect',
    })
    const t = createPageTransform(mine, 1, 0)
    const before = drawingFor(a, t)!
    mine.box.width = 700
    const after = drawingFor(a, createPageTransform(mine, 1, 0))!
    expect(after).not.toBe(before)
    expect(after.bounds.width).toBe(700)
  })
})

describe('a line whose description throws', () => {
  it('does not stop the store, and the page and the thumbnail still draw the others', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const doc = await openFixtureInBrowser('text-simple')
    cleanup.push(() => doc.destroy())
    const host = mountContainer(612, 792)
    const overlay = createOverlay({
      host,
      page: 0,
      store: doc.annotations,
      transform: createPageTransform(page, 1, 0),
      onActivate: vi.fn(),
    })
    cleanup.push(() => (overlay.destroy(), host.remove()))
    const el = document.createElement('div')
    document.body.prepend(el)
    const painter = createThumbnailPainter(el, { document: writable(doc) }, { page: 0 })
    cleanup.push(() => (painter.destroy(), el.remove()))
    const real = vi.mocked(describeModule.describeDrawing).getMockImplementation()!
    vi.mocked(describeModule.describeDrawing).mockImplementation((a, c) => {
      if (a.type === 'line') throw new Error('cannot describe')
      return real(a, c)
    })
    cleanup.push(() => vi.mocked(describeModule.describeDrawing).mockImplementation(real))
    let line
    expect(() => {
      line = doc.annotations.add({
        type: 'line',
        page: 0,
        start: { x: 100, y: 600 },
        end: { x: 200, y: 650 },
      })
    }).not.toThrow()
    const square = doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 100, y: 400, width: 50, height: 50 },
    })
    expect(line).toBeDefined()
    await until(() => el.querySelector('canvas') !== null)
    expect(overlay.elementFor(square.id)!.querySelector('rect')).not.toBeNull()
    expect(
      el.querySelector('.ink-thumbnail-annotation[data-type="square"] svg')
    ).not.toBeNull()
  })
})

describe('a stamp press area', () => {
  it('covers the stamp whatever shape its drawing has', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const host = mountContainer(612, 792)
    const overlay = createOverlay({
      host,
      page: 0,
      store,
      transform: createPageTransform(page, 2, 0),
      onActivate: vi.fn(),
    })
    cleanup.push(() => (overlay.destroy(), host.remove()))
    const rect = { x: 100, y: 500, width: 50, height: 30 }
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    // The image is drawn on its own, not inside a group.
    vi.mocked(describeModule.describeDrawing).mockImplementationOnce(() => ({
      layer: 'annotation',
      bounds: rect,
      items: [{ kind: 'image', role: 'stamp', data: png, rect, angle: 0 }],
    }))
    const stamp = store.add({ type: 'stamp', page: 0, rect, imagedata: png })
    const el = overlay.elementFor(stamp.id)!
    const hit = el.querySelector('rect[data-ink-hit-area]')!
    expect(hit.getAttribute('width')).toBe('100')
    expect(hit.getAttribute('height')).toBe('60')
    expect(el.querySelector('image')!.getAttribute('pointer-events')).toBe('none')
  })
})

describe('an annotation that cannot be described', () => {
  it('is left empty and named in one warning, and the page draws the rest', async () => {
    const actual = await vi.importActual<typeof describeModule>(
      '../model/annotations/drawing/describe'
    )
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const bad = store.add({
      type: 'square',
      page: 0,
      rect: { x: 100, y: 600, width: 80, height: 40 },
    })
    const good = store.add({
      type: 'circle',
      page: 0,
      rect: { x: 300, y: 600, width: 80, height: 40 },
    })
    vi.mocked(describeModule.describeDrawing).mockImplementation((a, context) => {
      if (a.id === bad.id) throw new RangeError('not drawable')
      return actual.describeDrawing(a, context)
    })
    cleanup.push(() =>
      vi.mocked(describeModule.describeDrawing).mockImplementation(actual.describeDrawing)
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    cleanup.push(() => warn.mockRestore())
    const host = mountContainer(612, 792)
    const overlay = createOverlay({
      host,
      page: 0,
      store,
      transform: createPageTransform(page, 1, 0),
      onActivate: vi.fn(),
    })
    cleanup.push(() => (overlay.destroy(), host.remove()))
    overlay.update(createPageTransform(page, 2, 0))
    expect(overlay.elementFor(bad.id)!.childNodes).toHaveLength(0)
    expect(overlay.elementFor(good.id)!.querySelector('ellipse')).not.toBeNull()
    const named = warn.mock.calls.filter(([m]) => String(m).includes(bad.id))
    expect(named).toHaveLength(1)
    expect(String(named[0]![0])).toContain('(square)')
  })
})
