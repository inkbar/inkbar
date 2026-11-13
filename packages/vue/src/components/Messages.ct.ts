import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import { guardConsole } from '../../playwright/console-guard'
import Harness from '../../playwright/harness/MessagesHarness.vue'

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
const stored = (page: Page) =>
  page
    .locator('[data-ink-root]')
    .evaluate((el) => (el as RootEl).__inkDocument!.annotations.list.get())

const firstPage = (page: Page): Locator => page.locator('.ink-page[data-page="0"]')

test('French labels', async ({ mount, page }) => {
  await mount(Harness, {
    props: { src: fixtureUrl('text-simple'), assets, messages: french },
  })
  await expect(firstPage(page)).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Rechercher' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Annuler' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Page précédente' })).toHaveCount(1)
  // Keys left out stay English.
  await expect(page.getByRole('button', { name: 'Redo' })).toHaveCount(1)
})

test('switching messages keeps an open menu open', async ({ mount, page }) => {
  const cmp = await mount(Harness, { props: { src: fixtureUrl('text-simple'), assets } })
  await expect(firstPage(page)).toHaveCount(1)
  const before = await firstPage(page).elementHandle()
  await page.getByRole('button', { name: 'Choose shape' }).click()
  const menu = page.locator('[data-ink-menu="shape"]')
  await expect(menu.getByRole('group', { name: 'Shapes' })).toBeVisible()

  await cmp.update({
    props: { messages: { shape: { menu: 'Formes', choose: 'Forme' } } },
  })
  await expect(menu.getByRole('group', { name: 'Formes' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Forme', exact: true })).toHaveCount(1)
  // The same page element: nothing remounted.
  expect(await before.evaluate((el) => el.isConnected)).toBe(true)
  expect(await firstPage(page).evaluate((el, b) => el === b, before)).toBe(true)
})

test('locale sets lang and formats note dates', async ({ mount, page }) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('annotated-notes-threaded'), assets, locale: 'de-DE' },
  })
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
  await cmp.update({ props: { locale: 'en-US' } })
  await expect(root).toHaveAttribute('lang', 'en-US')
  const us = await page.evaluate(
    (iso) => new Date(iso).toLocaleString('en-US'),
    note.createdAt
  )
  await expect(time).toHaveText(us)
  await cmp.update({ props: { locale: 'not a locale!' } })
  await expect(root).not.toHaveAttribute('lang')
})

test('the shipped French sets lang="fr" with no locale', async ({ mount, page }) => {
  await mount(Harness, {
    props: { src: fixtureUrl('text-simple'), assets, french: true },
  })
  await expect(page.locator('[data-ink-root]')).toHaveAttribute('lang', 'fr')
  await expect(page.getByRole('button', { name: 'Rechercher' })).toHaveCount(1)
})

test('a function label follows messages', async ({ mount, page }) => {
  const cmp = await mount(Harness, { props: { src: fixtureUrl('text-simple'), assets } })
  const draw = page.locator('[data-tool="draw"]')
  await expect(draw).toHaveAccessibleName('Pen')
  await page.evaluate(() => {
    ;(window as Window & { __inkDrawWord?: string }).__inkDrawWord = 'Stylo'
  })
  await cmp.update({ props: { messages: { toolbar: { undo: 'Annuler' } } } })
  await expect(draw).toHaveAccessibleName('Stylo')
})

test('a function label follows locale', async ({ mount, page }) => {
  const cmp = await mount(Harness, { props: { src: fixtureUrl('text-simple'), assets } })
  const draw = page.locator('[data-tool="draw"]')
  await expect(draw).toHaveAccessibleName('Pen')
  await page.evaluate(() => {
    ;(window as Window & { __inkDrawWord?: string }).__inkDrawWord = 'Stylo'
  })
  await cmp.update({ props: { locale: 'fr-FR' } })
  await expect(page.locator('[data-ink-root]')).toHaveAttribute('lang', 'fr-FR')
  await expect(draw).toHaveAccessibleName('Stylo')
})

test('search result cards follow messages', async ({ mount, page }) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('text-simple'), assets, withResults: true },
  })
  await expect(page.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  const results = page.getByTestId('results')
  await results.getByRole('textbox', { name: 'Find in document' }).fill('Inkbar')
  const first = results.locator('[data-ink-record]').first()
  await expect(first.locator('.ink-card-meta')).toHaveText('Match 1')
  await cmp.update({ props: { french: true } })
  await expect(first.locator('.ink-card-meta')).toHaveText('Occurrence 1')
})

test('the zoom trigger follows messages while closed', async ({ mount, page }) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('text-simple'), assets, zoom: 'fit-width' },
  })
  const trigger = page.locator('[data-ink-zoom-select]')
  await expect(trigger).toHaveText('Fit width')
  await cmp.update({ props: { messages: { toolbar: { fitWidth: 'Pleine largeur' } } } })
  await expect(trigger).toHaveText('Pleine largeur')
  await expect(trigger).toHaveAttribute('data-state', 'closed')

  await cmp.update({ props: { zoom: 1 } })
  await expect(trigger).toHaveText('100%')
  await cmp.update({ props: { percentSuffix: 'pour cent' } })
  await expect(trigger).toHaveText('100 pour cent')
  await expect(trigger).toHaveAttribute('data-state', 'closed')
})

test('equal messages passed again leave an open card alone', async ({ mount, page }) => {
  const src = fixtureUrl('text-simple')
  const cmp = await mount(Harness, {
    props: { src, assets, withCard: true, messages: { find: { close: 'X' } } },
  })
  await page.locator('[data-ink-scroll] button[data-record="s0"]').click()
  const card = page.locator('[data-ink-popover].ink-card')
  await expect(card).toBeVisible()
  await expect(card.getByRole('button', { name: 'Accept' })).toBeFocused()
  await card.evaluate((el) => {
    const w = window as Window & { __inkCardChanges?: number; __inkCard?: Element }
    w.__inkCard = el
    w.__inkCardChanges = 0
    new MutationObserver((records) => {
      w.__inkCardChanges! += records.filter((r) => r.type === 'childList').length
    }).observe(el, { childList: true, subtree: true })
  })

  for (let i = 0; i < 5; i++)
    await cmp.update({ props: { messages: { find: { close: 'X' } } } })
  await page.waitForTimeout(100)

  const changes = await page.evaluate(
    () => (window as Window & { __inkCardChanges?: number }).__inkCardChanges
  )
  expect(changes).toBe(0)
  // The same card element: the observer above would miss a card replaced whole.
  expect(
    await card.evaluate(
      (el) => el === (window as Window & { __inkCard?: Element }).__inkCard
    )
  ).toBe(true)
  await expect(card).toBeVisible()
  await expect(card.getByRole('button', { name: 'Accept' })).toBeFocused()
})

test("the host's lang wins, but an undefined lang keeps the computed one", async ({
  mount,
  page,
}) => {
  const src = fixtureUrl('text-simple')
  const root = page.locator('[data-ink-root]')
  const cmp = await mount(Harness, {
    props: { src, assets, french: true, undefinedLang: true },
  })
  await expect(root).toHaveAttribute('lang', 'fr')
  await cmp.update({ props: { undefinedLang: false, hostLang: 'fr-CA' } })
  await expect(root).toHaveAttribute('lang', 'fr-CA')
})
