// eslint-disable-next-line import-x/no-named-as-default
import AxeBuilder from '@axe-core/playwright'
import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page } from '@playwright/test'

import { FRAMEWORK_ORDER } from '../src/shell/frameworks.ts'

const guard = guardConsole(test)

/** Each framework with its sidebar name and the names its callbacks log under. */
const FRAMEWORKS = [
  { id: 'react', name: 'React', ready: 'onReady', tool: 'onToolChange' },
  { id: 'vue', name: 'Vue', ready: '@ready', tool: '@update:tool' },
  { id: 'svelte', name: 'Svelte', ready: 'onReady', tool: 'onToolChange' },
  { id: 'vanilla', name: 'TypeScript', ready: 'onReady', tool: 'tools.active' },
] as const

/** The picker name of a framework. */
const nameOf = (id: string): string => FRAMEWORKS.find((f) => f.id === id)!.name

const SCENARIO_TITLES = [
  'Annotation tour',
  'Pick your tools',
  'Fill a form',
  'Custom plugins',
  'Controlled annotations',
  'Search a long document',
  'Sidebars',
  'Outline and links',
  'Press and long press',
]

const nav = (page: Page) => page.getByRole('navigation', { name: 'Scenarios' })
const picker = (page: Page) => nav(page).getByRole('button', { name: /^Framework/ })
const frameworkMenu = (page: Page) => nav(page).locator('#fw-menu')
const scenarioLink = (page: Page, title: string) =>
  nav(page).locator('.nav-scenarios').getByRole('link', { name: title, exact: true })

/** Picks `framework` in the sidebar, then `title` among its scenarios. */
async function choose(page: Page, framework: string, title: string): Promise<void> {
  if ((await picker(page).getAttribute('aria-label')) !== `Framework: ${framework}`) {
    await picker(page).click()
    await frameworkMenu(page)
      .getByRole('link', { name: new RegExp(`^${framework} `) })
      .click()
    await expect(picker(page)).toHaveAccessibleName(`Framework: ${framework}`)
  }
  await scenarioLink(page, title).click()
}
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
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Annotation tour')
  await expect(breadcrumb(page)).toContainText('React')
  await expect(viewer(page).locator('.ink-page').first()).toBeVisible({ timeout: 20_000 })
  await expect(picker(page)).toHaveAccessibleName('Framework: React')
  await expect(scenarioLink(page, 'Annotation tour')).toHaveAttribute(
    'aria-current',
    'page'
  )
})

test('a deep link opens that framework', async ({ page }) => {
  for (const fw of FRAMEWORKS) {
    await page.goto(`./#/${fw.id}/tour`)
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
  await page.goto('./')
  await waitForViewer(page)
  await choose(page, 'Vue', 'Annotation tour')
  await choose(page, 'Svelte', 'Annotation tour')
  await choose(page, 'TypeScript', 'Annotation tour')
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
  await page.goto('./')
  await waitForViewer(page)
  await choose(page, 'Vue', 'Annotation tour')
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
  await page.goto('./')
  await page.getByRole('tab', { name: 'Code' }).click()
  const code = page.getByRole('tabpanel', { name: 'Code' })
  await expect(code).toContainText('tour/react.tsx')
  await choose(page, 'Vue', 'Pick your tools')
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
  await page.goto('./')
  await page.getByRole('tab', { name: 'Code' }).click()
  await expect(page.getByRole('tabpanel', { name: 'Code' })).toContainText(
    'tour/react.tsx'
  )
  await choose(page, 'Vue', 'Annotation tour')
  const code = page.getByRole('tabpanel', { name: 'Code' })
  await expect(code).toContainText('The code could not be loaded')
  await expect(code).not.toContainText('tour/react.tsx')
  // The aborted import is the expected outcome of this route.
  guard.take(/ERR_FAILED|dynamically imported module/)
  failing = false
  // The failure does not wedge the tab: the next scenario shows its source. (A browser keeps a
  // failed module import for the page's life, so the same file is not tried again until reload.)
  await choose(page, 'Vue', 'Pick your tools')
  await expect(code).toContainText('tools/vue.vue')
})

test('a scenario that fails to load says so, and a dropped PDF has no viewer', async ({
  page,
  request,
}) => {
  // The scenario's own Vue chunks fail; the highlighted sources (Shiki's markup) still load.
  await page.route('**/assets/vue*.js', async (route) => {
    const response = await route.fetch()
    if ((await response.text()).includes('shiki')) await route.fulfill({ response })
    else await route.abort()
  })
  await page.goto('./#/vue/tools')
  await expect(viewer(page)).toContainText('This scenario could not be loaded.')
  await expect(viewer(page).locator('[data-ink-root]')).toHaveCount(0)
  // The aborted imports are the expected outcome of this route.
  guard.take(/ERR_FAILED|dynamically imported module/)
  const letter = await (await request.get('documents/letter.pdf')).body()
  await drop(page, letter, 'letter.pdf', 'application/pdf')
  await expect(page.locator('[data-file-status]')).toHaveText(
    'There is no viewer to open letter.pdf in.'
  )
})

test('a PDF dropped while a scenario loads is reported as unopened when the load fails', async ({
  page,
  request,
}) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  // The scenario's own Vue chunks wait for the drop, then fail.
  await page.route('**/assets/vue*.js', async (route) => {
    const response = await route.fetch()
    if ((await response.text()).includes('shiki')) await route.fulfill({ response })
    else {
      await gate
      await route.abort()
    }
  })
  await page.goto('./#/vue/tools')
  const letter = await (await request.get('documents/letter.pdf')).body()
  await drop(page, letter, 'letter.pdf', 'application/pdf')
  await expect(page.locator('[data-file-status]')).toHaveText('Opened letter.pdf.')
  release()
  await expect(viewer(page)).toContainText('This scenario could not be loaded.')
  await expect(page.locator('[data-file-status]')).toHaveText(
    'There is no viewer to open letter.pdf in.'
  )
  guard.take(/ERR_FAILED|dynamically imported module/)
})

test('an unknown hash is replaced by the default route', async ({ page }) => {
  await page.goto('./#/vue/forms')
  await waitForViewer(page)
  await page.evaluate(() => {
    location.hash = '#/nowhere/at-all'
  })
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Annotation tour')
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/react/tour')
})

for (const fw of FRAMEWORK_ORDER) {
  test(`${fw}: a dropped PDF stays until the scenario changes`, async ({
    page,
    request,
  }) => {
    await page.goto(`./#/${fw}/tour`)
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
    await choose(page, nameOf(fw), 'Pick your tools')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pick your tools')
    await choose(page, nameOf(fw), 'Annotation tour')
    await waitForViewer(page)
    await expect(pageCount).toHaveText('of 4')
    await expect(page.locator('[data-file-status]')).toHaveText('')
  })
}

for (const fw of FRAMEWORK_ORDER) {
  test(`${fw}: refuses a non-PDF and recovers from a broken one`, async ({
    page,
    request,
  }) => {
    await page.goto(`./#/${fw}/tour`)
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
    await expect(
      viewer(page).getByText('This document could not be opened.')
    ).toBeVisible()
    // PDF.js logs its parse failure; that is the expected outcome of this file.
    guard.take(/^Warning: Indexing all PDF objects$/)
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
}

for (const fw of FRAMEWORK_ORDER) {
  test(`${fw}: Open a PDF in the toolbar opens the file you pick`, async ({
    page,
    request,
  }) => {
    await page.goto(`./#/${fw}/tour`)
    await waitForViewer(page)
    const open = viewer(page)
      .getByRole('toolbar', { name: 'Document tools' })
      .getByRole('button', { name: 'Open a PDF' })
    const chooser = page.waitForEvent('filechooser')
    await open.click()
    const letter = await (await request.get('documents/letter.pdf')).body()
    await (
      await chooser
    ).setFiles({
      name: 'letter.pdf',
      mimeType: 'application/pdf',
      buffer: letter,
    })
    await expect(page.locator('[data-file-status]')).toHaveText('Opened letter.pdf.')
    await expect(viewer(page).locator('[data-ink-page-count]')).toHaveText('of 1')
  })
}

test('the events log keeps the newest 200', async ({ page }) => {
  await page.goto('./?debug#/react/tools')
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
  await page.goto('./#/react/tools')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pick your tools')
  expect(await page.evaluate(() => '__sandboxLog' in window)).toBe(false)
})

test('Code tab shows the scenario source', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('./')
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

  await choose(page, 'Vue', 'Annotation tour')
  await expect(code).toContainText('tour/vue.vue')
})

test('tabs work from the keyboard', async ({ page }) => {
  await page.goto('./')
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

test('the framework picker lists the frameworks and keeps the scenario', async ({
  page,
}) => {
  await page.goto('./#/react/forms')
  await expect(picker(page)).toHaveAccessibleName('Framework: React')
  await expect(nav(page).locator('.nav-scenarios').getByRole('link')).toHaveText(
    SCENARIO_TITLES
  )
  await expect(scenarioLink(page, 'Fill a form')).toHaveAttribute('aria-current', 'page')

  await picker(page).click()
  await expect(picker(page)).toHaveAttribute('aria-expanded', 'true')
  const menu = frameworkMenu(page)
  await expect(menu.getByRole('link')).toHaveCount(FRAMEWORKS.length)
  for (const fw of FRAMEWORKS)
    await expect(
      menu.getByRole('link', { name: new RegExp(`^${fw.name} `) })
    ).toHaveAttribute('href', `#/${fw.id}/forms`)
  await expect(menu.getByRole('link', { name: /^React / })).toHaveAttribute(
    'aria-current',
    'true'
  )

  await menu.getByRole('link', { name: /^Vue / }).click()
  await expect(page).toHaveURL(/#\/vue\/forms$/)
  await expect(menu).toBeHidden()
  await expect(picker(page)).toBeFocused()
  await expect(picker(page)).toHaveAccessibleName('Framework: Vue')
  await expect(breadcrumb(page)).toContainText('Vue')
  await expect(scenarioLink(page, 'Fill a form')).toHaveAttribute('aria-current', 'page')
  await expect(scenarioLink(page, 'Annotation tour')).toHaveAttribute(
    'href',
    '#/vue/tour'
  )

  // A press outside closes the menu.
  await picker(page).click()
  await expect(menu).toBeVisible()
  await page.getByRole('heading', { level: 1 }).click()
  await expect(menu).toBeHidden()
})

test('the framework picker works from the keyboard', async ({ page }) => {
  await page.goto('./#/svelte/tools')
  await picker(page).focus()
  await page.keyboard.press('ArrowDown')
  const menu = frameworkMenu(page)
  await expect(menu.getByRole('link', { name: /^Svelte / })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('link', { name: /^TypeScript / })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('link', { name: /^React / })).toBeFocused()
  await page.keyboard.press('End')
  await expect(menu.getByRole('link', { name: /^TypeScript / })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(picker(page)).toBeFocused()

  await page.keyboard.press('ArrowUp')
  await expect(menu.getByRole('link', { name: /^TypeScript / })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/vanilla\/tools$/)
  await expect(picker(page)).toHaveAccessibleName('Framework: TypeScript')
  // Tab from the last framework leaves the menu, and the menu closes.
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('link', { name: /^TypeScript / })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(scenarioLink(page, 'Annotation tour')).toBeFocused()
  await expect(menu).toBeHidden()
})

test('no axe violations', async ({ page }) => {
  await page.goto('./')
  await waitForViewer(page)
  const { violations } = await new AxeBuilder({ page }).analyze()
  expect(violations).toEqual([])
  await page.getByRole('tab', { name: 'Code' }).click()
  await expect(page.getByRole('tabpanel', { name: 'Code' })).toContainText('allTools()')
  const code = await new AxeBuilder({ page }).analyze()
  expect(code.violations).toEqual([])
})

for (const fw of FRAMEWORK_ORDER) {
  test(`${fw}: no horizontal scroll at phone width`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`./#/${fw}/tour`)
    await waitForViewer(page)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBe(0)
  })
}

test('the TypeScript controlled page has no note', async ({ page }) => {
  await page.goto('./#/vanilla/controlled')
  await waitForViewer(page)
  await expect(page.locator('[data-scenario-note]')).toBeHidden()
})
