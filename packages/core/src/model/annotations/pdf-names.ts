import { PDF_NAME } from 'gloss-format'
import { z } from 'zod'

export { INTENTS, LINE_ENDINGS, NOTE_ICONS, PDF_NAME } from 'gloss-format'

/**
 * A set of PDF names Inkbar knows that stays open: any other valid PDF name loads, is kept and
 * is written back unchanged. The output type keeps autocomplete for the known values.
 */
export function pdfNameSet<const K extends readonly [string, ...string[]]>(known: K) {
  return z
    .union([z.enum(known), z.string().regex(PDF_NAME, 'expected a PDF name')])
    .describe(
      `One of ${known.join(', ')}. Any other PDF name is allowed and kept unchanged.`
    ) as z.ZodType<K[number] | (string & {}), K[number] | (string & {})>
}

/** True when `v` is one of the values in `list`. */
export function isKnown<K extends readonly string[]>(list: K, v: string): v is K[number] {
  return (list as readonly string[]).includes(v)
}
