// The saved file looks the way the screen does. Each case adds annotations to a fixture, renders
// the page as the viewer shows it, saves, and renders the saved page with @inkbar/engine and
// with PDF.js. Inside each annotation's painted bounds grown by GROW points, at most
// MAX_DIFFERING of the pixels may differ by more than CHANNEL_THRESHOLD in any channel. A pixel
// where the two readers already differ on the page as it was opened (PDFium and PDF.js draw the
// page's own text a little differently) is not counted.
//
// What the comparison cannot see, by design (the known differences from the screen):
// - The engine's render draws no form widgets, so no fixture here has a form.
// - A loupe in the file magnifies the page's content only; no file annotation lies under one here.
// - The standard fonts are not embedded: PDFium and PDF.js draw Helvetica, Times and Courier
//   with their own faces, the screen with the browser's metric-compatible fonts. Positions and
//   widths match, letter shapes differ a little; that is what the pixel tolerance is for. Where
//   it is not enough, a case compares its text by where each line inks (`Case.byPosition`).
// - PDFium and PDF.js do not smooth an image they enlarge and a browser does, so the stamps
//   here are drawn at more pixels than they cover.
import themeCss from '@inkbar/theme/theme.css?inline'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  destroyRenderEngine,
  differing,
  inkBox,
  lineInk,
  MAX_DIFFERING,
  PIXELS_PER_POINT,
  pngDataUrl,
  renderSaved,
  textBands,
  type Compared,
  type PixelRect,
  type SavedPage,
  type SavedRenders,
} from '../test-support/compare-saved'

import { canvasTextPicture } from './save-pictures'
import { checkTextFonts, type TextClass } from './text-font-check'

import type { AnnotationInput } from '../model/annotations/types'
import type { Point } from '../model/geometry'
import type { FixtureName } from '@inkbar/fixtures/urls'

// The screen as a reader sees it: with the theme, which also stacks a loupe's rim over its lens.
beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = themeCss
  document.head.append(style)
  return () => style.remove()
})
afterAll(destroyRenderEngine)

/** Debugging aid: `VITE_INKBAR_SAVED_REPORT=1` logs each comparison's measured share. */
const report = !!(import.meta.env as Record<string, string | undefined>)[
  'VITE_INKBAR_SAVED_REPORT'
]

/**
 * A picture of four colours, one to a quarter, as `type` (`image/png` or `image/webp`), at four
 * pixels a point of a `width` by `height` point stamp. Drawn larger than its page area, not
 * smaller: a browser smooths an image it enlarges and PDFium and PDF.js do not (the file asks for
 * no interpolation), so a small picture's colour edges would differ on enlarging alone.
 */
function quadrants(type: string, width: number, height: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width * 4
  canvas.height = height * 4
  const ctx = canvas.getContext('2d')!
  const [w, h] = [canvas.width / 2, canvas.height / 2]
  for (const [x, y, color] of [
    [0, 0, '#ff0000'],
    [w, 0, '#0000ff'],
    [0, h, '#008000'],
    [w, h, '#000000'],
  ] as const) {
    ctx.fillStyle = color
    ctx.fillRect(x, y, w, h)
  }
  const url = canvas.toDataURL(type)
  if (!url.startsWith(`data:${type};`))
    throw new Error(`This browser cannot write ${type}`)
  return url
}

/**
 * A WebP picture in a data URL that names PNG: a stamp's data URL must name PNG or JPEG, and a
 * browser draws the bytes it holds.
 */
const webpStamp = (width: number, height: number): string =>
  quadrants('image/webp', width, height).replace(/^data:image\/webp;/, 'data:image/png;')

const quad = (x: number, y: number, width: number, height = 20) => ({
  p1: { x, y: y + height },
  p2: { x: x + width, y: y + height },
  p3: { x, y },
  p4: { x: x + width, y },
})

const zigzag = (x: number, y: number): Point[] => [
  { x, y },
  { x: x + 30, y: y + 60 },
  { x: x + 60, y },
  { x: x + 90, y: y + 50 },
]

interface Case {
  name: string
  /** Which of the added annotations, by index, the case compares. */
  index: number
  /**
   * Text whose glyphs the readers shape too differently for the pixel tolerance: each line is
   * compared by where it inks (within a point on every side), and the rest of the annotation by
   * its pixels.
   */
  byPosition?: boolean
  /**
   * A class of characters the case draws: on a machine with no font for it, what the screen and
   * the picture draw instead is no test of the painter, so the case is skipped there and the
   * picture's path and size are checked on their own.
   */
  needs?: TextClass
}

interface Scene {
  fixture: FixtureName
  inputs: AnnotationInput[]
  cases: Case[]
}

const SOFT_HYPHEN = String.fromCharCode(0xad)

/** By position: see `Case.byPosition`. */
const TEXT = { byPosition: true } as const
/** By position, and drawn only where the machine has a font for Han: see `Case.needs`. */
const HAN_TEXT = { byPosition: true, needs: 'han' } as const

const named = (
  inputs: (
    [string, AnnotationInput] | [string, AnnotationInput, typeof TEXT | typeof HAN_TEXT]
  )[]
) => ({
  inputs: inputs.map(([, input]) => input),
  cases: inputs.map(([name, , text], index): Case => ({ name, index, ...text })),
})

/** One annotation of every type, on page 0 of `text-simple`, apart from each other. */
const everyType = (): Scene => ({
  fixture: 'text-simple',
  ...named([
    ['highlight', { type: 'highlight', page: 0, quads: [quad(72, 695, 228)] }],
    ['underline', { type: 'underline', page: 0, quads: [quad(330, 695, 210)] }],
    ['strikeout', { type: 'strikeout', page: 0, quads: [quad(72, 655, 228)] }],
    ['squiggly', { type: 'squiggly', page: 0, quads: [quad(330, 655, 210)] }],
    [
      'redact',
      { type: 'redact', page: 0, rect: { x: 72, y: 570, width: 120, height: 50 } },
    ],
    [
      'note',
      {
        type: 'text',
        page: 0,
        rect: { x: 240, y: 590, width: 20, height: 20 },
        contents: 'Hi',
      },
    ],
    [
      'square',
      {
        type: 'square',
        page: 0,
        rect: { x: 300, y: 570, width: 100, height: 50 },
        width: 2,
      },
    ],
    [
      'circle',
      {
        type: 'circle',
        page: 0,
        rect: { x: 440, y: 570, width: 100, height: 50 },
        width: 2,
        interiorColor: '#80C0FF',
      },
    ],
    [
      'line',
      {
        type: 'line',
        page: 0,
        start: { x: 72, y: 470 },
        end: { x: 190, y: 530 },
        width: 2,
        tail: 'ClosedArrow',
      },
    ],
    ['polyline', { type: 'polyline', page: 0, vertices: zigzag(220, 470), width: 2 }],
    ['polygon', { type: 'polygon', page: 0, vertices: zigzag(340, 470), width: 2 }],
    ['ink', { type: 'ink', page: 0, inklist: [zigzag(460, 470)], width: 3 }],
    [
      'free text',
      {
        type: 'freetext',
        page: 0,
        rect: { x: 72, y: 380, width: 150, height: 50 },
        width: 1,
        contents: 'A text box on the page',
      },
    ],
    [
      'stamp',
      {
        type: 'stamp',
        page: 0,
        rect: { x: 260, y: 380, width: 120, height: 50 },
        imagedata: quadrants('image/png', 120, 50),
      },
    ],
    [
      'loupe',
      { type: 'loupe', page: 0, rect: { x: 72, y: 200, width: 140, height: 140 } },
    ],
  ]),
})

/** The harder cases, on page 1 of `text-simple`. */
const details = (): Scene => ({
  fixture: 'text-simple',
  ...named([
    [
      'a dashed square',
      {
        type: 'square',
        page: 1,
        rect: { x: 72, y: 650, width: 150, height: 80 },
        width: 3,
        dashes: [6, 3],
        color: '#0000FF',
      },
    ],
    [
      'a square at 40% opacity',
      {
        type: 'square',
        page: 1,
        rect: { x: 260, y: 650, width: 120, height: 80 },
        width: 6,
        color: '#FF0000',
        interiorColor: '#00A000',
        opacity: 0.4,
      },
    ],
    [
      'a speech bubble whose outline overlaps its tail, at half opacity',
      {
        type: 'freetext',
        page: 1,
        rect: { x: 420, y: 660, width: 130, height: 60 },
        intent: 'FreeTextCallout',
        cornerRadius: 8,
        width: 4,
        borderColor: '#0000FF',
        color: '#FFFF00',
        opacity: 0.5,
        callout: [
          { x: 430, y: 620 },
          { x: 460, y: 660 },
        ],
        contents: 'Bubble',
      },
    ],
    [
      'a rounded text box with clipped text',
      {
        type: 'freetext',
        page: 1,
        rect: { x: 72, y: 540, width: 150, height: 40 },
        cornerRadius: 12,
        width: 2,
        color: '#E0F0FF',
        contents:
          'This text runs on for more lines than the rounded box can hold, so the box clips it.',
      },
      TEXT,
    ],
    [
      'a justified text box with tabs',
      {
        type: 'freetext',
        page: 1,
        rect: { x: 260, y: 470, width: 220, height: 90 },
        width: 1,
        defaultStyle: { textAlign: 'justify', fontSize: 11 },
        contents:
          'Name:\tAda Lovelace wrote the first program for a machine that did not exist yet.\nDate:\t1843, in notes on the engine.',
      },
      TEXT,
    ],
    [
      'a Courier text box',
      {
        type: 'freetext',
        page: 1,
        rect: { x: 72, y: 420, width: 170, height: 30 },
        defaultStyle: { fontFamily: 'Courier', fontSize: 12, color: '#FF0000' },
        contents: 'Courier 0123456789l',
      },
      TEXT,
    ],
    [
      'a text box with text outside the standard fonts',
      {
        type: 'freetext',
        page: 1,
        rect: { x: 260, y: 380, width: 220, height: 30 },
        defaultStyle: { fontSize: 14 },
        contents: 'Total: 42 €, 日本語 ok',
      },
      HAN_TEXT,
    ],
    [
      'a WebP stamp',
      {
        type: 'stamp',
        page: 1,
        rect: { x: 72, y: 300, width: 120, height: 60 },
        imagedata: webpStamp(120, 60),
      },
    ],
    [
      'a text box with soft hyphens within its words',
      {
        type: 'freetext',
        page: 1,
        rect: { x: 260, y: 300, width: 260, height: 30 },
        defaultStyle: { fontSize: 14 },
        contents: ['co', 'op', 'er', 'ate with soft', 'hy', 'phens here'].join(
          SOFT_HYPHEN
        ),
      },
      TEXT,
    ],
  ]),
})

/** A mask alone on page 0, and a mask with a highlight on page 1. */
const masks = (): Scene => ({
  fixture: 'text-simple',
  ...named([
    [
      'a mask',
      {
        type: 'mask',
        page: 0,
        shape: 'ellipse',
        rect: { x: 100, y: 300, width: 300, height: 200 },
      },
    ],
    [
      'the mask under a highlight',
      {
        type: 'mask',
        page: 1,
        shape: 'rect',
        rect: { x: 72, y: 500, width: 300, height: 200 },
      },
    ],
    [
      'a highlight on a masked page',
      { type: 'highlight', page: 1, quads: [quad(300, 720, 200)] },
    ],
  ]),
})

/** A highlight, a text box, an ink stroke and a loupe on page 0 of `fixture`. */
const turned = (fixture: FixtureName): Scene => ({
  fixture,
  ...named([
    ['highlight', { type: 'highlight', page: 0, quads: [quad(120, 650, 180)] }],
    [
      'text box',
      {
        type: 'freetext',
        page: 0,
        rect: { x: 120, y: 520, width: 160, height: 50 },
        width: 1,
        contents: 'Turned with the page',
      },
    ],
    ['ink', { type: 'ink', page: 0, inklist: [zigzag(320, 520)], width: 3 }],
    [
      'loupe',
      { type: 'loupe', page: 0, rect: { x: 320, y: 300, width: 120, height: 120 } },
    ],
  ]),
})

/** Which classes of characters this machine's fonts draw as the screen tests expect. */
const fonts = checkTextFonts(['Total: 42 €, 日本語 ok'])

interface Measured {
  scene: string
  name: string
  engine: number
  pdfjs: number
  /** For text compared by position: the shares with its lines counted too. */
  whole?: number[]
}
const measured: Measured[] = []

afterAll(() => {
  if (!report) return
  console.log(
    measured
      .map(
        (m) =>
          `${m.scene} | ${m.name} | ${[m.engine, m.pdfjs, ...(m.whole ?? [])].map((n) => `${(n * 100).toFixed(2)}%`).join(' | ')}`
      )
      .join('\n')
  )
})

/** Renders `scene` once for all its cases. */
function rendered(scene: () => Scene) {
  let made: Promise<SavedRenders> | undefined
  const renders = (): Promise<SavedRenders> => {
    const { fixture, inputs } = scene()
    made ??= renderSaved(fixture, inputs)
    return made
  }
  afterAll(async () => (await made?.catch(() => undefined))?.destroy())
  return renders
}

/** Asserts the case's annotation looks the same on screen, in the engine and in PDF.js. */
function compares(label: string, renders: () => Promise<SavedRenders>, c: Case): void {
  const missing = c.needs !== undefined && fonts.differing.has(c.needs)
  it.skipIf(missing)(`${c.name} looks as it does on screen`, async () => {
    const { pages, compared } = await renders()
    const { annotation, region } = compared[c.index]!
    const page = pages.get(annotation.page)!
    const lines = c.byPosition ? textBands(annotation, page.transform) : []
    const bands = lines.map((l) => l.band)
    const engine = differing(page.screen, page.engine, region, bands)
    const pdfjs = differing(page.screen, page.pdfjs, region, bands)
    measured.push({
      scene: label,
      name: c.name,
      engine,
      pdfjs,
      ...(c.byPosition
        ? {
            whole: [
              differing(page.screen, page.engine, region),
              differing(page.screen, page.pdfjs, region),
            ],
          }
        : {}),
    })
    if (report) await dump(`${label}-${c.name}`, page, region)
    expect
      .soft(engine, 'engine render of the saved file')
      .toBeLessThanOrEqual(MAX_DIFFERING)
    expect
      .soft(pdfjs, 'PDF.js render of the saved file')
      .toBeLessThanOrEqual(MAX_DIFFERING)
    if (!c.byPosition) return
    expect(lines.length).toBeGreaterThan(0)
    // Every line the screen inks is compared; a line of spaces inks nothing anywhere.
    expect(lines.some((line) => lineInk(page.screen, line))).toBe(true)
    for (const line of lines) {
      const screen = lineInk(page.screen, line)
      if (!screen) continue
      for (const [reader, reading] of [
        ['engine', page.engine],
        ['PDF.js', page.pdfjs],
      ] as const) {
        const file = lineInk(reading, line)
        expect
          .soft(file, `${reader}: the line ${JSON.stringify(line.text)}`)
          .toBeDefined()
        if (!file) continue
        for (const side of ['left', 'top', 'right', 'bottom'] as const)
          expect
            .soft(
              Math.abs(file[side] - screen[side]) / PIXELS_PER_POINT,
              `${reader}: the ${side} of the line ${JSON.stringify(line.text)}, in points`
            )
            .toBeLessThanOrEqual(1)
      }
    }
  })
}

/** Writes the case's crops of each render, for looking at with `VITE_INKBAR_SAVED_REPORT=1`. */
async function dump(name: string, page: SavedPage, region: PixelRect): Promise<void> {
  const { commands } = await import('vitest/browser')
  const slug = name.replace(/[^a-z0-9]+/gi, '-')
  for (const [which, pixels] of [
    ['screen', page.screen.page],
    ['engine', page.engine.page],
    ['pdfjs', page.pdfjs.page],
    ['screen-base', page.screen.base],
    ['engine-base', page.engine.base],
  ] as const) {
    const url = pngDataUrl(pixels, region)
    await commands.writeFile(
      `../../test-results/saved-file/${slug}-${which}.png`,
      url.slice(url.indexOf(',') + 1),
      'base64'
    )
  }
}

function scene(
  label: string,
  make: () => Scene,
  extra?: (r: () => Promise<SavedRenders>) => void
) {
  describe(label, () => {
    const renders = rendered(make)
    for (const c of make().cases) compares(label, renders, c)
    extra?.(renders)
  })
}

const red = (r: number, g: number, b: number) => r > 160 && g < 110 && b < 110

scene('every type on text-simple', everyType)

scene('details on text-simple', details, (renders) => {
  const find = async (name: string): Promise<{ c: Compared; r: SavedRenders }> => {
    const r = await renders()
    const index = details().cases.find((c) => c.name === name)!.index
    return { c: r.compared[index]!, r }
  }

  it('a Courier line ends where the screen’s does, within half a point', async () => {
    const { c, r } = await find('a Courier text box')
    const page = r.pages.get(c.annotation.page)!
    const screen = inkBox(page.screen.page, c.region, red)!
    const engine = inkBox(page.engine.page, c.region, red)!
    const pdfjs = inkBox(page.pdfjs.page, c.region, red)!
    expect(screen).toBeDefined()
    const points = (px: number) => px / PIXELS_PER_POINT
    expect(Math.abs(points(engine.right - screen.right))).toBeLessThanOrEqual(0.5)
    expect(Math.abs(points(pdfjs.right - screen.right))).toBeLessThanOrEqual(0.5)
  })

  it('text outside the standard fonts is a picture in the file, of the size the screen draws', async () => {
    const { c, r } = await find('a text box with text outside the standard fonts')
    const [line] = textBands(c.annotation, r.pages.get(c.annotation.page)!.transform)
    expect(line!.text).toBe('Total: 42 €, 日本語 ok')
    // The picture the painter asked for, made again: its size is what the file must hold.
    const picture = await canvasTextPicture(document)({
      text: line!.text,
      font: { family: 'Helvetica', bold: false, italic: false },
      size: 14,
      color: line!.color,
    })
    const bitmap = await createImageBitmap(
      new Blob([picture.png as Uint8Array<ArrayBuffer>], { type: 'image/png' })
    )
    const size = [bitmap.width, bitmap.height]
    bitmap.close()
    const file = new TextDecoder('latin1').decode(r.bytes)
    const images = [...file.matchAll(/<<[^]*?>>/g)]
      .map((m) => m[0])
      .filter((d) => /\/Subtype\s*\/Image/.test(d))
      .map((d) =>
        [/\/Width\s+(\d+)/.exec(d)?.[1], /\/Height\s+(\d+)/.exec(d)?.[1]].map(Number)
      )
    expect(images).toContainEqual(size)
  })
})

scene('masks on text-simple', masks, (renders) => {
  it('the highlight is drawn over the mask, not dimmed by it', async () => {
    const r = await renders()
    const [, mask, highlight] = r.compared.map((c) => c.annotation)
    if (mask?.type !== 'mask' || highlight?.type !== 'highlight')
      throw new Error('not the scene')
    const page = r.pages.get(1)!
    // A point inside the highlight and outside the mask's hole, away from the page's text.
    const at = page.transform.toCss({ x: 490, y: 730 })
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    const over = (color: number[], opacity: number, under: number[]) =>
      color.map((c, i) => c * opacity + under[i]! * (1 - opacity))
    const dimmedPage = over(rgb(mask.color), mask.dim, [255, 255, 255])
    const above = over(rgb(highlight.color), highlight.opacity, dimmedPage)
    const below = over(
      rgb(mask.color),
      mask.dim,
      over(rgb(highlight.color), highlight.opacity, [255, 255, 255])
    )
    for (const render of [page.screen.page, page.engine.page, page.pdfjs.page]) {
      const i = (Math.round(at.y) * render.width + Math.round(at.x)) * 4
      const got = [render.data[i]!, render.data[i + 1]!, render.data[i + 2]!]
      got.forEach((c, k) => expect(Math.abs(c - above[k]!)).toBeLessThanOrEqual(6))
      expect(Math.abs(got[0]! - below[0]!)).toBeGreaterThan(30)
    }
  })
})

for (const fixture of [
  'text-rotated-90',
  'text-rotated-270',
  'cropbox-offset',
  'userunit-2',
] as const)
  scene(`on ${fixture}`, () => turned(fixture))
