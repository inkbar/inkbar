import { describe, expect, it } from 'vitest'

import { fileAnnotationsFromEngine } from './annotations'
import { borderOf, parseDefaultAppearance, textOf } from './file-values'

import type { AnnotationFactsShape, PageAnnotationsShape } from './types'

/**
 * An annotation's facts: a printable Square over 10 10 50 50, object 10 + index, unless told
 * otherwise.
 */
const annot = (
  index: number,
  over: Omit<Partial<AnnotationFactsShape>, 'objectNumber'> & {
    objectNumber?: number | undefined
  } = {}
): AnnotationFactsShape => {
  const { objectNumber = 'objectNumber' in over ? undefined : 10 + index, ...rest } = over
  return {
    index,
    subtype: 'Square',
    rect: [10, 10, 50, 50],
    rectOk: true,
    flags: 4,
    hasAppearance: true,
    appearanceStates: [],
    ...rest,
    ...(objectNumber === undefined ? {} : { objectNumber, generation: 0 }),
  }
}

const page = (annotations: AnnotationFactsShape[]): PageAnnotationsShape => ({
  annotations,
  truncated: false,
})

const read = (annotations: AnnotationFactsShape[], pageIndex = 0) =>
  fileAnnotationsFromEngine(pageIndex, page(annotations))

describe('fileAnnotationsFromEngine', () => {
  it('lists annotations by the rule links are listed by, widgets and popups after the rest', () => {
    const listed = read([
      annot(0, { flags: 2 }), // hidden: listed
      annot(1, { subtype: 'Widget', flags: 32 }), // a widget: always listed, after the rest
      annot(2, { flags: 32 }), // no view: left out
      annot(3, { subtype: 'Popup' }), // a popup: last
      annot(4, { rectOk: false, rect: null }), // a /Rect that is not four numbers: listed
      annot(5, { subtype: 'Highlight', quads: [1, 2, 3] }), // bad quads: left out
      annot(6, { subtype: 'Redact', flags: 1 }), // invisible, a kind PDF.js does not know: left out
      annot(7, { flags: 1 }), // invisible, a kind PDF.js knows: listed
    ])
    expect(listed.map((a) => a.id)).toEqual(['10R', '14R', '17R', '11R', '13R'])
    // The bad /Rect is read as PDF.js reads it: all 0.
    expect(listed[1]!.rect).toEqual([0, 0, 0, 0])
  })

  it('gives an annotation written as a direct object the id of its page and place in /Annots', () => {
    const listed = read([annot(0), annot(1, { objectNumber: undefined })], 3)
    expect(listed.map((a) => a.id)).toEqual(['10R', 'p3i1'])
  })

  it('gives a generation other than 0 after the R', () => {
    expect(read([{ ...annot(0), generation: 2 }])[0]!.id).toBe('10R2')
  })

  it('converts colours of one, three and four components as PDF.js does, and five to black', () => {
    const colours = read([
      annot(0, { subtype: 'Link', color: [0.5] }),
      annot(1, { color: [1, 0, 0.2] }),
      annot(2, { color: [0, 1, 0, 0] }),
      annot(3, { color: [1, 0, 0, 0, 0] }),
      annot(4),
      annot(5, { color: [] }),
      annot(6, { subtype: 'Link' }),
    ]).map((a) => a.color)
    expect(colours).toEqual([
      [128, 128, 128],
      [255, 0, 51],
      [251, 49, 153],
      // PDF.js gives black for a colour of any other count, as for a Link with none.
      [0, 0, 0],
      // Markup with no /C, or an empty one, has none.
      undefined,
      undefined,
      [0, 0, 0],
    ])
  })

  it('reads the border width from /BS, else /Border, else 0', () => {
    const widths = read([
      annot(0, { borderStyle: { width: 3, style: 'S' } }),
      annot(1, { borderStyle: { width: null, style: null } }),
      annot(2, { border: [0, 0, 2] }),
      annot(3, { border: [] }),
      annot(4),
      // Wider than half the rect: taken as 1.
      annot(5, { borderStyle: { width: 30, style: null } }),
    ]).map((a) => a.border)
    expect(widths).toEqual([
      { width: 3 },
      { width: 1 },
      { width: 2 },
      { width: 0 },
      { width: 0 },
      { width: 1 },
    ])
  })

  it('gives a note without an appearance the icon box and name PDF.js gives it', () => {
    const [bare, drawn] = read([
      annot(0, { subtype: 'Text', hasAppearance: false }),
      annot(1, { subtype: 'Text', icon: 'Comment' }),
    ])
    expect(bare).toMatchObject({ rect: [10, 28, 32, 50], icon: 'Note', author: '' })
    expect(drawn).toMatchObject({ rect: [10, 10, 50, 50], icon: 'NoIcon' })
  })

  it('gives every annotation its contents, and markup its author, empty when absent', () => {
    const [link, square] = read([annot(0, { subtype: 'Link' }), annot(1)])
    expect(link).toMatchObject({ contents: '' })
    expect(link).not.toHaveProperty('author')
    expect(square).toMatchObject({ contents: '', author: '' })
  })

  it("reads a popup's text, dates and colour from its parent", () => {
    const [square, popup] = read([
      annot(0, {
        contents: 'Hello',
        author: 'Ann',
        created: 'D:2026',
        modified: 'D:2027',
        color: [1, 0, 0],
      }),
      annot(1, { subtype: 'Popup', parent: { objectNumber: 10, generation: 0 } }),
    ])
    expect(popup).toMatchObject({
      contents: 'Hello',
      author: 'Ann',
      created: 'D:2026',
      modified: 'D:2027',
      color: [255, 0, 0],
    })
    expect(square!.id).toBe('10R')
  })

  it("lists a popup its own flags hide when its parent's flags show it, as PDF.js does", () => {
    // Values from PDF.js 6.4.299 over the same dictionaries.
    const parentOf = (objectNumber: number) => ({ objectNumber, generation: 0 })
    const listed = read([
      annot(0, { contents: 'Hello', author: 'Ann', color: [1, 0, 0] }),
      annot(1, { subtype: 'Popup', flags: 32, parent: parentOf(10) }), // parent shown: listed
      annot(2, { subtype: 'Popup', flags: 32, parent: parentOf(30) }), // parent off the page: listed
      annot(3, { flags: 32 }), // no view
      annot(4, { subtype: 'Popup', flags: 32, parent: parentOf(13) }), // parent no view: left out
      annot(5, { flags: 1 }), // invisible: listed itself, as a kind PDF.js knows
      annot(6, { subtype: 'Popup', flags: 32, parent: parentOf(15) }), // parent invisible: left out
      annot(7, { subtype: 'Popup', flags: 32 }), // no parent: left out
    ])
    expect(listed.map((a) => a.id)).toEqual(['10R', '15R', '11R', '12R'])
    expect(listed[2]).toMatchObject({
      contents: 'Hello',
      author: 'Ann',
      color: [255, 0, 0],
    })
    // A parent off the page gives no text: the engine reports only the page's annotations.
    expect(listed[3]).toMatchObject({ contents: '', color: [0, 0, 0] })
  })

  it("takes a FreeText's /DA from the form when its own is empty", () => {
    const [freeText] = fileAnnotationsFromEngine(
      0,
      page([annot(0, { subtype: 'FreeText', defaultAppearance: '' })]),
      { defaultAppearance: '/Helv 9 Tf 0 0 1 rg', widgets: new Map() }
    )
    expect(freeText!.defaultAppearance).toEqual({
      fontName: 'Helv',
      fontSize: 9,
      color: [0, 0, 255],
    })
  })

  it("gives the box PDF.js draws for markup without an appearance: a squiggly's wave", () => {
    const [squiggly] = read([
      annot(0, {
        subtype: 'Squiggly',
        hasAppearance: false,
        rect: [72, 623, 400, 643],
        quads: [72, 643, 400, 643, 72, 623, 400, 623],
      }),
    ])
    expect(squiggly!.rect[1]).toBeCloseTo(616.333, 3)
    expect(squiggly!.rect[3]).toBeCloseTo(629.667, 3)
    expect(squiggly!.quads).toEqual([72, 643, 400, 643, 72, 623, 400, 623])
  })

  it('gives a line without an appearance its rect grown by its border, as PDF.js draws it', () => {
    const [line] = read([
      annot(0, {
        subtype: 'Line',
        hasAppearance: false,
        rect: [72, 400, 400, 450],
        line: [400, 450, 72, 400],
        borderStyle: { width: 2, style: 'S' },
      }),
    ])
    expect(line).toMatchObject({
      rect: [70, 398, 402, 452],
      line: [72, 400, 400, 450],
      lineEndings: ['None', 'None'],
    })
  })

  it('takes the numbers the engine gives as they are: each the shortest decimal of its float', () => {
    const [ink] = read([
      annot(0, { subtype: 'Ink', opacity: 0.4, inkLists: [[1, 2, 3]] }),
    ])
    expect(ink).toMatchObject({ opacity: 0.4, inkLists: [[1, 2, 0]] })
    // Absent or 0: 1, as PDF.js reads it.
    expect(read([annot(0, { subtype: 'Ink', opacity: 0 })])[0]!.opacity).toBe(1)
  })
})

describe('borderOf', () => {
  const rect = [0, 0, 100, 100]
  const style = (
    width: number | null,
    s: string | null,
    dash?: (number | null)[] | null
  ) => ({
    borderStyle: { width, style: s, ...(dash === undefined ? {} : { dash }) },
  })

  it('keeps the width for a /BS /D PDF.js takes: empty, or numbers from 0 with one above 0', () => {
    expect(borderOf(style(2, 'D', [3, 2]), rect)).toEqual({ width: 2, style: 2 })
    expect(borderOf(style(2, 'S', []), rect)).toEqual({ width: 2, style: 1 })
    expect(borderOf(style(2, 'S', [0, 3]), rect)).toEqual({ width: 2, style: 1 })
  })

  it('gives width 0 for a /BS /D PDF.js refuses: negative, all zero, not a number, not a list', () => {
    for (const dash of [[-1, 2], [0, 0], [3, null], null])
      expect(borderOf(style(2, 'D', dash), rect)).toEqual({ width: 0, style: 2 })
  })

  it("reads /Border's dash as /BS /D, and a dash it takes makes the style dashed", () => {
    expect(borderOf({ border: [0, 0, 1], borderDash: [4, 2] }, rect)).toEqual({
      width: 1,
      style: 2,
    })
    expect(borderOf({ border: [0, 0, 1], borderDash: [] }, rect)).toEqual({
      width: 1,
      style: 2,
    })
    expect(borderOf({ border: [0, 0, 1], borderDash: [4, -2] }, rect)).toEqual({
      width: 0,
      style: 1,
    })
    expect(borderOf({ border: [0, 0, 1], borderDash: null }, rect)).toEqual({
      width: 0,
      style: 1,
    })
  })

  it('reads no dash from /Border when /BS is there', () => {
    expect(
      borderOf({ ...style(3, null), border: [0, 0, 1], borderDash: [-1] }, rect)
    ).toEqual({ width: 3, style: 1 })
  })
})

describe('textOf', () => {
  it('drops escape sequences, as PDF.js does', () => {
    expect(textOf('\x1benBob')).toBe('')
    expect(textOf('\x1ben\x1bBob')).toBe('Bob')
  })

  it('decodes bytes that are not text as PDF.js does: PDFDocEncoding when UTF-16 does not decode', () => {
    expect(textOf({ bytes: new Uint8Array([0xfe, 0xff, 0xd8, 0x00]) })).toBe('þÿØ\0')
    expect(textOf({ bytes: new Uint8Array([0x41, 0x80, 0x9f]) })).toBe('A•\x9f')
  })

  it('drops escape sequences from bytes before PDFDocEncoding, where 0x1b is a character too', () => {
    // PDF.js: "\033en\033Bob" followed by 0x80 is "Bob•".
    const bytes = new Uint8Array([0x1b, 0x65, 0x6e, 0x1b, 0x42, 0x6f, 0x62, 0x80])
    expect(textOf({ bytes })).toBe('Bob•')
  })
})

describe('parseDefaultAppearance', () => {
  it('reads the font, size and fill colour, outside q', () => {
    expect(parseDefaultAppearance('/Helv 12 Tf 0 0 1 rg')).toEqual({
      fontName: 'Helv',
      fontSize: 12,
      color: [0, 0, 255],
    })
    expect(parseDefaultAppearance('q 1 g Q /F#20a 0 Tf .5 g')).toEqual({
      fontName: 'F a',
      fontSize: 0,
      color: [128, 128, 128],
    })
    expect(parseDefaultAppearance('')).toEqual({
      fontName: '',
      fontSize: 0,
      color: [0, 0, 0],
    })
  })

  it('takes the arguments each operator PDF.js knows takes, so none reach the next', () => {
    // `cm` takes six: `g` then has none to borrow and is skipped.
    expect(parseDefaultAppearance('/Helv 12 Tf 1 2 3 4 5 6 cm g').color).toEqual([
      0, 0, 0,
    ])
    // An operator PDF.js does not know leaves its arguments to the next.
    expect(parseDefaultAppearance('/Helv 12 Tf 1 zz g').color).toEqual([255, 255, 255])
  })
})
