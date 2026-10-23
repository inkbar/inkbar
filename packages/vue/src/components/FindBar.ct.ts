import { AxeBuilder } from '@axe-core/playwright'
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

test('the search button is disabled until a document is open', async ({
  mount,
  page,
}) => {
  await mount(Harness, { props: { src: null, assets } })
  await expect(page.getByRole('button', { name: 'Find', exact: true })).toBeDisabled()
})

test('the bar passes axe while open', async ({ mount, page }) => {
  const cmp = await mount(Harness, { props })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  await page.keyboard.type('QQ123456C')
  await expect(page.locator('[data-ink-find-count]')).toHaveText('1 of 3')
  const results = await new AxeBuilder({ page }).include('[data-ink-find-bar]').analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
})

test('puts class and other attributes on the bar itself', async ({ mount, page }) => {
  const cmp = await mount(Harness, { props })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  const bar = page.locator('[data-ink-viewport-root] > [data-ink-find-bar]')
  await expect(bar).toHaveClass(/\bharness-find\b/)
  await expect(bar).toHaveClass(/\bink-find-bar\b/)
  await expect(bar).toHaveAttribute('data-testid', 'find-bar')
})

test('Ctrl+F takes the selected page text as the query', async ({ mount, page }) => {
  await mount(Harness, { props })
  await page
    .locator('[data-ink-text-layer] span', { hasText: 'QQ123456C' })
    .first()
    .waitFor()
  await page.locator('[data-ink-scroll]').evaluate((scroll) => {
    const span = [...scroll.querySelectorAll('[data-ink-text-layer] span')].find((s) =>
      s.textContent?.includes('QQ123456C')
    )!
    const node = span.firstChild!
    const at = node.textContent!.indexOf('QQ123456C')
    const range = document.createRange()
    range.setStart(node, at)
    range.setEnd(node, at + 'QQ123456C'.length)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    ;(scroll as HTMLElement).focus()
  })
  await page.keyboard.press('Control+f')
  const field = page.getByRole('textbox', { name: 'Find in document' })
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('QQ123456C')
  await expect(page.getByTestId('query')).toHaveText('QQ123456C')
})

test('the live region follows each step, even two in one task', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, { props })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  await page.keyboard.type('QQ123456C')
  const live = page.locator('[data-ink-find-status]')
  await expect(live).toHaveText('Match 1 of 3, page 1')
  const seen = await live.evaluate(async (el) => {
    const texts: string[] = []
    const observer = new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) texts.push(n.textContent ?? '')
    })
    observer.observe(el, { childList: true, characterData: true, subtree: true })
    document.querySelector<HTMLElement>('[data-testid="there-and-back"]')!.click()
    await new Promise((resolve) => setTimeout(resolve, 100))
    observer.disconnect()
    return texts
  })
  expect(seen).toEqual(['Match 2 of 3, page 2', 'Match 1 of 3, page 1'])
})

test("keeps the search button's own label over a caller's", async ({ mount, page }) => {
  const cmp = await mount(Harness, { props })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  const button = page.locator('[data-ink-search-button]')
  await expect(button).toHaveAttribute('aria-label', 'Find')
  await expect(button).toHaveAttribute('title', 'Find')
})
