import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import { guardConsole } from '../../playwright/console-guard'
import Harness from '../../playwright/harness/FindHarness.vue'

const assets = browserAssets()
guardConsole(test)

const props = { src: fixtureUrl('text-simple'), assets }

test('Ctrl+F inside the root opens the bar, which finds and steps', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, { props })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  const bar = page.locator('[data-ink-viewport-root] > [data-ink-find-bar]')
  await expect(bar).toBeHidden()
  await page.locator('[data-ink-scroll]').focus()
  await page.keyboard.press('Control+f')
  const field = page.getByRole('textbox', { name: 'Find in document' })
  await expect(bar).toBeVisible()
  await expect(field).toBeFocused()
  await page.keyboard.type('QQ123456C')
  const count = page.locator('[data-ink-find-count]')
  await expect(count).toHaveText('1 of 3')
  await page.keyboard.press('Enter')
  await expect(count).toHaveText('2 of 3')
  await expect(page.locator('[data-ink-find-status]')).toHaveText('Match 2 of 3, page 2')
  await page.getByRole('button', { name: 'Previous match' }).click()
  await expect(count).toHaveText('1 of 3')
  await page.getByRole('button', { name: 'Match case' }).click()
  await expect(page.getByRole('button', { name: 'Match case' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})

test('Escape closes the bar and returns focus to where it was', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, { props })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await page.getByTestId('outside').focus()
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Find in document' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Find', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-ink-find-bar]')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Find', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  // Focus goes back to the button that opened it.
  await expect(page.getByRole('button', { name: 'Find', exact: true })).toBeFocused()
})

test('Escape returns focus to the document when the key opened the bar from it', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, { props })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await page.locator('[data-ink-scroll]').focus()
  await page.keyboard.press('Control+f')
  await expect(page.getByRole('textbox', { name: 'Find in document' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-ink-scroll]')).toBeFocused()
})

test('leaves Ctrl+F to the browser with no bar mounted', async ({ mount, page }) => {
  const cmp = await mount(Harness, { props: { ...props, withBar: false } })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  const prevented = await page.locator('[data-ink-scroll]').evaluate((el) => {
    const e = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    el.dispatchEvent(e)
    return e.defaultPrevented
  })
  expect(prevented).toBe(false)
  await expect(page.getByTestId('open')).toHaveText('false')
})

test('useSearch().state follows setQuery', async ({ mount, page }) => {
  await mount(Harness, { props })
  await expect(page.locator('.ink-page canvas').first()).toBeVisible()
  await expect(page.getByTestId('query')).toHaveText('')
  await page.getByTestId('set-query').click()
  await expect(page.getByTestId('query')).toHaveText('Inkbar')
  // The bar is still hidden: setting the query does not open it.
  await expect(page.getByTestId('open')).toHaveText('false')
  await expect(page.locator('[data-ink-find-bar] input')).toHaveValue('Inkbar')
})
