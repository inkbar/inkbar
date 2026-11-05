import { describe, expect, it, vi } from 'vitest'

import { writable } from '../../model/readable'

import { createThumbnailsController, type ThumbnailsOptions } from './list'

import type { InkDocument } from '../../model/document'
import type { PageInfo } from '../../model/pages'
import type { Viewport } from '../viewport'

const page = (index: number, width: number, height: number): PageInfo => ({
  index,
  box: { x: 0, y: 0, width, height },
  rotate: 0,
  userUnit: 1,
  width,
  height,
})
const letter = (index: number) => page(index, 612, 792)
const landscape = (index: number) => page(index, 842, 595)

/** A document as the controller sees it: its pages. */
const docOf = (pages: PageInfo[]) => ({ pages }) as unknown as InkDocument
const letters = (count: number) =>
  docOf(Array.from({ length: count }, (_, i) => letter(i)))

function viewportAt(current: number) {
  const currentPage = writable(current)
  const scrollToPage = vi.fn()
  return {
    currentPage,
    scrollToPage,
    viewport: { currentPage, scrollToPage } as unknown as Viewport,
  }
}

/** A scroller with no layout engine: what it shows is its scrollTop and clientHeight. */
function scrollerOf(clientHeight: number, scrollTop = 0) {
  return {
    scrollTop,
    clientHeight,
    clientTop: 0,
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    contains: () => false,
  } as unknown as HTMLElement
}

function make(doc: InkDocument | null, opts?: ThumbnailsOptions, current = 0) {
  const document = writable(doc)
  const vp = viewportAt(current)
  const viewport = writable<Viewport | null>(vp.viewport)
  const c = createThumbnailsController({ document, viewport }, opts)
  return { c, document, viewport, vp }
}

/** Item height for a page at width 120: the thumbnail plus 32px for the label and padding. */
const itemHeight = (p: PageInfo) => (120 * p.height) / p.width + 32

describe('createThumbnailsController', () => {
  it('lists all pages by default', () => {
    const { c } = make(letters(4))
    expect(c.state.get().pages).toEqual([0, 1, 2, 3])
  })

  it('lists the given subset in order', () => {
    const { c } = make(letters(10), { pages: [7, 0, 3] })
    expect(c.state.get().pages).toEqual([7, 0, 3])
    c.update({ pages: [2, 99, 2, -1, 5] })
    // Missing pages and repeats are dropped.
    expect(c.state.get().pages).toEqual([2, 5])
  })

  it('lists nothing with no document', () => {
    const { c } = make(null, { pages: [1, 2] })
    expect(c.state.get()).toMatchObject({
      pages: [],
      offsets: [0],
      window: { start: 0, end: 0 },
    })
  })

  it('offsets follow each page size', () => {
    const pages = [letter(0), landscape(1), letter(2)]
    const { c } = make(docOf(pages))
    const { offsets } = c.state.get()
    expect(offsets).toHaveLength(4)
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBeCloseTo(itemHeight(pages[0]!), 6)
    expect(offsets[2]! - offsets[1]!).toBeCloseTo(itemHeight(pages[1]!), 6)
    expect(offsets[3]).toBeCloseTo(2 * itemHeight(pages[0]!) + itemHeight(pages[1]!), 6)
    // A subset stacks in its own order.
    c.update({ pages: [1, 0] })
    expect(c.state.get().offsets[1]).toBeCloseTo(itemHeight(pages[1]!), 6)
    // Width scales every thumbnail.
    c.update({ pages: undefined, width: 60 })
    expect(c.state.get().offsets[1]).toBeCloseTo((60 * 792) / 612 + 32, 6)
  })

  it('window covers the visible range plus overscan', () => {
    const { c, viewport } = make(letters(500))
    // No current page to reveal: the window follows the scroll alone.
    viewport.set(null)
    expect(c.state.get().window).toEqual({ start: 0, end: 0 })
    const scroller = scrollerOf(600)
    const detach = c.attach(scroller)
    const visible = Math.ceil(600 / itemHeight(letter(0)))
    let { window } = c.state.get()
    expect(window.start).toBe(0)
    expect(window.end - window.start).toBeLessThanOrEqual(visible + 6)
    expect(window.end).toBeGreaterThanOrEqual(visible)

    // Further down, the window starts three items before the first visible one.
    scroller.scrollTop = 100 * itemHeight(letter(0)) + 1
    c.attach(scroller)
    ;({ window } = c.state.get())
    expect(window.start).toBe(97)
    expect(window.end - window.start).toBeLessThanOrEqual(visible + 1 + 6)
    expect(window.end).toBeGreaterThanOrEqual(100 + visible)

    detach()
  })

  it('current follows the viewport', () => {
    const { c, vp, viewport } = make(letters(5), {}, 2)
    expect(c.state.get().current).toBe(2)
    vp.currentPage.set(4)
    expect(c.state.get().current).toBe(4)
    // A rebuilt viewport takes over.
    const next = viewportAt(1)
    viewport.set(next.viewport)
    expect(c.state.get().current).toBe(1)
    vp.currentPage.set(3)
    expect(c.state.get().current).toBe(1)
    c.activate(3)
    expect(next.scrollToPage).toHaveBeenCalledWith(3)
  })

  it('current is -1 with no viewport', () => {
    const { c, viewport } = make(letters(5), {}, 2)
    viewport.set(null)
    expect(c.state.get().current).toBe(-1)
    // Activating with no viewport does nothing, and throws nothing.
    c.activate(1)
  })

  it('resets when the document changes', () => {
    const { c, document, viewport } = make(letters(500))
    viewport.set(null)
    const scroller = scrollerOf(600, 5000)
    c.attach(scroller)
    expect(c.state.get().window.start).toBeGreaterThan(0)

    const next = docOf([landscape(0), letter(1)])
    document.set(next)
    const s = c.state.get()
    expect(s.pages).toEqual([0, 1])
    expect(s.offsets[1]).toBeCloseTo(itemHeight(landscape(0)), 6)
    expect(s.offsets).toHaveLength(3)
    expect(scroller.scrollTop).toBe(0)
    expect(s.window).toEqual({ start: 0, end: 2 })

    document.set(null)
    expect(c.state.get()).toMatchObject({
      pages: [],
      offsets: [0],
      window: { start: 0, end: 0 },
    })
  })

  it('a subset keeps its order across documents and drops missing pages', () => {
    const { c, document } = make(letters(10), { pages: [7, 0, 3] })
    document.set(letters(5))
    expect(c.state.get().pages).toEqual([0, 3])
    document.set(letters(10))
    expect(c.state.get().pages).toEqual([7, 0, 3])
  })

  it('skips no-op updates', () => {
    const { c } = make(letters(5), { pages: [1, 2] })
    const before = c.state.get()
    const seen = vi.fn()
    c.state.subscribe(seen)
    c.update({ pages: [1, 2], width: 120, annotations: false })
    expect(seen).not.toHaveBeenCalled()
    expect(c.state.get()).toBe(before)
  })

  it('stops following after destroy', () => {
    const { c, vp } = make(letters(5))
    c.destroy()
    vp.currentPage.set(3)
    expect(c.state.get().current).toBe(0)
  })
})
