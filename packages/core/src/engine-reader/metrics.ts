// How tall a run's box stands about its baseline, from the facts the engine reports about its
// font, chosen to give the height core gave the same text with PDF.js.

/** A font's height above and depth below the baseline, in em units. `descent` is 0 or less. */
export interface FontMetrics {
  ascent: number
  descent: number
}

/** @internal The facts about a font the height rule reads. A field left out counts as `null`. */
export interface FontMetricFacts {
  vertical: boolean
  /** The face the engine loaded: its figures, in em units. */
  ascent?: number | null
  descent?: number | null
  /** The font descriptor's `/Ascent` and `/Descent` over 1000, sign as written. */
  descriptorAscent?: number | null
  descriptorDescent?: number | null
  /** The standard 14 font drawn for a font with no embedded file. */
  standard?: string | null
}

/**
 * The figures PDF.js 6.4.299 uses when it has none of its own for a font, as core applied
 * them when it read text with PDF.js.
 */
export const PDFJS_FALLBACK: FontMetrics = { ascent: 0.75, descent: -0.25 }

/**
 * The ascent and descent PDF.js 6.4.299 gives a standard 14 font that has no embedded file and no
 * figures in a font descriptor. In a browser PDF.js draws such a font with a system font and takes
 * its figures from its own table, `getFontBasicMetrics` in `src/core/metrics.js`, over 1000. That
 * table holds no figures for Symbol and ZapfDingbats: PDF.js loads its own font file for those
 * two, reads none from it, and core then used `PDFJS_FALLBACK`.
 */
export const PDFJS_STANDARD_METRICS: Readonly<Record<string, FontMetrics>> = {
  Courier: { ascent: 0.629, descent: -0.157 },
  'Courier-Bold': { ascent: 0.629, descent: -0.157 },
  'Courier-Oblique': { ascent: 0.629, descent: -0.157 },
  'Courier-BoldOblique': { ascent: 0.629, descent: -0.157 },
  Helvetica: { ascent: 0.718, descent: -0.207 },
  'Helvetica-Bold': { ascent: 0.718, descent: -0.207 },
  'Helvetica-Oblique': { ascent: 0.718, descent: -0.207 },
  'Helvetica-BoldOblique': { ascent: 0.718, descent: -0.207 },
  'Times-Roman': { ascent: 0.683, descent: -0.217 },
  'Times-Bold': { ascent: 0.683, descent: -0.217 },
  'Times-Italic': { ascent: 0.683, descent: -0.217 },
  'Times-BoldItalic': { ascent: 0.683, descent: -0.217 },
  Symbol: PDFJS_FALLBACK,
  ZapfDingbats: PDFJS_FALLBACK,
}

/** The highest ascent taken, in ems. A figure above it is a fault in the file. */
const MAX_ASCENT = 2
/** The deepest descent taken, in ems. */
const MAX_DESCENT = 1

const saneAscent = (a: number | null | undefined): a is number =>
  typeof a === 'number' && Number.isFinite(a) && a > 0 && a <= MAX_ASCENT
/**
 * A descent as core took one from PDF.js, below the baseline whatever its sign (a positive
 * `/Descent` is a common fault), or `undefined` when it is not a number or deeper than one em.
 */
const depth = (d: number | null | undefined): number | undefined =>
  typeof d === 'number' && Number.isFinite(d) && Math.abs(d) <= MAX_DESCENT
    ? 0 - Math.abs(d)
    : undefined

/**
 * @internal The ascent and descent a run in `font` stands on, or `undefined` for the loose box
 * the engine gives each character.
 *
 * PDF.js 6.4.299 in a browser takes a font's figures from its font descriptor, except for an
 * embedded TrueType or OpenType font, where it reads the font program's own `hhea` table; a
 * standard 14 font with no file and no descriptor figures takes them from PDF.js's table; a font
 * with none of these, a Type 3 font among them, takes `PDFJS_FALLBACK`. The engine does not say
 * which fonts are embedded TrueType, so this takes, in order:
 *
 * 1. the descriptor's `/Ascent` and `/Descent`, which are the font program's own for most files;
 * 2. for a standard 14 font, PDF.js's table, in place of whichever descriptor figure is missing
 *    or fails the check below;
 * 3. the figures of the face the engine loaded;
 * 4. when the engine has no figures for the face, which happens for a Type 3 font and for a
 *    font whose figures are all 0, `PDFJS_FALLBACK`, as PDF.js has none either;
 * 5. otherwise the loose box.
 *
 * A descent is taken below the baseline whatever its sign, as core took the absolute value
 * of the one PDF.js gives. A source is used only when its ascent is above 0 and
 * at most 2 ems and its descent at most 1 em deep; anything else falls to the next. PDF.js keeps
 * a descriptor's figures whatever they are, so on such a file the heights differ.
 * A vertical font always takes the loose box: across a column the box's size is the glyphs'
 * width, which no ascent describes.
 */
export function fontMetrics(font: FontMetricFacts | undefined): FontMetrics | undefined {
  if (!font || font.vertical) return undefined
  const { descriptorAscent: da, descriptorDescent: dd } = font
  // Only the table's own names: a name such as `constructor` finds nothing.
  const table =
    font.standard && Object.hasOwn(PDFJS_STANDARD_METRICS, font.standard)
      ? PDFJS_STANDARD_METRICS[font.standard]
      : undefined
  const descriptorDepth = depth(dd)
  if (table)
    return {
      ascent: saneAscent(da) ? da : table.ascent,
      descent: descriptorDepth ?? table.descent,
    }
  if (saneAscent(da) && descriptorDepth !== undefined)
    return { ascent: da, descent: descriptorDepth }
  const { ascent, descent } = font
  if (ascent == null && descent == null) return PDFJS_FALLBACK
  const faceDepth = depth(descent)
  if (saneAscent(ascent) && faceDepth !== undefined) return { ascent, descent: faceDepth }
  return undefined
}
