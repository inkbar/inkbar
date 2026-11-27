import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { cssRectsToUserRects, getSelectionQuads } from './selection'
import { mountContainer, openFixtureInBrowser, TEXT_LAYER_CSS } from './test-utils'
import { createTextLayer, type TextLayerOptions } from './text-layer'
import { createPageTransform, type PageTransform, type ViewRotation } from './transform'

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
  host.style.setProperty('--total-scale-factor', String(t.scale))
}

async function layer(
  name: 'text-simple' | 'text-rotated-90' | 'userunit-2',
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

  it('reports the same user-space quad on a /UserUnit 2 page as on text-simple', async () => {
    const plain = await layer('text-simple', 1)
    const q1 = niQuad(plain.host, plain.t)
    const unit = await layer('userunit-2', 1)
    expect(unit.t.scale).toBe(2)
    expect(unit.host.style.getPropertyValue('--total-scale-factor')).toBe('2')
    const q2 = niQuad(unit.host, unit.t)
    expectNiLine(q2)
    for (const k of ['p1', 'p2', 'p3', 'p4'] as const) {
      expect(Math.abs(q2[k].x - q1[k].x)).toBeLessThanOrEqual(1)
      expect(Math.abs(q2[k].y - q1[k].y)).toBeLessThanOrEqual(1)
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
  it('keeps the line break between selected lines in the text', async () => {
    const { host, t } = await layer('text-simple', 1)
    const range = document.createRange()
    range.setStart(spanWith(host, 'Hello'), 0)
    const ni = spanWith(host, 'QQ123456C')
    range.setEnd(ni, ni.childNodes.length)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    const [result] = getSelectionQuads(host, () => ({ page: 0, transform: t }))
    expect(result!.text).toMatch(
      /^Hello Inkbar\.[^\n]*\nNational Insurance number QQ123456C/
    )
  })

  it('never rejects ready when onError throws, and rethrows asynchronously', async () => {
    const doc = await openFixtureInBrowser('text-simple')
    const t = createPageTransform(doc.pages[0]!, 1, 0)
    const host = mountContainer(t.cssWidth, t.cssHeight)
    sizeHost(host, t)
    doc.destroy()
    const rethrown: unknown[] = []
    const original = globalThis.queueMicrotask.bind(globalThis)
    const spy = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((cb) => {
      original(() => {
        try {
          cb()
        } catch (e) {
          rethrown.push(e)
        }
      })
    })
    const boom = new Error('host bug')
    const tl = createTextLayer({
      document: doc,
      page: 0,
      host,
      transform: t,
      onError: () => {
        throw boom
      },
    })
    cleanup.push(() => (spy.mockRestore(), tl.destroy(), host.remove()))
    await expect(tl.ready).resolves.toBeUndefined()
    await new Promise((r) => setTimeout(r, 0))
    expect(rethrown).toEqual([boom])
  })
  it('keeps a blank line (two breaks) in selected text', async () => {
    const { host, t } = await layer('text-simple', 1)
    const layerEl = host.querySelector<HTMLElement>('[data-ink-text-layer]')!
    const a = spanWith(host, 'Hello')
    const b = spanWith(host, 'QQ123456C')
    // Stand-in for a paragraph gap: PDF.js emits a <br> per end of line.
    const fixture = document.createElement('div')
    fixture.append(
      a.cloneNode(true),
      document.createElement('br'),
      document.createElement('br'),
      b.cloneNode(true)
    )
    layerEl.replaceChildren(...fixture.childNodes)
    selectAllIn(layerEl)
    const [result] = getSelectionQuads(host, () => ({ page: 0, transform: t }))
    expect(result!.text).toMatch(/^Hello[^\n]*\n\nNational Insurance number QQ123456C/)
  })
})

describe("text layer, from the engine reader's text", () => {
  async function engineLayer(opts: Partial<TextLayerOptions> = {}) {
    const doc = await openFixtureInBrowser('text-simple')
    const t = createPageTransform(doc.pages[0]!, 1, 0)
    const host = mountContainer(t.cssWidth, t.cssHeight)
    host.dataset.page = '0'
    sizeHost(host, t)
    cleanup.push(() => (doc.destroy(), host.remove()))
    const start = () => {
      const tl = createTextLayer({ document: doc, page: 0, host, transform: t, ...opts })
      cleanup.unshift(() => tl.destroy())
      return tl
    }
    return { doc, host, t, start }
  }

  it('mounts the spans and calls onRendered', async () => {
    const onRendered = vi.fn()
    const onError = vi.fn()
    const { host, t, start } = await engineLayer({ onRendered, onError })
    const tl = start()
    await tl.ready
    expect(onError).not.toHaveBeenCalled()
    expect(onRendered).toHaveBeenCalledTimes(1)
    expect(tl.element.querySelectorAll('span').length).toBeGreaterThan(0)
    expectNiLine(niQuad(host, t))
  })

  it('leaves nothing behind when destroyed before the text arrives', async () => {
    const onRendered = vi.fn()
    const onError = vi.fn()
    const { doc, start } = await engineLayer({ onRendered, onError })
    const real = doc._reader.text.bind(doc._reader)
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    vi.spyOn(doc._reader, 'text').mockImplementation(async (page, options) => {
      await held
      return real(page, options)
    })
    const tl = start()
    tl.destroy()
    release()
    await tl.ready
    await new Promise((r) => setTimeout(r, 0))
    expect(tl.element.childNodes).toHaveLength(0)
    expect(tl.element.isConnected).toBe(false)
    expect(onError).not.toHaveBeenCalled()
    expect(onRendered).not.toHaveBeenCalled()
  })

  it('cancels its text read when destroyed, and reports nothing', async () => {
    const onRendered = vi.fn()
    const onError = vi.fn()
    const { doc, start } = await engineLayer({ onRendered, onError })
    const reader = doc._reader
    const text = vi.spyOn(reader, 'text')
    const families = vi.spyOn(reader, 'textFamilies')
    const tl = start()
    const textSignal = text.mock.calls[0]![1]!.signal!
    const familiesSignal = families.mock.calls[0]![1]!
    expect([textSignal.aborted, familiesSignal.aborted]).toEqual([false, false])
    tl.destroy()
    expect([textSignal.aborted, familiesSignal.aborted]).toEqual([true, true])
    await tl.ready
    await expect(text.mock.results[0]!.value).rejects.toBeDefined()
    expect(onError).not.toHaveBeenCalled()
    expect(onRendered).not.toHaveBeenCalled()
    // The read was the layer's alone, so the page reads again in full for the next one.
    const again = start()
    await again.ready
    expect(again.element.querySelectorAll('span').length).toBeGreaterThan(0)
  })

  it('reports a failed read once and mounts on the next update', async () => {
    const onRendered = vi.fn()
    const onError = vi.fn()
    const { doc, t, start } = await engineLayer({ onRendered, onError })
    const boom = new Error('no text')
    vi.spyOn(doc._reader, 'text').mockRejectedValueOnce(boom)
    const tl = start()
    await tl.ready
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(boom)
    expect(tl.element.childNodes).toHaveLength(0)
    tl.update(t)
    await tl.ready
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onRendered).toHaveBeenCalledTimes(1)
    expect(tl.element.querySelectorAll('span').length).toBeGreaterThan(0)
  })

  it('applies an update without rebuilding the spans', async () => {
    const onRendered = vi.fn()
    const { doc, host, start } = await engineLayer({ onRendered })
    const tl = start()
    await tl.ready
    const before = [...tl.element.childNodes]
    const zoomed = createPageTransform(doc.pages[0]!, 2, 0)
    sizeHost(host, zoomed)
    tl.update(zoomed)
    await tl.ready
    expect(onRendered).toHaveBeenCalledTimes(2)
    expect([...tl.element.childNodes]).toEqual(before)
    tl.element.childNodes.forEach((node, i) => expect(node).toBe(before[i]))
    expectNiLine(niQuad(host, zoomed))
  })

  it('builds the spans from a module graph without PDF.js', async () => {
    const sources = import.meta.glob<string>('/src/**/*.ts', {
      query: '?raw',
      import: 'default',
    })
    const seen = new Set<string>()
    const bare: string[] = []
    const visit = async (path: string): Promise<void> => {
      if (seen.has(path)) return
      seen.add(path)
      const load = sources[path]
      expect(load, path).toBeDefined()
      const source = await load!()
      const specifiers = [
        ...source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?['"]([^'"]+)['"]/g),
        ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
      ].map((m) => m[1]!)
      for (const spec of specifiers) {
        if (!spec.startsWith('.')) {
          bare.push(spec)
          continue
        }
        const base = new URL(spec, `http://source${path}`).pathname
        const next = [`${base}.ts`, `${base}/index.ts`, base].find((p) => p in sources)
        expect(next, `${spec} from ${path}`).toBeDefined()
        await visit(next!)
      }
    }
    await visit('/src/dom/text-spans.ts')
    expect([...seen].filter((p) => p.includes('/pdfjs/'))).toEqual([])
    expect(bare.filter((spec) => spec.includes('pdfjs'))).toEqual([])
    expect(seen.size).toBeGreaterThan(1)
  })
})
