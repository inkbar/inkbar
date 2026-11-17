import { describe, expect, test, vi } from 'vitest'

import { arcToCubics } from '../arc'

import { num } from './operators'
import { paintDrawing, UnpaintableError } from './paint'

import type { Drawing, DrawItem, Paint, PathCommand } from '../types'

const bounds = { x: 0, y: 0, width: 100, height: 100 }
const helpers = { page: 0 }
const drawing = (...items: DrawItem[]): Drawing => ({
  layer: 'annotation',
  bounds,
  items,
})
const text = (a: { content: Uint8Array }): string => new TextDecoder().decode(a.content)
const paintOf = async (...items: DrawItem[]) => {
  const a = await paintDrawing(drawing(...items), helpers)
  return { a, content: text(a) }
}

const box = { x: 10, y: 20, width: 30, height: 40 }
const both: Paint = {
  fill: { color: '#ff0000' },
  stroke: { color: '#0000ff', width: 2 },
}
const boxPath = '10 60 m\n40 60 l\n40 20 l\n10 20 l\nh'

describe('shapes', () => {
  test('a filled and stroked rect starts at its top-left and runs clockwise', async () => {
    const { content, a } = await paintOf({ kind: 'rect', rect: box, paint: both })
    expect(content).toBe(`q\n1 0 0 rg\n0 0 1 RG\n2 w\n${boxPath}\nB\nQ`)
    expect(a.bounds).toEqual(bounds)
    expect(a.opacities).toBeUndefined()
    expect(a.forms).toBeUndefined()
  })

  test('dashes, join and cap are written', async () => {
    const { content } = await paintOf({
      kind: 'rect',
      rect: box,
      paint: {
        ...both,
        stroke: {
          color: '#0000ff',
          width: 2,
          dashes: [3, 1],
          join: 'round',
          cap: 'round',
        },
      },
    })
    expect(content).toBe(
      `q\n1 0 0 rg\n0 0 1 RG\n2 w\n1 j\n1 J\n[3 1] 0 d\n${boxPath}\nB\nQ`
    )
  })

  test('a polyline is stroked and open, a polygon is closed', async () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]
    const stroke = { color: '#000000', width: 1 }
    const line = await paintOf({ kind: 'polyline', points, paint: { stroke } })
    expect(line.content).toBe('q\n0 0 0 RG\n1 w\n0 0 m\n10 0 l\n10 10 l\nS\nQ')
    const shape = await paintOf({ kind: 'polygon', points, paint: { stroke } })
    expect(shape.content).toBe('q\n0 0 0 RG\n1 w\n0 0 m\n10 0 l\n10 10 l\nh\nS\nQ')
  })

  test('an even-odd path ends f*, and with a stroke B*', async () => {
    const commands: PathCommand[] = [
      { op: 'M', to: { x: 0, y: 0 } },
      { op: 'L', to: { x: 5, y: 0 } },
      { op: 'L', to: { x: 5, y: 5 } },
      { op: 'Z' },
    ]
    const filled = await paintOf({
      kind: 'path',
      commands,
      fillRule: 'evenodd',
      paint: { fill: { color: '#000000' } },
    })
    expect(filled.content).toBe('q\n0 0 0 rg\n0 0 m\n5 0 l\n5 5 l\nh\nf*\nQ')
    const both2 = await paintOf({
      kind: 'path',
      commands,
      fillRule: 'evenodd',
      paint: { fill: { color: '#000000' }, stroke: { color: '#000000', width: 1 } },
    })
    expect(both2.content.endsWith('\nB*\nQ')).toBe(true)
  })

  test('a nonzero path fills with f and is not closed unless it says so', async () => {
    const { content } = await paintOf({
      kind: 'path',
      commands: [
        { op: 'M', to: { x: 0, y: 0 } },
        { op: 'C', c1: { x: 1, y: 2 }, c2: { x: 3, y: 4 }, to: { x: 5, y: 6 } },
      ],
      paint: { fill: { color: '#000000' } },
    })
    expect(content).toBe('q\n0 0 0 rg\n0 0 m\n1 2 3 4 5 6 c\nf\nQ')
  })

  test('an ellipse starts at its rightmost point, towards -y, in four curves', async () => {
    const { content } = await paintOf({
      kind: 'ellipse',
      rect: { x: 0, y: 0, width: 20, height: 10 },
      paint: { fill: { color: '#000000' } },
    })
    const lines = content.split('\n')
    expect(lines[2]).toBe('20 5 m')
    const curves = lines.filter((l) => l.endsWith(' c'))
    expect(curves).toHaveLength(4)
    const first = curves[0]!.split(' ').map(Number)
    // The first curve heads down from the rightmost point.
    expect(first[0]).toBe(20)
    expect(first[1]!).toBeLessThan(5)
    expect(first[4]).toBeCloseTo(10, 3)
    expect(first[5]).toBeCloseTo(0, 3)
    const last = curves[3]!.split(' ').map(Number)
    expect(last[4]).toBeCloseTo(20, 3)
    expect(last[5]).toBeCloseTo(5, 3)
    expect(lines.slice(-3)).toEqual(['h', 'f', 'Q'])
  })

  test('a rounded rect starts at (x + radius, y + height)', async () => {
    const { content } = await paintOf({
      kind: 'rect',
      rect: box,
      radius: 5,
      paint: { fill: { color: '#000000' } },
    })
    const lines = content.split('\n')
    expect(lines[2]).toBe('15 60 m')
    expect(lines[3]).toBe('35 60 l')
    expect(lines.filter((l) => l.endsWith(' c'))).toHaveLength(4)
  })

  test('an A command is the arcToCubics output written as c', async () => {
    const from = { x: 1, y: 0 }
    const arc: Extract<PathCommand, { op: 'A' }> = {
      op: 'A',
      rx: 1,
      ry: 1,
      largeArc: false,
      sweep: true,
      to: { x: -1, y: 0 },
    }
    const { content } = await paintOf({
      kind: 'path',
      commands: [{ op: 'M', to: from }, arc],
      paint: { stroke: { color: '#000000', width: 1 } },
    })
    const pt = (p: { x: number; y: number }): string => `${num(p.x)} ${num(p.y)}`
    const curves = arcToCubics(from, arc).map(
      (c) => `${pt(c.c1)} ${pt(c.c2)} ${pt(c.to)} c`
    )
    expect(curves).toHaveLength(2)
    expect(content).toBe(`q\n0 0 0 RG\n1 w\n1 0 m\n${curves.join('\n')}\nS\nQ`)
  })
})

describe('paint', () => {
  test('a fill opacity names a state, and equal states share a name', async () => {
    const item: DrawItem = {
      kind: 'rect',
      rect: box,
      paint: { fill: { color: '#ff0000', opacity: 0.5 } },
    }
    const one = await paintOf(item)
    expect(one.content).toBe(`q\n/GS0 gs\n1 0 0 rg\n${boxPath}\nf\nQ`)
    expect(one.a.opacities).toEqual({ GS0: { fill: 0.5 } })
    const two = await paintOf(item, { ...item, rect: { ...box, x: 50 } })
    expect(two.a.opacities).toEqual({ GS0: { fill: 0.5 } })
    expect(two.content.match(/\/GS0 gs/g)).toHaveLength(2)
    const other = await paintOf(item, {
      ...item,
      paint: { fill: { color: '#ff0000', opacity: 0.25 } },
    })
    expect(other.a.opacities).toEqual({ GS0: { fill: 0.5 }, GS1: { fill: 0.25 } })
  })

  test('a group is a nested transparency group painted through its opacity', async () => {
    const a1: DrawItem = {
      kind: 'rect',
      rect: { x: 10, y: 10, width: 20, height: 20 },
      paint: { fill: { color: '#ff0000' } },
    }
    const a2: DrawItem = {
      kind: 'rect',
      rect: { x: 20, y: 20, width: 20, height: 20 },
      paint: { fill: { color: '#0000ff' } },
    }
    const { a, content } = await paintOf({ kind: 'group', opacity: 0.4, items: [a1, a2] })
    expect(content).toBe('q\n/GS0 gs\n/Fm0 Do\nQ')
    expect(a.opacities).toEqual({ GS0: { fill: 0.4, stroke: 0.4 } })
    const inner = await paintDrawing(drawing(a1, a2), helpers)
    expect(a.forms).toEqual({
      Fm0: {
        bounds: { x: 10, y: 10, width: 30, height: 30 },
        content: inner.content,
        group: true,
      },
    })
    expect(text(a.forms!.Fm0!)).toBe(
      'q\n1 0 0 rg\n10 30 m\n30 30 l\n30 10 l\n10 10 l\nh\nf\nQ\n' +
        'q\n0 0 1 rg\n20 40 m\n40 40 l\n40 20 l\n20 20 l\nh\nf\nQ'
    )
  })

  test('a group is widened by its strokes', async () => {
    const { a } = await paintOf({
      kind: 'group',
      opacity: 0.5,
      items: [
        {
          kind: 'rect',
          rect: { x: 10, y: 10, width: 20, height: 20 },
          paint: { stroke: { color: '#000000', width: 4 } },
        },
      ],
    })
    expect(a.forms!.Fm0!.bounds).toEqual({ x: 8, y: 8, width: 24, height: 24 })
  })
})

describe('nothing to paint', () => {
  test('a stroke of width 0 with no fill writes nothing', async () => {
    const { content } = await paintOf({
      kind: 'rect',
      rect: box,
      paint: { stroke: { color: '#000000', width: 0 } },
    })
    expect(content).toBe('')
  })

  test('a stroke of width 0 leaves the fill', async () => {
    const { content } = await paintOf({
      kind: 'rect',
      rect: box,
      paint: { fill: { color: '#ff0000' }, stroke: { color: '#000000', width: 0 } },
    })
    expect(content).toBe(`q\n1 0 0 rg\n${boxPath}\nf\nQ`)
  })

  test('a drawing with no items has empty content and its own bounds', async () => {
    const a = await paintDrawing(drawing(), helpers)
    expect(text(a)).toBe('')
    expect(a.bounds).toEqual(bounds)
  })

  test('a path with no commands, or only a close, writes nothing', async () => {
    const stroke = { color: '#000000', width: 1 }
    expect(
      (await paintOf({ kind: 'path', commands: [], paint: { stroke } })).content
    ).toBe('')
    expect(
      (await paintOf({ kind: 'path', commands: [{ op: 'Z' }], paint: { stroke } }))
        .content
    ).toBe('')
  })

  test('a path that does not start with M starts at its first command’s end', async () => {
    const { content } = await paintOf({
      kind: 'path',
      commands: [
        { op: 'L', to: { x: 10, y: 0 } },
        { op: 'L', to: { x: 10, y: 10 } },
      ],
      paint: { stroke: { color: '#000000', width: 1 } },
    })
    expect(content).toBe('q\n0 0 0 RG\n1 w\n10 0 m\n10 10 l\nS\nQ')
    const curve = await paintOf({
      kind: 'path',
      commands: [
        { op: 'C', c1: { x: 1, y: 1 }, c2: { x: 2, y: 2 }, to: { x: 3, y: 3 } },
        { op: 'L', to: { x: 4, y: 3 } },
      ],
      paint: { stroke: { color: '#000000', width: 1 } },
    })
    expect(curve.content).toBe('q\n0 0 0 RG\n1 w\n3 3 m\n4 3 l\nS\nQ')
  })

  test('dashes that are empty, negative, not finite or all zero are a solid line', async () => {
    for (const dashes of [[], [3, -1], [Infinity, 2], [NaN], [0, 0]]) {
      const { content } = await paintOf({
        kind: 'rect',
        rect: box,
        paint: { stroke: { color: '#000000', width: 1, dashes } },
      })
      expect(content).toBe(`q\n0 0 0 RG\n1 w\n${boxPath}\nS\nQ`)
    }
    const { content } = await paintOf({
      kind: 'rect',
      rect: box,
      paint: { stroke: { color: '#000000', width: 1, dashes: [0, 2] } },
    })
    expect(content).toContain('\n[0 2] 0 d\n')
  })
})

describe('rounded corners', () => {
  test('the top-right corner is the arc arcToCubics gives, clockwise', async () => {
    const { content } = await paintOf({
      kind: 'rect',
      rect: box,
      radius: 5,
      paint: { fill: { color: '#000000' } },
    })
    const pt = (p: { x: number; y: number }): string => `${num(p.x)} ${num(p.y)}`
    const corner = arcToCubics(
      { x: 35, y: 60 },
      { op: 'A', rx: 5, ry: 5, largeArc: false, sweep: false, to: { x: 40, y: 55 } }
    ).map((c) => `${pt(c.c1)} ${pt(c.c2)} ${pt(c.to)} c`)
    expect(corner).toEqual(['37.7614 60 40 57.7614 40 55 c'])
    expect(content.split('\n').slice(2, 5)).toEqual(['15 60 m', '35 60 l', ...corner])
  })
})

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

describe('images', () => {
  test('a PNG data URL is added as it is and stretched to its rect', async () => {
    const { a, content } = await paintOf({
      kind: 'image',
      data: 'data:image/png;base64,iVBORw==',
      rect: box,
      angle: 0,
    })
    expect(a.images).toEqual({ Im0: { format: 'png', data: png } })
    expect(content).toBe('q\n30 0 0 40 10 20 cm\n/Im0 Do\nQ')
  })

  test('a percent-encoded JPEG data URL is decoded byte by byte', async () => {
    const { a } = await paintOf({
      kind: 'image',
      data: 'data:image/jpeg,%FF%D8%ffab',
      rect: box,
      angle: 0,
    })
    expect(a.images).toEqual({
      Im0: { format: 'jpeg', data: new Uint8Array([0xff, 0xd8, 0xff, 0x61, 0x62]) },
    })
  })

  test('angle 90 turns the image anticlockwise about the rect centre', async () => {
    const { content } = await paintOf({
      kind: 'image',
      data: 'data:image/png;base64,iVBORw==',
      rect: box,
      angle: 90,
    })
    // The picture's own width runs up the rect's height; its bottom-left is the rect's bottom-right.
    expect(content).toBe('q\n0 40 -30 0 40 20 cm\n/Im0 Do\nQ')
    const half = await paintOf({
      kind: 'image',
      data: 'data:image/png;base64,iVBORw==',
      rect: box,
      angle: 180,
    })
    expect(half.content).toBe('q\n-30 0 0 -40 40 60 cm\n/Im0 Do\nQ')
  })

  test('another type goes through toPng at four pixels a point', async () => {
    const url = 'data:image/webp;base64,UklGRg=='
    const toPng = vi.fn(() => Promise.resolve(png))
    const item: DrawItem = {
      kind: 'image',
      data: url,
      rect: { x: 0, y: 0, width: 100, height: 50 },
      angle: 0,
    }
    const { a, content } = await paintDrawing(drawing(item, item), {
      page: 0,
      toPng,
    }).then((a) => ({ a, content: text(a) }))
    expect(toPng.mock.calls).toEqual([[url, 400, 200]])
    expect(a.images).toEqual({ Im0: { format: 'png', data: png } })
    expect(content.match(/\/Im0 Do/g)).toHaveLength(2)
  })

  test('without toPng, another type rejects as an unpaintable image', async () => {
    const painting = paintOf({
      kind: 'image',
      data: 'data:image/webp;base64,UklGRg==',
      rect: box,
      angle: 0,
    })
    await expect(painting).rejects.toBeInstanceOf(UnpaintableError)
    await expect(painting).rejects.toMatchObject({ reason: 'image' })
  })

  test('equal images share a name; different ones do not', async () => {
    const a1: DrawItem = {
      kind: 'image',
      data: 'data:image/png;base64,iVBORw==',
      rect: box,
      angle: 0,
    }
    const a2: DrawItem = { ...a1, data: 'data:image/jpeg;base64,/9j/' }
    const { a } = await paintOf(a1, a2, a1)
    expect(Object.keys(a.images!)).toEqual(['Im0', 'Im1'])
    expect(a.images!.Im1!.format).toBe('jpeg')
  })
})

describe('page content', () => {
  test('a loupe lens shows the page through a circle, mapping source onto target', async () => {
    const source = { x: 40, y: 40, width: 20, height: 10 }
    const target = { x: 30, y: 30, width: 40, height: 20 }
    const center = { x: 50, y: 40 }
    const a = await paintDrawing(
      drawing({ kind: 'page', source, target, clip: { center, radius: 10 } }),
      { page: 3 }
    )
    expect(a.pages).toEqual({ P0: 3 })
    const circle = await paintOf({
      kind: 'ellipse',
      rect: { x: 40, y: 30, width: 20, height: 20 },
      paint: { fill: { color: '#000000' } },
    })
    const path = circle.content.split('\n').slice(2, -2)
    expect(path.filter((l) => l.endsWith(' c'))).toHaveLength(4)
    const lines = text(a).split('\n')
    expect(lines).toEqual(['q', ...path, 'W n', lines[path.length + 2], '/P0 Do', 'Q'])
    const cm = lines[path.length + 2]!.split(' ')
    expect(cm.pop()).toBe('cm')
    const [ma, mb, mc, md, me, mf] = cm.map(Number) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ]
    const map = (x: number, y: number) => ({
      x: ma * x + mc * y + me,
      y: mb * x + md * y + mf,
    })
    expect(map(source.x, source.y)).toEqual({ x: target.x, y: target.y })
    expect(map(source.x + source.width, source.y + source.height)).toEqual({
      x: target.x + target.width,
      y: target.y + target.height,
    })
    expect(map(source.x, source.y + source.height)).toEqual({
      x: target.x,
      y: target.y + target.height,
    })
  })

  test('an empty source or clip writes nothing', async () => {
    const rect = box
    for (const item of [
      { source: { ...rect, width: 0 }, target: rect, radius: 5 },
      { source: rect, target: rect, radius: 0 },
    ]) {
      const a = await paintDrawing(
        drawing({
          kind: 'page',
          source: item.source,
          target: item.target,
          clip: { center: { x: 0, y: 0 }, radius: item.radius },
        }),
        helpers
      )
      expect(text(a)).toBe('')
      expect(a.pages).toBeUndefined()
    }
  })
})

describe('numbers', () => {
  test('a rect of width 0 and tiny coordinates write no NaN or exponent', async () => {
    for (const rect of [
      { x: 10, y: 20, width: 0, height: 40 },
      { x: 1e-9, y: 1e-9, width: 1e-9, height: 1e-9 },
    ]) {
      const { content } = await paintOf({ kind: 'rect', rect, radius: 1e-9, paint: both })
      expect(content).not.toMatch(/NaN|Infinity|e-|e\+/)
    }
    const { content } = await paintOf({
      kind: 'ellipse',
      rect: { x: 1e-9, y: 1e-9, width: 0, height: 1e-9 },
      paint: both,
    })
    expect(content).not.toMatch(/NaN|Infinity|e-|e\+/)
  })
})
