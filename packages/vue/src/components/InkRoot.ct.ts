import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import ControlledHost from '../../playwright/harness/ControlledHost.vue'
import EventHost from '../../playwright/harness/EventHost.vue'
import PasswordHarness from '../../playwright/harness/PasswordHarness.vue'
import PluginHarness from '../../playwright/harness/PluginHarness.vue'
import ToolbarHarness from '../../playwright/harness/ToolbarHarness.vue'
import ToolSetHarness from '../../playwright/harness/ToolSetHarness.vue'
import UncontrolledHost from '../../playwright/harness/UncontrolledHost.vue'

import InkRoot from './InkRoot.vue'

import type { Annotation } from '@inkbar/core'
import type { Page } from '@playwright/test'

const assets = browserAssets()

type DocHandle = {
  annotations: {
    add(i: unknown): void
    list: { get(): unknown[] }
  }
  history: { canUndo: { get(): boolean } }
}
type RootEl = HTMLElement & { __inkDocument?: DocHandle & { __marker?: number } }

test('emits ready with page count and reflects state on the root element', async ({
  mount,
}) => {
  const events: string[] = []
  const cmp = await mount(InkRoot, {
    props: { src: fixtureUrl('text-simple'), assets },
    on: { ready: () => events.push('ready'), error: () => events.push('error') },
  })
  await expect(cmp).toHaveAttribute('data-ink-root', '')
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  expect(events).toEqual(['ready'])
})

test('is loading from the moment the document starts opening', async ({
  mount,
  page,
}) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/fixtures/text-simple.pdf', async (route) => {
    await gate
    await route.continue()
  })
  const cmp = await mount(InkRoot, { props: { src: fixtureUrl('text-simple'), assets } })
  await expect(cmp).toHaveAttribute('data-state', 'loading')
  release()
  await expect(cmp).toHaveAttribute('data-state', 'ready')
})

test('stays idle without a source', async ({ mount }) => {
  const cmp = await mount(InkRoot, { props: { src: null, assets } })
  await expect(cmp).toHaveAttribute('data-state', 'idle')
  // The harness stylesheet bounds #root, so scroll tests have a container to scroll.
  await expect(cmp.page().locator('#root')).toHaveCSS('height', '900px')
})

test('emits error with the code for an encrypted file and opens with the password', async ({
  mount,
}) => {
  const cmp = await mount(EventHost, {
    props: { src: fixtureUrl('encrypted-aes'), assets, passwordPrompt: false },
  })
  await expect(cmp).toHaveAttribute('data-state', 'error')
  await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
  await cmp.update({
    props: {
      src: fixtureUrl('encrypted-aes'),
      assets,
      password: 'inkbar',
      passwordPrompt: false,
    },
  })
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
})

test('retries a byte source with a password: wrong, then right, with the host bytes intact', async ({
  mount,
  page,
}) => {
  const size = await page.evaluate(
    async (url) => (await (await fetch(url)).arrayBuffer()).byteLength,
    fixtureUrl('encrypted-aes')
  )
  const props = {
    src: null,
    assets,
    bytesFrom: fixtureUrl('encrypted-aes'),
    passwordPrompt: false,
  }
  const cmp = await mount(EventHost, { props: { ...props, password: 'wrong' } })
  await expect(cmp).toHaveAttribute('data-state', 'error')
  await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
  await expect(cmp.getByTestId('byte-length')).toHaveText(String(size))
  await cmp.update({ props: { ...props, password: 'inkbar' } })
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
  await expect(cmp.getByTestId('byte-length')).toHaveText(String(size))
})

test.describe('locked files', () => {
  const encrypted = fixtureUrl('encrypted-aes')
  const dialog = (page: Page) => page.locator('[data-ink-password-dialog]')
  const field = (page: Page) => dialog(page).locator('.ink-password-input')
  const enter = async (page: Page, password: string): Promise<void> => {
    await field(page).fill(password)
    await field(page).press('Enter')
  }

  test('a locked file prompts instead of erroring', async ({ mount, page }) => {
    const cmp = await mount(PasswordHarness, { props: { src: encrypted, assets } })
    await expect(cmp).toHaveAttribute('data-state', 'locked')
    await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
    await expect(dialog(page)).toBeVisible()
    await expect(field(page)).toBeFocused()
    await expect(dialog(page).locator('.ink-password-error')).toHaveCount(0)
    await expect(page.locator('.ink-error')).toHaveCount(0)
    await expect(page.locator('[data-ink-viewport-root]')).toHaveAttribute(
      'data-state',
      'locked'
    )
  })

  test('the right password opens it', async ({ mount, page }) => {
    const cmp = await mount(PasswordHarness, { props: { src: encrypted, assets } })
    await expect(dialog(page)).toBeVisible()
    await enter(page, 'inkbar')
    await expect(cmp).toHaveAttribute('data-state', 'ready')
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('.ink-locked')).toHaveCount(0)
    await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
    // The unlock button and the dialog are gone: the document has focus.
    await expect(page.locator('[data-ink-scroll]')).toBeFocused()
  })

  test('a wrong password keeps the dialog open and is announced each time', async ({
    mount,
    page,
  }) => {
    const cmp = await mount(PasswordHarness, { props: { src: encrypted, assets } })
    await expect(dialog(page)).toBeVisible()
    await enter(page, 'nope')
    const alert = dialog(page).locator('.ink-password-error')
    await expect(alert).toHaveText('Incorrect password. Try again.')
    await expect(alert).toHaveAttribute('role', 'alert')
    await expect(field(page)).toHaveValue('')
    await expect(field(page)).toBeFocused()
    await expect(field(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(field(page)).toHaveAttribute('aria-describedby', /.+/)
    await expect(cmp.getByTestId('error-codes')).toHaveText(
      'PasswordRequired,PasswordRequired'
    )
    // A second wrong try inserts a new alert element.
    await alert.evaluate((el) => ((el as HTMLElement).dataset.first = ''))
    await enter(page, 'nope again')
    await expect(cmp.getByTestId('error-codes')).toHaveText(
      'PasswordRequired,PasswordRequired,PasswordRequired'
    )
    await expect(alert).not.toHaveAttribute('data-first', '')
    // Not stuck pending.
    await enter(page, 'inkbar')
    await expect(cmp).toHaveAttribute('data-state', 'ready')
    await expect(dialog(page)).toHaveCount(0)
  })

  test('Open is disabled while the field is empty', async ({ mount, page }) => {
    await mount(PasswordHarness, { props: { src: encrypted, assets } })
    const open = dialog(page).locator('button[type="submit"]')
    await expect(open).toBeDisabled()
    await field(page).fill('x')
    await expect(open).toBeEnabled()
  })

  test('cancel shows the locked panel and the button reopens', async ({
    mount,
    page,
  }) => {
    const cmp = await mount(PasswordHarness, { props: { src: encrypted, assets } })
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    const unlock = page.locator('[data-ink-unlock]')
    await expect(unlock).toBeFocused()
    await expect(page.locator('.ink-locked')).toHaveAttribute('role', 'status')
    await expect(page.locator('.ink-locked-title')).toHaveText(
      'This document is password protected.'
    )
    await expect(unlock).toHaveText('Enter password')
    await expect(cmp).toHaveAttribute('data-state', 'locked')
    await unlock.click()
    await expect(dialog(page)).toBeVisible()
    await expect(field(page)).toBeFocused()
  })

  test('a wrong try then cancel reopens still marked incorrect', async ({
    mount,
    page,
  }) => {
    await mount(PasswordHarness, { props: { src: encrypted, assets } })
    await enter(page, 'nope')
    await expect(dialog(page).locator('.ink-password-error')).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('[data-ink-unlock]')).toBeFocused()
    await page.locator('[data-ink-unlock]').click()
    await expect(dialog(page).locator('.ink-password-error')).toBeVisible()
  })

  test('a wrong host password opens the prompt marked incorrect', async ({
    mount,
    page,
  }) => {
    const cmp = await mount(PasswordHarness, {
      props: { src: encrypted, assets, password: 'nope' },
    })
    await expect(cmp).toHaveAttribute('data-state', 'locked')
    await expect(dialog(page).locator('.ink-password-error')).toHaveText(
      'Incorrect password. Try again.'
    )
  })

  test("passwordPrompt false keeps today's error", async ({ mount, page }) => {
    const cmp = await mount(PasswordHarness, {
      props: { src: encrypted, assets, passwordPrompt: false },
    })
    await expect(cmp).toHaveAttribute('data-state', 'error')
    await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
    await expect(page.locator('.ink-error')).toHaveCount(1)
    await expect(dialog(page)).toHaveCount(0)
  })

  test('a new source closes the dialog', async ({ mount, page }) => {
    const props = { src: encrypted, assets }
    const cmp = await mount(PasswordHarness, { props })
    await expect(dialog(page)).toBeVisible()
    await cmp.update({ props: { ...props, src: fixtureUrl('text-simple') } })
    await expect(cmp).toHaveAttribute('data-state', 'ready')
    await expect(dialog(page)).toHaveCount(0)
  })

  test('a new locked source opens the prompt fresh', async ({ mount, page }) => {
    const props = { src: encrypted, assets }
    const cmp = await mount(PasswordHarness, { props })
    await enter(page, 'nope')
    await expect(dialog(page).locator('.ink-password-error')).toBeVisible()
    await expect(cmp.getByTestId('status')).toHaveText(
      '{"state":"locked","incorrect":true}'
    )
    await cmp.update({ props: { ...props, src: fixtureUrl('encrypted-rc4') } })
    await expect(cmp.getByTestId('status')).toHaveText(
      '{"state":"locked","incorrect":false}'
    )
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).locator('.ink-password-error')).toHaveCount(0)
    await expect(field(page)).toHaveAttribute('aria-invalid', 'false')
  })

  test('a cancel during a retry does not steal focus for the next locked source', async ({
    mount,
    page,
  }) => {
    const props = { src: encrypted, assets }
    const cmp = await mount(PasswordHarness, { props })
    await enter(page, 'nope')
    await expect(dialog(page).locator('.ink-password-error')).toBeVisible()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/fixtures/encrypted-aes.pdf', async (route) => {
      await gate
      await route.continue()
    })
    try {
      await enter(page, 'again')
      await expect(cmp).toHaveAttribute('data-state', 'loading')
      await page.keyboard.press('Escape')
      await expect(dialog(page)).toHaveCount(0)
      await page.evaluate(() => {
        const w = window as Window & { stolen?: number }
        w.stolen = 0
        document.addEventListener('focusin', (e) => {
          if ((e.target as Element).matches('[data-ink-unlock]')) w.stolen!++
        })
      })
      await cmp.update({ props: { ...props, src: fixtureUrl('encrypted-rc4') } })
      await expect(cmp.getByTestId('status')).toHaveText(
        '{"state":"locked","incorrect":false}'
      )
      await expect(dialog(page)).toBeVisible()
      await expect(field(page)).toBeFocused()
      expect(
        await page.evaluate(() => (window as Window & { stolen?: number }).stolen)
      ).toBe(0)
    } finally {
      release()
    }
  })

  test('Cancel focuses the first control of the locked slot', async ({ mount, page }) => {
    await mount(PasswordHarness, {
      props: { src: encrypted, assets, customLocked: true },
    })
    await expect(dialog(page)).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.getByTestId('custom-unlock')).toBeFocused()
  })

  test('the locked slot replaces the panel', async ({ mount, page }) => {
    const cmp = await mount(PasswordHarness, {
      props: { src: encrypted, assets, customLocked: true },
    })
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('[data-ink-unlock]')).toHaveCount(0)
    const custom = cmp.getByTestId('custom-unlock')
    await expect(custom).toBeVisible()
    await custom.click()
    await expect(dialog(page)).toBeVisible()
  })
})

test('emits error when the file fails to load after openDocument resolves', async ({
  mount,
}) => {
  // openDocument resolves for load failures and reports them through status, not by rejecting.
  const cmp = await mount(EventHost, {
    props: { src: fixtureUrl('malformed-truncated'), assets },
  })
  await expect(cmp).toHaveAttribute('data-state', 'error')
  await expect(cmp.getByTestId('error-codes')).toHaveText('InvalidPdf')
})

test('surfaces a missing asset config through status and the error event instead of throwing', async ({
  mount,
}) => {
  const cmp = await mount(EventHost, {
    props: { src: fixtureUrl('text-simple'), assets: { ...assets, worker: '' } },
  })
  await expect(cmp).toHaveAttribute('data-state', 'error')
  await expect(cmp.getByTestId('error-codes')).toHaveText('AssetConfigMissing')
})

test('does not reload when only the URL changes but the key is stable; reloads on a new key (Review Focus 3)', async ({
  mount,
}) => {
  let ready = 0
  // `update` replaces the listeners, so every call passes them again.
  const on = { ready: () => ready++ }
  const cmp = await mount(InkRoot, {
    props: { src: { url: fixtureUrl('text-simple') + '?sig=1', key: 'doc-1' }, assets },
    on,
  })
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  expect(ready).toBe(1)
  await cmp.evaluate((el) => {
    ;(el as RootEl).__inkDocument!.__marker = 1
  })
  await cmp.update({
    props: { src: { url: fixtureUrl('text-simple') + '?sig=2', key: 'doc-1' }, assets },
    on,
  })
  await cmp.page().waitForTimeout(300)
  expect(ready).toBe(1)
  // Same document object: nothing was destroyed and reopened behind our back.
  expect(await cmp.evaluate((el) => (el as RootEl).__inkDocument?.__marker)).toBe(1)
  await cmp.update({
    props: { src: { url: fixtureUrl('text-simple') + '?sig=3', key: 'doc-2' }, assets },
    on,
  })
  await expect.poll(() => ready).toBe(2)
  expect(
    await cmp.evaluate((el) => (el as RootEl).__inkDocument?.__marker)
  ).toBeUndefined()
})

test('controlled annotations: v-model receives proposals and the store follows the prop', async ({
  mount,
}) => {
  const received: Annotation[][] = []
  const changes: string[] = []
  const cmp = await mount(InkRoot, {
    props: { src: fixtureUrl('text-simple'), assets, annotations: [] },
    on: {
      'update:annotations': (next: Annotation[]) => received.push(next),
      change: (c: { kind: string }) => changes.push(c.kind),
    },
  })
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  await cmp.evaluate((el) => {
    ;(el as RootEl).__inkDocument!.annotations.add({
      type: 'text',
      page: 0,
      rect: { x: 0, y: 0, width: 20, height: 20 },
    })
  })
  await expect.poll(() => received.length).toBe(1)
  expect(changes).toEqual(['add'])
  const listBefore = await cmp.evaluate(
    (el) => (el as RootEl).__inkDocument!.annotations.list.get().length
  )
  expect(listBefore).toBe(0)
  await cmp.update({
    props: { src: fixtureUrl('text-simple'), assets, annotations: received[0]! },
  })
  const listAfter = await cmp.evaluate(
    (el) => (el as RootEl).__inkDocument!.annotations.list.get().length
  )
  expect(listAfter).toBe(1)
})

test('controlled annotations that change while the document opens reach the store', async ({
  mount,
  page,
}) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/fixtures/text-simple.pdf', async (route) => {
    await gate
    await route.continue()
  })
  const note: Annotation = {
    id: 'late-note',
    type: 'text',
    icon: 'Comment',
    page: 0,
    rect: { x: 10, y: 10, width: 20, height: 20 },
    color: '#ffd400',
    opacity: 1,
    createdAt: '2026-10-12T00:00:00.000Z',
    modifiedAt: '2026-10-12T00:00:00.000Z',
    source: 'session',
  }
  const cmp = await mount(InkRoot, {
    props: { src: fixtureUrl('text-simple'), assets, annotations: [] },
  })
  await expect(cmp).toHaveAttribute('data-state', 'loading')
  await cmp.update({
    props: { src: fixtureUrl('text-simple'), assets, annotations: [note] },
  })
  release()
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  const ids = await cmp.evaluate((el) =>
    (el as RootEl)
      .__inkDocument!.annotations.list.get()
      .map((a) => (a as { id: string }).id)
  )
  expect(ids).toEqual(['late-note'])
})

test('uncontrolled by default, with history enabled', async ({ mount }) => {
  const cmp = await mount(InkRoot, { props: { src: fixtureUrl('text-simple'), assets } })
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  const canUndo = await cmp.evaluate((el) => {
    const d = (el as RootEl).__inkDocument!
    d.annotations.add({
      type: 'text',
      page: 0,
      rect: { x: 0, y: 0, width: 20, height: 20 },
    })
    return d.history.canUndo.get()
  })
  expect(canUndo).toBe(true)
})

test('composables bind to the document, tool and core history', async ({ mount }) => {
  const cmp = await mount(UncontrolledHost, {
    props: { src: fixtureUrl('text-simple'), assets },
  })
  const probe = cmp.getByTestId('probe')
  await expect(probe).toHaveAttribute('data-ready', 'true')
  await expect(probe).toHaveAttribute('data-pages', '3')
  await expect(probe).toHaveAttribute('data-count', '3')
  await expect(probe).toHaveAttribute('data-current', '0')
  await expect(probe).toHaveAttribute('data-embedded', '0')
  await expect(probe).toHaveAttribute('data-tool', 'select-text')
  await expect(probe).toHaveAttribute('data-zoom', 'fit-width')
  await expect(probe).toHaveAttribute('data-can-undo', 'false')

  await cmp.getByTestId('add').click()
  await expect(probe).toHaveAttribute('data-annotations', '1')
  await expect(probe).toHaveAttribute('data-can-undo', 'true')
  await cmp.getByTestId('select').click()
  await expect(probe).not.toHaveAttribute('data-selection', '')
  await cmp.getByTestId('undo').click()
  await expect(probe).toHaveAttribute('data-annotations', '0')
  await expect(probe).toHaveAttribute('data-selection', '')
  await expect(probe).toHaveAttribute('data-can-redo', 'true')
  await cmp.getByTestId('highlight').click()
  await expect(probe).toHaveAttribute('data-tool', 'highlight')
})

test('batch records a run of additions as one undo step', async ({ mount }) => {
  const cmp = await mount(UncontrolledHost, {
    props: { src: fixtureUrl('text-simple'), assets },
  })
  const probe = cmp.getByTestId('probe')
  await expect(probe).toHaveAttribute('data-ready', 'true')
  await cmp.getByTestId('batch9').click()
  await expect(probe).toHaveAttribute('data-annotations', '9')
  await cmp.getByTestId('undo').click()
  await expect(probe).toHaveAttribute('data-annotations', '0')
  await expect(probe).toHaveAttribute('data-can-redo', 'true')
})

test('batch in a controlled host reaches the host as one undo step', async ({
  mount,
}) => {
  const cmp = await mount(ControlledHost, {
    props: { src: fixtureUrl('text-simple'), assets, history: true },
  })
  const probe = cmp.getByTestId('probe')
  const hostCount = cmp.getByTestId('host-count')
  await expect(probe).toHaveAttribute('data-ready', 'true')
  await cmp.getByTestId('batch3').click()
  await expect(hostCount).toHaveText('3')
  await expect(probe).toHaveAttribute('data-annotations', '3')
  await cmp.getByTestId('undo').click()
  await expect(hostCount).toHaveText('0')
  await expect(probe).toHaveAttribute('data-can-undo', 'false')
})

test('embedded summary comes from the file', async ({ mount }) => {
  const cmp = await mount(UncontrolledHost, {
    props: { src: fixtureUrl('annotated-markup'), assets },
  })
  const probe = cmp.getByTestId('probe')
  await expect(probe).toHaveAttribute('data-ready', 'true')
  await expect(probe).not.toHaveAttribute('data-embedded', '0')
})

test('controlled hosts get a ref-based undo stack through useHistory', async ({
  mount,
}) => {
  const cmp = await mount(ControlledHost, {
    props: { src: fixtureUrl('text-simple'), assets, history: true },
  })
  const probe = cmp.getByTestId('probe')
  const hostCount = cmp.getByTestId('host-count')
  await expect(probe).toHaveAttribute('data-ready', 'true')
  await expect(probe).toHaveAttribute('data-can-undo', 'false')

  await cmp.getByTestId('add').click()
  await cmp.getByTestId('add').click()
  await expect(hostCount).toHaveText('2')
  await expect(probe).toHaveAttribute('data-annotations', '2')
  await expect(probe).toHaveAttribute('data-can-undo', 'true')

  await cmp.getByTestId('undo').click()
  await expect(hostCount).toHaveText('1')
  await expect(probe).toHaveAttribute('data-annotations', '1')
  await expect(probe).toHaveAttribute('data-can-redo', 'true')
  await cmp.getByTestId('undo').click()
  await expect(hostCount).toHaveText('0')
  await expect(probe).toHaveAttribute('data-can-undo', 'false')

  await cmp.getByTestId('redo').click()
  await expect(hostCount).toHaveText('1')
  await cmp.getByTestId('add').click()
  await expect(hostCount).toHaveText('2')
  await expect(probe).toHaveAttribute('data-can-redo', 'false')
})

test('controlled hosts without history get inert undo', async ({ mount }) => {
  const cmp = await mount(ControlledHost, {
    props: { src: fixtureUrl('text-simple'), assets },
  })
  const probe = cmp.getByTestId('probe')
  await expect(probe).toHaveAttribute('data-ready', 'true')
  await cmp.getByTestId('add').click()
  await expect(cmp.getByTestId('host-count')).toHaveText('1')
  await expect(probe).toHaveAttribute('data-can-undo', 'false')
})

test('the theme keeps a .light root light inside a .dark ancestor', async ({
  mount,
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.evaluate(() => document.querySelector('#root')?.classList.add('dark'))
  const inkBg = (el: Element) => getComputedStyle(el).getPropertyValue('--ink-bg').trim()
  const dark = await mount(InkRoot, { props: { src: null, assets } })
  await expect.poll(() => dark.evaluate(inkBg)).toBe('#0f1217')
  await dark.unmount()
  const light = await mount(InkRoot, { props: { src: null, assets, class: 'light' } })
  await expect(light).toHaveClass(/light/)
  await expect.poll(() => light.evaluate(inkBg)).toBe('#f1f2f5')
})

test('a one-shot tool switching back to select text emits update:tool and reaches the toolbar', async ({
  mount,
  page,
}) => {
  const tools: string[] = []
  const cmp = await mount(ToolbarHarness, {
    props: { src: fixtureUrl('text-simple'), assets, tool: 'shape' },
    on: { 'update:tool': (t: string) => tools.push(t) },
  })
  const canvas = cmp.locator('[data-ink-scroll] .ink-page canvas').first()
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  await page.mouse.click(box.x + 200, box.y + 300)
  await expect(cmp.locator('[data-annotation]')).toHaveCount(1)
  await page.mouse.click(box.x + 400, box.y + 500)
  await expect(
    cmp.locator('[data-ink-toolbar] [data-tool="select-text"]')
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(cmp.locator('[data-annotation]')).toHaveCount(1)
  expect(tools).toEqual(['select-text'])
})

test('accept then undo restores both stores, uncontrolled', async ({ mount }) => {
  const cmp = await mount(PluginHarness, {
    props: { src: fixtureUrl('text-simple'), assets },
  })
  const probe = cmp.getByTestId('probe')
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  await expect(probe).toHaveAttribute('data-marks', 'suggested')
  await cmp.locator('button[data-command="sandbox.accept"]').click()
  await expect(probe).toHaveAttribute('data-marks', 'accepted')
  await expect(probe).toHaveAttribute('data-annotations', '1')
  await cmp.locator('[data-ink-undo]').click()
  await expect(probe).toHaveAttribute('data-marks', 'suggested')
  await expect(probe).toHaveAttribute('data-annotations', '0')
  await cmp.locator('[data-ink-redo]').click()
  await expect(probe).toHaveAttribute('data-marks', 'accepted')
  await expect(probe).toHaveAttribute('data-annotations', '1')
})

test('accept then undo restores both stores, controlled with history', async ({
  mount,
}) => {
  const cmp = await mount(PluginHarness, {
    props: { src: fixtureUrl('text-simple'), assets, controlled: true, history: true },
  })
  const probe = cmp.getByTestId('probe')
  const hostCount = cmp.getByTestId('host-count')
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  await cmp.locator('button[data-command="sandbox.accept"]').click()
  await expect(hostCount).toHaveText('1')
  await expect(probe).toHaveAttribute('data-marks', 'accepted')
  await expect(probe).toHaveAttribute('data-can-undo', 'true')
  await cmp.locator('[data-ink-undo]').click()
  await expect(hostCount).toHaveText('0')
  await expect(probe).toHaveAttribute('data-marks', 'suggested')
  await expect(probe).toHaveAttribute('data-can-undo', 'false')
  await cmp.locator('[data-ink-redo]').click()
  await expect(hostCount).toHaveText('1')
  await expect(probe).toHaveAttribute('data-marks', 'accepted')
})

test('deleting a reacted annotation under a controlled host is one undo step', async ({
  mount,
}) => {
  const cmp = await mount(PluginHarness, {
    props: { src: fixtureUrl('text-simple'), assets, controlled: true, history: true },
  })
  const probe = cmp.getByTestId('probe')
  const hostCount = cmp.getByTestId('host-count')
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  await cmp.locator('button[data-command="sandbox.accept"]').click()
  await expect(hostCount).toHaveText('1')
  await expect(probe).toHaveAttribute('data-marks', 'accepted')
  // The reaction puts the mark back in the delete's own step.
  await cmp.getByTestId('remove').click()
  await expect(hostCount).toHaveText('0')
  await expect(probe).toHaveAttribute('data-marks', 'suggested')
  await cmp.locator('[data-ink-undo]').click()
  await expect(hostCount).toHaveText('1')
  await expect(probe).toHaveAttribute('data-marks', 'accepted')
  // One more undo takes back the accept: the delete was one step, not two.
  await cmp.locator('[data-ink-undo]').click()
  await expect(hostCount).toHaveText('0')
  await expect(probe).toHaveAttribute('data-marks', 'suggested')
  await expect(probe).toHaveAttribute('data-can-undo', 'false')
})

test('unmounting tears down the plugin layers before the plugins', async ({
  mount,
  page,
}) => {
  const cmp = await mount(PluginHarness, {
    props: { src: fixtureUrl('text-simple'), assets },
  })
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  await expect(cmp.locator('.ink-page[data-page="0"]')).toHaveCount(1)
  await cmp.unmount()
  await expect
    .poll(() =>
      page.evaluate(() => (window as Window & { pluginLog?: string[] }).pluginLog)
    )
    .toEqual(['layer destroyed', 'plugin cleaned up'])
})

/** The ids of the tools the console reported as missing, from now on. */
function missingTools(page: Page): string[] {
  const ids: string[] = []
  page.on('console', (m) => {
    const id = /No tool (\S+) is registered/.exec(m.text())?.[1]
    if (m.type() === 'error' && id) ids.push(id)
  })
  return ids
}

test('dropping the active tool falls back to select-text', async ({ mount, page }) => {
  const missing = missingTools(page)
  const tools: string[] = []
  const on = { 'update:tool': (t: string) => tools.push(t) }
  const cmp = await mount(ToolSetHarness, {
    props: { src: fixtureUrl('text-simple'), assets, tool: 'shape', follow: true },
    on,
  })
  const scroll = cmp.locator('[data-ink-scroll]')
  await expect(scroll).toHaveAttribute('data-ink-tool', 'shape')
  // An update replaces the listeners, so it passes them again.
  await cmp.update({ props: { bare: true }, on })
  await expect(scroll).toHaveAttribute('data-ink-tool', 'select-text')
  expect(tools).toEqual(['select-text'])
  expect(missing).toEqual(['shape'])
})

test('a controlled tool the host keeps on a missing id is not applied again', async ({
  mount,
  page,
}) => {
  const missing = missingTools(page)
  const tools: string[] = []
  const cmp = await mount(ToolSetHarness, {
    props: { src: fixtureUrl('text-simple'), assets, tool: 'highlight', bare: true },
    on: { 'update:tool': (t: string) => tools.push(t) },
  })
  const scroll = cmp.locator('[data-ink-scroll]')
  await expect(scroll).toHaveAttribute('data-ink-tool', 'select-text')
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  // The host keeps passing the missing tool; a re-render does not apply it again.
  await cmp.update({
    props: { bare: true },
    on: { 'update:tool': (t: string) => tools.push(t) },
  })
  await expect(scroll).toHaveAttribute('data-ink-tool', 'select-text')
  expect(tools).toEqual(['select-text'])
  expect(missing).toEqual(['highlight'])
})

test('a plugin tool works with no tools prop', async ({ mount, page }) => {
  const missing = missingTools(page)
  const cmp = await mount(PluginHarness, {
    props: { src: fixtureUrl('text-simple'), assets },
  })
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  const button = cmp.locator('[data-ink-tool-button][data-tool="sandbox.stamp"]')
  await expect(button).toHaveAccessibleName('Stamp')
  await expect(button).toBeEnabled()
  await expect(button).not.toHaveAttribute('aria-hidden')
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(cmp.locator('[data-ink-scroll]')).toHaveAttribute(
    'data-ink-tool',
    'sandbox.stamp'
  )
  expect(missing).toEqual([])
})
