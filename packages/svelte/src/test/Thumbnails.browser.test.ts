import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { run as runAxe } from 'axe-core'
import { describe, expect, it } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { focused, q, qa } from './dom.js'
import ThumbnailsHarness from './harness/ThumbnailsHarness.svelte'

const assets = browserAssets()
guardConsole()

const props = { src: fixtureUrl('text-simple'), assets }
const LIST = '[data-testid="list"]'
const items = () => qa<HTMLButtonElement>(`${LIST} button.ink-thumbnails-item`)
const current = () => document.querySelector('[data-testid="current"]')?.textContent
const item = (name: string) => browserPage.getByRole('button', { name, exact: true })

describe('thumbnails', () => {
  it('InkThumbnail draws inside a dialog outside the viewport', async () => {
    await render(ThumbnailsHarness, props)
    await q('[data-ink-scroll] .ink-page canvas')
    await browserPage.getByTestId('open-dialog').click()
    const dialog = browserPage.getByRole('dialog', { name: 'Remove pages' })
    const thumb = dialog.getByRole('img', { name: 'Page 2' })
    await expect.element(thumb).toBeVisible()
    await expect.element(thumb).toHaveClass('ink-thumbnail')
    await expect.element(thumb).toHaveAttribute('data-testid', 'dialog-thumbnail')
    await expect.poll(() => thumb.element().querySelectorAll('canvas').length).toBe(1)
    expect(thumb.element().getBoundingClientRect().width).toBe(80)
    // Not focusable: the host wraps it in whatever control it needs.
    expect(thumb.element().hasAttribute('tabindex')).toBe(false)
  })

  it('InkThumbnails navigates and marks the current page', async () => {
    await render(ThumbnailsHarness, props)
    const list = await q(LIST)
    expect(list.getAttribute('role')).toBe('list')
    expect(list.classList.contains('ink-thumbnails')).toBe(true)
    await expect.poll(() => items().length).toBe(3)
    expect(qa('[role="listitem"]', list)).toHaveLength(3)
    await expect.poll(() => items()[0]!.getAttribute('aria-current')).toBe('page')
    expect(
      items().map((i) => i.querySelector('.ink-thumbnails-label')!.textContent)
    ).toEqual(['1', '2', '3'])
    await expect.element(item('Page 3')).toBeVisible()
    // The theme's item height is the controller's: positioned from its offsets.
    await expect.poll(() => qa('.ink-thumbnail canvas', list).length).toBe(3)
    const heights = items().map((el) =>
      Math.round(el.parentElement!.getBoundingClientRect().height)
    )
    const thumbHeights = qa('.ink-thumbnail', list).map((el) =>
      Math.round(el.getBoundingClientRect().height)
    )
    expect(heights).toEqual(thumbHeights.map((h) => h + 32))
    expect(getComputedStyle(qa('.ink-thumbnail', list)[0]!).width).toBe('120px')

    // Activating an item scrolls the viewport there.
    await item('Page 3').click()
    await expect.poll(current).toBe('2')
    await expect.poll(() => items()[2]!.getAttribute('aria-current')).toBe('page')
    expect(items()[0]!.hasAttribute('aria-current')).toBe(false)
    // Arrow keys move between items with one Tab stop; Enter activates.
    await userEvent.keyboard('{ArrowUp}')
    await expect.poll(focused).toBe(item('Page 2').element())
    expect(qa('[tabindex="0"]', list)).toHaveLength(1)
    await userEvent.keyboard('{Enter}')
    await expect.poll(current).toBe('1')
    await expect.poll(() => items()[1]!.getAttribute('aria-current')).toBe('page')

    const results = await runAxe(list)
    expect(results.violations.map((v) => v.id)).toEqual([])
  })

  it('InkThumbnails lists the given pages at the given width', async () => {
    await render(ThumbnailsHarness, { ...props, pages: [2, 0], width: 90 })
    await expect.poll(() => items().length).toBe(2)
    expect(
      items().map((i) => i.querySelector('.ink-thumbnails-label')!.textContent)
    ).toEqual(['3', '1'])
    await expect
      .poll(() => getComputedStyle(items()[0]!.querySelector('.ink-thumbnail')!).width)
      .toBe('90px')
  })

  it('the item snippet renders per item', async () => {
    await render(ThumbnailsHarness, props)
    const slots = () => qa<HTMLElement>('.ink-thumbnails-item .harness-item')
    await expect.poll(() => slots().length).toBe(3)
    expect(slots()[0]!.dataset.page).toBe('0')
    expect(slots()[2]!.dataset.page).toBe('2')
    // After the label, inside the item.
    expect(
      document.querySelectorAll('.ink-thumbnails-label + .harness-item[data-page="1"]')
    ).toHaveLength(1)
    await expect.poll(() => slots()[0]!.dataset.current).toBe('true')
    expect(slots()[1]!.dataset.current).toBe('false')
    await item('Page 2').click()
    await expect.poll(() => slots()[1]!.textContent).toBe('here')
    expect(slots()[0]!.dataset.current).toBe('false')
  })

  it('unmounting the list takes its thumbnails with it', async () => {
    await render(ThumbnailsHarness, props)
    await expect.poll(() => qa(`${LIST} .ink-thumbnail canvas`).length).toBe(3)
    await browserPage.getByTestId('toggle-list').click()
    await expect.poll(() => document.querySelector(LIST)).toBeNull()
    // Back again, it lists the pages from the open document.
    await browserPage.getByTestId('toggle-list').click()
    await expect.poll(() => qa(`${LIST} .ink-thumbnail canvas`).length).toBe(3)
  })
})
