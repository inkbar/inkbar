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

test('closing the alert leaves focus where the user moved it', async ({
  mount,
  page,
}) => {
  await mount(FormHarness, { props: { src: fixtureUrl('form-scripted'), assets } })
  const hello = widget(page, 'hello').locator('button')
  await hello.click()
  const alert = page.getByRole('alertdialog', { name: 'Message' })
  await expect(alert).toBeVisible()
  const qty = widget(page, 'qty').locator('input')
  await qty.focus()
  // A click with no press: OK closes the alert without taking focus first.
  await alert.getByRole('button', { name: 'OK' }).dispatchEvent('click')
  await expect(alert).toBeHidden()
  await expect(qty).toBeFocused()
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

const heardInPage = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as Window & { __inkHeard?: string[] }).__inkHeard ?? [])

test('an error from while the document opened comes after ready', async ({
  mount,
  page,
}) => {
  await mount(FormHarness, {
    props: { src: fixtureUrl('form-scripted'), assets: { ...assets, wasm: '/missing/' } },
  })
  await expect.poll(() => heardInPage(page)).toEqual(['ready', 'FormScriptError'])
  guard.clear()
})

test('a host listening from ready does not take the open-time errors from error', async ({
  mount,
  page,
}) => {
  await mount(FormHarness, {
    props: {
      src: fixtureUrl('form-scripted'),
      assets: { ...assets, wasm: '/missing/' },
      listenOnReady: true,
    },
  })
  await expect.poll(() => heardInPage(page)).toContain('FormScriptError')
  expect(await heardInPage(page)).toEqual(['ready', 'FormScriptError'])
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

  test('pressing Sign while its menu is open closes the menu', async ({
    mount,
    page,
  }) => {
    await mount(FormHarness, {
      props: { src: fixtureUrl('form-fields'), assets, templates: [IMAGE] },
    })
    const button = widget(page, 'sig').locator('[data-ink-sign-field]')
    await button.scrollIntoViewIfNeeded()
    await button.click()
    await expect(menu(page)).toBeVisible()
    // Count the menus that open from here on: closing and opening again would add one.
    await page.evaluate(() => {
      const w = window as Window & { __menusOpened?: number }
      w.__menusOpened = 0
      new MutationObserver((records) => {
        for (const r of records)
          for (const n of r.addedNodes)
            if (n instanceof HTMLElement && n.querySelector('[data-ink-sign-field-menu]'))
              w.__menusOpened! += 1
      }).observe(document.body, { childList: true, subtree: true })
    })
    await button.click()
    await expect(menu(page)).toBeHidden()
    await page.waitForTimeout(200)
    await expect(menu(page)).toBeHidden()
    expect(
      await page.evaluate(
        () => (window as Window & { __menusOpened?: number }).__menusOpened
      )
    ).toBe(0)
    await expect(button).toBeFocused()
    // And it opens again on the next press.
    await button.click()
    await expect(menu(page)).toBeVisible()
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

  test('closes when its field box leaves the page for any reason', async ({
    mount,
    page,
  }) => {
    await mount(FormHarness, {
      props: { src: fixtureUrl('form-fields'), assets, templates: [IMAGE] },
    })
    const button = widget(page, 'sig').locator('[data-ink-sign-field]')
    const menu = page.locator('[data-ink-sign-field-menu="sig"]')
    await button.scrollIntoViewIfNeeded()
    await button.click()
    await expect(menu).toBeVisible()
    // Not a page unmount: only the box goes.
    await widget(page, 'sig').evaluate((el) => el.remove())
    await expect(menu).toBeHidden()
  })

  test('returns focus to the field that replaced the open one', async ({
    mount,
    page,
  }) => {
    await mount(FormHarness, {
      props: { src: fixtureUrl('form-fields'), assets, templates: [IMAGE] },
    })
    const button = widget(page, 'sig').locator('[data-ink-sign-field]')
    const other = widget(page, 'sig2').locator('[data-ink-sign-field]')
    await button.scrollIntoViewIfNeeded()
    await button.click()
    await expect(page.locator('[data-ink-sign-field-menu="sig"]')).toBeVisible()
    // A click with no press first: the open menu sees nothing outside it, and the request is
    // replaced while it stays open.
    await other.evaluate((el) => (el as HTMLElement).click())
    const menu = page.locator('[data-ink-sign-field-menu="sig2"]')
    await expect(menu).toBeVisible()
    await menu.getByRole('menuitem', { name: 'Create signature' }).focus()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(other).toBeFocused()
  })
})

test('a new source resets controlled values to the new initial and closes the field menu', async ({
  mount,
  page,
}) => {
  await mount(FormHarness, {
    props: {
      src: fixtureUrl('form-fields'),
      assets,
      controlled: true,
      initial: { name: 'Ada' },
      swapTo: { src: `${fixtureUrl('form-fields')}?again`, initial: { name: 'Bea' } },
      templates: [IMAGE],
    },
  })
  const input = widget(page, 'name').locator('input')
  await expect(input).toHaveValue('Ada')
  await input.click()
  await page.keyboard.press('End')
  await page.keyboard.type('x')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('host-fields')).toHaveAttribute('data-heard', '1')
  const sign = widget(page, 'sig').locator('[data-ink-sign-field]')
  const menu = page.locator('[data-ink-sign-field-menu="sig"]')
  await sign.scrollIntoViewIfNeeded()
  await sign.click()
  await expect(menu).toBeVisible()
  // A click event without a press, so the menu does not close as for a press outside it.
  await page.getByTestId('swap').dispatchEvent('click')
  await expect(menu).toBeHidden()
  await expect(input).toHaveValue('Bea')
  await expect(page.getByTestId('form')).toHaveAttribute('data-values', /"name":"Bea"/)
  expect(await hostValues(page)).toEqual({ name: 'Bea' })
  // Opening the new document reports nothing.
  await page.waitForTimeout(100)
  await expect(page.getByTestId('host-fields')).toHaveAttribute('data-heard', '1')
})

test('a new source closes a "Create signature" dialog opened for the old field', async ({
  mount,
  page,
}) => {
  await mount(FormHarness, {
    props: {
      src: fixtureUrl('form-fields'),
      assets,
      swapTo: { src: `${fixtureUrl('form-fields')}?again` },
    },
  })
  const button = () => widget(page, 'sig').locator('[data-ink-sign-field]')
  const menu = page.locator('[data-ink-sign-field-menu="sig"]')
  await button().scrollIntoViewIfNeeded()
  await button().click()
  await menu.getByRole('menuitem', { name: 'Create signature' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create signature' })
  await expect(dialog).toBeVisible()
  // A click event without a press, so the dialog does not close as for a press outside it.
  await page.getByTestId('swap').dispatchEvent('click')
  await expect(dialog).toBeHidden()
  // The new document's field opens its own menu, and nothing from before signs it.
  await expect(button()).toHaveText('Sign')
  await button().scrollIntoViewIfNeeded()
  await button().click()
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  expect(await formValues(page)).not.toHaveProperty('sig')
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

test('uncontrolled fields never emit update:fields', async ({ mount, page }) => {
  const changes: unknown[] = []
  await mount(FormHarness, {
    props: { src: fixtureUrl('form-fields'), assets },
    on: { changed: (_next: unknown, change: unknown) => changes.push(change) },
  })
  const input = widget(page, 'name').locator('input')
  await input.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Grace')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('form')).toHaveAttribute('data-values', /"name":"Grace"/)
  await page.getByTestId('form-set').click()
  await expect(input).toHaveValue('Set')
  await page.getByTestId('form-reset').click()
  await expect(input).not.toHaveValue('Set')
  await page.locator('[data-ink-toolbar] [data-ink-undo]').click()
  await expect(input).toHaveValue('Set')
  await page.waitForTimeout(100)
  expect(changes).toEqual([])
  await expect(page.getByTestId('host-fields')).toHaveAttribute('data-heard', '0')
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

test('a formHighlight change applies in place', async ({ mount, page }) => {
  const props = { src: fixtureUrl('form-fields'), assets }
  const c = await mount(FormHarness, { props: { ...props, formHighlight: false } })
  const layer = page.locator('[data-ink-form-layer]').first()
  await expect(layer).toHaveAttribute('data-ink-form-highlight', 'off')
  // Marks the layer, so a rebuilt one would show.
  await layer.evaluate((el) => el.setAttribute('data-test-mark', ''))
  await c.update({ props: { ...props, formHighlight: true } })
  await expect(layer).toHaveAttribute('data-ink-form-highlight', 'on')
  await expect(layer).toHaveAttribute('data-test-mark', '')
  await c.update({ props: { ...props, formHighlight: false } })
  await expect(layer).toHaveAttribute('data-ink-form-highlight', 'off')
})
