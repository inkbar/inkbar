import themeCss from '@inkbar/theme/theme.css?inline'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { rectFromQuad, unionRects, type Quad, type Rect } from '../model/geometry'

import { getSelectionQuads } from './selection'
import { mountContainer, openFixtureInBrowser } from './test-utils'
import { mountTextSpans } from './text-spans'
import { createPageTransform, type PageTransform, type ViewRotation } from './transform'

import type { InkDocument } from '../model/document'
import type { TextItem } from '../model/text'
import type { FixtureName } from '@inkbar/fixtures/urls'

let style: HTMLStyleElement
beforeAll(() => {
  style = document.createElement('style')
  style.textContent = themeCss
  document.head.append(style)
})
afterAll(() => style.remove())

let cleanup: (() => void)[] = []
afterEach(() => {
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
  const doc = await openFixtureInBrowser(name)
  cleanup.push(() => doc.destroy())
  return doc
}

/** The page's spans, mounted the way the text layer mounts them. */
async function mount(name: FixtureName, zoom: number, rotation: ViewRotation = 0) {
  const doc = await open(name)
  const reader = doc._reader
  const [content, families, baselines, info] = await Promise.all([
    reader.text(0),
    reader.textFamilies(0),
    reader.textBaselines(0),
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
  const layer = mountTextSpans({
    content,
    families,
    baselines,
    info,
    container,
    transform: t,
  })
  const spannedAt = content.items.flatMap((item, i) => (spanned(item.str) ? [i] : []))
  const items = spannedAt.map((i) => content.items[i]!)
  const lines = spannedAt.map((i) =>
    lineBox(content.items[i]!, baselines[i]!, lineAscent(families[i] ?? 'sans-serif'))
  )
  return {
    doc,
    content,
    families,
    baselines,
    info,
    t,
    host,
    container,
    layer,
    items,
    lines,
  }
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
 * The share of a family's line box above the baseline: its ascent over its ascent and descent,
 * as the browser reports them, or three quarters where it reports none.
 */
function lineAscent(family: string): number {
  const context = document.createElement('canvas').getContext('2d')!
  context.font = `30px ${family}`
  const metrics = context.measureText('')
  const ascent = metrics.fontBoundingBoxAscent
  const descent = Math.abs(metrics.fontBoundingBoxDescent)
  return ascent > 0 ? ascent / (ascent + descent) : 0.75
}

/**
 * Where the span's line box goes: one font size high, standing on the run's baseline with
 * `share` of it above.
 */
function lineBox(item: TextItem, baseline: number, share: number): Rect {
  const { p1, p3, p4 } = item.quad
  const height = Math.hypot(p1.x - p3.x, p1.y - p3.y)
  if (!(height > 0) || !Number.isFinite(baseline)) return item.rect
  const up = { x: (p1.x - p3.x) / height, y: (p1.y - p3.y) / height }
  const top = baseline + share * item.fontSize
  const bottom = top - item.fontSize
  const at = (p: { x: number; y: number }, h: number) => ({
    x: p.x + up.x * h,
    y: p.y + up.y * h,
  })
  return rectFromQuad({
    p1: at(p3, top),
    p2: at(p4, top),
    p3: at(p3, bottom),
    p4: at(p4, bottom),
  })
}

/**
 * Every span lies over its item's box, on every edge, within `tolerance`. An item whose line box
 * lies off its box by more than the tolerance cannot: its span is one font size high and stands
 * on the baseline. Such an item is checked against its line box instead, and must be one `tall`
 * names, so no other item escapes the item-box check. Which of them it happens to depends on the
 * browser's font, whose ascent places the line box.
 */
function expectSpansOverItems(
  host: HTMLElement,
  container: HTMLElement,
  items: TextItem[],
  lines: Rect[],
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
    const line = t.toCssRect(lines[i]!)
    const box = t.toCssRect(item.rect)
    const tallItem = Object.values(
      edgeErrors(new DOMRect(line.left, line.top, line.width, line.height), box)
    ).some((error) => error > allowed)
    if (tallItem) shifted.push(item.str)
    const css = tallItem ? line : box
    const expected = { ...css, left: css.left + h.left, top: css.top + h.top }
    for (const [edge, error] of Object.entries(edgeErrors(actual, expected)))
      if (!(error <= allowed))
        misses.push(
          `${JSON.stringify(item.str)} ${edge} off by ${error.toFixed(2)}px (allowed ${allowed.toFixed(2)}px)`
        )
  })
  expect(misses).toEqual([])
  expect(shifted.filter((str) => !tall.includes(str))).toEqual([])
}

/**
 * Items whose line box may lie off their box by more than the tolerance, by fixture: Noto Sans
 * Hebrew's, whose ascent and descent span 1.36 ems.
 */
const TALL: Partial<Record<FixtureName, string[]>> = { 'text-rtl': ['שלום עולם', 'שלום'] }

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
        const { host, container, items, lines, t } = await mount(name, zoom, rotation)
        expect(items.length).toBeGreaterThan(0)
        expectSpansOverItems(host, container, items, lines, t, TALL[name])
      }
    )

    it('stays over each item after an update to zoom 3, keeping its nodes', async () => {
      const { doc, host, container, items, lines, layer } = await mount(name, 1)
      const before = [...container.childNodes]
      const zoomed = createPageTransform(doc.pages[0]!, 3, 0)
      sizeHost(host, zoomed)
      layer.update(zoomed)
      const after = [...container.childNodes]
      expect(after).toHaveLength(before.length)
      after.forEach((node, i) => expect(node).toBe(before[i]))
      expectSpansOverItems(host, container, items, lines, zoomed, TALL[name])
    })

    it('stays over each item after an update that turns the view', async () => {
      const { doc, host, container, items, lines, layer } = await mount(name, 1)
      const before = [...container.childNodes]
      const turned = createPageTransform(doc.pages[0]!, 2, 90)
      sizeHost(host, turned)
      layer.update(turned)
      ;[...container.childNodes].forEach((node, i) => expect(node).toBe(before[i]))
      expectSpansOverItems(host, container, items, lines, turned, TALL[name])
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
    const { host, container, items, lines, t } = await mount('text-simple', 2)
    container.style.setProperty('--min-font-size', '8')
    expectSpansOverItems(host, container, items, lines, t)
  })

  it("stands each span on its baseline with the browser font's share of the line above", async () => {
    const { host, container, lines, families, t } = await mount('text-simple', 3)
    // Not the share used where the browser gives no figures, or this would pin nothing.
    expect(Math.abs(lineAscent(families[0]!) - 0.75)).toBeGreaterThan(0.02)
    const origin = host.getBoundingClientRect()
    const spans = [...container.querySelectorAll('span')]
    expect(spans.length).toBeGreaterThan(0)
    spans.forEach((span, i) => {
      const got = span.getBoundingClientRect()
      const want = t.toCssRect(lines[i]!)
      expect(Math.abs(got.top - origin.top - want.top)).toBeLessThan(0.75)
      expect(Math.abs(got.height - want.height)).toBeLessThan(0.75)
    })
  })

  it('puts three quarters of the line above where the browser gives no font figures', async () => {
    // Widths only, and any will do: this test looks at where the spans stand, not how wide.
    vi.spyOn(CanvasRenderingContext2D.prototype, 'measureText').mockImplementation(
      (text: string) => ({ width: text.length * 10 }) as TextMetrics
    )
    const { host, container, lines, t } = await mount('text-simple', 3)
    vi.restoreAllMocks()
    // `lines` were worked out under the same mock, so with three quarters.
    const origin = host.getBoundingClientRect()
    const spans = [...container.querySelectorAll('span')]
    spans.forEach((span, i) => {
      const got = span.getBoundingClientRect()
      expect(Math.abs(got.top - origin.top - t.toCssRect(lines[i]!).top)).toBeLessThan(
        0.75
      )
    })
    expect(spans.length).toBeGreaterThan(0)
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
    const { host, container, items, lines, t } = await mount('text-vertical', 1)
    const i = items.findIndex((item) => item.dir === 'ttb')
    expect(i).toBeGreaterThanOrEqual(0)
    const span = spansIn(container)[i]!
    expect(span.style.getPropertyValue('--rotate')).toBe('90deg')
    expectSpansOverItems(host, container, items, lines, t)
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

/**
 * How far a selection quad reaches past its items' boxes across the line, as fractions of their
 * largest font size: above the top and below the bottom. Negative where it falls short.
 */
function margins(quad: Quad, items: TextItem[]): { top: number; bottom: number } {
  const size = Math.max(...items.map((item) => item.fontSize))
  const box = unionRects(items.map((item) => item.rect))
  const got = rectFromQuad(quad)
  return {
    top: (got.y + got.height - (box.y + box.height)) / size,
    bottom: (box.y - got.y) / size,
  }
}

/**
 * How far, as a fraction of the font size, a selection may fall short of its items' boxes across
 * the line. The selection is the CSS fallback font's text, one font size of line box with the
 * font's own ascent and descent (C em in all) centred on it, and the line box stands on the
 * baseline with the font's share of it above. With Liberation Sans (C about 1.1) it reaches
 * 0.148 above Helvetica's box and 0.022 below, measured here at 14 pt, and stops 0.006 short of
 * the top of the Japanese lines on `unembedded-japanese`.
 */
const ACROSS = 0.02

/**
 * Lines in Noto Sans Hebrew, whose ascent (1.068 em) reaches above the CSS font's text: their
 * selection may stop short of the box's top, which the test below bounds.
 */
const SHORT = ['שלום עולם', 'abc שלום 123']

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
        // One quad per column the line crosses, each over its column's items along the line
        // and, but on a line `SHORT` lists, holding them across it within `ACROSS` of the size.
        const columns = columnsOf(line.filter((item) => item.str.trim() !== ''))
        counts.push(result[0]!.quads.length)
        expect(result[0]!.quads).toHaveLength(columns.length)
        result[0]!.quads.forEach((quad, k) => {
          const got = t.toCssRect(rectFromQuad(quad))
          const items = columns[k]!
          const along = t.toCssRect(unionRects(items.map((item) => item.rect)))
          const allowed = tolerance(along)
          expect(Math.abs(got.left - along.left)).toBeLessThanOrEqual(allowed)
          expect(
            Math.abs(got.left + got.width - (along.left + along.width))
          ).toBeLessThanOrEqual(allowed)
          if (SHORT.includes(result[0]!.text)) return
          const { top, bottom } = margins(quad, items)
          expect(top).toBeGreaterThanOrEqual(-ACROSS)
          expect(bottom).toBeGreaterThanOrEqual(-ACROSS)
        })
      })
      expect(texts).toEqual(LINES[name])
      expect(counts).toEqual(LINES[name]!.map((line) => QUADS[line] ?? 1))
    }
  )

  it("may stop short of the box's top on a font taller than the CSS font's text, on text-rtl", async () => {
    // Noto Sans Hebrew's ascent is 1.068 em; the selection is the CSS fallback font's text. With
    // Liberation Sans it stops 0.187 em short of the box's top and 0.069 em short of its bottom. Bounds,
    // not that value, so another machine's fallback font passes: the top no more than 0.4 em
    // short, the quad over the baseline and up to 0.6 em above it, the bottom no more than 0.1 em
    // short of the box's bottom.
    const { host, container, content, baselines, t } = await mount('text-rtl', 1.5)
    const groups = lines(content.items)
    const spanLines = lineSpans(container)
    const seen: string[] = []
    groups.forEach((line, i) => {
      const spans = spanLines[i]!
      select(spans[0]!, spans.at(-1)!)
      const [result] = getSelectionQuads(host, () => ({ page: 0, transform: t }))
      if (!SHORT.includes(result!.text)) return
      seen.push(result!.text)
      expect(result!.quads).toHaveLength(1)
      const items = line.filter((item) => item.str.trim() !== '')
      const quad = result!.quads[0]!
      const { top, bottom } = margins(quad, items)
      expect(top).toBeGreaterThanOrEqual(-0.4)
      expect(bottom).toBeGreaterThanOrEqual(-0.1)
      // The text is level, so its baseline is a height on the page.
      const first = items[0]!
      const baseline = first.quad.p3.y + baselines[content.items.indexOf(first)]!
      const size = Math.max(...items.map((item) => item.fontSize))
      const got = rectFromQuad(quad)
      expect(got.y).toBeLessThanOrEqual(baseline)
      expect(got.y + got.height).toBeGreaterThanOrEqual(baseline + 0.6 * size)
    })
    expect(seen).toEqual(SHORT)
  })

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
