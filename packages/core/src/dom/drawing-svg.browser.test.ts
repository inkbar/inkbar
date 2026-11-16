import { describe, expect, it } from 'vitest'

import { staticDefaults } from '../model/annotations/defaults'
import { createAnnotationStore } from '../model/annotations/store'

import { itemElement, paintDrawing } from './drawing-svg'
import { renderAnnotationContent } from './overlay-render'
import { renderReferenceContent } from './reference-render'
import { mountContainer } from './test-utils'
import { FONT_STACKS } from './text-fonts'
import { createPageTransform } from './transform'

import type { DrawItem, Drawing, Paint } from '../model/annotations/drawing/types'
import type { PageInfo } from '../model/pages'

const page: PageInfo = {
  index: 0,
  box: { x: 0, y: 0, width: 612, height: 792 },
  rotate: 0,
  userUnit: 1,
  width: 612,
  height: 792,
}
const box = { left: 0, top: 0, width: 612, height: 792 }
const fill: Paint = { fill: { color: '#f00' } }

const drawing = (...items: DrawItem[]): Drawing => ({
  layer: 'annotation',
  bounds: { x: 0, y: 0, width: 612, height: 792 },
  items,
})

function paint(d: Drawing, zoom = 2, rotation: 0 | 90 = 0): HTMLElement {
  const el = document.createElement('div')
  paintDrawing(el, d, createPageTransform(page, zoom, rotation), box)
  return el
}

describe('paintDrawing', () => {
  it('a single group puts its opacity on the svg and emits children directly', () => {
    const el = paint(
      drawing({
        kind: 'group',
        opacity: 0.5,
        items: [
          {
            kind: 'polygon',
            points: [
              { x: 100, y: 692 },
              { x: 200, y: 692 },
              { x: 200, y: 592 },
            ],
            paint: fill,
          },
        ],
      })
    )
    const svg = el.querySelector('svg')!
    expect(svg.getAttribute('opacity')).toBe('0.5')
    expect(el.querySelector('g')).toBeNull()
    expect(svg.children).toHaveLength(1)
    expect(svg.firstElementChild!.tagName).toBe('polygon')
  })

  it('a nested group becomes a g with its own opacity', () => {
    const el = paint(
      drawing(
        { kind: 'rect', rect: { x: 0, y: 0, width: 1, height: 1 }, paint: fill },
        {
          kind: 'group',
          opacity: 0.25,
          items: [
            { kind: 'rect', rect: { x: 0, y: 0, width: 1, height: 1 }, paint: fill },
          ],
        }
      )
    )
    expect(el.querySelector('svg')!.hasAttribute('opacity')).toBe(false)
    expect(el.querySelector('g')!.getAttribute('opacity')).toBe('0.25')
  })

  it('a polygon is emitted in CSS px', () => {
    const el = paint(
      drawing({
        kind: 'polygon',
        points: [
          { x: 100, y: 692 },
          { x: 200, y: 692 },
          { x: 200, y: 592 },
        ],
        paint: fill,
      })
    )
    expect(el.querySelector('polygon')!.getAttribute('points')).toBe(
      '200,200 400,200 400,400'
    )
  })

  it('subtracts the origin from every point', () => {
    const el = document.createElement('div')
    paintDrawing(
      el,
      drawing({
        kind: 'polyline',
        points: [{ x: 100, y: 692 }],
        paint: { stroke: { color: '#000', width: 1 } },
      }),
      createPageTransform(page, 2, 0),
      { left: 150, top: 50, width: 100, height: 100 }
    )
    expect(el.querySelector('polyline')!.getAttribute('points')).toBe('50,150')
  })

  it('sizes the svg by the box it is given, not by the drawing bounds', () => {
    const el = document.createElement('div')
    const d = drawing({
      kind: 'polyline',
      points: [{ x: 0, y: 0 }],
      paint: { stroke: { color: '#000', width: 1 } },
    })
    paintDrawing(el, d, createPageTransform(page, 1, 0), {
      left: 0,
      top: 0,
      width: 212,
      height: 12,
    })
    const svg = el.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 212 12')
    expect(svg.getAttribute('width')).toBe('212')
    expect(svg.getAttribute('height')).toBe('12')
  })

  it('every top-level shape takes presses on what it paints', () => {
    const rect = { x: 0, y: 0, width: 1, height: 1 }
    const el = paint(
      drawing(
        { kind: 'rect', rect, paint: fill },
        { kind: 'group', opacity: 0.5, items: [{ kind: 'rect', rect, paint: fill }] }
      )
    )
    for (const child of el.querySelector('svg')!.children) {
      expect(child.getAttribute('pointer-events')).toBe('visiblePainted')
    }
  })

  it('stroke width and dashes scale with zoom', () => {
    const el = paint(
      drawing({
        kind: 'polyline',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        paint: { stroke: { color: '#000', width: 2, dashes: [3, 3] } },
      })
    )
    const line = el.querySelector('polyline')!
    expect(line.getAttribute('stroke-width')).toBe('4')
    expect(line.getAttribute('stroke-dasharray')).toBe('6 6')
    expect(line.getAttribute('fill')).toBe('none')
    expect(line.hasAttribute('stroke-linejoin')).toBe(false)
    expect(line.hasAttribute('stroke-linecap')).toBe(false)
  })

  it('roles become the overlay class names', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 }
    const el = paint(
      drawing(
        {
          kind: 'path',
          role: 'stroke',
          commands: [{ op: 'M', to: { x: 0, y: 0 } }],
          paint: fill,
        },
        { kind: 'path', role: 'ending-head', commands: [{ op: 'Z' }], paint: fill },
        { kind: 'path', role: 'ending-tail', commands: [{ op: 'Z' }], paint: fill },
        { kind: 'ellipse', role: 'loupe-rim', rect, paint: fill },
        { kind: 'rect', role: 'box', rect, paint: fill }
      )
    )
    expect(el.querySelector('.ink-stroke')).not.toBeNull()
    expect(el.querySelector('[data-ending="head"]')).not.toBeNull()
    expect(el.querySelector('[data-ending="tail"]')).not.toBeNull()
    const rim = el.querySelector('.ink-loupe-rim')!
    expect(rim.tagName).toBe('circle')
    expect(rim.getAttribute('r')).toBe('10')
    expect(el.querySelector('[data-ink-part="box"]')!.tagName).toBe('rect')
  })

  it('an ellipse is an ellipse, and a rect keeps its radius', () => {
    const rect = { x: 0, y: 0, width: 10, height: 20 }
    const el = paint(
      drawing(
        { kind: 'ellipse', rect, paint: fill },
        { kind: 'rect', rect, radius: 3, paint: fill }
      )
    )
    expect(el.querySelector('ellipse')!.getAttribute('rx')).toBe('10')
    expect(el.querySelector('rect')!.getAttribute('rx')).toBe('6')
  })

  const arc: DrawItem = {
    kind: 'path',
    commands: [
      { op: 'M', to: { x: 0, y: 0 } },
      { op: 'A', rx: 10, ry: 5, largeArc: false, sweep: true, to: { x: 20, y: 0 } },
    ],
    paint: fill,
  }

  it('an arc keeps its radii and flips its sweep', () => {
    expect(paint(drawing(arc)).querySelector('path')!.getAttribute('d')).toContain(
      'A20 10 0 0 0'
    )
  })

  it('at rotation 90 an arc swaps its radii', () => {
    expect(paint(drawing(arc), 2, 90).querySelector('path')!.getAttribute('d')).toContain(
      'A10 20'
    )
  })

  it('no attribute ever contains NaN', () => {
    expect(() =>
      paint(
        drawing({
          kind: 'polygon',
          points: [{ x: Number.NaN, y: 0 }],
          paint: fill,
        })
      )
    ).toThrow(RangeError)
    expect(() =>
      paint(
        drawing({
          kind: 'polygon',
          points: [{ x: Number.NaN, y: 0 }],
          paint: fill,
        })
      )
    ).toThrow(/polygon/)
  })

  it('a page item is skipped: the lens is not an svg element', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 }
    const el = paint(
      drawing(
        {
          kind: 'page',
          source: r,
          target: r,
          clip: { center: { x: 5, y: 5 }, radius: 5 },
        },
        { kind: 'group', opacity: 0.5, items: [{ kind: 'rect', rect: r, paint: fill }] }
      )
    )
    expect(el.querySelector('svg')!.getAttribute('opacity')).toBe('0.5')
    expect(el.querySelectorAll('rect')).toHaveLength(1)
  })

  it('a non-finite group opacity makes the svg throw a RangeError', () => {
    expect(() =>
      paint(
        drawing({
          kind: 'group',
          opacity: Number.NaN,
          items: [
            { kind: 'rect', rect: { x: 0, y: 0, width: 1, height: 1 }, paint: fill },
          ],
        })
      )
    ).toThrow(RangeError)
  })

  it('a non-finite box makes the svg throw a RangeError', () => {
    const el = document.createElement('div')
    expect(() =>
      paintDrawing(el, drawing(), createPageTransform(page, 1, 0), {
        left: 0,
        top: 0,
        width: Number.NaN,
        height: 1,
      })
    ).toThrow(RangeError)
  })
})

describe('renderAnnotationContent', () => {
  it('still uses the reference renderer for a type with no description', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const a = store.add({
      type: 'highlight',
      page: 0,
      rect: { x: 72, y: 695, width: 228, height: 20 },
      quads: [
        {
          p1: { x: 72, y: 715 },
          p2: { x: 300, y: 715 },
          p3: { x: 72, y: 695 },
          p4: { x: 300, y: 695 },
        },
      ],
    })
    const t = createPageTransform(page, 1, 0)
    const viaDispatch = document.createElement('div')
    const direct = document.createElement('div')
    renderAnnotationContent(viaDispatch, a, t)
    renderReferenceContent(direct, a, t)
    expect(viaDispatch.innerHTML).toBe(direct.innerHTML)
    expect(viaDispatch.querySelector('polygon')).not.toBeNull()
  })
})

describe('itemElement', () => {
  it('turns one rect into an element placed like the painter places it', () => {
    const item: DrawItem = {
      kind: 'rect',
      rect: { x: 100, y: 600, width: 80, height: 40 },
      radius: 6,
      paint: { stroke: { color: '#f00', width: 2 } },
    }
    const t = createPageTransform(page, 2, 0)
    const at = t.toCssRect(item.rect)
    const el = itemElement(document, item, t, {
      left: at.left - 10,
      top: at.top - 10,
      width: at.width + 20,
      height: at.height + 20,
    })
    expect(el.tagName).toBe('rect')
    expect(el.getAttribute('x')).toBe('10')
    expect(el.getAttribute('y')).toBe('10')
    expect(el.getAttribute('width')).toBe(String(at.width))
    expect(el.getAttribute('rx')).toBe('12')
    expect(el.getAttribute('stroke-width')).toBe('4')
  })
})

describe('a stamp', () => {
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAYAAAAfFcSJAAAAEklEQVR4nGP4z8Dwn4GBgQEAFAADAX4GBkIAAAAASUVORK5CYII='
  const rect = { x: 100, y: 600, width: 80, height: 40 }
  const stampAt = (rotation?: 0 | 90, opacity = 1) =>
    createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    }).add({
      type: 'stamp',
      page: 0,
      rect,
      imagedata: PNG,
      opacity,
      ...(rotation === undefined ? {} : { rotation }),
    })

  it('is an svg image with the stamp class, the data URL and the opacity on the svg', () => {
    const a = stampAt(undefined, 0.5)
    const el = document.createElement('div')
    renderAnnotationContent(el, a, createPageTransform(page, 2, 0))
    const svg = el.querySelector(':scope > svg')!
    expect(svg.getAttribute('opacity')).toBe('0.5')
    const image = svg.querySelector('image.ink-stamp')!
    expect(image.getAttribute('href')).toBe(PNG)
    expect(image.getAttribute('preserveAspectRatio')).toBe('none')
    expect(el.querySelector('img')).toBeNull()
  })

  it('takes a press on a transparent pixel inside its box', () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 20
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#c00'
    ctx.fillRect(10, 0, 10, 20)
    const a = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    }).add({
      type: 'stamp',
      page: 0,
      rect: { x: 100, y: 600, width: 80, height: 40 },
      imagedata: canvas.toDataURL('image/png'),
    })
    const t = createPageTransform(page, 2, 0)
    const at = t.toCssRect(a.rect)
    const host = mountContainer(1400, 1400)
    const el = document.createElement('div')
    el.style.cssText = `position:absolute;left:${at.left}px;top:${at.top}px;width:${at.width}px;height:${at.height}px;`
    host.append(el)
    renderAnnotationContent(el, a, t)
    const hit = (dx: number, dy: number): Element | null =>
      document.elementFromPoint(
        host.getBoundingClientRect().left + at.left + dx,
        host.getBoundingClientRect().top + at.top + dy
      )
    // The left half of the picture is transparent.
    expect(el.contains(hit(at.width * 0.25, at.height / 2))).toBe(true)
    expect(el.contains(hit(at.width * 0.75, at.height / 2))).toBe(true)
    // The press lands on the hit rect even when the image takes none.
    el.querySelector('image')!.setAttribute('pointer-events', 'none')
    expect(hit(at.width * 0.25, at.height / 2)).toBe(
      el.querySelector('rect[data-ink-hit-area]')
    )
    host.remove()
  })

  it('has an image and a hit rect over its on-screen box', () => {
    for (const pageRotate of [0, 90] as const) {
      for (const rotation of [0, 90] as const) {
        const t = createPageTransform({ ...page, rotate: pageRotate }, 2, 0)
        const a = stampAt(rotation)
        const host = mountContainer(1400, 1400)
        const at = t.toCssRect(a.rect)
        const el = document.createElement('div')
        el.style.cssText = `position:absolute;left:${at.left}px;top:${at.top}px;width:${at.width}px;height:${at.height}px;`
        host.append(el)
        renderAnnotationContent(el, a, t)
        const image = el.querySelector('image.ink-stamp')!.getBoundingClientRect()
        const hit = el.querySelector('rect[data-ink-hit-area]')!.getBoundingClientRect()
        host.remove()
        expect(el.querySelectorAll('image, rect')).toHaveLength(2)
        for (const k of ['left', 'top', 'width', 'height'] as const) {
          expect(hit[k]).toBeCloseTo(image[k], 0)
        }
        expect(el.querySelector('rect')!.getAttribute('stroke')).toBe('none')
      }
    }
  })

  it('still throws for an image item with a non-finite geometry', () => {
    for (const rect of [
      { x: Number.NaN, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 1 },
    ]) {
      expect(() => paint(drawing({ kind: 'image', data: 'x', rect, angle: 0 }))).toThrow(
        RangeError
      )
    }
  })

  it('paints image data that happens to spell NaN', () => {
    const data = 'data:image/png;base64,NaNInfinity'
    const el = paint(
      drawing({
        kind: 'image',
        data,
        rect: { x: 0, y: 0, width: 1, height: 1 },
        angle: 0,
      })
    )
    expect(el.querySelector('image')!.getAttribute('href')).toBe(data)
  })

  for (const pageRotate of [0, 90] as const) {
    for (const view of [0, 90] as const) {
      for (const rotation of [0, 90] as const) {
        it(`has the reference box at page rotate ${pageRotate}, view ${view}, stamp rotation ${rotation}`, () => {
          const info: PageInfo = { ...page, rotate: pageRotate }
          const t = createPageTransform(info, 2, view)
          const a = stampAt(rotation)
          const host = mountContainer(1400, 1400)
          const at = t.toCssRect(a.rect)
          const place = (el: HTMLElement): void => {
            el.style.cssText = `position:absolute;left:${at.left}px;top:${at.top}px;width:${at.width}px;height:${at.height}px;`
            host.append(el)
          }
          const ref = document.createElement('div')
          const next = document.createElement('div')
          place(ref)
          place(next)
          renderReferenceContent(ref, a, t)
          renderAnnotationContent(next, a, t)
          const want = ref.querySelector('img.ink-stamp')!.getBoundingClientRect()
          const got = next.querySelector('image.ink-stamp')!.getBoundingClientRect()
          host.remove()
          expect(got.left).toBeCloseTo(want.left, 0)
          expect(got.top).toBeCloseTo(want.top, 0)
          expect(got.width).toBeCloseTo(want.width, 0)
          expect(got.height).toBeCloseTo(want.height, 0)
        })
      }
    }
  }
})

describe('a text', () => {
  const font = { family: 'Helvetica', bold: false, italic: false } as const
  const text = (extra: Partial<Extract<DrawItem, { kind: 'text' }>> = {}): DrawItem => ({
    kind: 'text',
    role: 'text',
    lines: [
      { text: 'Hello world', origin: { x: 100, y: 700 }, width: 60 },
      { text: 'second', origin: { x: 100, y: 685.6 }, width: 30 },
    ],
    font,
    size: 12,
    color: '#0a0b0c',
    angle: 0,
    outsideStandardFonts: false,
    clip: { rect: { x: 100, y: 680, width: 150, height: 30 }, radius: 4 },
    ...extra,
  })
  const texts = (el: Element) => [...el.querySelectorAll<SVGTextElement>('text')]

  it('is one text element per line in a clipped group, set to the line width', () => {
    const el = paint(drawing(text()), 2)
    const g = el.querySelector('g[data-ink-part="text"]')!
    expect(g.parentElement).toBe(el.querySelector('svg'))
    const [first, second] = texts(g)
    expect(first!.textContent).toBe('Hello world')
    expect(second!.textContent).toBe('second')
    // Zoom 2: 100 pt across, 792 - 700 = 92 pt down.
    expect(first!.getAttribute('x')).toBe('200')
    expect(first!.getAttribute('y')).toBe('184')
    expect(first!.getAttribute('font-size')).toBe('24')
    expect(first!.getAttribute('fill')).toBe('#0a0b0c')
    expect(first!.getAttribute('font-weight')).toBe('normal')
    expect(first!.getAttribute('font-style')).toBe('normal')
    expect(first!.getAttribute('textLength')).toBe('120')
    expect(first!.getAttribute('lengthAdjust')).toBe('spacing')
    expect(first!.getAttribute('style')).toBe('font-kerning:none;white-space:pre')
    expect(first!.getAttribute('font-family')).toBe(FONT_STACKS.Helvetica)
    expect(second!.getAttribute('y')).toBe(String(2 * (792 - 685.6)))
    const clip = el.querySelector(`clipPath${g.getAttribute('clip-path')!.slice(4, -1)}`)!
    const rect = clip.querySelector('rect')!
    expect(rect.getAttribute('x')).toBe('200')
    expect(rect.getAttribute('y')).toBe(String(2 * (792 - 710)))
    expect(rect.getAttribute('width')).toBe('300')
    expect(rect.getAttribute('height')).toBe('60')
    expect(rect.getAttribute('rx')).toBe('8')
  })

  it('names the font stack of each family, and its weight and style', () => {
    for (const family of ['Times', 'Courier'] as const) {
      const el = paint(drawing(text({ font: { family, bold: true, italic: true } })), 1)
      const t = texts(el)[0]!
      expect(t.getAttribute('font-family')).toBe(FONT_STACKS[family])
      expect(t.getAttribute('font-weight')).toBe('bold')
      expect(t.getAttribute('font-style')).toBe('italic')
      // The stack the browser computes is the stack named.
      const mount = mountContainer(612, 792)
      mount.append(el)
      expect(getComputedStyle(t).fontFamily).toBe(FONT_STACKS[family])
      mount.remove()
    }
  })

  it('turns with the view, and with the page it is laid out for', () => {
    const turned = (angle: 0 | 90, rotation: 0 | 90): string | null => {
      const el = document.createElement('div')
      const t = createPageTransform({ ...page, rotate: angle }, 1, rotation)
      paintDrawing(el, drawing(text({ angle })), t, box)
      return texts(el)[0]!.getAttribute('transform')
    }
    // Upright for the page as the file shows it: no turn of its own.
    expect(turned(0, 0)).toBeNull()
    expect(turned(90, 0)).toBeNull()
    // The view turns the text with the page.
    expect(turned(0, 90)).toMatch(/^rotate\(90 /)
    expect(turned(90, 90)).toMatch(/^rotate\(90 /)
  })

  it('draws an underline 0.1 of the size below the baseline, 0.05 thick', () => {
    const el = paint(drawing(text({ underline: true })), 2)
    const [rule] = el.querySelectorAll('line')
    expect(Number(rule!.getAttribute('y1'))).toBeCloseTo(184 + 0.1 * 24, 3)
    expect(rule!.getAttribute('y2')).toBe(rule!.getAttribute('y1'))
    expect(rule!.getAttribute('x1')).toBe('200')
    expect(rule!.getAttribute('x2')).toBe('320')
    expect(rule!.getAttribute('stroke')).toBe('#0a0b0c')
    expect(Number(rule!.getAttribute('stroke-width'))).toBeCloseTo(0.05 * 24, 3)
    expect(el.querySelectorAll('line')).toHaveLength(2)
  })

  it('a line with tabs is one text per piece, each at its own point', () => {
    const el = paint(
      drawing(
        text({
          lines: [
            {
              text: 'a\tb',
              origin: { x: 100, y: 700 },
              width: 14,
              segments: [
                { text: 'a', origin: { x: 100, y: 700 } },
                { text: 'b', origin: { x: 148, y: 700 } },
              ],
            },
          ],
        })
      ),
      1
    )
    const pieces = texts(el)
    expect(pieces.map((p) => p.textContent)).toEqual(['a', 'b'])
    expect(pieces.map((p) => p.getAttribute('x'))).toEqual(['100', '148'])
    expect(pieces.every((p) => !p.hasAttribute('textLength'))).toBe(true)
  })

  it('a justified line adds its word spacing, and a no-break space gets none', () => {
    const content = 'aa bb\u00a0cc dd'
    const wordSpacing = 10
    const plain = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    const host = mountContainer(400, 100)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    host.append(svg)
    svg.append(plain)
    plain.setAttribute('font-family', FONT_STACKS.Helvetica)
    plain.setAttribute('font-size', '20')
    plain.setAttribute('style', 'font-kerning:none;white-space:pre')
    plain.textContent = content
    const natural = plain.getComputedTextLength()
    const before = plain.getStartPositionOfChar(6).x
    host.remove()

    const el = paint(
      drawing(
        text({
          size: 20,
          lines: [
            // Two U+0020 in the line: the justified width is the natural one plus two gaps.
            { text: content, origin: { x: 0, y: 700 }, width: natural, wordSpacing },
          ],
        })
      ),
      1
    )
    const t = texts(el)[0]!
    expect(t.getAttribute('word-spacing')).toBe('10')
    expect(Number(t.getAttribute('textLength'))).toBeCloseTo(natural + 2 * wordSpacing, 2)
    const mount = mountContainer(612, 792)
    mount.append(el)
    const svgEl = el.querySelector('svg')!
    svgEl.setAttribute('style', 'position:absolute;left:0;top:0')
    // The "c" after the no-break space sits one gap (the space after "aa") past where it sits
    // with no spacing, not two.
    const at = t.getStartPositionOfChar(6).x
    const end = t.getComputedTextLength()
    mount.remove()
    expect(at - before).toBeCloseTo(wordSpacing, 0)
    expect(end).toBeCloseTo(natural + 2 * wordSpacing, 0)
  })

  it('has no lines, so no group of lines and no clip', () => {
    const el = paint(drawing(text({ lines: [] })))
    expect(el.querySelector('text')).toBeNull()
    expect(el.querySelector('clipPath')).toBeNull()
  })

  it('takes no presses of its own', () => {
    const el = paint(drawing(text({ underline: true })))
    for (const t of el.querySelectorAll('text, line'))
      expect(t.getAttribute('pointer-events')).toBe('none')
  })

  it('two texts never share a clip path', () => {
    const el = paint(drawing(text(), text()))
    const ids = [...el.querySelectorAll('clipPath')].map((c) => c.id)
    expect(new Set(ids).size).toBe(2)
  })
})
