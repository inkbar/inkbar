/*
 * Back and forward through the jumps a reader makes: following a link, an outline item or a
 * form button records where the view was first, as desktop PDF readers do. Ordinary scrolling
 * and the page buttons record nothing. History lives as long as one document's engine.
 */
import { safeUrl } from '../model/form/url'
import { readonly, writable, type Readable } from '../model/readable'

import type { Viewport } from './viewport'
import type {
  Destination,
  LinkTarget,
  NamedAction,
  RawDestination,
} from '../model/destination'
import type { InkDocument } from '../model/document'
import type { ViewerAction } from '../model/form/types'

/** The positions kept on each side; past this, the oldest goes. */
const LIMIT = 50

/** Where a followed target comes from. */
export interface FollowOptions {
  /**
   * The page the target was pressed on: a link's own page. Next and previous page run from it,
   * as the link layer names them; without it they run from the current page, as an outline
   * item's do.
   */
  from?: number
}

export interface Navigation {
  /** Whether `back()` has somewhere to go. */
  readonly canGoBack: Readable<boolean>
  /** Whether `forward()` has somewhere to go. */
  readonly canGoForward: Readable<boolean>
  /** Returns to the position before the last jump, keeping the current one for `forward()`. */
  back(): void
  /** Undoes the last `back()`. */
  forward(): void
  /**
   * Records where the view is, then goes to `dest`. A page the document lacks does nothing, and
   * a jump that leaves the view where it was records nothing.
   */
  goTo(dest: Destination): void
  /**
   * Resolves and follows any target. URLs go to `report` as `open-url` (only http, https,
   * mailto and tel); unsupported targets and destinations that resolve to nothing do nothing.
   */
  follow(target: LinkTarget, opts?: FollowOptions): Promise<void>
  /** Forgets every position, as when another document opens. */
  clear(): void
}

export interface NavigationDeps {
  viewport: () => Viewport | undefined
  document: () => InkDocument | undefined
  /** Where the view is now, as a destination to come back to. */
  here: () => Destination | undefined
  /** Hands a URL to the host: Inkbar never opens one itself. */
  report: (a: ViewerAction) => void
}

/**
 * Looks `raw` up in `doc` through its cached resolver.
 * `undefined` for anything unreadable, or when the document is not ready.
 */
async function resolve(
  doc: InkDocument,
  raw: RawDestination
): Promise<Destination | undefined> {
  try {
    return await doc.resolveDestination(raw)
  } catch {
    return undefined
  }
}

/** The page a Named action goes to from `current`, within `count` pages. */
function namedPage(action: NamedAction, current: number, count: number): number {
  const to =
    action === 'NextPage'
      ? current + 1
      : action === 'PrevPage'
        ? current - 1
        : action === 'FirstPage'
          ? 0
          : count - 1
  return Math.min(Math.max(to, 0), count - 1)
}

/** Within a point: closer than that, two positions show the same view. */
const near = (a: number | undefined, b: number | undefined): boolean =>
  a === undefined || b === undefined ? a === b : Math.abs(a - b) <= 1

/** Whether `b` is where `a` was, give or take a point of rounding. */
function samePlace(a: Destination, b: Destination | undefined): boolean {
  if (!b || a.page !== b.page || a.fit !== b.fit) return false
  const p = a as { left?: number | undefined; top?: number | undefined }
  const q = b as typeof p
  return near(p.left, q.left) && near(p.top, q.top)
}

export function createNavigation(deps: NavigationDeps): Navigation {
  const backStack: Destination[] = []
  const forwardStack: Destination[] = []
  const canGoBack = writable(false)
  const canGoForward = writable(false)

  const sync = (): void => {
    canGoBack.set(backStack.length > 0)
    canGoForward.set(forwardStack.length > 0)
  }

  const push = (stack: Destination[], dest: Destination): void => {
    stack.push(dest)
    if (stack.length > LIMIT) stack.shift()
  }

  const inRange = (page: number): boolean => {
    const count = deps.document()?.pages.length ?? 0
    return Number.isInteger(page) && page >= 0 && page < count
  }

  /** Pops `from` and goes there, keeping the current position on `to`. Records no jump. */
  const step = (from: Destination[], to: Destination[]): void => {
    const vp = deps.viewport()
    const dest = from.at(-1)
    if (!vp || !dest) return
    from.pop()
    const here = deps.here()
    if (here) push(to, here)
    vp.scrollToDestination(dest)
    sync()
  }

  const goTo = (dest: Destination): void => {
    const vp = deps.viewport()
    if (!vp || !inRange(dest.page)) return
    const here = deps.here()
    vp.scrollToDestination(dest)
    // A jump that lands where the view already was (the same outline item twice) records
    // nothing, so one Back always moves.
    if (!here || samePlace(here, deps.here())) return
    push(backStack, here)
    forwardStack.length = 0
    sync()
  }

  return {
    canGoBack: readonly(canGoBack),
    canGoForward: readonly(canGoForward),
    back: () => step(backStack, forwardStack),
    forward: () => step(forwardStack, backStack),
    goTo,
    async follow(target, opts) {
      switch (target.kind) {
        case 'resolved':
          goTo(target.dest)
          return
        case 'dest': {
          const doc = deps.document()
          if (!doc) return
          const dest = await resolve(doc, target.raw)
          // Another document may have opened while the name was looked up.
          if (dest && deps.document() === doc) goTo(dest)
          return
        }
        case 'named': {
          const vp = deps.viewport()
          const count = deps.document()?.pages.length ?? 0
          if (!vp || count === 0) return
          const current = opts?.from ?? vp.currentPage.get()
          const page = namedPage(target.action, current, count)
          // Next on the last page (previous on the first) goes nowhere and records nothing.
          if (page !== current) goTo({ page, fit: 'fit' })
          return
        }
        case 'url': {
          const url = safeUrl(target.url)
          if (url) deps.report({ kind: 'open-url', url, newWindow: target.newWindow })
          return
        }
        case 'unsupported':
          return
      }
    },
    clear() {
      backStack.length = 0
      forwardStack.length = 0
      sync()
    },
  }
}
