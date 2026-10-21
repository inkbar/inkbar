import {
  pointsFromFlat,
  quadsFromFlat,
  rectFromPoints,
  type Point,
  type Quad,
  type Rect,
} from '../geometry'
import { parsePdfDate } from '../pdf-date'

import { staticDefaults } from './defaults'
import { PDF_NAME } from './pdf-names'
import { AnnotationSchema, type Annotation } from './types'

import type { Fringe } from './callout'
import type { PdfjsAnnotationData } from '../../pdfjs/types'

export const SUPPORTED_SUBTYPES: ReadonlySet<string> = new Set([
  'Highlight',
  'Underline',
  'StrikeOut',
  'Squiggly',
  'Text',
  'FreeText',
  'Square',
  'Circle',
  'Line',
  'Polygon',
  'PolyLine',
  'Ink',
  'Redact',
])

export interface EmbeddedSummary {
  subtype: string
  count: number
  supported: boolean
}

export function pdfColorToHex(
  c: ArrayLike<number> | null | undefined,
  fallback: string
): string {
  if (!c || c.length < 3) return fallback
  const hex = [c[0]!, c[1]!, c[2]!]
    .map((n) => Math.round(n).toString(16).padStart(2, '0'))
    .join('')
  return `#${hex}`.toUpperCase()
}

/** PDF.js hands back `rect` already in user space, but not always ordered; normalise with min/max. */
function rectFromPdf(r: ArrayLike<number>): Rect {
  return rectFromPoints({ x: r[0]!, y: r[1]! }, { x: r[2]!, y: r[3]! })
}

/** A PDF name exactly as PDF.js gives it (names are case-sensitive), or undefined if invalid. */
function pdfName(raw: string | undefined): string | undefined {
  return raw !== undefined && PDF_NAME.test(raw) ? raw : undefined
}

/** `head` and `tail` from a Line's or PolyLine's `/LE`, left out when both are `None`. */
function lineEndingsOf(
  raw: readonly string[] | undefined
): { head: string; tail: string } | Record<string, never> {
  // PDF.js already turns a name it does not know into `None`.
  const endings = raw?.map((e) => pdfName(e) ?? 'None')
  return endings && endings.length === 2 && endings.some((e) => e !== 'None')
    ? { head: endings[0]!, tail: endings[1]! }
    : {}
}

/**
 * Imported ids are `pdf:<page>:<pdfjsId>` (page is 0-based, pdfjsId is the annotation's object
 * reference such as `12R`). They are stable across opens of the same file, and `inReplyTo`
 * uses the same scheme so threads resolve.
 */
export function importedId(page: number, pdfjsId: string): string {
  return `pdf:${page}:${pdfjsId}`
}

/**
 * @internal An imported annotation whose fields PDF.js leaves out, to be read from the file itself once
 * the document is ready: a FreeText's `/CL`, `/RD`, `/LE` and `/DA` font, or a note's `/Name`
 * when PDF.js reports `NoIcon`.
 */
export interface EmbeddedTarget {
  /** The imported id, `pdf:<page>:<pdfjsId>`. */
  id: string
  subtype: 'FreeText' | 'Text'
  /** The annotation's `/Rect` as PDF.js gives it, `[x1, y1, x2, y2]`. */
  rect: readonly number[]
  /** FreeText only: the `/DA` font resource name. */
  daFont?: string
}

/**
 * The fields read from the file for one embedded annotation: what PDF.js left out. They merge
 * onto the annotation as it is when they land, so edits made in between are kept.
 */
export interface EmbeddedFieldPatch {
  /** FreeText `/CL`: the tip, an optional bend, and where the line meets the box. */
  callout?: Point[]
  /** FreeText `/RD`. */
  fringe?: Fringe
  /** FreeText `/LE`. */
  head?: string
  /** Text `/Name`. */
  icon?: string
  /** FreeText `/DA` font, merged into `defaultStyle`. */
  font?: { fontFamily?: string; fontWeight?: 'bold'; fontStyle?: 'italic' }
}

/**
 * Imports one page's PDF.js annotation data. `targets` is @internal: the annotations whose
 * missing fields the document reads from the file after `ready`.
 */
export function importEmbeddedPage(
  page: number,
  raw: PdfjsAnnotationData[],
  importedAt: string
): {
  annotations: Annotation[]
  counts: Record<string, number>
  targets: EmbeddedTarget[]
} {
  const counts: Record<string, number> = {}
  const annotations: Annotation[] = []
  const targets: EmbeddedTarget[] = []
  for (const data of raw) {
    counts[data.subtype] = (counts[data.subtype] ?? 0) + 1
    if (!SUPPORTED_SUBTYPES.has(data.subtype) || data.hidden || data.noView) continue
    const converted = convert(page, data, importedAt)
    if (!converted) continue
    annotations.push(converted)
    const target = targetOf(converted.id, data)
    if (target) targets.push(target)
  }
  return { annotations, counts, targets }
}

function targetOf(id: string, d: PdfjsAnnotationData): EmbeddedTarget | undefined {
  const rect = Array.from(d.rect)
  if (d.subtype === 'Text')
    return d.name === 'NoIcon' ? { id, subtype: 'Text', rect } : undefined
  if (d.subtype !== 'FreeText') return undefined
  const daFont = d.defaultAppearanceData?.fontName
  return { id, subtype: 'FreeText', rect, ...(daFont ? { daFont } : {}) }
}

export function summarise(perPage: Record<string, number>[]): EmbeddedSummary[] {
  const totals = new Map<string, number>()
  for (const counts of perPage) {
    for (const [k, v] of Object.entries(counts)) totals.set(k, (totals.get(k) ?? 0) + v)
  }
  return [...totals.entries()]
    .map(([subtype, count]) => ({
      subtype,
      count,
      supported: SUPPORTED_SUBTYPES.has(subtype),
    }))
    .sort((a, b) => (a.subtype < b.subtype ? -1 : a.subtype > b.subtype ? 1 : 0))
}

function convert(
  page: number,
  d: PdfjsAnnotationData,
  importedAt: string
): Annotation | undefined {
  const created = parsePdfDate(
    d.creationDate,
    parsePdfDate(d.modificationDate, importedAt)
  )
  const author = d.titleObj?.str
  const contents = d.contentsObj?.str
  const stroke = d.borderStyle?.width ?? 1
  const quads: Quad[] = d.quadPoints ? quadsFromFlat(d.quadPoints) : []
  const optional = (v: unknown) => v !== undefined && v !== ''
  const withColor = (type: Annotation['type'], source = d.color) =>
    pdfColorToHex(source, staticDefaults.color(type))
  const intent = pdfName(d.it)
  const base = (type: Annotation['type'], color = withColor(type)) => ({
    id: importedId(page, d.id),
    page,
    rect: rectFromPdf(d.rect),
    color,
    opacity: d.opacity ?? 1,
    ...(optional(author) ? { author } : {}),
    ...(optional(contents) ? { contents } : {}),
    ...(d.inReplyTo ? { inReplyTo: importedId(page, d.inReplyTo) } : {}),
    ...(intent !== undefined ? { intent } : {}),
    createdAt: created,
    modifiedAt: parsePdfDate(d.modificationDate, created),
    source: 'pdf' as const,
    locked: true,
  })
  const fillOf = (c: ArrayLike<number> | null | undefined) =>
    c && c.length >= 3 ? { interiorColor: pdfColorToHex(c, '#FFFFFF') } : {}

  let candidate: Record<string, unknown>
  switch (d.subtype) {
    case 'Highlight':
    case 'Underline':
    case 'StrikeOut':
    case 'Squiggly': {
      if (quads.length === 0) return undefined
      const type =
        d.subtype === 'StrikeOut' ? 'strikeout' : (d.subtype.toLowerCase() as 'highlight')
      candidate = { ...base(type), type, quads }
      break
    }
    case 'Text': {
      // PDF.js reports `NoIcon` for any note with an appearance stream, hiding its `/Name`.
      // Leave the icon out then, as when there is no `/Name`, so the default `Note` applies.
      const icon = d.name === 'NoIcon' ? undefined : pdfName(d.name)
      candidate = {
        ...base('text'),
        type: 'text',
        ...(icon !== undefined ? { icon } : {}),
      }
      break
    }
    case 'FreeText': {
      // XFDF and PDF agree: `/C` is the box's fill, `/DA` the text's colour and size.
      const da = d.defaultAppearanceData
      const { color: _stroke, ...rest } = base('freetext')
      candidate = {
        ...rest,
        ...(d.color && d.color.length >= 3
          ? { color: pdfColorToHex(d.color, '#FFFFFF') }
          : {}),
        type: 'freetext',
        contents: contents ?? '',
        width: d.borderStyle?.width ?? 0,
        defaultStyle: {
          color: pdfColorToHex(
            da?.fontColor as ArrayLike<number> | undefined,
            staticDefaults.color('freetext')
          ),
          ...(da && da.fontSize > 0 ? { fontSize: da.fontSize } : {}),
        },
      }
      break
    }
    case 'Square':
    case 'Circle': {
      const type = d.subtype.toLowerCase() as 'square' | 'circle'
      candidate = { ...base(type), type, width: stroke, ...fillOf(d.interiorColor) }
      break
    }
    case 'Line': {
      const l = d.lineCoordinates ?? [d.rect[0], d.rect[1], d.rect[2], d.rect[3]]
      candidate = {
        ...base('line'),
        type: 'line',
        start: { x: l[0], y: l[1] },
        end: { x: l[2], y: l[3] },
        width: stroke,
        ...lineEndingsOf(d.lineEndings),
      }
      break
    }
    case 'Polygon':
    case 'PolyLine': {
      const type = d.subtype === 'Polygon' ? 'polygon' : 'polyline'
      const vertices = d.vertices ? pointsFromFlat(d.vertices) : []
      if (vertices.length < 2) return undefined
      candidate = {
        ...base(type),
        type,
        vertices,
        width: stroke,
        ...fillOf(d.interiorColor),
        ...(type === 'polyline' ? lineEndingsOf(d.lineEndings) : {}),
      }
      break
    }
    case 'Ink': {
      const inklist: Point[][] = (d.inkLists ?? [])
        .map((p) => pointsFromFlat(p))
        .filter((p) => p.length > 0)
      if (inklist.length === 0) return undefined
      candidate = { ...base('ink'), type: 'ink', inklist, width: stroke }
      break
    }
    case 'Redact':
      // PDF.js 6.4 exposes neither QuadPoints nor /OverlayText for Redact, so only quads
      // that happen to be present are used, and `overlaidText` (the text beneath) is ignored.
      candidate = {
        ...base('redact'),
        type: 'redact',
        interiorColor: pdfColorToHex(d.interiorColor, staticDefaults.fill()),
        ...(quads.length > 0 ? { quads } : {}),
      }
      break
    default:
      return undefined
  }
  const parsed = AnnotationSchema.safeParse(candidate)
  return parsed.success ? parsed.data : undefined
}
