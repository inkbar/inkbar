import { de } from '@inkbar/core/locales/de'
import { en } from '@inkbar/core/locales/en'
import { fr } from '@inkbar/core/locales/fr'
import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page } from '@playwright/test'

import { FRAMEWORK_ORDER } from '../src/shell/frameworks.ts'

guardConsole(test)

const viewer = (page: Page) => page.locator('[data-scenario-viewer]')
const languageSelect = (page: Page) => page.getByRole('combobox', { name: 'Language' })

async function open(page: Page, framework: string, search = ''): Promise<void> {
  await page.goto(`./${search}#/${framework}/tour`)
  await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute(
    'data-state',
    'ready',
    { timeout: 30_000 }
  )
}

for (const framework of FRAMEWORK_ORDER) {
  test.describe(framework, () => {
    test('switches the language in place', async ({ page }) => {
      await open(page, framework)
      const pageInput = viewer(page).getByRole('spinbutton', { name: en.toolbar.page })
      await pageInput.fill('2')
      await pageInput.press('Enter')
      await expect(pageInput).toHaveValue('2')
      await viewer(page)
        .getByRole('button', { name: en.highlight.choose, exact: true })
        .click()
      await expect(page.getByRole('menu', { name: en.highlight.menu })).toBeVisible()

      await languageSelect(page).selectOption('fr')

      await expect(page.getByRole('menu', { name: fr.highlight.menu })).toBeVisible()
      await expect(
        viewer(page).getByRole('spinbutton', { name: fr.toolbar.page })
      ).toHaveValue('2')
      await expect(
        viewer(page).getByRole('button', { name: fr.toolbar.undo, exact: true })
      ).toBeVisible()
      await expect(
        viewer(page).getByRole('toolbar', { name: fr.toolbar.label })
      ).toBeVisible()
      await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute('lang', 'fr')
      expect(new URL(page.url()).searchParams.get('lang')).toBe('fr')

      await page.reload()
      await expect(languageSelect(page)).toHaveValue('fr')
      await expect(
        viewer(page).getByRole('button', { name: fr.toolbar.undo, exact: true })
      ).toBeVisible({ timeout: 30_000 })
    })

    test('goes from German back to English', async ({ page }) => {
      await open(page, framework, '?lang=de')
      await expect(
        viewer(page).getByRole('button', { name: de.toolbar.undo, exact: true })
      ).toBeVisible()
      await languageSelect(page).selectOption('en')
      await expect(
        viewer(page).getByRole('button', { name: en.toolbar.undo, exact: true })
      ).toBeVisible()
      expect(new URL(page.url()).searchParams.has('lang')).toBe(false)
    })
  })
}
