import { destinationFromArray } from '../model/destination'

import type { PdfjsDocument } from './types'
import type { Destination, RawDestination } from '../model/destination'

/**
 * The destination `raw` names, through PDF.js, which looks a name up in the catalog's
 * `/Names /Dests` tree and its older `/Dests` dictionary. `undefined` when the name is unknown,
 * the array is malformed, or it names no page of the document.
 */
export async function resolveDestination(
  proxy: PdfjsDocument,
  raw: RawDestination
): Promise<Destination | undefined> {
  try {
    const array: readonly unknown[] | null | undefined =
      typeof raw === 'string' ? await proxy.getDestination(raw) : raw
    if (!array) return undefined
    const target = array[0]
    const page =
      typeof target === 'number'
        ? target
        : typeof target === 'object' && target !== null && 'num' in target
          ? await proxy.getPageIndex(target as { num: number; gen: number })
          : undefined
    if (page === undefined) return undefined
    return destinationFromArray([page, ...array.slice(1)], proxy.numPages)
  } catch {
    // An unreadable name tree, or a reference that is not a page.
    return undefined
  }
}

/**
 * The page index a named destination points at. `undefined` when the name is unknown or its
 * destination names no page of the document.
 */
export async function destinationPage(
  proxy: PdfjsDocument,
  name: string
): Promise<number | undefined> {
  return (await resolveDestination(proxy, name))?.page
}
