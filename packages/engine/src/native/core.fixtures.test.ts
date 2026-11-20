import { readFile } from 'node:fs/promises'

import { fixtureBytes, manifest } from '@inkbar/fixtures'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'

import { EngineCore } from './core.ts'
import { loadNative } from './module.ts'

import type { RenderedPage } from '../types.ts'

let core: EngineCore

beforeAll(async () => {
  const native = await loadNative({
    wasm: await readFile(new URL('../../vendor/inkbar-pdfium.wasm', import.meta.url)),
  })
  core = new EngineCore(native)
})

afterEach(() => {
  expect(core.openCount).toBe(0)
})

afterAll(() => {
  core.destroy()
})

describe.each(Object.entries(manifest))('%s', (name, meta) => {
  const options = meta.password ? { password: meta.password } : {}
  let bytes: Uint8Array
  beforeAll(async () => {
    bytes = await fixtureBytes(name as keyof typeof manifest)
  })

  if (!meta.opens) {
    test('is rejected as invalid', () => {
      expect(() => core.open(bytes)).toThrow(
        expect.objectContaining({ code: 'invalid-pdf' })
      )
    })
    return
  }

  if (meta.password) {
    test('needs its password', () => {
      expect(() => core.open(bytes)).toThrow(
        expect.objectContaining({ code: 'password-required' })
      )
      expect(() => core.open(bytes, { password: 'wrong' })).toThrow(
        expect.objectContaining({ code: 'password-incorrect' })
      )
    })
  }

  test('opens with the manifest page count', () => {
    const { id, pageCount } = core.open(bytes, options)
    core.close(id)
    expect(pageCount).toBe(meta.pages)
  })

  test('renders its first page at the expected size, not blank', () => {
    const { id } = core.open(bytes, options)
    try {
      const info = core.pageInfo(id, 0)
      const turned = info.rotation === 90 || info.rotation === 270
      const page = core.renderPage(id, 0, { scale: 1 })
      expect(page.width).toBe(Math.ceil(turned ? info.height : info.width))
      expect(page.height).toBe(Math.ceil(turned ? info.width : info.height))
      expect(page.data.length).toBe(page.width * page.height * 4)
      // A recorded difference is a blank page where PDF.js draws content: when the engine draws
      // it, the test fails and the note in the manifest goes.
      expect(page.data.some((v, i) => i % 4 !== 3 && v !== 255)).toBe(
        meta.engine?.render === undefined
      )
      expect(page.data.every((v, i) => i % 4 !== 3 || v === 255)).toBe(true)
    } finally {
      core.close(id)
    }
  })
})

describe('blend modes', () => {
  // alpha-composite: a cyan square at [175 250 275 350] on a 450 by 600 page, painted with the
  // Screen blend mode at 0.75 opacity. Screen against white is white, so a page drawn straight
  // onto white paper loses the square; against an empty page it keeps its colour.
  test('blend against an empty page, not against white paper', async () => {
    withOpen(await fixtureBytes('corpus-alpha-composite'), (id) => {
      const page = core.renderPage(id, 0, { scale: 1 })
      const at = (300 * page.width + 250) * 4
      expect([...page.data.subarray(at, at + 4)]).toEqual([64, 255, 255, 255])
    })
  })

  // A black triangle with a slanted edge under a yellow fill at 0.4 opacity, on a 100-point
  // page. On the edge the two mix: where the triangle covers 69% of a pixel, the pixel is
  // 0.4 yellow over 69% black over white.
  test('mix a translucent fill with the soft edge under it exactly', () => {
    const content =
      '0 0 0 rg 10 10 m 60 90 l 10 90 l f q /G gs 1 1 0 rg 20 20 70 60 re f Q'
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R ' +
        '/Resources << /ExtGState << /G << /ca 0.4 >> >> >> >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ]
    let file = '%PDF-1.7\n'
    const offsets = objects.map((object, i) => {
      const at = file.length
      file += `${i + 1} 0 obj\n${object}\nendobj\n`
      return at
    })
    const xref = file.length
    file += `xref\n0 5\n0000000000 65535 f \n`
    for (const at of offsets) file += `${String(at).padStart(10, '0')} 00000 n \n`
    file += `trailer << /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    withOpen(new TextEncoder().encode(file), (id) => {
      const page = core.renderPage(id, 0, { scale: 1 })
      const pixel = (x: number) => [
        ...page.data.subarray((50 * page.width + x) * 4, (50 * page.width + x) * 4 + 4),
      ]
      expect(pixel(30)).toEqual([102, 102, 0, 255])
      // 149 exactly; the two steps each round down.
      expect(pixel(34)).toEqual([148, 148, 47, 255])
      expect(pixel(38)).toEqual([255, 255, 153, 255])
    })
  })

  test('leave a page with no blending as it was: opaque, white where nothing is drawn', async () => {
    withOpen(await fixtureBytes('text-simple'), (id) => {
      const page = core.renderPage(id, 0, { scale: 1 })
      expect(page.data.every((v, i) => i % 4 !== 3 || v === 255)).toBe(true)
      expect([...page.data.subarray(0, 4)]).toEqual([255, 255, 255, 255])
    })
  })
})

describe('form widgets', () => {
  // acroform-basic: a text field holding "Sam" at [71.5 599.5 272.5 624.5] on a 792-point page.
  const inField = (page: { data: Uint8ClampedArray; width: number }) => {
    let marked = 0
    for (let y = 168; y < 192; y++)
      for (let x = 72; x < 272; x++) {
        const at = (y * page.width + x) * 4
        if (
          page.data[at] !== 255 ||
          page.data[at + 1] !== 255 ||
          page.data[at + 2] !== 255
        )
          marked++
      }
    return marked
  }

  test('are drawn unless annotations are off', async () => {
    const { id } = core.open(await fixtureBytes('acroform-basic'))
    try {
      const withWidgets = core.renderPage(id, 0, { scale: 1 })
      const without = core.renderPage(id, 0, { annotations: false })
      expect(inField(withWidgets)).toBeGreaterThan(0)
      expect(inField(without)).toBe(0)
      // Control: outside the two widgets (the text field, and the checkbox at x 72 to 90,
      // y 224 to 242 from the top), each with one pixel round it for the border's antialiasing,
      // the two renders are the same pixels.
      const inWidget = (x: number, y: number) =>
        (y >= 167 && y < 193 && x >= 71 && x < 273) ||
        (y >= 223 && y < 243 && x >= 71 && x < 91)
      let outside = 0
      for (let y = 0; y < without.height; y++)
        for (let x = 0; x < without.width; x++) {
          if (inWidget(x, y)) continue
          const at = (y * without.width + x) * 4
          if (withWidgets.data[at] !== without.data[at]) outside++
        }
      expect(outside).toBe(0)
    } finally {
      core.close(id)
    }
  })
})

/** The `width` by `height` pixels of `page` from (`left`, `top`). */
function cut(
  page: RenderedPage,
  left: number,
  top: number,
  width: number,
  height: number
) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const from = ((top + y) * page.width + left) * 4
    data.set(page.data.subarray(from, from + width * 4), y * width * 4)
  }
  return { width, height, data, missingFonts: page.missingFonts }
}

/** `page` turned a quarter clockwise. */
function turned(page: RenderedPage): RenderedPage {
  const width = page.height
  const height = page.width
  const data = new Uint8ClampedArray(page.data.length)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const from = ((page.height - 1 - x) * page.width + y) * 4
      data.set(page.data.subarray(from, from + 4), (y * width + x) * 4)
    }
  return { width, height, data, missingFonts: page.missingFonts }
}

const isWhite = (data: Uint8ClampedArray) => data.every((v) => v === 255)

/** The last column and row with a pixel that is not white. */
function lastInk(page: RenderedPage): { x: number; y: number } {
  let x = -1
  let y = -1
  for (let row = 0; row < page.height; row++)
    for (let column = 0; column < page.width; column++)
      if (page.data[(row * page.width + column) * 4] !== 255) {
        x = Math.max(x, column)
        y = Math.max(y, row)
      }
  return { x, y }
}

function withOpen<T>(bytes: Uint8Array, use: (id: number) => T): T {
  const { id } = core.open(bytes)
  try {
    return use(id)
  } finally {
    core.close(id)
  }
}

describe('a region', () => {
  // The same rectangle on each text page: one Letter page whose text is drawn unturned in user
  // space. By total quarter turns, the region's top-left corner in the page as displayed.
  const region = { x: 72, y: 500, width: 200, height: 150 }
  const CORNERS = [
    [72, 142],
    [500, 72],
    [340, 500],
    [142, 340],
  ] as const
  // On cropbox-offset, crop box [50 50 550 750] with the Square at [100 100 200 160].
  const cropped = { x: 80, y: 90, width: 150, height: 100 }
  const CROPPED_CORNERS = [
    [30, 560],
    [40, 30],
    [320, 40],
    [560, 320],
  ] as const
  const cases = [
    ['text-simple', 0],
    ['text-rotated-90', 1],
    ['text-rotated-180', 2],
    ['text-rotated-270', 3],
    ['cropbox-offset', 0],
  ] as const
  const ROTATIONS = [0, 90, 180, 270] as const

  describe.each(cases)('of %s', (name, pageTurns) => {
    test.each(ROTATIONS)(
      'turned %i more is the same cut from the whole page',
      async (rotation) => {
        const turns = (pageTurns + rotation / 90) % 4
        const isCropped = name === 'cropbox-offset'
        const rect = isCropped ? cropped : region
        const [left, top] = (isCropped ? CROPPED_CORNERS : CORNERS)[turns] as readonly [
          number,
          number,
        ]
        const [width, height] =
          turns % 2 === 0
            ? [rect.width * 2, rect.height * 2]
            : [rect.height * 2, rect.width * 2]
        withOpen(await fixtureBytes(name), (id) => {
          const whole = core.renderPage(id, 0, { scale: 2, rotation })
          const part = core.renderPage(id, 0, { region: rect, scale: 2, rotation })
          expect(part).toEqual(cut(whole, left * 2, top * 2, width, height))
          expect(isWhite(part.data)).toBe(false)
        })
      }
    )
  })

  test('half off the page box is white there', async () => {
    withOpen(await fixtureBytes('cropbox-offset'), (id) => {
      // x from -50 to 150: the left half lies outside the crop box, and its first 50 points
      // outside the media box too. The Square starts at x 100.
      const part = core.renderPage(id, 0, {
        region: { x: -50, y: 90, width: 200, height: 80 },
        scale: 2,
      })
      expect(part).toMatchObject({ width: 400, height: 160 })
      expect(isWhite(cut(part, 0, 0, 200, 160).data)).toBe(true)
      expect(cut(part, 200, 0, 200, 160)).toEqual(
        cut(core.renderPage(id, 0, { scale: 2 }), 0, (750 - 170) * 2, 200, 160)
      )
      expect(isWhite(cut(part, 200, 0, 200, 160).data)).toBe(false)
    })
  })

  test('wholly off the page is white', async () => {
    withOpen(await fixtureBytes('text-simple'), (id) => {
      const part = core.renderPage(id, 0, {
        region: { x: 700, y: 0, width: 10, height: 10 },
      })
      expect(part).toMatchObject({ width: 10, height: 10 })
      expect(isWhite(part.data)).toBe(true)
    })
  })
})

/**
 * The mean difference per colour byte between `a` and `b` moved by (`dx`, `dy`), over the
 * pixels that stay inside both.
 */
function meanDifference(a: RenderedPage, b: RenderedPage, dx = 0, dy = 0): number {
  let sum = 0
  let count = 0
  for (let y = 1; y < a.height - 1; y++)
    for (let x = 1; x < a.width - 1; x++)
      for (let k = 0; k < 3; k++) {
        const left = a.data[(y * a.width + x) * 4 + k] as number
        const right = b.data[((y + dy) * b.width + x + dx) * 4 + k] as number
        sum += Math.abs(left - right)
        count++
      }
  return sum / count
}

describe('a rotation', () => {
  // Glyphs are drawn afresh at each angle, so their edges differ a little from the same bitmap
  // turned. The page must still line up to the pixel: any one-pixel shift is a worse match.
  const SHIFTS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const
  const lineUp = (page: RenderedPage, expected: RenderedPage) => {
    const here = meanDifference(page, expected)
    return (
      here < 1.5 &&
      SHIFTS.every(([dx, dy]) => here < meanDifference(page, expected, dx, dy) * 0.7)
    )
  }
  test.each(['text-simple', 'text-rotated-90', 'cropbox-offset'] as const)(
    'turns the whole of %s',
    async (name) => {
      withOpen(await fixtureBytes(name), (id) => {
        let expected = core.renderPage(id, 0, {})
        for (const rotation of [90, 180, 270] as const) {
          expected = turned(expected)
          const page = core.renderPage(id, 0, { rotation })
          expect([page.width, page.height]).toEqual([expected.width, expected.height])
          expect(lineUp(page, expected)).toBe(true)
        }
      })
    }
  )

  test('turns a region with the page', async () => {
    withOpen(await fixtureBytes('cropbox-offset'), (id) => {
      const region = { x: 80, y: 90, width: 150, height: 100 }
      const page = core.renderPage(id, 0, { region, scale: 2, rotation: 90 })
      const expected = turned(core.renderPage(id, 0, { region, scale: 2 }))
      expect([page.width, page.height]).toEqual([expected.width, expected.height])
      expect(lineUp(page, expected)).toBe(true)
    })
  })
})

test('a page with a user unit is drawn whole at the size asked', async () => {
  // userunit-2 is text-simple with /UserUnit 2. Its page box is in user-space units.
  const plain = withOpen(await fixtureBytes('text-simple'), (id) =>
    core.renderPage(id, 0, {})
  )
  withOpen(await fixtureBytes('userunit-2'), (id) => {
    const info = core.pageInfo(id, 0)
    expect(info).toMatchObject({ width: 612, height: 792, userUnit: 2 })
    const sized = core.renderPage(id, 0, { size: { width: 612, height: 792 } })
    expect(sized).toEqual(core.renderPage(id, 0, {}))
    expect(lastInk(sized)).toEqual(lastInk(plain))
    const half = core.renderPage(id, 0, { size: { width: 306, height: 396 } })
    const ink = lastInk(half)
    expect(Math.abs(ink.x - lastInk(plain).x / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(ink.y - lastInk(plain).y / 2)).toBeLessThanOrEqual(1)
  })
})

test('a bitmap of one pixel is four bytes', async () => {
  withOpen(await fixtureBytes('text-simple'), (id) => {
    const page = core.renderPage(id, 0, { size: { width: 1, height: 1 } })
    expect(page).toMatchObject({ width: 1, height: 1 })
    expect(page.data).toHaveLength(4)
  })
})

describe('hide', () => {
  interface Read {
    id: string
    subtype: string
    rect: [number, number, number, number]
  }
  /** The first two annotations PDF.js reads on page 0 whose rectangles do not meet. */
  async function twoApart(bytes: Uint8Array): Promise<[Read, Read]> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 })
    try {
      const page = await (await task.promise).getPage(1)
      const all = (await page.getAnnotations({ intent: 'any' })) as Read[]
      const apart = (a: Read, b: Read) =>
        a.rect[2] + 2 < b.rect[0] ||
        b.rect[2] + 2 < a.rect[0] ||
        a.rect[3] + 2 < b.rect[1] ||
        b.rect[3] + 2 < a.rect[1]
      for (const a of all) for (const b of all) if (a !== b && apart(a, b)) return [a, b]
      throw new Error('no two annotations apart')
    } finally {
      await task.destroy()
    }
  }

  test('leaves out one annotation and draws the other', async () => {
    const bytes = await fixtureBytes('annotated-shapes')
    const [hidden, shown] = await twoApart(bytes)
    const unsaved = withOpen(bytes, (id) => core.save(id, 'rewrite'))
    withOpen(bytes, (id) => {
      const info = core.pageInfo(id, 0)
      expect(info.rotation).toBe(0)
      const pixels = (page: RenderedPage, rect: Read['rect']) => {
        const left = Math.floor(rect[0] - info.box.x)
        const top = Math.floor(info.box.y + info.box.height - rect[3])
        const right = Math.ceil(rect[2] - info.box.x)
        const bottom = Math.ceil(info.box.y + info.box.height - rect[1])
        return cut(page, left, top, right - left, bottom - top)
      }
      const drawn = core.renderPage(id, 0, {})
      const bare = core.renderPage(id, 0, { annotations: false })
      const page = core.renderPage(id, 0, { hide: [Number.parseInt(hidden.id, 10)] })
      expect(pixels(drawn, hidden.rect)).not.toEqual(pixels(bare, hidden.rect))
      expect(pixels(drawn, shown.rect)).not.toEqual(pixels(bare, shown.rect))
      expect(pixels(page, hidden.rect)).toEqual(pixels(bare, hidden.rect))
      expect(pixels(page, shown.rect)).toEqual(pixels(drawn, shown.rect))
      const latin1 = (b: Uint8Array) =>
        Buffer.from(b)
          .toString('latin1')
          .replace(/\/ID\s*\[\s*<[0-9A-F]*>\s*<[0-9A-F]*>\s*\]/i, '/ID[]')
      expect(latin1(core.save(id, 'rewrite'))).toBe(latin1(unsaved))
    })
  })

  test('of an object number not on the page changes nothing', async () => {
    withOpen(await fixtureBytes('annotated-shapes'), (id) => {
      expect(core.renderPage(id, 0, { hide: [99_999] })).toEqual(
        core.renderPage(id, 0, {})
      )
    })
  })
})
