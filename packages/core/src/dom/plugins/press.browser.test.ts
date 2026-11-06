import { afterEach, describe, expect, it, vi } from 'vitest'

import { writable } from '../../model/readable'
import { mountContainer, openFixtureInBrowser, until } from '../test-utils'
import { mountViewer } from '../viewer-engine'

import { definePlugin, type PluginContext } from './define'
import { createPluginHost } from './host'

import type { PagePress } from '../tools/press'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

function pointer(el: Element, type: 'pointerdown' | 'pointerup', x: number, y: number) {
  el.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      isPrimary: true,
    })
  )
}

describe('plugin presses', () => {
  it('a plugin hears a click on empty page as a press, with page 0 and the user point', async () => {
    const spy = vi.fn<(press: PagePress) => void>()
    const doc = await openFixtureInBrowser('text-simple')
    const container = mountContainer(800, 600)
    const plugins = createPluginHost({
      plugins: [
        definePlugin({
          id: 'probe',
          setup(ctx: PluginContext) {
            ctx.onPress(spy)
          },
        }),
      ],
      document: writable(doc),
      history: () => doc.history,
      activated: writable<string | null>(null),
      setActivated() {},
      root: writable<HTMLElement | null>(container),
    })
    const engine = mountViewer({ container, document: doc, zoom: 1, plugins })
    cleanup.push(() => {
      engine.destroy()
      plugins.destroy()
      doc.destroy()
      container.remove()
    })
    await until(() => engine.pages.size > 0)

    const host = engine.viewport.hostFor(0)!
    const box = host.getBoundingClientRect()
    const x = box.left + 20
    const y = box.top + 20
    const target = document.elementFromPoint(x, y)!
    pointer(target, 'pointerdown', x, y)
    pointer(target, 'pointerup', x, y)

    const expected = engine.viewport.transformFor(0).fromCss({ x: 20, y: 20 })
    expect(spy).toHaveBeenCalledOnce()
    const press = spy.mock.calls[0]![0]
    expect(press).toMatchObject({ page: 0, pointerType: 'mouse' })
    expect(press.point.x).toBeCloseTo(expected.x, 1)
    expect(press.point.y).toBeCloseTo(expected.y, 1)
  })
})
