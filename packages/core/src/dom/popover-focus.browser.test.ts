import { afterEach, describe, expect, it } from 'vitest'

import {
  createFocusReturn,
  shouldKeepOpenOnAnnotation,
  watchDetached,
} from './popover-focus'
import { until } from './test-utils'

let root: HTMLElement
afterEach(() => root?.remove())

function annotation(id: string, attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement('div')
  el.dataset.annotation = id
  el.tabIndex = 0
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

/** A root with a scroll element and `ids` as annotation siblings in reading order. */
function build(ids: string[]) {
  root = document.createElement('div')
  const scroll = document.createElement('div')
  scroll.dataset.inkScroll = ''
  scroll.tabIndex = 0
  const overlay = document.createElement('div')
  const els = ids.map((id) => annotation(id))
  overlay.append(...els)
  root.append(scroll, overlay)
  document.body.append(root)
  return { scroll, els }
}

describe('shouldKeepOpenOnAnnotation', () => {
  it('keeps open for a press on an annotation element or its drawn shape, not on custom content', () => {
    const plain = annotation('a')
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    plain.append(shape)
    expect(shouldKeepOpenOnAnnotation(plain)).toBe(true)
    expect(shouldKeepOpenOnAnnotation(shape)).toBe(true)
    const custom = annotation('b', { 'data-custom': '' })
    const button = document.createElement('button')
    custom.append(button)
    expect(shouldKeepOpenOnAnnotation(custom)).toBe(true)
    expect(shouldKeepOpenOnAnnotation(button)).toBe(false)
    expect(shouldKeepOpenOnAnnotation(document.body)).toBe(false)
    expect(shouldKeepOpenOnAnnotation(null)).toBe(false)
  })
})

describe('createFocusReturn', () => {
  it('returns focus to the anchor on a plain close', () => {
    const { els } = build(['a', 'b'])
    const fr = createFocusReturn({ root: () => root, activated: () => null })
    const event = new Event('closeAutoFocus', { cancelable: true })
    fr.onCloseAutoFocus(event, els[0]!)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(els[0])
  })

  it('after a removal goes to the preferred next sibling, else the next, else the previous, else the scroll element', () => {
    const { scroll, els } = build(['a', 'b', 'c'])
    els[2]!.setAttribute('data-type', 'text')
    const fr = createFocusReturn({ root: () => root, activated: () => null })
    fr.beforeRemove(els[0]!, '[data-type="text"]')
    els[0]!.remove()
    fr.onCloseAutoFocus(new Event('x', { cancelable: true }), els[0]!)
    expect(document.activeElement).toBe(els[2])

    fr.beforeRemove(els[2]!)
    els[2]!.remove()
    fr.onCloseAutoFocus(new Event('x', { cancelable: true }), els[2]!)
    expect(document.activeElement).toBe(els[1])

    fr.beforeRemove(els[1]!)
    els[1]!.remove()
    fr.onCloseAutoFocus(new Event('x', { cancelable: true }), els[1]!)
    expect(document.activeElement).toBe(scroll)
  })

  it('skips the anchor after a removal even while it is still connected', () => {
    const { els } = build(['a', 'b'])
    const fr = createFocusReturn({ root: () => root, activated: () => null })
    fr.beforeRemove(els[0]!)
    fr.onCloseAutoFocus(new Event('x', { cancelable: true }), els[0]!)
    expect(document.activeElement).toBe(els[1])
  })

  it('leaves focus where it is when another on-screen annotation is activated', () => {
    const { els } = build(['a', 'b'])
    const fr = createFocusReturn({ root: () => root, activated: () => 'b' })
    expect(document.activeElement).toBe(document.body)
    fr.onCloseAutoFocus(new Event('x', { cancelable: true }), els[0]!)
    expect(document.activeElement).toBe(document.body)
  })

  it('ignores an activated id whose element is gone and returns to the anchor', () => {
    const { els } = build(['a', 'b'])
    const fr = createFocusReturn({ root: () => root, activated: () => 'gone' })
    expect(document.activeElement).toBe(document.body)
    fr.onCloseAutoFocus(new Event('x', { cancelable: true }), els[0]!)
    expect(document.activeElement).toBe(els[0])
  })

  it('leaves focus alone when it is already inside the root', () => {
    const { els } = build(['a', 'b'])
    const fr = createFocusReturn({ root: () => root, activated: () => null })
    els[1]!.focus()
    fr.onCloseAutoFocus(new Event('x', { cancelable: true }), els[0]!)
    expect(document.activeElement).toBe(els[1])
  })

  it('forgets the removal plan after one close: the next close returns to the anchor', () => {
    const { els } = build(['a', 'b'])
    const fr = createFocusReturn({ root: () => root, activated: () => null })
    fr.beforeRemove(els[0]!)
    fr.onCloseAutoFocus(new Event('x', { cancelable: true }), els[0]!)
    expect(document.activeElement).toBe(els[1])
    els[1]!.blur()
    expect(document.activeElement).toBe(document.body)
    fr.onCloseAutoFocus(new Event('x', { cancelable: true }), els[0]!)
    expect(document.activeElement).toBe(els[0])
  })
})

describe('watchDetached', () => {
  it('calls back once when the element leaves the document, however it goes', async () => {
    root = document.createElement('div')
    const box = document.createElement('div')
    const el = document.createElement('div')
    box.append(el)
    root.append(box)
    document.body.append(root)
    let calls = 0
    const stop = watchDetached(el, () => calls++)
    root.append(document.createElement('span'))
    await Promise.resolve()
    expect(calls).toBe(0)
    // Its parent goes, not the element itself.
    box.remove()
    await until(() => calls > 0)
    root.append(box)
    box.remove()
    await new Promise((r) => setTimeout(r, 20))
    expect(calls).toBe(1)
    stop()
  })

  it('calls back for an element already detached, and not once stopped', async () => {
    let calls = 0
    watchDetached(document.createElement('div'), () => calls++)
    await until(() => calls === 1)
    root = document.createElement('div')
    const el = document.createElement('div')
    root.append(el)
    document.body.append(root)
    let late = 0
    watchDetached(el, () => late++)()
    el.remove()
    await new Promise((r) => setTimeout(r, 20))
    expect(late).toBe(0)
  })
})
