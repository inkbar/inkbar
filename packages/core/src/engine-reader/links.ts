// A page's links and the document's outline from the facts the engine reports, as the PDF.js
// reader gives them: the same links in the same order with the same ids, and the same outline.
import { importedId } from '../model/annotations/embedded'
import { quadsFromFlat, rectFromPoints, type Rect } from '../model/geometry'
import { mapInOrder } from '../model/map-in-order'

import { annotationId } from './file-values'
import { targetFromFacts, type RefPages } from './targets'

import type { PageAnnotationEntryShape, PageLinksShape, OutlineEntryShape } from './types'
import type { Destination, LinkTarget, RawDestination } from '../model/destination'
import type { PageLink } from '../model/links'
import type { OutlineItem } from '../model/outline'

/** Destinations looked up at once. A long outline names many, each a call to the engine. */
const CONCURRENCY = 8

/** Annotation flags PDF.js reads: Invisible and NoView keep an annotation off the screen. */
const INVISIBLE = 1
const NO_VIEW = 32

/** The text markup kinds PDF.js shows only with well-formed /QuadPoints. */
const NEEDS_QUADS = new Set(['Highlight', 'Underline', 'Squiggly', 'StrikeOut'])

/**
 * The kinds PDF.js reads with a class of their own. It clears Invisible from such an
 * annotation's flags: the flag is for kinds a reader does not know.
 */
const KNOWN_KINDS = new Set([
  'Link',
  'Text',
  'Widget',
  'Popup',
  'FreeText',
  'Line',
  'Square',
  'Circle',
  'PolyLine',
  'Polygon',
  'Caret',
  'Ink',
  'Highlight',
  'Underline',
  'Squiggly',
  'StrikeOut',
  'Stamp',
  'FileAttachment',
  'RichMedia',
  'Screen',
  'Sound',
])

/**
 * @internal Whether PDF.js's `getAnnotations` lists the annotation: the `viewable` test. A widget
 * always is; any other is unless its flags have NoView, or Invisible for a kind PDF.js does not
 * know, or it is text markup without /QuadPoints or with ones not well formed. Flags that are not
 * a whole number above 0 count as 0. Hidden does not count here.
 */
export function listed(
  entry: Pick<PageAnnotationEntryShape, 'subtype' | 'flags' | 'hasQuads' | 'quadsOk'>
): boolean {
  if (entry.subtype === 'Widget') return true
  if (NEEDS_QUADS.has(entry.subtype) && !(entry.hasQuads && entry.quadsOk)) return false
  const flags = Number.isInteger(entry.flags) && entry.flags > 0 ? entry.flags : 0
  const hiding = KNOWN_KINDS.has(entry.subtype) ? NO_VIEW : INVISIBLE | NO_VIEW
  return (flags & hiding) === 0
}

/**
 * @internal The page's links as core's `PageLink`s. `order` is the link's place in the list PDF.js
 * gives of the page's annotations, which puts widgets and popups after the rest. `id` is the
 * one the page's annotations read gives the same annotation: the object number, `R` and, when it
 * is not 0, the generation, or for an annotation written as a direct object `p<page>i<index>`,
 * its place in `/Annots`. Page references in the links' destinations are noted in `pages`.
 */
export function linksFromFacts(
  page: number,
  facts: PageLinksShape,
  pages?: RefPages
): PageLink[] {
  const byIndex = new Map(facts.links.map((link) => [link.index, link]))
  const out: PageLink[] = []
  let order = 0
  for (const entry of facts.annotations) {
    if (!listed(entry) || entry.subtype === 'Widget' || entry.subtype === 'Popup')
      continue
    const at = order++
    if (entry.subtype !== 'Link') continue
    const link = byIndex.get(entry.index)
    if (!link) continue
    const rect = rectFromPoints(
      { x: link.rect.x, y: link.rect.y },
      { x: link.rect.x + link.rect.width, y: link.rect.y + link.rect.height }
    )
    const quads =
      entry.quadsOk && link.quads && link.quads.length > 0
        ? boxedQuads(link.quads, rect)
        : undefined
    out.push({
      id: importedId(page, annotationId(page, entry)),
      page,
      rect,
      ...(quads ? { quads: quadsFromFlat(quads) } : {}),
      order: at,
      target: targetFromFacts(link, pages),
    })
  }
  return out
}

/**
 * A Link's /QuadPoints as PDF.js keeps them: each quad replaced by its bounding box, top edge
 * first, in 32-bit floats. `undefined`, as in PDF.js, when they are not eights or any quad
 * reaches outside the rect.
 */
function boxedQuads(flat: readonly number[], rect: Rect): number[] | undefined {
  if (flat.length % 8 !== 0) return undefined
  const right = rect.x + rect.width
  const top = rect.y + rect.height
  const out: number[] = []
  for (let i = 0; i < flat.length; i += 8) {
    const xs = [flat[i]!, flat[i + 2]!, flat[i + 4]!, flat[i + 6]!]
    const ys = [flat[i + 1]!, flat[i + 3]!, flat[i + 5]!, flat[i + 7]!]
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    if (minX < rect.x || maxX > right || minY < rect.y || maxY > top) return undefined
    out.push(minX, maxY, maxX, maxY, minX, minY, maxX, minY)
  }
  return out.map(Math.fround)
}

/**
 * @internal The outline as `OutlineItem`s, each destination resolved through `resolve`, as core
 * built it with PDF.js: ids by position (`0`, `0.1`), titles on one line, `open` for a
 * positive count, and a destination that resolves to nothing `unsupported`. Page references in
 * the destinations are noted in `pages` before any is resolved.
 */
export async function outlineFromFacts(
  entries: readonly OutlineEntryShape[],
  resolve: (raw: RawDestination) => Promise<Destination | undefined>,
  pages?: RefPages
): Promise<OutlineItem[]> {
  // Targets in document order; their destinations resolved together and handed out in order.
  const targets: LinkTarget[] = []
  const collect = (nodes: readonly OutlineEntryShape[]): void => {
    for (const node of nodes) {
      targets.push(targetFromFacts(node, pages))
      collect(node.children)
    }
  }
  collect(entries)
  const raws = targets.flatMap((t) => (t.kind === 'dest' ? [t.raw] : []))
  const dests = await mapInOrder(raws.length, CONCURRENCY, (i) => resolve(raws[i]!))

  let nextTarget = 0
  let nextDest = 0
  const build = (nodes: readonly OutlineEntryShape[], path: string): OutlineItem[] =>
    nodes.map((node, i) => {
      const id = path === '' ? String(i) : `${path}.${i}`
      let target = targets[nextTarget++]!
      if (target.kind === 'dest') {
        const dest = dests[nextDest++]
        target = dest
          ? { kind: 'resolved', dest }
          : { kind: 'unsupported', reason: 'unknown' }
      }
      return {
        id,
        // Titles may carry line breaks and tabs; the panel shows one line.
        title: node.title.replace(/\s+/g, ' ').trim(),
        target,
        bold: node.bold,
        italic: node.italic,
        open: node.count > 0,
        children: build(node.children, id),
      }
    })
  return build(entries, '')
}
