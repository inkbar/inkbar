// What a reader sees: each kind of annotation drawn by the overlay into a page with the theme
// loaded, photographed, and sampled at points whose colour is worked out here by hand (the
// annotation's colour at its opacity over white). Catches what no geometry test can: a host rule
// that overrides fill, stroke or opacity, an ancestor that clips, opacity applied twice.
import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { page as browserPage } from 'vitest/browser'

import { staticDefaults } from '../model/annotations/defaults'
import { createAnnotationStore } from '../model/annotations/store'

import { createOverlay } from './overlay'
import { mountContainer, parkPointer } from './test-utils'
import { createPageTransform } from './transform'

import type { AnnotationInput } from '../model/annotations/types'
import type { PageInfo } from '../model/pages'

const WIDTH = 300
const HEIGHT = 200
const info: PageInfo = {
  index: 0,
  box: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  rotate: 0,
  userUnit: 1,
  width: WIDTH,
  height: HEIGHT,
}

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = themeCss
  document.head.append(style)
})

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

type Rgb = readonly [number, number, number]
const WHITE: Rgb = [255, 255, 255]
/** `color` at `opacity` over white. */
const over = (color: Rgb, opacity: number): Rgb =>
  color.map((c) => Math.round(c * opacity + 255 * (1 - opacity))) as unknown as Rgb

/** How the page is shown: turned by the view, at a zoom. The default is upright at zoom 1. */
interface Placed {
  view: 0 | 90 | 180 | 270
  zoom: number
}

/**
 * Where a user-space point lands, in CSS px from the page's top-left corner, for a page of
 * WIDTH x HEIGHT with its origin at (0, 0) and no /Rotate. Worked out by hand, not by the
 * page transform under test.
 */
function onScreen([x, y]: readonly [number, number], { view, zoom }: Placed) {
  switch (view) {
    case 0:
      return { x: x * zoom, y: (HEIGHT - y) * zoom }
    case 90:
      return { x: y * zoom, y: x * zoom }
    case 180:
      return { x: (WIDTH - x) * zoom, y: y * zoom }
    case 270:
      return { x: (HEIGHT - y) * zoom, y: (WIDTH - x) * zoom }
  }
}

interface Sample {
  /** In user space (points, origin bottom-left, before any turn of the view). */
  at: [number, number]
  want: Rgb
  why: string
}

/** 1 x 1 per cent of a solid colour as a PNG data URL. */
function solid(color: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 20
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 20, 20)
  return canvas.toDataURL('image/png')
}

/** A picture of four colours, one to a quarter: red top left, blue top right, green and black below. */
function quadrants(): string {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 20
  const ctx = canvas.getContext('2d')!
  for (const [x, y, color] of [
    [0, 0, '#ff0000'],
    [10, 0, '#0000ff'],
    [0, 10, '#008000'],
    [10, 10, '#000000'],
  ] as const) {
    ctx.fillStyle = color
    ctx.fillRect(x, y, 10, 10)
  }
  return canvas.toDataURL('image/png')
}

/** Waits for the SVG images to decode and two frames to paint. */
async function settled(root: HTMLElement): Promise<void> {
  for (const img of root.querySelectorAll('image')) {
    const probe = new Image()
    probe.src = img.getAttribute('href') ?? ''
    await probe.decode().catch(() => undefined)
  }
  await document.fonts.ready
  for (let i = 0; i < 3; i++)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

/**
 * Draws `input` through an overlay on a white page, photographs the page, and returns the
 * colour at each sample. `mutate` changes the page after it is drawn, for the controls.
 */
async function measure(
  input: AnnotationInput,
  samples: readonly Sample[],
  mutate?: (host: HTMLElement) => void,
  placed: Placed = { view: 0, zoom: 1 }
): Promise<Rgb[]> {
  const transform = createPageTransform(info, placed.zoom, placed.view)
  const host = mountContainer(transform.cssWidth, transform.cssHeight)
  host.style.background = '#ffffff'
  cleanup.push(() => host.remove())
  const store = createAnnotationStore({
    mode: { mode: 'uncontrolled' },
    defaults: staticDefaults,
  })
  const overlay = createOverlay({
    host,
    page: 0,
    store,
    transform,
    onActivate: vi.fn(),
  })
  cleanup.push(() => overlay.destroy())
  store.add(input)
  await settled(host)
  mutate?.(host)
  await settled(host)
  await parkPointer()
  const base64 = await browserPage.screenshot({ element: host, save: false })
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0)
  const scale = bitmap.width / transform.cssWidth
  bitmap.close()
  return samples.map(({ at }) => {
    const px = onScreen(at, placed)
    const d = ctx.getImageData(
      Math.round(px.x * scale),
      Math.round(px.y * scale),
      1,
      1
    ).data
    return [d[0]!, d[1]!, d[2]!] as const
  })
}

const near = (got: Rgb, want: Rgb, tolerance = 6): boolean =>
  got.every((c, i) => Math.abs(c - want[i]!) <= tolerance)

interface Case {
  name: string
  input: AnnotationInput
  samples: Sample[]
  placed?: Placed
}

const RED: Rgb = [255, 0, 0]
const BLUE: Rgb = [0, 0, 255]

const CASES: Case[] = [
  {
    name: 'a highlight at half opacity',
    input: {
      type: 'highlight',
      page: 0,
      rect: { x: 20, y: 160, width: 100, height: 20 },
      quads: [
        {
          p1: { x: 20, y: 180 },
          p2: { x: 120, y: 180 },
          p3: { x: 20, y: 160 },
          p4: { x: 120, y: 160 },
        },
      ],
      color: '#FF0000',
      opacity: 0.5,
    },
    samples: [
      { at: [70, 170], want: over(RED, 0.5), why: 'inside, once at half opacity' },
      { at: [70, 190], want: WHITE, why: 'above the quad' },
    ],
  },
  {
    name: 'a dashed square',
    input: {
      type: 'square',
      page: 0,
      rect: { x: 20, y: 100, width: 100, height: 50 },
      width: 4,
      dashes: [8, 8],
      color: '#0000FF',
      opacity: 1,
    },
    samples: [
      { at: [26, 148], want: BLUE, why: 'on a dash of the top edge (x 22 to 30)' },
      { at: [34, 148], want: WHITE, why: 'in the gap after it (x 30 to 38)' },
      { at: [70, 125], want: WHITE, why: 'inside, with no fill' },
      // The outline runs clockwise from the top-left corner and is 300 long (two edges of 100 and
      // two of 50), so the left edge starts 250 in, at its bottom end (y 100). With a period of 16,
      // 250 is 10 into a gap: the gap runs to 256 (y 106), a dash covers y 106 to 114, a gap y 114
      // to 122 and a dash y 122 to 130. A dash that started at another corner would put these the
      // other way round.
      {
        at: [22, 110],
        want: BLUE,
        why: 'on the left edge, in its first dash (y 106 to 114)',
      },
      {
        at: [22, 118],
        want: WHITE,
        why: 'on the left edge, in the gap after it (y 114 to 122)',
      },
      {
        at: [22, 126],
        want: BLUE,
        why: 'on the left edge, in its second dash (y 122 to 130)',
      },
    ],
  },
  {
    name: 'a line with a closed arrow, wider than its shaft',
    input: {
      type: 'line',
      page: 0,
      rect: { x: 30, y: 20, width: 180, height: 40 },
      start: { x: 40, y: 40 },
      end: { x: 200, y: 40 },
      width: 6,
      tail: 'ClosedArrow',
      color: '#008000',
      opacity: 1,
    },
    samples: [
      { at: [100, 40], want: [0, 128, 0], why: 'on the shaft' },
      {
        at: [182, 31],
        want: [0, 128, 0],
        why: "the arrow's wing, 9 below the shaft, outside the shaft's own box",
      },
      {
        at: [182, 50],
        want: [0, 128, 0],
        why: "the arrow's other wing, 10 above the shaft",
      },
      { at: [182, 20], want: WHITE, why: 'below the wing' },
    ],
  },
  {
    name: 'an ink stroke',
    input: {
      type: 'ink',
      page: 0,
      rect: { x: 20, y: 90, width: 140, height: 20 },
      width: 10,
      inklist: [Array.from({ length: 31 }, (_, i) => ({ x: 30 + i * 4, y: 100 }))],
      color: '#800080',
      opacity: 1,
    },
    samples: [
      { at: [90, 100], want: [128, 0, 128], why: 'on the stroke' },
      { at: [90, 103], want: [128, 0, 128], why: 'within its width' },
      { at: [90, 115], want: WHITE, why: 'beside it' },
    ],
  },
  {
    name: 'a stamp at half opacity',
    input: {
      type: 'stamp',
      page: 0,
      rect: { x: 150, y: 100, width: 60, height: 40 },
      imagedata: solid('#ff0000'),
      opacity: 0.5,
    },
    samples: [
      { at: [180, 120], want: over(RED, 0.5), why: 'inside, once at half opacity' },
      { at: [180, 150], want: WHITE, why: 'above it' },
    ],
  },
  {
    name: 'a text box with a fill and a border',
    input: {
      type: 'freetext',
      page: 0,
      rect: { x: 20, y: 20, width: 120, height: 40 },
      contents: 'Hi',
      color: '#FFF3B0',
      borderColor: '#B00020',
      width: 2,
    },
    samples: [
      { at: [130, 28], want: [255, 243, 176], why: 'inside, away from the text' },
      { at: [21, 40], want: [176, 0, 32], why: 'on the left border' },
      { at: [10, 40], want: WHITE, why: 'outside the box' },
    ],
  },
  {
    name: 'a note whose icon has no glyph',
    input: {
      type: 'text',
      page: 0,
      rect: { x: 230, y: 150, width: 24, height: 24 },
      icon: 'Check',
      color: '#F2C230',
      opacity: 1,
    },
    samples: [
      { at: [242, 162], want: [242, 194, 48], why: "inside the note's square" },
      { at: [242, 185], want: WHITE, why: 'above it, past its shadow' },
    ],
  },
  {
    // Insert is a chevron: its apex is at (12, 9) of the glyph's 24-unit box, drawn 0.6 of the
    // square's side across, so 36 pt of a 60 pt square, at 1.5 pt to the unit, with a stroke 3
    // pt wide. The square is x 220..280, y 120..180: the apex is (12 + 18) = 30 across and
    // (12 + 9 * 1.5) = 25.5 down from its top-left corner.
    name: 'a note with a glyph',
    input: {
      type: 'text',
      page: 0,
      rect: { x: 220, y: 120, width: 60, height: 60 },
      icon: 'Insert',
      color: '#F2C230',
      opacity: 1,
    },
    samples: [
      {
        at: [250, 154.5],
        want: [21, 24, 32],
        why: "on the glyph's stroke, at the chevron's apex",
      },
      {
        at: [250, 144.5],
        want: [242, 194, 48],
        why: "in the note's colour, below the apex between the arms",
      },
      {
        at: [225, 175],
        want: [242, 194, 48],
        why: "in the note's colour, near its corner",
      },
    ],
  },
  {
    name: "a loupe's rim",
    input: {
      type: 'loupe',
      page: 0,
      rect: { x: 100, y: 20, width: 60, height: 60 },
      width: 6,
      color: '#FF0000',
      opacity: 1,
    },
    samples: [
      { at: [130, 77], want: RED, why: 'on the rim, 27 above the centre' },
      { at: [130, 50], want: WHITE, why: 'inside the rim, where the lens is' },
      { at: [102, 22], want: WHITE, why: "in the rect's corner, outside the circle" },
    ],
  },
  {
    name: 'a square narrower than its border',
    input: {
      type: 'square',
      page: 0,
      rect: { x: 40, y: 60, width: 2, height: 40 },
      width: 6,
      color: '#FF0000',
      opacity: 1,
    },
    samples: [
      { at: [41, 80], want: RED, why: 'on the border that fills the box, centred in it' },
      { at: [38, 80], want: RED, why: 'its left edge, 3 either side of the centre' },
      { at: [50, 80], want: WHITE, why: 'beside it' },
    ],
  },
  {
    name: 'a mask',
    input: {
      type: 'mask',
      page: 0,
      rect: { x: 90, y: 70, width: 120, height: 60 },
      shape: 'rect',
      color: '#000000',
      dim: 0.5,
    },
    samples: [
      { at: [150, 100], want: WHITE, why: 'inside the cut-out' },
      { at: [20, 20], want: over([0, 0, 0], 0.5), why: 'outside it, dimmed once' },
      { at: [280, 180], want: over([0, 0, 0], 0.5), why: 'the far corner' },
    ],
  },
  {
    name: 'a filled circle at half opacity',
    input: {
      type: 'circle',
      page: 0,
      rect: { x: 30, y: 110, width: 60, height: 60 },
      width: 2,
      color: '#0000FF',
      interiorColor: '#0000FF',
      opacity: 0.5,
    },
    samples: [
      {
        at: [60, 140],
        want: over(BLUE, 0.5),
        why: 'inside: fill and border once at half opacity',
      },
      { at: [60, 100], want: WHITE, why: 'below it' },
    ],
  },
]

const GREEN: Rgb = [0, 128, 0]
const BLACK: Rgb = [0, 0, 0]

/** The stamp's picture in the four quarters of its rect (150, 100, 60 x 40), in user space. */
const quarters = (want: [Rgb, Rgb, Rgb, Rgb]): Sample[] =>
  (
    [
      [165, 130, 'upper left'],
      [195, 130, 'upper right'],
      [165, 110, 'lower left'],
      [195, 110, 'lower right'],
    ] as const
  ).map(([x, y, where], i) => ({
    at: [x, y],
    want: want[i]!,
    why: `the ${where} quarter of the stamp`,
  }))

// A page turned by the view, at another zoom: the same user-space points, found on the turned page.
for (const [view, zoom] of [
  [90, 2],
  [180, 1],
  [270, 1],
] as const)
  CASES.push(
    {
      name: `a dashed square on a page turned ${view} at zoom ${zoom}`,
      input: CASES[1]!.input,
      samples: CASES[1]!.samples,
      placed: { view, zoom },
    },
    {
      name: `a line with a closed arrow on a page turned ${view} at zoom ${zoom}`,
      input: CASES[2]!.input,
      samples: CASES[2]!.samples,
      placed: { view, zoom },
    }
  )

// The picture turns with the page: each quarter stays where the page has it.
for (const [view, rotation, want] of [
  [0, 0, [RED, BLUE, GREEN, BLACK]],
  [90, 0, [RED, BLUE, GREEN, BLACK]],
  [180, 0, [RED, BLUE, GREEN, BLACK]],
  [270, 0, [RED, BLUE, GREEN, BLACK]],
  // Turned a quarter anticlockwise on the page: upper left goes to lower left, and so on.
  [0, 90, [BLUE, BLACK, RED, GREEN]],
  [270, 90, [BLUE, BLACK, RED, GREEN]],
] as const)
  CASES.push({
    name: `a stamp turned ${rotation} on a page turned ${view}`,
    input: {
      type: 'stamp',
      page: 0,
      rect: { x: 150, y: 100, width: 60, height: 40 },
      imagedata: quadrants(),
      rotation,
    },
    samples: quarters([...want]),
    placed: { view, zoom: 1 },
  })

describe('what each annotation looks like on the page', () => {
  /** Every sample of every case, for the run's log. */
  for (const c of CASES) {
    it(`${c.name}`, async () => {
      const got = await measure(c.input, c.samples, undefined, c.placed)
      c.samples.forEach((s, i) =>
        console.log(
          `[pixels] ${c.name} | ${s.why} | at ${s.at.join(',')} | want ${s.want.join(',')} | got ${got[i]!.join(',')}`
        )
      )
      c.samples.forEach((s, i) =>
        expect(
          near(got[i]!, s.want),
          `${s.why}: want ${s.want.join(',')}, got ${got[i]!.join(',')}`
        ).toBe(true)
      )
    })
  }

  // Controls: each defect is made on purpose and the samples must see it.
  describe('sees a defect made on purpose', () => {
    const halfHighlight = CASES[0]!
    const arrow = CASES[2]!
    const dashed = CASES[1]!

    it('a wrong colour in the drawing', async () => {
      // The description is wrong: the highlight is drawn green. The samples must see it.
      const got = await measure(halfHighlight.input, halfHighlight.samples, (host) => {
        for (const shape of host.querySelectorAll<SVGElement>('.ink-annotation svg *'))
          shape.style.setProperty('fill', '#00ff00', 'important')
      })
      expect(near(got[0]!, halfHighlight.samples[0]!.want)).toBe(false)
    })

    it('a later inline opacity on the svg doubles the half opacity', async () => {
      // The sample can tell a wrong opacity: with the svg dimmed to 0.5 after painting, as a rule
      // that won the cascade would, the half-opacity highlight reads a quarter.
      const got = await measure(halfHighlight.input, halfHighlight.samples, (host) => {
        host
          .querySelector<SVGElement>('.ink-annotation svg')!
          .style.setProperty('opacity', '0.5', 'important')
      })
      expect(near(got[0]!, halfHighlight.samples[0]!.want)).toBe(false)
      expect(near(got[0]!, over(RED, 0.25))).toBe(true)
    })

    // A host's rules on the drawn shapes do not reach the pixels, with priority or without: the
    // paint is inline style with priority important.
    for (const important of ['', ' !important']) {
      const how = important ? 'with priority' : 'without priority'
      it(`a host rule that dims the svg changes nothing, ${how}`, async () => {
        const got = await measure(halfHighlight.input, halfHighlight.samples, (host) => {
          const style = document.createElement('style')
          style.textContent = `.ink-annotation svg { opacity: 0.5${important} }`
          host.append(style)
        })
        expect(near(got[0]!, halfHighlight.samples[0]!.want)).toBe(true)
      })

      it(`a host rule that recolours the strokes changes nothing, ${how}`, async () => {
        const got = await measure(arrow.input, arrow.samples, (host) => {
          const style = document.createElement('style')
          style.textContent = `.ink-annotation svg * { stroke: red${important} }`
          host.append(style)
        })
        expect(near(got[0]!, arrow.samples[0]!.want)).toBe(true)
      })

      it(`a host rule that fills a shape with no fill changes nothing, ${how}`, async () => {
        const got = await measure(dashed.input, dashed.samples, (host) => {
          const style = document.createElement('style')
          style.textContent = `.ink-annotation svg rect { fill: red${important} }`
          host.append(style)
        })
        expect(near(got[2]!, WHITE)).toBe(true)
      })
    }

    it('an ancestor that clips the page to the shaft', async () => {
      const got = await measure(arrow.input, arrow.samples, (host) => {
        const root = host.querySelector<HTMLElement>('.ink-overlay > .ink-annotation')!
        root.style.overflow = 'hidden'
        root.style.height = '8px'
      })
      // The wing, which lies outside the clipped element, disappears.
      expect(near(got[1]!, arrow.samples[1]!.want)).toBe(false)
    })
  })
})
