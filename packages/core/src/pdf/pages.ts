import { dictGet, isDict, isName, isRef, type PdfDict, type PdfValue } from './lexer'

import type { PdfObjects } from './objects'
import type { TabsOrder } from '../model/form/types'

/** Deep enough for any real page tree; it also stops a /Kids cycle. */
const MAX_DEPTH = 32

const TABS = new Set(['R', 'C', 'S', 'W', 'A'])

const refKey = (num: number, gen: number) => (gen === 0 ? `${num}R` : `${num}R${gen}`)

async function dictOf(objs: PdfObjects, v: PdfValue | undefined) {
  const d = await objs.resolve(v)
  return isDict(d) ? d : undefined
}

async function arrayOf(objs: PdfObjects, v: PdfValue | undefined) {
  const a = await objs.resolve(v)
  return Array.isArray(a) ? a : []
}

/** Page refs in page order, each page's `/Tabs`, and the page dictionaries in page order. */
export async function walkPages(objs: PdfObjects, root: PdfDict) {
  const pages = new Map<string, number>()
  const tabs = new Map<number, TabsOrder>()
  const dicts: PdfDict[] = []
  const seen = new Set<string>()
  const visit = async (v: PdfValue | undefined, depth: number) => {
    if (depth > MAX_DEPTH) return
    if (isRef(v)) {
      const key = refKey(v.num, v.gen)
      if (seen.has(key)) return
      seen.add(key)
    }
    const node = await dictOf(objs, v)
    if (!node) return
    const kids = dictGet(node, 'Kids')
    if (kids !== undefined && !isName(dictGet(node, 'Type'), 'Page')) {
      for (const kid of await arrayOf(objs, kids)) await visit(kid, depth + 1)
      return
    }
    const index = dicts.length
    dicts.push(node)
    pages.set(isRef(v) ? refKey(v.num, v.gen) : `#${index}`, index)
    const t = await objs.resolve(dictGet(node, 'Tabs'))
    if (isName(t) && TABS.has(t.name)) tabs.set(index, t.name as TabsOrder)
  }
  await visit(dictGet(root, 'Pages'), 0)
  return { pages, tabs, dicts }
}
