import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page } from '@playwright/test'

import { FRAMEWORK_ORDER } from '../src/shell/frameworks.ts'

guardConsole(test)

/** The name each framework's tool-change callback logs under. */
const TOOL_EVENT = {
  react: 'onToolChange',
  vue: '@update:tool',
  svelte: 'onToolChange',
  vanilla: 'tools.active',
} as const

const SELECT_TOOLS = ['select-text', 'select']
const CREATION_TOOLS = [
  'highlight',
  'redact-area',
  'sketch',
  'draw',
  'shape',
  'freetext',
  'signature',
  'note',
]

/** The `[data-tool]` buttons each scenario's toolbar offers. */
const TOOLBARS: Record<string, string[]> = {
  tour: [...SELECT_TOOLS, ...CREATION_TOOLS],
  tools: [...SELECT_TOOLS, 'highlight', 'note'],
  controlled: [...SELECT_TOOLS, ...CREATION_TOOLS],
}

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

for (const framework of FRAMEWORK_ORDER) {
  test.describe(framework, () => {
    for (const [scenario, expected] of Object.entries(TOOLBARS)) {
      test(`${framework} ${scenario} loads with its tools`, async ({ page }) => {
        await page.goto(`app.html#/${framework}/${scenario}`)
        await waitForViewer(page)
        const tools = await viewer(page)
          .locator('[data-tool]')
          .evaluateAll((els) => els.map((el) => el.getAttribute('data-tool')))
        expect([...new Set(tools)].sort()).toEqual([...expected].sort())
      })
    }

    test(`${framework} tools: picking note logs the tool change`, async ({ page }) => {
      await page.goto(`app.html#/${framework}/tools`)
      await waitForViewer(page)
      await viewer(page).getByRole('button', { name: 'Add note', exact: true }).click()
      const newest = events(page).first()
      await expect(newest.locator('[data-event-name]')).toHaveText(TOOL_EVENT[framework])
      await expect(newest.locator('.event-payload')).toHaveText('note')
    })

    test(`${framework} controlled: adding a highlight reports the new count`, async ({
      page,
    }) => {
      await page.goto(`app.html#/${framework}/controlled`)
      await waitForViewer(page)
      const line = (await viewer(page)
        .locator('.ink-page[data-page="0"] [data-ink-text-layer] span')
        .filter({ hasText: /\w{8}/ })
        .first()
        .boundingBox())!
      const midY = line.y + line.height / 2
      await viewer(page).getByRole('button', { name: 'Highlight', exact: true }).click()
      await page.mouse.move(line.x + 1, midY)
      await page.mouse.down()
      await page.mouse.move(line.x + line.width - 1, midY, { steps: 5 })
      await page.mouse.up()
      await expect(
        events(page)
          .filter({
            has: page.locator('[data-event-name]', { hasText: /^annotations$/ }),
          })
          .first()
          .locator('.event-payload')
      ).toHaveText('{"count":1}')
    })
  })
}
