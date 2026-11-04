import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page } from '@playwright/test'

import { FRAMEWORK_ORDER } from '../src/shell/frameworks.ts'

guardConsole(test)

/** The name each framework's form-action callback logs under. */
const FORM_EVENT = {
  react: 'onFormAction',
  vue: '@form-action',
  svelte: 'onformaction',
  vanilla: 'onFormAction',
} as const

const viewer = (page: Page) => page.locator('[data-scenario-viewer]')
const events = (page: Page) => page.locator('aside[aria-label="Events"] ol > li')
const values = (page: Page) => page.locator('#panel-values pre')

async function open(page: Page, framework: string): Promise<void> {
  await page.goto(`./#/${framework}/forms`)
  await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute(
    'data-state',
    'ready',
    { timeout: 20_000 }
  )
}

async function showValues(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Values' }).click()
}

/** Shows page `n` (1-based) and waits for its form layer. */
async function goToPage(page: Page, n: number): Promise<void> {
  await page.locator('input[aria-label="Page"]').fill(String(n))
  await page.keyboard.press('Enter')
  await expect(
    page.locator(`.ink-page[data-page="${n - 1}"] [data-ink-form-layer]`)
  ).toBeVisible()
}

const field = (page: Page, n: number, name: string) =>
  page.locator(`.ink-page[data-page="${n - 1}"] [data-ink-field="${name}"]`).first()

/** The form document's text field for the full name. */
const fullName = (page: Page) => field(page, 1, 'name').locator('input')

for (const framework of FRAMEWORK_ORDER) {
  test.describe(framework, () => {
    test(`${framework} forms: the form pages fill`, async ({ page }) => {
      await open(page, framework)
      await goToPage(page, 1)
      const name = fullName(page)
      await name.fill('Robin Hale')
      await name.press('Enter')
      await expect(name).toHaveValue('Robin Hale')
      await field(page, 1, 'agree').getByRole('checkbox').check()
      await expect(field(page, 1, 'agree').getByRole('checkbox')).toBeChecked()
      // The plan's second widget is yearly.
      const yearly = page
        .locator('.ink-page[data-page="0"] [data-ink-field="plan"] [role="radio"]')
        .last()
      await yearly.check()
      await expect(yearly).toBeChecked()

      await goToPage(page, 2)
      const price = field(page, 2, 'price').locator('input')
      const qty = field(page, 2, 'qty').locator('input')
      await price.fill('12.5')
      await price.press('Enter')
      await qty.fill('3')
      await qty.press('Enter')
      await expect(field(page, 2, 'total').locator('input')).toHaveValue('£37.50')
      // A percent field, and a calculation script written for this form.
      const discount = field(page, 2, 'discount').locator('input')
      await discount.fill('0.1')
      await discount.press('Enter')
      // A focused field shows the value as typed, and the format once focus leaves.
      await discount.blur()
      await expect(discount).toHaveValue('10.0%')
      await expect(field(page, 2, 'due').locator('input')).toHaveValue('£33.75')
      // A script shows the hidden field when the box is ticked.
      await expect(field(page, 2, 'extra')).toBeHidden()
      await field(page, 2, 'more').getByRole('checkbox').check()
      await expect(field(page, 2, 'extra')).toBeVisible()
    })

    test(`${framework} forms: Undo takes back a field edit, and Values follows`, async ({
      page,
    }) => {
      await open(page, framework)
      await showValues(page)
      await goToPage(page, 1)
      const name = fullName(page)
      const before = await name.inputValue()
      await name.fill('Robin Hale')
      await name.press('Enter')
      await expect(values(page)).toContainText('"name": "Robin Hale"')
      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(name).toHaveValue(before)
      await expect(values(page)).not.toContainText('Robin Hale')
    })

    test(`${framework} forms: Values shows Gloss fields`, async ({ page }) => {
      await open(page, framework)
      await showValues(page)
      await expect(values(page)).toContainText('"header.ref": "REF-0042"')
      // No-export fields stay out of Gloss.
      await expect(values(page)).not.toContainText('"internal"')
    })

    test(`${framework} forms: the Values tab follows the fields`, async ({ page }) => {
      await open(page, framework)
      await goToPage(page, 1)
      const name = fullName(page)
      await name.fill('Sam Taylor')
      await name.press('Enter')
      await showValues(page)
      await expect(values(page)).toContainText('"Sam Taylor"')
    })

    test(`${framework} forms: the side tabs are a tablist`, async ({ page }) => {
      await open(page, framework)
      const events = page.getByRole('tab', { name: 'Events' })
      const valuesTab = page.getByRole('tab', { name: 'Values' })
      await expect(events).toHaveAttribute('aria-selected', 'true')
      await events.press('ArrowRight')
      await expect(valuesTab).toHaveAttribute('aria-selected', 'true')
      await expect(valuesTab).toBeFocused()
      await expect(page.getByRole('tabpanel', { name: 'Values' })).toBeVisible()
    })

    test(`${framework} forms: submit logs a form action`, async ({ page }) => {
      await open(page, framework)
      await goToPage(page, 2)
      await field(page, 2, 'submit').locator('button').click()
      const newest = events(page).first()
      await expect(newest.locator('[data-event-name]')).toHaveText(FORM_EVENT[framework])
      await expect(newest.locator('.event-payload')).toContainText('submit')
    })

    test(`${framework} forms: a signature field signs with no signature tool`, async ({
      page,
    }) => {
      await open(page, framework)
      await goToPage(page, 1)
      const sign = (name: string) => field(page, 1, name).locator('[data-ink-sign-field]')
      await sign('sig').scrollIntoViewIfNeeded()
      await sign('sig').click()
      await page
        .locator('[data-ink-sign-field-menu="sig"]')
        .getByRole('menuitem', { name: 'Create signature' })
        .click()
      const dialog = page.getByRole('dialog', { name: 'Create signature' })
      const pad = dialog.locator('[data-ink-signature-pad]')
      const box = (await pad.boundingBox())!
      await page.mouse.move(box.x + 20, box.y + 60)
      await page.mouse.down()
      await page.mouse.move(box.x + 80, box.y + 20, { steps: 4 })
      await page.mouse.move(box.x + 160, box.y + 70, { steps: 4 })
      await page.mouse.up()
      await dialog.getByRole('button', { name: 'Save' }).click()
      await expect(sign('sig')).toHaveAttribute('data-ink-signed', '')

      // The saved signature signs the witness field.
      await sign('sig2').click()
      await page
        .locator('[data-ink-sign-field-menu="sig2"]')
        .getByRole('menuitemradio')
        .first()
        .click()
      await expect(sign('sig2')).toHaveAttribute('data-ink-signed', '')
    })
  })
}
