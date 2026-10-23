import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-react'

import { guardConsole } from '../../playwright/console-guard'
import { FormHarness, StrictFormHost } from '../../playwright/harness/FormHarness'

import type { FormHarnessProps } from '../../playwright/harness/FormHarness'
import type { Locator, Page } from '@playwright/test'

const assets = browserAssets()
const harness = (props: Omit<FormHarnessProps, 'assets'>) => (
  <FormHarness assets={assets} {...props} />
)
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
const signMenu = (page: Page) => page.locator('[data-ink-sign-field-menu="sig"]')
const signButton = (page: Page) => widget(page, 'sig').locator('[data-ink-sign-field]')

test('onFieldsChange receives committed values', async ({ mount, page }) => {
  const changes: unknown[] = []
  await mount(
    harness({
      src: fixtureUrl('form-fields'),
      controlled: true,
      initial: { name: 'Ada' },
      onChanged: (_next, change) => changes.push(change),
    })
  )
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
  await expect.poll(() => changes).toEqual([{ kind: 'commit', names: ['name'] }])
  // The host's echo of what it heard reports nothing more.
  await expect(page.getByTestId('form')).toHaveAttribute('data-values', /"name":"Adax"/)
  await page.waitForTimeout(100)
  await expect(page.getByTestId('host-fields')).toHaveAttribute('data-heard', '1')
})

test('a host push updates the field', async ({ mount, page }) => {
  await mount(
    harness({
      src: fixtureUrl('form-fields'),
      controlled: true,
      initial: { name: 'Ada' },
      push: { name: 'Pushed' },
    })
  )
  const input = widget(page, 'name').locator('input')
  await expect(input).toHaveValue('Ada')
  await page.getByTestId('push').click()
  await expect(input).toHaveValue('Pushed')
  expect(await formValues(page)).toMatchObject({ name: 'Pushed' })
  // The push is the host's own: it is not reported back.
  await page.waitForTimeout(100)
  await expect(page.getByTestId('host-fields')).toHaveAttribute('data-heard', '0')
})

test('onFormAction receives submit', async ({ mount, page }) => {
  const actions: unknown[] = []
  await mount(
    harness({ src: fixtureUrl('form-scripted'), onFormAction: (a) => actions.push(a) })
  )
  await widget(page, 'send').locator('button').click()
  await expect.poll(() => actions.length).toBe(1)
  expect(actions[0]).toMatchObject({
    kind: 'submit',
    url: 'https://example.com/xfdf',
    format: 'xfdf',
  })
})

test('a script alert shows the dialog', async ({ mount, page }) => {
  await mount(harness({ src: fixtureUrl('form-scripted') }))
  const hello = widget(page, 'hello').locator('button')
  await hello.focus()
  await hello.click()
  const alert = page.getByRole('alertdialog', { name: 'Message' })
  await expect(alert).toBeVisible()
  await expect(alert).toHaveAttribute('data-ink-form-alert', '')
  await expect(alert.locator('[data-ink-form-alert-message]')).toHaveText('Hello')
  await expect(alert).toHaveAccessibleDescription('Hello')
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
  await expect(hello).toBeFocused()
  // Escape anywhere else is the viewer's: the alert stays, and the key is not taken.
  await hello.click()
  await expect(alert).toBeVisible()
  await page.locator('[data-ink-scroll]').focus()
  const prevented = await page.evaluate(() => {
    const seen = new Promise<boolean>((resolve) =>
      window.addEventListener('keydown', (e) => resolve(e.defaultPrevented), {
        once: true,
      })
    )
    document
      .querySelector('[data-ink-scroll]')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
    return seen
  })
  expect(prevented).toBe(false)
  await expect(alert).toBeVisible()
  // A press outside leaves it open.
  await page.mouse.click(5, 5)
  await expect(alert).toBeVisible()
})

test('a value a validator refuses with an alert stays as typed', async ({
  mount,
  page,
}) => {
  await mount(harness({ src: fixtureUrl('form-range') }))
  const score = widget(page, 'score').locator('input')
  await score.click()
  await page.keyboard.type('50')
  await page.keyboard.press('Enter')
  const alert = page.getByRole('alertdialog', { name: 'Message' })
  await expect(alert).toBeVisible()
  await expect(score).toHaveValue('50')
  await page.keyboard.press('Escape')
  await expect(alert).toBeHidden()
  await expect(score).toBeFocused()
  await expect(score).toHaveValue('50')
  await expect(score).toHaveAttribute('aria-invalid', 'true')
  // Leaving drops the refused text without validating it again.
  await widget(page, 'note').locator('input').click()
  await expect(score).toHaveValue('')
  await page.waitForTimeout(200)
  await expect(alert).toBeHidden()
  // Corrected, it commits.
  await score.click()
  await page.keyboard.type('7')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('form')).toHaveAttribute('data-values', /"score":"7"/)
})

test('a form script error reaches onError', async ({ mount, page }) => {
  const errors: { code: string }[] = []
  await mount(
    harness({ src: fixtureUrl('form-scripted'), onError: (e) => errors.push(e) })
  )
  await expect(widget(page, 'hello')).toBeVisible()
  await page.locator('[data-ink-root]').evaluate((el) => {
    const doc = (
      el as HTMLElement & { __inkDocument?: { form: { _error(e: unknown): void } } }
    ).__inkDocument!
    doc.form._error({ code: 'FormScriptError', message: 'A form script failed' })
  })
  await expect.poll(() => errors.map((e) => e.code)).toEqual(['FormScriptError'])
})

test('a sandbox that fails while the document opens reaches onError', async ({
  mount,
  page,
}) => {
  // The error crosses to the test as a plain `Error`, so its message stands for its code.
  const errors: string[] = []
  // Without the sandbox's engine, the scripts cannot start.
  await mount(
    <FormHarness
      assets={{ ...assets, wasm: '/missing/' }}
      src={fixtureUrl('form-scripted')}
      onError={(e) => errors.push(e.message)}
    />
  )
  await expect(widget(page, 'hello')).toBeVisible()
  await expect
    .poll(() => errors)
    .toEqual(["The form's scripts could not start; it can still be filled in"])
  guard.clear()
})

test.describe('signature fields', () => {
  test('clicking a signature field opens the popover and signs', async ({
    mount,
    page,
  }) => {
    await mount(harness({ src: fixtureUrl('form-fields'), templates: [IMAGE] }))
    const button = signButton(page)
    const menu = signMenu(page)
    await button.scrollIntoViewIfNeeded()
    await expect(button).toHaveText('Sign')
    await expect(button).toHaveAccessibleName('Sign this field: sig')
    await button.click()
    await expect(menu).toBeVisible()
    await expect(menu).toHaveAttribute('data-ink-menu', 'signature')
    await expect(menu).toHaveAttribute('data-ink-select-content', '')
    await expect(menu).toHaveRole('menu')
    await expect(menu).toHaveAccessibleName('Signatures')
    // Anchored to the field's box: just below or above it, from its left edge.
    const b = (await widget(page, 'sig').boundingBox())!
    const m = (await menu.boundingBox())!
    expect(Math.abs(m.x - Math.max(8, b.x))).toBeLessThanOrEqual(1)
    expect(m.y >= b.y + b.height - 1 || m.y + m.height <= b.y + 1).toBe(true)
    const item = menu.getByRole('menuitemradio', { name: 'Signature 1' })
    await expect(item).toBeFocused()
    await item.click()
    await expect(menu).toBeHidden()
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
    await expect(menu).toBeHidden()
  })

  test('pressing Sign while its menu is open closes the menu', async ({
    mount,
    page,
  }) => {
    await mount(harness({ src: fixtureUrl('form-fields'), templates: [IMAGE] }))
    const button = signButton(page)
    const menu = signMenu(page)
    await button.scrollIntoViewIfNeeded()
    await button.click()
    await expect(menu).toBeVisible()
    // Count the menus that open from here on: closing and opening again would add one.
    await page.evaluate(() => {
      const w = window as Window & { __menusOpened?: number }
      w.__menusOpened = 0
      new MutationObserver((records) => {
        for (const r of records)
          for (const n of r.addedNodes)
            if (n instanceof HTMLElement && n.querySelector('[data-ink-sign-field-menu]'))
              w.__menusOpened! += 1
      }).observe(document.body, { childList: true })
    })
    await button.click()
    await expect(menu).toBeHidden()
    await page.waitForTimeout(200)
    await expect(menu).toBeHidden()
    expect(
      await page.evaluate(
        () => (window as Window & { __menusOpened?: number }).__menusOpened
      )
    ).toBe(0)
    await expect(button).toBeFocused()
    // And it opens again on the next press.
    await button.click()
    await expect(menu).toBeVisible()
  })

  test('a signature created from the popover signs the field', async ({
    mount,
    page,
  }) => {
    await mount(harness({ src: fixtureUrl('form-fields') }))
    const button = signButton(page)
    const menu = signMenu(page)
    await button.scrollIntoViewIfNeeded()
    await button.click()
    await menu.getByRole('menuitem', { name: 'Create signature' }).click()
    await expect(menu).toBeHidden()
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
  await mount(harness({ src: fixtureUrl('form-fields') }))
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
  await mount(harness({ src: fixtureUrl('form-fields') }))
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
  await mount(harness({ src: fixtureUrl('form-fields'), formHighlight: false }))
  await expect(page.locator('[data-ink-form-layer]').first()).toHaveAttribute(
    'data-ink-form-highlight',
    'off'
  )
})

test('a formHighlight change applies in place', async ({ mount, page }) => {
  const src = fixtureUrl('form-fields')
  const c = await mount(harness({ src, formHighlight: false }))
  const layer = page.locator('[data-ink-form-layer]').first()
  await expect(layer).toHaveAttribute('data-ink-form-highlight', 'off')
  // Marks the layer, so a rebuilt one would show.
  await layer.evaluate((el) => el.setAttribute('data-test-mark', ''))
  await c.update(harness({ src, formHighlight: true }))
  await expect(layer).toHaveAttribute('data-ink-form-highlight', 'on')
  await expect(layer).toHaveAttribute('data-test-mark', '')
  await c.update(harness({ src, formHighlight: false }))
  await expect(layer).toHaveAttribute('data-ink-form-highlight', 'off')
})

test.describe('a new source', () => {
  test('resets controlled values to the new initial and closes the field menu', async ({
    mount,
    page,
  }) => {
    await mount(
      harness({
        src: fixtureUrl('form-fields'),
        controlled: true,
        initial: { name: 'Ada' },
        swapTo: { src: `${fixtureUrl('form-fields')}?again`, initial: { name: 'Bea' } },
        templates: [IMAGE],
      })
    )
    const input = widget(page, 'name').locator('input')
    await expect(input).toHaveValue('Ada')
    await input.click()
    await page.keyboard.press('End')
    await page.keyboard.type('x')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('host-fields')).toHaveAttribute('data-heard', '1')
    await signButton(page).scrollIntoViewIfNeeded()
    await signButton(page).click()
    await expect(signMenu(page)).toBeVisible()
    // A click event without a press, so the menu does not close as for a press outside it.
    await page.getByTestId('swap').dispatchEvent('click')
    await expect(signMenu(page)).toBeHidden()
    await expect(input).toHaveValue('Bea')
    await expect(page.getByTestId('form')).toHaveAttribute('data-values', /"name":"Bea"/)
    expect(await hostValues(page)).toEqual({ name: 'Bea' })
    // Opening the new document reports nothing.
    await page.waitForTimeout(100)
    await expect(page.getByTestId('host-fields')).toHaveAttribute('data-heard', '1')
  })

  test('closes a "Create signature" dialog opened for the old field', async ({
    mount,
    page,
  }) => {
    await mount(
      harness({
        src: fixtureUrl('form-fields'),
        swapTo: { src: `${fixtureUrl('form-fields')}?again` },
      })
    )
    await signButton(page).scrollIntoViewIfNeeded()
    await signButton(page).click()
    await signMenu(page).getByRole('menuitem', { name: 'Create signature' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create signature' })
    await expect(dialog).toBeVisible()
    await page.getByTestId('swap').dispatchEvent('click')
    await expect(dialog).toBeHidden()
    // The new document's field opens its own menu, and nothing from before signs it.
    await expect(signButton(page)).toHaveText('Sign')
    await signButton(page).scrollIntoViewIfNeeded()
    await signButton(page).click()
    await expect(signMenu(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(signMenu(page)).toBeHidden()
    expect(await formValues(page)).not.toHaveProperty('sig')
  })

  test('closes an open script alert', async ({ mount, page }) => {
    await mount(
      harness({
        src: fixtureUrl('form-scripted'),
        swapTo: { src: `${fixtureUrl('form-scripted')}?again` },
      })
    )
    await widget(page, 'hello').locator('button').click()
    const alert = page.getByRole('alertdialog', { name: 'Message' })
    await expect(alert).toBeVisible()
    await page.getByTestId('swap').dispatchEvent('click')
    await expect(alert).toBeHidden()
    await expect(widget(page, 'hello')).toBeVisible()
  })
})

test('StrictMode does not create two sandboxes', async ({ mount, page }) => {
  // Each sandbox fetches the QuickJS engine (served uncached): one fetch, one sandbox.
  let sandboxes = 0
  await page.route('**/quickjs-eval.wasm', async (route) => {
    sandboxes++
    await route.continue()
  })
  const cmp = await mount(
    <StrictFormHost src={fixtureUrl('form-scripted')} assets={assets} />
  )
  await expect(cmp.locator('[data-ink-root]')).toHaveAttribute('data-state', 'ready')
  await expect(widget(page, 'hello')).toBeVisible()
  await expect.poll(() => sandboxes).toBe(1)
  await page.waitForTimeout(300)
  expect(sandboxes).toBe(1)
  // The one sandbox is live: its alert reaches the page.
  await widget(page, 'hello').locator('button').click()
  await expect(page.getByRole('alertdialog', { name: 'Message' })).toBeVisible()
})
