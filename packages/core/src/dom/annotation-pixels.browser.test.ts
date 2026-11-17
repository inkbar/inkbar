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
import { mountContainer } from './test-utils'
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

interface Sample {
  /** In user space (points, origin bottom-left); the page is shown at zoom 1. */
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
  mutate?: (host: HTMLElement) => void
): Promise<Rgb[]> {
  const host = mountContainer(WIDTH, HEIGHT)
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
    transform: createPageTransform(info, 1, 0),
    onActivate: vi.fn(),
  })
  cleanup.push(() => overlay.destroy())
  store.add(input)
  await settled(host)
  mutate?.(host)
  await settled(host)
  const base64 = await browserPage.screenshot({ element: host, save: false })
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0)
  const scale = bitmap.width / WIDTH
  bitmap.close()
  return samples.map(({ at: [x, y] }) => {
    const d = ctx.getImageData(
      Math.round(x * scale),
      Math.round((HEIGHT - y) * scale),
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
    name: 'a note',
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

describe('what each annotation looks like on the page', () => {
  /** Every sample of every case, for the run's log. */
  for (const c of CASES) {
    it(`${c.name}`, async () => {
      const got = await measure(c.input, c.samples)
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
