import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { cssRectsToUserRects, getSelectionQuads } from './selection'
import { mountContainer, openFixtureInBrowser } from './test-utils'
import { createTextLayer } from './text-layer'
import { createPageTransform, type PageTransform, type ViewRotation } from './transform'

/**
 * Test-only stand-in for the theme's text layer CSS (the theme ships it later). Copied from
 * `pdfjs-dist/web/pdf_viewer.css`: the `.pdfViewer .page` scale-rounding variables, the
 * `.textLayer` container rules (line-height, transform-origin, text-scale variables), its
 * `:is(span, br)` and `> :not(.markedContent)` span rules, and the `[data-main-rotation]`
 * transforms. Cosmetic rules (highlights, selection colours) are left out.
 */
const TEXT_LAYER_CSS = `
.ink-text-layer {
  --scale-round-x: 1px;
  --scale-round-y: 1px;
  text-align: initial;
  line-height: 1;
  letter-spacing: normal;
  word-spacing: normal;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  --min-font-size: 1;
  --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
  --min-font-size-inv: calc(1 / var(--min-font-size));
}
.ink-text-layer :is(span, br) {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
}
.ink-text-layer > :not(.markedContent),
.ink-text-layer .markedContent span:not(.markedContent) {
  --font-height: 0;
  font-size: calc(var(--text-scale-factor) * var(--font-height));
  --scale-x: 1;
  --rotate: 0deg;
  transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}
.ink-text-layer .markedContent { display: contents; }
.ink-text-layer[data-main-rotation="90"] { transform: rotate(90deg) translateY(-100%); }
.ink-text-layer[data-main-rotation="180"] { transform: rotate(180deg) translate(-100%, -100%); }
.ink-text-layer[data-main-rotation="270"] { transform: rotate(270deg) translateX(-100%); }
`

let style: HTMLStyleElement
beforeAll(() => {
  style = document.createElement('style')
  style.textContent = TEXT_LAYER_CSS
  document.head.append(style)
})
afterAll(() => style.remove())

const cleanup: (() => void)[] = []
afterEach(() => {
  window.getSelection()?.removeAllRanges()
  cleanup.splice(0).forEach((f) => f())
})

function sizeHost(host: HTMLElement, t: PageTransform) {
  host.style.width = `${t.cssWidth}px`
  host.style.height = `${t.cssHeight}px`
  host.style.setProperty('--scale-factor', String(t.zoom))
  host.style.setProperty('--total-scale-factor', String(t.zoom))
}

async function layer(
  name: 'text-simple' | 'text-rotated-90',
  zoom: number,
  rotation: ViewRotation = 0
) {
  const doc = await openFixtureInBrowser(name)
  const t = createPageTransform(doc.pages[0]!, zoom, rotation)
  const host = mountContainer(t.cssWidth, t.cssHeight)
  host.dataset.page = '0'
  sizeHost(host, t)
  const tl = createTextLayer({ document: doc, page: 0, host, transform: t })
  cleanup.push(() => (tl.destroy(), doc.destroy(), host.remove()))
  await tl.ready
  return { doc, host, t, tl }
}

function spanWith(host: HTMLElement, text: string): HTMLElement {
  const spans = [...host.querySelectorAll<HTMLElement>('[data-ink-text-layer] span')]
  const span = spans.find((s) => s.textContent?.includes(text))
  if (!span) throw new Error(`no span containing ${text}`)
  return span
}

function selectAllIn(el: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

/** Selects the NI line and returns its single user-space quad. */
function niQuad(host: HTMLElement, t: PageTransform) {
  selectAllIn(spanWith(host, 'QQ123456C'))
  const result = getSelectionQuads(host, () => ({ page: 0, transform: t }))
  expect(result).toHaveLength(1)
  expect(result[0]!.page).toBe(0)
  expect(result[0]!.text).toContain('QQ123456C')
  expect(result[0]!.quads).toHaveLength(1)
  return result[0]!.quads[0]!
}

/** The NI line on `text-simple` and `text-rotated-90`: x 72→412.34, baseline 652, Helvetica 14. */
function expectNiLine(q: ReturnType<typeof niQuad>) {
  expect(Math.abs(q.p3.x - 72)).toBeLessThanOrEqual(2)
  expect(Math.abs(q.p4.x - 412.34)).toBeLessThanOrEqual(3)
  expect(q.p3.y).toBeGreaterThan(645)
  expect(q.p3.y).toBeLessThan(655)
  expect(q.p1.y).toBeGreaterThan(660)
  expect(q.p1.y).toBeLessThan(670)
}

describe('text layer', () => {
  it('builds the DOM contract', async () => {
    const { host, tl } = await layer('text-simple', 1)
    const el = host.querySelector<HTMLElement>('div.ink-text-layer[data-ink-text-layer]')
    expect(el).toBe(tl.element)
    expect(el!.style.position).toBe('absolute')
    expect(el!.style.userSelect).toBe('text')
  })

  it('mounts spans positioned over the glyphs', async () => {
    const { host, t } = await layer('text-simple', 1)
    const r = spanWith(host, 'QQ123456C').getBoundingClientRect()
    const h = host.getBoundingClientRect()
    const user = t.fromCss({ x: r.left - h.left, y: r.bottom - h.top })
    expect(Math.abs(user.x - 72)).toBeLessThanOrEqual(2)
    // span bottom sits a descent below the 652 baseline
    expect(user.y).toBeGreaterThan(645)
    expect(user.y).toBeLessThan(655)
  })

  it('maps a selection to a user-space quad on the right line', async () => {
    const { host, t } = await layer('text-simple', 1)
    expectNiLine(niQuad(host, t))
  })

  it('reports the same user-space quad on a /Rotate 90 page at zoom 1 and 2 (Review Focus 2)', async () => {
    const one = await layer('text-rotated-90', 1)
    const q1 = niQuad(one.host, one.t)
    expectNiLine(q1)
    const two = await layer('text-rotated-90', 2)
    const q2 = niQuad(two.host, two.t)
    expectNiLine(q2)
    for (const k of ['p1', 'p2', 'p3', 'p4'] as const) {
      expect(Math.abs(q2[k].x - q1[k].x)).toBeLessThanOrEqual(2)
      expect(Math.abs(q2[k].y - q1[k].y)).toBeLessThanOrEqual(2)
    }
  })

  it('merges a multi-line selection into one quad per line', async () => {
    const { host, t } = await layer('text-simple', 1.5)
    const range = document.createRange()
    range.setStart(spanWith(host, 'Hello').firstChild!, 0)
    const ni = spanWith(host, 'QQ123456C').firstChild!
    range.setEnd(ni, ni.textContent!.length)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    const [entry] = getSelectionQuads(host, () => ({ page: 0, transform: t }))
    expect(entry!.quads).toHaveLength(2)
    // top line first: baseline 676 above baseline 652
    expect(entry!.quads[0]!.p3.y).toBeGreaterThan(entry!.quads[1]!.p1.y - 1)
    expect(entry!.text).toContain('Hello')
    expect(entry!.text).toContain('QQ123456C')
  })

  it('returns nothing for a collapsed selection or text outside a text layer', async () => {
    const { host, t } = await layer('text-simple', 1)
    expect(getSelectionQuads(host, () => ({ page: 0, transform: t }))).toEqual([])
    const outside = document.createElement('p')
    outside.textContent = 'not a page'
    document.body.append(outside)
    cleanup.push(() => outside.remove())
    selectAllIn(outside)
    expect(getSelectionQuads(host, () => ({ page: 0, transform: t }))).toEqual([])
  })

  it('cssRectsToUserRects converts viewport rects relative to the host and skips empty ones', async () => {
    const { host, t } = await layer('text-simple', 2)
    const h = host.getBoundingClientRect()
    const rects = cssRectsToUserRects(
      [new DOMRect(h.left + 144, h.top + 184, 20, 10), new DOMRect(h.left, h.top, 0, 5)],
      host,
      t
    )
    expect(rects).toHaveLength(1)
    expect(rects[0]!.x).toBeCloseTo(72)
    expect(rects[0]!.y).toBeCloseTo(792 - 92 - 5)
    expect(rects[0]!.width).toBeCloseTo(10)
    expect(rects[0]!.height).toBeCloseTo(5)
  })

  it('update repositions spans for a new zoom', async () => {
    const { host, tl, doc } = await layer('text-simple', 1)
    const zoomed = createPageTransform(doc.pages[0]!, 2, 0)
    tl.update(zoomed)
    sizeHost(host, zoomed)
    await tl.ready
    const span = host.querySelector<HTMLElement>('[data-ink-text-layer] span')!
    expect(
      span.getBoundingClientRect().left - host.getBoundingClientRect().left
    ).toBeCloseTo(144, -1)
    expectNiLine(niQuad(host, zoomed))
  })
})
