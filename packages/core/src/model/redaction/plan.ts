import { isThreadRoot, threadOf } from '../annotations/threads'
import { quadsFromRect, rectFromQuad, rectsIntersect } from '../geometry'

import type { Annotation, RedactAnnotation } from '../annotations/types'
import type { Quad, Rect } from '../geometry'

/** What a redaction does to the session's annotations. */
export interface RedactionPlan {
  /** Session redact annotations, in list order. */
  marks: readonly Annotation[]
  /** Per mark: its page and quads (from `quads`, else its `rect`). */
  regions: readonly { page: number; quads: readonly Quad[] }[]
  /** Session annotations removed with the content, replies after their notes. */
  removed: readonly Annotation[]
  /** Session annotations that are written after the apply. */
  kept: readonly Annotation[]
  /** Pages with at least one mark. */
  pages: number
}

export interface RedactionOptions {
  /**
   * The widget of each signed signature field, by the id of the annotation that signs it (the
   * `signature` a signed field's value names): its page and rectangle in user space. A signature
   * is removed when a mark overlaps its field, whatever size the signature is drawn.
   */
  fieldRects?: ReadonlyMap<string, { page: number; rect: Rect }>
}

const boundsOf = (points: readonly { x: number; y: number }[]): Rect => {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** The box an annotation covers by its own geometry: its quads, vertices or strokes, else its `rect`. */
function geometryOf(a: Annotation): Rect {
  if ('quads' in a && a.quads && a.quads.length > 0)
    return boundsOf(a.quads.flatMap((q) => [q.p1, q.p2, q.p3, q.p4]))
  if ('vertices' in a && a.vertices.length > 0) return boundsOf(a.vertices)
  if ('inklist' in a && a.inklist.length > 0) return boundsOf(a.inklist.flat())
  return a.rect
}

/**
 * Whether a box on a page overlaps one of `regions` on an open interval, so a box that only
 * touches an edge does not.
 */
function hitsRegions(
  regions: RedactionPlan['regions']
): (page: number, rect: Rect) => boolean {
  const boxes = regions.map((r) => ({ page: r.page, rects: r.quads.map(rectFromQuad) }))
  return (page, rect) =>
    boxes.some((b) => b.page === page && b.rects.some((r) => rectsIntersect(r, rect)))
}

/**
 * Whether a mark of `plan` overlaps `a` by its own geometry, by the rule `planRedaction` removes
 * session annotations by: for the file's own annotations, which the engine removes itself.
 */
export function overlapsMark(plan: RedactionPlan, a: Annotation): boolean {
  return hitsRegions(plan.regions)(a.page, geometryOf(a))
}

/**
 * Decides what applying redactions does: which session annotations are the marks and what they
 * cover, which other session annotations go with the content under them, and which are written
 * after. Annotations that came from the file and are locked are in neither list.
 *
 * A session annotation is removed when its own geometry overlaps a mark's quad on its page, on
 * an open interval, so one that only touches an edge stays. A loupe is tested by its `rect`, its
 * lens. A mask is never removed. A reply goes with its note and never on its own. A signature
 * goes when a mark overlaps its field's widget.
 */
export function planRedaction(
  annotations: readonly Annotation[],
  options: RedactionOptions = {}
): RedactionPlan {
  const session = annotations.filter((a) => a.source === 'session')
  const marks = session.filter((a): a is RedactAnnotation => a.type === 'redact')
  const regions = marks.map((m) => ({
    page: m.page,
    quads: m.quads && m.quads.length > 0 ? m.quads : quadsFromRect(m.rect),
  }))
  const hit = hitsRegions(regions)

  const goes = (a: Annotation): boolean => {
    if (a.type === 'redact' || a.type === 'mask') return false
    if (hit(a.page, geometryOf(a))) return true
    const field = options.fieldRects?.get(a.id)
    return field !== undefined && hit(field.page, field.rect)
  }

  const byId = new Map(annotations.map((a) => [a.id, a]))
  const removed: Annotation[] = []
  const gone = new Set<string>()
  const take = (a: Annotation): void => {
    if (gone.has(a.id)) return
    gone.add(a.id)
    removed.push(a)
  }
  // A reply goes when its parent goes: a session parent by the same rules, a file annotation
  // when a mark overlaps its geometry, and never on the reply's own geometry. A parent that is
  // nowhere in the list leaves the reply alone.
  const replyGoes = (a: Annotation, seen: ReadonlySet<string>): boolean => {
    const parent = a.inReplyTo === undefined ? undefined : byId.get(a.inReplyTo)
    if (!parent || seen.has(parent.id)) return false
    if (parent.source !== 'session') return hit(parent.page, geometryOf(parent))
    if (parent.inReplyTo !== undefined) return replyGoes(parent, new Set(seen).add(a.id))
    return goes(parent)
  }
  for (const a of session) {
    if (a.inReplyTo !== undefined || !goes(a)) continue
    if (isThreadRoot(a)) for (const t of threadOf(session, a)) take(t)
    else take(a)
  }
  for (const a of session)
    if (a.inReplyTo !== undefined && replyGoes(a, new Set([a.id]))) take(a)

  return {
    marks,
    regions,
    removed,
    kept: session.filter((a) => a.type !== 'redact' && !gone.has(a.id)),
    pages: new Set(regions.map((r) => r.page)).size,
  }
}
