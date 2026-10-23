import { expect, test, type Page } from '@playwright/test'

import { guardConsole } from './console-guard'
import { waitForFirstPage } from './helpers'

guardConsole(test)

/** A form field's box in the form layer; its control is inside it. */
const field = (page: Page, name: string) =>
  page.locator(`[data-ink-field="${name}"]`).first()

const actions = (page: Page) => page.getByTestId('form-actions').locator('li')

async function openScripted(page: Page): Promise<void> {
  await page.goto('/?doc=form-scripted')
  await waitForFirstPage(page)
  await expect(field(page, 'qty').locator('input')).toBeVisible()
}

test('fills, calculates and undoes', async ({ page }) => {
  await openScripted(page)
  const qty = field(page, 'qty').locator('input')
  const price = field(page, 'price').locator('input')
  const total = field(page, 'total').locator('input')
  const undo = page.getByRole('button', { name: 'Undo' })
  const redo = page.getByRole('button', { name: 'Redo' })
  await expect(undo).toBeDisabled()

  await price.fill('12.5')
  await price.press('Enter')
  await qty.fill('2')
  await qty.press('Enter')
  await expect(total).toHaveValue('£25.00')

  // One commit, so one step: the quantity and the total it recalculated go back together.
  await qty.fill('3')
  await qty.press('Enter')
  await expect(total).toHaveValue('£37.50')
  await undo.click()
  await expect(qty).toHaveValue('2')
  await expect(total).toHaveValue('£25.00')
  await redo.click()
  await expect(qty).toHaveValue('3')
  await expect(total).toHaveValue('£37.50')
})

test('undoes and redoes from the keyboard, and a field keeps its own text undo', async ({
  page,
}) => {
  await openScripted(page)
  const qty = field(page, 'qty').locator('input')
  const price = field(page, 'price').locator('input')
  const total = field(page, 'total').locator('input')
  await price.fill('12.5')
  await price.press('Enter')
  await qty.fill('2')
  await qty.press('Enter')
  await qty.fill('3')
  await qty.press('Enter')
  await expect(total).toHaveValue('£37.50')

  // In the field, the chord is the field's own undo: the typed text goes, the commit stays.
  await qty.press('End')
  await qty.press('5')
  await expect(qty).toHaveValue('35')
  await qty.press('ControlOrMeta+z')
  await expect(qty).toHaveValue('3')
  await expect(total).toHaveValue('£37.50')

  // On the viewer, the chord undoes the last commit and the total it recalculated.
  await qty.blur()
  await page.locator('[data-ink-scroll]').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(qty).toHaveValue('2')
  await expect(total).toHaveValue('£25.00')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(qty).toHaveValue('3')
  await expect(total).toHaveValue('£37.50')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(qty).toHaveValue('2')
  await page.keyboard.press('Control+y')
  await expect(qty).toHaveValue('3')

  // From the toolbar too: focus stays on Undo after a press, and the key redoes from there.
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(qty).toHaveValue('2')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(qty).toHaveValue('3')
})

test('Tab moves through fields', async ({ page }) => {
  await openScripted(page)
  await field(page, 'qty').locator('input').focus()
  const visited: (string | null)[] = []
  for (let i = 0; i < 6; i++) {
    visited.push(
      await page.evaluate(
        () =>
          document.activeElement?.closest<HTMLElement>('[data-ink-field]')?.dataset
            .inkField ?? null
      )
    )
    await page.keyboard.press('Tab')
  }
  // The hidden field is no stop.
  expect(visited).toEqual(['qty', 'price', 'total', 'when', 'age', 'more'])
})

test('submit shows as an action and makes no request', async ({ page }) => {
  const outward: string[] = []
  page.on('request', (r) => {
    if (new URL(r.url()).hostname.endsWith('example.com')) outward.push(r.url())
  })
  await openScripted(page)
  await field(page, 'submit').locator('button').click()
  await expect(actions(page).first()).toHaveText('submit https://example.com/submit')
  await field(page, 'send').locator('button').click()
  await expect(actions(page).first()).toHaveText('submit https://example.com/xfdf')
  await field(page, 'site').locator('button').click()
  await expect(actions(page).first()).toHaveText('open-url https://example.com/')
  expect(outward).toEqual([])
})

test('an alert shows the dialog, not a browser dialog', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', (d) => {
    dialogs.push(d.message())
    void d.dismiss()
  })
  await openScripted(page)
  await field(page, 'hello').locator('button').click()
  const alert = page.locator('[data-ink-form-alert]')
  await expect(alert).toBeVisible()
  await expect(alert.locator('[data-ink-form-alert-message]')).toHaveText('Hello')
  await alert.getByRole('button', { name: 'OK' }).click()
  await expect(alert).toBeHidden()
  // A prompt can't wait for an answer: it is an action, and no browser prompt opens either.
  await field(page, 'ask').locator('button').click()
  await expect(actions(page).first()).toHaveText('prompt Name?')
  expect(dialogs).toEqual([])
})
