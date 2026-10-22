import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import { guardConsole } from '../../playwright/console-guard'
import FormHarness from '../../playwright/harness/FormHarness.vue'

import type { Locator, Page } from '@playwright/test'

const assets = browserAssets()
const guard = guardConsole(test)

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAYAAAAb4BS0AAAADklEQVR4nGP4z8DwH4YBJuYF+2EsXwgAAAAASUVORK5CYII='
const IMAGE = { id: 'sig-img', kind: 'image' as const, imagedata: PNG, aspect: 3 }

const readJson = (text: string): Record<string, unknown> =>
  JSON.parse(text) as Record<string, unknown>
const widget = (page: Page, field: string): Locator =>
  page.locator(`[data-ink-form-layer] [data-ink-field="${field}"]`)
const hostValues = async (page: Page): Promise<Record<string, unknown>> =>
  readJson((await page.getByTestId('host-fields').getAttribute('data-values')) ?? '{}')
const formValues = async (page: Page): Promise<Record<string, unknown>> =>
  readJson((await page.getByTestId('form').getAttribute('data-values')) ?? '{}')

test('v-model:fields receives committed values', async ({ mount, page }) => {
  const changes: unknown[] = []
  await mount(FormHarness, {
    props: {
      src: fixtureUrl('form-fields'),
      assets,
      controlled: true,
      initial: { name: 'Ada' },
    },
    on: { changed: (_next: unknown, change: unknown) => changes.push(change) },
  })
  const input = widget(page, 'name').locator('input')
  await expect(input).toHaveValue('Ada')
  await input.click()
  await page.keyboard.press('End')
  await page.keyboard.type('x')
  // Keystrokes stay local; only the commit reaches the host.
  await expect(page.getByTestId('host-fields')).toHaveAttribute('data-heard', '0')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('host-fields')).toHaveAttribute('data-heard', '1')
  expect(await hostValues(page)).toMatchObject({ name: 'Adax' })
  expect(changes).toEqual([{ kind: 'commit', names: ['name'] }])
  // The host's echo of what it heard reports nothing more.
  await expect(page.getByTestId('form')).toHaveAttribute('data-values', /"name":"Adax"/)
  await expect(page.getByTestId('host-fields')).toHaveAttribute('data-heard', '1')
})

test('a host push updates the field', async ({ mount, page }) => {
  await mount(FormHarness, {
    props: {
      src: fixtureUrl('form-fields'),
      assets,
      controlled: true,
      initial: { name: 'Ada' },
      push: { name: 'Pushed' },
    },
  })
  const input = widget(page, 'name').locator('input')
  await expect(input).toHaveValue('Ada')
  await page.getByTestId('push').click()
  await expect(input).toHaveValue('Pushed')
  expect(await formValues(page)).toMatchObject({ name: 'Pushed' })
  // The push is the host's own: it is not reported back.
  await expect(page.getByTestId('host-fields')).toHaveAttribute('data-heard', '0')
})

test('form-action emits submit', async ({ mount, page }) => {
  const actions: unknown[] = []
  await mount(FormHarness, {
    props: { src: fixtureUrl('form-scripted'), assets },
    on: { 'form-action': (a: unknown) => actions.push(a) },
  })
  await widget(page, 'send').locator('button').click()
  await expect.poll(() => actions.length).toBe(1)
  expect(actions[0]).toMatchObject({
    kind: 'submit',
    url: 'https://example.com/xfdf',
    format: 'xfdf',
  })
})

test('a script alert shows the dialog', async ({ mount, page }) => {
  await mount(FormHarness, { props: { src: fixtureUrl('form-scripted'), assets } })
  const hello = widget(page, 'hello').locator('button')
  await hello.focus()
  await hello.click()
  const alert = page.getByRole('alertdialog', { name: 'Message' })
  await expect(alert).toBeVisible()
  await expect(alert).toHaveAttribute('data-ink-form-alert', '')
  await expect(alert.locator('[data-ink-form-alert-message]')).toHaveText('Hello')
  // Non-blocking: no overlay, not modal.
  await expect(page.locator('[data-ink-dialog-overlay]')).toHaveCount(0)
  await expect(alert).not.toHaveAttribute('aria-modal', 'true')
  const ok = alert.getByRole('button', { name: 'OK' })
  await expect(ok).toBeFocused()
  await ok.click()
  await expect(alert).toBeHidden()
  await expect(hello).toBeFocused()
  // Escape in the alert closes it too.
  await hello.click()
  await expect(alert).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(alert).toBeHidden()
})

test('a form script error reaches error', async ({ mount, page }) => {
  const errors: { code: string }[] = []
  const cmp = await mount(FormHarness, {
    props: { src: fixtureUrl('form-scripted'), assets },
    on: { error: (e: { code: string }) => errors.push(e) },
  })
  await expect(widget(page, 'hello')).toBeVisible()
  await cmp.evaluate((el) => {
    const doc = (
      el as HTMLElement & { __inkDocument?: { form: { _error(e: unknown): void } } }
    ).__inkDocument!
    doc.form._error({ code: 'FormScriptError', message: 'A form script failed' })
  })
  await expect.poll(() => errors.map((e) => e.code)).toEqual(['FormScriptError'])
})

test('a sandbox that fails while the document opens reaches error', async ({
  mount,
  page,
}) => {
  // The error crosses to the test as a plain `Error`, so its message stands for its code.
  const errors: string[] = []
  // Without the sandbox's engine, the scripts cannot start.
  await mount(FormHarness, {
    props: { src: fixtureUrl('form-scripted'), assets: { ...assets, wasm: '/missing/' } },
    on: { error: (e: Error) => errors.push(e.message) },
  })
  await expect(widget(page, 'hello')).toBeVisible()
  await expect
    .poll(() => errors)
    .toEqual(["The form's scripts could not start; it can still be filled in"])
  guard.clear()
})

test.describe('signature fields', () => {
  const menu = (page: Page) => page.locator('[data-ink-sign-field-menu="sig"]')

  test('clicking a signature field opens the popover and signs', async ({
    mount,
    page,
  }) => {
    await mount(FormHarness, {
      props: { src: fixtureUrl('form-fields'), assets, templates: [IMAGE] },
    })
    const button = widget(page, 'sig').locator('[data-ink-sign-field]')
    await button.scrollIntoViewIfNeeded()
    await expect(button).toHaveText('Sign')
    await expect(button).toHaveAccessibleName('Sign this field: sig')
    await button.click()
    await expect(menu(page)).toBeVisible()
    await expect(menu(page)).toHaveAttribute('data-ink-menu', 'signature')
    await expect(menu(page).getByRole('menu', { name: 'Signatures' })).toBeVisible()
    // Anchored to the field's box: just below or above it, from its left edge.
    const b = (await widget(page, 'sig').boundingBox())!
    const m = (await menu(page).boundingBox())!
    expect(Math.abs(m.x - Math.max(8, b.x))).toBeLessThanOrEqual(1)
    expect(m.y >= b.y + b.height - 1 || m.y + m.height <= b.y + 1).toBe(true)
    const item = menu(page).getByRole('menuitemradio', { name: 'Signature 1' })
    await expect(item).toBeFocused()
    await item.click()
    await expect(menu(page)).toBeHidden()
    await expect(button).toHaveAttribute('data-ink-signed', '')
    await expect(button).toHaveText('')
    await expect(button).toBeFocused()
    const values = await formValues(page)
    const id = (values.sig as { signature: string }).signature
    expect(typeof id).toBe('string')
    await expect(page.getByTestId('probe')).toHaveAttribute('data-annotations', '1')
    await expect(page.locator(`[data-annotation="${id}"]`)).toHaveAttribute(
      'data-ink-pinned',
      ''
    )
    // The tool stays where it was: signing a field is not picking the signature tool.
    await expect(page.getByTestId('probe')).toHaveAttribute('data-tool', 'select-text')
    // A signed field asks nothing more. The signature covers the box, so the key does it.
    await button.press('Enter')
    await expect(menu(page)).toBeHidden()
  })

  test('a signature created from the popover signs the field', async ({
    mount,
    page,
  }) => {
    await mount(FormHarness, { props: { src: fixtureUrl('form-fields'), assets } })
    const button = widget(page, 'sig').locator('[data-ink-sign-field]')
    await button.scrollIntoViewIfNeeded()
    await button.click()
    await menu(page).getByRole('menuitem', { name: 'Create signature' }).click()
    await expect(menu(page)).toBeHidden()
    const dialog = page.getByRole('dialog', { name: 'Create signature' })
    await expect(dialog).toBeVisible()
    const pad = dialog.locator('[data-ink-signature-pad]')
    const box = (await pad.boundingBox())!
    await page.mouse.move(box.x + 20, box.y + 60)
    await page.mouse.down()
    await page.mouse.move(box.x + 80, box.y + 20, { steps: 4 })
    await page.mouse.move(box.x + 160, box.y + 70, { steps: 4 })
    await page.mouse.up()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
    await expect(button).toHaveAttribute('data-ink-signed', '')
    await expect(button).toBeFocused()
    await expect(page.getByTestId('probe')).toHaveAttribute('data-tool', 'select-text')
    await expect(page.getByTestId('probe')).toHaveAttribute('data-annotations', '1')
  })
})

test('useForm exposes values', async ({ mount, page }) => {
  await mount(FormHarness, { props: { src: fixtureUrl('form-fields'), assets } })
  const probe = page.getByTestId('form')
  await expect(probe).not.toHaveAttribute('data-fields', '0')
  const input = widget(page, 'name').locator('input')
  await input.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Grace')
  await page.keyboard.press('Enter')
  await expect(probe).toHaveAttribute('data-values', /"name":"Grace"/)
  await page.getByTestId('form-set').click()
  await expect(input).toHaveValue('Set')
  expect(JSON.parse((await probe.getAttribute('data-result'))!)).toEqual({
    applied: ['name'],
    rejected: [],
  })
  await page.getByTestId('form-reset').click()
  await expect(probe).not.toHaveAttribute('data-values', /"name":"Set"/)
  await expect(input).not.toHaveValue('Set')
})

test("uncontrolled fields undo with the toolbar's undo", async ({ mount, page }) => {
  await mount(FormHarness, { props: { src: fixtureUrl('form-fields'), assets } })
  const input = widget(page, 'name').locator('input')
  const before = await input.inputValue()
  const undo = page.locator('[data-ink-toolbar] [data-ink-undo]')
  await expect(undo).toBeDisabled()
  await input.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Grace')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('form')).toHaveAttribute('data-values', /Grace/)
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect(input).toHaveValue(before)
  await expect(page.getByTestId('form')).not.toHaveAttribute('data-values', /Grace/)
})

test('formHighlight false turns the tint off', async ({ mount, page }) => {
  await mount(FormHarness, {
    props: { src: fixtureUrl('form-fields'), assets, formHighlight: false },
  })
  await expect(page.locator('[data-ink-form-layer]').first()).toHaveAttribute(
    'data-ink-form-highlight',
    'off'
  )
})
