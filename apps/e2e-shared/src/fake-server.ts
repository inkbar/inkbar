/*
 * Stands in for the host application's API: annotation storage keyed by document version, and
 * a redaction suggester. Storage lives in sessionStorage, so a page reload can read back what
 * the previous page saved. Every call waits `latency` ms, like a network round trip.
 */
import type {
  AnnotationDocument,
  AnnotationInput,
  InkDocument,
  Point,
  Quad,
  TextItem,
} from '@inkbar/core'

/** UK National Insurance number. */
const NI = /\b[A-Z]{2}\d{6}[A-D]\b/g
const STORAGE_PREFIX = 'inkbar-sandbox:annotations:'

export interface FakeServer {
  load(key: string): Promise<AnnotationDocument | null>
  save(key: string, doc: AnnotationDocument): Promise<void>
  suggest(doc: InkDocument): Promise<AnnotationInput[]>
}

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/**
 * The part of a text run's quad that covers characters `start` to `end`, assuming equal
 * character widths. p3 to p4 is the run's baseline edge and p1 to p2 its top edge.
 */
function subQuad(item: TextItem, start: number, end: number): Quad {
  const n = Math.max(1, item.str.length)
  const { p1, p2, p3, p4 } = item.quad
  return {
    p1: lerp(p1, p2, start / n),
    p2: lerp(p1, p2, end / n),
    p3: lerp(p3, p4, start / n),
    p4: lerp(p3, p4, end / n),
  }
}

export function storageKey(key: string): string {
  return STORAGE_PREFIX + key
}

export function createFakeServer(opts: { latency?: number } = {}): FakeServer {
  const latency = opts.latency ?? 150
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, latency))
  return {
    async load(key) {
      await wait()
      const raw = sessionStorage.getItem(storageKey(key))
      return raw === null ? null : (JSON.parse(raw) as AnnotationDocument)
    },
    async save(key, doc) {
      await wait()
      sessionStorage.setItem(storageKey(key), JSON.stringify(doc))
    },
    async suggest(doc) {
      await wait()
      const out: AnnotationInput[] = []
      for (const page of doc.pages) {
        const text = await doc.text(page.index)
        for (const item of text.items) {
          for (const match of item.str.matchAll(NI)) {
            const start = match.index
            out.push({
              type: 'redact',
              page: page.index,
              quads: [subQuad(item, start, start + match[0].length)],
              origin: 'suggested',
              suggestion: {
                confidence: 0.92,
                reason: 'National Insurance number',
                explanation: `Matched ${match[0]}`,
                recommendation: 'redact',
              },
            })
          }
        }
      }
      return out
    },
  }
}
