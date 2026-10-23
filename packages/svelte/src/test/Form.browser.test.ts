import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { describe, expect, it } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { attr, count, focused, q, sleep } from './dom.js'
import FormHarness, { type FormHarnessProps } from './harness/FormHarness.svelte'

const assets = browserAssets()
const guard = guardConsole()

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAYAAAAb4BS0AAAADklEQVR4nGP4z8DwH4YBJuYF+2EsXwgAAAAASUVORK5CYII='
const IMAGE = { id: 'sig-img', kind: 'image' as const, imagedata: PNG, aspect: 3 }

const harness = (props: Omit<FormHarnessProps, 'assets'>) =>
  render(FormHarness, { assets, ...props })
const loc = (el: Element) => browserPage.elementLocator(el)
const readJson = (text: string | null): Record<string, unknown> =>
  JSON.parse(text ?? '{}') as Record<string, unknown>
const widget = (field: string) => q(`[data-ink-form-layer] [data-ink-field="${field}"]`)
const input = async (field: string) =>
  (await widget(field)).querySelector<HTMLInputElement>('input')!
const button = async (field: string) =>
  (await widget(field)).querySelector<HTMLButtonElement>('button')!
const signButton = () =>
  q<HTMLButtonElement>(
    '[data-ink-form-layer] [data-ink-field="sig"] [data-ink-sign-field]'
  )
const SIGN_MENU = '[data-ink-sign-field-menu="sig"]'
const ALERT = '[data-ink-form-alert]'
const DIALOG = '[data-ink-signature-dialog]'
const SCROLL = '[data-ink-scroll]'
const hostValues = () => readJson(attr('[data-testid="host-fields"]', 'data-values')())
const heard = attr('[data-testid="host-fields"]', 'data-heard')
const formValues = () => readJson(attr('[data-testid="form"]', 'data-values')())
const probe = (name: string) => attr('[data-testid="probe"]', name)
const testButton = (id: string) => q<HTMLButtonElement>(`[data-testid="${id}"]`)
const valueOf = (el: HTMLInputElement) => () => el.value

/** Opens the field's menu with a real click, once the field has scrolled into view. */
async function openSignMenu(): Promise<HTMLElement> {
  const b = await signButton()
  b.scrollIntoView({ block: 'center' })
  await loc(b).click()
  return q(SIGN_MENU)
}

/** Draws a stroke on the open "Create signature" dialog's pad. */
async function drawOnPad(): Promise<void> {
  const pad = await q('[data-ink-signature-pad]')
  const r = pad.getBoundingClientRect()
  const at = (type: string, x: number, y: number) =>
    pad.dispatchEvent(
      new PointerEvent(type, {
        clientX: r.left + x,
        clientY: r.top + y,
        bubbles: true,
        pointerId: 3,
        buttons: type === 'pointerup' ? 0 : 1,
        isPrimary: true,
      })
    )
  at('pointerdown', 20, 60)
  at('pointermove', 80, 20)
  at('pointermove', 160, 70)
  at('pointerup', 160, 70)
}

/** Types into a field and commits it with Enter. */
async function commit(field: string, text: string, { replace = true } = {}) {
  const el = await input(field)
  await loc(el).click()
  await userEvent.keyboard(replace ? '{ControlOrMeta>}a{/ControlOrMeta}' : '{End}')
  await userEvent.keyboard(text)
  await userEvent.keyboard('{Enter}')
  return el
}

describe('form filling', () => {
  it('bind:fields receives committed values', async () => {
    const changes: unknown[] = []
    await harness({
      src: fixtureUrl('form-fields'),
      controlled: true,
      initial: { name: 'Ada' },
      onChanged: (_next, change) => changes.push(change),
    })
    const el = await input('name')
    await expect.poll(valueOf(el)).toBe('Ada')
    await loc(el).click()
    await userEvent.keyboard('{End}x')
    // Keystrokes stay local; only the commit reaches the host.
    expect(heard()).toBe('0')
    await userEvent.keyboard('{Enter}')
    await expect.poll(heard).toBe('1')
    expect(hostValues()).toMatchObject({ name: 'Adax' })
    expect(changes).toEqual([{ kind: 'commit', names: ['name'] }])
    // The host's echo of what it heard reports nothing more.
    await expect.poll(() => formValues().name).toBe('Adax')
    await sleep(100)
    expect(heard()).toBe('1')
  })

  it('a host push updates the field', async () => {
    await harness({
      src: fixtureUrl('form-fields'),
      controlled: true,
      initial: { name: 'Ada' },
      push: { name: 'Pushed' },
    })
    const el = await input('name')
    await expect.poll(valueOf(el)).toBe('Ada')
    await loc(await testButton('push')).click()
    await expect.poll(valueOf(el)).toBe('Pushed')
    expect(formValues()).toMatchObject({ name: 'Pushed' })
    // The push is the host's own: it is not reported back.
    await sleep(100)
    expect(heard()).toBe('0')
  })

  it('onformaction receives submit', async () => {
    const actions: unknown[] = []
    await harness({
      src: fixtureUrl('form-scripted'),
      onformaction: (a) => actions.push(a),
    })
    await loc(await button('send')).click()
    await expect.poll(() => actions.length).toBe(1)
    expect(actions[0]).toMatchObject({
      kind: 'submit',
      url: 'https://example.com/xfdf',
      format: 'xfdf',
    })
  })

  it('a script alert shows the dialog', async () => {
    await harness({ src: fixtureUrl('form-scripted') })
    const hello = await button('hello')
    hello.focus()
    await loc(hello).click()
    const alert = browserPage.getByRole('alertdialog', { name: 'Message' })
    await expect.element(alert).toBeVisible()
    const el = await q(ALERT)
    expect(el.parentElement).toBe(document.body)
    expect(el.querySelector('[data-ink-form-alert-message]')?.textContent).toBe('Hello')
    await expect.element(alert).toHaveAccessibleDescription('Hello')
    // Non-blocking: no overlay, not modal.
    expect(count('[data-ink-dialog-overlay]')()).toBe(0)
    expect(el.getAttribute('aria-modal')).not.toBe('true')
    const ok = alert.getByRole('button', { name: 'OK' })
    await expect.poll(focused).toBe(ok.element())
    await ok.click()
    await expect.poll(count(ALERT)).toBe(0)
    await expect.poll(focused).toBe(hello)
    // Escape in the alert closes it too.
    await loc(hello).click()
    await expect.element(alert).toBeVisible()
    await expect.poll(focused).toBe(ok.element())
    await userEvent.keyboard('{Escape}')
    await expect.poll(count(ALERT)).toBe(0)
    await expect.poll(focused).toBe(hello)
    // Escape anywhere else is the viewer's: the alert stays, and the key is not taken.
    await loc(hello).click()
    await expect.element(alert).toBeVisible()
    const scroll = await q(SCROLL)
    scroll.focus()
    const seen = new Promise<boolean>((resolve) =>
      window.addEventListener('keydown', (e) => resolve(e.defaultPrevented), {
        once: true,
      })
    )
    scroll.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    expect(await seen).toBe(false)
    await sleep(50)
    expect(count(ALERT)()).toBe(1)
    // A press outside leaves it open.
    await loc(document.body).click({ position: { x: 5, y: 5 } })
    await sleep(50)
    expect(count(ALERT)()).toBe(1)
  })

  it('a form script error reaches onError', async () => {
    const errors: { code: string }[] = []
    await harness({ src: fixtureUrl('form-scripted'), onError: (e) => errors.push(e) })
    await widget('hello')
    const root = await q<HTMLElement & { __inkDocument?: unknown }>('[data-ink-root]')
    const doc = root.__inkDocument as { form: { _error(e: unknown): void } }
    doc.form._error({ code: 'FormScriptError', message: 'A form script failed' })
    await expect.poll(() => errors.map((e) => e.code)).toEqual(['FormScriptError'])
  })

  it('an error from while the document opened reaches onError after onReady', async () => {
    const heard: string[] = []
    await render(FormHarness, {
      assets: { ...assets, wasm: '/missing/' },
      src: fixtureUrl('form-scripted'),
      onReady: () => heard.push('ready'),
      onError: (e) => heard.push(e.code),
    })
    await expect.poll(() => heard).toEqual(['ready', 'FormScriptError'])
    guard.clear()
  })

  it('a sandbox that fails while the document opens reaches onError', async () => {
    const errors: { code: string }[] = []
    // Without the sandbox's engine, the scripts cannot start.
    await render(FormHarness, {
      assets: { ...assets, wasm: '/missing/' },
      src: fixtureUrl('form-scripted'),
      onError: (e) => errors.push(e),
    })
    await widget('hello')
    await expect.poll(() => errors.map((e) => e.code)).toEqual(['FormScriptError'])
    guard.clear()
  })

  describe('signature fields', () => {
    it('clicking a signature field opens the popover and signs', async () => {
      await harness({ src: fixtureUrl('form-fields'), templates: [IMAGE] })
      const b = await signButton()
      expect(b.textContent).toBe('Sign')
      await expect.element(loc(b)).toHaveAccessibleName('Sign this field: sig')
      const menu = await openSignMenu()
      await expect.element(loc(menu)).toBeVisible()
      expect(menu.getAttribute('data-ink-menu')).toBe('signature')
      expect(menu.getAttribute('data-ink-select-content')).toBe('')
      expect(menu.getAttribute('role')).toBe('menu')
      await expect.element(loc(menu)).toHaveAccessibleName('Signatures')
      // Anchored to the field's box: just below or above it, from its left edge.
      const box = (await widget('sig')).getBoundingClientRect()
      await expect
        .poll(() => Math.abs(menu.getBoundingClientRect().x - Math.max(8, box.x)))
        .toBeLessThanOrEqual(1)
      const m = menu.getBoundingClientRect()
      expect(m.y >= box.bottom - 1 || m.bottom <= box.y + 1).toBe(true)
      const item = loc(menu).getByRole('menuitemradio', { name: 'Signature 1' })
      await expect.poll(focused).toBe(item.element())
      await item.click()
      await expect.poll(count(SIGN_MENU)).toBe(0)
      await expect.poll(() => b.hasAttribute('data-ink-signed')).toBe(true)
      expect(b.textContent).toBe('')
      await expect.poll(focused).toBe(b)
      const id = (formValues().sig as { signature: string }).signature
      expect(typeof id).toBe('string')
      await expect.poll(probe('data-annotations')).toBe('1')
      await expect.poll(attr(`[data-annotation="${id}"]`, 'data-ink-pinned')).toBe('')
      // The tool stays where it was: signing a field is not picking the signature tool.
      expect(probe('data-tool')()).toBe('select-text')
      // A signed field asks nothing more.
      b.focus()
      await userEvent.keyboard('{Enter}')
      await sleep(100)
      expect(count(SIGN_MENU)()).toBe(0)
    })

    it('pressing Sign while its menu is open closes the menu', async () => {
      await harness({ src: fixtureUrl('form-fields'), templates: [IMAGE] })
      await openSignMenu()
      const b = await signButton()
      // Count the menus that open from here on: closing and opening again would add one.
      let opened = 0
      const observer = new MutationObserver((records) => {
        for (const r of records)
          for (const n of r.addedNodes)
            if (
              n instanceof HTMLElement &&
              (n.matches(SIGN_MENU) || n.querySelector(SIGN_MENU))
            )
              opened += 1
      })
      observer.observe(document.body, { childList: true, subtree: true })
      try {
        await loc(b).click()
        await expect.poll(count(SIGN_MENU)).toBe(0)
        await sleep(200)
        expect(count(SIGN_MENU)()).toBe(0)
        expect(opened).toBe(0)
      } finally {
        observer.disconnect()
      }
      await expect.poll(focused).toBe(b)
      // And it opens again on the next press.
      await loc(b).click()
      await expect.poll(count(SIGN_MENU)).toBe(1)
    })

    it('a signature created from the popover signs the field', async () => {
      await harness({ src: fixtureUrl('form-fields') })
      const menu = await openSignMenu()
      await loc(menu).getByRole('menuitem', { name: 'Create signature' }).click()
      await expect.poll(count(SIGN_MENU)).toBe(0)
      const dialog = browserPage.getByRole('dialog', { name: 'Create signature' })
      await expect.element(dialog).toBeVisible()
      await drawOnPad()
      const save = dialog.getByRole('button', { name: 'Save' })
      await expect.element(save).toBeEnabled()
      await save.click()
      await expect.poll(count(DIALOG)).toBe(0)
      const b = await signButton()
      await expect.poll(() => b.hasAttribute('data-ink-signed')).toBe(true)
      await expect.poll(focused).toBe(b)
      expect(probe('data-tool')()).toBe('select-text')
      await expect.poll(probe('data-annotations')).toBe('1')
    })

    it('closes when its page unmounts', async () => {
      await harness({ src: fixtureUrl('form-fields'), templates: [IMAGE] })
      await openSignMenu()
      // A rebuild unmounts every page; the menu's anchor goes with its page.
      ;(await testButton('regap')).click()
      await expect.poll(count(SIGN_MENU)).toBe(0)
      // The new page's field opens a menu of its own.
      await openSignMenu()
      await expect.poll(count(SIGN_MENU)).toBe(1)
    })

    it('closes when its field box leaves the page for any reason', async () => {
      await harness({ src: fixtureUrl('form-fields'), templates: [IMAGE] })
      await openSignMenu()
      // Not a page unmount: only the box goes.
      ;(await widget('sig')).remove()
      await expect.poll(count(SIGN_MENU)).toBe(0)
    })

    it('returns focus to the field that replaced the open one', async () => {
      await harness({ src: fixtureUrl('form-fields'), templates: [IMAGE] })
      await openSignMenu()
      const other = await q<HTMLButtonElement>(
        '[data-ink-form-layer] [data-ink-field="sig2"] [data-ink-sign-field]'
      )
      // A click with no press first: the open menu sees nothing outside it, and the request
      // is replaced while it stays open.
      other.click()
      const menu = await q('[data-ink-sign-field-menu="sig2"]')
      menu.querySelector<HTMLElement>('[role="menuitem"]')!.focus()
      await userEvent.keyboard('{Escape}')
      await expect.poll(count('[data-ink-sign-field-menu]')).toBe(0)
      await expect.poll(focused).toBe(other)
    })
  })

  it('useForm exposes values', async () => {
    await harness({ src: fixtureUrl('form-fields') })
    await expect.poll(attr('[data-testid="form"]', 'data-fields')).not.toBe('0')
    const el = await commit('name', 'Grace')
    await expect.poll(() => formValues().name).toBe('Grace')
    await loc(await testButton('form-set')).click()
    await expect.poll(valueOf(el)).toBe('Set')
    expect(readJson(attr('[data-testid="form"]', 'data-result')())).toEqual({
      applied: ['name'],
      rejected: [],
    })
    await loc(await testButton('form-reset')).click()
    await expect.poll(() => formValues().name).not.toBe('Set')
    await expect.poll(valueOf(el)).not.toBe('Set')
  })

  it("uncontrolled fields undo with the toolbar's undo", async () => {
    await harness({ src: fixtureUrl('form-fields') })
    const el = await input('name')
    const before = el.value
    const undo = await q<HTMLButtonElement>('[data-ink-toolbar] [data-ink-undo]')
    expect(undo.disabled).toBe(true)
    await commit('name', 'Grace')
    await expect.poll(() => formValues().name).toBe('Grace')
    await expect.poll(() => undo.disabled).toBe(false)
    await loc(undo).click()
    await expect.poll(valueOf(el)).toBe(before)
    expect(formValues().name).not.toBe('Grace')
  })

  it('formHighlight false turns the tint off', async () => {
    await harness({ src: fixtureUrl('form-fields'), formHighlight: false })
    await expect
      .poll(attr('[data-ink-form-layer]', 'data-ink-form-highlight'))
      .toBe('off')
  })

  it('a formHighlight change applies in place', async () => {
    const screen = await harness({ src: fixtureUrl('form-fields'), formHighlight: false })
    const layer = await q('[data-ink-form-layer]')
    await expect.poll(() => layer.dataset.inkFormHighlight).toBe('off')
    await screen.rerender({ formHighlight: true })
    await expect.poll(() => layer.dataset.inkFormHighlight).toBe('on')
    // The same layer: no new document or build.
    expect(document.querySelector('[data-ink-form-layer]')).toBe(layer)
    await screen.rerender({ formHighlight: false })
    await expect.poll(() => layer.dataset.inkFormHighlight).toBe('off')
  })

  describe('a new source', () => {
    it('resets bound values to the new initial and closes the field menu', async () => {
      await harness({
        src: fixtureUrl('form-fields'),
        controlled: true,
        initial: { name: 'Ada' },
        swapTo: { src: `${fixtureUrl('form-fields')}?again`, initial: { name: 'Bea' } },
        templates: [IMAGE],
      })
      const el = await input('name')
      await expect.poll(valueOf(el)).toBe('Ada')
      await commit('name', 'x', { replace: false })
      await expect.poll(heard).toBe('1')
      await openSignMenu()
      // A click event without a press, so the menu does not close as for a press outside it.
      ;(await testButton('swap')).click()
      await expect.poll(count(SIGN_MENU)).toBe(0)
      await expect.poll(async () => (await input('name')).value).toBe('Bea')
      await expect.poll(() => formValues().name).toBe('Bea')
      expect(hostValues()).toEqual({ name: 'Bea' })
      // Opening the new document reports nothing.
      await sleep(100)
      expect(heard()).toBe('1')
    })

    it('closes a "Create signature" dialog opened for the old field', async () => {
      await harness({
        src: fixtureUrl('form-fields'),
        swapTo: { src: `${fixtureUrl('form-fields')}?again` },
      })
      const menu = await openSignMenu()
      await loc(menu).getByRole('menuitem', { name: 'Create signature' }).click()
      await expect.poll(count(DIALOG)).toBe(1)
      ;(await testButton('swap')).click()
      await expect.poll(count(DIALOG)).toBe(0)
      // The new document's field opens its own menu, and nothing from before signs it.
      await expect.poll(async () => (await signButton()).textContent).toBe('Sign')
      await openSignMenu()
      await expect.poll(count(SIGN_MENU)).toBe(1)
      await userEvent.keyboard('{Escape}')
      await expect.poll(count(SIGN_MENU)).toBe(0)
      expect(formValues()).not.toHaveProperty('sig')
    })

    it('closes an open script alert', async () => {
      await harness({
        src: fixtureUrl('form-scripted'),
        swapTo: { src: `${fixtureUrl('form-scripted')}?again` },
      })
      await loc(await button('hello')).click()
      await expect.poll(count(ALERT)).toBe(1)
      ;(await testButton('swap')).click()
      await expect.poll(count(ALERT)).toBe(0)
      await widget('hello')
    })
  })
})
