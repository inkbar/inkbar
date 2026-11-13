import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-react'

import { guardConsole } from '../../playwright/console-guard'
import { MessagesHarness } from '../../playwright/harness/MessagesHarness'

import type { Locator, Page } from '@playwright/test'

const assets = browserAssets()
guardConsole(test)

const french = {
  toolbar: { find: 'Rechercher', undo: 'Annuler', previousPage: 'Page précédente' },
}

type Stored = { id: string; contents?: string; createdAt: string }
type RootEl = HTMLElement & {
  __inkDocument?: { annotations: { list: { get(): Stored[] } } }
}
type TestWindow = Window & { __inkDrawWord?: string; __inkRenders?: number }

const stored = (page: Page) =>
  page
    .locator('[data-ink-root]')
    .evaluate((el) => (el as RootEl).__inkDocument!.annotations.list.get())

const firstPage = (page: Page): Locator => page.locator('.ink-page[data-page="0"]')

test('French labels', async ({ mount, page }) => {
  await mount(
    <MessagesHarness src={fixtureUrl('text-simple')} assets={assets} messages={french} />
  )
  await expect(firstPage(page)).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Rechercher' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Annuler' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Page précédente' })).toHaveCount(1)
  // Keys left out stay English.
  await expect(page.getByRole('button', { name: 'Redo' })).toHaveCount(1)
})

test('switching messages keeps an open menu open', async ({ mount, page }) => {
  const src = fixtureUrl('text-simple')
  const cmp = await mount(<MessagesHarness src={src} assets={assets} />)
  await expect(firstPage(page)).toHaveCount(1)
  const before = await firstPage(page).elementHandle()
  await page.getByRole('button', { name: 'Choose shape' }).click()
  const menu = page.locator('[data-ink-menu="shape"]')
  await expect(menu.getByRole('group', { name: 'Shapes' })).toBeVisible()
  const focused = await menu.evaluate((m) => m.contains(document.activeElement))
  expect(focused).toBe(true)

  await cmp.update(
    <MessagesHarness
      src={src}
      assets={assets}
      messages={{ shape: { menu: 'Formes', choose: 'Forme' } }}
    />
  )
  await expect(menu.getByRole('group', { name: 'Formes' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Forme', exact: true })).toHaveCount(1)
  // Focus stays in the menu: its items were not remounted.
  expect(await menu.evaluate((m) => m.contains(document.activeElement))).toBe(true)
  // The same page element: nothing remounted.
  expect(await before.evaluate((el) => el.isConnected)).toBe(true)
  expect(await firstPage(page).evaluate((el, b) => el === b, before)).toBe(true)
})

test('locale sets lang and formats note dates', async ({ mount, page }) => {
  const src = fixtureUrl('annotated-notes-threaded')
  const cmp = await mount(<MessagesHarness src={src} assets={assets} locale="de-DE" />)
  const root = page.locator('[data-ink-root]')
  await expect(root).toHaveAttribute('lang', 'de-DE')
  await expect(cmp.locator('[data-annotation]')).toHaveCount(2)
  const note = (await stored(page)).find((a) => a.contents === 'Root note')!
  await cmp.locator(`[data-annotation="${note.id}"]`).focus()
  await page.keyboard.press('Enter')
  const time = page.locator('[data-ink-thread-item]').first().locator('time')
  const expected = await page.evaluate(
    (iso) => new Date(iso).toLocaleString('de-DE'),
    note.createdAt
  )
  await expect(time).toHaveText(expected)

  // A new locale reformats the open popover, and an invalid one drops `lang`.
  await cmp.update(<MessagesHarness src={src} assets={assets} locale="en-US" />)
  await expect(root).toHaveAttribute('lang', 'en-US')
  const us = await page.evaluate(
    (iso) => new Date(iso).toLocaleString('en-US'),
    note.createdAt
  )
  await expect(time).toHaveText(us)
  await cmp.update(<MessagesHarness src={src} assets={assets} locale="not a locale!" />)
  await expect(root).not.toHaveAttribute('lang')
})

test('the shipped French sets lang="fr" with no locale', async ({ mount, page }) => {
  await mount(<MessagesHarness src={fixtureUrl('text-simple')} assets={assets} french />)
  await expect(page.locator('[data-ink-root]')).toHaveAttribute('lang', 'fr')
  await expect(page.getByRole('button', { name: 'Rechercher' })).toHaveCount(1)
})

test('a function label follows messages', async ({ mount, page }) => {
  const src = fixtureUrl('text-simple')
  const cmp = await mount(<MessagesHarness src={src} assets={assets} />)
  const draw = page.locator('[data-tool="draw"]')
  await expect(draw).toHaveAccessibleName('Pen')
  await page.evaluate(() => {
    ;(window as TestWindow).__inkDrawWord = 'Stylo'
  })
  await cmp.update(
    <MessagesHarness
      src={src}
      assets={assets}
      messages={{ toolbar: { undo: 'Annuler' } }}
    />
  )
  await expect(draw).toHaveAccessibleName('Stylo')
})

test('the zoom trigger follows messages while closed', async ({ mount, page }) => {
  const src = fixtureUrl('text-simple')
  const cmp = await mount(<MessagesHarness src={src} assets={assets} zoom="fit-width" />)
  const trigger = page.locator('[data-ink-zoom-select]')
  await expect(trigger).toHaveText('Fit width')
  await cmp.update(
    <MessagesHarness
      src={src}
      assets={assets}
      zoom="fit-width"
      messages={{ toolbar: { fitWidth: 'Pleine largeur' } }}
    />
  )
  await expect(trigger).toHaveText('Pleine largeur')
  await expect(trigger).toHaveAttribute('data-state', 'closed')

  await cmp.update(<MessagesHarness src={src} assets={assets} zoom={1} />)
  await expect(trigger).toHaveText('100%')
  await cmp.update(
    <MessagesHarness src={src} assets={assets} zoom={1} percentSuffix="pour cent" />
  )
  await expect(trigger).toHaveText('100 pour cent')
  await expect(trigger).toHaveAttribute('data-state', 'closed')
})

test('an inline messages object each render does not remount', async ({
  mount,
  page,
}) => {
  const src = fixtureUrl('text-simple')
  const cmp = await mount(<MessagesHarness src={src} assets={assets} inline />)
  await expect(firstPage(page)).toHaveCount(1)
  const before = await firstPage(page).elementHandle()
  await page.getByRole('button', { name: 'Choose highlight' }).click()
  const menu = page.locator('[data-ink-menu="highlight"]')
  await expect(menu).toBeVisible()
  const renders = () => page.evaluate(() => (window as TestWindow).__inkRenders ?? 0)
  const start = await renders()

  for (let tick = 1; tick <= 10; tick++)
    await cmp.update(<MessagesHarness src={src} assets={assets} inline tick={tick} />)
  await expect(page.locator('[data-ink-root]')).toHaveAttribute('data-tick', '10')

  await expect(menu).toBeVisible()
  expect(await menu.evaluate((m) => m.contains(document.activeElement))).toBe(true)
  // No harness hook spies on `mountViewer`: the same page element shows nothing remounted.
  expect(await firstPage(page).evaluate((el, b) => el === b, before)).toBe(true)
  // A few renders per host render (the prop, then the store's new words), never a loop.
  const settled = await renders()
  await page.waitForTimeout(200)
  expect(await renders()).toBe(settled)
  expect(settled - start).toBeLessThanOrEqual(40)
})

test('an inline messages object each render leaves an open card alone', async ({
  mount,
  page,
}) => {
  const src = fixtureUrl('text-simple')
  const cmp = await mount(<MessagesHarness src={src} assets={assets} inline withCard />)
  await page.locator('[data-ink-scroll] button[data-record="s0"]').click()
  const card = page.locator('[data-ink-popover].ink-card')
  await expect(card).toBeVisible()
  await expect(card.getByRole('button', { name: 'Accept' })).toBeFocused()
  await card.evaluate((el) => {
    const w = window as Window & { __inkCardChanges?: number }
    w.__inkCardChanges = 0
    new MutationObserver((records) => {
      w.__inkCardChanges! += records.filter((r) => r.type === 'childList').length
    }).observe(el, { childList: true, subtree: true })
  })

  for (let tick = 1; tick <= 5; tick++)
    await cmp.update(
      <MessagesHarness src={src} assets={assets} inline withCard tick={tick} />
    )
  await expect(page.locator('[data-ink-root]')).toHaveAttribute('data-tick', '5')
  await page.waitForTimeout(100)

  const changes = await page.evaluate(
    () => (window as Window & { __inkCardChanges?: number }).__inkCardChanges
  )
  expect(changes).toBe(0)
  await expect(card).toBeVisible()
  await expect(card.getByRole('button', { name: 'Accept' })).toBeFocused()
})
