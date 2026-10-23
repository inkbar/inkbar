import type { PdfjsDocument } from './types'

/**
 * The page index a named destination points at, through PDF.js, which looks the name up in the
 * catalog's `/Names /Dests` tree and its older `/Dests` dictionary. `undefined` when the name
 * is unknown or its destination names no page of the document.
 */
export async function destinationPage(
  proxy: PdfjsDocument,
  name: string
): Promise<number | undefined> {
  try {
    const target: unknown = (await proxy.getDestination(name))?.[0]
    const page =
      typeof target === 'number'
        ? target
        : typeof target === 'object' && target !== null && 'num' in target
          ? await proxy.getPageIndex(target as { num: number; gen: number })
          : undefined
    return page !== undefined &&
      Number.isInteger(page) &&
      page >= 0 &&
      page < proxy.numPages
      ? page
      : undefined
  } catch {
    // An unreadable name tree, or a reference that is not a page.
    return undefined
  }
}
