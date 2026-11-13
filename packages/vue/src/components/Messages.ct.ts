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
