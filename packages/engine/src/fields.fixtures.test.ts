import { readFile } from 'node:fs/promises'

import { fixtureBytes, type FixtureName } from '@inkbar/fixtures'
import { qpdfAvailable, qpdfCheck, requireQpdfInCi } from '@inkbar/fixtures/qpdf'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createEngine, EngineError, type Engine } from './index.ts'
import { EngineCore } from './native/core.ts'
import { loadNative } from './native/module.ts'
import { withFunctions } from './native/testing.ts'

import type { Native } from './native/functions.ts'
import type { WriteAnnotation, WriteField, WriteInput } from './types.ts'
import type { Annotation as GlossAnnotation } from 'gloss-format'

let engine: Engine
let wasm: Uint8Array
/** Every file a test saved, for the closing `qpdf --check`. */
const saves: { name: string; bytes: Uint8Array }[] = []

beforeAll(async () => {
  wasm = await readFile(new URL('../vendor/inkbar-pdfium.wasm', import.meta.url))
  engine = await createEngine({ wasm, worker: false })
  requireQpdfInCi()
})

afterAll(async () => {
  await engine.destroy()
})

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1')
/** A saved file with its /ID blanked: PDFium makes a new one on every save of these fixtures. */
const withoutId = (bytes: Uint8Array) =>
  latin1(bytes).replace(/\/ID\s*\[\s*<[0-9A-F]*>\s*<[0-9A-F]*>\s*\]/i, '/ID[]')

/** A file with an `/AcroForm` must give it `/Fields`: here every saved file has a form. */
function expectValidForm(saved: Uint8Array) {
  expect(latin1(saved)).toMatch(/\/Fields\s*\[/)
}

function keep(name: string, bytes: Uint8Array) {
  expectValidForm(bytes)
  saves.push({ name, bytes })
}

/** Opens a fixture (or bytes), writes `input`, saves with `mode` and closes. */
async function written(
  source: FixtureName | Uint8Array,
  input: WriteInput,
  options: { mode?: 'rewrite' | 'incremental' } = {}
): Promise<Uint8Array> {
  const bytes = typeof source === 'string' ? await fixtureBytes(source) : source
  const doc = await engine.open(bytes)
  try {
    await doc.write(input)
    const saved = await doc.save(options)
    keep(typeof source === 'string' ? source : 'bytes', saved)
    return saved
  } finally {
    await doc.close()
  }
}

/** The part of a PDF.js document these tests use. */
interface PdfjsDocument {
  getFieldObjects(): Promise<unknown>
  getPage(number: number): Promise<{
    getAnnotations(options?: { intent?: string }): Promise<unknown[]>
    getOperatorList(options: {
      annotationMode: number
    }): Promise<{ fnArray: number[]; argsArray: unknown[] }>
  }>
}

async function pdfjsDocument<T>(
  bytes: Uint8Array,
  use: (pdf: PdfjsDocument) => Promise<T>
): Promise<T> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 })
  try {
    return await use(await task.promise)
  } finally {
    await task.destroy()
  }
}

interface FieldObject {
  id: string
  value: unknown
  page: number
  rect: number[]
}

/** What PDF.js reads of the form: each field's widgets, by full name. */
async function fieldObjects(bytes: Uint8Array): Promise<Record<string, FieldObject[]>> {
  return pdfjsDocument(bytes, async (pdf) => {
    const objects = (await pdf.getFieldObjects()) as Map<string, FieldObject[]> | null
    // A field split from its widgets is listed first, with no rectangle; keep the widgets.
    return Object.fromEntries(
      [...(objects ?? [])].map(([name, list]) => [
        name,
        list.filter((object) => Array.isArray(object.rect)),
      ])
    )
  })
}

async function fieldValue(bytes: Uint8Array, name: string): Promise<unknown> {
  const widgets = (await fieldObjects(bytes))[name]
  expect(widgets, name).toBeDefined()
  return (widgets as FieldObject[])[0]?.value
}

/**
 * The text of object `number` from `obj` to `endobj`, in a file with no object streams. The last
 * copy is the current one: an incremental update appends a new copy after the old.
 */
function objectOf(bytes: Uint8Array, number: number): string {
  const text = latin1(bytes)
  const starts = [...text.matchAll(new RegExp(`(?:^|\\s)${number} 0 obj\\b`, 'g'))]
  const start = starts.at(-1)
  if (!start) throw new Error(`no object ${number}`)
  return text.slice(start.index, text.indexOf('endobj', start.index))
}

/**
 * The data of stream object `number`: its /Length bytes after the `stream` keyword and its end of
 * line. Writers differ in that end of line, which is not part of the data.
 */
function streamOf(bytes: Uint8Array, number: number): string {
  const object = objectOf(bytes, number)
  const length = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(object)
  if (!length) throw new Error(`object ${number} has no direct /Length`)
  const keyword = /stream\r?\n/.exec(object)
  if (!keyword) throw new Error(`object ${number} is not a stream`)
  const from = keyword.index + keyword[0].length
  return object.slice(from, from + Number(length[1]))
}

/** The id PDF.js gives a field's widget, such as `11R`. */
async function widgetId(bytes: Uint8Array, name: string, widget = 0): Promise<string> {
  const widgets = (await fieldObjects(bytes))[name] as FieldObject[]
  return (widgets[widget] as FieldObject).id
}

/**
 * How PDF.js draws a widget from its appearance: the operators between its begin and end
 * annotation markers on page 1. The engine's own render draws no form widgets, so a reader's
 * drawing of the appearance stands in for it.
 */
async function drawing(bytes: Uint8Array, id: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  return pdfjsDocument(bytes, async (pdf) => {
    const list = await (
      await pdf.getPage(1)
    ).getOperatorList({ annotationMode: pdfjs.AnnotationMode.ENABLE })
    const begin = list.fnArray.findIndex(
      (op, i) =>
        op === pdfjs.OPS.beginAnnotation && (list.argsArray[i] as unknown[])[0] === id
    )
    expect(begin, `no drawing for ${id}`).toBeGreaterThanOrEqual(0)
    const end = list.fnArray.indexOf(pdfjs.OPS.endAnnotation, begin)
    return JSON.stringify([
      list.fnArray.slice(begin + 1, end),
      list.argsArray.slice(begin + 1, end),
    ])
  })
}

/** What PDF.js reads as a field's value from its first widget: every selected option. */
async function annotationValue(bytes: Uint8Array, name: string): Promise<unknown> {
  return pdfjsDocument(bytes, async (pdf) => {
    const annotations = (await (await pdf.getPage(1)).getAnnotations()) as {
      fieldName?: string
      fieldValue?: unknown
    }[]
    return annotations.find((a) => a.fieldName === name)?.fieldValue
  })
}

/** The text PDF.js reads from the appearance of a field's first widget, line by line. */
async function widgetText(bytes: Uint8Array, name: string): Promise<string[]> {
  return pdfjsDocument(bytes, async (pdf) => {
    const annotations = (await (await pdf.getPage(1)).getAnnotations()) as {
      fieldName?: string
      textContent?: string[]
    }[]
    return annotations.find((a) => a.fieldName === name)?.textContent ?? []
  })
}

/**
 * The text a widget's appearance draws, as PDF.js reads its text operators. PDF.js gives
 * `textContent` for text fields only, so a choice field's text is read from its drawing.
 */
async function drawnText(bytes: Uint8Array, name: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const id = await widgetId(bytes, name)
  const [ops, args] = JSON.parse(await drawing(bytes, id)) as [number[], unknown[][]]
  return ops
    .flatMap((op, i) => (op === pdfjs.OPS.showText ? (args[i]?.[0] as unknown[]) : []))
    .map((glyph) =>
      typeof glyph === 'object' && glyph !== null && 'unicode' in glyph
        ? String(glyph.unicode)
        : ''
    )
    .join('')
}

/** Writes one field into the fixture; checks PDF.js's value and that the widget draws differently. */
async function expectField(
  fixture: FixtureName,
  name: string,
  field: WriteField,
  expected: unknown,
  widget = 0
) {
  const before = await fixtureBytes(fixture)
  const saved = await written(fixture, { fields: { [name]: field } })
  expect(
    Array.isArray(expected)
      ? await annotationValue(saved, name)
      : await fieldValue(saved, name)
  ).toEqual(expected)
  const id = await widgetId(before, name, widget)
  expect(await widgetId(saved, name, widget)).toBe(id)
  expect(await drawing(saved, id)).not.toBe(await drawing(before, id))
  return saved
}

const square = (id: string): WriteAnnotation => ({
  page: 0,
  annotation: {
    id,
    type: 'square',
    page: 0,
    rect: { x: 300, y: 300, width: 40, height: 40 },
    color: '#ff8000',
    opacity: 1,
    author: 'Ada Lovelace',
    contents: `About ${id}`,
    createdAt: '2026-11-17T09:30:00Z',
    modifiedAt: '2026-11-17T10:45:15Z',
    width: 1,
  } satisfies GlossAnnotation,
  appearance: {
    bounds: { x: 300, y: 300, width: 40, height: 40 },
    content: new TextEncoder().encode('0 0 1 rg 300 300 40 40 re f'),
  },
  data: `{"id":"${id}"}`,
})

/** The names (/NM) of the annotations PDF.js reads from page 0. */
async function annotationNames(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 })
  try {
    const page = await (await task.promise).getPage(1)
    const annotations = (await page.getAnnotations({ intent: 'any' })) as {
      annotationType: number
      id: string
      subtype: string
    }[]
    return annotations.map((a) => a.subtype)
  } finally {
    await task.destroy()
  }
}

describe('sets each kind of field', () => {
  test('sets a text field', async () => {
    await expectField('form-fields', 'name', { value: 'Ada' }, 'Ada')
  })

  test('turns a checkbox on and off', async () => {
    const on = await expectField('form-fields', 'agree', { value: 'Yes' }, 'Yes')
    const id = await widgetId(on, 'agree')
    const off = await written(on, { fields: { agree: { value: 'Off' } } })
    expect(await fieldValue(off, 'agree')).toBe('Off')
    expect(await drawing(off, id)).not.toBe(await drawing(on, id))
  })

  test('selects a radio button', async () => {
    const saved = await expectField(
      'form-fields',
      'plan',
      { value: 'yearly' },
      'yearly',
      1
    )
    const id = await widgetId(saved, 'plan', 0)
    const before = await fixtureBytes('form-fields')
    // The button that was on goes off.
    expect(await drawing(saved, id)).not.toBe(await drawing(before, id))
  })

  test('sets a combo box', async () => {
    await expectField('form-fields', 'country', { value: 'fr' }, 'fr')
  })

  test('selects two options of a list box', async () => {
    await expectField('form-fields', 'interests', { value: ['maths', 'poetry'] }, [
      'maths',
      'poetry',
    ])
  })

  test('sets a combo box with the text it shows', async () => {
    const plain = await written('form-fields', { fields: { country: { value: 'fr' } } })
    const shown = await expectField(
      'form-fields',
      'country',
      { value: 'fr', text: 'France (FR)' },
      'fr'
    )
    const id = await widgetId(shown, 'country')
    expect(await drawing(shown, id)).not.toBe(await drawing(plain, id))
    expect(await drawnText(plain, 'country')).not.toBe('France (FR)')
    expect(await drawnText(shown, 'country')).toBe('France (FR)')
  })

  test('clears a combo box that takes no text of its own with an empty string', async () => {
    const set = await written('form-fields', { fields: { country: { value: 'fr' } } })
    expect(await fieldValue(set, 'country')).toBe('fr')
    const id = await widgetId(set, 'country')
    const cleared = await written(set, { fields: { country: { value: '' } } })
    expect(await fieldValue(cleared, 'country')).toBeFalsy()
    expect(await drawnText(set, 'country')).not.toBe('')
    expect(await drawnText(cleared, 'country')).toBe('')
    expect(await drawing(cleared, id)).not.toBe(await drawing(set, id))
  })

  test('clears an editable combo box with an empty string', async () => {
    const set = await written('form-fields', { fields: { city: { value: 'Leicester' } } })
    const cleared = await written(set, { fields: { city: { value: '' } } })
    expect(await fieldValue(cleared, 'city')).toBeFalsy()
    expect(await drawnText(set, 'city')).toBe('Leicester')
    expect(await drawnText(cleared, 'city')).toBe('')
  })

  test('sets an editable combo box to text of its own', async () => {
    await expectField('form-fields', 'city', { value: 'Leicester' }, 'Leicester')
  })

  test("writes a list box's selected positions", async () => {
    const saved = await written('form-fields', {
      fields: { interests: { value: ['poetry', 'maths'] } },
    })
    expect(await annotationValue(saved, 'interests')).toEqual(['poetry', 'maths'])
    expect(objectOf(saved, 69)).toMatch(/\/T\s*<FEFF0069006E/)
    expect(objectOf(saved, 69)).toMatch(/\/I\s*\[\s*0\s+2\s*\]/)
  })

  test('replaces positions the file already holds, which PDF.js reads first', async () => {
    const before = await fixtureBytes('form-choices')
    expect(await annotationValue(before, 'colours')).toEqual(['red'])
    const saved = await written('form-choices', {
      fields: { colours: { value: ['green', 'blue'] } },
    })
    expect(await annotationValue(saved, 'colours')).toEqual(['green', 'blue'])
  })

  test('sets a list box that takes one option', async () => {
    await expectField('form-choices', 'size', { value: ['L'] }, ['L'])
  })

  test('clears a list box with an empty list', async () => {
    const one = await written('form-choices', { fields: { colours: { value: [] } } })
    expect(await annotationValue(one, 'colours')).toEqual([])
    expect(await fieldValue(one, 'colours')).toBeNull()
  })

  test('sets a field by its full name', async () => {
    await expectField('form-fields', 'header.ref', { value: 'REF-0043' }, 'REF-0043')
  })
})

test('shows the formatted text', async () => {
  const saved = await written('form-format', {
    fields: { amount: { value: '1234.5', text: '$1,234.50' } },
  })
  expect(await fieldValue(saved, 'amount')).toBe('1234.5')
  expect(await widgetText(saved, 'amount')).toEqual(['$1,234.50'])
})

describe("keeps untouched fields' appearances", () => {
  /** The object number of a field widget's normal appearance. */
  async function appearanceOf(bytes: Uint8Array, name: string): Promise<number> {
    const widgets = (await fieldObjects(bytes))[name] as FieldObject[]
    const widget = Number.parseInt((widgets[0] as FieldObject).id, 10)
    const ref = /\/AP\s*<<\s*\/N\s+(\d+)\s+0\s+R/.exec(objectOf(bytes, widget))
    if (!ref) throw new Error(`${name} has no /AP /N reference`)
    return Number(ref[1])
  }

  let before: Uint8Array
  let saved: Uint8Array
  beforeAll(async () => {
    before = await fixtureBytes('form-fields')
    saved = await written(
      'form-fields',
      { fields: { name: { value: 'Ada' } } },
      { mode: 'rewrite' }
    )
  })

  test('the written field draws anew, so the probe sees a change', async () => {
    const was = await appearanceOf(before, 'name')
    const now = await appearanceOf(saved, 'name')
    const changed = now !== was || streamOf(saved, now) !== streamOf(before, was)
    expect(changed).toBe(true)
  })

  test.each(['notes', 'locked', 'city', 'country'])(
    '%s keeps its appearance stream when only name is written',
    async (other) => {
      const number = await appearanceOf(before, other)
      expect(await appearanceOf(saved, other)).toBe(number)
      expect(streamOf(saved, number)).toBe(streamOf(before, number))
    }
  )
})

test('a file whose permissions forbid annotating and form filling takes both', async () => {
  const saved = await written('form-restricted', {
    annotations: [square('allowed')],
    fields: { name: { value: 'Ada' }, agree: { value: 'Yes' } },
  })
  expect(await fieldValue(saved, 'name')).toBe('Ada')
  expect(await fieldValue(saved, 'agree')).toBe('Yes')
  expect(await annotationNames(saved)).toContain('Square')
  const doc = await engine.open(saved)
  await doc.close()
})

describe('saves a signed file incrementally', () => {
  test.each(['signed', 'certified', 'signed-encrypted'] as const)(
    '%s: with no mode, the saved bytes start with the opened bytes',
    async (name) => {
      const opened = await fixtureBytes(name)
      const doc = await engine.open(opened)
      try {
        await doc.write({ fields: { name: { value: 'Ada' } } })
        const saved = await doc.save()
        keep(name, saved)
        expect(saved.length).toBeGreaterThan(opened.length)
        expect(Buffer.from(saved.subarray(0, opened.length)).equals(opened)).toBe(true)
        expect(await fieldValue(saved, 'name')).toBe('Ada')
      } finally {
        await doc.close()
      }
    }
  )

  test('an annotation written into a certified file is there after reopening', async () => {
    const opened = await fixtureBytes('certified')
    const saved = await written('certified', { annotations: [square('later')] })
    expect(Buffer.from(saved.subarray(0, opened.length)).equals(opened)).toBe(true)
    expect(await annotationNames(saved)).toContain('Square')
    const doc = await engine.open(saved)
    await doc.close()
  })

  test('an explicit mode is honoured', async () => {
    const opened = await fixtureBytes('signed')
    const saved = await written('signed', {}, { mode: 'rewrite' })
    expect(Buffer.from(saved.subarray(0, opened.length)).equals(opened)).toBe(false)
  })

  test.each(['acroform-basic', 'form-fields'] as const)(
    '%s, unsigned, with no mode is rewritten',
    async (name) => {
      // form-fields has two signature fields, both empty: places to sign, not signatures.
      const opened = await fixtureBytes(name)
      const saved = await written(name, { fields: { name: { value: 'Ada' } } })
      expect(Buffer.from(saved.subarray(0, opened.length)).equals(opened)).toBe(false)
      expect(latin1(saved).match(/%%EOF/g)).toHaveLength(1)
    }
  )
})

describe('rejects a field it cannot write', () => {
  test.each([
    ['an unknown field', 'nope', { value: 'x' }],
    ['a checkbox state the widget lacks', 'agree', { value: 'Maybe' }],
    ['a radio state no button has', 'plan', { value: 'weekly' }],
    ['a list of values for a text field', 'name', { value: ['a', 'b'] }],
    ['one string for a list box', 'interests', { value: 'maths' }],
    ['shown text for a checkbox', 'agree', { value: 'Yes', text: 'yes' }],
    ['a push button', 'reset', { value: 'x' }],
    ['a signature field', 'sig', { value: 'x' }],
    ['a combo value that is not an option', 'country', { value: 'de' }],
    ['a combo label rather than its export value', 'country', { value: 'France' }],
    ['a list box value that is not an option', 'interests', { value: ['maths', 'art'] }],
    ['shown text for a list box', 'interests', { value: ['maths'], text: 'Maths' }],
    [
      'two options for a list box that takes one',
      'size',
      { value: ['S', 'L'] },
      'form-choices',
    ],
  ] satisfies [string, string, WriteField, FixtureName?][])(
    'rejects %s with write-failed, naming the field',
    async (_, name, field, fixture?: FixtureName) => {
      const doc = await engine.open(await fixtureBytes(fixture ?? 'form-fields'))
      try {
        const failed = doc.write({ fields: { [name]: field } })
        await expect(failed).rejects.toMatchObject({
          name: 'EngineError',
          code: 'write-failed',
        })
        await expect(failed).rejects.toThrow(new RegExp(`"${name.replace('.', '\\.')}"`))
      } finally {
        await doc.close()
      }
    }
  )

  test('leaves the document as opened, and the engine goes on working', async () => {
    const bytes = await fixtureBytes('form-fields')
    const plain = await engine.open(bytes)
    const expected = await plain.save()
    await plain.close()

    const doc = await engine.open(bytes)
    try {
      await doc.write({ fields: { name: { value: 'Ada' } } })
      const failed = doc.write({
        fields: { name: { value: 'Bea' }, nope: { value: 'x' } },
      })
      await expect(failed).rejects.toBeInstanceOf(EngineError)
      expect(withoutId(await doc.save())).toBe(withoutId(expected))
      await doc.write({ fields: { name: { value: 'Cy' } } })
      expect(await fieldValue(await doc.save(), 'name')).toBe('Cy')
    } finally {
      await doc.close()
    }
  })

  test('a value that is not a string or a list of strings is a RangeError', async () => {
    const doc = await engine.open(await fixtureBytes('form-fields'))
    try {
      await expect(
        doc.write({ fields: { name: { value: 3 as unknown as string } } })
      ).rejects.toBeInstanceOf(RangeError)
      await expect(
        doc.write({ fields: { name: { value: 'x', text: 3 as unknown as string } } })
      ).rejects.toBeInstanceOf(RangeError)
    } finally {
      await doc.close()
    }
  })
})

describe('frees what it allocates', () => {
  async function counted() {
    const native = await loadNative({ wasm })
    const live = { blocks: new Set<number>(), models: new Set<number>(), documents: 0 }
    /** Every document a load returned, and every owner-permission call, in order. */
    const loads: number[] = []
    const permissions: [number, number, number][] = []
    const fn = new Proxy(native.fn, {
      get(target, key: keyof Native) {
        const real = target[key] as (...args: number[]) => number
        return (...args: number[]) => {
          const [first = 0, second = 0] = args
          const result = real(...args)
          if (key === 'EPDF_SetRuntimeOwnerPermissions')
            permissions.push([first, second, result])
          if (key === 'FPDF_LoadMemDocument64' && result) loads.push(result)
          if (key === 'malloc') live.blocks.add(result)
          else if (key === 'free') live.blocks.delete(first)
          else if (key === 'EPDFForm_LoadModel' && result) live.models.add(result)
          else if (key === 'EPDFForm_CloseModel') live.models.delete(first)
          else if (key === 'FPDF_LoadMemDocument64' && result) live.documents++
          else if (key === 'FPDF_CloseDocument') live.documents--
          return result
        }
      },
    })
    const core = new EngineCore(withFunctions(native, fn))
    const snapshot = () => ({
      blocks: [...live.blocks].sort(),
      models: live.models.size,
      documents: live.documents,
    })
    return { core, snapshot, loads, permissions }
  }

  test('gives owner permissions to every load: open, the reload for a write, the reopen after a failed one', async () => {
    const { core, loads, permissions } = await counted()
    try {
      const { id } = core.open(await fixtureBytes('form-restricted'))
      core.write(id, { fields: { name: { value: 'Ada' } } })
      expect(() => core.write(id, { fields: { nope: { value: 'x' } } })).toThrow(
        EngineError
      )
      // Open, the first write's reload, the failed write's reload, then the reopen.
      expect(loads).toHaveLength(4)
      // [document, enabled, returned]: the encrypted file takes the change every time.
      expect(permissions).toEqual(loads.map((doc) => [doc, 1, 1]))
    } finally {
      core.destroy()
    }
  })

  test.each([
    [
      'a write that works',
      {
        name: { value: 'Ada' },
        agree: { value: 'Yes' },
        plan: { value: 'yearly' },
        country: { value: 'fr', text: 'France' },
        interests: { value: ['maths', 'poetry'] },
      },
      true,
    ],
    [
      'an unknown field after good ones',
      { name: { value: 'Ada' }, nope: { value: 'x' } },
      false,
    ],
    ['a bad checkbox state', { agree: { value: 'Maybe' } }, false],
  ] satisfies [string, Record<string, WriteField>, boolean][])(
    'after %s',
    async (_, fields, works) => {
      const { core, snapshot } = await counted()
      try {
        const { id } = core.open(await fixtureBytes('form-fields'))
        const before = snapshot()
        if (works) core.write(id, { fields })
        else expect(() => core.write(id, { fields })).toThrow(EngineError)
        expect(snapshot()).toEqual(before)
        expect(core.stopped).toBe(false)
      } finally {
        core.destroy()
      }
    }
  )
})

test.skipIf(!qpdfAvailable)('every saved file passes qpdf --check', async () => {
  expect(saves.length).toBeGreaterThan(10)
  for (const { name, bytes } of saves)
    expect({ name, result: await qpdfCheck(bytes) }).toEqual({
      name,
      result: { ok: true },
    })
})
