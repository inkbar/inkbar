import { fr } from '@inkbar/core/locales/fr'
import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { describe, expect, it } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { count, q } from './dom.js'
import MessagesHarness, {
  type MessagesHarnessProps,
  type MessagesWindow,
} from './harness/MessagesHarness.svelte'

const assets = browserAssets()
guardConsole()

type Stored = { id: string; contents?: string; createdAt: string }
type RootEl = HTMLElement & {
  __inkDocument?: { annotations: { list: { get(): Stored[] } } }
}

const FIRST = '.ink-page[data-page="0"]'
const root = () => document.querySelector<RootEl>('[data-ink-root]')!
const stored = () => root().__inkDocument!.annotations.list.get()
const button = (name: string) => browserPage.getByRole('button', { name, exact: true })
const inMenu = (menu: Element) => menu.contains(document.activeElement)
const harness = (props: MessagesHarnessProps) => render(MessagesHarness, props)

const french = {
  toolbar: { find: 'Rechercher', undo: 'Annuler', previousPage: 'Page précédente' },
}

describe('messages', () => {
  it('French labels', async () => {
    await harness({ src: fixtureUrl('text-simple'), assets, messages: french })
    await q(FIRST)
    await expect.element(button('Rechercher')).toBeInTheDocument()
    await expect.element(button('Annuler')).toBeInTheDocument()
    await expect.element(button('Page précédente')).toBeInTheDocument()
    // Keys left out stay English.
    await expect.element(button('Redo')).toBeInTheDocument()
  })

  it('switching messages keeps an open menu open', async () => {
    const src = fixtureUrl('text-simple')
    const screen = await harness({ src, assets })
    const before = await q(FIRST)
    await button('Choose shape').click()
    const menu = await q('[data-ink-menu="shape"]')
    await expect
      .element(browserPage.elementLocator(menu).getByRole('group', { name: 'Shapes' }))
      .toBeVisible()
    await expect.poll(() => inMenu(menu)).toBe(true)

    await screen.rerender({ messages: { shape: { menu: 'Formes', choose: 'Forme' } } })
    await expect
      .element(browserPage.elementLocator(menu).getByRole('group', { name: 'Formes' }))
      .toBeVisible()
    await expect.element(button('Forme')).toBeInTheDocument()
    // The same menu, with focus still in it: its items were not remounted.
    expect(menu.isConnected).toBe(true)
    expect(inMenu(menu)).toBe(true)
    // The same page element: nothing remounted.
    expect(before.isConnected).toBe(true)
    expect(document.querySelector(FIRST)).toBe(before)
  })

  it('locale sets lang and formats note dates', async () => {
    const screen = await harness({
      src: fixtureUrl('annotated-notes-threaded'),
      assets,
      locale: 'de-DE',
    })
    await expect.poll(() => root().getAttribute('lang')).toBe('de-DE')
    await expect.poll(count('[data-annotation]')).toBe(2)
    const note = stored().find((a) => a.contents === 'Root note')!
    const anchor = await q(`[data-annotation="${note.id}"]`)
    anchor.focus()
    await userEvent.keyboard('{Enter}')
    const time = await q('[data-ink-thread-item] time')
    const de = new Date(note.createdAt).toLocaleString('de-DE')
    await expect.poll(() => time.textContent?.trim()).toBe(de)

    // A new locale reformats the open popover, and an invalid one drops `lang`.
    await screen.rerender({ locale: 'en-US' })
    await expect.poll(() => root().getAttribute('lang')).toBe('en-US')
    const us = new Date(note.createdAt).toLocaleString('en-US')
    await expect.poll(() => time.textContent?.trim()).toBe(us)
    await screen.rerender({ locale: 'not a locale!' })
    await expect.poll(() => root().hasAttribute('lang')).toBe(false)
  })

  it('the shipped French sets lang="fr" with no locale', async () => {
    await harness({ src: fixtureUrl('text-simple'), assets, messages: fr })
    await expect.poll(() => root().getAttribute('lang')).toBe('fr')
    await expect.element(button('Rechercher')).toBeInTheDocument()
  })

  it("the host's lang wins, but lang={undefined} keeps the computed one", async () => {
    const src = fixtureUrl('text-simple')
    const screen = await harness({
      src,
      assets,
      messages: fr,
      rootAttrs: { lang: undefined },
    })
    await expect.poll(() => root().getAttribute('lang')).toBe('fr')
    await screen.rerender({ rootAttrs: { lang: 'fr-CA' } })
    await expect.poll(() => root().getAttribute('lang')).toBe('fr-CA')
  })

  it('a function label follows messages', async () => {
    const screen = await harness({ src: fixtureUrl('text-simple'), assets })
    await expect.element(button('Pen')).toBeInTheDocument()
    ;(window as MessagesWindow).__inkDrawWord = 'Stylo'
    try {
      await screen.rerender({ messages: { toolbar: { undo: 'Annuler' } } })
      await expect.element(button('Stylo')).toBeInTheDocument()
    } finally {
      ;(window as MessagesWindow).__inkDrawWord = undefined
    }
  })

  it('the zoom trigger follows messages while closed', async () => {
    const src = fixtureUrl('text-simple')
    const screen = await harness({ src, assets, zoom: 'fit-width' })
    const trigger = await q('[data-ink-zoom-select]')
    await expect.poll(() => trigger.textContent?.trim()).toBe('Fit width')
    await screen.rerender({ messages: { toolbar: { fitWidth: 'Pleine largeur' } } })
    await expect.poll(() => trigger.textContent?.trim()).toBe('Pleine largeur')
    expect(trigger.getAttribute('data-state')).toBe('closed')

    await screen.rerender({ zoom: 1, messages: undefined })
    await expect.poll(() => trigger.textContent?.trim()).toBe('100%')
    await screen.rerender({
      messages: { toolbar: { zoomPercent: ({ percent }) => `${percent} pour cent` } },
    })
    await expect.poll(() => trigger.textContent?.trim()).toBe('100 pour cent')
    expect(trigger.getAttribute('data-state')).toBe('closed')
  })
})
