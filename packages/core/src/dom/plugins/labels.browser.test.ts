import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { mountContainer, until } from '../test-utils'
import { createCommandButton } from '../viewer/controls'
import { createViewer, type Viewer } from '../viewer/create-viewer'

import { definePlugin, type InkPlugin } from './define'

import type { CardSpec } from './api/card'
import type { Rect } from '../../model/geometry'
import type { RecordBase } from '../../model/records'

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = '.ink-scroll { height: 500px; }'
  document.head.append(style)
})

let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((f) => f())
  cleanup = []
  vi.restoreAllMocks()
})

function make(plugins: InkPlugin[]): Viewer {
  const host = mountContainer(800, 600)
  const viewer = createViewer(host, {
    source: fixtureUrl('text-simple'),
    assets: browserAssets(),
    zoom: 1,
    plugins,
  })
  cleanup.push(() => {
    viewer.destroy()
    host.remove()
  })
  return viewer
}

const ready = (viewer: Viewer) =>
  until(() => viewer.status.get().state === 'ready' && viewer.engine.get() !== null)

const commandButton = (el: HTMLElement, id: string) =>
  el.querySelector<HTMLButtonElement>(`button[data-command="${id}"]`)!

describe('command labels', () => {
  it('a command label function follows setMessages', () => {
    let lang = 'en'
    const plugin = definePlugin('demo', (p) => {
      p.command(
        'go',
        () => (lang === 'fr' ? 'Aller' : 'Go'),
        () => undefined
      )
    })
    const viewer = make([plugin()])
    const el = createCommandButton(viewer, 'demo.go')
    viewer.element.append(el)
    const b = commandButton(el, 'demo.go')
    expect(b.getAttribute('aria-label')).toBe('Go')
    expect(b.textContent).toBe('Go')
    lang = 'fr'
    viewer.setMessages(undefined)
    expect(commandButton(el, 'demo.go')).toBe(b)
    expect(b.getAttribute('aria-label')).toBe('Aller')
    expect(b.title).toBe('Aller')
    expect(b.textContent).toBe('Aller')
  })

  it('a throwing command label does not break the toolbar', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const plugin = definePlugin('demo', (p) => {
      p.command(
        'bad',
        () => {
          throw new Error('no words')
        },
        () => undefined
      )
      p.command('good', 'Good', () => undefined)
    })
    const viewer = make([plugin()])
    const bad = createCommandButton(viewer, 'demo.bad')
    const good = createCommandButton(viewer, 'demo.good')
    viewer.element.append(bad, good)
    expect(commandButton(bad, 'demo.bad').getAttribute('aria-label')).toBe('demo.bad')
    expect(commandButton(good, 'demo.good').getAttribute('aria-label')).toBe('Good')
    expect(warn).toHaveBeenCalled()
  })

  it('an empty label function result warns and falls back to the command id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const plugin = definePlugin('demo', (p) => {
      p.command(
        'blank',
        () => '',
        () => undefined
      )
    })
    const viewer = make([plugin()])
    const el = createCommandButton(viewer, 'demo.blank')
    expect(commandButton(el, 'demo.blank').getAttribute('aria-label')).toBe('demo.blank')
    expect(warn).toHaveBeenCalled()
  })

  it('the default errorStatus comes from messages, and follows them', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const plugin = definePlugin('demo', (p) => {
      p.command('fail', 'Fail', () => {
        throw new Error('boom')
      })
    })
    const viewer = make([plugin()])
    viewer.setMessages({ plugins: { commandFailed: 'Ça a raté.' } })
    const el = createCommandButton(viewer, 'demo.fail')
    viewer.element.append(el)
    await ready(viewer)
    const b = commandButton(el, 'demo.fail')
    await until(() => !b.disabled)
    b.click()
    const live = el.querySelector('.ink-command-status')!
    await until(() => live.textContent === 'Ça a raté.')
    viewer.setMessages(undefined)
    expect(live.textContent).toBe('Something went wrong.')
  })
})

interface Finding extends RecordBase {
  page: number
  rect: Rect
}

describe('card labels', () => {
  /** A viewer with one mark whose card is `card`. */
  async function withCard(card: () => CardSpec, label: () => string = () => 'Finding') {
    const plugin = definePlugin('sandbox', (p) => {
      const findings = p.records<Finding>('findings', {
        initial: () => [
          { id: 'a', page: 0, rect: { x: 100, y: 500, width: 144, height: 40 } },
        ],
      })
      p.marks(findings, { rect: (f) => f.rect, label, card })
    })
    const viewer = make([plugin()])
    await ready(viewer)
    const mark = () =>
      viewer.element.querySelector<HTMLButtonElement>('button[data-record="a"]')
    await until(() => mark() !== null)
    return { viewer, mark: mark()! }
  }
  const openCard = () =>
    [...document.querySelectorAll<HTMLElement>('[data-ink-popover].ink-card')].find(
      (el) => !el.hidden
    )!
  const actionsOf = (card: HTMLElement) => [
    ...card.querySelectorAll<HTMLButtonElement>('.ink-card-actions > button'),
  ]

  it('card actions as an array keep order and relabel', async () => {
    let a = 'One'
    const run = vi.fn()
    const { viewer, mark } = await withCard(() => ({
      title: () => `Title ${a}`,
      actions: [
        { label: () => a, run },
        { label: 'Two', run: () => {} },
      ],
    }))
    await userEvent.click(mark)
    const card = openCard()
    expect(actionsOf(card).map((b) => b.textContent)).toEqual(['One', 'Two'])
    expect(card.querySelector('.ink-card-title')?.textContent).toBe('Title One')
    expect(card.getAttribute('aria-label')).toBe('Title One')
    a = 'Un'
    viewer.setMessages(undefined)
    expect(actionsOf(openCard()).map((b) => b.textContent)).toEqual(['Un', 'Two'])
    expect(openCard().querySelector('.ink-card-title')?.textContent).toBe('Title Un')
    expect(openCard().getAttribute('aria-label')).toBe('Title Un')
    await userEvent.click(actionsOf(openCard())[0]!)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('equal messages leave an open card as it is', async () => {
    const { viewer, mark } = await withCard(() => ({
      title: () => 'Title',
      meta: 'Page 1',
      actions: [
        { label: () => 'One', run: () => {} },
        { label: 'Two', run: () => {} },
      ],
    }))
    await userEvent.click(mark)
    const card = openCard()
    const title = card.querySelector('.ink-card-title')
    const buttons = actionsOf(card)
    buttons[1]!.focus()
    let changes = 0
    const observer = new MutationObserver((records) => {
      changes += records.filter((r) => r.type === 'childList').length
    })
    observer.observe(card, { childList: true, subtree: true })
    for (let i = 0; i < 3; i++) viewer.setMessages({ find: { close: 'X' } })
    await Promise.resolve()
    observer.disconnect()
    expect(changes).toBe(0)
    expect(card.querySelector('.ink-card-title')).toBe(title)
    expect(actionsOf(card)).toEqual(buttons)
    expect(document.activeElement).toBe(buttons[1])
  })

  it('a mark label re-runs on setMessages', async () => {
    let word = 'Finding'
    const { viewer, mark } = await withCard(
      () => ({ title: 'T', actions: {} }),
      () => word
    )
    expect(mark.getAttribute('aria-label')).toBe('Finding')
    word = 'Constat'
    viewer.setMessages(undefined)
    await until(() => mark.getAttribute('aria-label') === 'Constat')
    expect(viewer.element.querySelector('button[data-record="a"]')).toBe(mark)
  })
})
