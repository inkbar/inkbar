import { browserAssets, fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import themeCss from '@inkbar/theme/theme.css?inline'
import { run as runAxe } from 'axe-core'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { mountContainer, settle, until } from '../test-utils'
import { createViewer, type Viewer } from '../viewer/create-viewer'

import { createOutline } from './outline'

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = themeCss
  document.head.append(style)
})

let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.reverse().forEach((f) => f())
  cleanup = []
})

/** A viewer with an outline panel `height` px tall beside it, once the document is ready. */
async function make(
  name: FixtureName = 'outline',
  height = 400,
  opts?: { emptyText?: string }
) {
  const box = document.createElement('div')
  box.style.cssText = `height:${height}px;width:240px;`
  document.body.prepend(box)
  const host = mountContainer(600, 450)
  const viewer: Viewer = createViewer(host, {
    source: fixtureUrl(name),
    assets: browserAssets(),
    zoom: 1,
  })
  const outline = createOutline(viewer, opts)
  box.append(outline)
  cleanup.push(() => {
    viewer.destroy()
    host.remove()
    box.remove()
  })
  await until(() => viewer.viewport.get() !== null, 10_000)
  await until(() => outline.getAttribute('aria-busy') !== 'true', 10_000)
  const item = (title: string) =>
    [...outline.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(
      (el) =>
        el.querySelector(':scope > .ink-outline-row > .ink-outline-title')
          ?.textContent === title
    ) ?? null
  return { viewer, viewport: viewer.viewport.get()!, outline, item }
}

/** Whether `el` lies inside the visible area of `scroller`. */
function inView(scroller: HTMLElement, el: HTMLElement | null): boolean {
  if (!el) return false
  const s = scroller.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  return r.top >= s.top - 1 && r.bottom <= s.bottom + 1
}

describe('createOutline', () => {
  it('renders a tree with ARIA', async () => {
    const { outline, item } = await make()
    const tree = outline.querySelector('[role="tree"]')!
    expect(tree.getAttribute('aria-label')).toBe('Outline')
    const top = [...tree.children].map(
      (li) => li.querySelector('.ink-outline-title')?.textContent
    )
    expect(top).toEqual([
      'Cover',
      'Part One',
      'Part Two',
      'Appendix',
      'Website',
      'Next page',
      'Broken',
    ])
    const partOne = item('Part One')!
    expect(partOne.getAttribute('aria-expanded')).toBe('false')
    expect(partOne.getAttribute('aria-level')).toBe('1')
    expect(partOne.hasAttribute('data-bold')).toBe(true)
    // A closed item's children are not shown.
    expect(item('Chapter 1')?.checkVisibility()).toBe(false)
    expect(item('Part Two')!.getAttribute('aria-expanded')).toBe('true')
    // Each item holds its own group, and is named by its title alone.
    const partTwo = item('Part Two')!
    expect(partTwo.querySelector(':scope > [role="group"] > [role="treeitem"]')).toBe(
      item('Section A')
    )
    expect(
      document.getElementById(partTwo.getAttribute('aria-labelledby')!)?.textContent
    ).toBe('Part Two')
    expect(item('Section A')?.getAttribute('aria-level')).toBe('2')
    expect(item('Section B')?.hasAttribute('data-italic')).toBe(true)
    expect(item('Broken')?.getAttribute('aria-disabled')).toBe('true')
    expect(item('Cover')?.hasAttribute('aria-expanded')).toBe(false)
    expect(outline.querySelectorAll('[role="treeitem"][tabindex="0"]').length).toBe(1)
    const results = await runAxe(outline)
    expect(results.violations).toEqual([])
  })

  it('empty text', async () => {
    const { outline } = await make('text-simple')
    const empty = outline.querySelector<HTMLElement>('.ink-outline-empty')!
    expect(empty.textContent).toBe('This document has no outline')
    expect(empty.hidden).toBe(false)
    expect(outline.querySelector<HTMLElement>('[role="tree"]')!.hidden).toBe(true)

    const custom = await make('text-simple', 400, { emptyText: 'No sections' })
    expect(custom.outline.querySelector('.ink-outline-empty')?.textContent).toBe(
      'No sections'
    )

    const full = await make()
    expect(full.outline.querySelector<HTMLElement>('.ink-outline-empty')!.hidden).toBe(
      true
    )
  })

  it('clicking an item navigates', async () => {
    const { viewer, viewport, item } = await make()
    await userEvent.click(item('Appendix')!)
    await until(() => viewport.currentPage.get() === 4)
    expect(viewer.canGoBack.get()).toBe(true)
    await until(() => item('Appendix')!.getAttribute('aria-current') === 'location')

    // The twisty opens a closed item without navigating.
    const toggle = item('Part One')!.querySelector<HTMLElement>('.ink-outline-toggle')!
    // A touch target of at least 44px around the 16px chevron.
    const r = toggle.getBoundingClientRect()
    const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2]
    for (const [dx, dy] of [
      [-20, -20],
      [20, -20],
      [-20, 20],
      [20, 20],
    ] as const) {
      const hit = document.elementFromPoint(cx + dx, cy + dy)
      expect(hit?.closest('.ink-outline-toggle')).toBe(toggle)
    }
    await userEvent.click(toggle)
    expect(item('Part One')!.getAttribute('aria-expanded')).toBe('true')
    expect(item('Chapter 1')?.checkVisibility()).toBe(true)
    expect(viewport.currentPage.get()).toBe(4)

    // Keys move focus between items and Enter follows.
    item('Chapter 1')!.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(item('Chapter 2'))
    await userEvent.keyboard('{Enter}')
    await until(() => viewport.currentPage.get() === 1)
  })

  it('current item scrolls into view unless focus is in the tree', async () => {
    const { viewport, outline, item } = await make('outline', 120)
    expect(outline.scrollHeight).toBeGreaterThan(outline.clientHeight)
    viewport.scrollToDestination({ page: 4, fit: 'fit' })
    await until(() => item('Appendix')!.getAttribute('aria-current') === 'location')
    await until(() => inView(outline, item('Appendix')))

    // With focus in the tree, the reader is working the list: it stays where it is.
    item('Cover')!.focus()
    await until(() => inView(outline, item('Cover')))
    const kept = outline.scrollTop
    viewport.scrollToDestination({ page: 3, fit: 'fitb' })
    await until(() => item('Section B')!.getAttribute('aria-current') === 'location')
    await settle(100)
    expect(outline.scrollTop).toBe(kept)
    expect(inView(outline, item('Section B'))).toBe(false)
  })
})
