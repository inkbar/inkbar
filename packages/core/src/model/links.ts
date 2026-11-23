import type { LinkTarget } from './destination'
import type { Quad, Rect } from './geometry'

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
