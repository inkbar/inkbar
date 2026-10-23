import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { writable } from '../../model/readable'

import { createSearchController } from './controller'

import type { InkDocument } from '../../model/document'
import type { SearchHit, SearchOptions } from '../../model/search'
import type { Viewport } from '../viewport'

function hit(page: number, start: number): SearchHit {
  return {
    page,
    start,
    end: start + 3,
    text: 'foo',
    quads: [],
    rect: { x: page, y: start, width: 10, height: 10 },
    exact: true,
    before: '',
    after: '',
  }
}

interface Call {
  query: string | RegExp
  opts: SearchOptions
}

/** A document whose `search` yields `table[page]` for each requested page, `delayMs` apart. */
function fakeDoc(table: Record<number, SearchHit[]>, pageCount = 5, delayMs = 10) {
  const calls: Call[] = []
  const doc = {
    pages: Array.from({ length: pageCount }),
    search(query: string | RegExp, opts: SearchOptions = {}) {
      calls.push({ query, opts })
      const signal = opts.signal
      const order = opts.pages ?? []
      const iterate = async function* () {
        for (const page of order) {
          await new Promise((resolve) => setTimeout(resolve, delayMs))
          if (signal?.aborted)
            throw signal.reason ?? new DOMException('Aborted', 'AbortError')
          for (const h of table[page] ?? []) yield h
        }
      }
      return { [Symbol.asyncIterator]: iterate, all: () => Promise.resolve([]) }
    },
  } as unknown as InkDocument
  return { doc, calls }
}

function setup(table: Record<number, SearchHit[]>, page = 0, pageCount = 5) {
  const { doc, calls } = fakeDoc(table, pageCount)
  const document = writable<InkDocument | null>(doc)
  const currentPage = writable(page)
  const scrollToRect = vi.fn()
  const viewport = { currentPage, scrollToRect } as unknown as Viewport
  const controller = createSearchController({ document, viewport: () => viewport })
  return { controller, doc, document, calls, currentPage, scrollToRect }
}

const settle = async (ms = 1000) => {
  await vi.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createSearchController', () => {
  it('starts closed and empty', () => {
    const { controller } = setup({})
    expect(controller.state.get()).toEqual({
      open: false,
      query: '',
      matchCase: false,
      hits: [],
      current: -1,
      scanning: false,
    })
  })

  it('debounces three setQuery calls into one search', async () => {
    const { controller, calls } = setup({ 0: [hit(0, 1)] })
    controller.setQuery('f')
    controller.setQuery('fo')
    controller.setQuery('foo')
    expect(calls).toHaveLength(0)
    await settle()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.query).toBe('foo')
    expect(controller.state.get().query).toBe('foo')
  })

  it('aborts the previous scan and never shows its late hits', async () => {
    const { controller, calls } = setup({ 0: [hit(0, 1)], 1: [hit(1, 1)] })
    controller.setQuery('a')
    await vi.advanceTimersByTimeAsync(155)
    expect(calls).toHaveLength(1)
    controller.setQuery('b')
    expect(calls[0]?.opts.signal?.aborted).toBe(true)
    expect(controller.state.get().hits).toEqual([])
    await settle()
    expect(calls).toHaveLength(2)
    expect(controller.state.get().hits.map((h) => h.page)).toEqual([0, 1])
  })

  it('scans from the current page to the end, then from the start', async () => {
    const { controller, calls } = setup({}, 2, 5)
    controller.setQuery('foo')
    await settle()
    expect(calls[0]?.opts.pages).toEqual([2, 3, 4, 0, 1])
    expect(calls[0]?.opts.matchCase).toBe(false)
  })

  it('keeps hits in (page, start) order while they arrive out of order', async () => {
    const { controller } = setup(
      { 0: [hit(0, 5), hit(0, 9)], 3: [hit(3, 2)], 4: [hit(4, 1)] },
      3
    )
    controller.setQuery('foo')
    await settle()
    expect(controller.state.get().hits.map((h) => [h.page, h.start])).toEqual([
      [0, 5],
      [0, 9],
      [3, 2],
      [4, 1],
    ])
    expect(controller.state.get().scanning).toBe(false)
  })

  it('adds a page of hits in one state change', async () => {
    const many = (page: number) => Array.from({ length: 50 }, (_, i) => hit(page, i * 4))
    const { controller } = setup({ 0: many(0), 2: many(2) })
    const lengths: number[] = []
    controller.state.subscribe((s) => {
      if (s.hits.length !== lengths.at(-1)) lengths.push(s.hits.length)
    })
    controller.setQuery('foo')
    await settle()
    expect(lengths).toEqual([0, 50, 100])
    expect(controller.state.get().current).toBe(0)
  })

  it('keeps current on its hit while a page of earlier hits arrives', async () => {
    const { controller } = setup(
      { 0: [hit(0, 1), hit(0, 2), hit(0, 3)], 3: [hit(3, 2), hit(3, 4)] },
      3
    )
    controller.setQuery('foo')
    await vi.advanceTimersByTimeAsync(185)
    controller.next()
    expect(controller.state.get().hits[controller.state.get().current]).toEqual(hit(3, 4))
    await settle()
    const s = controller.state.get()
    expect(s.hits).toHaveLength(5)
    expect(s.current).toBe(4)
  })

  it('points current at the first hit at or after the page in view, and keeps it', async () => {
    const { controller, scrollToRect } = setup({ 0: [hit(0, 5)], 3: [hit(3, 2)] }, 2)
    controller.setQuery('foo')
    await vi.advanceTimersByTimeAsync(175)
    let s = controller.state.get()
    expect(s.hits.map((h) => h.page)).toEqual([3])
    expect(s.current).toBe(0)
    expect(s.scanning).toBe(true)
    expect(scrollToRect).toHaveBeenCalledWith(3, hit(3, 2).rect)

    await settle()
    s = controller.state.get()
    expect(s.hits.map((h) => h.page)).toEqual([0, 3])
    expect(s.current).toBe(1)
    expect(s.hits[s.current]?.page).toBe(3)
  })

  it('wraps next past the last and previous before the first, scrolling to each hit', async () => {
    const { controller, scrollToRect } = setup({
      0: [hit(0, 1)],
      1: [hit(1, 1)],
      2: [hit(2, 1)],
    })
    controller.setQuery('foo')
    await settle()
    expect(controller.state.get().current).toBe(0)
    controller.previous()
    expect(controller.state.get().current).toBe(2)
    expect(scrollToRect).toHaveBeenLastCalledWith(2, hit(2, 1).rect)
    controller.next()
    expect(controller.state.get().current).toBe(0)
    controller.next()
    controller.next()
    expect(controller.state.get().current).toBe(2)
    controller.next()
    expect(controller.state.get().current).toBe(0)
  })

  it('lands a step taken before the first page shows on the first hit, scrolling only on steps', async () => {
    const { controller, doc, scrollToRect } = setup({})
    // One page of hits that arrives without a timer, then a scan that never ends.
    ;(doc as unknown as { search: unknown }).search = () => ({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve()
        yield hit(0, 1)
        yield hit(0, 5)
        await new Promise(() => {})
      },
    })
    controller.setQuery('foo')
    controller.setMatchCase(false)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(controller.state.get().hits).toEqual([])
    controller.next()
    expect(controller.state.get().current).toBe(0)
    expect(scrollToRect.mock.calls).toEqual([[0, hit(0, 1).rect]])
    controller.next()
    expect(controller.state.get().current).toBe(1)
    await settle()
    expect(scrollToRect).toHaveBeenCalledTimes(2)
  })

  it('lands a previous step taken before the first page shows on the first hit too', async () => {
    const { controller, doc } = setup({})
    ;(doc as unknown as { search: unknown }).search = () => ({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve()
        yield hit(0, 1)
        yield hit(0, 5)
        await new Promise(() => {})
      },
    })
    controller.setQuery('foo')
    controller.setMatchCase(false)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    controller.previous()
    expect(controller.state.get().current).toBe(0)
  })

  it('does not scroll to the first hit after a step', async () => {
    const { controller, scrollToRect } = setup(
      { 2: [hit(2, 1), hit(2, 4)], 0: [hit(0, 1)] },
      2,
      3
    )
    controller.setQuery('foo')
    await vi.advanceTimersByTimeAsync(165)
    expect(controller.state.get().hits.map((h) => h.page)).toEqual([2, 2])
    controller.next()
    await settle()
    expect(controller.state.get().hits).toHaveLength(3)
    expect(scrollToRect.mock.calls).toEqual([
      [2, hit(2, 1).rect],
      [2, hit(2, 4).rect],
    ])
  })

  it('does nothing on next and previous without hits', () => {
    const { controller, scrollToRect } = setup({})
    controller.next()
    controller.previous()
    expect(controller.state.get().current).toBe(-1)
    expect(scrollToRect).not.toHaveBeenCalled()
  })

  it('open shows the bar state, and open(query) searches', async () => {
    const { controller, calls } = setup({ 0: [hit(0, 1)] })
    controller.open()
    expect(controller.state.get().open).toBe(true)
    expect(calls).toHaveLength(0)
    controller.open('foo')
    await settle()
    expect(calls).toHaveLength(1)
    expect(controller.state.get().hits).toHaveLength(1)
  })

  it('close clears hits and aborts, keeping query and matchCase; reopening reruns', async () => {
    const { controller, calls } = setup({ 0: [hit(0, 1)] })
    controller.open()
    controller.setMatchCase(true)
    controller.setQuery('foo')
    await settle()
    controller.close()
    expect(controller.state.get()).toEqual({
      open: false,
      query: 'foo',
      matchCase: true,
      hits: [],
      current: -1,
      scanning: false,
    })
    controller.open()
    await settle()
    expect(calls).toHaveLength(2)
    expect(calls[1]?.opts.matchCase).toBe(true)
    expect(controller.state.get().hits).toHaveLength(1)
  })

  it('close during a scan aborts it without surfacing an error', async () => {
    const { controller, calls } = setup({ 0: [hit(0, 1)], 1: [hit(1, 1)] })
    controller.open('foo')
    await vi.advanceTimersByTimeAsync(165)
    controller.close()
    expect(calls[0]?.opts.signal?.aborted).toBe(true)
    await settle()
    expect(controller.state.get().hits).toEqual([])
    expect(controller.state.get().scanning).toBe(false)
  })

  it('setMatchCase reruns the query', async () => {
    const { controller, calls } = setup({ 0: [hit(0, 1)] })
    controller.setQuery('foo')
    await settle()
    controller.setMatchCase(true)
    await settle()
    expect(calls).toHaveLength(2)
    expect(calls[1]?.opts.matchCase).toBe(true)
  })

  it('a whitespace-only query scans nothing and shows no hits', async () => {
    const { controller, calls } = setup({ 0: [hit(0, 1)] })
    controller.open('  \t')
    await settle()
    expect(calls).toHaveLength(0)
    expect(controller.state.get()).toMatchObject({
      hits: [],
      current: -1,
      scanning: false,
    })
    controller.setQuery(' ')
    expect(controller.state.get().scanning).toBe(false)
  })

  it('an empty query scans nothing', async () => {
    const { controller, calls } = setup({ 0: [hit(0, 1)] })
    controller.setQuery('')
    await settle()
    expect(calls).toHaveLength(0)
    expect(controller.state.get().scanning).toBe(false)
  })

  it('clears hits on a document swap and reruns when open', async () => {
    const { controller, document, calls } = setup({ 0: [hit(0, 1)] })
    controller.open('foo')
    await settle()
    expect(controller.state.get().hits).toHaveLength(1)
    const next = fakeDoc({ 1: [hit(1, 1)], 2: [hit(2, 1)] })
    document.set(next.doc)
    expect(controller.state.get().hits).toEqual([])
    expect(controller.state.get().current).toBe(-1)
    await settle()
    expect(next.calls).toHaveLength(1)
    expect(calls).toHaveLength(1)
    expect(controller.state.get().hits.map((h) => h.page)).toEqual([1, 2])
    expect(controller.state.get().query).toBe('foo')
  })

  it('does not rerun on a document swap while closed', async () => {
    const { controller, document } = setup({ 0: [hit(0, 1)] })
    const next = fakeDoc({})
    controller.setQuery('foo')
    await settle()
    controller.close()
    document.set(next.doc)
    await settle()
    expect(next.calls).toHaveLength(0)
  })

  it('tracks whether a find bar is attached', () => {
    const { controller } = setup({})
    expect(controller.barAttached.get()).toBe(false)
    const a = controller.attachBar()
    const b = controller.attachBar()
    a()
    expect(controller.barAttached.get()).toBe(true)
    b()
    b()
    expect(controller.barAttached.get()).toBe(false)
  })

  it('destroy stops scans and timers', async () => {
    const { controller, calls } = setup({ 0: [hit(0, 1)] })
    controller.setQuery('foo')
    controller.destroy()
    await settle()
    expect(calls).toHaveLength(0)
  })

  it('open on an open bar leaves finished hits and current alone', async () => {
    const { controller, calls } = setup({ 0: [hit(0, 1)], 1: [hit(1, 1)] })
    controller.open('foo')
    await settle()
    controller.next()
    controller.open()
    await settle()
    expect(calls).toHaveLength(1)
    expect(controller.state.get().hits).toHaveLength(2)
    expect(controller.state.get().current).toBe(1)
  })

  it('logs a scan failure that is not an abort and stops scanning', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { controller, doc } = setup({})
    const boom = new Error('boom')
    ;(doc as unknown as { search: unknown }).search = () => ({
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(boom) }),
    })
    try {
      controller.setQuery('foo')
      await settle()
      expect(error).toHaveBeenCalledWith(boom)
      expect(controller.state.get().scanning).toBe(false)
    } finally {
      error.mockRestore()
    }
  })

  it('works with its actions destructured', async () => {
    const { controller, calls } = setup({ 0: [hit(0, 1)] })
    // Detached on purpose: actions must not depend on `this`.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { open, setQuery, close } = controller
    open('foo')
    await settle()
    expect(calls).toHaveLength(1)
    setQuery('bar')
    close()
    expect(controller.state.get().open).toBe(false)
  })
})
