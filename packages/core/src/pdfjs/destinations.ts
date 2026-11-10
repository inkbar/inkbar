import type { PdfjsDocument } from './types'
import type { Destination, RawDestination } from '../model/destination'

/** A coordinate from a destination array: a finite number, or `undefined` for `null` or junk. */
function coord(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

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
    if (
      page === undefined ||
      !Number.isInteger(page) ||
      page < 0 ||
      page >= proxy.numPages
    ) {
      return undefined
    }
    const name = (array[1] as { name?: unknown } | null | undefined)?.name
    if (typeof name !== 'string') return undefined
    switch (name.toLowerCase()) {
      case 'xyz':
        return {
          page,
          fit: 'xyz',
          left: coord(array[2]),
          top: coord(array[3]),
          zoom: coord(array[4]),
        }
      case 'fit':
        return { page, fit: 'fit' }
      case 'fitb':
        return { page, fit: 'fitb' }
      case 'fith':
        return { page, fit: 'fith', top: coord(array[2]) }
      case 'fitbh':
        return { page, fit: 'fitbh', top: coord(array[2]) }
      case 'fitv':
        return { page, fit: 'fitv', left: coord(array[2]) }
      case 'fitbv':
        return { page, fit: 'fitbv', left: coord(array[2]) }
      case 'fitr': {
        const [left, bottom, right, top] = [2, 3, 4, 5].map((i) => coord(array[i]))
        if (
          left === undefined ||
          bottom === undefined ||
          right === undefined ||
          top === undefined
        ) {
          return undefined
        }
        return {
          page,
          fit: 'fitr',
          rect: { x: left, y: bottom, width: right - left, height: top - bottom },
        }
      }
      default:
        return undefined
    }
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
