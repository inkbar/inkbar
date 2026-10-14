// eslint-disable-next-line import-x/no-named-as-default
import AxeBuilder from '@axe-core/playwright'
import { guardConsole } from '@inkbar/sandbox-shared/console-guard'
import { expect, test } from '@playwright/test'

guardConsole(test)

test('links to each framework page', async ({ page, request }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const names = ['React', 'Vue', 'Svelte', 'TypeScript']
  for (const name of names) {
    const link = page.getByRole('link', { name, exact: true })
    const href = await link.getAttribute('href')
    expect(href).toBeTruthy()
    const response = await request.get(new URL(href!, page.url()).toString())
    expect(response.status(), name).toBe(200)
  }
})

test('has no axe violations', async ({ page }) => {
  await page.goto('./')
  const { violations } = await new AxeBuilder({ page }).analyze()
  expect(violations).toEqual([])
})

test('has no horizontal scroll at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  expect(overflow).toBe(0)
})
