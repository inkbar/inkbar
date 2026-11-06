import { AxeBuilder } from '@axe-core/playwright'
import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import { guardConsole } from '../../playwright/console-guard'
import Harness from '../../playwright/harness/ThumbnailsHarness.vue'

const assets = browserAssets()
guardConsole(test)

const props = { src: fixtureUrl('text-simple'), assets }

test('InkThumbnail draws inside a dialog outside the viewport', async ({
  mount,
  page,
}) => {
  await mount(Harness, { props })
  await expect(page.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await page.getByTestId('open-dialog').click()
  const dialog = page.getByRole('dialog', { name: 'Remove pages' })
  const thumb = dialog.getByRole('img', { name: 'Page 2' })
  await expect(thumb).toBeVisible()
  await expect(thumb).toHaveClass(/ink-thumbnail/)
  await expect(thumb).toHaveAttribute('data-testid', 'dialog-thumbnail')
  await expect(thumb.locator('canvas')).toHaveCount(1)
  const box = await thumb.boundingBox()
  expect(box?.width).toBe(80)
  // Not focusable: the host wraps it in whatever control it needs.
  await expect(thumb).not.toHaveAttribute('tabindex')
})

test('InkThumbnails navigates and marks the current page', async ({ mount, page }) => {
  await mount(Harness, { props })
  const list = page.getByTestId('list')
  await expect(list).toHaveAttribute('role', 'list')
  await expect(list).toHaveClass(/ink-thumbnails/)
  const items = list.locator('button.ink-thumbnails-item')
  await expect(items).toHaveCount(3)
  await expect(list.getByRole('listitem')).toHaveCount(3)
  await expect(items.nth(0)).toHaveAttribute('aria-current', 'page')
  await expect(items.locator('.ink-thumbnails-label')).toHaveText(['1', '2', '3'])
  await expect(page.getByRole('button', { name: 'Page 3' })).toBeVisible()
  // The theme's item height is the controller's: positioned from its offsets.
  const heights = await items.evaluateAll((els) =>
    els.map((el) => Math.round(el.parentElement!.getBoundingClientRect().height))
  )
  const thumbHeights = await list
    .locator('.ink-thumbnail')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))
  expect(heights).toEqual(thumbHeights.map((h) => h + 38))
  // Fluid: the list's width less a 16px gutter each side.
  const fit = await list.evaluate((el) => Math.floor(el.clientWidth - 32))
  await expect(list.locator('.ink-thumbnail').first()).toHaveCSS('width', `${fit}px`)

  // Activating an item scrolls the viewport there.
  await page.getByRole('button', { name: 'Page 3' }).click()
  await expect(page.getByTestId('current')).toHaveText('2')
  await expect(items.nth(2)).toHaveAttribute('aria-current', 'page')
  await expect(items.nth(0)).not.toHaveAttribute('aria-current')
  // Arrow keys move between items with one Tab stop; Enter activates.
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('button', { name: 'Page 2' })).toBeFocused()
  await expect(list.locator('[tabindex="0"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('current')).toHaveText('1')
  await expect(items.nth(1)).toHaveAttribute('aria-current', 'page')

  const results = await new AxeBuilder({ page }).include('[data-testid=list]').analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
})

test('InkThumbnails lists the given pages at the given width', async ({
  mount,
  page,
}) => {
  await mount(Harness, { props: { ...props, pages: [2, 0], width: 90 } })
  const items = page.getByTestId('list').locator('button.ink-thumbnails-item')
  await expect(items).toHaveCount(2)
  await expect(items.locator('.ink-thumbnails-label')).toHaveText(['3', '1'])
  await expect(items.first().locator('.ink-thumbnail')).toHaveCSS('width', '90px')
  const entries = page.getByTestId('list').getByRole('listitem')
  await expect(entries.nth(1)).toHaveAttribute('aria-setsize', '2')
  await expect(entries.nth(1)).toHaveAttribute('aria-posinset', '2')
})

test('#item slot renders per item', async ({ mount, page }) => {
  await mount(Harness, { props })
  const slots = page.locator('.ink-thumbnails-item .harness-item')
  await expect(slots).toHaveCount(3)
  await expect(slots.nth(0)).toHaveAttribute('data-page', '0')
  await expect(slots.nth(2)).toHaveAttribute('data-page', '2')
  // After the label, inside the item.
  await expect(
    page.locator('.ink-thumbnails-label + .harness-item[data-page="1"]')
  ).toHaveCount(1)
  await expect(slots.nth(0)).toHaveAttribute('data-current', 'true')
  await expect(slots.nth(1)).toHaveAttribute('data-current', 'false')
  await page.getByRole('button', { name: 'Page 2' }).click()
  await expect(slots.nth(1)).toHaveText('here')
  await expect(slots.nth(0)).toHaveAttribute('data-current', 'false')
})

test('unmounting the list takes its thumbnails with it', async ({ mount, page }) => {
  await mount(Harness, { props })
  const list = page.getByTestId('list')
  await expect(list.locator('.ink-thumbnail canvas')).toHaveCount(3)
  await page.getByTestId('toggle-list').click()
  await expect(list).toHaveCount(0)
  // Back again, it lists the pages from the open document.
  await page.getByTestId('toggle-list').click()
  await expect(page.getByTestId('list').locator('.ink-thumbnail canvas')).toHaveCount(3)
})
