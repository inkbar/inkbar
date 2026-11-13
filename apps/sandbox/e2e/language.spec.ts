import { de } from '@inkbar/core/locales/de'
import { en } from '@inkbar/core/locales/en'
import { fr } from '@inkbar/core/locales/fr'
import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page, type Route } from '@playwright/test'

import { FRAMEWORK_ORDER } from '../src/shell/frameworks.ts'

const guard = guardConsole(test)

const viewer = (page: Page) => page.locator('[data-scenario-viewer]')
const languageSelect = (page: Page) => page.getByRole('combobox', { name: 'Language' })

/** The French set's chunk in the build. */
const FR_CHUNK = /\/assets\/fr-[\w-]+\.js$/

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

    test('keeps English when French fails to load', async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.route(FR_CHUNK, (r) => r.abort())
      await open(page, framework)

      await languageSelect(page).selectOption('fr')

      await expect(languageSelect(page)).toHaveValue('en')
      expect(new URL(page.url()).searchParams.has('lang')).toBe(false)
      await expect(
        viewer(page).getByRole('button', { name: en.toolbar.undo, exact: true })
      ).toBeVisible()
      expect(errors).toEqual([])
      // The failed request and the logged import error.
      expect(guard.take(/./).length).toBeGreaterThan(0)
    })

    test('a late French set does not undo a later choice', async ({ page }) => {
      const french: Route[] = []
      const others: Route[] = []
      let hold = false
      await page.route(/\/assets\/.+\.js$/, (r) => {
        if (FR_CHUNK.test(r.request().url())) french.push(r)
        else if (hold) others.push(r)
        else void r.continue()
      })
      await open(page, framework)

      // Hold the next scenario's code, and choose French while it loads.
      hold = true
      await page.evaluate((f) => (location.hash = `#/${f}/tools`), framework)
      await expect.poll(() => others.length).toBeGreaterThan(0)
      await languageSelect(page).selectOption('fr')
      await expect.poll(() => french.length).toBeGreaterThan(0)
      hold = false
      for (const r of others.splice(0)) await r.continue()
      await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute(
        'data-state',
        'ready',
        { timeout: 30_000 }
      )

      // German lands first. French arrives after it.
      await languageSelect(page).selectOption('de')
      await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute('lang', 'de')
      const frenchLoaded = page.waitForResponse(FR_CHUNK)
      for (const r of french.splice(0)) await r.continue()
      await frenchLoaded
      // Let the late set's handlers run, then check they changed nothing.
      await page.waitForTimeout(500)
      await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute('lang', 'de')
      await expect(
        viewer(page).getByRole('button', { name: de.toolbar.undo, exact: true })
      ).toBeVisible()
    })
  })
}
