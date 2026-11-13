import { browserAssets, fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { mountContainer, until } from '../test-utils'
import { drawTool } from '../tools'

import { createToolButton } from './controls'
import { createViewer, type CreateViewerOptions, type Viewer } from './create-viewer'

import type { Tool } from '../tools/controller'

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = '.ink-scroll { height: 500px; }'
  document.head.append(style)
})

let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((f) => f())
  cleanup = []
})

function make(
  opts: Partial<CreateViewerOptions> = {},
  name: FixtureName = 'annotated-notes-threaded'
) {
  const host = mountContainer(800, 600)
  const viewer = createViewer(host, {
    source: fixtureUrl(name),
    assets: browserAssets(),
    zoom: 1,
    ...opts,
  })
  cleanup.push(() => {
    viewer.destroy()
    host.remove()
  })
  return { host, viewer }
}

const ready = (viewer: Viewer) =>
  until(() => viewer.status.get().state === 'ready' && viewer.engine.get() !== null)

describe('createViewer messages and locale', () => {
  it('names the scroller from messages, and relabels the same element', async () => {
    const { viewer } = make({ messages: { viewer: { document: 'Dokument' } } })
    const scroller = viewer.element.querySelector<HTMLElement>('[data-ink-scroll]')!
    expect(scroller.getAttribute('aria-label')).toBe('Dokument')
    await ready(viewer)
    viewer.setMessages({ viewer: { document: 'Doc' } })
    expect(scroller.getAttribute('aria-label')).toBe('Doc')
    expect(viewer.element.querySelector('[data-ink-scroll]')).toBe(scroller)
    expect(scroller.isConnected).toBe(true)
  })

  it('keeps the messages across open()', async () => {
    const { viewer } = make({ messages: { viewer: { document: 'Dokument' } } })
    await ready(viewer)
    const engine = viewer.engine.get()!
    viewer.setMessages({ viewer: { document: 'Doc' } })
    viewer.open(fixtureUrl('links'))
    await until(() => viewer.engine.get() !== null && viewer.engine.get() !== engine)
    expect(viewer.engine.get()!.messages.get().messages.viewer.document).toBe('Doc')
  })

  it('shows the loading text from messages', () => {
    const { viewer } = make({ messages: { viewer: { loading: 'Chargement…' } } })
    expect(viewer.element.querySelector('.ink-status')?.textContent).toBe('Chargement…')
    viewer.setMessages(undefined)
    expect(viewer.element.querySelector('.ink-status')?.textContent).toBe(
      'Loading document…'
    )
  })

  it('locale sets lang on the root; undefined or an invalid tag removes it', () => {
    const { viewer } = make({ locale: 'fr-CA' })
    const root = viewer.element
    expect(root.matches('[data-ink-root]')).toBe(true)
    expect(root.getAttribute('lang')).toBe('fr-CA')
    viewer.setLocale(undefined)
    expect(root.hasAttribute('lang')).toBe(false)
    viewer.setLocale('de')
    expect(root.getAttribute('lang')).toBe('de')
    expect(() => viewer.setLocale('xx-!!')).not.toThrow()
    expect(root.hasAttribute('lang')).toBe(false)
  })

  it('the engine follows the viewer', async () => {
    const { viewer } = make({ locale: 'fr' })
    await ready(viewer)
    const engine = viewer.engine.get()!
    expect(engine.messages.get().locale).toBe('fr')
    viewer.setMessages({ find: { close: 'Fermer' } })
    expect(engine.messages.get().messages.find.close).toBe('Fermer')
    expect(engine.messages.get().locale).toBe('fr')
  })
})

describe('tool button names', () => {
  it('a host tool with a function label shows what it returns', () => {
    const mine: Tool = { ...drawTool(), id: 'mine', label: () => 'Mine' }
    const { viewer } = make({ tools: [mine] })
    const b = createToolButton(viewer, 'mine')
    expect(b.getAttribute('aria-label')).toBe('Mine')
  })

  it('a built-in tool is named from messages, live', () => {
    const { viewer } = make({
      tools: [drawTool()],
      messages: { tools: { draw: 'Dessiner' } },
    })
    const b = createToolButton(viewer, 'draw')
    expect(b.getAttribute('aria-label')).toBe('Dessiner')
    expect(b.title).toBe('Dessiner')
    viewer.setMessages(undefined)
    expect(b.getAttribute('aria-label')).toBe('Draw')
    expect(b.title).toBe('Draw')
  })

  it('select tools are named from messages', () => {
    const { viewer } = make({ messages: { tools: { 'select-text': 'Texte' } } })
    expect(createToolButton(viewer, 'select-text').getAttribute('aria-label')).toBe(
      'Texte'
    )
    expect(createToolButton(viewer, 'select').getAttribute('aria-label')).toBe(
      'Rectangle select'
    )
  })
})
