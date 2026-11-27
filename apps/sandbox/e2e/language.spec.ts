import { de } from '@inkbar/core/locales/de'
import { en } from '@inkbar/core/locales/en'
import { fr } from '@inkbar/core/locales/fr'
import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page, type Route } from '@playwright/test'

import { de as deText } from '../src/shared/strings/de.ts'
import { en as enText } from '../src/shared/strings/en.ts'
import { fr as frText } from '../src/shared/strings/fr.ts'
import { FRAMEWORK_ORDER, FRAMEWORKS, type FrameworkId } from '../src/shell/frameworks.ts'

import type { SandboxStrings } from '../src/shared/strings/types.ts'

const guard = guardConsole(test)

const viewer = (page: Page) => page.locator('[data-scenario-viewer]')
/** The language select. Its label follows the language, so it is found by its id. */
const languageSelect = (page: Page) => page.locator('#language-select')

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

/** The tour shows the sandbox's own words in `text`: the shell's and the scenario's. */
async function expectShellIn(
  page: Page,
  framework: FrameworkId,
  text: SandboxStrings
): Promise<void> {
  const tour = text.scenarios.tour
  await expect(page.locator('html')).toHaveAttribute('lang', text.lang)
  await expect(page).toHaveTitle(
    text.shell.pageTitle({ scenario: tour.title, framework: FRAMEWORKS[framework].name })
  )
  await expect(
    page.getByRole('combobox', { name: text.shell.language, exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: text.shell.docs, exact: true })
  ).toBeVisible()
  const nav = page.getByRole('navigation', { name: text.shell.scenarios })
  await expect(
    nav.getByRole('link', { name: text.scenarios.forms.title, exact: true })
  ).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(tour.title)
  await expect(page.getByText(tour.blurb)).toBeVisible()
  await expect(
    page.getByRole('tab', { name: text.shell.preview, exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('tab', { name: text.shell.code, exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: text.shell.events, exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: text.shell.clear, exact: true })
  ).toBeVisible()
  await expect(
    viewer(page).getByRole('group', { name: text.labels.tools, exact: true })
  ).toBeVisible()
  await expect(
    viewer(page).getByRole('button', { name: text.labels.openPdf, exact: true })
  ).toContainText(text.labels.open)
  await expect(
    viewer(page).getByRole('toolbar', { name: text.labels.pageAndZoom })
  ).toBeVisible()
}

for (const framework of FRAMEWORK_ORDER) {
  test.describe(framework, () => {
    test("shows the sandbox's own words in French and back in English", async ({
      page,
    }) => {
      await open(page, framework)
      await expectShellIn(page, framework, enText)
      const pageInput = viewer(page).getByRole('spinbutton', { name: en.toolbar.page })
      await pageInput.fill('2')
      await pageInput.press('Enter')
      await viewer(page)
        .getByRole('button', { name: en.highlight.choose, exact: true })
        .click()
      await expect(page.getByRole('menu', { name: en.highlight.menu })).toBeVisible()
      const root = await viewer(page).locator('[data-ink-root]').elementHandle()

      await languageSelect(page).selectOption('fr')

      await expectShellIn(page, framework, frText)
      // The same viewer, on the same page, with its menu still open.
      await expect(page.getByRole('menu', { name: fr.highlight.menu })).toBeVisible()
      await expect(
        viewer(page).getByRole('spinbutton', { name: fr.toolbar.page })
      ).toHaveValue('2')
      expect(
        await root.evaluate((el) => el.isConnected && el.matches('[data-ink-root]'))
      ).toBe(true)

      await page.reload()
      await expect(languageSelect(page)).toHaveValue('fr')
      await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute(
        'data-state',
        'ready',
        { timeout: 30_000 }
      )
      await expectShellIn(page, framework, frText)

      await languageSelect(page).selectOption('en')
      await expectShellIn(page, framework, enText)
    })

    test("shows the sandbox's own words in German", async ({ page }) => {
      await open(page, framework, '?lang=de')
      await expectShellIn(page, framework, deText)
      await languageSelect(page).selectOption('en')
      await expectShellIn(page, framework, enText)
      await languageSelect(page).selectOption('de')
      await expectShellIn(page, framework, deText)
    })

    test("the plugin's words follow the language in place", async ({ page }) => {
      // Wide enough for the Suggestions panel to sit beside the pages rather than float.
      await page.setViewportSize({ width: 1920, height: 1080 })
      await page.goto(`./#/${framework}/redactions`)
      await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute(
        'data-state',
        'ready',
        { timeout: 30_000 }
      )
      await expect(
        viewer(page).locator('.ink-page[data-page="0"] canvas[data-ink-canvas]')
      ).toBeVisible({ timeout: 20_000 })
      await languageSelect(page).selectOption('fr')
      const french = frText.labels.plugin
      await viewer(page).getByRole('button', { name: french.command }).click()
      await expect(page.locator('.ink-command-status')).toHaveText(
        french.found({ count: 11 })
      )
      const firstMark = page.locator(
        '.ink-plugin-layer [data-record="ni-number"][data-plugin="sandbox"]'
      )
      await expect(firstMark).toHaveAttribute(
        'aria-label',
        french.mark({ reason: french.reasons['ni-number'] })
      )
      await firstMark.click()
      const card = page.getByRole('dialog', { name: french.card })
      await expect(card).toContainText(french.highConfidence)
      await expect(card.getByRole('button', { name: french.accept })).toBeVisible()

      // German while the card is open: the card, the marks and the button follow it.
      await languageSelect(page).selectOption('de')
      const german = deText.labels.plugin
      const cardDe = page.getByRole('dialog', { name: german.card })
      await expect(cardDe).toContainText(german.reasons['ni-number'])
      await expect(cardDe.getByRole('button', { name: german.dismiss })).toBeVisible()
      await expect(firstMark).toHaveAttribute(
        'aria-label',
        german.mark({ reason: german.reasons['ni-number'] })
      )
      await expect(
        viewer(page).getByRole('button', { name: german.command })
      ).toBeVisible()
      await expect(
        viewer(page).getByRole('tab', {
          name: new RegExp(`^${deText.labels.suggestions}`),
        })
      ).toBeVisible()
    })

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
