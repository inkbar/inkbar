import { describe, expect, it, vi } from 'vitest'

import { writable } from '../model/readable'
import { resolveDestination } from '../pdfjs/destinations'

import { createNavigation } from './navigation'

import type { Viewport } from './viewport'
import type { Destination, RawDestination } from '../model/destination'
import type { InkDocument } from '../model/document'
import type { ViewerAction } from '../model/form/types'
import type { PdfjsDocument } from '../pdfjs/types'

/**
 * A navigation over a fake viewport whose position is the last destination it scrolled to, and
 * a fake document of `pages` pages whose named destinations are `names`.
 */
function setup(pages = 100, names: Record<string, unknown[]> = {}) {
  let at: Destination = { page: 0, fit: 'fit' }
  const currentPage = writable(0)
  const scrollToDestination = vi.fn((dest: Destination) => {
    at = dest
    currentPage.set(dest.page)
  })
  const viewport = { currentPage, scrollToDestination } as unknown as Viewport
  const proxy = {
    numPages: pages,
    getDestination: (name: string) => Promise.resolve(names[name] ?? null),
    getPageIndex: () => Promise.resolve(0),
  }
  const doc = {
    pages: Array.from({ length: pages }, (_, index) => ({ index })),
    _pdfjs: { proxy },
    // The document caches this; the fake resolves through the same PDF.js lookup.
    resolveDestination: (raw: RawDestination) =>
      resolveDestination(proxy as unknown as PdfjsDocument, raw),
  } as unknown as InkDocument
  const report = vi.fn<(a: ViewerAction) => void>()
  const nav = createNavigation({
    viewport: () => viewport,
    document: () => doc,
    here: () => at,
    report,
  })
  return {
    nav,
    report,
    scrollToDestination,
    at: () => at,
    currentPage,
  }
}

const page = (p: number): Destination => ({ page: p, fit: 'fit' })

describe('createNavigation', () => {
  it('goTo records here and enables back', () => {
    const { nav, at } = setup()
    expect(nav.canGoBack.get()).toBe(false)
    expect(nav.canGoForward.get()).toBe(false)
    nav.goTo(page(5))
    expect(at()).toEqual(page(5))
    expect(nav.canGoBack.get()).toBe(true)
    expect(nav.canGoForward.get()).toBe(false)
    nav.back()
    expect(at()).toEqual(page(0))
    expect(nav.canGoBack.get()).toBe(false)
  })

  it('a jump that goes nowhere records nothing', () => {
    const { nav, at, scrollToDestination } = setup()
    nav.goTo(page(5))
    nav.goTo(page(5))
    expect(scrollToDestination).toHaveBeenCalledTimes(2)
    // One Back returns from the item clicked twice.
    nav.back()
    expect(at()).toEqual(page(0))
    expect(nav.canGoBack.get()).toBe(false)
    // Within a point of rounding is the same place; further is a move.
    nav.goTo({ page: 2, fit: 'xyz', left: 10, top: 500 })
    nav.goTo({ page: 2, fit: 'xyz', left: 10.4, top: 500.6 })
    nav.goTo({ page: 2, fit: 'xyz', left: 10, top: 400 })
    nav.back()
    expect(at()).toEqual({ page: 2, fit: 'xyz', left: 10.4, top: 500.6 })
    nav.back()
    expect(at()).toEqual(page(0))
    expect(nav.canGoBack.get()).toBe(false)
  })

  it('back then forward returns', () => {
    const { nav, at } = setup()
    nav.goTo(page(3))
    nav.goTo(page(7))
    nav.back()
    expect(at()).toEqual(page(3))
    expect(nav.canGoForward.get()).toBe(true)
    nav.back()
    expect(at()).toEqual(page(0))
    nav.forward()
    expect(at()).toEqual(page(3))
    nav.forward()
    expect(at()).toEqual(page(7))
    expect(nav.canGoForward.get()).toBe(false)
    expect(nav.canGoBack.get()).toBe(true)
    // Nowhere further to go: nothing moves.
    nav.forward()
    expect(at()).toEqual(page(7))
  })

  it('a new goTo drops forward', () => {
    const { nav, at } = setup()
    nav.goTo(page(3))
    nav.goTo(page(7))
    nav.back()
    expect(nav.canGoForward.get()).toBe(true)
    nav.goTo(page(9))
    expect(nav.canGoForward.get()).toBe(false)
    nav.back()
    expect(at()).toEqual(page(3))
  })

  it('keeps 50 entries', () => {
    const { nav, at } = setup()
    for (let i = 1; i <= 60; i++) nav.goTo(page(i))
    let backs = 0
    while (nav.canGoBack.get()) {
      nav.back()
      backs++
    }
    expect(backs).toBe(50)
    // The oldest ten went: the earliest left is where the 11th jump started.
    expect(at()).toEqual(page(10))
  })

  it('named actions use the current page', async () => {
    const { nav, at, scrollToDestination, currentPage } = setup(5)
    currentPage.set(2)
    await nav.follow({ kind: 'named', action: 'NextPage' })
    expect(at().page).toBe(3)
    await nav.follow({ kind: 'named', action: 'PrevPage' })
    expect(at().page).toBe(2)
    await nav.follow({ kind: 'named', action: 'LastPage' })
    expect(at().page).toBe(4)
    // Clamped at the end: there is no next page, so nothing moves or is recorded.
    const calls = scrollToDestination.mock.calls.length
    await nav.follow({ kind: 'named', action: 'NextPage' })
    expect(scrollToDestination).toHaveBeenCalledTimes(calls)
    await nav.follow({ kind: 'named', action: 'FirstPage' })
    expect(at().page).toBe(0)
    await nav.follow({ kind: 'named', action: 'PrevPage' })
    expect(scrollToDestination).toHaveBeenCalledTimes(calls + 1)
    nav.back()
    expect(at().page).toBe(4)
  })

  it("named actions from a link run from the link's page", async () => {
    const { nav, at, currentPage } = setup(10)
    // The link sits on page 5 while the view counts page 2 as current.
    currentPage.set(2)
    await nav.follow({ kind: 'named', action: 'NextPage' }, { from: 5 })
    expect(at().page).toBe(6)
    currentPage.set(2)
    await nav.follow({ kind: 'named', action: 'PrevPage' }, { from: 5 })
    expect(at().page).toBe(4)
  })

  it('url targets are reported, not followed', async () => {
    const { nav, report, scrollToDestination } = setup()
    await nav.follow({ kind: 'url', url: 'https://example.com/a', newWindow: true })
    expect(report).toHaveBeenCalledWith({
      kind: 'open-url',
      url: 'https://example.com/a',
      newWindow: true,
    })
    // A script URL that slipped past the reader is dropped here too.
    await nav.follow({ kind: 'url', url: 'javascript:alert(1)', newWindow: false })
    expect(report).toHaveBeenCalledTimes(1)
    expect(scrollToDestination).not.toHaveBeenCalled()
    expect(nav.canGoBack.get()).toBe(false)
  })

  it('unsupported does nothing', async () => {
    const { nav, report, scrollToDestination } = setup()
    await nav.follow({ kind: 'unsupported', reason: 'remote' })
    expect(report).not.toHaveBeenCalled()
    expect(scrollToDestination).not.toHaveBeenCalled()
    expect(nav.canGoBack.get()).toBe(false)
  })

  it('unresolvable dest does nothing and records nothing', async () => {
    const { nav, scrollToDestination } = setup(3, { known: [2, { name: 'Fit' }] })
    await nav.follow({ kind: 'dest', raw: 'missing' })
    await nav.follow({ kind: 'dest', raw: [9, { name: 'Fit' }] })
    nav.goTo(page(9))
    expect(scrollToDestination).not.toHaveBeenCalled()
    expect(nav.canGoBack.get()).toBe(false)
    await nav.follow({ kind: 'dest', raw: 'known' })
    expect(scrollToDestination).toHaveBeenCalledWith({ page: 2, fit: 'fit' })
    expect(nav.canGoBack.get()).toBe(true)
  })

  it('follows a resolved destination as goTo does', async () => {
    const { nav, at } = setup()
    await nav.follow({ kind: 'resolved', dest: { page: 4, fit: 'xyz', top: 300 } })
    expect(at()).toEqual({ page: 4, fit: 'xyz', top: 300 })
    expect(nav.canGoBack.get()).toBe(true)
  })

  it('clear empties both stacks', () => {
    const { nav } = setup()
    nav.goTo(page(3))
    nav.goTo(page(4))
    nav.back()
    nav.clear()
    expect(nav.canGoBack.get()).toBe(false)
    expect(nav.canGoForward.get()).toBe(false)
  })
})
