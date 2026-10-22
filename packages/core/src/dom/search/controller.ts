/*
 * The viewer's search state, shared by the find bar, the bindings and plugins. It owns the
 * query, the scan and the hits; the bar is only a view of it. Scans go through `doc.search`, so
 * the bar and a plugin running the same query see the same hits.
 */
import { readonly, writable, type Readable } from '../../model/readable'

import type { InkDocument } from '../../model/document'
import type { SearchHit } from '../../model/search'
import type { Viewport } from '../viewport'

export interface SearchState {
  open: boolean
  query: string
  matchCase: boolean
  /** Found so far, in `(page, start)` order. */
  hits: readonly SearchHit[]
  /** Index into `hits`, -1 when none. */
  current: number
  scanning: boolean
}

export interface ViewerSearch {
  readonly state: Readable<SearchState>
  /** Shows the bar, optionally with a query. */
  open(query?: string): void
  setQuery(query: string): void
  setMatchCase(on: boolean): void
  next(): void
  previous(): void
  /** Hides the bar and clears the hits; the query and match case are kept. */
  close(): void
}

export interface SearchController extends ViewerSearch {
  /** @internal Registers a mounted find bar; returns the function that unregisters it. */
  attachBar(): () => void
  /** Whether any find bar is mounted for this viewer. */
  readonly barAttached: Readable<boolean>
  destroy(): void
}

export interface SearchControllerOptions {
  document: Readable<InkDocument | null>
  /** The viewer's viewport, read on each call. */
  viewport: () => Viewport | null | undefined
  /** Default 150. */
  debounceMs?: number
}

function compare(a: SearchHit, b: SearchHit): number {
  return a.page - b.page || a.start - b.start
}

/** Where `hit` goes in `hits`, which is sorted by `(page, start)`. */
function insertionIndex(hits: readonly SearchHit[], hit: SearchHit): number {
  let low = 0
  let high = hits.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (compare(hits[mid] as SearchHit, hit) <= 0) low = mid + 1
    else high = mid
  }
  return low
}

export function createSearchController(opts: SearchControllerOptions): SearchController {
  const debounceMs = opts.debounceMs ?? 150
  const state = writable<SearchState>({
    open: false,
    query: '',
    matchCase: false,
    hits: [],
    current: -1,
    scanning: false,
  })
  const bars = writable(0)
  const patch = (changes: Partial<SearchState>): void =>
    state.update((s) => ({ ...s, ...changes }))

  let timer: ReturnType<typeof setTimeout> | undefined
  let scan: AbortController | undefined
  /** The current hit and its index in `hits`, kept in step as pages of hits arrive. */
  let currentHit: SearchHit | undefined
  let currentIndex = -1
  /** Hits of one page not yet in the state, in page order, and the task that adds them. */
  let pending: SearchHit[] = []
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let destroyed = false

  function scrollTo(hit: SearchHit): void {
    // The viewport leaves a fully visible rect where it is and centres one that is not.
    opts.viewport()?.scrollToRect(hit.page, hit.rect)
  }

  /** Stops the pending debounce and the running scan, and empties the hits. */
  function reset(): void {
    clearTimeout(timer)
    timer = undefined
    scan?.abort()
    scan = undefined
    currentHit = undefined
    currentIndex = -1
    pending = []
    clearTimeout(flushTimer)
    flushTimer = undefined
    patch({ hits: [], current: -1, scanning: false })
  }

  /**
   * Adds the pending page of hits to the state in one change. A page's hits sit together in
   * `(page, start)` order, so they go in with one splice, and `current` moves by their count
   * when they land before it.
   */
  function flush(): void {
    clearTimeout(flushTimer)
    flushTimer = undefined
    if (pending.length === 0) return
    const batch = pending
    pending = []
    const first = batch[0] as SearchHit
    const { hits } = state.get()
    const at = insertionIndex(hits, first)
    const next = hits.slice(0, at).concat(batch, hits.slice(at))
    if (!currentHit) {
      currentHit = first
      currentIndex = at
      scrollTo(first)
    } else if (at <= currentIndex) currentIndex += batch.length
    patch({ hits: next, current: currentIndex })
  }

  /**
   * Holds `hit` until its page is done: the next page's first hit, the end of the scan, or the
   * next task, since a page's hits arrive together and the scan yields between pages.
   */
  function accept(hit: SearchHit): void {
    if (pending.length > 0 && pending[0]!.page !== hit.page) flush()
    pending.push(hit)
    flushTimer ??= setTimeout(flush)
  }

  async function run(doc: InkDocument, controller: AbortController): Promise<void> {
    const { query, matchCase } = state.get()
    const count = doc.pages.length
    const from = Math.min(
      Math.max(opts.viewport()?.currentPage.get() ?? 0, 0),
      Math.max(count - 1, 0)
    )
    const pages = [
      ...Array.from({ length: count - from }, (_, i) => from + i),
      ...Array.from({ length: from }, (_, i) => i),
    ]
    try {
      for await (const hit of doc.search(query, {
        matchCase,
        pages,
        signal: controller.signal,
      })) {
        if (controller.signal.aborted) return
        accept(hit)
      }
    } catch (error) {
      // An abort is our own doing; anything else is a real failure worth reporting.
      if (!controller.signal.aborted) {
        console.error(error)
        if (scan === controller) scan = undefined
        flush()
        patch({ scanning: false })
        return
      }
    }
    if (scan === controller) {
      scan = undefined
      flush()
      patch({ scanning: false })
    }
  }

  function start(): void {
    timer = undefined
    scan?.abort()
    scan = undefined
    const doc = opts.document.get()
    if (!doc || state.get().query === '') {
      patch({ scanning: false })
      return
    }
    const controller = new AbortController()
    scan = controller
    patch({ scanning: true })
    void run(doc, controller)
  }

  /** Empties the hits now and scans again, after the debounce when `delay` is set. */
  function restart(delay: boolean): void {
    reset()
    if (state.get().query === '') return
    patch({ scanning: true })
    if (delay) timer = setTimeout(start, debounceMs)
    else start()
  }

  function step(by: 1 | -1): void {
    flush()
    const { hits, current } = state.get()
    if (hits.length === 0) return
    const index = (Math.max(current, 0) + by + hits.length) % hits.length
    const hit = hits[index] as SearchHit
    currentHit = hit
    currentIndex = index
    patch({ current: index })
    scrollTo(hit)
  }

  const stopDocument = opts.document.subscribe(() => {
    if (destroyed) return
    reset()
    if (state.get().open) restart(false)
  })

  function setQuery(query: string): void {
    patch({ query })
    restart(true)
  }

  function open(query?: string): void {
    const wasOpen = state.get().open
    patch({ open: true })
    if (query !== undefined) setQuery(query)
    else if (!wasOpen && state.get().query !== '') restart(false)
  }

  return {
    state: readonly(state),
    open,
    setQuery,
    setMatchCase(on) {
      patch({ matchCase: on })
      restart(false)
    },
    next: () => step(1),
    previous: () => step(-1),
    close() {
      reset()
      patch({ open: false })
    },
    attachBar() {
      let attached = true
      bars.update((n) => n + 1)
      return () => {
        if (!attached) return
        attached = false
        bars.update((n) => n - 1)
      }
    },
    barAttached: {
      get: () => bars.get() > 0,
      subscribe(fn) {
        let last = bars.get() > 0
        return bars.subscribe((n) => {
          if (n > 0 === last) return
          last = n > 0
          fn(last)
        })
      },
    },
    destroy() {
      destroyed = true
      stopDocument()
      reset()
    },
  }
}

/**
 * The actions and state of `controller` without the bar registration: what callers of a viewer
 * or a plugin get.
 *
 * @internal Shared with the framework bindings.
 */
export function viewerSearchOf(controller: SearchController): ViewerSearch {
  return {
    state: controller.state,
    open: (query) => controller.open(query),
    setQuery: (query) => controller.setQuery(query),
    setMatchCase: (on) => controller.setMatchCase(on),
    next: () => controller.next(),
    previous: () => controller.previous(),
    close: () => controller.close(),
  }
}
