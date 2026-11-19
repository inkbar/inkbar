import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test } from '@playwright/test'

import { FRONTS } from '../src/smoke/front-ids.ts'

import type { SmokeState } from '../src/smoke/run.ts'

guardConsole(test)

/** How many checks the page makes through each front end. */
const CHECKS = 22

/** The smoke page real browsers run: every check it makes passes here too, in each front end. */
for (const front of FRONTS) {
  test(`smoke page (${front}): every check passes`, async ({ page }) => {
    await page.goto(`./smoke/?front=${front}`)
    await expect(page.locator('body')).toHaveAttribute('data-smoke', /passed|failed/, {
      timeout: 60_000,
    })
    const state = await page.evaluate(
      () => (window as { __inkbarSmoke?: SmokeState }).__inkbarSmoke
    )
    expect(state?.done).toBe(true)
    expect(state!.front).toBe(front)
    const failed = state!.results.filter((r) => !r.ok)
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([])
    expect(state!.results).toHaveLength(CHECKS)
    await expect(page.locator('[data-smoke-results]')).toContainText(
      `All ${CHECKS} checks passed.`
    )
  })
}
