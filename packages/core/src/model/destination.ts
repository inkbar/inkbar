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
