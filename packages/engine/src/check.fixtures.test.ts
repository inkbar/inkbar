import { readFile } from 'node:fs/promises'

import { fixtureBytes, manifest, type FixtureName } from '@inkbar/fixtures'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { createEngine, EngineError, type Engine } from './index.ts'
import { EngineCore } from './native/core.ts'
import { loadNative } from './native/module.ts'
import { withFunctions } from './native/testing.ts'
import { boundsOf, mark, marksOf, regionsOf } from './redaction/testing.ts'

import type { Native } from './native/functions.ts'
import type { RedactionRegion } from './types.ts'

let engine: Engine
let wasm: Uint8Array

beforeAll(async () => {
  wasm = await readFile(new URL('../vendor/inkbar-pdfium.wasm', import.meta.url))
  engine = await createEngine({ wasm, worker: false })
})

afterAll(async () => {
  await engine.destroy()
})

/** A region on page 0 from its left, bottom, right and top edges. */
const box = (l: number, b: number, r: number, t: number): RedactionRegion => ({
  page: 0,
  quads: [
    { p1: { x: l, y: t }, p2: { x: r, y: t }, p3: { x: l, y: b }, p4: { x: r, y: b } },
  ],
})

/** Opens the fixture, redacts it with `marks`, saves and closes. */
async function redacted(fixture: FixtureName, marks = marksOf(fixture)) {
  const doc = await engine.open(await fixtureBytes(fixture))
  try {
    await doc.redact({ marks })
    return await doc.save()
  } finally {
    await doc.close()
  }
}

/** The text PDF.js reads from the first page. */
async function firstPageText(bytes: Uint8Array): Promise<string> {
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = lib.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
    isOffscreenCanvasSupported: false,
  })
  try {
    const content = await (await (await task.promise).getPage(1)).getTextContent()
    return content.items.map((item) => ('str' in item ? item.str : '')).join('')
  } finally {
    await task.destroy()
  }
}

/** What is left under a region, the fixture that holds it, and the field that must say so. */
const leaveBehind = [
  ['text', 'redact-text', 'text'],
  ['text in a form', 'check-form-text', 'text'],
  ['an image', 'check-image', 'image'],
  ['an inline image', 'check-inline-image', 'image'],
  ['a path', 'redact-path', 'drawing'],
  ['text in a tiling pattern', 'check-pattern-text', 'text'],
  ['text in an annotation appearance', 'redact-annotations', 'text'],
] as const

test.each(leaveBehind)(
  'fails a region with %s left under it',
  async (_, fixture, field) => {
    const findings = await engine.checkRedaction(await fixtureBytes(fixture), {
      regions: regionsOf(fixture),
    })
    const [region] = manifest[fixture].regions ?? []
    expect(findings.candidates).toEqual([
      expect.objectContaining({
        page: 0,
        rect: boundsOf(region?.quad ?? []),
        kind: 'region',
        [field]: 'present',
        verdict: 'content-remains',
      }),
    ])
  }
)

/**
 * Fixtures the engine redacts, each with content under every region before the apply. check-image
 * stands in for redact-image-flate, whose region covers a part of one flat colour that the check
 * already counts as blank.
 */
const redactable = [
  'redact-text',
  'check-image',
  'redact-path',
  'redact-annotations',
  'redact-foreign-mark',
  'redact-hidden-layer',
] as const

test('passes every region of a file the engine redacted', async () => {
  for (const fixture of redactable) {
    const regions = regionsOf(fixture)
    // The control: before the apply the same regions find content, so the check looked.
    const before = await engine.checkRedaction(await fixtureBytes(fixture), { regions })
    expect(before.candidates.length, fixture).toBe(regions.length)
    for (const candidate of before.candidates)
      expect(candidate.verdict, fixture).toBe('content-remains')

    const findings = await engine.checkRedaction(await redacted(fixture), { regions })
    expect(findings.candidates.length, fixture).toBe(regions.length)
    // Each mark's overlay is drawing in the page now; the check knows it by its tag.
    for (const candidate of findings.candidates)
      expect(candidate, fixture).toMatchObject({
        kind: 'region',
        text: 'none',
        image: 'none',
        drawing: 'none',
        verdict: 'clean',
      })
    expect(findings.file.metadata, fixture).toBe(false)
  }
})

test("does not fail on text that only touches a mark's edge", async () => {
  // SECRET-ALPHA ends in an A whose glyph box, from Helvetica's bounds, ends at x 203.1. Its
  // advance ends at 203.36, inside the 1 pt the check's second test shrinks a region by.
  const edge = 203.1
  const source = await fixtureBytes('redact-text')
  const just = await engine.checkRedaction(source, {
    regions: [box(edge - 0.01, 190, 290, 225)],
  })
  expect(just.candidates[0]?.text).toBe('present')

  const bytes = await redacted('redact-text', [
    mark('touching', { page: 0, quad: [edge, 225, 290, 225, edge, 190, 290, 190] }),
  ])
  const findings = await engine.checkRedaction(bytes, {
    regions: [box(edge, 190, 290, 225)],
  })
  expect(findings.candidates).toEqual([
    expect.objectContaining({ text: 'none', drawing: 'none', verdict: 'clean' }),
  ])
  expect(await firstPageText(bytes)).toContain('SECRET-ALPHA')
})

test('finds a black box over text', async () => {
  const findings = await engine.checkRedaction(await fixtureBytes('bad-black-box'))
  expect(findings.candidates).toEqual([
    {
      page: 0,
      rect: { x: 45, y: 190, width: 170, height: 35 },
      kind: 'filled-box',
      text: 'present',
      image: 'none',
      drawing: 'none',
      verdict: 'content-remains',
    },
  ])
})

test('reports an unapplied redact annotation', async () => {
  const findings = await engine.checkRedaction(await fixtureBytes('bad-unapplied'))
  expect(findings.candidates).toEqual([
    expect.objectContaining({
      kind: 'redact-annotation',
      text: 'present',
      verdict: 'unapplied',
    }),
  ])
})

test('counts earlier versions', async () => {
  const findings = await engine.checkRedaction(await fixtureBytes('bad-appended'))
  expect(findings.file.earlierVersions).toBe(1)
  // The page as the last revision draws it has nothing to find.
  expect(findings.candidates).toEqual([])
  const rewritten = await engine.checkRedaction(await redacted('redact-text'))
  expect(rewritten.file.earlierVersions).toBe(0)
})

test('reports nothing found for a file with no candidates', async () => {
  const findings = await engine.checkRedaction(await fixtureBytes('redact-text'))
  expect(findings).toEqual({
    candidates: [],
    file: {
      earlierVersions: 0,
      metadata: true,
      attachments: 0,
      scripts: false,
      hiddenLayers: false,
      signed: false,
    },
  })
})

test('never returns text from the file', async () => {
  const fixtures: FixtureName[] = [
    ...leaveBehind.map(([, fixture]) => fixture),
    'bad-black-box',
    'bad-unapplied',
    'bad-appended',
  ]
  for (const fixture of fixtures) {
    const { secrets = [], keeps = [] } = manifest[fixture]
    const bytes = await fixtureBytes(fixture)
    for (const options of [{ regions: regionsOf(fixture) }, {}]) {
      const json = JSON.stringify(await engine.checkRedaction(bytes, options))
      for (const word of [...secrets, ...keeps, 'KEEP', 'BETA'])
        expect(json, `${fixture}: ${word}`).not.toContain(word)
    }
  }
})

test('needs the password for an encrypted file', async () => {
  const bytes = await fixtureBytes('encrypted-aes')
  await expect(engine.checkRedaction(bytes)).rejects.toMatchObject({
    name: 'EngineError',
    code: 'password-required',
  })
  await expect(engine.checkRedaction(bytes, { password: 'wrong' })).rejects.toMatchObject(
    {
      code: 'password-incorrect',
    }
  )
  const findings = await engine.checkRedaction(bytes, {
    password: 'inkbar',
    regions: [box(70, 695, 95, 715)],
  })
  // The page's one word, Encrypted, starts at x 72 on the baseline y 700.
  expect(findings.candidates).toEqual([
    expect.objectContaining({ text: 'present', verdict: 'content-remains' }),
  ])
})

test('makes one candidate of a region with several quads', async () => {
  const [over] = regionsOf('redact-text') as [RedactionRegion]
  const elsewhere = box(50, 20, 100, 40).quads[0]!
  const findings = await engine.checkRedaction(await fixtureBytes('redact-text'), {
    regions: [{ page: 0, quads: [elsewhere, ...over.quads] }, box(50, 20, 100, 40)],
  })
  expect(findings.candidates).toEqual([
    expect.objectContaining({
      rect: { x: 45, y: 20, width: 170, height: 205 },
      text: 'present',
      verdict: 'content-remains',
    }),
    expect.objectContaining({
      rect: { x: 50, y: 20, width: 50, height: 20 },
      verdict: 'clean',
    }),
  ])
})

test('lists regions page by page, in the order given on a page', async () => {
  const bytes = await fixtureBytes('redact-foreign-mark')
  // Page 1 has SECRET-GAMMA under the other program's mark, at the same place as page 0's region.
  const [first] = regionsOf('redact-foreign-mark') as [RedactionRegion]
  const empty = box(50, 20, 100, 40)
  const findings = await engine.checkRedaction(bytes, {
    regions: [{ ...first, page: 1 }, empty, first],
  })
  // Page by page, so `region` says which of the regions given each candidate answers.
  expect(findings.candidates.map((c) => [c.page, c.region, c.rect.y, c.verdict])).toEqual(
    [
      [0, 1, 20, 'clean'],
      [0, 2, 190, 'content-remains'],
      [1, 0, 190, 'content-remains'],
    ]
  )
})

test('gives no region index to a candidate it found itself', async () => {
  const findings = await engine.checkRedaction(await fixtureBytes('bad-black-box'))
  expect(findings.candidates).toHaveLength(1)
  expect(findings.candidates[0]).not.toHaveProperty('region')
})

test('checks no page for an empty list of regions', async () => {
  const findings = await engine.checkRedaction(await fixtureBytes('bad-black-box'), {
    regions: [],
  })
  expect(findings.candidates).toEqual([])
})

test('rejects regions it cannot read with a RangeError', async () => {
  const bytes = await fixtureBytes('redact-text')
  const bad: unknown[] = [
    [{ ...box(0, 0, 10, 10), page: 1 }],
    [{ ...box(0, 0, 10, 10), page: -1 }],
    [{ page: 0, quads: [] }],
    [{ page: 0.5, quads: box(0, 0, 10, 10).quads }],
    // Finite here, infinite as the 32-bit float the fork takes.
    [box(0, 0, 10, 1e39)],
    [
      {
        page: 0,
        quads: [{ ...box(0, 0, 10, 10).quads[0], p4: { x: Number.NaN, y: 0 } }],
      },
    ],
    'not a list',
  ]
  for (const regions of bad)
    await expect(
      engine.checkRedaction(bytes, { regions: regions as RedactionRegion[] }),
      JSON.stringify(regions)
    ).rejects.toBeInstanceOf(RangeError)
  // The engine still works.
  expect((await engine.checkRedaction(bytes)).candidates).toEqual([])
})

test('does not touch a document the engine has open', async () => {
  const doc = await engine.open(await fixtureBytes('redact-text'))
  try {
    await doc.redact({ marks: marksOf('redact-text') })
    const findings = await engine.checkRedaction(await fixtureBytes('check-form-text'), {
      regions: regionsOf('check-form-text'),
    })
    expect(findings.candidates[0]?.verdict).toBe('content-remains')
    const saved = await doc.save()
    expect(await firstPageText(saved)).not.toContain('SECRET')
    const after = await engine.checkRedaction(saved, {
      regions: regionsOf('redact-text'),
    })
    expect(after.candidates[0]?.verdict).toBe('clean')
  } finally {
    await doc.close()
  }
})

test('a signal aborts a queued check', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    engine.checkRedaction(await fixtureBytes('redact-text'), {
      signal: controller.signal,
    })
  ).rejects.toMatchObject({ code: 'aborted' })
})

/** A core whose `name` function returns `value`, the rest as the module has them. */
async function coreWith(
  name: keyof Native,
  value: (native: Awaited<ReturnType<typeof loadNative>>) => number
) {
  const native = await loadNative({ wasm })
  const fn: Native = { ...native.fn, [name]: () => value(native) }
  return new EngineCore(withFunctions(native, fn))
}

/** A NUL-terminated report in the module's memory, as the fork returns one. */
function report(native: Awaited<ReturnType<typeof loadNative>>, text: string): number {
  const bytes = new TextEncoder().encode(`${text}\0`)
  const pointer = native.fn.malloc(bytes.length)
  native.HEAPU8.set(bytes, pointer)
  return pointer
}

test('a page it could not inspect fails the check and keeps the engine', async () => {
  // The fork returns NULL when it reaches a limit; that never means nothing was found.
  const core = await coreWith('INK_Inspect_Page', () => 0)
  const bytes = await fixtureBytes('bad-black-box')
  for (const regions of [undefined, regionsOf('redact-text')]) {
    let error: unknown
    try {
      core.checkRedaction(bytes, regions ? { regions } : {})
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(EngineError)
    expect(error).toMatchObject({ code: 'check-failed', page: 0 })
  }
  expect(core.stopped).toBe(false)
  expect(core.openCount).toBe(0)
  core.destroy()
})

/** One entry of a page report, with nothing under it. */
const entry = (kind: string) =>
  `{"index":0,"rect":[0,0,1,1],"kind":"${kind}","textChars":0,"imagesNotBlank":0,"paths":0,"patternContent":0,"annotationText":0,"annotationImages":0}`

test('a region in a report of candidates fails the check', async () => {
  const core = await coreWith('INK_Inspect_Page', (native) =>
    report(native, `{"regions":[${entry('region')}]}`)
  )
  const bytes = await fixtureBytes('redact-text')
  expect(() => core.checkRedaction(bytes)).toThrow(
    expect.objectContaining({ code: 'check-failed', page: 0 })
  )
  expect(core.stopped).toBe(false)
  core.destroy()
})

test('a report it cannot read fails the check', async () => {
  const cases: [keyof Native, string][] = [
    ['INK_Inspect_Page', '{not json'],
    ['INK_Inspect_Page', '{"regions":[{"rect":[0,0,1,1],"kind":"region"}]}'],
    ['INK_Inspect_Page', '{"regions":[]}'],
    ['INK_Inspect_File', '{"revisions":1}'],
    // Strict mode answered with a candidate the fork found itself.
    ['INK_Inspect_Page', `{"regions":[${entry('filled-box')}]}`],
  ]
  const bytes = await fixtureBytes('redact-text')
  for (const [name, text] of cases) {
    const core = await coreWith(name, (native) => report(native, text))
    expect(
      () => core.checkRedaction(bytes, { regions: regionsOf('redact-text') }),
      text
    ).toThrow(expect.objectContaining({ code: 'check-failed' }))
    expect(core.stopped).toBe(false)
    core.destroy()
  }
})
