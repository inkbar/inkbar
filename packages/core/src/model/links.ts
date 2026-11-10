import { importedId } from './annotations/embedded'
import { isNamedAction, type LinkTarget } from './destination'
import { safeUrl } from './form/url'
import { quadsFromFlat, rectFromPoints, type Quad, type Rect } from './geometry'

import type { PdfjsAnnotationData } from '../pdfjs/types'

/** A clickable region of a page: where it is and where it goes. */
export interface PageLink {
  /** Stable across opens of the same file, as imported annotation ids are. */
  id: string
  /** 0-based. */
  page: number
  /** User space, before /Rotate. */
  rect: Rect
  /** One quad per line when the link wraps; the rect is their bounds. */
  quads?: Quad[]
  /** Position in the page's `/Annots`, which Tab follows unless the page's `/Tabs` says otherwise. */
  order?: number
  target: LinkTarget
}

/** A URL with a scheme of its own, as opposed to a file name or relative path. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * Why PDF.js's `unsafeUrl` was not passed on. PDF.js reads a GoToR's file and destination into
 * `file#dest`, and a Launch's file as a bare name, so those two are told apart by the `#`; a
 * scheme `safeUrl` refuses (`javascript:`, `file:`, `data:`) is unsafe whatever follows it.
 */
function unsafeReason(unsafeUrl: string): 'remote' | 'launch' | 'unsafe-url' {
  if (HAS_SCHEME.test(unsafeUrl)) return 'unsafe-url'
  return unsafeUrl.includes('#') ? 'remote' : 'launch'
}

/** The fields PDF.js gives a link, and an outline item, for where it goes. */
export type PdfjsTargetFields = Pick<
  PdfjsAnnotationData,
  'dest' | 'action' | 'url' | 'unsafeUrl' | 'newWindow'
>

/**
 * Where a link or outline item goes, from what PDF.js read of its `/Dest` or `/A`. A
 * destination stays raw (`dest`); a URL is passed only through `safeUrl`.
 */
export function targetOf(data: PdfjsTargetFields): LinkTarget {
  if (data.dest !== undefined && data.dest !== null)
    return { kind: 'dest', raw: data.dest }
  if (isNamedAction(data.action)) return { kind: 'named', action: data.action }
  if (data.url) {
    const url = safeUrl(data.url)
    if (url) return { kind: 'url', url, newWindow: !!data.newWindow }
  }
  if (data.unsafeUrl) {
    // PDF.js may repeat a safe `url` here; only what `safeUrl` refuses is unsafe.
    return safeUrl(data.unsafeUrl)
      ? { kind: 'unsupported', reason: 'unknown' }
      : { kind: 'unsupported', reason: unsafeReason(data.unsafeUrl) }
  }
  return { kind: 'unsupported', reason: 'unknown' }
}

/**
 * A link annotation read from PDF.js, or `undefined` for anything that is not a visible link.
 * Links are never Gloss annotations: they are read-only structure of the file. `order` is its
 * position in the page's `/Annots`.
 */
export function linkFromPdfjs(
  page: number,
  data: PdfjsAnnotationData,
  order?: number
): PageLink | undefined {
  if (data.subtype !== 'Link' || data.hidden || data.noView) return undefined
  const quads = data.quadPoints ? quadsFromFlat(data.quadPoints) : []
  return {
    id: importedId(page, data.id),
    page,
    rect: rectFromPoints(
      { x: data.rect[0], y: data.rect[1] },
      { x: data.rect[2], y: data.rect[3] }
    ),
    ...(quads.length > 0 ? { quads } : {}),
    ...(order === undefined ? {} : { order }),
    target: targetOf(data),
  }
}
