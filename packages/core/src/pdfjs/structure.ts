import type { PdfjsPage } from './types'

/** The prefix PDF.js gives an annotation's id in its structure tree. */
const ANNOTATION_PREFIX = 'pdfjs_internal_id_'

interface StructNode {
  type?: unknown
  id?: unknown
  children?: unknown
}

/**
 * The page's annotations in structure order, by PDF.js annotation id (`12R`): the order of the
 * OBJR references in the page's part of the structure tree, depth first. Empty when the file has
 * no structure tree or PDF.js cannot read it.
 */
export async function structureAnnotationOrder(page: PdfjsPage): Promise<string[]> {
  let root: unknown
  try {
    root = await page.getStructTree()
  } catch {
    return []
  }
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (node: unknown, depth: number) => {
    if (depth > 64 || typeof node !== 'object' || node === null) return
    const n = node as StructNode
    if (n.type === 'annotation' && typeof n.id === 'string') {
      const id = n.id.startsWith(ANNOTATION_PREFIX)
        ? n.id.slice(ANNOTATION_PREFIX.length)
        : n.id
      if (!seen.has(id)) {
        seen.add(id)
        out.push(id)
      }
    }
    if (Array.isArray(n.children)) for (const kid of n.children) walk(kid, depth + 1)
  }
  walk(root, 0)
  return out
}
