import { AxeBuilder } from '@axe-core/playwright'
import { browserAssets } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import { guardConsole } from '../../playwright/console-guard'
import HydratedHarness from '../../playwright/harness/HydratedSidebarHarness.vue'
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
  await expect(panel(page, 'Pages').locator('.ink-sidebar-panel-body')).toHaveText(
    'Pages content'
  )
  // The rail shows the open panel's title, which the rail button carries for assistive technology.
  await expect(panel(page, 'Pages').locator('.ink-sidebar-panel-title')).toBeVisible()
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

const handle = (page: Page) =>
  page.getByRole('separator', { name: /^Resize (left|right) sidebar$/ })
/** The width the root's style gives the theme. */
const styleWidth = (page: Page) =>
  page
    .getByTestId('sidebar')
    .evaluate((el) => (el as HTMLElement).style.getPropertyValue('--ink-sidebar-width'))
const boxWidth = (page: Page) =>
  page.getByTestId('sidebar').evaluate((el) => el.getBoundingClientRect().width)

/** Drags the handle `dx` CSS px with the mouse. */
async function drag(page: Page, dx: number): Promise<void> {
  const box = (await handle(page).boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 2, y)
  await page.mouse.move(x + dx, y)
  await page.mouse.up()
}

test('drag widens and remounting with the same storage keeps it', async ({
  mount,
  page,
}) => {
  await mount(Harness, { props: { layout: 'rail', stored: {} } })
  // The handle is the root's last child and names the panels it resizes.
  const last = page.getByTestId('sidebar').locator(':scope > :last-child')
  await expect(last).toHaveClass(/ink-sidebar-handle/)
  await expect(last).toHaveAttribute('role', 'separator')
  const panelsId = await page
    .getByTestId('sidebar')
    .locator('.ink-sidebar-panels')
    .getAttribute('id')
  expect(panelsId).toBeTruthy()
  await expect(handle(page)).toHaveAttribute('aria-controls', panelsId!)
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '320')
  expect(await styleWidth(page)).toBe('320px')
  const before = await boxWidth(page)

  await drag(page, 80)
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '400')
  expect(await styleWidth(page)).toBe('400px')
  // The theme lays it out at the new width.
  expect(await boxWidth(page)).toBe(before + 80)
  await expect(page.getByTestId('stored')).toHaveText('{"sidebar.left.width":400}')

  await page.getByTestId('remount').click()
  await expect(page.getByTestId('sidebar')).toHaveCount(0)
  await page.getByTestId('remount').click()
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '400')
  expect(await styleWidth(page)).toBe('400px')

  const results = await new AxeBuilder({ page })
    .include('[data-testid=sidebar]')
    .analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
})

test('keyboard resizes', async ({ mount, page }) => {
  await mount(Harness, { props: { layout: 'tabs', side: 'right', stored: {} } })
  await handle(page).focus()
  // On a right sidebar, ArrowLeft is wider.
  await page.keyboard.press('ArrowLeft')
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '336')
  expect(await styleWidth(page)).toBe('336px')
  await expect(page.getByTestId('stored')).toHaveText('{"sidebar.right.width":336}')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '304')
  await page.keyboard.press('End')
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '480')
  await page.keyboard.press('Home')
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '240')
  expect(await styleWidth(page)).toBe('240px')
  // Enter resets and forgets the saved width.
  await page.keyboard.press('Enter')
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '320')
  await expect(page.getByTestId('stored')).toHaveText('{}')
})

test('v-model:width is controlled and storage untouched', async ({ mount, page }) => {
  await mount(Harness, {
    props: { layout: 'rail', width: 300, stored: { 'sidebar.left.width': 450 } },
  })
  // The model wins over the saved width.
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '300')
  expect(await styleWidth(page)).toBe('300px')
  await drag(page, 60)
  await expect(page.getByTestId('width')).toHaveText('360')
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '360')
  expect(await styleWidth(page)).toBe('360px')
  await handle(page).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('width')).toHaveText('376')
  await expect(page.getByTestId('stored')).toHaveText('{"sidebar.left.width":450}')
})

test('InkSidebar inside InkRoot uses the root storage', async ({ mount, page }) => {
  await mount(Harness, {
    props: {
      layout: 'rail',
      inRoot: true,
      assets: browserAssets(),
      stored: { 'sidebar.left.width': 360 },
    },
  })
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '360')
  expect(await styleWidth(page)).toBe('360px')
  await handle(page).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('stored')).toHaveText('{"sidebar.left.width":376}')
})

test('InkRoot signatures go through storage', async ({ mount, page }) => {
  const template = {
    id: 'kept',
    kind: 'image',
    imagedata: 'data:image/png;base64,AA==',
    aspect: 2,
  }
  await mount(Harness, {
    props: { inRoot: true, assets: browserAssets(), stored: { signatures: [template] } },
  })
  await expect(page.getByTestId('signatures')).toHaveText('1')
  await page.getByTestId('save-signature').click()
  await expect(page.getByTestId('signatures')).toHaveText('2')
  const stored = JSON.parse((await page.getByTestId('stored').textContent())!) as {
    signatures: { id: string }[]
  }
  expect(stored.signatures.map((t) => t.id)).toEqual(['kept', 'added'])
})

test('hydration shows the width the client storage holds', async ({ mount, page }) => {
  await mount(HydratedHarness, {
    props: { layout: 'rail', stored: { 'sidebar.left.width': 400 } },
  })
  // The server had no store: its markup is at the default width.
  await expect(page.getByTestId('server-html')).toHaveAttribute(
    'data-html',
    /--ink-sidebar-width:\s?320px/
  )
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '400')
  expect(await styleWidth(page)).toBe('400px')
})

const sidebar = (page: Page) => page.getByTestId('sidebar')
/** Clicks the pages near their far edge, clear of a floating panel. */
async function tapPages(page: Page): Promise<void> {
  const box = (await page.getByTestId('pages').boundingBox())!
  await page.mouse.click(box.x + box.width - 20, box.y + 20)
}

test('floats in a narrow container and closes on a tap on the pages', async ({
  mount,
  page,
}) => {
  await mount(Harness, { props: { layout: 'rail', containerWidth: 600 } })
  // No room at the first measurement: the panel starts closed.
  await expect(sidebar(page)).toHaveAttribute('data-state', 'closed')
  await expect(sidebar(page)).not.toHaveAttribute('data-overlay')
  await page.getByRole('tab', { name: 'Pages' }).click()
  await expect(sidebar(page)).toHaveAttribute('data-overlay', '')
  await expect(panel(page, 'Pages')).toBeVisible()
  // The pages keep their room.
  expect(
    await page.getByTestId('pages').evaluate((el) => el.getBoundingClientRect().width)
  ).toBeGreaterThanOrEqual(480)

  await tapPages(page)
  await expect(sidebar(page)).toHaveAttribute('data-state', 'closed')
  await expect(sidebar(page)).not.toHaveAttribute('data-overlay')
  await expect(page.getByText('Pages content')).toBeHidden()
})

test('inherits minDocumentWidth from InkRoot', async ({ mount, page }) => {
  // 900px leaves the default 480 room; the root asks for 700.
  await mount(Harness, {
    props: {
      layout: 'rail',
      inRoot: true,
      assets: browserAssets(),
      containerWidth: 900,
      rootMinDocumentWidth: 700,
    },
  })
  await expect(sidebar(page)).toHaveAttribute('data-state', 'closed')
  await page.getByRole('tab', { name: 'Pages' }).click()
  await expect(sidebar(page)).toHaveAttribute('data-overlay', '')
})

test("the sidebar's minDocumentWidth wins over InkRoot's", async ({ mount, page }) => {
  await mount(Harness, {
    props: {
      layout: 'rail',
      inRoot: true,
      assets: browserAssets(),
      containerWidth: 900,
      rootMinDocumentWidth: 700,
      minDocumentWidth: 400,
    },
  })
  await expect(panel(page, 'Pages')).toBeVisible()
  await expect(sidebar(page)).toHaveAttribute('data-state', 'open')
  await expect(sidebar(page)).not.toHaveAttribute('data-overlay')
})

test('handleLabel names the handle', async ({ mount, page }) => {
  await mount(Harness, {
    props: { layout: 'rail', handleLabel: 'Resize the pages list' },
  })
  await expect(
    page.getByRole('separator', { name: 'Resize the pages list' })
  ).toHaveAttribute('aria-valuenow', '320')
})

test('dropping handleLabel brings back the default name', async ({ mount, page }) => {
  const cmp = await mount(Harness, {
    props: { layout: 'rail', handleLabel: 'Resize the pages list' },
  })
  await expect(
    page.getByRole('separator', { name: 'Resize the pages list' })
  ).toHaveCount(1)
  await cmp.update({ props: { handleLabel: undefined } })
  await expect(page.getByRole('separator', { name: 'Resize left sidebar' })).toHaveCount(
    1
  )
})

test('starts closed after hydration without a mismatch', async ({ mount, page }) => {
  await mount(HydratedHarness, { props: { layout: 'rail', containerWidth: 500 } })
  // The server showed the panel beside the pages.
  await expect(page.getByTestId('server-html')).toHaveAttribute(
    'data-html',
    /class="ink-sidebar"[^>]*data-state="open"/
  )
  await expect(sidebar(page)).toHaveAttribute('data-state', 'closed')
  await expect(page.getByText('Pages content')).toBeHidden()
  await expect(page.getByTestId('open')).toHaveText('null')
  // The console guard fails the test on a hydration warning.
})

test('a bound open reports the close', async ({ mount, page }) => {
  await mount(Harness, { props: { layout: 'rail', open: 'pages', containerWidth: 500 } })
  // Controlled: it stays open, floating.
  await expect(sidebar(page)).toHaveAttribute('data-overlay', '')
  await expect(page.getByTestId('open')).toHaveText('"pages"')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('open')).toHaveText('null')
  await expect(sidebar(page)).toHaveAttribute('data-state', 'closed')
  await page.getByRole('tab', { name: 'Pages' }).click()
  await expect(page.getByTestId('open')).toHaveText('"pages"')
  await tapPages(page)
  await expect(page.getByTestId('open')).toHaveText('null')
  await expect(page.getByText('Pages content')).toBeHidden()
})
