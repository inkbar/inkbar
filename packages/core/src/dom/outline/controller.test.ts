import { afterEach, describe, expect, it, vi } from 'vitest'

import { en } from '../../messages'
import { writable } from '../../model/readable'
import { createNavigation, type Navigation } from '../navigation'

import {
  createOutlineController,
  outlineTreeAttrs,
  type OutlineController,
} from './controller'

import type { Destination, LinkTarget } from '../../model/destination'
import type { InkDocument } from '../../model/document'
import type { ViewerAction } from '../../model/form/types'
import type { OutlineItem } from '../../model/outline'
import type { CssLayout } from '../layout'
import type { Viewport } from '../viewport'

/** Page height in the fake layout, in CSS px; a point's y is its page's top plus 800 less `top`. */
const PAGE = 1000

const at = (page: number, top?: number): LinkTarget => ({
  kind: 'resolved',
  dest: { page, fit: 'xyz', top },
})

function item(
  id: string,
  title: string,
  target: LinkTarget,
  children: OutlineItem[] = [],
  open = false
): OutlineItem {
  return { id, title, target, bold: false, italic: false, open, children }
}

/** A, with A1 and A2, open; B, with B1, closed; C; and D, which Inkbar cannot follow. */
const tree = (): OutlineItem[] => [
  item(
    '0',
    'Alpha',
    at(0),
    [item('0.0', 'Apple', at(0, 600)), item('0.1', 'Avocado', at(1, 700))],
    true
  ),
  item('1', 'Bravo', at(2), [item('1.0', 'Banana', at(2, 400))]),
  item('2', 'Charlie', at(3)),
  item('3', 'Delta', { kind: 'unsupported', reason: 'remote' }),
]

/** A document whose outline is `items`. */
const docOf = (items: OutlineItem[]) =>
  ({
    pages: Array.from({ length: 10 }, (_, index) => ({ index })),
    outline: () => Promise.resolve(items),
  }) as unknown as InkDocument

/** A viewport whose destinations sit at `page * PAGE + 800 - top` and that scrolls to them. */
function fakeViewport() {
  const readingLine = writable(0)
  const layout = writable<CssLayout>({ boxes: [], width: 0, height: 0 })
  const currentPage = writable(0)
  let position: Destination = { page: 0, fit: 'fit' }
  const destinationY = (dest: Destination): number | undefined => {
    const top = 'top' in dest && dest.top !== undefined ? dest.top : 800
    return dest.page * PAGE + 800 - top
  }
  const scrollToDestination = vi.fn((dest: Destination) => {
    position = dest
    currentPage.set(dest.page)
    readingLine.set(destinationY(dest)! + 1)
  })
  const viewport = {
    readingLine,
    layout,
    currentPage,
    destinationY,
    scrollToDestination,
  } as unknown as Viewport
  return {
    viewport,
    readingLine,
    layout,
    currentPage,
    scrollToDestination,
    here: () => position,
  }
}

let made: OutlineController[] = []
afterEach(() => {
  made.forEach((c) => c.destroy())
  made = []
})

async function setup(items: OutlineItem[] = tree()) {
  const vp = fakeViewport()
  const document = writable<InkDocument | null>(docOf(items))
  const viewport = writable<Viewport | null>(vp.viewport)
  const report = vi.fn<(a: ViewerAction) => void>()
  const nav = createNavigation({
    viewport: () => vp.viewport,
    document: () => document.get() ?? undefined,
    here: vp.here,
    report,
  })
  const navigation = writable<Navigation | null>(nav)
  const c = createOutlineController({ document, viewport, navigation, idPrefix: 'o' })
  made.push(c)
  await vi.waitFor(() => expect(c.loading.get()).toBe(false))
  return { c, vp, document, nav, report }
}

/** A keydown as the tree receives it, from no particular element. */
function key(c: OutlineController, k: string) {
  const e = {
    key: k,
    target: null,
    defaultPrevented: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: k === '*',
    isComposing: false,
    preventDefault: vi.fn(),
  }
  c.onKeydown(e as unknown as KeyboardEvent)
  return e
}

describe('createOutlineController', () => {
  it('loads the outline and expands the open items', async () => {
    const { c } = await setup()
    expect(c.items.get().map((i) => i.title)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
    ])
    expect([...c.expanded.get()]).toEqual(['0'])
    expect(c.treeAttrs()).toEqual({ role: 'tree', 'aria-label': 'Outline' })
    expect(c.treeAttrs()).toEqual(outlineTreeAttrs(en))
  })

  it('current item follows the reading line', async () => {
    const two = [
      item('0', 'First', at(0, 700)),
      item('1', 'Second', at(0, 300)),
      item('2', 'Elsewhere', {
        kind: 'url',
        url: 'https://example.com',
        newWindow: false,
      }),
    ]
    const { c, vp } = await setup(two)
    // First is at y 100, Second at y 500.
    vp.readingLine.set(300)
    expect(c.current.get()).toBe('0')
    expect(c.itemAttrs('0')['aria-current']).toBe('location')
    expect(c.itemAttrs('1')['aria-current']).toBeUndefined()
    vp.readingLine.set(500)
    expect(c.current.get()).toBe('1')
    vp.readingLine.set(50)
    expect(c.current.get()).toBeNull()
  })

  it('current item is the last in document order at or above the line', async () => {
    // Out of page order: the later item points back up the document.
    const odd = [
      item('0', 'One', at(0)),
      item('1', 'Three', at(3)),
      item('2', 'Two', at(1)),
      item('3', 'Four', at(4)),
    ]
    const { c, vp } = await setup(odd)
    vp.readingLine.set(1500)
    expect(c.current.get()).toBe('2')
    vp.readingLine.set(3500)
    expect(c.current.get()).toBe('2')
    vp.readingLine.set(4500)
    expect(c.current.get()).toBe('3')
  })

  it('recomputes the current item when the layout changes', async () => {
    const { c, vp } = await setup()
    vp.readingLine.set(900)
    expect(c.current.get()).toBe('0.0')
    // A new layout (zoom) moves every destination; the reading line stays put.
    vp.viewport.destinationY = (dest) =>
      'top' in dest && dest.top !== undefined ? 5 * PAGE : dest.page * PAGE
    vp.layout.set({ boxes: [], width: 1, height: 1 })
    expect(c.current.get()).toBe('0')
  })

  it('single-page mode orders items on other pages by their page', async () => {
    const { c, vp } = await setup()
    // Only the shown page has a box; the reading line is near its top.
    const shownOnly = (page: number) => (dest: Destination) =>
      dest.page === page
        ? 100 + ('top' in dest && dest.top !== undefined ? 800 - dest.top : 0)
        : undefined
    vp.viewport.destinationY = shownOnly(2)
    vp.currentPage.set(2)
    vp.layout.set({ boxes: [], width: 2, height: 2 })
    vp.readingLine.set(50)
    // Nothing on page 2 is reached yet; Avocado (page 1) is the last item above it.
    expect(c.current.get()).toBe('0.1')
    vp.readingLine.set(150)
    expect(c.current.get()).toBe('1')
    // Turning the page alone, with no new layout, re-places the items.
    vp.viewport.destinationY = shownOnly(3)
    vp.currentPage.set(3)
    expect(c.current.get()).toBe('2')
    vp.viewport.destinationY = shownOnly(0)
    vp.currentPage.set(0)
    vp.readingLine.set(50)
    expect(c.current.get()).toBeNull()
  })

  it('destroy unbinds a bound scroller', async () => {
    const { c } = await setup()
    const frames: number[] = []
    const observers: { disconnect: ReturnType<typeof vi.fn> }[] = []
    const view = {
      requestAnimationFrame: vi.fn(() => frames.push(1)),
      cancelAnimationFrame: vi.fn(),
      ResizeObserver: class {
        disconnect = vi.fn()
        constructor() {
          observers.push(this)
        }
        observe() {}
      },
    }
    const scroller = {
      ownerDocument: {
        defaultView: view,
        activeElement: null,
        getElementById: () => null,
      },
      clientHeight: 100,
      contains: () => false,
    } as unknown as HTMLElement
    c.bindScroll(scroller)
    c.destroy()
    expect(observers[0]?.disconnect).toHaveBeenCalled()
    expect(view.cancelAnimationFrame).toHaveBeenCalled()
  })

  it('collapsed parent is marked', async () => {
    const { c, vp } = await setup()
    vp.readingLine.set(2 * PAGE + 500)
    // Banana is reached, but Bravo is closed.
    expect(c.current.get()).toBe('1')
    c.toggle('1')
    expect(c.current.get()).toBe('1.0')
    c.collapseAll()
    expect(c.current.get()).toBe('1')
    c.expandAll()
    expect(c.current.get()).toBe('1.0')
  })

  describe('keyboard tree rules', () => {
    it('Down and Up move between visible items', async () => {
      const { c } = await setup()
      const e = key(c, 'ArrowDown')
      expect(e.preventDefault).toHaveBeenCalled()
      expect(c.focused.get()).toBe('0.0')
      key(c, 'ArrowDown')
      key(c, 'ArrowDown')
      // Banana is inside the closed Bravo.
      key(c, 'ArrowDown')
      expect(c.focused.get()).toBe('2')
      key(c, 'ArrowUp')
      expect(c.focused.get()).toBe('1')
      expect(c.itemAttrs('1').tabindex).toBe('0')
      expect(c.itemAttrs('0').tabindex).toBe('-1')
    })

    it('Right expands a closed item, then moves to its first child', async () => {
      const { c } = await setup()
      key(c, 'End')
      key(c, 'ArrowUp')
      key(c, 'ArrowUp')
      expect(c.focused.get()).toBe('1')
      key(c, 'ArrowRight')
      expect(c.expanded.get().has('1')).toBe(true)
      expect(c.focused.get()).toBe('1')
      key(c, 'ArrowRight')
      expect(c.focused.get()).toBe('1.0')
      // A leaf goes nowhere.
      key(c, 'ArrowRight')
      expect(c.focused.get()).toBe('1.0')
    })

    it('Left collapses an open item, else moves to its parent', async () => {
      const { c } = await setup()
      key(c, 'ArrowDown')
      key(c, 'ArrowDown')
      expect(c.focused.get()).toBe('0.1')
      key(c, 'ArrowLeft')
      expect(c.focused.get()).toBe('0')
      expect(c.itemAttrs('0')['aria-expanded']).toBe('true')
      key(c, 'ArrowLeft')
      expect(c.expanded.get().has('0')).toBe(false)
      expect(c.itemAttrs('0')['aria-expanded']).toBe('false')
      key(c, 'ArrowLeft')
      expect(c.focused.get()).toBe('0')
    })

    it('Home and End go to the first and last visible items', async () => {
      const { c } = await setup()
      key(c, 'End')
      expect(c.focused.get()).toBe('3')
      key(c, 'Home')
      expect(c.focused.get()).toBe('0')
    })

    it('Enter activates', async () => {
      const { c, vp } = await setup()
      key(c, 'ArrowDown')
      key(c, 'Enter')
      await vi.waitFor(() =>
        expect(vp.scrollToDestination).toHaveBeenCalledWith({
          page: 0,
          fit: 'xyz',
          top: 600,
        })
      )
    })

    it('* expands the siblings', async () => {
      const { c } = await setup()
      c.collapseAll()
      key(c, 'ArrowDown')
      expect(c.focused.get()).toBe('1')
      key(c, '*')
      expect([...c.expanded.get()].sort()).toEqual(['0', '1'])
      expect(c.focused.get()).toBe('1')
    })

    it('typing goes to the next title with that prefix', async () => {
      vi.useFakeTimers()
      try {
        const { c } = await setup()
        key(c, 'a')
        expect(c.focused.get()).toBe('0.0')
        key(c, 'v')
        expect(c.focused.get()).toBe('0.1')
        vi.advanceTimersByTime(600)
        key(c, 'c')
        expect(c.focused.get()).toBe('2')
        vi.advanceTimersByTime(600)
        // Not visible: Banana is inside the closed Bravo.
        key(c, 'b')
        expect(c.focused.get()).toBe('1')
        vi.advanceTimersByTime(600)
        const miss = key(c, 'z')
        expect(miss.preventDefault).toHaveBeenCalled()
        expect(c.focused.get()).toBe('1')
      } finally {
        vi.useRealTimers()
      }
    })

    it.each(['altKey', 'ctrlKey', 'metaKey'])('leaves %s chords alone', async (mod) => {
      const { c } = await setup()
      const e = {
        ...key(c, 'Home'),
        key: 'ArrowDown',
        [mod]: true,
        preventDefault: vi.fn(),
      }
      c.onKeydown(e as unknown as KeyboardEvent)
      expect(e.preventDefault).not.toHaveBeenCalled()
      expect(c.focused.get()).toBe('0')
    })
  })

  it('gives each item its tree attributes', async () => {
    const { c } = await setup()
    expect(c.itemAttrs('0.1')).toEqual({
      role: 'treeitem',
      id: 'o-0-1',
      'aria-level': '2',
      'aria-setsize': '2',
      'aria-posinset': '2',
      'aria-expanded': undefined,
      'aria-current': undefined,
      'aria-disabled': undefined,
      'aria-labelledby': 'o-0-1-title',
      tabindex: '-1',
    })
    expect(c.titleAttrs('0.1')).toEqual({ id: 'o-0-1-title' })
    expect(c.rowAttrs('0.1')).toEqual({ id: 'o-0-1-row' })
    expect(c.itemAttrs('3')['aria-disabled']).toBe('true')
    expect(c.itemAttrs('1')['aria-expanded']).toBe('false')
    // With nothing focused, the current item is the Tab stop.
    expect(c.itemAttrs('0').tabindex).toBe('0')
  })

  it('activate follows and records history', async () => {
    const { c, vp, nav, report } = await setup([
      ...tree(),
      item('4', 'Site', { kind: 'url', url: 'https://example.com/a', newWindow: true }),
    ])
    c.activate('2')
    await vi.waitFor(() =>
      expect(vp.scrollToDestination).toHaveBeenCalledWith({ page: 3, fit: 'xyz' })
    )
    expect(nav.canGoBack.get()).toBe(true)
    expect(c.focused.get()).toBe('2')
    expect(c.current.get()).toBe('2')
    nav.back()
    expect(vp.here()).toEqual({ page: 0, fit: 'fit' })

    vp.scrollToDestination.mockClear()
    c.activate('3')
    await Promise.resolve()
    expect(vp.scrollToDestination).not.toHaveBeenCalled()

    c.activate('4')
    await vi.waitFor(() =>
      expect(report).toHaveBeenCalledWith({
        kind: 'open-url',
        url: 'https://example.com/a',
        newWindow: true,
      })
    )
  })

  describe('the item jumped to', () => {
    /** Upper sits at y 500 (top 300); Lower, after it in the outline, at y 0 above it. */
    const outOfOrder = () => [
      item('0', 'Upper', at(0, 300)),
      item('1', 'Lower', at(0)),
      item('2', 'Site', { kind: 'url', url: 'https://example.com', newWindow: false }),
    ]
    /** Lets the jump settle: the controller records where it landed on the next frame. */
    const settled = () => new Promise((r) => setTimeout(r, 20))

    it('stays current until the reader scrolls away', async () => {
      const { c, vp } = await setup(outOfOrder())
      vp.readingLine.set(10)
      expect(c.current.get()).toBe('1')
      c.activate('0')
      await vi.waitFor(() => expect(vp.scrollToDestination).toHaveBeenCalled())
      // The rule alone would mark Lower, which is above the line and later in the outline.
      expect(c.current.get()).toBe('0')
      await settled()
      expect(c.current.get()).toBe('0')
      // A pixel or two of drift keeps it.
      vp.readingLine.set(vp.readingLine.get() + 2)
      expect(c.current.get()).toBe('0')
      vp.readingLine.set(vp.readingLine.get() + 50)
      expect(c.current.get()).toBe('1')
    })

    it('is released by a new layout or another document', async () => {
      const { c, vp, document } = await setup(outOfOrder())
      c.activate('0')
      await settled()
      expect(c.current.get()).toBe('0')
      vp.layout.set({ boxes: [], width: 3, height: 3 })
      expect(c.current.get()).toBe('1')

      c.activate('0')
      await settled()
      expect(c.current.get()).toBe('0')
      document.set(docOf(outOfOrder()))
      await vi.waitFor(() => expect(c.loading.get()).toBe(false))
      expect(c.current.get()).toBe('1')
    })

    it('is not pinned for a URL', async () => {
      const { c, vp } = await setup(outOfOrder())
      vp.readingLine.set(10)
      c.activate('2')
      await settled()
      expect(c.current.get()).toBe('1')
    })
  })

  it('new document resets', async () => {
    const { c, document, vp } = await setup()
    c.expandAll()
    key(c, 'End')
    vp.readingLine.set(900)
    expect(c.current.get()).toBe('0.0')
    const next = [
      item('0', 'Intro', at(0)),
      item('1', 'Body', at(1), [item('1.0', 'Detail', at(1, 500))], true),
    ]
    document.set(docOf(next))
    expect(c.loading.get()).toBe(true)
    expect(c.items.get()).toEqual([])
    await vi.waitFor(() => expect(c.loading.get()).toBe(false))
    expect(c.items.get().map((i) => i.title)).toEqual(['Intro', 'Body'])
    expect([...c.expanded.get()]).toEqual(['1'])
    expect(c.focused.get()).toBeNull()
    expect(c.current.get()).toBe('0')

    document.set(null)
    expect(c.items.get()).toEqual([])
    expect(c.loading.get()).toBe(false)
    expect(c.current.get()).toBeNull()
  })

  it('a stale outline does not land after another document', async () => {
    let release: (items: OutlineItem[]) => void = () => undefined
    const slow = {
      pages: [],
      outline: () => new Promise<OutlineItem[]>((r) => (release = r)),
    } as unknown as InkDocument
    const { c, document } = await setup()
    document.set(slow)
    document.set(docOf([item('0', 'Fresh', at(0))]))
    release(tree())
    await vi.waitFor(() => expect(c.loading.get()).toBe(false))
    await Promise.resolve()
    expect(c.items.get().map((i) => i.title)).toEqual(['Fresh'])
  })
})
