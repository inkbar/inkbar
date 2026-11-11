import type { LinkTarget } from './destination'

/** One entry of a document's outline (its bookmarks), as `InkDocument.outline()` gives it. */
export interface OutlineItem {
  /** Its path of 0-based indexes from the top: `"0.2.1"` is the second level's third item's second child. */
  id: string
  title: string
  /**
   * Where it goes. A destination is resolved when the outline is read (`resolved`), so it never
   * holds a raw `dest`; one that names no page is `unsupported`.
   */
  target: LinkTarget
  bold: boolean
  italic: boolean
  /** Whether the file shows it expanded at first (a positive `/Count`). */
  open: boolean
  children: readonly OutlineItem[]
}
