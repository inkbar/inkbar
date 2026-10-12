import { afterEach, describe, expect, it } from 'vitest'

import { computeCssLayout } from './layout'
import { mountContainer, openFixtureInBrowser } from './test-utils'
import { createViewport } from './viewport'
import { attachViewportKeys } from './viewport-keys'

const GAP = 16
let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((f) => f())
  cleanup = []
})

async function setup() {
  const doc = await openFixtureInBrowser('text-simple')
  const container = mountContainer(800, 600)
  container.tabIndex = 0
  const viewport = createViewport({
    container,
    document: doc,
    zoom: 1,
    gap: GAP,
    onMount: () => undefined,
    onUpdate: () => undefined,
    onUnmount: () => undefined,
  })
  const detach = attachViewportKeys(container, {
    viewport,
    pageCount: () => doc.pages.length,
  })
  cleanup.push(() => {
    detach()
    viewport.destroy()
    doc.destroy()
    container.remove()
  })
  return { doc, container, viewport, detach }
}

function press(
  target: Element,
  key: string,
  init: KeyboardEventInit = {}
): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(e)
  return e
}

describe('attachViewportKeys', () => {
  it('zooms with + and - and jumps to the last and first page with End and Home', async () => {
    const { container, viewport, doc } = await setup()
    expect(press(container, '+').defaultPrevented).toBe(true)
    expect(viewport.scale.get()).toBeCloseTo(1.25)
    press(container, '-')
    expect(viewport.scale.get()).toBeCloseTo(1)

    expect(press(container, 'End').defaultPrevented).toBe(true)
    const layout = computeCssLayout({
      pages: doc.pages,
      zoom: 1,
      rotation: 0,
      gap: GAP,
      mode: 'continuous',
      current: 0,
      containerWidth: container.clientWidth,
    })
    const max = container.scrollHeight - container.clientHeight
    expect(container.scrollTop).toBe(Math.min(max, layout.boxes.at(-1)!.top - GAP))
    expect(viewport.currentPage.get()).toBe(2)
    press(container, 'Home')
    expect(container.scrollTop).toBe(0)
    expect(viewport.currentPage.get()).toBe(0)
    press(container, 'PageDown')
    expect(viewport.currentPage.get()).toBe(1)
  })

  it('leaves inputs, annotations, modified, prevented and unknown keys alone; detaches', async () => {
    const { container, viewport, detach } = await setup()
    const input = document.createElement('input')
    const annotation = document.createElement('div')
    annotation.dataset.annotation = 'a'
    container.append(input, annotation)

    expect(press(input, '+').defaultPrevented).toBe(false)
    expect(press(annotation, 'End').defaultPrevented).toBe(false)
    expect(press(container, '+', { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(press(container, 'x').defaultPrevented).toBe(false)
    const prevented = new KeyboardEvent('keydown', {
      key: '+',
      bubbles: true,
      cancelable: true,
    })
    prevented.preventDefault()
    container.dispatchEvent(prevented)
    expect(viewport.scale.get()).toBe(1)
    expect(container.scrollTop).toBe(0)

    detach()
    expect(press(container, '+').defaultPrevented).toBe(false)
    expect(viewport.scale.get()).toBe(1)
  })
})
