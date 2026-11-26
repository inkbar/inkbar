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
//   it is not enough for a reader, a case compares its text by where each line inks in that
//   reader (`Case.byPosition`).
// - Text outside the standard fonts is a picture at four pixels a point, which a reader
//   resamples to the render's two; the screen draws the glyphs themselves.
// A pixel left uncounted for the page's own sake is still in the region, and a case fails when
// more than MAX_EXCLUDED of its region is left out so.
//
// It runs only with PDF.js reading the file (not in the `browser-engine` project): the saved
// file is drawn by PDF.js and by the engine side by side, through PDF.js's own handles on the
// opened document, which the engine reader does not have.
import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import themeCss from '@inkbar/theme/theme.css?inline'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { translated } from '../model/annotations/edit'
import { openDocument, type InkDocument } from '../model/document'
import {
  beyondClip,
  destroyRenderEngine,
  differing,
  inkBox,
  inkOutside,
  lineInk,
  MAX_DIFFERING,
  MAX_EXCLUDED,
  MIN_COUNTED,
  pieceBands,
  PIXELS_PER_POINT,
  pngDataUrl,
  renderSaved,
  textBands,
  type Compared,
  type PixelRect,
  type Reading,
  type SavedPage,
  type SavedRenders,
  type TextBand,
} from '../test-support/compare-saved'

import { canvasTextPicture, savePictures } from './save-pictures'
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
 * A picture of four colours, one to a quarter, as `type` (`image/png`, `image/jpeg` or
 * `image/webp`), `width` by `height` pixels.
 */
function quadrants(
  type: string,
  width: number,
  height: number,
  colors: readonly [string, string, string, string] = [
    '#ff0000',
    '#0000ff',
    '#008000',
    '#000000',
  ]
): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const [w, h] = [canvas.width / 2, canvas.height / 2]
  for (const [x, y, color] of [
    [0, 0, colors[0]],
    [w, 0, colors[1]],
    [0, h, colors[2]],
    [w, h, colors[3]],
  ] as const) {
    ctx.fillStyle = color
    ctx.fillRect(x, y, w, h)
  }
  const url = canvas.toDataURL(type)
  if (!url.startsWith(`data:${type};`))
    throw new Error(`This browser cannot write ${type}`)
  return url
}

/** A red disc on a transparent ground, `size` pixels square: its edge is all alpha. */
function disc(size: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ff0000'
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
  ctx.fill()
  return canvas.toDataURL('image/png')
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
   * The readers whose text differs from the screen's past the pixel tolerance: in each, every
   * line is compared by where it inks (within a point on every side), and the rest of the
   * annotation by its pixels. Any other reader compares the text by its pixels too.
   */
  byPosition?: readonly Reader[]
  /**
   * The readers the case is compared in; both when absent. One is left out only where it draws
   * what the file holds unlike the screen for a reason of its own, which the case states.
   */
  readers?: readonly Reader[]
  /** Also compare where each tab segment and each justified line's last word starts. */
  pieces?: boolean
  /** Text hidden by a clip: none of it may show outside the drawing. */
  clipped?: boolean
  /**
   * A class of characters the case draws: on a machine with no font for it, what the screen and
   * the picture draw instead is no test of the painter, so the pixels and positions are not
   * compared there; the file's layout is checked against the screen's instead.
   */
  needs?: TextClass
}

type Reader = 'engine' | 'pdfjs'

interface Scene {
  fixture: FixtureName
  inputs: AnnotationInput[]
  cases: Case[]
}

const SOFT_HYPHEN = String.fromCharCode(0xad)

/**
 * Text in the standard fonts. The engine's faces differ from the screen's past the tolerance,
 * and the face PDF.js draws depends on the machine's fonts: where it finds a local Helvetica it
 * draws that one, which need not be the face the browser picks for the screen. Both readers
 * compare the text by position: see `Case.byPosition`.
 */
const STANDARD_TEXT: Partial<Case> = { byPosition: ['engine', 'pdfjs'] }
/** A short line of standard text: the engine's face stays within the tolerance, PDF.js's may not. */
const SHORT_TEXT: Partial<Case> = { byPosition: ['pdfjs'] }
/**
 * Text in a picture: PDF.js as well as the engine resamples it from four pixels a point to the
 * render's two, against glyphs the screen draws directly (the spec's known difference 2), so
 * both readers compare it by position.
 */
const pictured = (needs: TextClass): Partial<Case> => ({
  byPosition: ['engine', 'pdfjs'],
  needs,
})

const named = (
  inputs: ([string, AnnotationInput] | [string, AnnotationInput, Partial<Case>])[]
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
      SHORT_TEXT,
    ],
    [
      'stamp',
      {
        type: 'stamp',
        page: 0,
        rect: { x: 260, y: 380, width: 120, height: 50 },
        imagedata: quadrants('image/png', 480, 200),
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
        // A border unlike the text, so ink of the text's colour outside the clip is text.
        borderColor: '#0060C0',
        color: '#E0F0FF',
        contents:
          'This text runs on for more lines than the rounded box can hold, so the box clips it.',
      },
      { ...STANDARD_TEXT, clipped: true },
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
      { ...STANDARD_TEXT, pieces: true },
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
      STANDARD_TEXT,
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
      pictured('han'),
    ],
    [
      'a WebP stamp',
      {
        type: 'stamp',
        page: 1,
        rect: { x: 72, y: 300, width: 120, height: 60 },
        imagedata: webpStamp(480, 240),
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
      STANDARD_TEXT,
    ],
  ]),
})

/**
 * Text laid out by its widths in the browser's fonts, outside the tables (a wrong measure breaks
 * and places its lines elsewhere), and small pictures enlarged over their stamps, on page 0.
 */
const scripts = (): Scene => ({
  fixture: 'text-simple',
  ...named([
    [
      'a centred, wrapping Cyrillic text box',
      {
        type: 'freetext',
        page: 0,
        rect: { x: 72, y: 560, width: 170, height: 110 },
        width: 1,
        defaultStyle: { textAlign: 'center', fontSize: 13 },
        contents: 'Съешь же ещё этих мягких французских булок, да выпей чаю.',
      },
      pictured('cyrillic'),
    ],
    [
      'a right-aligned, wrapping Greek text box',
      {
        type: 'freetext',
        page: 0,
        rect: { x: 300, y: 560, width: 170, height: 110 },
        width: 1,
        defaultStyle: { textAlign: 'right', fontSize: 13 },
        contents: 'Ξεσκεπάζω την ψυχοφθόρα βδελυγμία των καιρών μας.',
      },
      pictured('greek'),
    ],
    [
      'a 40-pixel PNG enlarged over 120 points',
      {
        type: 'stamp',
        page: 0,
        rect: { x: 72, y: 400, width: 120, height: 50 },
        imagedata: quadrants('image/png', 40, 17),
      },
    ],
    [
      'a 40-pixel JPEG enlarged over 120 points',
      {
        type: 'stamp',
        page: 0,
        rect: { x: 260, y: 400, width: 120, height: 50 },
        // Shades of grey: JPEG keeps colour at half resolution, and PDF.js's decoder fills it
        // back in unlike the browser's along a hard colour edge (1.75% with the colour
        // quadrants). A grey edge keeps the enlargement and a visible edge without that.
        imagedata: quadrants('image/jpeg', 40, 17, [
          '#ffffff',
          '#404040',
          '#a0a0a0',
          '#000000',
        ]),
      },
    ],
    [
      'a 40-pixel colour JPEG enlarged over 120 points',
      {
        type: 'stamp',
        page: 0,
        rect: { x: 260, y: 300, width: 120, height: 50 },
        imagedata: quadrants('image/jpeg', 40, 17),
      },
      // The engine alone: PDF.js fills the half-resolution colour back in its own way (see the
      // grey JPEG above), which is the reader's doing and not the file's. The file holds the
      // JPEG's own bytes, so the engine's decoding of them is the check that colour survives.
      { readers: ['engine'] },
    ],
    [
      'a PNG with an alpha edge, enlarged',
      {
        type: 'stamp',
        page: 0,
        rect: { x: 420, y: 380, width: 100, height: 100 },
        imagedata: disc(32),
      },
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
      SHORT_TEXT,
    ],
    ['ink', { type: 'ink', page: 0, inklist: [zigzag(320, 520)], width: 3 }],
    [
      'loupe',
      { type: 'loupe', page: 0, rect: { x: 320, y: 300, width: 120, height: 120 } },
    ],
  ]),
})

/**
 * Which classes of characters this machine's fonts draw as the screen tests expect, probed with
 * every text the scenes draw, so each of their characters outside the tables is probed in a line.
 */
const fonts = checkTextFonts(
  [everyType(), details(), scripts(), masks(), turned('text-simple')].flatMap((scene) =>
    scene.inputs.flatMap((input) =>
      'contents' in input && input.contents ? [input.contents] : []
    )
  )
)

interface Measured {
  scene: string
  name: string
  /** No font here for the case's characters: compared by position only. */
  noFont: boolean
  readers: {
    reader: Reader
    share: number
    excluded: number
    counted: number
    byPosition: boolean
    /** For a reader comparing text by position: the share with its lines counted too. */
    whole?: number
  }[]
}
const measured: Measured[] = []

const percent = (n: number) => `${(n * 100).toFixed(2)}%`

afterAll(() => {
  if (!report) return
  console.log(
    measured
      .map((m) =>
        [
          m.scene,
          m.noFont ? `${m.name} (no font: positions only)` : m.name,
          ...m.readers.map(
            (r) =>
              `${r.reader} ${percent(r.share)} (excluded ${percent(r.excluded)}, counted ${percent(r.counted)}${r.byPosition ? `, by position, whole ${percent(r.whole!)}` : ''})`
          ),
        ].join(' | ')
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
  it(`${c.name} looks as it does on screen`, async () => {
    const { pages, compared } = await renders()
    const { annotation, region } = compared[c.index]!
    const page = pages.get(annotation.page)!
    // On a machine with no font for the case's characters (see `checkTextFonts`), the browser
    // draws them with whatever it has, in the canvas picture as on screen: what they look like
    // is no test of the painter, but where each line inks still is. Every line is compared by
    // position in both readers, and the pixels are not. A character no font has is drawn as a
    // box, which inks (so in Chromium); a browser that drew nothing would fail the check that
    // some line inks, not pass.
    const lines = c.byPosition || missing ? textBands(annotation, page.transform) : []
    const row: Measured = { scene: label, name: c.name, readers: [], noFont: missing }
    measured.push(row)
    if (report) await dump(`${label}-${c.name}`, page, region)
    for (const reader of c.readers ?? (['engine', 'pdfjs'] as const)) {
      const reading = page[reader]
      const byPosition = missing || (c.byPosition?.includes(reader) ?? false)
      const { share, excluded, counted } = differing(
        page.screen,
        reading,
        region,
        byPosition ? lines.map((l) => l.band) : []
      )
      row.readers.push({
        reader,
        share,
        excluded,
        counted,
        byPosition,
        ...(byPosition ? { whole: differing(page.screen, reading, region).share } : {}),
      })
      if (!missing) {
        expect
          .soft(share, `${reader} render of the saved file`)
          .toBeLessThanOrEqual(MAX_DIFFERING)
        expect
          .soft(excluded, `${reader}: the part left out where the page itself differs`)
          .toBeLessThanOrEqual(MAX_EXCLUDED)
        // A reader that compares text by position may count less: a text box can be mostly
        // text (the rounded one counts 26% in the engine). Its floor is then the position checks
        // below, which every line the screen inks must pass, with some pixels counted still.
        if (byPosition)
          expect
            .soft(counted, `${reader}: pixels compared outside the text`)
            .toBeGreaterThan(0)
        else
          expect
            .soft(
              counted,
              `${reader}: the part of the region its pixels were compared in`
            )
            .toBeGreaterThanOrEqual(MIN_COUNTED)
      }
      if (c.clipped)
        for (const { around, inside, color } of beyondClip(annotation, page.transform)) {
          // The lines do reach past the clip, and the screen shows none of it there, or the
          // check below would prove nothing.
          expect(around.bottom - inside.bottom).toBeGreaterThan(PIXELS_PER_POINT)
          expect(inkOutside(page.screen, around, inside, color)).toBe(0)
          expect
            .soft(
              inkOutside(reading, around, inside, color),
              `${reader}: text past the clip`
            )
            .toBe(0)
        }
      if (!byPosition) continue
      expect(lines.length).toBeGreaterThan(0)
      // Every line the screen inks is compared; a line of spaces inks nothing anywhere.
      expect(lines.some((line) => lineInk(page.screen, line))).toBe(true)
      const pieces = c.pieces
        ? pieceBands(annotation, page.transform, savePictures(document).measure)
        : []
      if (c.pieces) expect(pieces.length).toBeGreaterThan(0)
      for (const line of lines)
        samePlace(reader, page.screen, reading, line, ['left', 'top', 'right', 'bottom'])
      for (const piece of pieces) samePlace(reader, page.screen, reading, piece, ['left'])
    }
  })
}

/**
 * How far from the text's colour a pixel may be and still count as the line's ink. A faint pixel
 * at the foot of the line above can sit one colour level either side of a single limit, and
 * counting it moves the box by a whole line gap; a line that is truly elsewhere is elsewhere at
 * every limit.
 */
const INK_LIMITS = [100, 90, 110] as const

/**
 * Asserts `line` inks within a point of the screen on each of `sides`, where the screen inks it,
 * at one of `INK_LIMITS` at least.
 */
function samePlace(
  reader: Reader,
  screen: Reading,
  reading: Reading,
  line: TextBand,
  sides: readonly (keyof PixelRect)[]
): void {
  if (!lineInk(screen, line)) return
  expect
    .soft(lineInk(reading, line), `${reader}: ${JSON.stringify(line.text)}`)
    .toBeDefined()
  for (const side of sides) {
    const apart = INK_LIMITS.flatMap((limit) => {
      const want = lineInk(screen, line, limit)
      const got = lineInk(reading, line, limit)
      return want && got ? [Math.abs(got[side] - want[side]) / PIXELS_PER_POINT] : []
    })
    if (apart.length === 0) continue
    expect
      .soft(
        Math.min(...apart),
        `${reader}: the ${side} of ${JSON.stringify(line.text)}, in points`
      )
      .toBeLessThanOrEqual(1)
  }
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

scene('scripts and small pictures on text-simple', scripts)

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

describe("another program's redaction marks, adopted", () => {
  const opened: InkDocument[] = []
  afterEach(() => opened.splice(0).forEach((d) => d.destroy()))

  /** `source` opened as a viewer opens it, with the real engine, once lifting has settled. */
  async function open(source: FixtureName | Uint8Array): Promise<InkDocument> {
    const doc = await openDocument(
      typeof source === 'string' ? fixtureUrl(source) : source.slice(),
      {
        assets: browserAssets(),
        engine: () => import('@inkbar/engine'),
        pictures: savePictures(document),
      }
    )
    opened.push(doc)
    await doc.ready
    await doc._liftSettled
    return doc
  }

  /** The text of every page of `bytes`, as PDF.js reads it. */
  async function textOf(bytes: Uint8Array): Promise<string> {
    const doc = await open(bytes)
    const pages = await Promise.all(doc.pages.map((_, i) => doc.pageText(i)))
    return pages.join('\n')
  }

  /** How many annotations page 0 of `doc` lists in its `/Annots`, as PDF.js reads them. */
  const annotsOn = async (doc: InkDocument) =>
    (await (await doc._pdfjs!.getPage(0)).getAnnotations()).length

  /**
   * One page with SECRET-GAMMA and REPLIED-OMEGA under two Redact annotations another program
   * left, KEEP-BETA beside them, and a note that replies to the second mark.
   */
  function repliedTo(): Uint8Array {
    const content = [
      'BT /F1 20 Tf 50 200 Td (SECRET-GAMMA) Tj ET',
      'BT /F1 20 Tf 50 100 Td (REPLIED-OMEGA) Tj ET',
      'BT /F1 20 Tf 300 200 Td (KEEP-BETA) Tj ET',
    ].join('\n')
    const mark = (nm: string, [l, b, r, t]: number[]) =>
      `<< /Type /Annot /Subtype /Redact /Rect [${l} ${b} ${r} ${t}] /QuadPoints [${l} ${t} ${r} ${t} ${l} ${b} ${r} ${b}] /IC [0 0 0] /F 4 /NM (${nm}) /T (Another program) /P 3 0 R >>`
    const bodies = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> /Annots [6 0 R 7 0 R 8 0 R] >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      mark('first', [45, 190, 215, 225]),
      mark('second', [45, 90, 245, 125]),
      '<< /Type /Annot /Subtype /Text /Rect [340 20 360 40] /F 4 /NM (reply) /T (Another program) /Contents (A reply from another program) /IRT 7 0 R /P 3 0 R >>',
    ]
    let file = '%PDF-1.7\n'
    const offsets: number[] = []
    bodies.forEach((body, i) => {
      offsets.push(file.length)
      file += `${i + 1} 0 obj\n${body}\nendobj\n`
    })
    const xref = file.length
    file += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`
    for (const offset of offsets) file += `${String(offset).padStart(10, '0')} 00000 n \n`
    file += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    return new TextEncoder().encode(file)
  }

  it('applying an adopted mark removes what lies under it', async () => {
    const doc = await open('redact-foreign-mark')
    expect(doc.annotations.list.get()).toEqual([
      expect.objectContaining({ type: 'redact', source: 'session', page: 1 }),
    ])
    const { bytes, result } = await doc.applyRedactions()
    expect(result.foreignMarks).toBe(0)
    const text = await textOf(bytes)
    expect(text).toContain('KEEP-BETA')
    expect(text).not.toContain('SECRET')
    expect(text).not.toContain('GAMMA')
  })

  it('applying an adopted mark with a pop-up removes both and what lies under the mark', async () => {
    const doc = await open('redact-foreign-popup')
    const { bytes, result } = await doc.applyRedactions()
    expect(result.foreignMarks).toBe(0)
    const text = await textOf(bytes)
    expect(text).toContain('KEEP-BETA')
    expect(text).not.toContain('SECRET')
    expect(text).not.toContain('GAMMA')
    const back = await open(bytes)
    expect(back.annotations.list.get()).toEqual([])
    expect(await annotsOn(back)).toBe(0)
  })

  it('leaves the mark another program replied to', async () => {
    const doc = await open(repliedTo())
    const marks = doc.annotations.list.get().filter((a) => a.type === 'redact')
    // By where each lies: the first is adopted, the one replied to stays in the file.
    expect(Object.fromEntries(marks.map((a) => [a.rect.y, a.source]))).toEqual({
      190: 'session',
      90: 'pdf',
    })
    const { bytes, result } = await doc.applyRedactions()
    expect(result.marks).toBe(1)
    expect(result.foreignMarks).toBe(1)
    const text = await textOf(bytes)
    expect(text).toContain('REPLIED-OMEGA')
    expect(text).toContain('KEEP-BETA')
    expect(text).not.toContain('GAMMA')
  })

  it('a save writes one mark and drops the pop-up', async () => {
    const doc = await open('redact-foreign-popup')
    expect(await annotsOn(doc)).toBe(2)
    const [mark] = doc.annotations.list.get()
    doc.annotations.update(mark!.id, translated(mark!, 1, 0))
    const moved = doc.annotations.get(mark!.id)!
    expect(moved.rect.x).toBe(mark!.rect.x + 1)

    const back = await open(await doc.save())
    // Lifted by the data Inkbar saved with it: the mark as it was moved.
    expect(back.annotations.list.get()).toEqual([moved])
    expect(back._lifted.get().size).toBe(1)
    expect(await annotsOn(back)).toBe(1)
  })

  it('deleting an adopted mark removes it from the file', async () => {
    const doc = await open('redact-foreign-popup')
    const [mark] = doc.annotations.list.get()
    doc.annotations.remove(mark!.id)
    expect(doc.changed.get()).toBe(true)

    const back = await open(await doc.save())
    expect(back.annotations.list.get()).toEqual([])
    expect(await annotsOn(back)).toBe(0)
  })
})
