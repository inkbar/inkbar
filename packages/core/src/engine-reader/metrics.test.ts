import { describe, expect, it } from 'vitest'

import { fontMetrics, PDFJS_FALLBACK, type FontMetricFacts } from './metrics'

const font = (facts: Partial<FontMetricFacts>): FontMetricFacts => ({
  vertical: false,
  ascent: null,
  descent: null,
  descriptorAscent: null,
  descriptorDescent: null,
  standard: null,
  ...facts,
})

/** The face figures the engine gives Helvetica, which PDF.js does not use. */
const FACE = { ascent: 0.945, descent: -0.224 }

describe('fontMetrics', () => {
  it("takes the font descriptor's figures first", () => {
    expect(
      fontMetrics(font({ ...FACE, descriptorAscent: 0.88, descriptorDescent: -0.12 }))
    ).toEqual({ ascent: 0.88, descent: -0.12 })
  })

  it("takes PDF.js's table for a standard 14 font with no descriptor figures", () => {
    expect(fontMetrics(font({ ...FACE, standard: 'Helvetica' }))).toEqual({
      ascent: 0.718,
      descent: -0.207,
    })
    expect(fontMetrics(font({ standard: 'Times-Bold' }))).toEqual({
      ascent: 0.683,
      descent: -0.217,
    })
    expect(fontMetrics(font({ standard: 'Courier-Oblique' }))).toEqual({
      ascent: 0.629,
      descent: -0.157,
    })
    // PDF.js's table has none for these two, so its reader uses its fallback.
    expect(fontMetrics(font({ ...FACE, standard: 'Symbol' }))).toEqual(PDFJS_FALLBACK)
    expect(fontMetrics(font({ standard: 'ZapfDingbats' }))).toEqual(PDFJS_FALLBACK)
  })

  it("fills a standard font's missing descriptor figure from the table, as PDF.js does", () => {
    expect(fontMetrics(font({ standard: 'Helvetica', descriptorAscent: 0.75 }))).toEqual({
      ascent: 0.75,
      descent: -0.207,
    })
    expect(
      fontMetrics(
        font({ standard: 'Helvetica', descriptorAscent: 9, descriptorDescent: -0.3 })
      )
    ).toEqual({ ascent: 0.718, descent: -0.3 })
  })

  it("takes the face's figures when there are no others", () => {
    expect(fontMetrics(font(FACE))).toEqual(FACE)
  })

  it("takes PDF.js's fallback for a font the engine has no figures for, as a Type 3 font", () => {
    expect(fontMetrics(font({}))).toEqual(PDFJS_FALLBACK)
    // Figures left out count as none.
    expect(fontMetrics({ vertical: false })).toEqual(PDFJS_FALLBACK)
  })

  it('passes over zero, absent and absurd figures to the next source', () => {
    for (const bad of [
      { descriptorAscent: 0, descriptorDescent: 0 },
      { descriptorAscent: 0.8, descriptorDescent: null },
      { descriptorAscent: null, descriptorDescent: -0.2 },
      // An ascent of several ems, and a descent of more than one.
      { descriptorAscent: 5, descriptorDescent: -0.2 },
      { descriptorAscent: 0.8, descriptorDescent: -3 },
      { descriptorAscent: -0.8, descriptorDescent: -0.2 },
      { descriptorAscent: Number.NaN, descriptorDescent: -0.2 },
      { descriptorAscent: Number.POSITIVE_INFINITY, descriptorDescent: -0.2 },
    ])
      expect(fontMetrics(font({ ...FACE, ...bad }))).toEqual(FACE)
  })

  it('gives the loose box when the face figures fail the check too', () => {
    for (const face of [
      { ascent: 0, descent: -0.2 },
      { ascent: 0.9, descent: 1.3 },
      { ascent: 4, descent: -0.2 },
      { ascent: 0.9, descent: null },
    ])
      expect(fontMetrics(font(face))).toBeUndefined()
  })

  it('takes a positive descent below the baseline, as core takes the one PDF.js gives', () => {
    expect(
      fontMetrics(font({ ...FACE, descriptorAscent: 0.8, descriptorDescent: 0.2 }))
    ).toEqual({ ascent: 0.8, descent: -0.2 })
    expect(fontMetrics(font({ ascent: 0.9, descent: 0.3 }))).toEqual({
      ascent: 0.9,
      descent: -0.3,
    })
    expect(fontMetrics(font({ standard: 'Helvetica', descriptorDescent: 0.25 }))).toEqual(
      { ascent: 0.718, descent: -0.25 }
    )
  })

  it('takes figures on the bounds and passes over those just past them', () => {
    const descriptor = (descriptorAscent: number, descriptorDescent: number) =>
      fontMetrics(font({ ...FACE, descriptorAscent, descriptorDescent }))
    expect(descriptor(2, -0.2)).toEqual({ ascent: 2, descent: -0.2 })
    expect(descriptor(2.0001, -0.2)).toEqual(FACE)
    expect(descriptor(0.8, 0)).toEqual({ ascent: 0.8, descent: 0 })
    expect(descriptor(0.8, 0.0001)).toEqual({ ascent: 0.8, descent: -0.0001 })
    expect(descriptor(0.8, -1)).toEqual({ ascent: 0.8, descent: -1 })
    expect(descriptor(0.8, -1.0001)).toEqual(FACE)
    expect(descriptor(0.8, 1.0001)).toEqual(FACE)
    expect(descriptor(0.8, Number.NaN)).toEqual(FACE)
    expect(descriptor(Number.NaN, -0.2)).toEqual(FACE)
  })

  it('finds no table entry for a standard name that is a property of every object', () => {
    for (const standard of ['constructor', '__proto__', 'toString', 'hasOwnProperty'])
      expect(fontMetrics(font({ ...FACE, standard }))).toEqual(FACE)
  })

  it('gives the loose box for a vertical font, and for a character with no font entry', () => {
    expect(fontMetrics(font({ ...FACE, vertical: true }))).toBeUndefined()
    expect(fontMetrics(undefined)).toBeUndefined()
  })
})
