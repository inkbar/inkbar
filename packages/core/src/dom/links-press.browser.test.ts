import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { writable } from '../model/readable'

import { definePlugin, type PluginContext } from './plugins/define'
import { createPluginHost } from './plugins/host'
import { mountContainer, openFixtureInBrowser, settle, until } from './test-utils'
import { highlightTool } from './tools/highlight'
import { mountViewer, type MountViewerOptions } from './viewer-engine'

import type { ViewerAction } from '../model/form/types'
import type { Point } from '../model/geometry'
import type { PageLink } from '../model/links'
import type { PagePress } from './tools/press'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((f) => f())
  vi.restoreAllMocks()
})

async function setup(
  opts: Partial<MountViewerOptions> & {
    /** Replaces page 0's links before the viewer mounts. */
    links?: PageLink[]
    /** Listens for plugin presses. */
    withPlugins?: boolean
  } = {}
) {
  const style = document.createElement('style')
  style.textContent = themeCss
  document.head.append(style)
  const doc = await openFixtureInBrowser('links')
  if (opts.links) {
    const real = doc.links.bind(doc)
    vi.spyOn(doc, 'links').mockImplementation((page) =>
      page === 0 ? opts.links! : real(page)
    )
  }
  const container = mountContainer(800, 900)
  const onPress = vi.fn<(press: PagePress) => void>()
  const onLongPress = vi.fn<(press: PagePress) => void>()
  const plugins = opts.withPlugins
    ? createPluginHost({
        plugins: [
          definePlugin({
            id: 'probe',
            setup(ctx: PluginContext) {
              ctx.onPress(onPress)
              ctx.onLongPress(onLongPress)
            },
          }),
        ],
        document: writable(doc),
        history: () => doc.history,
        activated: writable<string | null>(null),
        setActivated() {},
        root: writable<HTMLElement | null>(container),
      })
    : undefined
  const { links: _links, withPlugins: _withPlugins, ...rest } = opts
  const engine = mountViewer({
    container,
    document: doc,
    zoom: 1,
    buffer: 0,
    ...(plugins ? { plugins } : {}),
    ...rest,
  })
  cleanup.push(() => {
    engine.destroy()
    plugins?.destroy()
    doc.destroy()
    container.remove()
    style.remove()
  })
  await until(() => engine.pages.size > 0)
  await engine.pages.get(0)!.textLayer.ready
  const scrolled = vi.spyOn(engine.viewport, 'scrollToDestination')
  return { doc, container, engine, scrolled, onPress, onLongPress }
}

type Engine = Awaited<ReturnType<typeof setup>>['engine']

/** The client point of user-space `p` on `page`. */
function clientOf(engine: Engine, page: number, p: Point): Point {
  const box = engine.viewport.hostFor(page)!.getBoundingClientRect()
  const css = engine.viewport.transformFor(page).toCss(p)
  return { x: box.left + css.x, y: box.top + css.y }
}

function pointer(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  at: Point,
  init: PointerEventInit = {}
) {
  const target = document.elementFromPoint(at.x, at.y)!
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: at.x,
      clientY: at.y,
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: type === 'pointerdown' ? 1 : 0,
      isPrimary: true,
      ...init,
    })
  )
}

function tap(at: Point, init: PointerEventInit = {}) {
  pointer('pointerdown', at, init)
  pointer('pointerup', at, init)
}

/** User-space centres of the fixture's links on page 0 (see the manifest). */
const CHAPTER_2 = { x: 103, y: 705 }
const EXAMPLE_A = { x: 106, y: 645 }

/** The text layer span that shows `text` on `page`. */
function spanOf(engine: Engine, text: string, page = 0): HTMLElement {
  const host = engine.viewport.hostFor(page)!
  return [...host.querySelectorAll<HTMLElement>('[data-ink-text-layer] span')].find(
    (s) => s.textContent === text
  )!
}

describe('following links with the pointer', () => {
  it('click on a link follows it', async () => {
    const { engine, scrolled } = await setup()
    await userEvent.click(spanOf(engine, 'Chapter 2'))
    await until(() => scrolled.mock.calls.length > 0)
    expect(scrolled).toHaveBeenCalledOnce()
    expect(scrolled.mock.calls[0]![0]).toMatchObject({
      page: 1,
      fit: 'xyz',
      left: 72,
      top: 600,
    })
    expect(engine.navigation.canGoBack.get()).toBe(true)
  })

  it('drag starting on a link selects text', async () => {
    const { engine, scrolled } = await setup()
    const from = spanOf(engine, 'Chapter 2')
    const to = spanOf(engine, 'Example A')
    await userEvent.dragAndDrop(from, to, {
      sourcePosition: { x: 4, y: from.getBoundingClientRect().height / 2 },
      targetPosition: { x: 30, y: to.getBoundingClientRect().height / 2 },
    })
    await settle()
    const selection = window.getSelection()!
    expect(selection.isCollapsed).toBe(false)
    expect(selection.toString()).toContain('Chapter 3')
    expect(scrolled).not.toHaveBeenCalled()
  })

  it('a still press under select follows too', async () => {
    const { engine, scrolled } = await setup()
    engine.tools.set('select')
    tap(clientOf(engine, 0, CHAPTER_2))
    await until(() => scrolled.mock.calls.length > 0)
    expect(scrolled.mock.calls[0]![0]).toMatchObject({ page: 1 })
  })

  it('highlight tool over a link does not follow', async () => {
    const onAction = vi.fn<(a: ViewerAction) => void>()
    const { container, engine, scrolled } = await setup({
      tools: [highlightTool()],
      onAction,
    })
    engine.tools.set('highlight')
    tap(clientOf(engine, 0, CHAPTER_2))
    tap(clientOf(engine, 0, EXAMPLE_A))
    pointer('pointermove', clientOf(engine, 0, CHAPTER_2))
    await settle()
    expect(scrolled).not.toHaveBeenCalled()
    expect(onAction).not.toHaveBeenCalled()
    expect(container.style.cursor).not.toBe('pointer')
  })

  it('click on an annotation over a link selects the annotation', async () => {
    const { doc, engine, scrolled } = await setup()
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 60, y: 690, width: 100, height: 30 },
    })
    await until(
      () =>
        engine.viewport.hostFor(0)!.querySelector(`[data-annotation="${a.id}"]`) !== null
    )
    tap(clientOf(engine, 0, CHAPTER_2))
    await settle()
    expect(doc.annotations.selection.get()).toEqual([a.id])
    expect(scrolled).not.toHaveBeenCalled()
  })

  it('external link reports open-url and does not navigate', async () => {
    const onAction = vi.fn<(a: ViewerAction) => void>()
    const { engine, scrolled } = await setup({ onAction })
    const href = location.href
    await userEvent.click(spanOf(engine, 'Example A'))
    await until(() => onAction.mock.calls.length > 0)
    await settle()
    expect(onAction).toHaveBeenCalledOnce()
    expect(onAction).toHaveBeenCalledWith({
      kind: 'open-url',
      url: 'https://example.com/a',
      newWindow: false,
    })
    expect(location.href).toBe(href)
    expect(scrolled).not.toHaveBeenCalled()
  })

  it('Shift+click on a link extends the selection and does not follow', async () => {
    const { engine, scrolled } = await setup()
    const title = spanOf(engine, 'Links')
    const range = document.createRange()
    range.setStart(title.firstChild!, 0)
    range.setEnd(title.firstChild!, 1)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    await userEvent.click(spanOf(engine, 'Chapter 2'), { modifiers: ['Shift'] })
    await settle()
    // From the start of the title to the click, inside the link's text.
    expect(window.getSelection()!.toString()).toMatch(/^Links\s+Chap/)
    expect(scrolled).not.toHaveBeenCalled()
  })

  it('Ctrl+click or Cmd+click on a link does not follow; plugins hear a press', async () => {
    const { engine, scrolled, onPress } = await setup({ withPlugins: true })
    tap(clientOf(engine, 0, CHAPTER_2), { ctrlKey: true })
    tap(clientOf(engine, 0, CHAPTER_2), { metaKey: true })
    tap(clientOf(engine, 0, CHAPTER_2), { altKey: true })
    await settle()
    expect(scrolled).not.toHaveBeenCalled()
    expect(onPress).toHaveBeenCalledTimes(3)
  })

  it('a press that closes an open popover over a link does not follow', async () => {
    const { engine, scrolled } = await setup()
    const popover = document.createElement('div')
    popover.dataset.inkPopover = ''
    document.body.append(popover)
    cleanup.push(() => popover.remove())
    tap(clientOf(engine, 0, CHAPTER_2))
    await settle()
    expect(scrolled).not.toHaveBeenCalled()
    // Control: with the popover gone, the same press follows.
    popover.hidden = true
    tap(clientOf(engine, 0, CHAPTER_2))
    await until(() => scrolled.mock.calls.length > 0)
  })

  it('overlapping links: the topmost (last in the file) wins', async () => {
    const at = (id: string, url: string): PageLink => ({
      id,
      page: 0,
      rect: { x: 68, y: 696, width: 70, height: 18 },
      target: { kind: 'url', url, newWindow: false },
    })
    const onAction = vi.fn<(a: ViewerAction) => void>()
    const { engine } = await setup({
      onAction,
      links: [
        at('under', 'https://example.com/under'),
        at('over', 'https://example.com/over'),
      ],
    })
    tap(clientOf(engine, 0, CHAPTER_2))
    await until(() => onAction.mock.calls.length > 0)
    expect(onAction.mock.calls[0]![0]).toMatchObject({ url: 'https://example.com/over' })
  })

  it('a dead link over a live one does not hide it', async () => {
    const dead: PageLink = {
      id: 'dead',
      page: 0,
      rect: { x: 68, y: 696, width: 70, height: 18 },
      target: { kind: 'dest', raw: 'no-such-destination' },
    }
    const live: PageLink = {
      ...dead,
      id: 'live',
      target: { kind: 'url', url: 'https://example.com/live', newWindow: false },
    }
    const onAction = vi.fn<(a: ViewerAction) => void>()
    const { engine } = await setup({ onAction, links: [live, dead] })
    await until(
      () =>
        engine.viewport
          .hostFor(0)!
          .querySelector('[data-ink-link="dead"]')
          ?.getAttribute('aria-disabled') === 'true'
    )
    tap(clientOf(engine, 0, CHAPTER_2))
    await until(() => onAction.mock.calls.length > 0)
    expect(onAction.mock.calls[0]![0]).toMatchObject({ url: 'https://example.com/live' })
  })

  it('external link with no handler does nothing', async () => {
    const error = vi.spyOn(console, 'error')
    const { engine } = await setup()
    const href = location.href
    await userEvent.click(spanOf(engine, 'Example A'))
    await settle()
    expect(error).not.toHaveBeenCalled()
    expect(location.href).toBe(href)
  })

  it('a wrapped link is hit on its lines, not in the gap between them', async () => {
    const onAction = vi.fn<(a: ViewerAction) => void>()
    const { engine } = await setup({ onAction })
    // Inside the link's rect, between its two quads (486 and 480).
    tap(clientOf(engine, 0, { x: 100, y: 483 }))
    await settle()
    expect(onAction).not.toHaveBeenCalled()
    tap(clientOf(engine, 0, { x: 100, y: 470 }))
    await until(() => onAction.mock.calls.length > 0)
    expect(onAction.mock.calls[0]![0]).toMatchObject({
      url: 'https://example.com/wrapped',
    })
  })

  it('cursor is pointer over a link', async () => {
    const { container: root, engine } = await setup()
    const cursor = root.style.cursor
    expect(cursor).not.toBe('pointer')
    pointer('pointermove', clientOf(engine, 0, CHAPTER_2))
    expect(root.style.cursor).toBe('pointer')
    pointer('pointermove', clientOf(engine, 0, { x: 300, y: 300 }))
    expect(root.style.cursor).toBe(cursor)
    // Unsupported links are not followed, so they get no pointer either.
    pointer('pointermove', clientOf(engine, 0, { x: 100, y: 525 }))
    expect(root.style.cursor).toBe(cursor)
    engine.tools.set('select')
    pointer('pointermove', clientOf(engine, 0, CHAPTER_2))
    expect(root.style.cursor).toBe('pointer')
    engine.tools.set('select-text')
    expect(root.style.cursor).toBe(cursor)
  })

  it('a link whose destination names no page is not followed and gets no pointer', async () => {
    const dead: PageLink = {
      id: 'dead',
      page: 0,
      rect: { x: 68, y: 696, width: 70, height: 18 },
      target: { kind: 'dest', raw: 'no-such-destination' },
    }
    const {
      container: root,
      engine,
      scrolled,
      onPress,
    } = await setup({ links: [dead], withPlugins: true })
    await until(
      () =>
        engine.viewport
          .hostFor(0)!
          .querySelector('[data-ink-link="dead"]')
          ?.getAttribute('aria-disabled') === 'true'
    )
    const cursor = root.style.cursor
    pointer('pointermove', clientOf(engine, 0, CHAPTER_2))
    expect(root.style.cursor).toBe(cursor)
    tap(clientOf(engine, 0, CHAPTER_2))
    await settle()
    expect(scrolled).not.toHaveBeenCalled()
    // Nothing acted on it, so plugins hear it.
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('rotated page link hit area matches', async () => {
    const { doc, engine, scrolled } = await setup()
    engine.viewport.scrollToPage(2)
    await until(() => engine.pages.has(2))
    // The link's user-space centre, unrotated, lands off the link on a /Rotate 90 page.
    const box = engine.viewport.hostFor(2)!.getBoundingClientRect()
    const page = doc.pages[2]!
    tap({ x: box.left + 111, y: box.top + (page.height - 705) })
    await settle()
    expect(scrolled).not.toHaveBeenCalled()
    tap(clientOf(engine, 2, { x: 111, y: 705 }))
    await until(() => scrolled.mock.calls.length > 0)
    expect(scrolled.mock.calls[0]![0]).toMatchObject({ page: 0, fit: 'fit' })
  })

  it('long press on a link goes to plugins', async () => {
    const { engine, scrolled, onPress, onLongPress } = await setup({ withPlugins: true })
    const at = clientOf(engine, 0, CHAPTER_2)
    pointer('pointerdown', at, { pointerType: 'touch' })
    await until(() => onLongPress.mock.calls.length > 0)
    pointer('pointerup', at, { pointerType: 'touch' })
    await settle()
    expect(onLongPress).toHaveBeenCalledOnce()
    expect(onLongPress.mock.calls[0]![0]).toMatchObject({ page: 0, pointerType: 'touch' })
    expect(onPress).not.toHaveBeenCalled()
    expect(scrolled).not.toHaveBeenCalled()
  })

  it('a tap on a link follows it and is not a plugin press', async () => {
    const { engine, scrolled, onPress } = await setup({ withPlugins: true })
    tap(clientOf(engine, 0, CHAPTER_2), { pointerType: 'touch' })
    await until(() => scrolled.mock.calls.length > 0)
    expect(onPress).not.toHaveBeenCalled()
  })
})
