import { readFile } from 'node:fs/promises'

import { fixtureBytes, manifest, type FixtureName } from '@inkbar/fixtures'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  createEngine,
  type AnnotationFacts,
  type Engine,
  type EngineDocument,
  type Rect,
} from './index.ts'

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

test('form-values reports /I, null values, names in a list and Launch and GoToR files', async () => {
  const form = await fixture('form-values', (doc) => doc.formFields())
  const byName = (name: string) => form.fields.find((f) => f.name === name)
  const bytes = (text: string) => new TextEncoder().encode(text)
  expect(byName('listbox')).toMatchObject({ value: 'a', selectedIndices: [1, 2] })
  expect(byName('combo')).toMatchObject({ value: 'x', selectedIndices: [2] })
  // /I sits on the field; its widget is a separate kid without one.
  expect(byName('kidlist')).toMatchObject({
    value: 'p',
    selectedIndices: [2],
    widgets: [{ objectNumber: 28 }],
  })
  expect(byName('nulled')).toMatchObject({
    valueKind: 'none',
    valueNull: true,
    defaultValue: 'default text',
  })
  expect(byName('unset')).toMatchObject({
    valueKind: 'none',
    defaultValue: 'default text',
  })
  expect(byName('unset')).not.toHaveProperty('valueNull')
  expect(byName('names')).toMatchObject({
    valueKind: 'array',
    value: [{ name: 'Alpha' }, 'beta'],
  })
  expect(byName('launch')?.widgets[0]?.action).toEqual({
    kind: 'Launch',
    fileKind: 'string',
    file: bytes('https://example.com/launch.pdf'),
  })
  expect(byName('remote')?.widgets[0]?.action).toEqual({
    kind: 'GoToR',
    fileKind: 'spec',
    specFile: bytes('other.pdf'),
    specUnicodeFile: bytes('ftp://example.com/other.pdf'),
  })
  expect(byName('consent')).toMatchObject({
    kind: 'checkbox',
    value: 'Yes',
    defaultValue: '2',
    widgets: [{ onState: 'Yes', exportValue: 'Agreed' }],
  })
  for (const field of form.fields) expect(field).not.toHaveProperty('truncated')
})

test('border-dashes reports each dash as the file writes it, an invalid one included', async () => {
  const { annotations } = await fixture('border-dashes', (doc) => doc.pageAnnotations(0))
  expect(
    annotations.map(({ borderStyle, border, borderDash }) => ({
      borderStyle,
      border,
      borderDash,
    }))
  ).toEqual([
    {
      borderStyle: { width: 2, style: 'D', dash: [3, 2] },
      border: undefined,
      borderDash: undefined,
    },
    { borderStyle: undefined, border: [0, 0, 1], borderDash: [4, 2] },
    {
      borderStyle: { width: 2, style: 'D', dash: [-1, 2] },
      border: undefined,
      borderDash: undefined,
    },
    { borderStyle: undefined, border: [0, 0, 1], borderDash: [0, 0] },
    {
      borderStyle: { width: 1, style: 'D', dash: [3, 2] },
      border: undefined,
      borderDash: undefined,
    },
    { borderStyle: undefined, border: [0, 0, 2], borderDash: [4, 2] },
    {
      borderStyle: { width: 1, style: null, dash: [-3] },
      border: undefined,
      borderDash: undefined,
    },
  ])
  const form = await fixture('border-dashes', (doc) => doc.formFields())
  expect(
    form.fields.map((f) => f.widgets[0]?.borderDash ?? f.widgets[0]?.borderStyle?.dash)
  ).toEqual([[3, 2], [4, 2], [-3]])
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

describe('scripts', () => {
  test('a file with no JavaScript gives empty facts', async () => {
    expect(await fixture('form-fields', (doc) => doc.scripts())).toEqual({
      document: [],
      documentActions: {},
      pageActions: [],
      truncated: false,
    })
  })

  test('document scripts, the open action and page actions come back as text', async () => {
    const scripts = await fixture('redact-file-script', (doc) => doc.scripts())
    expect(scripts.truncated).toBe(false)
    expect(scripts.document.map((s) => s.source).join('\n')).toContain('SECRET-OMEGA')
    expect(scripts.documentActions.OpenAction?.join('\n')).toContain('SECRET-SIGMA')
    expect(scripts.pageActions).toMatchObject([{ page: 0 }])
    expect(Object.values(scripts.pageActions[0]?.scripts ?? {}).join('\n')).toContain(
      'SECRET-KAPPA'
    )
  })

  test('a page action alone is reported', async () => {
    expect(await fixture('script-page-only', (doc) => doc.scripts())).toEqual({
      document: [],
      documentActions: {},
      pageActions: [{ page: 0, scripts: { O: ["app.alert('page opened')"] } }],
      truncated: false,
    })
  })

  test('a document script name that is not a string is null', async () => {
    const bytes = onePage(
      '[]',
      [
        '<< /Names [7 5 0 R (b) 6 0 R] >>',
        '<< /S /JavaScript /JS (one()) >>',
        '<< /S /JavaScript /JS (two()) >>',
      ],
      '/Names << /JavaScript 4 0 R >>'
    )
    const scripts = await opened(bytes, (doc) => doc.scripts())
    expect(scripts.document).toEqual([
      { name: null, source: 'one()' },
      { name: 'b', source: 'two()' },
    ])
  })
})

describe('structureOrder', () => {
  test("gives the annotations' object numbers in the structure tree's order", async () => {
    const result = await fixture('form-structure', async (doc) => {
      const { annotations } = await doc.pageAnnotations(0)
      const order = await doc.structureOrder(0)
      return { annotations, order, second: await doc.structureOrder(1) }
    })
    const third = result.annotations[2]?.objectNumber
    const first = result.annotations[0]?.objectNumber
    expect(result.order).toEqual({ order: [third, first], truncated: false })
    expect(result.second).toEqual({ order: [], truncated: false })
  })

  test('a file with no structure tree gives none', async () => {
    expect(await fixture('form-fields', (doc) => doc.structureOrder(0))).toEqual({
      order: [],
      truncated: false,
    })
  })

  test.each([-1, 2, 0.5])(
    'a page index of %s rejects with a RangeError',
    async (index) => {
      await fixture('form-structure', async (doc) => {
        await expect(doc.structureOrder(index)).rejects.toBeInstanceOf(RangeError)
      })
    }
  )
})

/**
 * Straight RGBA `over` laid on opaque `under`, rounded down as PDFium rounds when it lays a page
 * on white. Rounding to nearest instead puts hundreds of edge pixels one level off.
 */
function layOver(over: Uint8ClampedArray, under: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(under.length)
  for (let i = 0; i < under.length; i += 4) {
    const a = over[i + 3] as number
    for (let c = 0; c < 3; c++)
      out[i + c] = Math.floor(
        ((over[i + c] as number) * a + (under[i + c] as number) * (255 - a)) / 255
      )
    out[i + 3] = 255
  }
  return out
}

/** The largest difference of any colour channel, and how many channels differ at all. */
function difference(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray
): { worst: number; count: number } {
  let worst = 0
  let count = 0
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs((a[i] as number) - (b[i] as number))
    if (d > 0) count++
    if (d > worst) worst = d
  }
  return { worst, count }
}

const formFixtures = openable
  .map(([name]) => name)
  .filter((name) => name.startsWith('form-') || name.startsWith('acroform'))
const ROTATIONS = [0, 90, 180, 270] as const

describe('renderAnnotations', () => {
  /**
   * The page drawn with its widgets left out, each widget drawn alone laid over it, against the
   * page drawn whole.
   */
  async function compare(
    doc: EngineDocument,
    page: number,
    options: { scale?: number; region?: Rect; size?: { width: number; height: number } },
    rotation: (typeof ROTATIONS)[number],
    pick: (a: AnnotationFacts) => boolean = (a) => a.subtype === 'Widget'
  ) {
    const { annotations } = await doc.pageAnnotations(page)
    const widgets = annotations.filter(pick)
    const bare = await doc.renderPage(page, {
      ...options,
      rotation,
      hide: widgets.map((w) => ({ index: w.index })),
    })
    const whole = await doc.renderPage(page, { ...options, rotation })
    const info = await doc.pageInfo(page)
    const alone = await doc.renderAnnotations(page, {
      annotations: widgets.map((w) => ({ index: w.index })),
      region: options.region ?? info.box,
      size: options.size ?? { width: bare.width, height: bare.height },
      rotation,
    })
    expect([alone.width, alone.height]).toEqual([bare.width, bare.height])
    const changed = difference(bare.data, whole.data).count
    const result = difference(layOver(alone.data, bare.data), whole.data)
    // Where a widget's soft edge lies on the page's own soft edge, the page render blends the two
    // in one integer step and the test in two; elsewhere either the widget or the page decides
    // the pixel alone.
    const overlap = new Uint8Array(bare.data.length)
    for (let i = 0; i < overlap.length; i += 4) {
      const a = alone.data[i + 3] as number
      const soft = a > 0 && a < 255
      for (let c = 0; c < 3; c++)
        overlap[i + c] = soft && bare.data[i + c] !== 255 ? 1 : 0
    }
    const composite = layOver(alone.data, bare.data)
    let worstOverlap = 0
    let worst = 0
    for (let i = 0; i < composite.length; i++) {
      const d = Math.abs((composite[i] as number) - (whole.data[i] as number))
      if (overlap[i]) worstOverlap = Math.max(worstOverlap, d)
      else worst = Math.max(worst, d)
    }
    return { widgets, alone, changed, count: result.count, worst, worstOverlap }
  }

  /**
   * The bound on the channels that differ at all, as a share of those the widgets change on the
   * page. The most measured over every form fixture, scale, rotation and region is 0.0264
   * (form-shared-scripted at 2.37); this allows about twice that.
   */
  const SHARE = 0.05

  /**
   * Checks a comparison: something was drawn and changed the page, no pixel is more than one
   * level off (two where a widget's soft edge lies on the page's own; the most measured is 2,
   * at one pixel of form-fields), and few channels differ at all.
   */
  function within(result: Awaited<ReturnType<typeof compare>>, where: string) {
    expect(result.alone.drawn.length, where).toBeGreaterThan(0)
    expect(result.changed, where).toBeGreaterThan(0)
    expect(result.worst, `${where}: ${result.count} channels differ`).toBeLessThanOrEqual(
      1
    )
    expect(result.worstOverlap, where).toBeLessThanOrEqual(2)
    expect(result.count, where).toBeLessThanOrEqual(result.changed * SHARE)
  }

  describe.each(formFixtures)('%s', (name) => {
    test.each([1, 1.5, 2.37])(
      'each widget drawn alone lands on the pixels the page gives it, at scale %s',
      async (scale) => {
        await fixture(name, async (doc) => {
          for (let page = 0; page < doc.pageCount; page++)
            for (const rotation of ROTATIONS) {
              const result = await compare(doc, page, { scale }, rotation)
              if (result.widgets.length === 0) continue
              within(result, `page ${page}, rotation ${rotation}`)
            }
        })
      },
      120_000
    )
  })

  test.each(ROTATIONS)(
    'a region stretched to a size lands on the same pixels, turned %s',
    async (rotation) => {
      await fixture('form-fields', async (doc) => {
        for (let page = 0; page < doc.pageCount; page++) {
          const { box } = await doc.pageInfo(page)
          const region = {
            x: box.x + 11.3,
            y: box.y + 17.7,
            width: box.width * 0.9,
            height: box.height * 0.85,
          }
          const result = await compare(
            doc,
            page,
            { region, size: { width: 517, height: 389 } },
            rotation
          )
          within(result, `page ${page}`)
        }
      })
    },
    60_000
  )

  test.each(ROTATIONS)(
    'nothing past the page box is drawn, as in the page render, turned %s',
    async (rotation) => {
      // A square half off the corner of a 200 by 200 page.
      const square = '0 0 1 rg 0 0 100 100 re f'
      const bytes = onePage('[4 0 R]', [
        '<< /Type /Annot /Subtype /Square /Rect [150 150 250 250] /AP << /N 5 0 R >> >>',
        `<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Length ${square.length} >>\nstream\n${square}\nendstream`,
      ])
      await opened(bytes, async (doc) => {
        const result = await compare(
          doc,
          0,
          {
            region: { x: -50, y: -50, width: 300, height: 300 },
            size: { width: 300, height: 300 },
          },
          rotation,
          () => true
        )
        expect(result.alone.drawn).toEqual([0])
        within(result, `rotation ${rotation}`)
        // The square's quarter on the page, and none of the rest.
        const opaque = result.alone.data.filter((v, i) => i % 4 === 3 && v === 255)
        expect(opaque.length).toBe(50 * 50)
      })
    }
  )

  test('a checkbox drawn Off and in its on-state differ', async () => {
    await fixture('form-fields', async (doc) => {
      const form = await doc.formFields()
      const agree = form.fields.find((f) => f.name === 'agree')?.widgets[0]
      if (!agree?.onState) throw new Error('form-fields has no agree checkbox')
      const { box } = await doc.pageInfo(0)
      const draw = (state: string) =>
        doc.renderAnnotations(0, {
          annotations: [{ index: agree.index, state }],
          region: box,
          size: { width: 612, height: 792 },
        })
      const off = await draw('Off')
      const on = await draw(agree.onState)
      expect([off.drawn, on.drawn]).toEqual([[agree.index], [agree.index]])
      expect(on.data.some((b) => b !== 0)).toBe(true)
      expect(Buffer.from(on.data).equals(Buffer.from(off.data))).toBe(false)
    })
  })

  test('a state the widget lacks and a widget with nothing to draw are left out of drawn', async () => {
    await fixture('form-rollover', async (doc) => {
      const form = await doc.formFields()
      const go = form.fields.find((f) => f.name === 'go')?.widgets[0]
      const agree = form.fields.find((f) => f.name === 'agree')?.widgets[0]
      if (!go || !agree) throw new Error('form-rollover has no go or agree')
      const { box } = await doc.pageInfo(0)
      const result = await doc.renderAnnotations(0, {
        annotations: [
          { index: agree.index, state: 'Off' },
          { index: go.index },
          { index: agree.index, state: 'Yes No' },
          { index: 99 },
        ],
        region: box,
        size: { width: Math.ceil(box.width), height: Math.ceil(box.height) },
      })
      expect(result.drawn).toEqual([agree.index])
    })
  })

  test('drawing annotations alone changes nothing a later save writes', async () => {
    for (const name of ['form-fields', 'form-rollover', 'annot-direct'] as const) {
      const bytes = await fixtureBytes(name)
      const unread = await opened(bytes, (doc) => doc.save())
      const drawn = await opened(bytes, async (doc) => {
        for (let page = 0; page < doc.pageCount; page++) {
          const { annotations } = await doc.pageAnnotations(page)
          const { box } = await doc.pageInfo(page)
          await doc.renderAnnotations(page, {
            annotations: annotations.flatMap((a) => [
              { index: a.index },
              ...a.appearanceStates.map((state) => ({ index: a.index, state })),
            ]),
            region: box,
            size: { width: 300, height: 400 },
          })
        }
        return doc.save()
      })
      expect(withoutId(drawn), name).toBe(withoutId(unread))
    }
  })

  test('an aborted signal rejects with aborted', async () => {
    await fixture('form-fields', async (doc) => {
      const { box } = await doc.pageInfo(0)
      const options = {
        annotations: [{ index: 0 }],
        region: box,
        size: { width: 100, height: 100 },
      }
      await expect(
        doc.renderAnnotations(0, { ...options, signal: AbortSignal.abort() })
      ).rejects.toMatchObject({ code: 'aborted' })
      // Aborted while it waits behind a render.
      const controller = new AbortController()
      const render = doc.renderPage(0, { scale: 2 })
      const waiting = doc.renderAnnotations(0, { ...options, signal: controller.signal })
      controller.abort()
      await expect(waiting).rejects.toMatchObject({ code: 'aborted' })
      await render
    })
  })

  test('a draw asked for while the page renders waits for the render', async () => {
    await fixture('form-fields', async (doc) => {
      const { box } = await doc.pageInfo(0)
      const render = doc.renderPage(0, { scale: 3 })
      const alone = doc.renderAnnotations(0, {
        annotations: [{ index: 0 }],
        region: box,
        size: { width: 612, height: 792 },
      })
      expect((await alone).drawn).toEqual([0])
      expect((await render).width).toBe(1836)
    })
  })

  test('a state past 65,535 bytes or a list past 1,000,000 entries rejects and the engine goes on', async () => {
    await fixture('form-fields', async (doc) => {
      const { box } = await doc.pageInfo(0)
      const place = { region: box, size: { width: 10, height: 10 } }
      await expect(
        doc.renderAnnotations(0, {
          ...place,
          annotations: [{ index: 8, state: 'a'.repeat(200_000) }],
        })
      ).rejects.toBeInstanceOf(RangeError)
      await expect(
        doc.renderAnnotations(0, {
          ...place,
          annotations: Array.from({ length: 1_000_001 }, () => ({ index: 0 })),
        })
      ).rejects.toBeInstanceOf(RangeError)
      await expect(
        doc.renderPage(0, {
          hide: Array.from({ length: 1_000_001 }, () => ({ index: 0 })),
        })
      ).rejects.toBeInstanceOf(RangeError)
      // The longest state is taken; the widget has no such state.
      const longest = await doc.renderAnnotations(0, {
        ...place,
        annotations: [{ index: 8, state: 'a'.repeat(65_535) }],
      })
      expect(longest.drawn).toEqual([])
      expect((await doc.pageInfo(0)).width).toBe(612)
    })
  })

  test.each([
    ['no annotations list', { annotations: undefined }],
    ['an index that is not whole', { annotations: [{ index: 0.5 }] }],
    ['a negative index', { annotations: [{ index: -1 }] }],
    ['a state past one byte a character', { annotations: [{ index: 0, state: 'Ā' }] }],
    ['a state holding NUL', { annotations: [{ index: 0, state: 'a\u0000b' }] }],
    ['an empty state', { annotations: [{ index: 0, state: '' }] }],
    ['no region', { region: undefined }],
    ['no size', { size: undefined }],
    ['a rotation off the quarter turns', { rotation: 45 }],
  ])('%s rejects with a RangeError', async (_, change) => {
    await fixture('form-fields', async (doc) => {
      const { box } = await doc.pageInfo(0)
      const options = {
        annotations: [{ index: 0 }],
        region: box,
        size: { width: 100, height: 100 },
        ...change,
      }
      await expect(doc.renderAnnotations(0, options as never)).rejects.toBeInstanceOf(
        RangeError
      )
    })
  })
})

describe('hide by place in /Annots', () => {
  test('an annotation written as a direct object is left out of the page', async () => {
    await fixture('annot-direct', async (doc) => {
      const { annotations } = await doc.pageAnnotations(0)
      expect(annotations[1]).not.toHaveProperty('objectNumber')
      const plain = await doc.renderPage(0, { annotations: false })
      const whole = await doc.renderPage(0)
      const hidden = await doc.renderPage(0, { hide: [{ index: 1 }] })
      // The direct square drawn with the others left out.
      const square = await doc.renderPage(0, { hide: [{ index: 0 }, { index: 2 }] })
      const differ = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
        Array.from({ length: a.length / 4 }, (_, p) => p).filter((p) =>
          [0, 1, 2, 3].some((c) => a[p * 4 + c] !== b[p * 4 + c])
        )
      const drawn = new Set(differ(square.data, plain.data))
      const gone = differ(hidden.data, whole.data)
      expect(gone.length).toBeGreaterThan(0)
      // Only the square's pixels change.
      expect(gone.filter((p) => !drawn.has(p))).toEqual([])
      // Hiding every annotation by its place leaves the page as drawn without them.
      const all = await doc.renderPage(0, {
        hide: annotations.map((a) => ({ index: a.index })),
      })
      expect(Buffer.from(all.data).equals(Buffer.from(plain.data))).toBe(true)
    })
  })

  test('an object number and its place hide the same annotation', async () => {
    await fixture('annot-direct', async (doc) => {
      const byNumber = await doc.renderPage(0, { hide: [7] })
      const byPlace = await doc.renderPage(0, { hide: [{ index: 0 }] })
      expect(Buffer.from(byPlace.data).equals(Buffer.from(byNumber.data))).toBe(true)
    })
  })

  test.each([[[{ index: -1 }]], [[{ index: 0.5 }]], [[{ index: 2 ** 31 }]], [[{}]]])(
    'hide %j rejects with a RangeError',
    async (hide) => {
      await fixture('annot-direct', async (doc) => {
        await expect(doc.renderPage(0, { hide: hide as never })).rejects.toBeInstanceOf(
          RangeError
        )
      })
    }
  )
})
