import { readFile } from 'node:fs/promises'

import { fixtureBytes, manifest, type FixtureName } from '@inkbar/fixtures'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createEngine, type Engine, type EngineDocument } from './index.ts'

let engine: Engine

beforeAll(async () => {
  const wasm = await readFile(new URL('../vendor/inkbar-pdfium.wasm', import.meta.url))
  engine = await createEngine({ wasm, worker: false })
})

afterAll(async () => {
  await engine.destroy()
})

type Meta = (typeof manifest)[FixtureName]

const openable = Object.entries(manifest).filter(([, meta]) => meta.opens) as [
  FixtureName,
  Meta,
][]

async function opened<T>(
  bytes: Uint8Array,
  use: (doc: EngineDocument) => Promise<T>,
  password?: string
): Promise<T> {
  const doc = await engine.open(bytes, password ? { password } : {})
  try {
    return await use(doc)
  } finally {
    await doc.close()
  }
}

const fixture = <T>(name: FixtureName, use: (doc: EngineDocument) => Promise<T>) =>
  fixtureBytes(name).then((bytes) => opened(bytes, use, manifest[name].password))

/** A PDF of `bodies`, object n at bodies[n - 1] and object 1 the catalog. */
function pdf(bodies: string[]): Uint8Array {
  let text = '%PDF-1.7\n'
  const offsets: number[] = []
  bodies.forEach((body, i) => {
    offsets.push(text.length)
    text += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = text.length
  text += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) text += `${String(offset).padStart(10, '0')} 00000 n \n`
  text += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(text, 'latin1'))
}

/**
 * A one-page file: 1 catalog (with `catalog` added), 2 the page tree, 3 the page with `annots`
 * as its /Annots, then `rest` from object 4.
 */
const onePage = (annots: string, rest: string[] = [], catalog = '') =>
  pdf([
    `<< /Type /Catalog /Pages 2 0 R ${catalog} >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Annots ${annots} >>`,
    ...rest,
  ])

/** A save, less the /ID PDFium makes fresh on every save of the same document. */
const withoutId = (saved: Uint8Array) =>
  Buffer.from(saved)
    .toString('latin1')
    .replace(/\/ID\s*\[[^\]]*\]/g, '/ID[]')

describe.each(openable)('%s', (name, meta) => {
  test('every read resolves', async () => {
    await fixture(name, async (doc) => {
      const facts = await doc.documentFacts()
      if (meta.password) expect(facts.encrypted).toBe(true)
      for (let page = 0; page < doc.pageCount; page++) {
        const { annotations } = await doc.pageAnnotations(page)
        expect(annotations.map((a) => a.index)).toEqual(
          [...annotations.map((a) => a.index)].sort((a, b) => a - b)
        )
      }
      const form = await doc.formFields()
      for (const field of form.fields)
        for (const widget of field.widgets)
          expect(widget.page).toBeLessThan(doc.pageCount)
    })
  })
})

test("form-fields gives each field's name, kind and widget count", async () => {
  const form = await fixture('form-fields', (doc) => doc.formFields())
  expect(form.kind).toBe('acroform')
  expect(form.tooLarge).toBe(false)
  expect(form.truncated).toBe(false)
  expect(form.fields.map((f) => [f.name, f.kind, f.widgets.length])).toEqual([
    ['name', 'text', 1],
    ['notes', 'text', 1],
    ['pin', 'text', 1],
    ['code', 'text', 1],
    ['auto', 'text', 1],
    ['locked', 'text', 1],
    ['email', 'text', 1],
    ['internal', 'text', 1],
    ['agree', 'checkbox', 1],
    ['plan', 'radio', 2],
    ['shared', 'radio', 2],
    ['country', 'combo', 1],
    ['city', 'combo', 1],
    ['interests', 'list', 1],
    ['header.ref', 'text', 2],
    ['rotated', 'text', 1],
    ['styled', 'text', 1],
    ['sig', 'signature', 1],
    ['sig2', 'signature', 1],
    ['reset', 'button', 1],
  ])
  const plan = form.fields.find((f) => f.name === 'plan')
  expect(plan).toMatchObject({
    valueKind: 'name',
    value: 'monthly',
    defaultValue: 'yearly',
  })
  expect(plan?.widgets.map((w) => [w.onState, w.appearanceState])).toEqual([
    ['monthly', 'monthly'],
    ['yearly', 'Off'],
  ])
  expect(form.fields.find((f) => f.name === 'country')?.options).toEqual([
    { exportValue: 'gb', displayValue: 'United Kingdom' },
    { exportValue: 'fr', displayValue: 'France' },
  ])
  const header = form.fields.find((f) => f.name === 'header.ref')
  expect(header?.widgets.map((w) => [w.page, w.index, w.rotation])).toEqual([
    [0, 16, 0],
    [1, 0, 90],
  ])
  expect(form.fields.find((f) => f.name === 'reset')?.widgets[0]?.action).toEqual({
    kind: 'ResetForm',
    reset: { fields: [], refs: [], flags: 0 },
  })
})

test("acroform-basic's checkbox lists its states in the file's order", async () => {
  const form = await fixture('acroform-basic', (doc) => doc.formFields())
  const agree = form.fields.find((f) => f.name === 'agree')
  expect(agree?.kind).toBe('checkbox')
  expect(agree?.widgets[0]).toMatchObject({
    appearance: 'states',
    appearanceStates: ['Off', 'Yes'],
    appearanceState: 'Off',
    onState: 'Yes',
    exportValue: 'Yes',
  })
})

test('form-scripted gives each widget its scripts by key, as text', async () => {
  const form = await fixture('form-scripted', (doc) => doc.formFields())
  expect(form.fields.find((f) => f.name === 'total')?.widgets[0]?.scripts).toEqual({
    C: ['AFSimple_Calculate("PRD", new Array("qty", "price"))'],
    F: ['AFNumber_Format(2, 0, 0, 0, "£", true)'],
  })
})

test('annotations written as direct objects have no object number', async () => {
  const { annotations } = await fixture('annot-direct', (doc) => doc.pageAnnotations(0))
  expect(
    annotations.map((a) => [a.index, a.subtype, a.objectNumber, a.generation])
  ).toEqual([
    [0, 'Square', 7, 0],
    [1, 'Square', undefined, undefined],
    [2, 'Highlight', undefined, undefined],
  ])
  expect(annotations[1]).not.toHaveProperty('objectNumber')
  expect(annotations[2]).toMatchObject({
    rect: [72, 540, 272, 560],
    rectOk: true,
    quads: [72, 560, 272, 560, 72, 540, 272, 540],
    color: [1, 1, 0],
    contents: 'A Highlight written inline',
    hasAppearance: true,
    appearance: 'stream',
    appearanceStates: [],
  })
})

test('form-tree reports the inherited kind, flags and value under the full name', async () => {
  const form = await fixture('form-tree', (doc) => doc.formFields())
  expect(form.fieldTreeDepth).toBe(3)
  expect(form.fields.find((f) => f.name === 'group.sub.a')).toMatchObject({
    kind: 'text',
    flags: 4096,
    valueKind: 'string',
    value: 'inherited text',
    widgets: [{ page: 0, index: 0, defaultAppearance: '/Helv 12 Tf 0 g' }],
  })
})

test("form-rollover's checkbox lists the state with a space in its name", async () => {
  const form = await fixture('form-rollover', (doc) => doc.formFields())
  const [go, agree] = form.fields
  expect(go).toMatchObject({ name: 'go', kind: 'button' })
  expect(go?.widgets[0]).toMatchObject({ hasAppearance: false, appearanceStates: [] })
  expect(go?.widgets[0]).not.toHaveProperty('appearance')
  expect(agree).toMatchObject({ name: 'agree', kind: 'checkbox', value: 'Yes No' })
  expect(agree?.widgets[0]).toMatchObject({
    appearanceStates: ['Yes No'],
    appearanceState: 'Yes No',
    onState: 'Yes No',
  })
})

test('a file with no form gives kind none and no fields', async () => {
  const form = await fixture('annot-direct', (doc) => doc.formFields())
  expect(form).toEqual({
    kind: 'none',
    needAppearances: false,
    fields: [],
    calculationOrder: [],
    calculationOrderRefs: [],
    fieldTreeDepth: 0,
    fieldTreeRevisits: false,
    tooLarge: false,
    truncated: false,
  })
})

describe('document facts', () => {
  test('a file with no encryption was opened as none', async () => {
    expect(await fixture('annot-direct', (doc) => doc.documentFacts())).toEqual({
      title: 'Form edge fixture',
      encrypted: false,
      openedAs: 'none',
    })
  })

  test('the user password opens as user, though the engine lifts the permission flags', async () => {
    expect(await fixture('encrypted-aes', (doc) => doc.documentFacts())).toMatchObject({
      encrypted: true,
      openedAs: 'user',
    })
  })

  test('the owner password opens as owner', async () => {
    const bytes = await fixtureBytes('signed-encrypted')
    expect(await opened(bytes, (doc) => doc.documentFacts())).toMatchObject({
      openedAs: 'user',
    })
    expect(
      await opened(bytes, (doc) => doc.documentFacts(), 'owner-secret')
    ).toMatchObject({ encrypted: true, openedAs: 'owner' })
  })
})

test.each([-1, 1, 0.5, Number.NaN])(
  'a page index of %s rejects with a RangeError',
  async (index) => {
    await fixture('annot-direct', async (doc) => {
      await expect(doc.pageAnnotations(index)).rejects.toBeInstanceOf(RangeError)
    })
  }
)

test('reading the facts, annotations and form changes nothing a later save writes', async () => {
  const bytes = await fixtureBytes('form-fields')
  const unread = await opened(bytes, (doc) => doc.save())
  const read = await opened(bytes, async (doc) => {
    await doc.documentFacts()
    for (let page = 0; page < doc.pageCount; page++) await doc.pageAnnotations(page)
    await doc.formFields()
    return doc.save()
  })
  expect(withoutId(read)).toBe(withoutId(unread))
})

describe('a form whose shape is odd', () => {
  const form = (bytes: Uint8Array) => opened(bytes, (doc) => doc.formFields())

  test('an AcroForm with no fields gives none', async () => {
    const result = await form(onePage('[]', [], '/AcroForm << /Fields [] >>'))
    expect(result).toMatchObject({ kind: 'acroform', fields: [], truncated: false })
  })

  test('a widget no page holds is at page -1 and index -1', async () => {
    const result = await form(
      onePage(
        '[]',
        ['<< /FT /Tx /T (loose) /Subtype /Widget /Rect [0 0 10 10] >>'],
        '/AcroForm << /Fields [4 0 R] >>'
      )
    )
    expect(result.fields).toMatchObject([
      { name: 'loose', origin: 'acroform', widgets: [{ page: -1, index: -1 }] },
    ])
  })

  test('a field with no widget has none', async () => {
    const result = await form(
      onePage(
        '[]',
        ['<< /FT /Tx /T (bare) /V (kept) >>'],
        '/AcroForm << /Fields [4 0 R] >>'
      )
    )
    expect(result.fields.filter((f) => f.name === 'bare')).toMatchObject([
      { kind: 'text', value: 'kept', widgets: [] },
    ])
  })

  test('a field with no name is left out; a widget only a page holds is recovered', async () => {
    const result = await form(
      onePage(
        '[4 0 R 5 0 R]',
        [
          '<< /FT /Tx /Subtype /Widget /Rect [0 0 10 10] /P 3 0 R >>',
          '<< /FT /Tx /T (swept) /Subtype /Widget /Rect [0 20 10 30] /P 3 0 R >>',
        ],
        '/AcroForm << /Fields [4 0 R] >>'
      )
    )
    expect(result.fields.map((f) => [f.name, f.origin, f.widgets[0]?.index])).toEqual([
      ['swept', 'recovered', 1],
    ])
  })

  test('a field tree that loops is read once and says it revisits', async () => {
    const result = await form(
      onePage(
        '[6 0 R]',
        [
          '<< /T (top) /FT /Tx /Kids [5 0 R] >>',
          '<< /T (mid) /Kids [6 0 R] /Parent 4 0 R >>',
          '<< /T (leaf) /Kids [4 0 R] /Parent 5 0 R /Subtype /Widget /Rect [0 0 10 10] /P 3 0 R >>',
        ],
        '/AcroForm << /Fields [4 0 R] >>'
      )
    )
    expect(result.fieldTreeRevisits).toBe(true)
  })

  test('a field tree 1,001 levels deep is cut at 1,000', async () => {
    const depth = 1001
    const bodies = Array.from({ length: depth }, (_, i) => {
      const n = 4 + i
      const parent = i > 0 ? `/Parent ${n - 1} 0 R` : '/FT /Tx'
      return i < depth - 1
        ? `<< /T (l${i}) ${parent} /Kids [${n + 1} 0 R] >>`
        : `<< /T (l${i}) ${parent} /Subtype /Widget /Rect [0 0 10 10] /P 3 0 R >>`
    })
    const result = await form(onePage('[]', bodies, '/AcroForm << /Fields [4 0 R] >>'))
    expect(result.fieldTreeDepth).toBe(1000)
    expect(result.truncated).toBe(true)
  })

  test('a form of more than 50,000 fields is refused, with its calculation order', async () => {
    const fields = Array.from({ length: 50_001 }, (_, i) => `<< /FT /Tx /T (f${i}) >>`)
    const result = await form(
      onePage(
        '[]',
        ['<< /T (co) /FT /Tx >>'],
        `/AcroForm << /Fields [${fields.join(' ')}] /CO [4 0 R] >>`
      )
    )
    expect(result).toMatchObject({
      fields: [],
      tooLarge: true,
      calculationOrder: [-1],
      calculationOrderRefs: [{ objectNumber: 4, generation: 0 }],
    })
  })
})

describe('an annotation whose dictionary is wrong', () => {
  const annotations = async (annots: string, rest: string[] = []) =>
    opened(onePage(annots, rest), (doc) => doc.pageAnnotations(0))

  test('a missing or short /Rect is reported as written and not ok', async () => {
    const { annotations: list } = await annotations(
      '[<< /Subtype /Square >> << /Subtype /Square /Rect [1 2 3] >> << /Subtype /Square /Rect [0 0 (a) 5] >>]'
    )
    expect(list.map((a) => [a.rect, a.rectOk])).toEqual([
      [null, false],
      [[1, 2, 3], false],
      [[0, 0, null, 5], false],
    ])
  })

  test('a colour of five components is given whole', async () => {
    const { annotations: list } = await annotations(
      '[<< /Subtype /Square /Rect [0 0 10 10] /C [0.1 0.2 0.3 0.4 0.5] >>]'
    )
    // PDFium holds a number as a 32-bit float, and the report writes 9 significant digits.
    const color = list[0]?.color ?? []
    expect(color).toHaveLength(5)
    color.forEach((c, i) => {
      expect(c).toBeCloseTo((i + 1) / 10, 6)
    })
  })

  test('/Contents in no text encoding comes back as its bytes', async () => {
    const { annotations: list } = await annotations(
      '[<< /Subtype /Text /Rect [0 0 10 10] /Contents <417F42> >>]'
    )
    expect(list[0]?.contents).toEqual({ bytes: new Uint8Array([0x41, 0x7f, 0x42]) })
  })

  test('/IRT naming the annotation itself is reported as written', async () => {
    const { annotations: list } = await annotations('[4 0 R]', [
      '<< /Subtype /Text /Rect [0 0 10 10] /IRT 4 0 R >>',
    ])
    expect(list[0]).toMatchObject({
      objectNumber: 4,
      inReplyTo: { objectNumber: 4, generation: 0 },
    })
  })

  test('an ink list of 1,000,000 points is cut and says so', async () => {
    const points = '1 2 '.repeat(1_000_000)
    const { annotations: list } = await annotations(
      `[<< /Subtype /Ink /Rect [0 0 10 10] /InkList [[${points}]] >>]`
    )
    expect(list[0]?.truncated).toBe(true)
    expect(list[0]?.inkLists?.[0]).toHaveLength(1_000_000)
  })
})
