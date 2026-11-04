// eslint-disable-next-line import-x/no-named-as-default
import AxeBuilder from '@axe-core/playwright'
import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page } from '@playwright/test'

const guard = guardConsole(test)

/** Each framework with its sidebar name and the names its callbacks log under. */
const FRAMEWORKS = [
  { id: 'react', name: 'React', ready: 'onReady', tool: 'onToolChange' },
  { id: 'vue', name: 'Vue', ready: '@ready', tool: '@update:tool' },
  { id: 'svelte', name: 'Svelte', ready: 'onReady', tool: 'onToolChange' },
  { id: 'vanilla', name: 'TypeScript', ready: 'onReady', tool: 'tools.active' },
] as const

const SCENARIO_TITLES = [
  'Annotation tour',
  'Pick your tools',
  'Fill a form',
  'Suggest redactions',
  'Controlled annotations',
  'Search a long document',
]

const nav = (page: Page) => page.getByRole('navigation', { name: 'Scenarios' })
const group = (page: Page, framework: string) =>
  nav(page).getByRole('group', { name: framework, exact: true })
const scenarioLink = (page: Page, framework: string, title: string) =>
  group(page, framework).getByRole('link', { name: title, exact: true })
const breadcrumb = (page: Page) => page.getByRole('navigation', { name: 'Breadcrumb' })
const viewer = (page: Page) => page.locator('[data-scenario-viewer]')
const events = (page: Page) => page.locator('aside[aria-label="Events"] ol > li')

async function waitForViewer(page: Page): Promise<void> {
  await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute(
    'data-state',
    'ready',
    { timeout: 20_000 }
  )
  await expect(
    viewer(page).locator('.ink-page[data-page="0"] canvas[data-ink-canvas]')
  ).toBeVisible({ timeout: 20_000 })
}

/** Drops `bytes` on the viewer as a file named `name`, the way a browser drop arrives. */
async function drop(
  page: Page,
  bytes: Buffer,
  name: string,
  type: string
): Promise<void> {
  const dataTransfer = await page.evaluateHandle(
    ({ data, name, type }) => {
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array(data)], name, { type }))
      return dt
    },
    { data: [...bytes], name, type }
  )
  await viewer(page).dispatchEvent('dragover', { dataTransfer })
  await viewer(page).dispatchEvent('drop', { dataTransfer })
}

test('opens react tour by default', async ({ page }) => {
  await page.goto('app.html')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Annotation tour')
  await expect(breadcrumb(page)).toContainText('React')
  await expect(viewer(page).locator('.ink-page').first()).toBeVisible({ timeout: 20_000 })
  await expect(scenarioLink(page, 'React', 'Annotation tour')).toHaveAttribute(
    'aria-current',
    'page'
  )
})

test('a deep link opens that framework', async ({ page }) => {
  for (const fw of FRAMEWORKS) {
    await page.goto(`app.html#/${fw.id}/tour`)
    await page.reload()
    await expect(breadcrumb(page)).toContainText(fw.name)
    await waitForViewer(page)
    await expect(
      page.locator('aside[aria-label="Events"] ol > li [data-event-name]', {
        hasText: fw.ready,
      })
    ).toHaveCount(1)
    // A real callback, under the framework's own name.
    await viewer(page).getByRole('button', { name: 'Draw', exact: true }).click()
    await expect(
      events(page).filter({
        has: page.locator('[data-event-name]', { hasText: fw.tool }),
        hasText: 'draw',
      })
    ).toHaveCount(1)
    // The document comes from under the base path.
    expect(
      await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .some((e) => e.name.includes('/sandbox/documents/tour.pdf'))
      )
    ).toBe(true)
  }
})

test('switching quickly leaves one viewer', async ({ page }) => {
  // Vue's chunks arrive last, so its mount resolves after the newer selections have landed.
  let delayed = 0
  await page.route('**/assets/vue*.js', (route) => {
    delayed++
    setTimeout(() => void route.continue(), 1500)
  })
  await page.goto('app.html')
  await waitForViewer(page)
  await scenarioLink(page, 'Vue', 'Annotation tour').click()
  await scenarioLink(page, 'Svelte', 'Annotation tour').click()
  await scenarioLink(page, 'TypeScript', 'Annotation tour').click()
  await expect(breadcrumb(page)).toContainText('TypeScript')
  await waitForViewer(page)
  // Wait out the delayed chunks: the stale Vue mount lands now and must be discarded.
  await expect.poll(() => delayed).toBeGreaterThan(0)
  await page.waitForTimeout(2500)
  await expect(viewer(page).locator('[data-ink-root]')).toHaveCount(1)
  await expect(page).toHaveURL(/#\/vanilla\/tour$/)
})

test('a PDF dropped while the scenario loads opens once it has', async ({
  page,
  request,
}) => {
  await page.route('**/assets/vue*.js', (route) => {
    setTimeout(() => void route.continue(), 1500)
  })
  await page.goto('app.html')
  await waitForViewer(page)
  await scenarioLink(page, 'Vue', 'Annotation tour').click()
  const letter = await (await request.get('documents/letter.pdf')).body()
  await drop(page, letter, 'letter.pdf', 'application/pdf')
  await waitForViewer(page)
  await expect(page.locator('[data-file-status]')).toHaveText('Opened letter.pdf.')
  await expect(viewer(page).locator('[data-ink-page-count]')).toHaveText('of 1')
})

test('the Code tab drops the old source while the new one loads', async ({ page }) => {
  await page.route('**/assets/vue*.js', (route) => {
    setTimeout(() => void route.continue(), 1500)
  })
  await page.goto('app.html')
  await page.getByRole('tab', { name: 'Code' }).click()
  const code = page.getByRole('tabpanel', { name: 'Code' })
  await expect(code).toContainText('tour/react.tsx')
  await scenarioLink(page, 'Vue', 'Pick your tools').click()
  await expect(code).not.toContainText('tour/react.tsx')
  await expect(code).toContainText('Loading the code')
  await expect(code).toContainText('tools/vue.vue', { timeout: 10_000 })
})

test('the Code tab says when the source fails to load, then recovers', async ({
  page,
}) => {
  let failing = true
  // The highlighted source modules carry Shiki's markup; the scenario's own chunks do not.
  await page.route('**/assets/vue*.js', async (route) => {
    const response = await route.fetch()
    if (failing && (await response.text()).includes('shiki')) await route.abort()
    else await route.fulfill({ response })
  })
  await page.goto('app.html')
  await page.getByRole('tab', { name: 'Code' }).click()
  await expect(page.getByRole('tabpanel', { name: 'Code' })).toContainText(
    'tour/react.tsx'
  )
  await scenarioLink(page, 'Vue', 'Annotation tour').click()
  const code = page.getByRole('tabpanel', { name: 'Code' })
  await expect(code).toContainText('The code could not be loaded')
  await expect(code).not.toContainText('tour/react.tsx')
  // The aborted import is the expected outcome of this route.
  guard.take(/ERR_FAILED|dynamically imported module/)
  failing = false
  // The failure does not wedge the tab: the next scenario shows its source. (A browser keeps a
  // failed module import for the page's life, so the same file is not tried again until reload.)
  await scenarioLink(page, 'Vue', 'Pick your tools').click()
  await expect(code).toContainText('tools/vue.vue')
})

test('a dropped PDF stays until the scenario changes', async ({ page, request }) => {
  await page.goto('app.html')
  await waitForViewer(page)
  const pageCount = viewer(page).locator('[data-ink-page-count]')
  await expect(pageCount).toHaveText('of 4')
  const letter = await (await request.get('documents/letter.pdf')).body()
  await drop(page, letter, 'letter.pdf', 'application/pdf')
  await expect(page.locator('[data-file-status]')).toHaveText('Opened letter.pdf.')
  await expect(pageCount).toHaveText('of 1')
  // The Code tab and back keep the dropped file.
  await page.getByRole('tab', { name: 'Code' }).click()
  await page.getByRole('tab', { name: 'Preview' }).click()
  await expect(pageCount).toHaveText('of 1')
  await scenarioLink(page, 'React', 'Pick your tools').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pick your tools')
  await scenarioLink(page, 'React', 'Annotation tour').click()
  await waitForViewer(page)
  await expect(pageCount).toHaveText('of 4')
  await expect(page.locator('[data-file-status]')).toHaveText('')
})

test('refuses a non-PDF and recovers from a broken one', async ({ page, request }) => {
  await page.goto('app.html')
  await waitForViewer(page)
  const pageCount = viewer(page).locator('[data-ink-page-count]')
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a pdf'),
  })
  await expect(page.locator('[data-file-status]')).toHaveText('notes.txt is not a PDF.')
  await expect(pageCount).toHaveText('of 4')
  await drop(page, Buffer.from('not a pdf either'), 'notes.txt', 'text/plain')
  await expect(pageCount).toHaveText('of 4')

  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7 this is not really a PDF'),
  })
  await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute(
    'data-state',
    'error'
  )
  await expect(viewer(page).getByText('This document could not be opened.')).toBeVisible()
  // PDF.js logs its parse failure; that is the expected outcome of this file.
  guard.take(/./)
  const letter = await (await request.get('documents/letter.pdf')).body()
  await page.locator('input[type=file]').setInputFiles({
    name: 'letter.pdf',
    mimeType: 'application/pdf',
    buffer: letter,
  })
  await waitForViewer(page)
  await expect(page.locator('[data-file-status]')).toHaveText('Opened letter.pdf.')
  await expect(pageCount).toHaveText('of 1')
})

test('the events log keeps the newest 200', async ({ page }) => {
  await page.goto('app.html?debug#/react/tools')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pick your tools')
  // Let the viewer's own start-up entries land, then clear them so only these calls remain.
  await waitForViewer(page)
  await page
    .locator('aside[aria-label="Events"]')
    .getByRole('button', { name: 'Clear' })
    .click()
  await page.evaluate(() => {
    const log = (window as unknown as { __sandboxLog: (n: string, v: unknown) => void })
      .__sandboxLog
    for (let i = 0; i < 250; i++) log('test', { i })
  })
  await expect(events(page)).toHaveCount(200)
  await expect(events(page).first()).toContainText('{"i":249}')
  await expect(events(page).last()).toContainText('{"i":50}')
  await page
    .locator('aside[aria-label="Events"]')
    .getByRole('button', { name: 'Clear' })
    .click()
  await expect(events(page)).toHaveCount(0)
})

test('the events log is hidden from the page without the debug flag', async ({
  page,
}) => {
  await page.goto('app.html#/react/tools')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pick your tools')
  expect(await page.evaluate(() => '__sandboxLog' in window)).toBe(false)
})

test('Code tab shows the scenario source', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('app.html')
  await page.getByRole('tab', { name: 'Code' }).click()
  const code = page.getByRole('tabpanel', { name: 'Code' })
  await expect(code).toContainText('tour/react.tsx')
  await expect(code).toContainText('allTools()')
  await expect(code).toContainText('pnpm add @inkbar/react')
  await expect(code.getByRole('link', { name: 'View on GitHub' })).toHaveAttribute(
    'href',
    /\/apps\/sandbox\/src\/scenarios\/tour\/react\.tsx$/
  )
  await code.getByRole('button', { name: 'Copy' }).click()
  await expect(code.getByRole('button', { name: 'Copied' })).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain('allTools()')
  expect(copied).toContain('export default function')

  await scenarioLink(page, 'Vue', 'Annotation tour').click()
  await expect(code).toContainText('tour/vue.vue')
})

test('tabs work from the keyboard', async ({ page }) => {
  await page.goto('app.html')
  const preview = page.getByRole('tab', { name: 'Preview' })
  const code = page.getByRole('tab', { name: 'Code' })
  await expect(preview).toHaveAttribute('aria-selected', 'true')
  await preview.focus()
  await page.keyboard.press('ArrowRight')
  await expect(code).toBeFocused()
  await expect(code).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel', { name: 'Code' })).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(preview).toBeFocused()
  await expect(preview).toHaveAttribute('aria-selected', 'true')
})

test('the sidebar search filters scenarios', async ({ page }) => {
  await page.goto('app.html')
  for (const fw of FRAMEWORKS)
    for (const title of SCENARIO_TITLES)
      await expect(scenarioLink(page, fw.name, title)).toBeVisible()
  const search = nav(page).getByRole('searchbox', { name: 'Find a scenario' })

  await search.fill('form')
  for (const fw of FRAMEWORKS) {
    await expect(group(page, fw.name).getByRole('link')).toHaveCount(1)
    await expect(scenarioLink(page, fw.name, 'Fill a form')).toBeVisible()
  }

  await search.fill('vue')
  await expect(nav(page).getByRole('group')).toHaveCount(1)
  await expect(group(page, 'Vue').getByRole('link')).toHaveCount(6)

  await search.fill('nothing like this')
  await expect(nav(page).getByRole('group')).toHaveCount(0)
  await expect(nav(page)).toContainText('No scenario matches')

  await search.fill('')
  const toggle = group(page, 'Vue').getByRole('button', { name: 'Vue' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(scenarioLink(page, 'Vue', 'Annotation tour')).toBeHidden()
  await expect(scenarioLink(page, 'React', 'Annotation tour')).toBeVisible()
})

test('no axe violations', async ({ page }) => {
  await page.goto('app.html')
  await waitForViewer(page)
  const { violations } = await new AxeBuilder({ page }).analyze()
  expect(violations).toEqual([])
  await page.getByRole('tab', { name: 'Code' }).click()
  await expect(page.getByRole('tabpanel', { name: 'Code' })).toContainText('allTools()')
  const code = await new AxeBuilder({ page }).analyze()
  expect(code.violations).toEqual([])
})

test('no horizontal scroll at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('app.html')
  await waitForViewer(page)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  expect(overflow).toBe(0)
})

test('only the TypeScript controlled page says it follows the list', async ({ page }) => {
  const note = page.locator('[data-scenario-note]')
  await page.goto('app.html#/vanilla/controlled')
  await expect(note).toBeVisible()
  await expect(note).toHaveText(
    "createViewer can't take a controlled annotation list yet, so this page follows the list instead."
  )
  await page.goto('app.html#/react/controlled')
  await expect(note).toBeHidden()
})
