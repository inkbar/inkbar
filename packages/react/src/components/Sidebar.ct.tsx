import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/experimental-ct-react'

import { guardConsole } from '../../playwright/console-guard'
import {
  SidebarHarness as Harness,
  HydratedSidebarHarness,
  StrictSidebarHarness,
} from '../../playwright/harness/SidebarHarness'

import type { Page } from '@playwright/test'

guardConsole(test)

const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name })
const region = (page: Page, name: string) => page.getByRole('region', { name })

test('rail, tabs and stack render and switch by mouse and keyboard (rail)', async ({
  mount,
  page,
}) => {
  await mount(<Harness layout="rail" />)
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
  await expect(panel(page, 'Pages').locator('.ink-sidebar-panel-body')).toHaveText(
    'Pages content'
  )
  // The rail shows the open panel's title, which the rail button carries for assistive technology.
  await expect(panel(page, 'Pages').locator('.ink-sidebar-panel-title')).toBeVisible()
  await expect(panel(page, 'Pages')).toHaveClass(/ink-sidebar-panel/)
  // Uncontrolled, the first panel opens without a change to report.
  await expect(page.getByTestId('changes')).toHaveText('[]')

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
  await mount(<Harness layout="tabs" side="right" />)
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
  await mount(<Harness layout="stack" />)
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
  await expect(region(page, 'Pages').locator('.ink-sidebar-panel-body')).toHaveText(
    'Pages content'
  )
  // A stack's header names the section: no title.
  await expect(region(page, 'Pages').locator('.ink-sidebar-panel-title')).toBeHidden()

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
  await expect(region(page, 'Notes').locator('.ink-sidebar-panel-body')).toHaveText(
    'Notes content'
  )
  await pages.focus()
  await page.keyboard.press('Space')
  await expect(pages).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText('Pages content')).toBeHidden()

  const results = await new AxeBuilder({ page })
    .include('[data-testid=sidebar]')
    .analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
})

test('open and onOpenChange are honoured and updated', async ({ mount, page }) => {
  await mount(<Harness layout="rail" open="search" />)
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeVisible()
  await expect(page.getByText('Pages content')).toBeHidden()
  await page.getByRole('tab', { name: 'Notes' }).click()
  await expect(page.getByTestId('open')).toHaveText('"notes"')
  // Reported once per click: the controller handles the click, nothing else toggles.
  await expect(page.getByTestId('changes')).toHaveText('["notes"]')
  await expect(panel(page, 'Notes')).toBeVisible()
  await page.getByRole('tab', { name: 'Notes' }).click()
  await expect(page.getByTestId('open')).toHaveText('null')
  await expect(page.getByTestId('sidebar')).toHaveAttribute('data-state', 'closed')
  // The host opens a panel from code.
  await page.getByTestId('open-notes').click()
  await expect(panel(page, 'Notes')).toBeVisible()
})

test('open and onOpenChange are honoured and updated (stack)', async ({
  mount,
  page,
}) => {
  await mount(<Harness layout="stack" open={['search', 'notes']} />)
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

test('a conditionally removed open panel falls back', async ({ mount, page }) => {
  await mount(<Harness layout="tabs" open="search" />)
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

test('a conditionally removed open panel falls back (uncontrolled)', async ({
  mount,
  page,
}) => {
  await mount(<Harness layout="rail" />)
  await page.getByRole('tab', { name: 'Search, 3' }).click()
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeVisible()
  await page.getByTestId('toggle-search').click()
  await expect(page.getByRole('tab')).toHaveCount(2)
  await expect(panel(page, 'Pages')).toBeVisible()
  await expect(page.getByTestId('changes')).toHaveText('["search","pages"]')
})

test('defaultOpen opens a panel and leaves the sidebar uncontrolled', async ({
  mount,
  page,
}) => {
  await mount(<Harness layout="rail" defaultOpen="notes" />)
  await expect(panel(page, 'Notes')).toBeVisible()
  await expect(page.getByText('Pages content')).toBeHidden()
  await expect(page.getByTestId('changes')).toHaveText('[]')
  await page.getByRole('tab', { name: 'Pages' }).click()
  await expect(panel(page, 'Pages')).toBeVisible()
  await page.getByRole('tab', { name: 'Pages' }).click()
  await expect(page.getByTestId('sidebar')).toHaveAttribute('data-state', 'closed')
  await expect(page.getByTestId('changes')).toHaveText('["pages",null]')
})

test('StrictMode replays effects without changing what is open', async ({
  mount,
  page,
}) => {
  await mount(<StrictSidebarHarness layout="tabs" open="search" />)
  await expect(page.getByRole('tab')).toHaveCount(3)
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeVisible()
  // Panels unregister and register again: no fallback is reported.
  await expect(page.getByTestId('changes')).toHaveText('[]')
  await page.getByRole('tab', { name: 'Notes' }).click()
  await expect(panel(page, 'Notes')).toBeVisible()
  await expect(page.getByTestId('changes')).toHaveText('["notes"]')
  await page.getByTestId('toggle-search').click()
  await expect(page.getByRole('tab')).toHaveCount(2)
  await page.getByTestId('toggle-search').click()
  await expect(page.getByRole('tab')).toHaveText(['Pages', 'Search3', 'Notes'])
  await expect(panel(page, 'Notes')).toBeVisible()
})

test('StrictMode replays effects without changing what is open (uncontrolled)', async ({
  mount,
  page,
}) => {
  await mount(<StrictSidebarHarness layout="rail" />)
  await expect(page.getByRole('tab')).toHaveCount(3)
  await expect(panel(page, 'Pages')).toBeVisible()
  await page.getByRole('tab', { name: 'Notes' }).click()
  await expect(panel(page, 'Notes')).toBeVisible()
  await expect(page.getByTestId('changes')).toHaveText('["notes"]')
})

test('an open panel remounted in one render stays open', async ({ mount, page }) => {
  await mount(<Harness layout="tabs" open="search" />)
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeVisible()
  await page.getByTestId('remount-search').click()
  // Gone and back in the same commit: not a removed panel, so nothing falls back.
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveText(['Pages', 'Search3', 'Notes'])
  await expect(page.getByTestId('changes')).toHaveText('[]')
})

test('panel content keeps its state when hidden', async ({ mount, page }) => {
  await mount(<Harness layout="tabs" />)
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

for (const layout of ['rail', 'stack'] as const) {
  test(`server markup hydrates without a mismatch (${layout})`, async ({
    mount,
    page,
  }) => {
    await mount(<HydratedSidebarHarness layout={layout} />)
    // The server showed the first panel; the client agrees and adds the buttons.
    const html = page.getByTestId('server-html')
    await expect(html).toHaveAttribute('data-html', /data-state="open"/)
    await expect(html).toHaveAttribute(
      'data-html',
      /data-ink-sidebar-panel="notes"[^>]*hidden/
    )
    await expect(html).not.toHaveAttribute(
      'data-html',
      /data-ink-sidebar-panel="pages"[^>]*hidden/
    )
    await expect(page.getByText('Pages content')).toBeVisible()
    await expect(page.getByText('Notes content')).toBeHidden()
    if (layout === 'rail') {
      await expect(page.getByRole('tab')).toHaveCount(3)
      await page.getByRole('tab', { name: 'Notes' }).click()
    } else await page.getByRole('button', { name: 'Notes', exact: true }).click()
    await expect(page.getByText('Notes content')).toBeVisible()
  })
}

test('server markup hydrates without a mismatch (controlled)', async ({
  mount,
  page,
}) => {
  await mount(<HydratedSidebarHarness layout="tabs" open="search" />)
  await expect(page.getByTestId('server-html')).toHaveAttribute(
    'data-html',
    /data-state="open"/
  )
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(3)
  await expect(page.getByTestId('changes')).toHaveText('[]')
})
