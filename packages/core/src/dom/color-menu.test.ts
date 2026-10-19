import { describe, expect, it } from 'vitest'

import { PALETTE } from './palette'
import { colorMenuModel } from './ui'

import type { StyleKey } from '../model/annotations/tool-style'

const both = new Set<StyleKey>(['border', 'fill'])

describe('colorMenuModel', () => {
  it('disables the menu when the property is not supported', () => {
    expect(colorMenuModel('fill', {}, new Set<StyleKey>(['border'])).enabled).toBe(false)
    expect(colorMenuModel('textColor', {}, both).enabled).toBe(false)
    expect(colorMenuModel('border', {}, both).enabled).toBe(true)
  })

  it('lists the palette in order, checking the swatch that matches case-insensitively', () => {
    const m = colorMenuModel('border', { border: '#ff3b30' }, both)
    expect(m.swatches).toHaveLength(12 + 12 + 96)
    expect(m.swatches.map((s) => s.color).slice(0, 12)).toEqual([...PALETTE.common])
    expect(m.swatches.filter((s) => s.checked).map((s) => s.color)).toEqual(['#FF3B30'])
    expect(m.swatches[0]!.patch).toEqual({ border: '#FF3B30' })
    expect(m.trigger).toEqual({ kind: 'color', color: '#ff3b30' })
  })

  it('offers No fill only for fill, checked when the fill is null', () => {
    expect(colorMenuModel('border', {}, both).noFill).toBeNull()
    const none = colorMenuModel('fill', { fill: null }, both)
    expect(none.noFill).toEqual({ checked: true, patch: { fill: null } })
    expect(none.trigger).toEqual({ kind: 'none' })
    expect(none.swatches.some((s) => s.checked)).toBe(false)
  })

  it('shows mixed with nothing checked', () => {
    const m = colorMenuModel('fill', { fill: 'mixed' }, both)
    expect(m.trigger).toEqual({ kind: 'mixed' })
    expect(m.mixed).toBe(true)
    expect(m.noFill?.checked).toBe(false)
    expect(m.swatches.some((s) => s.checked)).toBe(false)
    // The native input needs a real colour: `mixed` must never reach it.
    expect(m.customValue).toBe('#000000')
  })

  it('shows an empty swatch when the style has no value, and a custom colour as is', () => {
    expect(colorMenuModel('border', {}, both).trigger).toEqual({ kind: 'empty' })
    const m = colorMenuModel('border', { border: '#123456' }, both)
    expect(m.swatches.some((s) => s.checked)).toBe(false)
    expect(m.trigger).toEqual({ kind: 'color', color: '#123456' })
    expect(m.custom('#abcdef')).toEqual({ border: '#ABCDEF' })
  })
})
