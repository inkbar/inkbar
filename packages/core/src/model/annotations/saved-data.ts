// The data Inkbar stores with each annotation it writes into a PDF, under the annotation's
// private `/INKB_Gloss` entry, so that opening the file again brings the annotation back as it
// was rather than as a locked file annotation. The annotation is stored as a Gloss file item,
// the same form `exportAnnotations` writes, and read back the way `importAnnotations` reads one.
import { parsePdfDate } from '../pdf-date'

import { fromGloss, toGloss } from './json'

import type { Annotation } from './types'
import type { Rect } from '../geometry'
import type { Annotation as GlossAnnotation } from 'gloss-format'

/** What Inkbar stores with an annotation it writes, as JSON. */
export interface SavedData {
  v: 1
  /** The annotation as a Gloss file writes it (`toFile` of its export). */
  annotation: GlossAnnotation
  /** The /Rect written: left, bottom, right, top. */
  rect: [number, number, number, number]
  /** Full name of the signature field this annotation signs. */
  signs?: string
}

/** How far a /Rect number may be from the stored one and still match, in points. */
const RECT_TOLERANCE = 0.01

/** How far an annotation's own rect may reach outside the /Rect written for it, in points. */
const RECT_MARGIN = 1

/** The prefix of the ids Inkbar gives the file's own annotations: `pdf:<page>:<object>`. */
const FILE_ID_PREFIX = 'pdf:'

/**
 * The data to store with `a`, written with an appearance whose bounds are `bounds` (the /Rect
 * the engine writes). A reply is written without an appearance and gets its own `rect` as its
 * /Rect, so its data records that and `bounds` is not used. `signs` is the full name of the
 * signature field `a` signs, if any.
 */
export function savedDataFor(a: Annotation, bounds: Rect, signs?: string): string {
  const box = a.inReplyTo === undefined ? bounds : a.rect
  const data: SavedData = {
    v: 1,
    annotation: toGloss(a),
    rect: [box.x, box.y, box.x + box.width, box.y + box.height],
    ...(signs === undefined ? {} : { signs }),
  }
  return JSON.stringify(data)
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

type Corners = readonly [number, number, number, number]

/** A rect as left, bottom, right, top. */
const corners = (r: Rect): Corners => [r.x, r.y, r.x + r.width, r.y + r.height]

/** Whether `inner` lies within `outer` grown by `RECT_MARGIN`. Both are left, bottom, right, top. */
const within = (inner: Corners, outer: Corners): boolean =>
  inner[0] >= outer[0] - RECT_MARGIN &&
  inner[1] >= outer[1] - RECT_MARGIN &&
  inner[2] <= outer[2] + RECT_MARGIN &&
  inner[3] <= outer[3] + RECT_MARGIN

/**
 * Whether the stored annotation is where the file has it: `written` is the /Rect, the box of
 * its drawing.
 *
 * - A mask is drawn as the whole page dimmed around its rect, so the written rect is the page
 *   and says nothing of where the mask is: not checked.
 * - A reply has no drawing and is written with its own rect, which the stored rect already
 *   matches: not checked.
 * - An ink stroke drawn with pressure tapers, so its drawing can be smaller than the box of its
 *   points, which is its rect: for ink either rect may lie within the other grown by 1 point.
 * - Anything else is drawn over its whole rect, and a stroke or a line ending may reach past
 *   it: its own rect must lie within the written rect grown by 1 point.
 */
function placed(a: Annotation, written: Corners): boolean {
  if (a.type === 'mask' || a.inReplyTo !== undefined) return true
  const own = corners(a.rect)
  return within(own, written) || (a.type === 'ink' && within(written, own))
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Whether the file's /M, a PDF date, is the instant of `modifiedAt` to the second. The engine
 * writes /M from `modifiedAt` without its fraction of a second.
 */
function sameSecond(modifiedAt: string, fileDate: string | undefined): boolean {
  if (fileDate === undefined) return false
  const file = Date.parse(parsePdfDate(fileDate, ''))
  const stored = Date.parse(modifiedAt)
  return (
    Number.isFinite(file) &&
    Number.isFinite(stored) &&
    Math.floor(stored / 1000) * 1000 === file
  )
}

/**
 * The annotation to lift, or undefined when the JSON is invalid or another program changed it.
 *
 * `file` is what the file holds for the annotation now: its /Rect as left, bottom, right, top;
 * its /M as written (a PDF date string), undefined when it has none; and the page it is on. The
 * annotation is lifted only when the JSON parses, `v` is 1, the annotation passes the schema,
 * every number of the stored `rect` is within 0.01 of the file's, and /M is the annotation's
 * `modifiedAt` to the second. A file annotation without /M is not lifted: the engine always
 * writes one, so another program has removed it.
 *
 * The stored annotation must also agree with where the file has it: its own `rect` lies within
 * the written rect grown by 1 point, since what is written is the box of its drawing. Masks and
 * replies are not held to that, and for ink the written rect may lie within its own instead:
 * `placed` says why.
 * And its id must not start with `pdf:`, the ids of the file's own annotations, which a session
 * annotation never has.
 *
 * A lifted annotation is a session annotation, unlocked, with its stored id, on the file's page.
 */
export function liftable(
  json: string,
  file: {
    rect: [number, number, number, number]
    modified: string | undefined
    page: number
  }
): { annotation: Annotation; signs?: string } | undefined {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return undefined
  }
  if (!isRecord(data) || data.v !== 1) return undefined
  const { rect, signs } = data
  if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(finite)) return undefined
  if (rect.some((n, i) => Math.abs(n - file.rect[i]!) > RECT_TOLERANCE)) return undefined
  if (signs !== undefined && typeof signs !== 'string') return undefined
  const parsed = fromGloss(data.annotation)
  if (!parsed.success) return undefined
  if (!sameSecond(parsed.annotation.modifiedAt, file.modified)) return undefined
  if (parsed.annotation.id.startsWith(FILE_ID_PREFIX)) return undefined
  if (!placed(parsed.annotation, rect as unknown as Corners)) return undefined
  const annotation: Annotation = { ...parsed.annotation, page: file.page }
  return signs === undefined ? { annotation } : { annotation, signs }
}
