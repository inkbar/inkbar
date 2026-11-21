import themeCss from '@inkbar/theme/theme.css?inline'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { rectFromQuad, unionRects, type Rect } from '../model/geometry'

import { getSelectionQuads } from './selection'
import { mountContainer, openFixtureInBrowser } from './test-utils'
import { mountTextSpans } from './text-spans'
import { createPageTransform, type PageTransform, type ViewRotation } from './transform'

import type { EngineDocumentReader } from '../engine-reader/reader'
import type { EngineLoader, InkDocument } from '../model/document'
import type { TextItem } from '../model/text'
import type { FixtureName } from '@inkbar/fixtures/urls'

const flag = globalThis as { __INKBAR_READER__?: unknown }
const engine: EngineLoader = () => import('@inkbar/engine')

let style: HTMLStyleElement
beforeAll(() => {
  style = document.createElement('style')
  style.textContent = themeCss
  document.head.append(style)
})
afterAll(() => style.remove())

let cleanup: (() => void)[] = []
beforeEach(() => {
  flag.__INKBAR_READER__ = 'engine'
})
afterEach(() => {
  delete flag.__INKBAR_READER__
  window.getSelection()?.removeAllRanges()
  cleanup.reverse().forEach((f) => f())
  cleanup = []
})

/** Whether an item gets a span: every item with text, spaces included. */
const spanned = (s: string): boolean => s !== ''

function sizeHost(host: HTMLElement, t: PageTransform) {
  host.style.width = `${t.cssWidth}px`
  host.style.height = `${t.cssHeight}px`
  host.style.setProperty('--scale-factor', String(t.zoom))
  host.style.setProperty('--total-scale-factor', String(t.scale))
}

async function open(name: FixtureName): Promise<InkDocument> {
  const doc = await openFixtureInBrowser(name, { engine })
  cleanup.push(() => doc.destroy())
  expect(doc._reader.kind).toBe('engine')
  return doc
}

/** The page's spans, mounted the way the text layer mounts them. */
async function mount(name: FixtureName, zoom: number, rotation: ViewRotation = 0) {
  const doc = await open(name)
  const reader = doc._reader as EngineDocumentReader
  const [content, families, info] = await Promise.all([
    reader.text(0, { glyphs: false }),
    reader.textFamilies(0),
    reader.pageInfo(0),
  ])
  const t = createPageTransform(doc.pages[0]!, zoom, rotation)
  const host = mountContainer(t.cssWidth, t.cssHeight)
  host.dataset.page = '0'
  sizeHost(host, t)
  const container = document.createElement('div')
  container.className = 'ink-text-layer'
  container.dataset.inkTextLayer = ''
  container.style.cssText = 'position:absolute;inset:0;user-select:text;'
  host.append(container)
  cleanup.push(() => host.remove())
  const layer = mountTextSpans({ content, families, info, container, transform: t })
  const items = content.items.filter((item) => spanned(item.str))
  return { doc, content, families, info, t, host, container, layer, items }
}

const spansIn = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>(':scope > span'),
]

/** How far each edge of `actual` lies from `expected`, in CSS pixels. */
function edgeErrors(
  actual: DOMRect,
  expected: { left: number; top: number; width: number; height: number }
) {
  return {
    left: Math.abs(actual.left - expected.left),
    top: Math.abs(actual.top - expected.top),
    right: Math.abs(actual.right - (expected.left + expected.width)),
    bottom: Math.abs(actual.bottom - (expected.top + expected.height)),
  }
}

const tolerance = (r: { width: number; height: number }): number =>
  Math.max(1.5, 0.06 * Math.max(r.width, r.height))

/**
 * The run's box shrunk across its baseline to one font size, centred: where the span's line box
 * goes when the engine's loose box is taller than the font.
 */
function lineBox(item: TextItem): Rect {
  const { p1, p2, p3, p4 } = item.quad
  const height = Math.hypot(p1.x - p3.x, p1.y - p3.y)
  if (!(height > 0)) return item.rect
  const k = (height - item.fontSize) / 2 / height
  const ux = (p1.x - p3.x) * k
  const uy = (p1.y - p3.y) * k
  return rectFromQuad({
    p1: { x: p1.x - ux, y: p1.y - uy },
    p2: { x: p2.x - ux, y: p2.y - uy },
    p3: { x: p3.x + ux, y: p3.y + uy },
    p4: { x: p4.x + ux, y: p4.y + uy },
  })
}

/**
 * Every span lies over its item's box, on every edge, within `tolerance`. An item whose loose
 * box is taller than its font by more than twice the tolerance cannot: its span is one font
 * size high. Such an item is checked against its centred line box instead, and listed in
 * `tall`, which the caller asserts on so no other item escapes the item-box check.
 */
function expectSpansOverItems(
  host: HTMLElement,
  container: HTMLElement,
  items: TextItem[],
  t: PageTransform,
  tall: string[] = []
) {
  const spans = spansIn(container)
  expect(spans).toHaveLength(items.length)
  const h = host.getBoundingClientRect()
  const misses: string[] = []
  const shifted: string[] = []
  items.forEach((item, i) => {
    const span = spans[i]!
    expect(span.textContent).toBe(item.str)
    const actual = span.getBoundingClientRect()
    const allowed = tolerance(actual)
    const height = Math.hypot(
      item.quad.p1.x - item.quad.p3.x,
      item.quad.p1.y - item.quad.p3.y
    )
    const tallItem = t.toCssLength(height - item.fontSize) / 2 > allowed
    if (tallItem) shifted.push(item.str)
    const css = t.toCssRect(tallItem ? lineBox(item) : item.rect)
    const expected = { ...css, left: css.left + h.left, top: css.top + h.top }
    for (const [edge, error] of Object.entries(edgeErrors(actual, expected)))
      if (!(error <= allowed))
        misses.push(
          `${JSON.stringify(item.str)} ${edge} off by ${error.toFixed(2)}px (allowed ${allowed.toFixed(2)}px)`
        )
  })
  expect(misses).toEqual([])
  expect(shifted).toEqual(tall)
}

/** Items whose loose box is too tall for the tolerance, by fixture: Noto Sans Hebrew's. */
const TALL: Partial<Record<FixtureName, string[]>> = { 'text-rtl': ['שלום'] }

const GEOMETRY: FixtureName[] = [
  'text-simple',
  'text-rotated-90',
  'cropbox-offset',
  'userunit-2',
  'text-rtl',
]

describe('text spans from the engine reader', () => {
  describe.each(GEOMETRY)('on %s', (name) => {
    it.each([
      [1, 0],
      [2, 0],
      [1, 90],
      [2, 90],
    ] as const)(
      'lies over each item at zoom %d, view rotation %d',
      async (zoom, rotation) => {
        const { host, container, items, t } = await mount(name, zoom, rotation)
        expect(items.length).toBeGreaterThan(0)
        expectSpansOverItems(host, container, items, t, TALL[name])
      }
    )

    it('stays over each item after an update to zoom 3, keeping its nodes', async () => {
      const { doc, host, container, items, layer } = await mount(name, 1)
      const before = [...container.childNodes]
      const zoomed = createPageTransform(doc.pages[0]!, 3, 0)
      sizeHost(host, zoomed)
      layer.update(zoomed)
      const after = [...container.childNodes]
      expect(after).toHaveLength(before.length)
      after.forEach((node, i) => expect(node).toBe(before[i]))
      expectSpansOverItems(host, container, items, zoomed, TALL[name])
    })

    it('stays over each item after an update that turns the view', async () => {
      const { doc, host, container, items, layer } = await mount(name, 1)
      const before = [...container.childNodes]
      const turned = createPageTransform(doc.pages[0]!, 2, 90)
      sizeHost(host, turned)
      layer.update(turned)
      ;[...container.childNodes].forEach((node, i) => expect(node).toBe(before[i]))
      expectSpansOverItems(host, container, items, turned, TALL[name])
    })
  })

  it('sizes and turns the layer with the transform', async () => {
    const { doc, container, info, layer } = await mount('userunit-2', 1)
    expect(container.dataset.mainRotation).toBe('0')
    expect(container.style.width).toBe(
      `calc(var(--total-scale-factor) * ${info.box.width}px)`
    )
    expect(container.style.height).toBe(
      `calc(var(--total-scale-factor) * ${info.box.height}px)`
    )
    layer.update(createPageTransform(doc.pages[0]!, 2, 90))
    expect(container.dataset.mainRotation).toBe('90')
    expect(container.style.width).toBe(
      `calc(var(--total-scale-factor) * ${info.box.width}px)`
    )
  })

  it('puts one span per item with text and one break per end of line', async () => {
    for (const name of [
      'text-simple',
      'text-search',
      'text-rtl',
      'text-vertical',
    ] as const) {
      const { container, content, items } = await mount(name, 1)
      expect(spansIn(container)).toHaveLength(items.length)
      const brs = [...container.querySelectorAll(':scope > br')]
      expect(brs).toHaveLength(content.items.filter((item) => item.hasEOL).length)
      for (const br of brs) expect(br.getAttribute('role')).toBe('presentation')
    }
  })

  it('gives a span to an item of only spaces, none to an empty one, and keeps breaks', async () => {
    const { container, info, t, content } = await mount('text-simple', 1)
    const [first, second] = content.items
    container.replaceChildren()
    mountTextSpans({
      content: {
        page: 0,
        items: [
          { ...first!, hasEOL: false },
          { ...second!, str: '', hasEOL: true },
          { ...second!, str: ' ', hasEOL: false },
          second!,
        ],
      },
      info,
      container,
      transform: t,
    })
    expect([...container.childNodes].map((n) => n.nodeName)).toEqual([
      'SPAN',
      'BR',
      'SPAN',
      'SPAN',
      'BR',
    ])
    const space = spansIn(container)[1]!
    expect(space.textContent).toBe(' ')
    expect(space.style.getPropertyValue('--scale-x')).toBe('')
  })

  it('sets --min-font-size to 1 when the browser enforces no minimum', async () => {
    const { container } = await mount('text-simple', 1)
    expect(container.style.getPropertyValue('--min-font-size')).toBe('1')
  })

  describe('the minimum font size probe', () => {
    /** A document of its own, so nothing is measured yet, with `css` in its head. */
    function frame(css: string): Document {
      const iframe = document.createElement('iframe')
      document.body.append(iframe)
      cleanup.push(() => iframe.remove())
      const doc = iframe.contentDocument!
      const rules = doc.createElement('style')
      rules.textContent = css
      doc.head.append(rules)
      return doc
    }

    /** `--min-font-size` of a layer of one item mounted in `doc`. */
    function measured(doc: Document): string {
      const info = {
        index: 0,
        box: { x: 0, y: 0, width: 612, height: 792 },
        rotate: 0,
        userUnit: 1,
        width: 612,
        height: 792,
      } as const
      const container = doc.createElement('div')
      doc.body.append(container)
      const quad = {
        p1: { x: 72, y: 712 },
        p2: { x: 102, y: 712 },
        p3: { x: 72, y: 700 },
        p4: { x: 102, y: 700 },
      }
      mountTextSpans({
        content: {
          page: 0,
          items: [
            {
              str: 'Hello',
              dir: 'ltr',
              fontName: 'f',
              fontSize: 12,
              hasEOL: true,
              quad,
              rect: rectFromQuad(quad),
            },
          ],
        },
        info,
        container,
        transform: createPageTransform(info, 1, 0),
      })
      const value = container.style.getPropertyValue('--min-font-size')
      container.remove()
      return value
    }

    it("is not swollen by a host's rules for every div", () => {
      const doc = frame(
        'div { padding: 4px; border: 3px solid; margin: 2px; height: 20px; min-height: 30px; box-sizing: border-box; }'
      )
      expect(measured(doc)).toBe('1')
    })

    it('measures again after a measurement of 0, and keeps the first it can make', () => {
      const doc = frame('')
      doc.body.style.display = 'none'
      // Nothing is laid out, so nothing can be measured: 1 stands in.
      expect(measured(doc)).toBe('1')
      doc.body.style.display = ''
      // Text drawn three times as tall, as a browser minimum of 3px would draw it.
      doc.body.style.transform = 'scale(3)'
      expect(measured(doc)).toBe('3')
      doc.body.style.transform = ''
      expect(measured(doc)).toBe('3')
    })
  })

  it('keeps each span over its item whatever --min-font-size the layer carries', async () => {
    // A browser minimum cannot be switched on here; the compensation the theme applies for one
    // is checked instead: spans drawn larger and scaled back must land in the same place.
    const { host, container, items, t } = await mount('text-simple', 2)
    container.style.setProperty('--min-font-size', '8')
    expectSpansOverItems(host, container, items, t)
  })

  it('marks right-to-left items and gives each its family', async () => {
    const { container, items, families, content } = await mount('text-rtl', 1)
    const spans = spansIn(container)
    const shown = content.items.flatMap((item, i) =>
      spanned(item.str) ? [families[i]!] : []
    )
    items.forEach((item, i) => {
      expect(spans[i]!.dir).toBe(item.dir === 'rtl' ? 'rtl' : 'ltr')
      expect(spans[i]!.style.fontFamily).toBe(shown[i])
    })
    expect(items.some((item) => item.dir === 'rtl')).toBe(true)
  })

  it('lays a vertical run down its column', async () => {
    const { host, container, items, t } = await mount('text-vertical', 1)
    const i = items.findIndex((item) => item.dir === 'ttb')
    expect(i).toBeGreaterThanOrEqual(0)
    const span = spansIn(container)[i]!
    expect(span.style.getPropertyValue('--rotate')).toBe('90deg')
    expectSpansOverItems(host, container, items, t)
  })

  it('gives no --scale-x to an item that measures 0, and does not throw', async () => {
    const { container, info, t, content } = await mount('text-simple', 1)
    container.replaceChildren()
    expect(() =>
      mountTextSpans({
        content: { page: 0, items: [{ ...content.items[0]!, fontSize: 0 }] },
        info,
        container,
        transform: t,
      })
    ).not.toThrow()
    const [span] = spansIn(container)
    expect(span!.style.getPropertyValue('--scale-x')).toBe('')
    expect(span!.style.fontFamily).toBe('sans-serif')
  })

  it('puts text in as text, never as markup', async () => {
    const { container, info, t, content } = await mount('text-simple', 1)
    container.replaceChildren()
    const str = '<img src=x onerror="throw 1">'
    mountTextSpans({
      content: { page: 0, items: [{ ...content.items[0]!, str }] },
      info,
      container,
      transform: t,
    })
    expect(container.querySelector('img')).toBeNull()
    expect(spansIn(container)[0]!.textContent).toBe(str)
  })
})

/** The items of each line, in order: a line ends at an item with `hasEOL`. */
function lines<T extends { hasEOL: boolean; str: string }>(items: readonly T[]): T[][] {
  const out: T[][] = [[]]
  for (const item of items) {
    out[out.length - 1]!.push(item)
    if (item.hasEOL) out.push([])
  }
  return out.filter((line) => line.some((item) => spanned(item.str)))
}

function select(from: HTMLElement, to: HTMLElement) {
  const range = document.createRange()
  range.setStart(from.firstChild!, 0)
  range.setEnd(to.firstChild!, to.firstChild!.textContent!.length)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

/**
 * Each line's text as a selection of the whole line gives it on PDF.js's own layer, over the
 * same fixtures.
 */
const LINES: Partial<Record<FixtureName, string[]>> = {
  'text-simple': [
    'Page 1',
    'Hello Inkbar. This document exercises text selection.',
    'National Insurance number QQ123456C appears here.',
    'Email: sam.hargreaves@hargreaves-mott.example',
    'The quick brown fox jumps over the lazy dog.',
  ],
  'text-rtl': ['שלום עולם', 'abc שלום 123', 'Latin line in Helvetica'],
  'text-search': [
    'Invoice',
    'A long docu-',
    'ment ends here.',
    'café crème',
    '“quoted” and ‘single’',
    'left column right column',
    'left second line right second line',
    'widely spaced words',
    'kerned word',
    'Hello World',
    'half full',
    'To',
  ],
}

/** Lines PDF.js's layer selects as more than one quad: one per column. */
const QUADS: Record<string, number> = {
  'left column right column': 2,
  'left second line right second line': 2,
}

/**
 * A line's items with text, left to right, split where the gap between two is wider than
 * `mergeLineRects` bridges: 1.5 times the items' median height.
 */
function columnsOf(items: TextItem[]): TextItem[][] {
  const sorted = [...items].sort((a, b) => a.rect.x - b.rect.x)
  const heights = sorted.map((item) => item.rect.height).sort((a, b) => a - b)
  const gap = 1.5 * heights[heights.length >> 1]!
  const out: TextItem[][] = []
  for (const item of sorted) {
    const last = out.at(-1)?.at(-1)
    if (last && item.rect.x - (last.rect.x + last.rect.width) <= gap)
      out.at(-1)!.push(item)
    else out.push([item])
  }
  return out
}

/** The page's spans grouped into lines at each break. */
function lineSpans(container: HTMLElement): HTMLElement[][] {
  const out: HTMLElement[][] = [[]]
  for (const node of container.childNodes) {
    if (node.nodeName === 'BR') out.push([])
    else out.at(-1)!.push(node as HTMLElement)
  }
  return out.filter((line) => line.length > 0)
}

describe('selection over the spans', () => {
  it.each(['text-simple', 'text-rtl', 'text-search'] as const)(
    'gives the quads and the text of each whole line, on %s',
    async (name) => {
      const { host, container, content, t } = await mount(name, 1.5)
      const groups = lines(content.items)
      const spanLines = lineSpans(container)
      expect(spanLines.map((line) => line.length)).toEqual(
        groups.map((line) => line.filter((item) => spanned(item.str)).length)
      )
      const texts: string[] = []
      const counts: number[] = []
      groups.forEach((line, i) => {
        const spans = spanLines[i]!
        select(spans[0]!, spans.at(-1)!)
        const result = getSelectionQuads(host, () => ({ page: 0, transform: t }))
        expect(result).toHaveLength(1)
        texts.push(result[0]!.text)
        // One quad per column the line crosses, each over its column's items.
        const columns = columnsOf(line.filter((item) => item.str.trim() !== ''))
        counts.push(result[0]!.quads.length)
        expect(result[0]!.quads).toHaveLength(columns.length)
        result[0]!.quads.forEach((quad, k) => {
          const got = t.toCssRect(rectFromQuad(quad))
          const want = t.toCssRect(unionRects(columns[k]!.map((item) => item.rect)))
          const allowed = tolerance(want)
          const errors = edgeErrors(
            new DOMRect(got.left, got.top, got.width, got.height),
            want
          )
          for (const error of Object.values(errors))
            expect(error).toBeLessThanOrEqual(allowed)
        })
      })
      expect(texts).toEqual(LINES[name])
      expect(counts).toEqual(LINES[name]!.map((line) => QUADS[line] ?? 1))
    }
  )

  it.each([
    [
      'text-simple',
      0,
      2,
      'Page 1\nHello Inkbar. This document exercises text selection.',
    ],
    ['text-search', 5, 4, 'left column right column\nleft second line right second line'],
  ] as const)(
    'gives a quad per line and column and a line break over two lines, on %s',
    async (name, from, quads, text) => {
      const { host, container, t } = await mount(name, 1)
      const spanLines = lineSpans(container)
      select(spanLines[from]![0]!, spanLines[from + 1]!.at(-1)!)
      const [result] = getSelectionQuads(host, () => ({ page: 0, transform: t }))
      expect(result!.quads).toHaveLength(quads)
      expect(result!.text).toBe(text)
    }
  )
})

/** The span holding a box: the one under its centre. */
function spanUnder(
  spans: DOMRect[],
  left: number,
  top: number,
  width: number,
  height: number
) {
  const cx = left + width / 2
  const cy = top + height / 2
  return spans.find((s) => cx >= s.left && cx <= s.right && cy >= s.top && cy <= s.bottom)
}

describe('search hits over the spans', () => {
  describe.each([
    [1, 0],
    [2, 90],
  ] as const)('at zoom %d, view rotation %d', (zoom, rotation) => {
    it.each(['Invoice', 'document', 'cafe', 'right column', '"quoted"', 'column'])(
      'puts each highlight of %s over the span holding it',
      async (query) => {
        const { doc, host, container, t } = await mount('text-search', zoom, rotation)
        const hits = await doc.search(query, { pages: [0] }).all()
        expect(hits.length).toBeGreaterThan(0)
        const h = host.getBoundingClientRect()
        const spans = spansIn(container).map((s) => s.getBoundingClientRect())
        for (const hit of hits)
          for (const quad of hit.quads) {
            const box = t.toCssRect(rectFromQuad(quad))
            const left = box.left + h.left
            const top = box.top + h.top
            const s = spanUnder(spans, left, top, box.width, box.height)
            expect(s, `a span under ${hit.text}`).toBeDefined()
            const overlap =
              Math.max(
                0,
                Math.min(s!.right, left + box.width) - Math.max(s!.left, left)
              ) *
              Math.max(0, Math.min(s!.bottom, top + box.height) - Math.max(s!.top, top))
            expect(overlap).toBeGreaterThanOrEqual(0.8 * box.width * box.height)
          }
      }
    )
  })
})
