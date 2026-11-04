import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test } from '@playwright/test'

guardConsole(test)

const REDIRECTS = [
  { page: 'react/', hash: '#/react/tour' },
  { page: 'vue/', hash: '#/vue/tour' },
  { page: 'svelte/', hash: '#/svelte/tour' },
  { page: 'vanilla/', hash: '#/vanilla/tour' },
  { page: 'plugin/', hash: '#/react/redactions' },
]

test('each old page redirects to its scenario', async ({ page }) => {
  for (const { page: path, hash } of REDIRECTS) {
    await page.goto(path)
    await expect.poll(() => new URL(page.url()).hash, { message: path }).toBe(hash)
    // The redirect lands on the shell root, under the base, not on the old directory.
    expect(new URL(page.url()).pathname, path).toBe('/sandbox/')
    await expect(
      page.locator('[data-scenario-viewer] [data-ink-root]'),
      path
    ).toHaveAttribute('data-state', 'ready', { timeout: 20_000 })
  }
})

test('the root is the shell', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('navigation', { name: 'Scenarios' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Annotation tour')
})
