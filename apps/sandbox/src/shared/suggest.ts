/*
 * "Suggest redactions" for the sandbox: a local pattern matcher standing in for a host's own
 * service. It reads each page's text, matches UK National Insurance numbers, email addresses
 * and UK phone numbers, and returns suggested redactions over just the matched characters.
 */
import type {
  Annotation,
  AnnotationInput,
  InkDocument,
  Point,
  Quad,
  Rect,
  TextItem,
} from '@inkbar/core'

export type SuggestSource = Pick<InkDocument, 'pages' | 'text'>

interface Pattern {
  re: RegExp
  reason: string
  confidence: number
}

const PATTERNS: Pattern[] = [
  {
    re: /\b[A-Z]{2}\d{6}[A-D]\b/g,
    reason: 'National Insurance number',
    confidence: 0.95,
  },
  { re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, reason: 'Email address', confidence: 0.85 },
  { re: /\b0\d{2,4} ?\d{3,4} ?\d{3,4}\b/g, reason: 'Phone number', confidence: 0.6 },
]

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/** Relative advance width of `text` as set in `item`. Only ratios within one run matter. */
export type MeasureText = (text: string, item: TextItem) => number

let context:
  CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined

/**
 * Widths from the browser's sans-serif metrics. The text API gives one box per run, not per
 * glyph, so this approximates the PDF's own font. It is far closer than equal widths for
 * proportional text. Without a canvas (in Node), every character counts as one.
 */
const measureWithCanvas: MeasureText = (text) => {
  if (context === undefined) {
    context =
      typeof OffscreenCanvas === 'undefined'
        ? null
        : new OffscreenCanvas(1, 1).getContext('2d')
    if (context) context.font = '100px Helvetica, Arial, sans-serif'
  }
  return context ? context.measureText(text).width : text.length
}

/**
 * The part of a text run's quad that covers characters `start` to `end`, splitting the run
 * in proportion to the measured width of the text before, within and after the match.
 * p3 to p4 is the run's baseline edge and p1 to p2 its top edge.
 */
function subQuad(item: TextItem, start: number, end: number, measure: MeasureText): Quad {
  const total = measure(item.str, item)
  const at = (i: number): number =>
    total > 0
      ? measure(item.str.slice(0, i), item) / total
      : i / Math.max(1, item.str.length)
  const a = at(start)
  const b = at(end)
  const { p1, p2, p3, p4 } = item.quad
  return {
    p1: lerp(p1, p2, a),
    p2: lerp(p1, p2, b),
    p3: lerp(p3, p4, a),
    p4: lerp(p3, p4, b),
  }
}

export function rectOfQuads(quads: readonly Quad[]): Rect {
  const xs = quads.flatMap((q) => [q.p1.x, q.p2.x, q.p3.x, q.p4.x])
  const ys = quads.flatMap((q) => [q.p1.y, q.p2.y, q.p3.y, q.p4.y])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** Page plus rectangle rounded to 0.01 pt, so a rerun recognises what it suggested before. */
function placeKey(page: number, r: Rect): string {
  return [page, ...[r.x, r.y, r.width, r.height].map((n) => n.toFixed(2))].join(',')
}

export function suggestionCount(n: number): string {
  return n === 1 ? '1 suggestion' : `${n} suggestions`
}

/**
 * Suggested redactions for `doc`, minus any that land exactly where a redaction in
 * `existing` already is. Waits `delayMs` first, like a network round trip.
 */
export async function suggestRedactions(
  doc: SuggestSource,
  existing: readonly Annotation[] = [],
  delayMs = 400,
  measure: MeasureText = measureWithCanvas
): Promise<AnnotationInput[]> {
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
  const seen = new Set(
    existing.flatMap((a) => (a.type === 'redact' ? [placeKey(a.page, a.rect)] : []))
  )
  const out: AnnotationInput[] = []
  for (const page of doc.pages) {
    const { items } = await doc.text(page.index)
    for (const item of items) {
      for (const { re, reason, confidence } of PATTERNS) {
        for (const match of item.str.matchAll(re)) {
          const quad = subQuad(item, match.index, match.index + match[0].length, measure)
          const key = placeKey(page.index, rectOfQuads([quad]))
          if (seen.has(key)) continue
          seen.add(key)
          out.push({
            type: 'redact',
            page: page.index,
            quads: [quad],
            origin: 'suggested',
            suggestion: {
              confidence,
              reason,
              explanation: `Matched ${match[0]}`,
              recommendation: 'redact',
            },
          })
        }
      }
    }
  }
  return out
}
