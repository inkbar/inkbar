import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test } from '@playwright/test'

import type { SmokeState } from '../src/smoke/run.ts'

guardConsole(test)

/** The smoke page real browsers run: every check it makes passes here too. */
test('smoke page: every check passes', async ({ page }) => {
  await page.goto('./smoke/')
  await expect(page.locator('body')).toHaveAttribute('data-smoke', /passed|failed/, {
    timeout: 45_000,
  })
  const state = await page.evaluate(
    () => (window as { __inkbarSmoke?: SmokeState }).__inkbarSmoke
  )
  expect(state?.done).toBe(true)
  const failed = state!.results.filter((r) => !r.ok)
  expect(failed, JSON.stringify(failed, null, 2)).toEqual([])
  expect(state!.results).toHaveLength(9)
  await expect(page.locator('[data-smoke-results]')).toContainText('All 9 checks passed.')
})
