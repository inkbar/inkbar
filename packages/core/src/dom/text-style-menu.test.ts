import { describe, expect, it } from 'vitest'

import { FONT_FAMILIES, clampFontSize, textStyleMenuModel } from './ui'

import type { StyleKey } from '../model/annotations/tool-style'

const all = new Set<StyleKey>(['fontFamily', 'fontSize', 'textAlign'])

describe('textStyleMenuModel', () => {
  it('disables when nothing supports a text prop', () => {
    expect(
      textStyleMenuModel({}, new Set<StyleKey>(['border']), FONT_FAMILIES).enabled
    ).toBe(false)
    expect(textStyleMenuModel({}, all, FONT_FAMILIES).enabled).toBe(true)
  })

  it('toggles write the opposite value, and on for a mix', () => {
    const off = textStyleMenuModel({ fontWeight: 'normal' }, all, FONT_FAMILIES)
    expect(off.toggles[0]).toMatchObject({ key: 'bold', pressed: false })
    expect(off.toggles[0]!.patch).toEqual({ fontWeight: 'bold' })
    const on = textStyleMenuModel({ fontStyle: 'italic' }, all, FONT_FAMILIES)
    expect(on.toggles[1]!.patch).toEqual({ fontStyle: 'normal' })
    const mixed = textStyleMenuModel({ textDecoration: 'mixed' }, all, FONT_FAMILIES)
    expect(mixed.toggles[2]).toMatchObject({ pressed: 'mixed' })
    expect(mixed.toggles[2]!.patch).toEqual({ textDecoration: 'underline' })
    expect(mixed.mixed).toBe(true)
  })

  it('clamps the size to 1..144 and writes nothing when it would not change', () => {
    expect(clampFontSize(0)).toBe(1)
    expect(clampFontSize(500)).toBe(144)
    expect(clampFontSize(12.4)).toBe(12)
    const top = textStyleMenuModel({ fontSize: 144 }, all, FONT_FAMILIES).size
    expect(top.nudge(1)).toBeNull()
    expect(top.nudge(-1)).toEqual({ fontSize: 143 })
    expect(top.commit(900)).toBeNull()
    const bottom = textStyleMenuModel({ fontSize: 1 }, all, FONT_FAMILIES).size
    expect(bottom.nudge(-1)).toBeNull()
    expect(bottom.commit(-5)).toBeNull()
    expect(bottom.commit(20)).toEqual({ fontSize: 20 })
    expect(bottom.commit(Number.NaN)).toBeNull()
    const mixed = textStyleMenuModel({ fontSize: 'mixed' }, all, FONT_FAMILIES).size
    expect(mixed.value).toBeNull()
    expect(mixed.nudge(1)).toEqual({ fontSize: 13 })
  })

  it('keeps a family outside the list selectable and shows no value for a mix', () => {
    const odd = textStyleMenuModel({ fontFamily: 'Arial' }, all, ['Times'])
    expect(odd.font.options).toEqual(['Times', 'Arial'])
    expect(odd.font.value).toBe('Arial')
    const mixed = textStyleMenuModel({ fontFamily: 'mixed' }, all, ['Times'])
    expect(mixed.font.value).toBe('')
    expect(mixed.font.options).toEqual(['Times'])
  })

  it('checks the current alignment and keeps one radio in the Tab order', () => {
    const centred = textStyleMenuModel({ textAlign: 'center' }, all, FONT_FAMILIES)
    expect(centred.align.choices.map((c) => c.checked)).toEqual([
      false,
      true,
      false,
      false,
    ])
    expect(centred.align.choices.map((c) => c.tabStop)).toEqual([
      false,
      true,
      false,
      false,
    ])
    const none = textStyleMenuModel({ textAlign: 'mixed' }, all, FONT_FAMILIES)
    expect(none.align.choices.map((c) => c.tabStop)).toEqual([true, false, false, false])
  })
})
