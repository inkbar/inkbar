import { afterEach, describe, expect, it } from 'vitest'

import { annotationElementFor, observeAnnotationElement } from './annotation-element'
import { nextFrame } from './test-utils'

let root: HTMLElement
afterEach(() => root?.remove())

function annotation(id: string): HTMLElement {
  const el = document.createElement('div')
  el.dataset.annotation = id
  return el
}

describe('observeAnnotationElement', () => {
  it('resolves now, then when the element appears, and when it leaves', async () => {
    root = document.createElement('div')
    document.body.append(root)
    const seen: (HTMLElement | null)[] = []
    const stop = observeAnnotationElement(root, 'a"b', (el) => seen.push(el))
    expect(seen).toEqual([null])
    const el = annotation('a"b')
    root.append(el)
    await nextFrame()
    expect(seen).toEqual([null, el])
    // A mutation that does not change the answer is not reported.
    root.append(annotation('other'))
    await nextFrame()
    expect(seen).toHaveLength(2)
    el.remove()
    await nextFrame()
    expect(seen).toEqual([null, el, null])
    stop()
    root.append(annotation('a"b'))
    await nextFrame()
    expect(seen).toHaveLength(3)
  })

  it('annotationElementFor escapes the id', () => {
    root = document.createElement('div')
    const el = annotation('x]y')
    root.append(el)
    expect(annotationElementFor(root, 'x]y')).toBe(el)
    expect(annotationElementFor(root, 'missing')).toBeNull()
  })
})
