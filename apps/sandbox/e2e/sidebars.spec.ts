// eslint-disable-next-line import-x/no-named-as-default
import AxeBuilder from '@axe-core/playwright'
import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page } from '@playwright/test'

import { FRAMEWORK_ORDER } from '../src/shell/frameworks.ts'

guardConsole(test)

// Wide enough for both sidebars to sit open beside the document: at 1280 the scenario's viewer
// has no room for them, so they would start closed.
test.use({ viewport: { width: 1920, height: 1080 } })

const LAYOUTS = ['rail', 'tabs', 'stack'] as const

const viewer = (page: Page) => page.locator('[data-scenario-viewer]')

const sidebar = (page: Page, side: 'left' | 'right') =>
  viewer(page).locator(`.ink-sidebar[data-side="${side}"]`)

/** A rail or tabs button, or a stack header, of the left sidebar. */
function trigger(page: Page, layout: (typeof LAYOUTS)[number], label: string) {
  return sidebar(page, 'left').getByRole(layout === 'stack' ? 'button' : 'tab', {
    name: label,
    exact: true,
  })
}

/** A panel: a tab panel in rail and tabs, a region in stack. */
function panel(page: Page, layout: (typeof LAYOUTS)[number], label: string) {
  return sidebar(page, 'left').getByRole(layout === 'stack' ? 'region' : 'tabpanel', {
    name: label,
    exact: true,
  })
}

const layoutPicker = (page: Page) => viewer(page).getByLabel('Layout')

async function open(page: Page, framework: string): Promise<void> {
  // A browser alert or confirm would fail the test.
  page.on('dialog', (d) => {
    throw new Error(`Unexpected browser dialog: ${d.type()}`)
  })
  await page.goto(`./#/${framework}/sidebars`)
  await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute(
    'data-state',
    'ready',
    { timeout: 20_000 }
  )
  await expect(
    viewer(page).locator('.ink-page[data-page="0"] canvas[data-ink-canvas]')
  ).toBeVisible({ timeout: 20_000 })
}

async function pick(page: Page, layout: (typeof LAYOUTS)[number]): Promise<void> {
  await layoutPicker(page).selectOption(layout)
  // The picker sets both sidebars.
  await expect(sidebar(page, 'left')).toHaveAttribute('data-layout', layout)
  await expect(sidebar(page, 'right')).toHaveAttribute('data-layout', layout)
}

for (const framework of FRAMEWORK_ORDER) {
  test.describe(framework, () => {
    test(`${framework} sidebars: each layout switches panels by keyboard`, async ({
      page,
    }) => {
      await open(page, framework)
      // Rail by default, with Pages open.
      await expect(sidebar(page, 'left')).toHaveAttribute('data-layout', 'rail')
      await expect(panel(page, 'rail', 'Pages')).toBeVisible()
      await expect(
        panel(page, 'rail', 'Pages').getByRole('button', { name: 'Page 1', exact: true })
      ).toHaveAttribute('aria-current', 'page')

      // Rail: Up and Down move between the buttons, Enter opens.
      await pick(page, 'rail')
      await trigger(page, 'rail', 'Pages').focus()
      await page.keyboard.press('ArrowDown')
      await expect(trigger(page, 'rail', 'Search')).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(trigger(page, 'rail', 'Search')).toHaveAttribute(
        'aria-selected',
        'true'
      )
      await expect(panel(page, 'rail', 'Search')).toBeVisible()
      await expect(panel(page, 'rail', 'Pages')).toBeHidden()
      await page.keyboard.press('ArrowUp')
      await expect(trigger(page, 'rail', 'Pages')).toBeFocused()
      await page.keyboard.press('Space')
      await expect(panel(page, 'rail', 'Pages')).toBeVisible()
      await expect(panel(page, 'rail', 'Search')).toBeHidden()

      // Tabs: Left and Right move between the tabs, Enter opens.
      await pick(page, 'tabs')
      await expect(panel(page, 'tabs', 'Pages')).toBeVisible()
      await trigger(page, 'tabs', 'Pages').focus()
      await page.keyboard.press('ArrowRight')
      await expect(trigger(page, 'tabs', 'Search')).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(panel(page, 'tabs', 'Search')).toBeVisible()
      await expect(panel(page, 'tabs', 'Pages')).toBeHidden()
      await expect(
        panel(page, 'tabs', 'Search').getByRole('textbox', { name: 'Find in document' })
      ).toBeVisible()

      // Stack: Up and Down move between the headers, Enter expands, Space collapses.
      await pick(page, 'stack')
      await expect(trigger(page, 'stack', 'Search')).toHaveAttribute(
        'aria-expanded',
        'true'
      )
      await expect(trigger(page, 'stack', 'Pages')).toHaveAttribute(
        'aria-expanded',
        'false'
      )
      await trigger(page, 'stack', 'Search').focus()
      await page.keyboard.press('ArrowUp')
      await expect(trigger(page, 'stack', 'Pages')).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(panel(page, 'stack', 'Pages')).toBeVisible()
      await expect(panel(page, 'stack', 'Search')).toBeVisible()
      await page.keyboard.press('ArrowDown')
      await expect(trigger(page, 'stack', 'Search')).toBeFocused()
      await page.keyboard.press('Space')
      await expect(trigger(page, 'stack', 'Search')).toHaveAttribute(
        'aria-expanded',
        'false'
      )
      await expect(panel(page, 'stack', 'Search')).toBeHidden()
      await expect(panel(page, 'stack', 'Pages')).toBeVisible()
    })

    test(`${framework} sidebars: the right sidebar holds your own panel`, async ({
      page,
    }) => {
      await open(page, framework)
      // About is the right sidebar's only panel, so it starts open, in every layout.
      for (const layout of LAYOUTS) {
        await pick(page, layout)
        const about = sidebar(page, 'right').getByRole(
          layout === 'stack' ? 'region' : 'tabpanel',
          { name: 'About', exact: true }
        )
        await expect(about).toContainText('plugin records')
      }
    })

    test(`${framework} sidebars: axe passes in each layout`, async ({ page }) => {
      await open(page, framework)
      for (const layout of LAYOUTS) {
        await pick(page, layout)
        await expect(
          sidebar(page, 'left').getByRole('img', { name: 'Page 1', exact: true })
        ).toBeVisible()
        const { violations } = await new AxeBuilder({ page }).analyze()
        expect(violations, layout).toEqual([])
      }
    })
  })
}
