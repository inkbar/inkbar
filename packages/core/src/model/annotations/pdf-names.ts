import { z } from 'zod'

/**
 * A PDF name: a non-empty run of regular characters, so no whitespace and none of the
 * delimiters `( ) < > [ ] { } / %`.
 */
export const PDF_NAME = /^[^\s()<>[\]{}/%]+$/

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

/** Line ending styles (PDF `/LE`). */
export const LINE_ENDINGS = [
  'None',
  'Square',
  'Circle',
  'Diamond',
  'OpenArrow',
  'ClosedArrow',
  'Butt',
  'ROpenArrow',
  'RClosedArrow',
  'Slash',
] as const

/** Note icons (PDF `/Name` on a text annotation). */
export const NOTE_ICONS = [
  'Comment',
  'Note',
  'Help',
  'Insert',
  'Key',
  'NewParagraph',
  'Paragraph',
] as const

/** Annotation intents (PDF `/IT`). */
export const INTENTS = [
  'FreeText',
  'FreeTextCallout',
  'FreeTextTypeWriter',
  'LineArrow',
  'LineDimension',
  'PolygonCloud',
  'PolygonDimension',
  'PolyLineDimension',
] as const

/** True when `v` is one of the values in `list`. */
export function isKnown<K extends readonly string[]>(list: K, v: string): v is K[number] {
  return (list as readonly string[]).includes(v)
}
