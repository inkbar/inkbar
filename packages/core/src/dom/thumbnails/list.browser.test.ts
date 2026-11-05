import { generateLarge } from '@inkbar/fixtures/generate-large'
import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import themeCss from '@inkbar/theme/theme.css?inline'
import { run as runAxe } from 'axe-core'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { mountContainer, nextFrame, settle, until } from '../test-utils'
import { createViewer, type Viewer } from '../viewer/create-viewer'

import { createThumbnails } from './list'

import type { Viewport } from '../viewport'

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

/** Synthetic documents, generated once per size. */
const large = new Map<number, Promise<Uint8Array>>()
const pagesDoc = (count: number) => {
  if (!large.has(count)) large.set(count, generateLarge(count))
  return large.get(count)!.then((bytes) => bytes.slice())
}

interface Setup {
  viewer: Viewer
  viewport: Viewport
  list: HTMLElement
  item: (page: number) => HTMLButtonElement | null
  items: () => HTMLButtonElement[]
}

/** A viewer with a thumbnail list `listHeight` px tall above it, ready. */
async function make(
  source: string | Uint8Array = fixtureUrl('text-simple'),
  listHeight = 400
): Promise<Setup> {
  const box = document.createElement('div')
  box.style.cssText = `height:${listHeight}px;width:200px;`
  document.body.prepend(box)
  const host = mountContainer(600, 450)
  const viewer = createViewer(host, { source, assets: browserAssets(), zoom: 1 })
  const list = createThumbnails(viewer)
  box.append(list)
  cleanup.push(() => {
    viewer.destroy()
    host.remove()
    box.remove()
  })
  await until(() => viewer.viewport.get() !== null, 10_000)
  await until(() => list.querySelector('[data-ink-thumbnail-item]') !== null)
  const item = (page: number) =>
    list.querySelector<HTMLButtonElement>(`[data-ink-thumbnail-item="${page}"]`)
  const items = () => [
    ...list.querySelectorAll<HTMLButtonElement>('[data-ink-thumbnail-item]'),
  ]
  return { viewer, viewport: viewer.viewport.get()!, list, item, items }
}

/** Whether `el` lies inside the list's visible area. */
function inView(list: HTMLElement, el: HTMLElement | null): boolean {
  if (!el) return false
  const l = list.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  return r.top >= l.top - 1 && r.bottom <= l.bottom + 1
}

const pageOf = (el: Element | null) =>
  el instanceof HTMLElement ? Number(el.dataset.inkThumbnailItem) : -1

describe('createThumbnails', () => {
  it('lists each page as a button in a list item', async () => {
    const { list, items } = await make()
    expect(list.getAttribute('role')).toBe('list')
    expect(list.classList.contains('ink-thumbnails')).toBe(true)
    expect(items().map(pageOf)).toEqual([0, 1, 2])
    for (const [i, b] of items().entries()) {
      expect(b.tagName).toBe('BUTTON')
      expect(b.classList.contains('ink-thumbnails-item')).toBe(true)
      expect(b.parentElement!.getAttribute('role')).toBe('listitem')
      expect(b.querySelector('.ink-thumbnail')!.getAttribute('aria-label')).toBe(
        `Page ${i + 1}`
      )
      expect(b.querySelector('.ink-thumbnails-label')!.textContent).toBe(String(i + 1))
    }
    // The item width comes from the theme token.
    expect(items()[0]!.querySelector<HTMLElement>('.ink-thumbnail')!.offsetWidth).toBe(
      120
    )
    const results = await runAxe(list)
    expect(results.violations.map((v) => v.id)).toEqual([])
  })

  it('clicking an item scrolls the viewport to that page', async () => {
    const { viewport, item } = await make()
    const scrollToPage = vi.spyOn(viewport, 'scrollToPage')
    await userEvent.click(item(2)!)
    expect(scrollToPage).toHaveBeenCalledWith(2)
    await until(() => viewport.currentPage.get() === 2)
  })

  it('only items in the window are in the DOM', async () => {
    const { list, items, item } = await make(await pagesDoc(500))
    expect(items().length).toBeGreaterThan(0)
    expect(items().length).toBeLessThan(30)
    expect(list.scrollHeight).toBeGreaterThan(500 * 150)
    // Scrolled to the middle, the items there replace the first ones.
    list.scrollTop = list.scrollHeight / 2
    await until(() => item(0) === null && items().length > 0)
    expect(items().length).toBeLessThan(30)
    const shown = items().map(pageOf)
    expect(Math.min(...shown)).toBeGreaterThan(200)
    expect(Math.max(...shown)).toBeLessThan(300)
    for (const b of items()) expect(b.querySelectorAll('.ink-thumbnail').length).toBe(1)
    // Unmounted items take their painters with them: one canvas at most per mounted item.
    await settle(200)
    expect(list.querySelectorAll('canvas').length).toBeLessThanOrEqual(items().length)
  })

  it('arrow keys move between items and Enter activates', async () => {
    const { viewport, item, items } = await make(await pagesDoc(40))
    // One Tab stop: the current page.
    expect(
      items()
        .filter((b) => b.tabIndex === 0)
        .map(pageOf)
    ).toEqual([0])
    item(0)!.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(pageOf(document.activeElement)).toBe(1)
    expect(
      items()
        .filter((b) => b.tabIndex === 0)
        .map(pageOf)
    ).toEqual([1])
    await userEvent.keyboard('{ArrowUp}')
    expect(pageOf(document.activeElement)).toBe(0)
    // No wrapping at the ends.
    await userEvent.keyboard('{ArrowUp}')
    expect(pageOf(document.activeElement)).toBe(0)
    // End reaches an item that was not mounted.
    expect(item(39)).toBeNull()
    await userEvent.keyboard('{End}')
    await until(() => pageOf(document.activeElement) === 39)
    await userEvent.keyboard('{Home}')
    await until(() => pageOf(document.activeElement) === 0)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(pageOf(document.activeElement)).toBe(2)
    await userEvent.keyboard('{Enter}')
    await until(() => viewport.currentPage.get() === 2)
    // Space activates too.
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard(' ')
    await until(() => viewport.currentPage.get() === 3)
  })

  it('moves focus to a visible item when the focused one scrolls out of the window', async () => {
    const { list, item } = await make(await pagesDoc(100))
    item(0)!.focus()
    list.scrollTop = list.scrollHeight / 2
    await until(() => item(0) === null)
    await until(() => list.contains(document.activeElement))
    expect(inView(list, document.activeElement as HTMLElement)).toBe(true)
    expect((document.activeElement as HTMLElement).tabIndex).toBe(0)
  })

  it('the current item has aria-current', async () => {
    const { viewport, item, list } = await make(await pagesDoc(40))
    expect(item(0)!.getAttribute('aria-current')).toBe('page')
    viewport.scrollToPage(5)
    await until(() => item(5)?.getAttribute('aria-current') === 'page')
    expect(list.querySelectorAll('[aria-current]')).toHaveLength(1)
  })

  it('the list follows the current page unless the user just scrolled it', async () => {
    const { viewport, item, list } = await make(await pagesDoc(40))
    viewport.scrollToPage(30)
    await until(() => inView(list, item(30)))

    // The user scrolls the list back to the top.
    list.scrollTop = 0
    await nextFrame()
    await nextFrame()
    viewport.scrollToPage(10)
    await until(() => viewport.currentPage.get() === 10)
    await settle(100)
    expect(list.scrollTop).toBe(0)
    expect(inView(list, item(10))).toBe(false)

    // A second later it follows again.
    await settle(1000)
    viewport.scrollToPage(20)
    await until(() => inView(list, item(20)))
  })

  it('shows the new document when another one opens', async () => {
    const { viewer, list, items } = await make(await pagesDoc(40))
    list.scrollTop = 2000
    await until(() => items()[0] !== undefined && pageOf(items()[0]!) > 0)
    viewer.open(fixtureUrl('mixed-page-sizes'))
    await until(() => items().length === 4, 10_000)
    expect(items().map(pageOf)).toEqual([0, 1, 2, 3])
    expect(list.scrollTop).toBe(0)
    // A4 landscape is shorter than Letter.
    const [, , landscape] = items()
    expect(
      landscape!.querySelector<HTMLElement>('.ink-thumbnail')!.offsetHeight
    ).toBeLessThan(items()[0]!.querySelector<HTMLElement>('.ink-thumbnail')!.offsetHeight)
  })

  it('stops when the viewer is destroyed', async () => {
    const { viewer, list, items } = await make()
    viewer.destroy()
    expect(items()).toHaveLength(0)
    expect(list.querySelectorAll('.ink-thumbnail')).toHaveLength(0)
  })
})
