/*
 * Writes the fixtures of PDFs Inkbar saved, into fixtures/pdf/: annotations written by
 * @inkbar/engine the way a save writes them, each with its appearance from core's own drawing
 * and its data from `savedDataFor`. Beside each PDF, `<name>.annotations.json` holds the
 * annotations written, in order, as the session had them, for the tests to compare with what
 * opening the file lifts. Local only: never run in CI. The output is committed.
 *
 *   pnpm --filter @inkbar/engine build
 *   pnpm --filter @inkbar/fixtures exec tsx ../packages/core/scripts/fixtures/generate-saved.ts
 *
 * Ids and dates are fixed, so running it again writes the same annotations.
 *
 * The annotations are ones whose drawing paints without a browser: text in the standard fonts
 * and PNG images. Text outside them needs a picture (`textPicture`), and other images a PNG
 * conversion (`toPng`), which Node cannot make.
 *
 * - saved-annotations: text-simple with one annotation of every type (a reply among them),
 *   rewritten.
 * - saved-incremental: the same, saved incrementally.
 * - saved-tampered: text-simple with a square as written, a circle whose data is broken JSON,
 *   and a line whose data records a /Rect 5 points to the right of the one written, as if
 *   another program had moved it. Only the square lifts.
 * - saved-encrypted: encrypted-aes (password "inkbar") with a square and a note, rewritten;
 *   still encrypted, so nothing lifts.
 * - saved-signed: form-fields with an image signature that signs the empty field "sig".
 */
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { createEngine, type EngineDocument, type WriteAnnotation } from '@inkbar/engine'
import { fixtureBytes, fixturePath, type FixtureName } from '@inkbar/fixtures'
import { format, resolveConfig } from 'prettier'

import { staticDefaults } from '../../src/model/annotations/defaults'
import { savedDataFor } from '../../src/model/annotations/saved-data'
import { createAnnotationStore } from '../../src/model/annotations/store'
import { writeAnnotation } from '../../src/model/save/write-input'

import type { Annotation, AnnotationInput } from '../../src/model/annotations/types'

const require = createRequire(import.meta.url)
const OUT = dirname(fixturePath('text-simple'))

/** A 1 × 1 PNG, as the drawing tests use. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/** Session annotations with fixed ids and dates: `<prefix>-<n>`, all made at `at`. */
function complete(
  prefix: string,
  at: string,
  inputs: (AnnotationInput | ((made: Annotation[]) => AnnotationInput))[]
): Annotation[] {
  let n = 0
  const store = createAnnotationStore({
    mode: { mode: 'uncontrolled' },
    defaults: staticDefaults,
    now: () => at,
    id: () => `${prefix}-${++n}`,
  })
  const made: Annotation[] = []
  for (const input of inputs)
    made.push(store.add(typeof input === 'function' ? input(made) : input))
  return made
}

const quad = (x: number, y: number, width: number, height: number) => ({
  p1: { x, y: y + height },
  p2: { x: x + width, y: y + height },
  p3: { x, y },
  p4: { x: x + width, y },
})

/** One annotation of every type on text-simple, mostly on page 0, a square on page 1. */
const everyType = (): Annotation[] =>
  complete('saved', '2026-11-17T09:30:00.000Z', [
    { type: 'highlight', page: 0, quads: [quad(72, 700, 200, 14)] },
    { type: 'underline', page: 0, quads: [quad(72, 680, 200, 14)] },
    { type: 'strikeout', page: 0, quads: [quad(72, 660, 200, 14)] },
    { type: 'squiggly', page: 0, quads: [quad(72, 640, 200, 14)] },
    {
      type: 'text',
      page: 0,
      rect: { x: 520, y: 700, width: 20, height: 20 },
      contents: 'A note',
      author: 'Sam',
    },
    (made) => ({
      type: 'text',
      page: 0,
      rect: { x: 520, y: 700, width: 20, height: 20 },
      contents: 'A reply',
      inReplyTo: made[4]!.id,
    }),
    {
      type: 'freetext',
      page: 0,
      rect: { x: 300, y: 560, width: 160, height: 40 },
      contents: 'Saved by Inkbar',
      borderColor: '#336699',
      width: 1,
    },
    { type: 'square', page: 0, rect: { x: 72, y: 540, width: 80, height: 60 }, width: 2 },
    {
      type: 'circle',
      page: 0,
      rect: { x: 180, y: 540, width: 80, height: 60 },
      interiorColor: '#FFEEAA',
    },
    {
      type: 'line',
      page: 0,
      start: { x: 72, y: 500 },
      end: { x: 260, y: 520 },
      width: 2,
      head: 'OpenArrow',
      tail: 'Circle',
    },
    {
      type: 'polyline',
      page: 0,
      vertices: [
        { x: 300, y: 480 },
        { x: 360, y: 520 },
        { x: 420, y: 480 },
      ],
    },
    {
      type: 'polygon',
      page: 0,
      vertices: [
        { x: 450, y: 480 },
        { x: 540, y: 480 },
        { x: 495, y: 530 },
      ],
    },
    {
      type: 'ink',
      page: 0,
      width: 3,
      inklist: [
        [
          { x: 72, y: 400 },
          { x: 110, y: 450 },
          { x: 150, y: 400 },
          { x: 190, y: 450 },
        ],
      ],
      pressure: [[0.2, 0.6, 1, 0.4]],
    },
    {
      type: 'stamp',
      page: 0,
      subject: 'Signature',
      rect: { x: 300, y: 380, width: 120, height: 60 },
      imagedata: PNG,
    },
    {
      type: 'loupe',
      page: 0,
      rect: { x: 450, y: 360, width: 90, height: 90 },
      magnification: 2,
    },
    {
      type: 'mask',
      page: 0,
      rect: { x: 72, y: 200, width: 200, height: 120 },
      shape: 'ellipse',
    },
    { type: 'redact', page: 0, rect: { x: 300, y: 220, width: 200, height: 40 } },
    { type: 'square', page: 1, rect: { x: 100, y: 100, width: 120, height: 80 } },
  ])

interface Written {
  annotation: Annotation
  /** The data to store; `savedDataFor` of the annotation when absent. */
  data?: (
    a: Annotation,
    bounds: { x: number; y: number; width: number; height: number }
  ) => string
  signs?: string
}

async function writeAll(doc: EngineDocument, items: Written[]): Promise<void> {
  const pages = new Map<number, Awaited<ReturnType<EngineDocument['pageInfo']>>>()
  const out: WriteAnnotation[] = []
  for (const { annotation: a, data, signs } of items) {
    let info = pages.get(a.page)
    if (!info) {
      info = await doc.pageInfo(a.page)
      pages.set(a.page, info)
    }
    // The way a save writes it, with the page the engine reports.
    out.push(
      await writeAnnotation(a, {
        page: { box: info.box, rotate: info.rotation, userUnit: 1 },
        reply: a.inReplyTo !== undefined,
        signs,
        helpers: {},
        ...(data ? { data: (bounds) => data(a, bounds) } : {}),
      })
    )
  }
  await doc.write({ annotations: out })
}

async function formatted(path: string, json: unknown): Promise<string> {
  const config = await resolveConfig(path)
  return format(JSON.stringify(json), { ...config, filepath: path })
}

async function main(): Promise<void> {
  const wasm = await readFile(
    join(
      dirname(require.resolve('@inkbar/engine/package.json')),
      'dist',
      'inkbar-pdfium.wasm'
    )
  )
  const engine = await createEngine({ wasm, worker: false })

  async function save(
    name: string,
    from: FixtureName,
    items: Written[],
    mode: 'rewrite' | 'incremental',
    password?: string
  ): Promise<void> {
    const doc = await engine.open(await fixtureBytes(from), password ? { password } : {})
    try {
      await writeAll(doc, items)
      const bytes = await doc.save({ mode })
      await writeFile(join(OUT, `${name}.pdf`), bytes)
      const listPath = join(OUT, `${name}.annotations.json`)
      await writeFile(
        listPath,
        await formatted(
          listPath,
          items.map((i) => i.annotation)
        )
      )
      console.log(`${name}.pdf: ${bytes.length} bytes, ${items.length} annotations`)
    } finally {
      await doc.close()
    }
  }

  try {
    const all = everyType().map((annotation) => ({ annotation }))
    await save('saved-annotations', 'text-simple', all, 'rewrite')
    await save('saved-incremental', 'text-simple', all, 'incremental')

    const [square, circle, line] = complete('tampered', '2026-11-17T09:40:00.000Z', [
      { type: 'square', page: 0, rect: { x: 72, y: 600, width: 100, height: 80 } },
      { type: 'circle', page: 0, rect: { x: 200, y: 600, width: 100, height: 80 } },
      {
        type: 'line',
        page: 0,
        start: { x: 330, y: 600 },
        end: { x: 450, y: 680 },
        width: 2,
      },
    ])
    await save(
      'saved-tampered',
      'text-simple',
      [
        { annotation: square! },
        { annotation: circle!, data: (a, b) => savedDataFor(a, b).slice(0, -12) },
        {
          annotation: line!,
          data: (a, b) => savedDataFor(a, { ...b, x: b.x + 5 }),
        },
      ],
      'rewrite'
    )

    const encrypted = complete('encrypted', '2026-11-17T09:50:00.000Z', [
      { type: 'square', page: 0, rect: { x: 72, y: 600, width: 100, height: 80 } },
      {
        type: 'text',
        page: 0,
        rect: { x: 300, y: 650, width: 20, height: 20 },
        contents: 'Hi',
      },
    ])
    await save(
      'saved-encrypted',
      'encrypted-aes',
      encrypted.map((annotation) => ({ annotation })),
      'rewrite',
      'inkbar'
    )

    const [signature] = complete('signed', '2026-11-17T10:00:00.000Z', [
      {
        type: 'stamp',
        page: 0,
        subject: 'Signature',
        rect: { x: 72, y: 100, width: 200, height: 40 },
        imagedata: PNG,
      },
    ])
    await save(
      'saved-signed',
      'form-fields',
      [{ annotation: signature!, signs: 'sig' }],
      'rewrite'
    )
  } finally {
    await engine.destroy()
  }
}

await main()
