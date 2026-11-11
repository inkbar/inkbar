import { targetOf, type PdfjsTargetFields } from '../model/links'
import { mapInOrder } from '../model/map-in-order'

import { resolveDestination } from './destinations'

import type { PdfjsDocument } from './types'
import type { Destination, RawDestination } from '../model/destination'
import type { OutlineItem } from '../model/outline'

/** Destinations looked up at once. A long outline names many, each a request to the worker. */
const CONCURRENCY = 8

/** One node of `getOutline()`, limited to the fields Inkbar reads. */
interface PdfjsOutlineNode extends PdfjsTargetFields {
  title: string
  bold?: boolean
  italic?: boolean
  /** `/Count`: positive when the item starts expanded. */
  count?: number | undefined
  items: PdfjsOutlineNode[]
}

/**
 * The document's outline, every destination resolved in full: the current item needs each
 * one's position. `[]` when the file has none or PDF.js cannot read it.
 */
export async function readOutline(proxy: PdfjsDocument): Promise<OutlineItem[]> {
  const roots = (await proxy.getOutline().catch(() => null)) as PdfjsOutlineNode[] | null
  if (!roots || roots.length === 0) return []

  // Destinations in document order, resolved together, then handed out in the same order.
  const raws: RawDestination[] = []
  const collect = (nodes: readonly PdfjsOutlineNode[]): void => {
    for (const node of nodes) {
      const target = targetOf(node)
      if (target.kind === 'dest') raws.push(target.raw)
      collect(node.items ?? [])
    }
  }
  collect(roots)
  const dests: (Destination | undefined)[] = await mapInOrder(
    raws.length,
    CONCURRENCY,
    (i) => resolveDestination(proxy, raws[i]!)
  )

  let next = 0
  const build = (nodes: readonly PdfjsOutlineNode[], path: string): OutlineItem[] =>
    nodes.map((node, i) => {
      const id = path === '' ? String(i) : `${path}.${i}`
      let target = targetOf(node)
      if (target.kind === 'dest') {
        const dest = dests[next++]
        target = dest
          ? { kind: 'resolved', dest }
          : { kind: 'unsupported', reason: 'unknown' }
      }
      return {
        id,
        // Titles may carry line breaks and tabs; the panel shows one line.
        title: String(node.title ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
        target,
        bold: !!node.bold,
        italic: !!node.italic,
        open: (node.count ?? 0) > 0,
        children: build(node.items ?? [], id),
      }
    })
  return build(roots, '')
}
