import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import { guardConsole } from '../../playwright/console-guard'
import Harness from '../../playwright/harness/RedactionHarness.vue'

import type { Page } from '@playwright/test'
import type {} from '../../playwright/harness/held-engine'

const assets = browserAssets()
guardConsole(test)

type Hooked = HTMLElement & {
  __inkDocument?: {
    annotations: {
      add(input: unknown): { id: string }
      remove(id: string): boolean
    }
  }
}

/** Adds a redaction mark over SECRET-ALPHA on page 1 of the open document; returns its id. */
const mark = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-ink-root]') as Hooked
    return root.__inkDocument!.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 45, y: 190, width: 170, height: 35 },
    }).id
  })

const unmark = (page: Page, id: string) =>
  page.evaluate((markId) => {
    const root = document.querySelector('[data-ink-root]') as Hooked
    root.__inkDocument!.annotations.remove(markId)
  }, id)

const writing = (page: Page) => page.evaluate(() => window.__heldEngine!.writing())

test('is disabled without marks', async ({ mount, page }) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held' },
  })
  const apply = page.getByRole('button', { name: 'Apply redactions' })
  const probe = cmp.getByTestId('probe')
  await expect(apply).toHaveAttribute('data-ink-apply-redactions', '')
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await expect(apply).toBeDisabled()
  await expect(probe).toHaveAttribute('data-can-redact', 'false')

  const id = await mark(page)
  await expect(apply).toBeEnabled()
  await expect(probe).toHaveAttribute('data-can-redact', 'true')
  await unmark(page, id)
  await expect(apply).toBeDisabled()
  await expect(probe).toHaveAttribute('data-can-redact', 'false')
})

test('is disabled without the engine prop', async ({ mount, page }) => {
  const cmp = await mount(Harness, { props: { src: fixtureUrl('redact-text'), assets } })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await mark(page)
  // The mark is in the document, and still there is nothing to apply it with.
  await expect(cmp.locator('.ink-annotation[data-type="redact"]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Apply redactions' })).toBeDisabled()
  await expect(cmp.getByTestId('probe')).toHaveAttribute('data-can-redact', 'false')
})

test('shows busy while applying', async ({ mount, page }) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held' },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await mark(page)
  const apply = cmp.locator('[data-ink-apply-redactions]')
  await expect(apply).toBeEnabled()
  await apply.focus()
  await apply.press('Enter')
  await expect.poll(() => writing(page)).toBe(true)
  await expect(apply).toHaveAttribute('aria-busy', 'true')
  // Disabled for assistive tech, but not natively, so focus stays on it.
  await expect(apply).toHaveAttribute('aria-disabled', 'true')
  await expect(apply).not.toHaveAttribute('disabled')
  await expect(apply).toBeFocused()
  await expect(apply).toHaveText('Applying redactions…')
  await expect(cmp.getByTestId('probe')).toHaveAttribute('data-busy', 'true')
  // A second press starts nothing. Forced: Playwright waits for an `aria-disabled` button.
  await apply.click({ force: true })

  // A failed apply leaves the document as it was and says why.
  await page.evaluate(() => window.__heldEngine!.fail())
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveText(
    'The redactions could not be applied. Nothing was changed.'
  )
  await expect(cmp.getByTestId('errors')).toHaveText('RedactionFailed')
  await expect(apply).toHaveAttribute('aria-busy', 'false')
  await expect(apply).not.toHaveAttribute('aria-disabled')
  await expect(apply).toHaveText('Apply redactions')
  await expect(apply).toBeEnabled()
  await expect(cmp.getByTestId('probe')).toHaveAttribute('data-busy', 'false')
  await expect(cmp.locator('.ink-annotation[data-type="redact"]')).toHaveCount(1)
})

test('renders your own element with asChild', async ({ mount, page }) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('redact-text'), assets, engine: 'held', own: true },
  })
  const own = cmp.locator('button.host-apply')
  await expect(own).toHaveAttribute('data-ink-apply-redactions', '')
  await expect(own).toHaveText('Apply redactions')
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await expect(own).toBeDisabled()
  await expect(own).toHaveAttribute('data-disabled', 'true')
  await mark(page)
  await expect(own).toBeEnabled()
  await expect(own).toHaveAttribute('data-disabled', 'false')
  await own.click()
  await expect.poll(() => writing(page)).toBe(true)
  await expect(own).toHaveText('Applying redactions…')
  await expect(own).toHaveAttribute('data-busy', 'true')
  await expect(own).toHaveAttribute('aria-busy', 'true')
  await page.evaluate(() => window.__heldEngine!.fail())
  await expect(own).toHaveAttribute('data-busy', 'false')
  await expect(cmp.getByTestId('errors')).toHaveText('RedactionFailed')
})
