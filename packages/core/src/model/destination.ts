import type { Rect } from './geometry'

/**
 * Where a link or outline item goes: a page and how to frame it, as the PDF destination types
 * describe it. Every coordinate is PDF user space in points, origin bottom-left, before /Rotate.
 * `page` is 0-based. A missing coordinate (`null` in the file) is left as it is on screen.
 */
export type Destination =
  | {
      page: number
      fit: 'xyz'
      left?: number | undefined
      top?: number | undefined
      zoom?: number | undefined
    }
  | { page: number; fit: 'fit' | 'fitb' }
  | { page: number; fit: 'fith' | 'fitbh'; top?: number | undefined }
  | { page: number; fit: 'fitv' | 'fitbv'; left?: number | undefined }
  | { page: number; fit: 'fitr'; rect: Rect }

/** A destination as a PDF holds it: a name to look up, or an explicit `[page, /Fit, ...]` array. */
export type RawDestination = string | readonly unknown[]

/** The page-navigation actions a Named link can ask for. */
export type NamedAction = 'NextPage' | 'PrevPage' | 'FirstPage' | 'LastPage'

const NAMED_ACTIONS: readonly string[] = ['NextPage', 'PrevPage', 'FirstPage', 'LastPage']

/** Whether `s` is one of the four page-navigation actions Inkbar follows. */
export function isNamedAction(s: unknown): s is NamedAction {
  return typeof s === 'string' && NAMED_ACTIONS.includes(s)
}

/**
 * What a link or outline item points at, before it is followed: a destination still to resolve
 * (`dest`) or already resolved, a URL for the host to open, a page-navigation action, or a target
 * Inkbar does not follow (another file, an app to launch, a URL with an unsafe scheme).
 */
export type LinkTarget =
  | { kind: 'dest'; raw: RawDestination }
  | { kind: 'resolved'; dest: Destination }
  | { kind: 'url'; url: string; newWindow: boolean }
  | { kind: 'named'; action: NamedAction }
  | { kind: 'unsupported'; reason: 'remote' | 'launch' | 'unsafe-url' | 'unknown' }

/** A coordinate from a destination array: a finite number, or `undefined` for `null` or junk. */
function coord(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * A destination from an explicit array whose first entry is already a 0-based page index:
 * `[page, { name: 'XYZ' }, left, top, zoom]`. `undefined` when the page is not in the document
 * or a FitR lacks a corner. An unknown or missing fit is `fit`.
 */
export function destinationFromArray(
  array: readonly unknown[],
  pageCount: number
): Destination | undefined {
  const page = array[0]
  if (
    typeof page !== 'number' ||
    !Number.isInteger(page) ||
    page < 0 ||
    page >= pageCount
  )
    return undefined
  const name = (array[1] as { name?: unknown } | null | undefined)?.name
  // Lenient files omit or misspell the fit; the page alone is still a usable target.
  switch (typeof name === 'string' ? name.toLowerCase() : '') {
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
      // Some writers give the corners in the other order.
      return {
        page,
        fit: 'fitr',
        rect: {
          x: Math.min(left, right),
          y: Math.min(bottom, top),
          width: Math.abs(right - left),
          height: Math.abs(top - bottom),
        },
      }
    }
    default:
      return { page, fit: 'fit' }
  }
}
