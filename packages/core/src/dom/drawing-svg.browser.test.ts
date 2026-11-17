import { describe, expect, it } from 'vitest'

import { staticDefaults } from '../model/annotations/defaults'
import { createAnnotationStore } from '../model/annotations/store'

import { itemElement, paintDrawing } from './drawing-svg'
import { renderAnnotationContent } from './overlay-render'
import { mountContainer } from './test-utils'
import { checkTextFonts } from './text-font-check'
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

  it("a lone group's role is kept on the svg", () => {
    const el = paint(
      drawing({
        kind: 'group',
        opacity: 0.5,
        role: 'box',
        items: [{ kind: 'rect', rect: { x: 0, y: 0, width: 1, height: 1 }, paint: fill }],
      })
    )
    expect(el.querySelector('svg')!.getAttribute('data-ink-part')).toBe('box')
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
  const store = () =>
    createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
  const t = createPageTransform(page, 1, 0)

  it('paints a type with a drawing as an svg of its shapes', () => {
    const a = store().add({
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
    const el = document.createElement('div')
    renderAnnotationContent(el, a, t)
    expect(el.querySelector('svg.ink-annotation-shape polygon')).not.toBeNull()
  })

  it('leaves the element empty for a type with no drawing', () => {
    const a = {
      ...store().add({
        type: 'square',
        page: 0,
        rect: { x: 72, y: 695, width: 228, height: 20 },
      }),
      type: 'popup' as never,
    }
    const el = document.createElement('div')
    el.append(document.createElement('span'))
    renderAnnotationContent(el, a, t)
    expect(el.childNodes).toHaveLength(0)
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
    // The opacity is on the svg alone: on the image too it would be applied twice.
    expect(image.hasAttribute('opacity')).toBe(false)
    expect(image.getAttribute('style') ?? '').not.toContain('opacity')
    expect(image.parentElement).toBe(svg)
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
        it(`covers the stamp's rect on screen at page rotate ${pageRotate}, view ${view}, stamp rotation ${rotation}`, () => {
          const info: PageInfo = { ...page, rotate: pageRotate }
          const t = createPageTransform(info, 2, view)
          const a = stampAt(rotation)
          const host = mountContainer(1400, 1400)
          const at = t.toCssRect(a.rect)
          const el = document.createElement('div')
          el.style.cssText = `position:absolute;left:${at.left}px;top:${at.top}px;width:${at.width}px;height:${at.height}px;`
          host.append(el)
          renderAnnotationContent(el, a, t)
          const got = el.querySelector('image.ink-stamp')!.getBoundingClientRect()
          const origin = host.getBoundingClientRect()
          host.remove()
          // The 80 x 40 pt rect at zoom 2 is 160 x 80 px upright and 80 x 160 turned a quarter
          // by the page and the view together.
          const turned = (pageRotate + view) % 180 === 90
          expect(got.left - origin.left).toBeCloseTo(at.left, 0)
          expect(got.top - origin.top).toBeCloseTo(at.top, 0)
          expect(got.width).toBeCloseTo(turned ? 80 : 160, 0)
          expect(got.height).toBeCloseTo(turned ? 160 : 80, 0)
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
      { text: 'Hello world', origin: { x: 100, y: 700 }, width: 60, outside: false },
      { text: 'second', origin: { x: 100, y: 685.6 }, width: 30, outside: false },
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
    // Font and colour are inline style as well, so a host's rule on the text does not restyle it.
    expect(first!.getAttribute('style')).toBe(
      `font-kerning:none;white-space:pre;font-family:${FONT_STACKS.Helvetica};font-size:24px;font-weight:normal;font-style:normal;fill:#0a0b0c;stroke:none;text-anchor:start;dominant-baseline:alphabetic;letter-spacing:0;word-spacing:0;text-decoration:none`
    )
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

  it("draws each line's underline rule from the description, between its two points", () => {
    const rule = { from: { x: 100, y: 698.8 }, to: { x: 160, y: 698.8 }, thickness: 0.6 }
    const el = paint(
      drawing(
        text({
          lines: [
            {
              text: 'Hello world',
              origin: { x: 100, y: 700 },
              width: 60,
              outside: false,
              underline: rule,
            },
            { text: 'second', origin: { x: 100, y: 685.6 }, width: 30, outside: false },
          ],
        })
      ),
      2
    )
    const rules = el.querySelectorAll('line')
    expect(rules).toHaveLength(1)
    const r = rules[0]!
    expect(r.getAttribute('x1')).toBe('200')
    expect(r.getAttribute('x2')).toBe('320')
    expect(Number(r.getAttribute('y1'))).toBeCloseTo(2 * (792 - 698.8), 3)
    expect(r.getAttribute('y2')).toBe(r.getAttribute('y1'))
    expect(r.getAttribute('stroke')).toBe('#0a0b0c')
    expect(Number(r.getAttribute('stroke-width'))).toBeCloseTo(1.2, 3)
    // On a view turned 90 the same rule runs down the screen with no transform of its own.
    const turned = paint(
      drawing(
        text({
          lines: [
            {
              text: 'a',
              origin: { x: 100, y: 700 },
              width: 60,
              outside: false,
              underline: rule,
            },
          ],
        })
      ),
      1,
      90
    )
    const t = turned.querySelector('line')!
    expect(t.getAttribute('x1')).toBe(t.getAttribute('x2'))
    expect(t.hasAttribute('transform')).toBe(false)
  })

  it('a host rule on the text elements cannot restyle them', () => {
    const el = paint(
      drawing(
        text({
          lines: [{ text: 'Hi', origin: { x: 100, y: 700 }, width: 10, outside: false }],
        })
      ),
      1
    )
    const style = document.createElement('style')
    style.textContent =
      'text { font-family: cursive; fill: red; font-size: 40px }\nsvg text { text-anchor: middle; letter-spacing: 2px; stroke: red; word-spacing: 9px; text-decoration: line-through; dominant-baseline: hanging }'
    document.head.append(style)
    const host = mountContainer(612, 792)
    host.append(el)
    const t = el.querySelector('text')!
    const cs = getComputedStyle(t)
    const result = [
      cs.fill,
      cs.fontSize,
      cs.fontFamily,
      cs.textAnchor,
      cs.letterSpacing,
      cs.stroke,
      cs.wordSpacing,
      cs.textDecorationLine,
      cs.dominantBaseline,
    ]
    host.remove()
    style.remove()
    expect(result).toEqual([
      'rgb(10, 11, 12)',
      '12px',
      FONT_STACKS.Helvetica,
      'start',
      'normal',
      'none',
      '0px',
      'none',
      'alphabetic',
    ])
  })

  it('every created element is checked for a non-finite value', () => {
    for (const bad of [
      text({
        lines: [{ text: 'a', origin: { x: Number.NaN, y: 1 }, width: 1, outside: false }],
      }),
      text({ clip: { rect: { x: 0, y: 0, width: Number.NaN, height: 1 } } }),
      text({
        lines: [
          {
            text: 'a',
            origin: { x: 1, y: 1 },
            width: 1,
            outside: false,
            underline: {
              from: { x: 0, y: 0 },
              to: { x: Number.NaN, y: 0 },
              thickness: 1,
            },
          },
        ],
      }),
    ])
      expect(() => paint(drawing(bad))).toThrow(RangeError)
  })

  it('a line with tabs is one text per piece, each at its own point and its own width', () => {
    const el = paint(
      drawing(
        text({
          lines: [
            {
              text: 'a\tb',
              origin: { x: 100, y: 700 },
              width: 14,
              outside: false,
              segments: [
                { text: 'a', origin: { x: 100, y: 700 }, width: 6.5, outside: false },
                { text: 'b', origin: { x: 148, y: 700 }, width: 7, outside: false },
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
    expect(pieces.map((p) => p.getAttribute('textLength'))).toEqual(['6.5', '7'])
  })

  it('a piece with a character outside the standard fonts is not forced to its width, and one with spaces adds the word spacing', () => {
    const el = paint(
      drawing(
        text({
          lines: [
            {
              text: 'a b\t日',
              origin: { x: 100, y: 700 },
              width: 30,
              outside: true,
              wordSpacing: 2,
              segments: [
                { text: 'a b', origin: { x: 100, y: 700 }, width: 16, outside: false },
                { text: '日', origin: { x: 148, y: 700 }, width: 12, outside: true },
              ],
            },
          ],
        })
      ),
      1
    )
    const [first, second] = texts(el)
    expect(first!.getAttribute('textLength')).toBe('18')
    expect(second!.hasAttribute('textLength')).toBe(false)
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
            {
              text: content,
              origin: { x: 0, y: 700 },
              width: natural,
              outside: false,
              wordSpacing,
            },
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

  it('with no lines it draws no text and no clip', () => {
    const el = paint(drawing(text({ lines: [] })))
    expect(el.querySelector('text')).toBeNull()
    expect(el.querySelector('clipPath')).toBeNull()
  })

  it('takes no presses of its own', () => {
    const el = paint(
      drawing(
        text({
          lines: [
            {
              text: 'Hi',
              origin: { x: 100, y: 700 },
              width: 10,
              outside: false,
              underline: {
                from: { x: 100, y: 699 },
                to: { x: 110, y: 699 },
                thickness: 1,
              },
            },
          ],
        })
      )
    )
    expect(el.querySelectorAll('text, line')).toHaveLength(2)
    for (const t of el.querySelectorAll('text, line'))
      expect(t.getAttribute('pointer-events')).toBe('none')
  })

  it('two texts never share a clip path', () => {
    const el = paint(drawing(text(), text()))
    const ids = [...el.querySelectorAll('clipPath')].map((c) => c.id)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('text outside the standard fonts', () => {
  const store = () =>
    createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })

  /** Where the browser puts `content` in a left-aligned box: the left and right of its characters. */
  function htmlExtent(
    content: string,
    size: number,
    align: 'left' | 'right' | 'center' = 'left'
  ): { left: number; right: number } {
    const host = mountContainer(612, 200)
    const div = document.createElement('div')
    div.style.cssText = `position:absolute;left:0;top:0;width:400px;white-space:pre-wrap;line-height:1.2;text-align:${align};font:${size}px ${FONT_STACKS.Helvetica};font-kerning:none`
    div.textContent = content
    host.append(div)
    const range = document.createRange()
    range.selectNodeContents(div)
    const r = range.getBoundingClientRect()
    const out = {
      left: r.left - host.getBoundingClientRect().left,
      right: r.right - host.getBoundingClientRect().left,
    }
    host.remove()
    return out
  }

  /** Draws `content` as a text box line at zoom 1 and returns its text element, in a mounted page. */
  function drawn(content: string, align: 'left' | 'right' | 'center' = 'left') {
    const a = store().add({
      type: 'freetext',
      page: 0,
      rect: { x: 100, y: 700, width: 400, height: 40 },
      contents: content,
      defaultStyle: { fontSize: 12, textAlign: align },
    })
    const host = mountContainer(612, 792)
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;left:100px;top:52px;width:400px;height:40px'
    host.append(el)
    renderAnnotationContent(el, a, createPageTransform(page, 1, 0))
    return {
      el,
      host,
      text: el.querySelector<SVGTextElement>('g[data-ink-part="text"] > text')!,
    }
  }

  it("an Arabic line is drawn at the browser's own advance and is not stretched to the layout", () => {
    const content = 'مرحبا بالعالم'
    const { host, text } = drawn(content)
    const advance = text.getComputedTextLength()
    const html = htmlExtent(content, 12)
    host.remove()
    // No forced length: the estimate the layout has for a shaped script is not the font's.
    expect(text.hasAttribute('textLength')).toBe(false)
    expect(text.hasAttribute('lengthAdjust')).toBe(false)
    const own = html.right - html.left
    expect(Math.abs(advance - own) / own).toBeLessThan(0.03)
  })

  it('a line of Latin text is still set to its width', () => {
    const { host, text } = drawn('Hello world')
    host.remove()
    expect(text.hasAttribute('textLength')).toBe(true)
  })

  it('an Arabic line starts and ends where the browser puts it in a left-aligned box', () => {
    const content = 'مرحبا بالعالم'
    const { host, text } = drawn(content)
    const ctm = text.getScreenCTM()!
    const origin = host.getBoundingClientRect()
    const n = text.getNumberOfChars()
    const xs = Array.from({ length: n }, (_, i) => text.getExtentOfChar(i))
    const left = Math.min(...xs.map((r) => r.x))
    const right = Math.max(...xs.map((r) => r.x + r.width))
    const html = htmlExtent(content, 12)
    host.remove()
    const inPage = (x: number) => x * ctm.a + ctm.e - origin.left
    // The drawing's own frame starts at the box's left edge (100 px).
    expect(Math.abs(inPage(left) - 100 - html.left)).toBeLessThan(1)
    expect(Math.abs(inPage(right) - 100 - html.right)).toBeLessThan(1)
  })

  it('a Hebrew line, and a line mixing Latin and Arabic, sit in the same extent as the browser puts them', () => {
    for (const content of ['שלום עולם', 'Order 42 مرحبا بالعالم and more']) {
      const { host, text } = drawn(content)
      const ctm = text.getScreenCTM()!
      const origin = host.getBoundingClientRect()
      const xs = Array.from({ length: text.getNumberOfChars() }, (_, i) =>
        text.getExtentOfChar(i)
      )
      const left = Math.min(...xs.map((r) => r.x))
      const right = Math.max(...xs.map((r) => r.x + r.width))
      const html = htmlExtent(content, 12)
      host.remove()
      expect(Math.abs(left * ctm.a + ctm.e - origin.left - 100 - html.left)).toBeLessThan(
        1
      )
      expect(
        Math.abs(right * ctm.a + ctm.e - origin.left - 100 - html.right)
      ).toBeLessThan(Math.max(1, (html.right - html.left) * 0.03))
    }
  })

  for (const align of ['right', 'center'] as const)
    it(`Arabic and Hebrew lines in a ${align}-aligned box sit where the browser puts them`, () => {
      for (const content of ['مرحبا بالعالم', 'שלום עולם']) {
        const { host, text } = drawn(content, align)
        const ctm = text.getScreenCTM()!
        const origin = host.getBoundingClientRect()
        const xs = Array.from({ length: text.getNumberOfChars() }, (_, i) =>
          text.getExtentOfChar(i)
        )
        const left = Math.min(...xs.map((r) => r.x)) * ctm.a + ctm.e - origin.left - 100
        const right =
          Math.max(...xs.map((r) => r.x + r.width)) * ctm.a + ctm.e - origin.left - 100
        const html = htmlExtent(content, 12, align)
        host.remove()
        console.log(
          `[rtl] ${align} ${content}: left ${(left - html.left).toFixed(2)}, right ${(right - html.right).toFixed(2)}`
        )
        expect(Math.abs(left - html.left)).toBeLessThan(1)
        expect(Math.abs(right - html.right)).toBeLessThan(1)
      }
    })
})

describe('the width a line of standard-font text is set to', () => {
  const fonts = checkTextFonts()

  it.skipIf(fonts.mode !== 'exact')(
    "is the width the browser's own font gives it, where the fonts are the tables'",
    () => {
      const store = createAnnotationStore({
        mode: { mode: 'uncontrolled' },
        defaults: staticDefaults,
      })
      const paragraph =
        'The quick brown fox jumps over the lazy dog, and then a second sentence follows it.\nA short line.'
      let longest = 0
      for (const defaultStyle of [
        {},
        { fontWeight: 'bold' as const },
        { fontStyle: 'italic' as const },
        { fontFamily: 'Times' as const },
        { fontFamily: 'Courier' as const, fontWeight: 'bold' as const },
      ]) {
        const a = store.add({
          type: 'freetext',
          page: 0,
          rect: { x: 100, y: 600, width: 200, height: 90 },
          contents: paragraph,
          defaultStyle,
        })
        const host = mountContainer(612, 792)
        const el = document.createElement('div')
        el.style.cssText =
          'position:absolute;left:200px;top:204px;width:400px;height:180px'
        host.append(el)
        renderAnnotationContent(el, a, createPageTransform(page, 2, 0))
        const lines = [...el.querySelectorAll<SVGTextElement>('text[textLength]')]
        expect(lines.length).toBeGreaterThan(2)
        for (const text of lines) {
          const set = Number(text.getAttribute('textLength'))
          const clone = text.cloneNode(true) as SVGTextElement
          clone.removeAttribute('textLength')
          clone.removeAttribute('lengthAdjust')
          text.parentElement!.append(clone)
          const natural = clone.getComputedTextLength()
          clone.remove()
          longest = Math.max(longest, Math.abs(natural - set) / set)
        }
        host.remove()
      }
      // The real cases are within 0.09%; a wrong table or font is off by several percent.
      expect(longest).toBeLessThan(0.002)
    }
  )
})

describe('where a dashed rect or ellipse starts', () => {
  const dashed: Paint = { stroke: { color: '#000', width: 4, dashes: [10, 10] } }
  /** True when the stroke of the one shape painted covers the user-space point `p`. */
  function covers(
    item: DrawItem,
    [pageRotate, rotation]: readonly [0 | 90, 0 | 90 | 270],
    p: { x: number; y: number }
  ) {
    const t = createPageTransform({ ...page, rotate: pageRotate }, 1, rotation)
    const el = document.createElement('div')
    document.body.append(el)
    try {
      paintDrawing(el, drawing(item), t, box)
      const shape = el.querySelector<SVGGeometryElement>('svg > *')!
      const c = t.toCss(p)
      return shape.isPointInStroke(new DOMPoint(c.x, c.y))
    } finally {
      el.remove()
    }
  }

  for (const rotation of [
    [0, 0],
    [0, 90],
    [90, 0],
    [90, 270],
  ] as const) {
    it(`a rect starts at its top-left as the page is displayed unturned and runs along the top, at /Rotate ${rotation[0]} and view rotation ${rotation[1]}`, () => {
      const rect = { x: 100, y: 600, width: 100, height: 65 }
      const item: DrawItem = { kind: 'rect', rect, paint: dashed }
      // The first dash covers 0 to 10 along the top edge, then a gap to 20.
      expect(covers(item, rotation, { x: 105, y: 665 })).toBe(true)
      expect(covers(item, rotation, { x: 115, y: 665 })).toBe(false)
      expect(covers(item, rotation, { x: 125, y: 665 })).toBe(true)
      // Up the left edge, 270 along the walk (100 top, 65 right, 100 bottom): in a dash.
      expect(covers(item, rotation, { x: 100, y: 605 })).toBe(true)
    })

    it(`a rounded rect starts at the end of its top-left arc at /Rotate ${rotation[0]} and view rotation ${rotation[1]}`, () => {
      const rect = { x: 100, y: 600, width: 100, height: 65 }
      const item: DrawItem = { kind: 'rect', rect, radius: 10, paint: dashed }
      expect(covers(item, rotation, { x: 115, y: 665 })).toBe(true)
      expect(covers(item, rotation, { x: 125, y: 665 })).toBe(false)
    })

    it(`an ellipse starts at its rightmost point and runs clockwise as displayed, at /Rotate ${rotation[0]} and view rotation ${rotation[1]}`, () => {
      const rect = { x: 100, y: 600, width: 90, height: 90 }
      const item: DrawItem = { kind: 'ellipse', rect, paint: dashed }
      const on = (arc: number) => ({
        x: 145 + 45 * Math.cos(arc / 45),
        y: 645 - 45 * Math.sin(arc / 45),
      })
      expect(covers(item, rotation, on(5))).toBe(true)
      expect(covers(item, rotation, on(15))).toBe(false)
      expect(covers(item, rotation, on(25))).toBe(true)
    })
  }
})

describe('a thin rounded dashed rect', () => {
  it('has the same corner at view rotation 0 and 90', () => {
    const rect = { x: 100, y: 600, width: 80, height: 10 }
    const item: DrawItem = {
      kind: 'rect',
      rect,
      radius: 5,
      paint: { stroke: { color: '#000', width: 2, dashes: [4, 2] } },
    }
    const straight = paint(drawing(item), 1, 0).querySelector('rect')!
    const turned = paint(drawing(item), 1, 90).querySelector('path')!
    expect(Number(straight.getAttribute('rx'))).toBe(5)
    // Every corner arc of the path has that radius, both ways.
    const radii = [...turned.getAttribute('d')!.matchAll(/A([\d.]+) ([\d.]+)/g)].map(
      (m) => [Number(m[1]), Number(m[2])]
    )
    expect(radii).toHaveLength(4)
    for (const r of radii) expect(r).toEqual([5, 5])
  })
})
