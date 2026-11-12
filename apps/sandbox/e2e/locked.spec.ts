import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test } from '@playwright/test'

import { FRAMEWORK_ORDER } from '../src/shell/frameworks.ts'

guardConsole(test)

for (const framework of FRAMEWORK_ORDER) {
  test(`${framework} locked: asks for the password, then opens`, async ({ page }) => {
    await page.goto(`./#/${framework}/locked`)
    const viewer = page.locator('[data-scenario-viewer]')
    const root = viewer.locator('[data-ink-root]')
    // The dialog is portalled out of the viewer, onto the page.
    const dialog = page.locator('[data-ink-password-dialog]')
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    await expect(root).toHaveAttribute('data-state', 'locked')

    const field = dialog.getByLabel('Password')
    await field.fill('nope')
    await field.press('Enter')
    await expect(dialog.getByText('Incorrect password. Try again.')).toBeVisible()

    await field.fill('inkbar')
    await field.press('Enter')
    await expect(root).toHaveAttribute('data-state', 'ready', { timeout: 20_000 })
    await expect(dialog).toBeHidden()
    await expect(
      viewer.locator('.ink-page[data-page="0"] canvas[data-ink-canvas]')
    ).toBeVisible({ timeout: 20_000 })
  })
}
