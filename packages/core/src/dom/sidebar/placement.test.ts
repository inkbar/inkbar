import { describe, expect, it } from 'vitest'

import { placeSidebars, type SidebarSlot } from './placement'

function slot(key: number, over: Partial<SidebarSlot> = {}): SidebarSlot {
  return {
    key,
    layout: 'rail',
    visible: true,
    open: true,
    want: 320,
    min: 240,
    rail: 48,
    resizing: false,
    openedAt: key,
    minDocument: 480,
    ...over,
  }
}

describe('placeSidebars', () => {
  it('leaves everything beside the document when it fits', () => {
    const result = placeSidebars(1280, [slot(1), slot(2)])
    expect(result.get(1)).toEqual({ floating: false, shown: 320 })
    expect(result.get(2)).toEqual({ floating: false, shown: 320 })
  })

  it('floats the most recently opened first', () => {
    const result = placeSidebars(1000, [
      slot(1, { openedAt: 1 }),
      slot(2, { openedAt: 2 }),
    ])
    expect(result.get(1)?.floating).toBe(false)
    expect(result.get(2)?.floating).toBe(true)
  })

  it('floats the one being resized first', () => {
    const result = placeSidebars(1000, [
      slot(1, { openedAt: 1, resizing: true }),
      slot(2, { openedAt: 2 }),
    ])
    expect(result.get(1)?.floating).toBe(true)
    expect(result.get(2)?.floating).toBe(false)
  })

  it('floats both when one is not enough', () => {
    const result = placeSidebars(700, [slot(1), slot(2)])
    expect(result.get(1)).toEqual({ floating: true, shown: 320 })
    expect(result.get(2)).toEqual({ floating: true, shown: 320 })
  })

  it('never floats a closed rail', () => {
    const result = placeSidebars(600, [slot(1, { open: false })])
    expect(result.get(1)?.floating).toBe(false)
  })

  it('narrows tabs instead of floating', () => {
    const result = placeSidebars(900, [slot(1, { layout: 'tabs', want: 480, rail: 0 })])
    expect(result.get(1)).toEqual({ floating: false, shown: 420 })
  })

  it('stops narrowing at min', () => {
    const result = placeSidebars(600, [slot(1, { layout: 'tabs', want: 480, rail: 0 })])
    expect(result.get(1)).toEqual({ floating: false, shown: 240 })
  })

  it('narrows the widest first', () => {
    const result = placeSidebars(1000, [
      slot(1, { layout: 'stack', want: 400, rail: 0 }),
      slot(2, { layout: 'stack', want: 300, rail: 0 }),
    ])
    expect(result.get(1)?.shown).toBe(260)
    expect(result.get(2)?.shown).toBe(260)
  })

  it('fits a floating panel to the container', () => {
    const result = placeSidebars(300, [slot(1)])
    expect(result.get(1)).toEqual({ floating: true, shown: 252 })
  })

  it('uses the largest minDocument asked for', () => {
    // Beside both, the document is 1130 - 640 = 490: enough for 480, short of 600.
    const low = [slot(1, { minDocument: 480 }), slot(2, { minDocument: 480 })]
    const mixed = [slot(1, { minDocument: 480 }), slot(2, { minDocument: 600 })]
    expect(placeSidebars(1130, low).get(2)?.floating).toBe(false)
    expect(placeSidebars(1130, mixed).get(2)?.floating).toBe(true)
  })
})
