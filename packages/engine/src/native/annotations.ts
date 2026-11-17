import { EngineError } from '../errors.ts'

import { buildAppearance } from './appearance.ts'
import { withBytes, withFloats, withUtf16, withUtf8, type Heap } from './strings.ts'

import type { WriteAnnotation } from '../types.ts'
import type { Annotation as GlossAnnotation, Point, Quad } from 'gloss-format'

/** PDFium's annotation subtype numbers. */
const SUBTYPE = {
  Text: 1,
  FreeText: 3,
  Line: 4,
  Square: 5,
  Circle: 6,
  Polygon: 7,
  PolyLine: 8,
  Highlight: 9,
  Underline: 10,
  Squiggly: 11,
  StrikeOut: 12,
  Stamp: 13,
  Ink: 15,
  Redact: 28,
} as const

/** Annotation flags. */
const HIDDEN = 2
const PRINT = 4

/** Colour kinds for PDFium's colour setter: /C and /IC. */
const COLOR = 0
const INTERIOR_COLOR = 1

/**
 * PDFium's border style numbers for /BS /S. Only these two are passed: the setter writes the
 * width before it checks the style, so an unknown style would change the width and then fail.
 */
const BORDER_SOLID = 1
const BORDER_DASHED = 2

/**
 * Whether `dashes` draws dashes: at least one length, every one finite and not negative, and not
 * all zero. Anything else is written as a solid border.
 */
function isDashPattern(
  dashes: readonly number[] | undefined
): dashes is readonly number[] {
  return (
    dashes !== undefined &&
    dashes.length > 0 &&
    dashes.every((d) => Number.isFinite(d) && d >= 0) &&
    dashes.some((d) => d > 0)
  )
}

/** PDFium's line ending numbers, by PDF name. A name not listed is written as None. */
const LINE_ENDINGS: Record<string, number> = {
  None: 0,
  Square: 1,
  Circle: 2,
  Diamond: 3,
  OpenArrow: 4,
  ClosedArrow: 5,
  Butt: 6,
  ROpenArrow: 7,
  RClosedArrow: 8,
  Slash: 9,
}

/** PDFium's standard font numbers: a family's regular face, then bold, bold italic, italic. */
const FONT_FAMILIES = { Courier: 0, Helvetica: 4, Times: 8 } as const

/** What a font family name says about its family, as Inkbar lays text out on screen. */
const TIMES = /times|serif|roman|georgia|garamond|minion|cambria|palatino/i
const COURIER = /courier|mono|consol|menlo|typewriter|code/i
const SANS = /sans/i

/**
 * PDFium's text alignment numbers: /Q. Justified text, and a name not listed, is written as
 * left-aligned.
 */
const ALIGNMENT: Record<string, number> = { left: 0, center: 1, right: 2, justify: 0 }

/** The number `table` holds for `name` as its own key, or 0: an inherited key is not a name. */
const numbered = (table: Record<string, number>, name: string | undefined): number =>
  name !== undefined && Object.hasOwn(table, name) ? (table[name] as number) : 0

/** The standard font number nearest to a free text box's style. */
function standardFont(family: string, bold: boolean, italic: boolean): number {
  const base =
    TIMES.test(family) && !SANS.test(family)
      ? FONT_FAMILIES.Times
      : COURIER.test(family)
        ? FONT_FAMILIES.Courier
        : FONT_FAMILIES.Helvetica
  return base + (bold ? (italic ? 2 : 1) : italic ? 3 : 0)
}

/** The PDF subtype an annotation is written as. A loupe or a mask is a stamp; a reply a note. */
function subtypeOf(annotation: GlossAnnotation, reply: boolean): number | undefined {
  if (reply) return SUBTYPE.Text
  const inkbar = annotation.custom?.inkbar
  const kind =
    typeof inkbar === 'object' && inkbar !== null && 'type' in inkbar
      ? inkbar.type
      : undefined
  if (
    (annotation.type === 'circle' || annotation.type === 'square') &&
    (kind === 'loupe' || kind === 'mask')
  )
    return SUBTYPE.Stamp
  const subtypes: Record<GlossAnnotation['type'], number> = {
    highlight: SUBTYPE.Highlight,
    underline: SUBTYPE.Underline,
    strikeout: SUBTYPE.StrikeOut,
    squiggly: SUBTYPE.Squiggly,
    text: SUBTYPE.Text,
    freetext: SUBTYPE.FreeText,
    square: SUBTYPE.Square,
    circle: SUBTYPE.Circle,
    line: SUBTYPE.Line,
    polyline: SUBTYPE.PolyLine,
    polygon: SUBTYPE.Polygon,
    ink: SUBTYPE.Ink,
    stamp: SUBTYPE.Stamp,
    redact: SUBTYPE.Redact,
  }
  return Object.hasOwn(subtypes, annotation.type) ? subtypes[annotation.type] : undefined
}

/** `#rrggbb` as three numbers from 0 to 255, or undefined when it is not one. */
function rgb(color: string): [number, number, number] | undefined {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  if (!match) return undefined
  return [1, 2, 3].map((i) => Number.parseInt(match[i] as string, 16)) as [
    number,
    number,
    number,
  ]
}

const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:(Z)|([+-])(\d{2}):?(\d{2}))$/i

/**
 * An ISO 8601 date-time as a PDF date string, keeping its offset: `2026-11-17T10:45:15+01:00`
 * is `D:20261117104515+01'00'`. Fractions of a second are dropped.
 */
export function pdfDate(iso: string): string | undefined {
  const m = ISO_DATE.exec(iso)
  if (!m) return undefined
  const [, year, month, day, hour, minute, second = '00', zulu, sign, offH, offM] = m
  const zone = zulu ? 'Z' : `${sign}${offH}'${offM}'`
  return `D:${year}${month}${day}${hour}${minute}${second}${zone}`
}

const quadFloats = (q: Quad) => [
  q.p1.x,
  q.p1.y,
  q.p2.x,
  q.p2.y,
  q.p3.x,
  q.p3.y,
  q.p4.x,
  q.p4.y,
]
const pointFloats = (points: readonly Point[]) => points.flatMap((p) => [p.x, p.y])

/**
 * Writes one annotation on `page` and returns its handle, which the caller closes. A reply is
 * linked to `target`, the handle of the file annotation its `replyTo` names (0 when the page has
 * none), or else to its parent's handle in `parents`, by Gloss id: the annotations written
 * earlier in the same call. On failure the annotation's
 * handle is closed and a `write-failed` error naming its id is thrown; the annotation may be
 * left half written in the document, so the caller discards the document.
 */
export function writeAnnotation(
  heap: Heap,
  doc: number,
  page: number,
  item: WriteAnnotation,
  parents: ReadonlyMap<string, number>,
  target?: number
): number {
  const { fn } = heap
  const { annotation } = item
  const failed = (what: string) =>
    new EngineError(
      'write-failed',
      `Annotation ${annotation.id} could not be written: ${what}.`,
      { annotation: annotation.id }
    )
  const check = (ok: number, what: string) => {
    if (!ok) throw failed(`${what} could not be set`)
  }
  const { replyTo } = item
  const reply = replyTo !== undefined || annotation.inReplyTo !== undefined
  const subtype = subtypeOf(annotation, reply)
  if (subtype === undefined)
    throw failed(`the type ${annotation.type} is not one it knows`)
  if (replyTo && !target)
    throw failed(
      `the annotation it replies to, object ${replyTo.objectNumber} on page ${replyTo.page}, is not there`
    )
  const parent = replyTo
    ? target
    : reply
      ? parents.get(annotation.inReplyTo as string)
      : undefined
  if (reply && parent === undefined)
    throw failed(
      `its parent ${annotation.inReplyTo} is not among the annotations written before it in the same call; a parent must come earlier in the list than its replies`
    )
  if (!reply && !item.appearance) throw failed('it has no appearance')

  const annot = fn.FPDFPage_CreateAnnot(page, subtype)
  if (annot === 0) throw failed('it could not be created')
  try {
    const setString = (key: string, value: string | undefined) => {
      if (value === undefined) return
      check(
        withUtf8(heap, key, (k) =>
          withUtf16(heap, value, (v) => fn.FPDFAnnot_SetStringValue(annot, k, v))
        ),
        `/${key}`
      )
    }
    const setColor = (kind: number, color: string | undefined, key: string) => {
      if (color === undefined) return
      const parts = rgb(color)
      if (!parts) throw failed(`its colour ${color} is not #rrggbb`)
      check(fn.EPDFAnnot_SetColor(annot, kind, ...parts), `/${key}`)
    }
    const setDate = (key: string, iso: string | undefined) => {
      if (iso === undefined) return
      const date = pdfDate(iso)
      if (!date) throw failed(`its date ${iso} is not an ISO 8601 date-time`)
      setString(key, date)
    }
    const setName = (setter: (pointer: number) => number, name: string, key: string) => {
      check(
        withUtf8(heap, name, (n) => setter(n)),
        `/${key}`
      )
    }
    const appendQuads = (quads: readonly Quad[] | undefined) => {
      for (const quad of quads ?? [])
        check(
          withFloats(heap, quadFloats(quad), (q) =>
            fn.FPDFAnnot_AppendAttachmentPoints(annot, q)
          ),
          '/QuadPoints'
        )
    }
    // /BS holds the style, the width and the dashes, and viewers read it first. /Border holds
    // the corner radius, which /BS cannot, with the same width for viewers that read only it.
    const setBorder = (
      width: number | undefined,
      dashes: readonly number[] | undefined,
      radius = 0
    ) => {
      if (width === undefined) return
      check(fn.FPDFAnnot_SetBorder(annot, radius, radius, width), '/Border')
      const dashed = isDashPattern(dashes)
      check(
        fn.EPDFAnnot_SetBorderStyle(annot, dashed ? BORDER_DASHED : BORDER_SOLID, width),
        '/BS'
      )
      if (dashed)
        check(
          withFloats(heap, dashes, (pattern, count) =>
            fn.EPDFAnnot_SetBorderDashPattern(annot, pattern, count)
          ),
          '/BS /D'
        )
    }
    const setEndings = (head: string | undefined, tail: string | undefined) => {
      if (head === undefined && tail === undefined) return
      check(
        fn.EPDFAnnot_SetLineEndings(
          annot,
          numbered(LINE_ENDINGS, head),
          numbered(LINE_ENDINGS, tail)
        ),
        '/LE'
      )
    }

    // Entries every annotation carries.
    setString('NM', annotation.id)
    setString('Contents', annotation.contents)
    setString('T', annotation.author)
    setString('Subj', annotation.subject)
    setDate('CreationDate', annotation.createdAt)
    setDate('M', annotation.modifiedAt)
    setColor(COLOR, annotation.color, 'C')
    const opacity = annotation.opacity ?? 1
    if (opacity !== 1) check(fn.EPDFAnnot_SetOpacity(annot, opacity), '/CA')
    if (annotation.intent !== undefined)
      setName((n) => fn.EPDFAnnot_SetIntent(annot, n), annotation.intent, 'IT')

    // Entries of its kind. A loupe or a mask is a stamp and has none.
    if (reply) {
      if (annotation.type === 'text')
        setName((n) => fn.EPDFAnnot_SetName(annot, n), annotation.icon ?? 'Note', 'Name')
    } else if (subtype !== SUBTYPE.Stamp || annotation.type === 'stamp') {
      switch (annotation.type) {
        case 'highlight':
        case 'underline':
        case 'strikeout':
        case 'squiggly':
          appendQuads(annotation.quads)
          break
        case 'text':
          setName(
            (n) => fn.EPDFAnnot_SetName(annot, n),
            annotation.icon ?? 'Note',
            'Name'
          )
          break
        case 'freetext': {
          const style = annotation.defaultStyle
          const text = rgb(style?.color ?? '#000000')
          if (!text) throw failed(`its text colour ${style?.color} is not #rrggbb`)
          check(
            fn.EPDFAnnot_SetDefaultAppearance(
              annot,
              standardFont(
                style?.fontFamily ?? 'Helvetica',
                style?.fontWeight === 'bold',
                style?.fontStyle === 'italic'
              ),
              style?.fontSize ?? 12,
              ...text
            ),
            '/DA'
          )
          check(
            fn.EPDFAnnot_SetTextAlignment(annot, numbered(ALIGNMENT, style?.textAlign)),
            '/Q'
          )
          setBorder(annotation.width, annotation.dashes, annotation.cornerRadius)
          const callout = annotation.callout
          if (callout && callout.length > 0) {
            if (callout.length !== 2 && callout.length !== 3)
              throw failed('its callout line needs two or three points')
            check(
              withFloats(heap, pointFloats(callout), (points) =>
                fn.EPDFAnnot_SetCalloutLine(annot, points, callout.length)
              ),
              '/CL'
            )
            if (annotation.intent === undefined)
              setName((n) => fn.EPDFAnnot_SetIntent(annot, n), 'FreeTextCallout', 'IT')
            // A free text box's /LE is the one ending, at the callout's tip.
            if (annotation.head !== undefined) setEndings(undefined, annotation.head)
          }
          break
        }
        case 'square':
        case 'circle':
          setColor(INTERIOR_COLOR, annotation.interiorColor, 'IC')
          setBorder(
            annotation.width,
            annotation.dashes,
            annotation.type === 'square' ? annotation.cornerRadius : undefined
          )
          break
        case 'line':
          check(
            withFloats(heap, pointFloats([annotation.start]), (start) =>
              withFloats(heap, pointFloats([annotation.end]), (end) =>
                fn.EPDFAnnot_SetLine(annot, start, end)
              )
            ),
            '/L'
          )
          setEndings(annotation.head, annotation.tail)
          setBorder(annotation.width, annotation.dashes)
          break
        case 'polyline':
        case 'polygon':
          check(
            withFloats(heap, pointFloats(annotation.vertices), (points) =>
              fn.EPDFAnnot_SetVertices(annot, points, annotation.vertices.length)
            ),
            '/Vertices'
          )
          setColor(INTERIOR_COLOR, annotation.interiorColor, 'IC')
          if (annotation.type === 'polyline') setEndings(annotation.head, annotation.tail)
          setBorder(annotation.width, annotation.dashes)
          break
        case 'ink':
          for (const stroke of annotation.inklist)
            check(
              withFloats(heap, pointFloats(stroke), (points) =>
                fn.FPDFAnnot_AddInkStroke(annot, points, stroke.length) >= 0 ? 1 : 0
              ),
              '/InkList'
            )
          setBorder(annotation.width, annotation.dashes)
          break
        case 'redact':
          appendQuads(annotation.quads)
          setColor(INTERIOR_COLOR, annotation.interiorColor, 'IC')
          setString('OverlayText', annotation.overlayText)
          break
        case 'stamp':
          break
      }
    }

    if (reply) {
      const { x, y, width, height } = annotation.rect
      // FS_RECTF: left, top, right, bottom.
      check(
        withFloats(heap, [x, y + height, x + width, y], (r) =>
          fn.FPDFAnnot_SetRect(annot, r)
        ),
        '/Rect'
      )
      check(
        withUtf8(heap, 'IRT', (key) =>
          fn.EPDFAnnot_SetLinkedAnnot(annot, key, parent as number)
        ),
        '/IRT'
      )
      check(fn.FPDFAnnot_SetFlags(annot, HIDDEN | PRINT), '/F')
    } else {
      check(fn.FPDFAnnot_SetFlags(annot, PRINT), '/F')
      // Installing takes the appearance whether or not it works.
      const appearance = buildAppearance(heap, doc, item.appearance!, failed)
      check(fn.INK_Annot_SetAppearance(annot, appearance), 'its appearance')
    }

    check(
      withBytes(heap, new TextEncoder().encode(item.data), (data, length) =>
        fn.INK_Annot_SetData(annot, data, length)
      ),
      'its data'
    )
    return annot
  } catch (error) {
    if (!heap.stopped) fn.FPDFPage_CloseAnnot(annot)
    throw error
  }
}
