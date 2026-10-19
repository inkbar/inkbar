import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import ControlledHost from '../../playwright/harness/ControlledHost.vue'
import EventHost from '../../playwright/harness/EventHost.vue'
import UncontrolledHost from '../../playwright/harness/UncontrolledHost.vue'

import InkRoot from './InkRoot.vue'

import type { Annotation } from '@inkbar/core'

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
    props: { src: fixtureUrl('encrypted-aes'), assets },
  })
  await expect(cmp).toHaveAttribute('data-state', 'error')
  await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
  await cmp.update({
    props: { src: fixtureUrl('encrypted-aes'), assets, password: 'inkbar' },
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
  const props = { src: null, assets, bytesFrom: fixtureUrl('encrypted-aes') }
  const cmp = await mount(EventHost, { props: { ...props, password: 'wrong' } })
  await expect(cmp).toHaveAttribute('data-state', 'error')
  await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
  await expect(cmp.getByTestId('byte-length')).toHaveText(String(size))
  await cmp.update({ props: { ...props, password: 'inkbar' } })
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
  await expect(cmp.getByTestId('byte-length')).toHaveText(String(size))
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
    icon: 'comment',
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
  await expect(probe).toHaveAttribute('data-tool', 'view')
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
