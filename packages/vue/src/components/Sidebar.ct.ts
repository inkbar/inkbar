import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/experimental-ct-vue'

import { guardConsole } from '../../playwright/console-guard'
import Harness from '../../playwright/harness/SidebarHarness.vue'

import type { Page } from '@playwright/test'

guardConsole(test)

const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name })
const region = (page: Page, name: string) => page.getByRole('region', { name })

test('rail, tabs and stack render and switch by mouse and keyboard (rail)', async ({
  mount,
  page,
}) => {
  await mount(Harness, { props: { layout: 'rail' } })
  const sidebar = page.getByTestId('sidebar')
  await expect(sidebar).toHaveAttribute('data-layout', 'rail')
  await expect(sidebar).toHaveAttribute('data-side', 'left')
  const list = page.getByRole('tablist')
  await expect(list).toHaveAttribute('aria-orientation', 'vertical')
  await expect(list).toHaveClass(/ink-sidebar-rail/)
  const tabs = list.getByRole('tab')
  await expect(tabs).toHaveCount(3)
  // Icons only on the rail, the label in the tooltip; the badge joins the name.
  await expect(tabs.nth(0)).toHaveAttribute('title', 'Pages')
  await expect(tabs.nth(0).locator('svg.ink-icon')).toHaveCount(1)
  await expect(tabs.nth(0).locator('.ink-sidebar-label')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Search, 3' })).toBeVisible()
  await expect(tabs.nth(1).locator('.ink-sidebar-badge')).toHaveText('3')
  await expect(tabs.nth(0).locator('.ink-sidebar-badge')).toBeHidden()
  // The first panel starts open.
  await expect(page.getByRole('tab', { name: 'Pages' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(panel(page, 'Pages')).toHaveText('Pages content')
  await expect(panel(page, 'Pages')).toHaveClass(/ink-sidebar-panel/)

  await page.getByRole('tab', { name: 'Notes' }).click()
  await expect(panel(page, 'Notes')).toBeVisible()
  await expect(page.getByText('Pages content')).toBeHidden()
  // Arrow keys move focus only; Enter opens.
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('tab', { name: 'Search, 3' })).toBeFocused()
  await expect(panel(page, 'Notes')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tab', { name: 'Search, 3' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeVisible()
  // One Tab stop in the rail.
  await expect(tabs.and(page.locator('[tabindex="0"]'))).toHaveCount(1)
  // Activating the open panel's icon closes it.
  await page.keyboard.press('Space')
  await expect(sidebar).toHaveAttribute('data-state', 'closed')
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeHidden()
  // A badge of 0 hides.
  await page.getByTestId('clear-badge').click()
  await expect(page.getByRole('tab', { name: 'Search', exact: true })).toBeVisible()
  await expect(tabs.nth(1).locator('.ink-sidebar-badge')).toBeHidden()

  await page.getByRole('tab', { name: 'Pages' }).click()
  const results = await new AxeBuilder({ page })
    .include('[data-testid=sidebar]')
    .analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
})

test('rail, tabs and stack render and switch by mouse and keyboard (tabs)', async ({
  mount,
  page,
}) => {
  await mount(Harness, { props: { layout: 'tabs', side: 'right' } })
  const sidebar = page.getByTestId('sidebar')
  await expect(sidebar).toHaveAttribute('data-side', 'right')
  const list = page.getByRole('tablist')
  await expect(list).toHaveAttribute('aria-orientation', 'horizontal')
  await expect(list).toHaveClass(/ink-sidebar-tabs/)
  // Tabs show their labels.
  await expect(list.locator('.ink-sidebar-label')).toHaveText([
    'Pages',
    'Search',
    'Notes',
  ])
  await expect(panel(page, 'Pages')).toBeVisible()

  await page.getByRole('tab', { name: 'Search, 3' }).click()
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeVisible()
  // The open tab stays open when activated again.
  await page.getByRole('tab', { name: 'Search, 3' }).click()
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Notes' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Pages' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'Notes' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(panel(page, 'Notes')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeHidden()

  const results = await new AxeBuilder({ page })
    .include('[data-testid=sidebar]')
    .analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
})

test('rail, tabs and stack render and switch by mouse and keyboard (stack)', async ({
  mount,
  page,
}) => {
  await mount(Harness, { props: { layout: 'stack' } })
  await expect(page.getByRole('tablist')).toHaveCount(0)
  const headers = page.locator('.ink-sidebar-section > .ink-sidebar-header')
  await expect(headers).toHaveCount(3)
  await expect(headers.locator('.ink-sidebar-label')).toHaveText([
    'Pages',
    'Search',
    'Notes',
  ])
  const pages = page.getByRole('button', { name: 'Pages', exact: true })
  const search = page.getByRole('button', { name: 'Search, 3', exact: true })
  const notes = page.getByRole('button', { name: 'Notes', exact: true })
  await expect(pages).toHaveAttribute('aria-expanded', 'true')
  await expect(search).toHaveAttribute('aria-expanded', 'false')
  await expect(region(page, 'Pages')).toHaveText('Pages content')

  // Any number expanded.
  await search.click()
  await expect(search).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeVisible()
  await expect(region(page, 'Pages')).toBeVisible()
  // Every header is a Tab stop; Enter and Space toggle.
  await pages.focus()
  await page.keyboard.press('Tab')
  await expect(search).toBeFocused()
  await page.keyboard.press('Tab')
  // Past the open Search panel's field.
  await page.keyboard.press('Tab')
  await expect(notes).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(region(page, 'Notes')).toHaveText('Notes content')
  await pages.focus()
  await page.keyboard.press('Space')
  await expect(pages).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText('Pages content')).toBeHidden()

  const results = await new AxeBuilder({ page })
    .include('[data-testid=sidebar]')
    .analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
})

test('v-model:open is honoured and updated', async ({ mount, page }) => {
  await mount(Harness, { props: { layout: 'rail', open: 'search' } })
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeVisible()
  await expect(page.getByText('Pages content')).toBeHidden()
  await page.getByRole('tab', { name: 'Notes' }).click()
  await expect(page.getByTestId('open')).toHaveText('"notes"')
  await expect(panel(page, 'Notes')).toBeVisible()
  await page.getByRole('tab', { name: 'Notes' }).click()
  await expect(page.getByTestId('open')).toHaveText('null')
  await expect(page.getByTestId('sidebar')).toHaveAttribute('data-state', 'closed')
  // The host opens a panel from code.
  await page.getByTestId('open-notes').click()
  await expect(panel(page, 'Notes')).toBeVisible()
})

test('a tabs sidebar with open = null collapses as a whole', async ({ mount, page }) => {
  await mount(Harness, { props: { layout: 'tabs', open: null } })
  const sidebar = page.getByTestId('sidebar')
  await expect(sidebar).toHaveAttribute('data-state', 'closed')
  // No tab strip, no panel, no width: the host's own button brings it back.
  await expect(sidebar).toBeHidden()
  await expect(page.getByRole('tablist')).toBeHidden()
  expect(await sidebar.evaluate((el) => el.getBoundingClientRect().width)).toBe(0)
  await page.getByTestId('open-notes').click()
  await expect(sidebar).toHaveAttribute('data-state', 'open')
  await expect(panel(page, 'Notes')).toBeVisible()
  await expect(page.getByRole('tablist')).toBeVisible()
})

test('v-model:open is honoured and updated (stack)', async ({ mount, page }) => {
  await mount(Harness, { props: { layout: 'stack', open: ['search', 'notes'] } })
  await expect(page.getByRole('region', { name: 'Notes' })).toBeVisible()
  await expect(page.getByText('Pages content')).toBeHidden()
  await page.getByRole('button', { name: 'Pages', exact: true }).click()
  await expect(page.getByTestId('open')).toHaveText('["pages","search","notes"]')
  await page.getByTestId('open-notes').click()
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Notes', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true'
  )
})

test('a v-if-removed open panel falls back', async ({ mount, page }) => {
  await mount(Harness, { props: { layout: 'tabs', open: 'search' } })
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeVisible()
  await page.getByTestId('toggle-search').click()
  await expect(page.getByRole('tab')).toHaveCount(2)
  // The first remaining panel opens and the model hears of it.
  await expect(panel(page, 'Pages')).toBeVisible()
  await expect(page.getByTestId('open')).toHaveText('"pages"')
  // Back in, it takes its place in DOM order, not at the end.
  await page.getByTestId('toggle-search').click()
  await expect(page.getByRole('tab')).toHaveText(['Pages', 'Search3', 'Notes'])
  await expect(panel(page, 'Pages')).toBeVisible()
})

test('a v-if-removed open panel falls back (uncontrolled)', async ({ mount, page }) => {
  await mount(Harness, { props: { layout: 'rail' } })
  await page.getByRole('tab', { name: 'Search, 3' }).click()
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeVisible()
  await page.getByTestId('toggle-search').click()
  await expect(page.getByRole('tab')).toHaveCount(2)
  await expect(panel(page, 'Pages')).toBeVisible()
})

test('panel content keeps its state when hidden', async ({ mount, page }) => {
  await mount(Harness, { props: { layout: 'tabs' } })
  await page.getByRole('tab', { name: 'Search, 3' }).click()
  const field = page.getByRole('textbox', { name: 'Query' })
  await field.fill('kept')
  await page.getByRole('tab', { name: 'Notes' }).click()
  await expect(field).toBeHidden()
  // Hidden, not unmounted.
  await expect(page.locator('input[aria-label="Query"]')).toHaveCount(1)
  await page.getByRole('tab', { name: 'Search, 3' }).click()
  await expect(field).toHaveValue('kept')
})
