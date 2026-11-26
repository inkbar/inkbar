import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import { guardConsole } from '../../playwright/console-guard'
import Harness from '../../playwright/harness/StoppedHarness.vue'

import type {} from '../../playwright/harness/stopped'

const assets = browserAssets()
guardConsole(test)

test('a document that stops shows the notice and emits error once with EngineUnavailable', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, { props: { src: fixtureUrl('text-simple'), assets } })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  const errors = cmp.getByTestId('errors')
  await expect(errors).toHaveText('')

  await page.evaluate(() => window.__setStopped?.(true))
  await expect(cmp.locator('[data-ink-engine-notice][role="alert"]')).toBeVisible()
  await expect(cmp.locator('[data-ink-engine-retry]')).toHaveText('Try again')
  await expect(errors).toHaveText('EngineUnavailable')
  await expect(cmp.locator('[data-ink-scroll]')).toHaveAttribute('inert', '')

  // Still stopped: nothing more is emitted.
  await page.evaluate(() => window.__setStopped?.(true))
  await expect(errors).toHaveText('EngineUnavailable')

  await page.evaluate(() => window.__setStopped?.(false))
  await expect(cmp.locator('[data-ink-engine-notice]')).toHaveCount(0)
  await expect(cmp.locator('[data-ink-scroll]')).not.toHaveAttribute('inert', '')
  await expect(errors).toHaveText('EngineUnavailable')
})
