import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page } from '@playwright/test'

import { FRAMEWORK_ORDER } from '../src/shell/frameworks.ts'

guardConsole(test)

/** The name each framework's viewer-action callback logs under. */
const ACTION_EVENT = {
  react: 'onAction',
  vue: '@action',
  svelte: 'onaction',
  vanilla: 'onAction',
} as const

const viewer = (page: Page) => page.locator('[data-scenario-viewer]')
const events = (page: Page) => page.locator('aside[aria-label="Events"] ol > li')
const pageInput = (page: Page) => viewer(page).getByRole('spinbutton', { name: 'Page' })
const treeItem = (page: Page, name: string) =>
  viewer(page).getByRole('treeitem', { name, exact: true })

async function open(page: Page, framework: string): Promise<void> {
  // A browser alert or confirm would fail the test.
  page.on('dialog', (d) => {
    throw new Error(`Unexpected browser dialog: ${d.type()}`)
  })
  await page.goto(`./#/${framework}/outline`)
  await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute(
    'data-state',
    'ready',
    { timeout: 20_000 }
  )
  await expect(pageInput(page)).toHaveValue('1')
}

/** A link on a page (0-based), counting from 1 in the order the page's links were written. */
const link = (page: Page, pageIndex: number, n: number) =>
  viewer(page).locator(
    `.ink-page[data-page="${pageIndex}"] [data-ink-link-layer] [data-ink-link]:nth-child(${n})`
  )

/** Clicks the page at the middle of a link's box; link elements never take the pointer. */
async function clickLink(page: Page, selector: ReturnType<typeof link>): Promise<void> {
  await selector.first().scrollIntoViewIfNeeded()
  let last = ''
  await expect
    .poll(async () => {
      const now = JSON.stringify(await selector.first().boundingBox())
      const same = now === last
      last = now
      return same
    })
    .toBe(true)
  const box = (await selector.first().boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

for (const framework of FRAMEWORK_ORDER) {
  test.describe(framework, () => {
    test(`${framework} outline: opens on the outline`, async ({ page }) => {
      await open(page, framework)
      await expect(
        viewer(page).getByRole('tabpanel', { name: 'Outline', exact: true })
      ).toBeVisible()
      await expect(treeItem(page, '1. Before you go out')).toBeVisible()
      await expect(treeItem(page, '3. Recording and checking')).toHaveAttribute(
        'aria-expanded',
        'false'
      )
      await expect(viewer(page).getByRole('button', { name: 'Back' })).toBeDisabled()
    })

    test(`${framework} outline: a contents line jumps to its section`, async ({
      page,
    }) => {
      await open(page, framework)
      // The contents are page 2; its third link is section 1.2.
      await pageInput(page).fill('2')
      await pageInput(page).press('Enter')
      await expect(link(page, 1, 3)).toBeAttached()
      await clickLink(page, link(page, 1, 3))
      await expect(pageInput(page)).toHaveValue('4')
      await expect(viewer(page).getByRole('button', { name: 'Back' })).toBeEnabled()
    })

    test(`${framework} outline: an index entry jumps and Back returns`, async ({
      page,
    }) => {
      await open(page, framework)
      const total = Number(
        (await viewer(page).locator('[data-ink-page-count]').textContent())?.match(
          /\d+/
        )?.[0]
      )
      expect(total).toBeGreaterThan(10)
      await pageInput(page).fill(String(total))
      await pageInput(page).press('Enter')
      await expect(pageInput(page)).toHaveValue(String(total))
      await expect(link(page, total - 1, 1)).toBeAttached()
      await clickLink(page, link(page, total - 1, 1))
      await expect(pageInput(page)).not.toHaveValue(String(total))
      await viewer(page).getByRole('button', { name: 'Back' }).click()
      await expect(pageInput(page)).toHaveValue(String(total))
    })

    test(`${framework} outline: an external link opens a new tab and logs onAction`, async ({
      page,
      context,
    }) => {
      // Nothing here may reach the network.
      await context.route('https://inkbar.dev/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<title>stub</title>' })
      )
      await open(page, framework)
      // Contents line 3.3, the twelfth link on page 2, leads to the section with the web link.
      await pageInput(page).fill('2')
      await pageInput(page).press('Enter')
      await expect(link(page, 1, 12)).toBeAttached()
      await clickLink(page, link(page, 1, 12))
      const anchor = viewer(page).locator('a[href="https://inkbar.dev/"]')
      await expect(anchor).toBeAttached()
      const popup = context.waitForEvent('page')
      await clickLink(page, anchor)
      const opened = await popup
      expect(opened.url()).toContain('https://inkbar.dev')
      await opened.close()
      const newest = events(page)
        .filter({
          has: page.locator('[data-event-name]', { hasText: ACTION_EVENT[framework] }),
        })
        .first()
      await expect(newest.locator('.event-payload')).toContainText('open-url')
      await expect(newest.locator('.event-payload')).toContainText('https://inkbar.dev')
    })

    test(`${framework} outline: a collapsed chapter expands with the arrow key`, async ({
      page,
    }) => {
      await open(page, framework)
      const chapter = treeItem(page, '3. Recording and checking')
      await expect(chapter).toHaveAttribute('aria-expanded', 'false')
      await expect(treeItem(page, '3.1 Field notebooks')).toBeHidden()
      await chapter.focus()
      await page.keyboard.press('ArrowRight')
      await expect(chapter).toHaveAttribute('aria-expanded', 'true')
      await expect(treeItem(page, '3.1 Field notebooks')).toBeVisible()
    })

    test(`${framework} outline: outline sidebar can be resized`, async ({ page }) => {
      await open(page, framework)
      const handle = viewer(page).getByRole('separator', { name: 'Resize sidebar' })
      // The sandbox's viewer is narrow, so the default width is already near the cap: go to
      // the minimum and widen from there.
      await handle.focus()
      await page.keyboard.press('Home')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      await expect(handle).toHaveAttribute('aria-valuenow', '272')
      await page.reload()
      await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute(
        'data-state',
        'ready',
        { timeout: 20_000 }
      )
      await expect(
        viewer(page).getByRole('separator', { name: 'Resize sidebar' })
      ).toHaveAttribute('aria-valuenow', '272')
    })
  })
}
