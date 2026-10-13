import { afterEach, describe, expect, it } from 'vitest'

import { createFocusReturn, shouldKeepOpenOnAnnotation } from './popover-focus'

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
    els[2]!.setAttribute('data-origin', 'suggested')
    const fr = createFocusReturn({ root: () => root, activated: () => null })
    fr.beforeRemove(els[0]!, '[data-origin="suggested"]')
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

  it('leaves focus alone when another on-screen annotation is activated or focus is already inside the root', () => {
    const { els } = build(['a', 'b'])
    const fr = createFocusReturn({ root: () => root, activated: () => 'b' })
    document.body.focus()
    fr.onCloseAutoFocus(new Event('x', { cancelable: true }), els[0]!)
    expect(document.activeElement).not.toBe(els[0])
    const fr2 = createFocusReturn({ root: () => root, activated: () => 'gone' })
    els[1]!.focus()
    fr2.onCloseAutoFocus(new Event('x', { cancelable: true }), els[0]!)
    expect(document.activeElement).toBe(els[1])
  })
})
