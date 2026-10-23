import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page } from '@playwright/test'

guardConsole(test)

const FRAMEWORKS = ['react', 'vue', 'svelte', 'vanilla'] as const

async function open(page: Page, framework: string): Promise<void> {
  await page.goto(`${framework}/`)
  await expect(page.locator('[data-ink-root]')).toHaveAttribute('data-state', 'ready', {
    timeout: 20_000,
  })
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

const panel = (page: Page) => page.getByRole('region', { name: 'Form' })
const actions = (page: Page) => panel(page).getByRole('list').locator('li')
const gloss = (page: Page) => panel(page).locator('pre')

for (const framework of FRAMEWORKS) {
  test.describe(framework, () => {
    test("the sample's form pages fill on every framework page", async ({ page }) => {
      await open(page, framework)
      await goToPage(page, 5)
      const name = field(page, 5, 'name').locator('input')
      await name.fill('Robin Hale')
      await name.press('Enter')
      await expect(name).toHaveValue('Robin Hale')
      await field(page, 5, 'agree').getByRole('checkbox').check()
      await expect(field(page, 5, 'agree').getByRole('checkbox')).toBeChecked()
      // The plan's second widget is yearly.
      const yearly = page
        .locator('.ink-page[data-page="4"] [data-ink-field="plan"] [role="radio"]')
        .last()
      await yearly.check()
      await expect(yearly).toBeChecked()

      await goToPage(page, 6)
      const price = field(page, 6, 'price').locator('input')
      const qty = field(page, 6, 'qty').locator('input')
      await price.fill('12.5')
      await price.press('Enter')
      await qty.fill('3')
      await qty.press('Enter')
      await expect(field(page, 6, 'total').locator('input')).toHaveValue('£37.50')
      // A percent field, and a calculation script written for this form.
      const discount = field(page, 6, 'discount').locator('input')
      await discount.fill('0.1')
      await discount.press('Enter')
      // A focused field shows the value as typed, and the format once focus leaves.
      await discount.blur()
      await expect(discount).toHaveValue('10.0%')
      await expect(field(page, 6, 'due').locator('input')).toHaveValue('£33.75')
      // A script shows the hidden field when the box is ticked.
      await expect(field(page, 6, 'extra')).toBeHidden()
      await field(page, 6, 'more').getByRole('checkbox').check()
      await expect(field(page, 6, 'extra')).toBeVisible()
    })

    test('Undo takes back a field edit, and the panel follows', async ({ page }) => {
      await open(page, framework)
      await goToPage(page, 5)
      const name = field(page, 5, 'name').locator('input')
      const before = await name.inputValue()
      await name.fill('Robin Hale')
      await name.press('Enter')
      await expect(gloss(page)).toContainText('"name": "Robin Hale"')
      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(name).toHaveValue(before)
      await expect(gloss(page)).not.toContainText('Robin Hale')
    })

    test('the panel shows actions and Gloss fields', async ({ page }) => {
      await open(page, framework)
      await expect(actions(page)).toHaveCount(0)
      await expect(gloss(page)).toContainText('"header.ref": "REF-0042"')
      // No-export fields stay out of Gloss.
      await expect(gloss(page)).not.toContainText('"internal"')

      await goToPage(page, 5)
      const name = field(page, 5, 'name').locator('input')
      await name.fill('Robin Hale')
      await name.press('Enter')
      await expect(gloss(page)).toContainText('"name": "Robin Hale"')

      await goToPage(page, 6)
      await field(page, 6, 'submit').locator('button').click()
      await field(page, 6, 'link').locator('button').click()
      await expect(actions(page)).toHaveText([
        'open-url https://example.com',
        'submit https://example.com/submit',
      ])
      // The last ten, newest first.
      const print = field(page, 6, 'print').locator('button')
      for (let i = 0; i < 10; i++) await print.click()
      await expect(actions(page)).toHaveCount(10)
      await expect(actions(page).first()).toHaveText('print')
    })
  })
}
