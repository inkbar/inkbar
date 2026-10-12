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
import { AnnotationSchema, type Annotation } from './types'

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

const ICONS: Record<
  string,
  'comment' | 'note' | 'help' | 'insert' | 'key' | 'paragraph'
> = {
  comment: 'comment',
  note: 'note',
  help: 'help',
  insert: 'insert',
  key: 'key',
  paragraph: 'paragraph',
  newparagraph: 'paragraph',
}

const ENDINGS: Record<string, string> = {
  none: 'none',
  openarrow: 'openArrow',
  closedarrow: 'closedArrow',
  square: 'square',
  circle: 'circle',
  diamond: 'diamond',
  butt: 'butt',
  slash: 'slash',
  rslash: 'slash',
}

/**
 * Imported ids are `pdf:<page>:<pdfjsId>` (page is 0-based, pdfjsId is the annotation's object
 * reference such as `12R`). They are stable across opens of the same file, and `inReplyTo`
 * uses the same scheme so threads resolve.
 */
export function importedId(page: number, pdfjsId: string): string {
  return `pdf:${page}:${pdfjsId}`
}

export function importEmbeddedPage(
  page: number,
  raw: PdfjsAnnotationData[],
  importedAt: string
): { annotations: Annotation[]; counts: Record<string, number> } {
  const counts: Record<string, number> = {}
  const annotations: Annotation[] = []
  for (const data of raw) {
    counts[data.subtype] = (counts[data.subtype] ?? 0) + 1
    if (!SUPPORTED_SUBTYPES.has(data.subtype) || data.hidden || data.noView) continue
    const converted = convert(page, data, importedAt)
    if (converted) annotations.push(converted)
  }
  return { annotations, counts }
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
  const base = (type: Annotation['type'], color = withColor(type)) => ({
    id: importedId(page, d.id),
    page,
    rect: rectFromPdf(d.rect),
    color,
    opacity: d.opacity ?? 1,
    ...(optional(author) ? { author } : {}),
    ...(optional(contents) ? { contents } : {}),
    ...(d.inReplyTo ? { inReplyTo: importedId(page, d.inReplyTo) } : {}),
    createdAt: created,
    modifiedAt: parsePdfDate(d.modificationDate, created),
    source: 'pdf' as const,
    locked: true,
  })
  const fillOf = (c: ArrayLike<number> | null | undefined) =>
    c && c.length >= 3 ? { fill: pdfColorToHex(c, '#FFFFFF') } : {}

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
    case 'Text':
      candidate = {
        ...base('note'),
        type: 'note',
        icon: ICONS[(d.name ?? 'comment').toLowerCase()] ?? 'comment',
      }
      break
    case 'FreeText': {
      const da = d.defaultAppearanceData
      candidate = {
        ...base(
          'freeText',
          pdfColorToHex(
            da?.fontColor as ArrayLike<number> | undefined,
            staticDefaults.color('freeText')
          )
        ),
        type: 'freeText',
        text: contents ?? '',
        ...(da && da.fontSize > 0 ? { fontSize: da.fontSize } : {}),
      }
      break
    }
    case 'Square':
    case 'Circle': {
      const type = d.subtype.toLowerCase() as 'square' | 'circle'
      candidate = { ...base(type), type, strokeWidth: stroke, ...fillOf(d.interiorColor) }
      break
    }
    case 'Line': {
      const l = d.lineCoordinates ?? [d.rect[0], d.rect[1], d.rect[2], d.rect[3]]
      const endings = d.lineEndings?.map((e) => ENDINGS[e.toLowerCase()] ?? 'none')
      candidate = {
        ...base('line'),
        type: 'line',
        start: { x: l[0], y: l[1] },
        end: { x: l[2], y: l[3] },
        strokeWidth: stroke,
        ...(endings && endings.length === 2 && endings.some((e) => e !== 'none')
          ? { endings }
          : {}),
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
        strokeWidth: stroke,
        ...fillOf(d.interiorColor),
      }
      break
    }
    case 'Ink': {
      const paths: Point[][] = (d.inkLists ?? [])
        .map((p) => pointsFromFlat(p))
        .filter((p) => p.length > 0)
      if (paths.length === 0) return undefined
      candidate = { ...base('ink'), type: 'ink', paths, strokeWidth: stroke }
      break
    }
    case 'Redact':
      // PDF.js 6.4 exposes neither QuadPoints nor /OverlayText for Redact, so only quads
      // that happen to be present are used, and `overlaidText` (the text beneath) is ignored.
      candidate = {
        ...base('redact'),
        type: 'redact',
        origin: 'user',
        fill: pdfColorToHex(d.interiorColor, staticDefaults.fill()),
        ...(quads.length > 0 ? { quads } : {}),
      }
      break
    default:
      return undefined
  }
  const parsed = AnnotationSchema.safeParse(candidate)
  return parsed.success ? parsed.data : undefined
}
