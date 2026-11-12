import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-react'

import { guardConsole } from '../../playwright/console-guard'
import { ControlledHost } from '../../playwright/harness/ControlledHost'
import { EventHost } from '../../playwright/harness/EventHost'
import {
  PasswordHarness,
  StrictPasswordHost,
} from '../../playwright/harness/PasswordHarness'
import { PluginHarness, StrictPluginHost } from '../../playwright/harness/PluginHarness'
import { StrictHost } from '../../playwright/harness/StrictHost'
import { ToolbarHarness } from '../../playwright/harness/ToolbarHarness'
import { ToolSetHarness } from '../../playwright/harness/ToolSetHarness'
import { UncontrolledHost } from '../../playwright/harness/UncontrolledHost'

import { InkRoot } from './InkRoot'

import type { Annotation } from '@inkbar/core'
import type { Page } from '@playwright/test'

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
  const cmp = await mount(
    <EventHost src={fixtureUrl('encrypted-aes')} assets={assets} passwordPrompt={false} />
  )
  await expect(cmp).toHaveAttribute('data-state', 'error')
  await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
  await cmp.update(
    <EventHost
      src={fixtureUrl('encrypted-aes')}
      assets={assets}
      password="inkbar"
      passwordPrompt={false}
    />
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
    <EventHost
      src={null}
      assets={assets}
      bytesFrom={bytesFrom}
      password="wrong"
      passwordPrompt={false}
    />
  )
  await expect(cmp).toHaveAttribute('data-state', 'error')
  await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
  await expect(cmp.getByTestId('byte-length')).toHaveText(String(size))
  await cmp.update(
    <EventHost
      src={null}
      assets={assets}
      bytesFrom={bytesFrom}
      password="inkbar"
      passwordPrompt={false}
    />
  )
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
    const cmp = await mount(<PasswordHarness src={encrypted} assets={assets} />)
    await expect(cmp).toHaveAttribute('data-state', 'locked')
    await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
    await expect(dialog(page)).toBeVisible()
    await expect(field(page)).toBeFocused()
    await expect(field(page)).toHaveAttribute('type', 'password')
    await expect(field(page)).toHaveAttribute('autocomplete', 'off')
    await expect(dialog(page).locator('.ink-password-error')).toHaveCount(0)
    await expect(page.locator('.ink-error')).toHaveCount(0)
    await expect(page.locator('[data-ink-viewport-root]')).toHaveAttribute(
      'data-state',
      'locked'
    )
  })

  test('the right password opens it', async ({ mount, page }) => {
    const cmp = await mount(<PasswordHarness src={encrypted} assets={assets} />)
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
    const cmp = await mount(<PasswordHarness src={encrypted} assets={assets} />)
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
    await mount(<PasswordHarness src={encrypted} assets={assets} />)
    const open = dialog(page).locator('button[type="submit"]')
    await expect(open).toBeDisabled()
    await field(page).fill('x')
    await expect(open).toBeEnabled()
  })

  test('cancel shows the locked panel and the button reopens', async ({
    mount,
    page,
  }) => {
    const cmp = await mount(<PasswordHarness src={encrypted} assets={assets} />)
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
    await mount(<PasswordHarness src={encrypted} assets={assets} />)
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
    const cmp = await mount(
      <PasswordHarness src={encrypted} assets={assets} password="nope" />
    )
    await expect(cmp).toHaveAttribute('data-state', 'locked')
    await expect(dialog(page).locator('.ink-password-error')).toHaveText(
      'Incorrect password. Try again.'
    )
  })

  test("passwordPrompt false keeps today's error", async ({ mount, page }) => {
    const cmp = await mount(
      <PasswordHarness src={encrypted} assets={assets} passwordPrompt={false} />
    )
    await expect(cmp).toHaveAttribute('data-state', 'error')
    await expect(cmp.getByTestId('error-codes')).toHaveText('PasswordRequired')
    await expect(page.locator('.ink-error')).toHaveCount(1)
    await expect(dialog(page)).toHaveCount(0)
  })

  test('a new source closes the dialog', async ({ mount, page }) => {
    const cmp = await mount(<PasswordHarness src={encrypted} assets={assets} />)
    await expect(dialog(page)).toBeVisible()
    await cmp.update(<PasswordHarness src={fixtureUrl('text-simple')} assets={assets} />)
    await expect(cmp).toHaveAttribute('data-state', 'ready')
    await expect(dialog(page)).toHaveCount(0)
  })

  test('a new locked source opens the prompt fresh', async ({ mount, page }) => {
    const cmp = await mount(<PasswordHarness src={encrypted} assets={assets} />)
    await enter(page, 'nope')
    await expect(dialog(page).locator('.ink-password-error')).toBeVisible()
    await expect(cmp.getByTestId('status')).toHaveText('locked:true')
    await cmp.update(
      <PasswordHarness src={fixtureUrl('encrypted-rc4')} assets={assets} />
    )
    await expect(cmp).toHaveAttribute('data-state', 'locked')
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).locator('.ink-password-error')).toHaveCount(0)
    await expect(field(page)).toHaveAttribute('aria-invalid', 'false')
    await expect(cmp.getByTestId('status')).toHaveText('locked:false')
  })

  test('the locked render prop replaces the panel', async ({ mount, page }) => {
    const cmp = await mount(
      <PasswordHarness src={encrypted} assets={assets} customLocked />
    )
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('[data-ink-unlock]')).toHaveCount(0)
    const custom = cmp.getByTestId('custom-unlock')
    await expect(custom).toBeVisible()
    await custom.click()
    await expect(dialog(page)).toBeVisible()
  })

  test('Cancel focuses the first control of the locked render prop', async ({
    mount,
    page,
  }) => {
    await mount(<PasswordHarness src={encrypted} assets={assets} customLocked />)
    await expect(dialog(page)).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.getByTestId('custom-unlock')).toBeFocused()
  })

  test('a retry batched with a new source does not hand it the typed password', async ({
    mount,
    page,
  }) => {
    // Both files open with "inkbar": the new one stays locked only if the typed try was dropped.
    const cmp = await mount(
      <PasswordHarness
        src={encrypted}
        assets={assets}
        switchOnSubmit={fixtureUrl('encrypted-rc4')}
      />
    )
    await expect(dialog(page)).toBeVisible()
    await enter(page, 'inkbar')
    await expect(cmp.getByTestId('error-codes')).toHaveText(
      'PasswordRequired,PasswordRequired'
    )
    await expect(cmp.getByTestId('status')).toHaveText('locked:false')
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).locator('.ink-password-error')).toHaveCount(0)
    // Not stuck pending: the new file's own try opens it.
    await enter(page, 'inkbar')
    await expect(cmp).toHaveAttribute('data-state', 'ready')
  })

  test('a retry under StrictMode fetches the file once', async ({ mount, page }) => {
    let fetches = 0
    await page.route('**/fixtures/encrypted-aes.pdf', async (route) => {
      fetches++
      await route.continue()
    })
    const cmp = await mount(<StrictPasswordHost src={encrypted} assets={assets} />)
    await expect(dialog(page)).toBeVisible()
    expect(fetches).toBe(1)
    await enter(page, 'nope')
    await expect(dialog(page).locator('.ink-password-error')).toBeVisible()
    expect(fetches).toBe(2)
    await enter(page, 'inkbar')
    await expect(cmp.locator('[data-ink-root]')).toHaveAttribute('data-state', 'ready')
    expect(fetches).toBe(3)
    await expect(dialog(page)).toHaveCount(0)
  })
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
      type: 'text',
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
        type: 'text',
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
      type: 'text',
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
  await expect(probe).toHaveAttribute('data-tool', 'select-text')
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

test('batch records a run of additions as one undo step', async ({ mount }) => {
  const cmp = await mount(
    <UncontrolledHost src={fixtureUrl('text-simple')} assets={assets} />
  )
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
  const cmp = await mount(
    <ControlledHost src={fixtureUrl('text-simple')} assets={assets} history={true} />
  )
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

test('a one-shot tool switching back to select text reaches onToolChange and the toolbar', async ({
  mount,
  page,
}) => {
  const tools: string[] = []
  const cmp = await mount(
    <ToolbarHarness
      src={fixtureUrl('text-simple')}
      assets={assets}
      tool="shape"
      onToolChange={(t) => tools.push(t)}
    />
  )
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
  const cmp = await mount(
    <PluginHarness src={fixtureUrl('text-simple')} assets={assets} />
  )
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
  const cmp = await mount(
    <PluginHarness src={fixtureUrl('text-simple')} assets={assets} controlled history />
  )
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
  const cmp = await mount(
    <PluginHarness src={fixtureUrl('text-simple')} assets={assets} controlled history />
  )
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

test('StrictMode sets the plugins up once, and their stores still undo', async ({
  mount,
}) => {
  const cmp = await mount(
    <StrictPluginHost src={fixtureUrl('text-simple')} assets={assets} />
  )
  const probe = cmp.getByTestId('probe')
  await expect(cmp.locator('[data-ink-root]')).toHaveAttribute('data-state', 'ready')
  await expect(probe).toHaveAttribute('data-marks', 'suggested')
  await cmp.locator('button[data-command="sandbox.accept"]').click()
  await expect(probe).toHaveAttribute('data-marks', 'accepted')
  await expect(probe).toHaveAttribute('data-annotations', '1')
  await cmp.locator('[data-ink-undo]').click()
  await expect(probe).toHaveAttribute('data-marks', 'suggested')
  await expect(probe).toHaveAttribute('data-annotations', '0')
  await expect(cmp.getByTestId('setups')).toHaveText('1')
})

/** The console errors seen so far, each for a tool nobody registered. */
const unknownTools = () =>
  consoleGuard.problems.map((m) => /No tool (\S+) is registered/.exec(m)?.[1] ?? m)

test('dropping the active tool falls back to select-text', async ({ mount }) => {
  const tools: string[] = []
  const onToolChange = (t: string) => tools.push(t)
  const src = fixtureUrl('text-simple')
  const cmp = await mount(
    <ToolSetHarness
      src={src}
      assets={assets}
      tool="shape"
      follow
      onToolChange={onToolChange}
    />
  )
  const scroll = cmp.locator('[data-ink-scroll]')
  await expect(scroll).toHaveAttribute('data-ink-tool', 'shape')
  await cmp.update(
    <ToolSetHarness
      src={src}
      assets={assets}
      tool="shape"
      follow
      bare
      onToolChange={onToolChange}
    />
  )
  await expect(scroll).toHaveAttribute('data-ink-tool', 'select-text')
  expect(tools).toEqual(['select-text'])
  expect(unknownTools()).toEqual(['shape'])
  consoleGuard.clear()
})

test('a controlled tool naming a missing tool reports select-text once', async ({
  mount,
}) => {
  const tools: string[] = []
  const onToolChange = (t: string) => tools.push(t)
  const src = fixtureUrl('text-simple')
  // The host feeds each reported tool back into `tool`.
  const cmp = await mount(
    <ToolSetHarness
      src={src}
      assets={assets}
      tool="highlight"
      bare
      follow
      onToolChange={onToolChange}
    />
  )
  const scroll = cmp.locator('[data-ink-scroll]')
  await expect(scroll).toHaveAttribute('data-ink-tool', 'select-text')
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  // A re-render with a new callback changes nothing.
  await cmp.update(
    <ToolSetHarness
      src={src}
      assets={assets}
      tool="highlight"
      bare
      follow
      onToolChange={(t) => tools.push(t)}
    />
  )
  await expect(scroll).toHaveAttribute('data-ink-tool', 'select-text')
  expect(tools).toEqual(['select-text'])
  expect(unknownTools()).toEqual(['highlight'])
  consoleGuard.clear()
})

test('a controlled tool the host keeps on a missing id is not applied again', async ({
  mount,
}) => {
  const tools: string[] = []
  const src = fixtureUrl('text-simple')
  const cmp = await mount(
    <ToolSetHarness
      src={src}
      assets={assets}
      tool="highlight"
      bare
      onToolChange={(t) => tools.push(t)}
    />
  )
  const scroll = cmp.locator('[data-ink-scroll]')
  await expect(scroll).toHaveAttribute('data-ink-tool', 'select-text')
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  // The host keeps passing the missing tool; a re-render does not apply it again.
  await cmp.update(
    <ToolSetHarness
      src={src}
      assets={assets}
      tool="highlight"
      bare
      onToolChange={(t) => tools.push(t)}
    />
  )
  await expect(scroll).toHaveAttribute('data-ink-tool', 'select-text')
  expect(tools).toEqual(['select-text'])
  expect(unknownTools()).toEqual(['highlight'])
  consoleGuard.clear()
})

test('a plugin tool works with no tools prop', async ({ mount }) => {
  const cmp = await mount(
    <PluginHarness src={fixtureUrl('text-simple')} assets={assets} />
  )
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
  expect(unknownTools()).toEqual([])
})
