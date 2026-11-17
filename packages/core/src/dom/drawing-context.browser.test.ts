import { afterEach, describe, expect, it, vi } from 'vitest'

import { staticDefaults } from '../model/annotations/defaults'
import * as describeModule from '../model/annotations/drawing/describe'
import { createAnnotationStore } from '../model/annotations/store'

import { createOverlay } from './overlay'
import { mountContainer } from './test-utils'
import { createPageTransform } from './transform'

import type { PageInfo } from '../model/pages'

vi.mock('../model/annotations/drawing/describe', async (importOriginal) => {
  const actual = await importOriginal<typeof describeModule>()
  return { ...actual, describeDrawing: vi.fn(actual.describeDrawing) }
})

const page: PageInfo = {
  index: 0,
  box: { x: 0, y: 0, width: 612, height: 792 },
  rotate: 0,
  userUnit: 1,
  width: 612,
  height: 792,
}

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

describe('the drawing cache', () => {
  it('zooming does not describe a 5,000-point stroke again', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const host = mountContainer(612, 792)
    const overlay = createOverlay({
      host,
      page: 0,
      store,
      transform: createPageTransform(page, 1, 0),
      onActivate: vi.fn(),
    })
    cleanup.push(() => (overlay.destroy(), host.remove()))
    const stroke = Array.from({ length: 5000 }, (_, i) => ({
      x: 20 + (i / 5000) * 560,
      y: 400 + Math.sin(i / 40) * 100,
    }))
    const spy = vi.mocked(describeModule.describeDrawing)
    spy.mockClear()
    const ink = store.add({ type: 'ink', page: 0, inklist: [stroke], width: 2 })
    for (const zoom of [1, 2, 4]) overlay.update(createPageTransform(page, zoom, 0))
    const forInk = spy.mock.calls.filter(([a]) => a.id === ink.id)
    expect(forInk).toHaveLength(1)
    expect(overlay.elementFor(ink.id)!.querySelector('path.ink-stroke')).not.toBeNull()
  })
})
