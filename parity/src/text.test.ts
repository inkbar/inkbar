import { describe, expect, it } from 'vitest'

import { joinedText } from './text'

import type { TextContent, TextItem } from '@inkbar/core'

/** A left-to-right item of `str` at 10 pt, on the baseline `y`, from `x`, each character 6 pt wide. */
function item(
  str: string,
  x: number,
  y: number,
  extra: Partial<TextItem> = {}
): TextItem {
  const width = str.length * 6
  return {
    str,
    dir: 'ltr',
    fontName: 'F1',
    fontSize: 10,
    hasEOL: false,
    quad: {
      p1: { x, y: y + 10 },
      p2: { x: x + width, y: y + 10 },
      p3: { x, y },
      p4: { x: x + width, y },
    },
    rect: { x, y, width, height: 10 },
    advances: [...Array(str.length + 1).keys()].map((i) => i / str.length),
    ...extra,
  }
}

const page = (...items: TextItem[]): TextContent => ({ page: 0, items })

describe('joinedText', () => {
  it('joins items as search does, with whitespace runs collapsed and the ends trimmed', () => {
    const content = page(
      item(' Hello  ', 0, 700, { hasEOL: true }),
      item('world', 0, 680),
      item('again', 60, 680)
    )
    expect(joinedText(content)).toBe('Hello world again')
  })
})
