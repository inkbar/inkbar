import { describe, expect, it } from 'vitest'

import { charCentres, compareText, joinedText, TEXT_TOLERANCE } from './text'

import type { TextContent, TextItem } from '@inkbar/core'

/**
 * A left-to-right item of `str` at 10 pt, on the baseline `y`, from `x`, each character 6 pt
 * wide, its box 10 pt tall. `advances` defaults to an equal share per character.
 */
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

describe('charCentres', () => {
  it('places each character at the middle of its share of the quad, whitespace left out', () => {
    const centres = charCentres(page(item('a b', 0, 0)))
    expect(centres.map((c) => c.char)).toEqual(['a', 'b'])
    expect(centres.map((c) => [c.x, c.y, c.fontSize])).toEqual([
      [3, 5, 10],
      [expect.closeTo(15, 9), 5, 10],
    ])
  })

  it("follows an item's own advances", () => {
    const centres = charCentres(page(item('ab', 0, 0, { advances: [0, 0.25, 1] })))
    expect(centres.map((c) => c.x)).toEqual([1.5, 7.5])
  })

  it('reads advances that fall from 1 to 0 along a right-to-left quad', () => {
    const rtl = item('אב', 0, 0, { dir: 'rtl', advances: [1, 0.25, 0] })
    expect(charCentres(page(rtl)).map((c) => c.x)).toEqual([7.5, 1.5])
  })

  it('gives each character an equal share when an item has no advances, from the reading end', () => {
    const { advances: _l, ...ltr } = item('ab', 0, 0)
    const { advances: _r, ...rtl } = item('אב', 0, 0, { dir: 'rtl' })
    expect(charCentres(page(ltr)).map((c) => c.x)).toEqual([3, 9])
    expect(charCentres(page(rtl)).map((c) => c.x)).toEqual([9, 3])
  })

  it('follows a turned quad', () => {
    // Text running up the page from (100, 0): the baseline is p3 to p4.
    const up = item('ab', 0, 0, {
      quad: {
        p1: { x: 90, y: 0 },
        p2: { x: 90, y: 12 },
        p3: { x: 100, y: 0 },
        p4: { x: 100, y: 12 },
      },
    })
    expect(charCentres(page(up))).toEqual([
      { char: 'a', x: 95, y: 3, fontSize: 10 },
      { char: 'b', x: 95, y: 9, fontSize: 10 },
    ])
  })
})

describe('compareText', () => {
  const base = () => page(item('Hello', 0, 700, { hasEOL: true }), item('world', 0, 680))

  it('finds equal strings and centres the same', () => {
    expect(compareText(base(), base())).toEqual({
      same: true,
      worstOffset: 0,
      worstAt: 0,
      charOffset: 0,
      itemOffset: 0,
      heightRatio: [1, 1],
    })
  })

  it('finds one character moved by 0.3 of the font size different, at that character', () => {
    const moved = base()
    // The w takes 0 to 6 pt of a 30 pt item; move its centre to 6 pt, 0.3 of the 10 pt font
    // size away.
    moved.items[1] = item('world', 0, 680, { advances: [0.2, 0.2, 0.4, 0.6, 0.8, 1] })
    const result = compareText(base(), moved)
    expect(result.same).toBe(false)
    expect(result.firstDifference).toBeUndefined()
    // "Hello world": the w is at index 6.
    expect(result.worstAt).toBe(6)
    expect(result.worstOffset).toBeCloseTo(0.3, 9)
    expect(result.worstOffset).toBeGreaterThan(TEXT_TOLERANCE)
  })

  it('keeps a move inside the tolerance the same', () => {
    const moved = base()
    moved.items[1] = item('world', 0.5, 680)
    const result = compareText(base(), moved)
    expect(result.same).toBe(true)
    expect(result.worstOffset).toBeCloseTo(0.05, 9)
  })

  it('finds differing strings different, at the first index they differ', () => {
    const other = page(item('Hello', 0, 700, { hasEOL: true }), item('word', 0, 680))
    const result = compareText(base(), other)
    expect(result.same).toBe(false)
    expect(result.firstDifference).toBe(9)
    expect(result.worstOffset).toBeNaN()
  })

  it('finds a string that is a prefix of the other different at the shorter one’s end', () => {
    const shorter = page(item('Hello', 0, 700))
    expect(compareText(base(), shorter).firstDifference).toBe(5)
  })

  it('finds run boundaries in different places, with the same characters and boxes, the same', () => {
    const split = page(
      item('Hello', 0, 700, { hasEOL: true }),
      item('wo', 0, 680),
      item('rld', 12, 680)
    )
    const result = compareText(base(), split)
    expect(result.same).toBe(true)
    expect(result.worstOffset).toBeCloseTo(0, 9)
  })

  it('finds two empty pages the same', () => {
    expect(compareText(page(), page())).toEqual({
      same: true,
      worstOffset: 0,
      charOffset: 0,
      itemOffset: 0,
    })
  })

  /** `base()` with the item "world" given no `advances`, moved `dx` along the baseline. */
  const without = (dx: number) => {
    const { advances: _, ...bare } = item('world', dx, 680)
    return page(item('Hello', 0, 700, { hasEOL: true }), bare)
  }

  it('compares an item without advances on one side as a whole: same when it lines up', () => {
    // Its own advances would put the w elsewhere; as a whole, its box matches.
    const uneven = page(
      item('Hello', 0, 700, { hasEOL: true }),
      item('world', 0, 680, { advances: [0, 0.5, 0.6, 0.7, 0.8, 1] })
    )
    const result = compareText(uneven, without(0))
    expect(result.same).toBe(true)
    expect(result.itemOffset).toBeCloseTo(0, 9)
    expect(result.charOffset).toBeCloseTo(0, 9)
  })

  it('compares an item without advances on one side as a whole: different when it moves', () => {
    const result = compareText(base(), without(3))
    expect(result.same).toBe(false)
    expect(result.itemOffset).toBeCloseTo(0.3, 9)
    expect(result.worstAt).toBe(6)
  })

  /**
   * "Hello" over "world" split into "wo" and "rld", with advances unless `bare`, "rld" moved `dy`
   * up. A move along the line would open a gap search reads as a space.
   */
  const split = (dy: number, bare = false) => {
    const strip = (it: TextItem) => {
      if (!bare) return it
      const { advances: _, ...rest } = it
      return rest
    }
    return page(
      item('Hello', 0, 700, { hasEOL: true }),
      strip(item('wo', 0, 680)),
      strip(item('rld', 12, 680 + dy))
    )
  }

  it('compares the same characters when a bare item meets items split elsewhere: same', () => {
    const result = compareText(without(0), split(0))
    expect(result.same).toBe(true)
    expect(result.itemOffset).toBeCloseTo(0, 9)
  })

  it('compares the same characters when a bare item meets items split elsewhere: moved', () => {
    const result = compareText(without(0), split(3))
    expect(result.same).toBe(false)
    expect(result.itemOffset).toBeCloseTo(0.3, 9)
  })

  it('splits a stretch where either side’s bare item changes, when both are bare', () => {
    const result = compareText(without(0), split(0, true))
    expect(result.same).toBe(true)
    expect(result.itemOffset).toBeCloseTo(0, 9)
    expect(compareText(without(0), split(3, true)).same).toBe(false)
  })

  /** How `line` changes one item, in points, 3 pt being 0.3 of the font size. */
  interface Change {
    item: number
    /** Moves the item across the line, away from its baseline's top side. */
    across?: number
    /** Moves where the item starts along the line, in reading order. */
    start?: number
    /** Moves where the item ends along the line, in reading order. */
    end?: number
  }

  /**
   * One line of six characters at 10 pt, 6 pt each, cut into items of `parts` in reading order:
   * left to right along y = 0 from x = 0, right to left over the same span from x = 36, or top to
   * bottom down x = 100 from y = 700. Each item has `advances` unless `bare`. `change` moves one
   * item or widens it at one end.
   */
  const line = (
    dir: TextItem['dir'],
    parts: string[],
    { bare = false, change }: { bare?: boolean; change?: Change } = {}
  ): TextContent => {
    let offset = 0
    const items = parts.map((str, i) => {
      const own: Partial<Change> = change?.item === i ? change : {}
      const from = offset * 6 + (own.start ?? 0)
      const to = (offset + str.length) * 6 + (own.end ?? 0)
      offset += str.length
      const shift = own.across ?? 0
      const [p3, p4] =
        dir === 'ttb'
          ? [
              { x: 100 + shift, y: 700 - from },
              { x: 100 + shift, y: 700 - to },
            ]
          : dir === 'rtl'
            ? [
                { x: 36 - to, y: shift },
                { x: 36 - from, y: shift },
              ]
            : [
                { x: from, y: shift },
                { x: to, y: shift },
              ]
      const up = dir === 'ttb' ? { x: 10, y: 0 } : { x: 0, y: 10 }
      const shares = [...Array(str.length + 1).keys()].map((k) => k / str.length)
      const it: TextItem = {
        str,
        dir,
        fontName: 'F1',
        fontSize: 10,
        hasEOL: false,
        quad: {
          p1: { x: p3.x + up.x, y: p3.y + up.y },
          p2: { x: p4.x + up.x, y: p4.y + up.y },
          p3,
          p4,
        },
        rect: {
          x: Math.min(p3.x, p4.x),
          y: Math.min(p3.y, p4.y),
          width: Math.abs(p4.x - p3.x) + up.x,
          height: Math.abs(p4.y - p3.y) + up.y,
        },
      }
      if (!bare) it.advances = dir === 'rtl' ? shares.map((s) => 1 - s) : shares
      return it
    })
    return page(...items)
  }

  // The space lets the middle item move back along the line without search reading a gap after
  // it as a new space.
  const text = { ltr: 'abc de', rtl: 'אבג דה', ttb: 'abc de' } as const
  const cut = (dir: keyof typeof text, ...lengths: number[]) => {
    const out: string[] = []
    let at = 0
    for (const n of lengths) {
      out.push(text[dir].slice(at, at + n))
      at += n
    }
    return out
  }

  describe.each(['ltr', 'rtl', 'ttb'] as const)('a stretch of %s text', (dir) => {
    it.each<[string, Omit<Change, 'item'>]>([
      ['moved across the line', { across: 3 }],
      ['moved back along the line', { start: -3, end: -3 }],
      ['widened at its start only', { start: -3 }],
      ['widened at its end only', { end: 3 }],
    ])(
      'finds a middle item %s by 0.3 of the font size different, at that item, on either side',
      (_, change) => {
        const whole = line(dir, cut(dir, 6), { bare: true })
        const moved = line(dir, cut(dir, 2, 1, 3), { change: { item: 1, ...change } })
        expect(joinedText(moved)).toBe(text[dir])
        for (const result of [compareText(whole, moved), compareText(moved, whole)]) {
          expect(result.same).toBe(false)
          expect(result.worstAt).toBe(2)
          expect(result.worstOffset).toBeCloseTo(0.3, 9)
          expect(result.itemOffset).toBeCloseTo(0.3, 9)
        }
      }
    )

    it('finds a moved middle item without advances different, at that item, on either side', () => {
      const whole = line(dir, cut(dir, 6))
      const moved = line(dir, cut(dir, 2, 1, 3), {
        bare: true,
        change: { item: 1, across: 3 },
      })
      for (const result of [compareText(whole, moved), compareText(moved, whole)]) {
        expect(result.same).toBe(false)
        expect(result.worstAt).toBe(2)
        expect(result.worstOffset).toBeCloseTo(0.3, 9)
      }
    })

    it('finds the same item boundaries on both sides the same', () => {
      const parts = cut(dir, 2, 1, 3)
      const result = compareText(line(dir, parts, { bare: true }), line(dir, parts))
      expect(result.same).toBe(true)
      expect(result.worstOffset).toBeCloseTo(0, 9)
    })

    it('finds item boundaries in different places, with the same characters and places, the same', () => {
      const bare = line(dir, cut(dir, 3, 3), { bare: true })
      const other = line(dir, cut(dir, 1, 3, 2))
      expect(joinedText(other)).toBe(text[dir])
      for (const result of [
        compareText(bare, other),
        compareText(other, bare),
        compareText(line(dir, cut(dir, 6), { bare: true }), other),
      ]) {
        expect(result.same).toBe(true)
        expect(result.worstOffset).toBeCloseTo(0, 9)
      }
    })
  })

  it.each([NaN, Infinity])('finds a font size of %s different, and the worst', (size) => {
    const odd = base()
    odd.items[1] = item('world', 0, 680, { fontSize: size })
    const result = compareText(base(), odd)
    expect(result.same).toBe(false)
    expect(result.worstOffset).toBe(Infinity)
    expect(result.worstAt).toBe(6)
    const { advances: _, ...bare } = odd.items[1]
    odd.items[1] = bare
    expect(compareText(base(), odd)).toMatchObject({ same: false, worstOffset: Infinity })
  })

  it('finds a boundary missing from advances that are too short different, and the worst', () => {
    const short = base()
    short.items[1] = item('world', 0, 680, { advances: [0, 0.2, 0.4] })
    const result = compareText(base(), short)
    expect(result.same).toBe(false)
    expect(result.worstOffset).toBe(Infinity)
    // "Hello world": the r, whose end boundary is missing, is at index 8.
    expect(result.worstAt).toBe(8)
  })

  it('finds a quad holding NaN different, and the worst', () => {
    const broken = base()
    const it = item('world', 0, 680)
    it.quad = { ...it.quad, p4: { x: NaN, y: 680 } }
    broken.items[1] = it
    const result = compareText(base(), broken)
    expect(result.same).toBe(false)
    expect(result.worstOffset).toBe(Infinity)
    // Every character of "world" reads p4; the w, at index 6, comes first.
    expect(result.worstAt).toBe(6)
  })
})
