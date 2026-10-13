import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-react'

import { guardConsole } from '../../playwright/console-guard'
import { ControlledHost } from '../../playwright/harness/ControlledHost'
import { EventHost } from '../../playwright/harness/EventHost'
import { StrictHost } from '../../playwright/harness/StrictHost'
import { UncontrolledHost } from '../../playwright/harness/UncontrolledHost'

import { InkRoot } from './InkRoot'

import type { Annotation } from '@inkbar/core'

const assets = browserAssets()
const consoleGuard = guardConsole(test)

type DocHandle = {
  annotations: {
    mode: string
    add(i: unknown): void
    list: { get(): unknown[] }
  }
  history: { canUndo: { get(): boolean } }
}
type RootEl = HTMLElement & { __inkDocument?: DocHandle & { __marker?: number } }

test('calls onReady and reflects state on the root element', async ({ mount }) => {
  const events: string[] = []
  const cmp = await mount(
    <InkRoot
      src={fixtureUrl('text-simple')}
      assets={assets}
      onReady={() => events.push('ready')}
      onError={() => events.push('error')}
    />
  )
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
  const cmp = await mount(<InkRoot src={fixtureUrl('text-simple')} assets={assets} />)
  await expect(cmp).toHaveAttribute('data-state', 'loading')
  release()
  await expect(cmp).toHaveAttribute('data-state', 'ready')
})

test('stays idle without a source', async ({ mount }) => {
  const cmp = await mount(<InkRoot src={null} assets={assets} />)
  await expect(cmp).toHaveAttribute('data-state', 'idle')
  // The harness stylesheet bounds #root, so scroll tests have a container to scroll.
  await expect(cmp.page().locator('#root')).toHaveCSS('height', '900px')
})

test('calls onError with the code for an encrypted file and opens with the password', async ({
  mount,
}) => {
  const cmp = await mount(<EventHost src={fixtureUrl('encrypted-aes')} assets={assets} />)
  await expect(cmp).toHaveAttribute('data-state', 'error')
  await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
  await cmp.update(
    <EventHost src={fixtureUrl('encrypted-aes')} assets={assets} password="inkbar" />
  )
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
  const bytesFrom = fixtureUrl('encrypted-aes')
  const cmp = await mount(
    <EventHost src={null} assets={assets} bytesFrom={bytesFrom} password="wrong" />
  )
  await expect(cmp).toHaveAttribute('data-state', 'error')
  await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
  await expect(cmp.getByTestId('byte-length')).toHaveText(String(size))
  await cmp.update(
    <EventHost src={null} assets={assets} bytesFrom={bytesFrom} password="inkbar" />
  )
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
  await expect(cmp.getByTestId('byte-length')).toHaveText(String(size))
})

test('calls onError when the file fails to load after openDocument resolves', async ({
  mount,
}) => {
  // openDocument resolves for load failures and reports them through status, not by rejecting.
  const cmp = await mount(
    <EventHost src={fixtureUrl('malformed-truncated')} assets={assets} />
  )
  await expect(cmp).toHaveAttribute('data-state', 'error')
  await expect(cmp.getByTestId('error-codes')).toHaveText('InvalidPdf')
  // The PDF engine logs its own recovery warnings for the broken file; nothing else may.
  expect(consoleGuard.problems.filter((m) => !m.startsWith('Warning: '))).toEqual([])
  consoleGuard.clear()
})

test('surfaces a missing asset config through status and onError instead of throwing', async ({
  mount,
}) => {
  const cmp = await mount(
    <EventHost src={fixtureUrl('text-simple')} assets={{ ...assets, worker: '' }} />
  )
  await expect(cmp).toHaveAttribute('data-state', 'error')
  await expect(cmp.getByTestId('error-codes')).toHaveText('AssetConfigMissing')
})

test('does not reload when only the URL or a callback changes but the key is stable; reloads on a new key (Review Focus 4)', async ({
  mount,
}) => {
  let ready = 0
  const cmp = await mount(
    <InkRoot
      src={{ url: fixtureUrl('text-simple') + '?sig=1', key: 'doc-1' }}
      assets={assets}
      onReady={() => ready++}
    />
  )
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  expect(ready).toBe(1)
  await cmp.evaluate((el) => {
    ;(el as RootEl).__inkDocument!.__marker = 1
  })
  // New URL, new callback identities, same key.
  await cmp.update(
    <InkRoot
      src={{ url: fixtureUrl('text-simple') + '?sig=2', key: 'doc-1' }}
      assets={assets}
      onReady={() => ready++}
      onAnnotationsChange={() => undefined}
    />
  )
  await cmp.page().waitForTimeout(300)
  expect(ready).toBe(1)
  // Same document object: nothing was destroyed and reopened behind our back.
  expect(await cmp.evaluate((el) => (el as RootEl).__inkDocument?.__marker)).toBe(1)
  await cmp.update(
    <InkRoot
      src={{ url: fixtureUrl('text-simple') + '?sig=3', key: 'doc-2' }}
      assets={assets}
      onReady={() => ready++}
    />
  )
  await expect.poll(() => ready).toBe(2)
  expect(
    await cmp.evaluate((el) => (el as RootEl).__inkDocument?.__marker)
  ).toBeUndefined()
})

test('controlled annotations: onAnnotationsChange receives proposals and the store follows the prop', async ({
  mount,
}) => {
  const received: Annotation[][] = []
  const changes: string[] = []
  const cmp = await mount(
    <InkRoot
      src={fixtureUrl('text-simple')}
      assets={assets}
      annotations={[]}
      onAnnotationsChange={(next) => received.push(next)}
      onChange={(c) => changes.push(c.kind)}
    />
  )
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  await cmp.evaluate((el) => {
    ;(el as RootEl).__inkDocument!.annotations.add({
      type: 'note',
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
  // Core warns when the host has not applied a proposal yet; that is the state under test.
  expect(consoleGuard.problems).toEqual([
    expect.stringContaining('ControlledMutationIgnored'),
  ])
  consoleGuard.clear()
  await cmp.update(
    <InkRoot src={fixtureUrl('text-simple')} assets={assets} annotations={received[0]} />
  )
  const listAfter = await cmp.evaluate(
    (el) => (el as RootEl).__inkDocument!.annotations.list.get().length
  )
  expect(listAfter).toBe(1)
})

test('passing the annotations prop to an open uncontrolled document leaves its mode alone', async ({
  mount,
}) => {
  const received: Annotation[][] = []
  const cmp = await mount(<InkRoot src={fixtureUrl('text-simple')} assets={assets} />)
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  await cmp.evaluate((el) => {
    ;(el as RootEl).__inkDocument!.__marker = 1
  })
  await cmp.update(
    <InkRoot
      src={fixtureUrl('text-simple')}
      assets={assets}
      annotations={[]}
      onAnnotationsChange={(next) => received.push(next)}
    />
  )
  await cmp.page().waitForTimeout(100)
  // Same document, still uncontrolled: an add lands in the store and proposes nothing.
  expect(await cmp.evaluate((el) => (el as RootEl).__inkDocument?.__marker)).toBe(1)
  const after = await cmp.evaluate((el) => {
    const d = (el as RootEl).__inkDocument!
    d.annotations.add({
      type: 'note',
      page: 0,
      rect: { x: 0, y: 0, width: 20, height: 20 },
    })
    return { mode: d.annotations.mode, count: d.annotations.list.get().length }
  })
  expect(after).toEqual({ mode: 'uncontrolled', count: 1 })
  await cmp.page().waitForTimeout(50)
  expect(received).toEqual([])
  // Dropping the prop again changes nothing either.
  await cmp.update(<InkRoot src={fixtureUrl('text-simple')} assets={assets} />)
  expect(
    await cmp.evaluate(
      (el) => (el as RootEl).__inkDocument!.annotations.list.get().length
    )
  ).toBe(1)
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
    type: 'note',
    icon: 'comment',
    page: 0,
    rect: { x: 10, y: 10, width: 20, height: 20 },
    color: '#ffd400',
    opacity: 1,
    createdAt: '2026-10-12T00:00:00.000Z',
    modifiedAt: '2026-10-12T00:00:00.000Z',
    source: 'session',
  }
  const cmp = await mount(
    <InkRoot src={fixtureUrl('text-simple')} assets={assets} annotations={[]} />
  )
  await expect(cmp).toHaveAttribute('data-state', 'loading')
  await cmp.update(
    <InkRoot src={fixtureUrl('text-simple')} assets={assets} annotations={[note]} />
  )
  release()
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  const ids = await cmp.evaluate((el) =>
    (el as RootEl)
      .__inkDocument!.annotations.list.get()
      .map((a) => (a as { id: string }).id)
  )
  expect(ids).toEqual(['late-note'])
})

test('controlled lists proposed outside a React event reach the store before core checks', async ({
  mount,
}) => {
  const cmp = await mount(
    <ControlledHost src={fixtureUrl('text-simple')} assets={assets} />
  )
  await expect(cmp.getByTestId('probe')).toHaveAttribute('data-ready', 'true')
  await cmp.evaluate(async (el) => {
    await Promise.resolve()
    const d = (el as RootEl).__inkDocument!
    for (let i = 0; i < 3; i++)
      d.annotations.add({
        type: 'note',
        page: 0,
        rect: { x: 0, y: 0, width: 20, height: 20 },
      })
  })
  await cmp.page().waitForTimeout(100)
  await expect(cmp.getByTestId('host-count')).toHaveText('3')
  expect(consoleGuard.problems).toEqual([])
})

test('a host that adds from a useEffect after ready raises no React or core warnings', async ({
  mount,
}) => {
  const cmp = await mount(
    <ControlledHost src={fixtureUrl('text-simple')} assets={assets} addOnReady />
  )
  await expect(cmp.getByTestId('host-count')).toHaveText('1')
  await cmp.page().waitForTimeout(100)
  await expect(cmp.getByTestId('host-count')).toHaveText('1')
  expect(consoleGuard.problems).toEqual([])
})

test('uncontrolled by default, with history enabled', async ({ mount }) => {
  const cmp = await mount(<InkRoot src={fixtureUrl('text-simple')} assets={assets} />)
  await expect(cmp).toHaveAttribute('data-state', 'ready')
  const canUndo = await cmp.evaluate((el) => {
    const d = (el as RootEl).__inkDocument!
    d.annotations.add({
      type: 'note',
      page: 0,
      rect: { x: 0, y: 0, width: 20, height: 20 },
    })
    return d.history.canUndo.get()
  })
  expect(canUndo).toBe(true)
})

test('hooks bind to the document, tool and core history', async ({ mount }) => {
  const cmp = await mount(
    <UncontrolledHost src={fixtureUrl('text-simple')} assets={assets} />
  )
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
  // The hooks' actions keep their identity across list changes.
  await expect(probe).toHaveAttribute('data-stable-actions', 'true')
  await cmp.getByTestId('select').click()
  await expect(probe).not.toHaveAttribute('data-selection', '')
  await cmp.getByTestId('undo').click()
  await expect(probe).toHaveAttribute('data-annotations', '0')
  await expect(probe).toHaveAttribute('data-selection', '')
  await expect(probe).toHaveAttribute('data-can-redo', 'true')
  await cmp.getByTestId('highlight').click()
  await expect(probe).toHaveAttribute('data-tool', 'highlight')
})

test('embedded summary comes from the file', async ({ mount }) => {
  const cmp = await mount(
    <UncontrolledHost src={fixtureUrl('annotated-markup')} assets={assets} />
  )
  const probe = cmp.getByTestId('probe')
  await expect(probe).toHaveAttribute('data-ready', 'true')
  await expect(probe).not.toHaveAttribute('data-embedded', '0')
})

test('controlled hosts get a snapshot undo stack through useHistory', async ({
  mount,
}) => {
  const cmp = await mount(
    <ControlledHost src={fixtureUrl('text-simple')} assets={assets} history={true} />
  )
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

test('a host passing a fresh array of the same content each render keeps one undo step (Review Focus 2)', async ({
  mount,
}) => {
  const cmp = await mount(
    <ControlledHost
      src={fixtureUrl('text-simple')}
      assets={assets}
      history={true}
      spreadOnRender={true}
    />
  )
  const probe = cmp.getByTestId('probe')
  const hostCount = cmp.getByTestId('host-count')
  await expect(probe).toHaveAttribute('data-ready', 'true')
  await cmp.getByTestId('add').click()
  await expect(hostCount).toHaveText('1')
  await expect(probe).toHaveAttribute('data-can-undo', 'true')

  await cmp.getByTestId('bump').click()
  await cmp.getByTestId('bump').click()
  await expect(cmp.getByTestId('bump')).toHaveText('2')
  await expect(hostCount).toHaveText('1')
  await expect(probe).toHaveAttribute('data-can-undo', 'true')
  await expect(probe).toHaveAttribute('data-can-redo', 'false')
  // One undo step only: a snapshot loop would have pushed more.
  await cmp.getByTestId('undo').click()
  await expect(hostCount).toHaveText('0')
  await expect(probe).toHaveAttribute('data-can-undo', 'false')
})

test('controlled hosts without history get inert undo', async ({ mount }) => {
  const cmp = await mount(
    <ControlledHost src={fixtureUrl('text-simple')} assets={assets} />
  )
  const probe = cmp.getByTestId('probe')
  await expect(probe).toHaveAttribute('data-ready', 'true')
  await cmp.getByTestId('add').click()
  await expect(cmp.getByTestId('host-count')).toHaveText('1')
  await expect(probe).toHaveAttribute('data-can-undo', 'false')
})

test('StrictMode opens one document and reports ready once (Review Focus 1)', async ({
  mount,
  page,
}) => {
  let fetches = 0
  await page.route('**/fixtures/text-simple.pdf', async (route) => {
    fetches++
    await route.continue()
  })
  const cmp = await mount(<StrictHost src={fixtureUrl('text-simple')} assets={assets} />)
  const root = cmp.locator('[data-ink-root]')
  await expect(root).toHaveAttribute('data-state', 'ready')
  await expect(cmp.getByTestId('ready-count')).toHaveText('1')
  await page.waitForTimeout(300)
  await expect(cmp.getByTestId('ready-count')).toHaveText('1')
  await expect(cmp.getByTestId('error-count')).toHaveText('0')
  // StrictMode replayed the effects, yet the discarded first attempt never fetched.
  const runs = await cmp.getByTestId('effect-marker').getAttribute('data-effect-runs')
  expect(Number(runs)).toBeGreaterThanOrEqual(2)
  expect(fetches).toBe(1)
  // The live document is the one the hook points at, and it is not destroyed.
  const alive = await root.evaluate(
    (el) => (el as RootEl).__inkDocument!.annotations.list.get().length === 0
  )
  expect(alive).toBe(true)
})

test('the theme keeps a .light root light inside a .dark ancestor', async ({
  mount,
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.evaluate(() => document.querySelector('#root')?.classList.add('dark'))
  const inkBg = (el: Element) => getComputedStyle(el).getPropertyValue('--ink-bg').trim()
  const dark = await mount(<InkRoot src={null} assets={assets} />)
  await expect.poll(() => dark.evaluate(inkBg)).toBe('#0f1217')
  await dark.unmount()
  const light = await mount(<InkRoot src={null} assets={assets} className="light" />)
  await expect(light).toHaveClass(/light/)
  await expect.poll(() => light.evaluate(inkBg)).toBe('#f1f2f5')
})
