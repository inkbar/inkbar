import { readFile } from 'node:fs/promises'

import { EngineError } from '@inkbar/engine'
import { fixtureBytes, fixturePath, manifest, type FixtureName } from '@inkbar/fixtures'
import { qpdfAvailable, qpdfCheck, requireQpdfInCi } from '@inkbar/fixtures/qpdf'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as annotationFields from '../pdf/annotation-fields'
import { nodeAssets } from '../pdfjs/node-assets'

import { isReply } from './annotations/threads'
import { openDocument, type InkDocument, type OpenOptions } from './document'
import { signField } from './form/sign'
import { createImageTemplate } from './signatures'

import type { AnnotationChange } from './annotations/store'
import type { Annotation, AnnotationInput } from './annotations/types'
import type { EngineLoader } from './save/saver'
import type { Engine, EngineDocument, WriteInput } from '@inkbar/engine'

requireQpdfInCi()

/** What the file's scripts calculate while the next document opens; taken by that open. */
const scriptsAtOpen = vi.hoisted((): { values?: Record<string, string> } => ({}))

// Node runs no form scripts. A test that needs a calculation at open has it set here, the way
// the sandbox sets it: after the fields load and before `ready`.
vi.mock(import('./form/scripting'), async (original) => {
  const actual = await original()
  return {
    ...actual,
    createFormScripting: (opts) => {
      const { values } = scriptsAtOpen
      delete scriptsAtOpen.values
      if (values) opts.form._scriptValues(values)
      return actual.createFormScripting(opts)
    },
  }
})

/** A 1 × 1 PNG. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/**
 * A loader that gives the real engine, in this thread, with every `write` recorded. `failNext`
 * makes the next write reject with that error instead.
 */
function realEngine() {
  const writes: WriteInput[] = []
  let fail: Error | undefined
  const createEngine = vi.fn(async (): Promise<Engine> => {
    const m = await import('@inkbar/engine')
    const engine = await m.createEngine({ worker: false })
    return {
      async open(bytes, options) {
        const d = await engine.open(bytes, options)
        const doc: EngineDocument = {
          get pageCount() {
            return d.pageCount
          },
          pageInfo: (i) => d.pageInfo(i),
          renderPage: (i, o) => d.renderPage(i, o),
          pageText: (i) => d.pageText(i),
          pageLinks: (i) => d.pageLinks(i),
          outline: () => d.outline(),
          namedDestination: (n) => d.namedDestination(n),
          documentFacts: () => d.documentFacts(),
          pageAnnotations: (i) => d.pageAnnotations(i),
          formFields: () => d.formFields(),
          scripts: () => d.scripts(),
          structureOrder: (i) => d.structureOrder(i),
          renderAnnotations: (i, o) => d.renderAnnotations(i, o),
          write(input) {
            writes.push(input)
            if (fail) {
              const e = fail
              fail = undefined
              return Promise.reject(e)
            }
            return d.write(input)
          },
          redact: (input) => d.redact(input),
          save: (o) => d.save(o),
          close: () => d.close(),
        }
        return doc
      },
      checkRedaction: (bytes, options) => engine.checkRedaction(bytes, options),
      destroy: () => engine.destroy(),
    }
  })
  const loader = vi.fn<EngineLoader>(() => Promise.resolve({ createEngine }))
  return { loader, createEngine, writes, failNext: (e: Error) => (fail = e) }
}

/** Every document a test opened, with the bytes it was opened from. */
const opened: { doc: InkDocument; bytes: Uint8Array }[] = []
/** Every file a test saved, for the closing `qpdf --check`. */
const saved: { name: string; bytes: Uint8Array; password?: string }[] = []

afterEach(async () => {
  const docs = opened.splice(0)
  try {
    // Whatever was saved, the document's own data stays the bytes it was opened from.
    for (const { doc, bytes } of docs)
      if (doc.status.get().state === 'ready') expect(await doc.getData()).toEqual(bytes)
  } finally {
    docs.forEach(({ doc }) => doc.destroy())
  }
})

async function openBytes(
  bytes: Uint8Array,
  opts: Partial<OpenOptions> = {}
): Promise<InkDocument> {
  // PDF.js detaches what it is given, so it gets a copy and the original stays to compare.
  const doc = await openDocument(bytes.slice(), {
    assets: nodeAssets(),
    verbosity: 0,
    ...opts,
  })
  opened.push({ doc, bytes })
  await doc.ready
  return doc
}

async function open(name: FixtureName, opts: Partial<OpenOptions> = {}) {
  const password = manifest[name].password
  return openBytes(await fixtureBytes(name), {
    ...(password ? { password } : {}),
    ...opts,
  })
}

/** Saves `doc`, keeping the result for the qpdf check. */
async function save(doc: InkDocument, name: string, password?: string) {
  const bytes = await doc.save()
  saved.push({ name, bytes, ...(password ? { password } : {}) })
  return bytes
}

/** Opens `bytes` with an engine and waits for lifting. */
async function reopen(bytes: Uint8Array, opts: Partial<OpenOptions> = {}) {
  const doc = await openBytes(bytes, { engine: realEngine().loader, ...opts })
  await doc._liftSettled
  return doc
}

/** The annotations the fixture script wrote into `name`, in order, as the session had them. */
async function written(name: FixtureName): Promise<Annotation[]> {
  const path = fixturePath(name).replace(/\.pdf$/, '.annotations.json')
  return JSON.parse(await readFile(path, 'utf8')) as Annotation[]
}

const session = (doc: InkDocument) =>
  doc.annotations.list.get().filter((a) => a.source !== 'pdf')
const embedded = (doc: InkDocument) =>
  doc.annotations.list.get().filter((a) => a.source === 'pdf')
const byId = (list: readonly Annotation[]) =>
  [...list].sort((a, b) => a.id.localeCompare(b.id))

/** The bytes of one cross-reference entry. */
const XREF_ENTRY = 20
/** Bytes a file may differ by beyond the above: the trailer's longer numbers. */
const SLACK = 32

/**
 * The objects a rewritten file holds, the free entries in its cross-reference table, and the
 * digits its object numbers take where objects start and are referred to.
 */
function objectsIn(bytes: Uint8Array): { live: number; free: number; digits: number } {
  const text = Buffer.from(bytes).toString('latin1')
  return {
    live: (text.match(/(?:^|\s)\d+ \d+ obj\b/g) ?? []).length,
    free: (text.match(/^\d{10} \d{5} f\s*$/gm) ?? []).length,
    digits: [...text.matchAll(/(\d+) \d+ (?:obj|R)\b/g)].reduce(
      (sum, m) => sum + m[1]!.length,
      0
    ),
  }
}

const quad = (x: number, y: number, width: number, height: number) => ({
  p1: { x, y: y + height },
  p2: { x: x + width, y: y + height },
  p3: { x, y },
  p4: { x: x + width, y },
})

/**
 * One annotation of every type on a two-page file, in the order the file keeps them: page 0's
 * dimming mask first, then the rest; a reply after its note.
 */
function addEveryType(doc: InkDocument): void {
  const add = (input: AnnotationInput) => doc.annotations.add(input)
  add({
    type: 'mask',
    page: 0,
    shape: 'ellipse',
    rect: { x: 72, y: 200, width: 200, height: 120 },
  })
  add({ type: 'highlight', page: 0, quads: [quad(72, 700, 200, 14)] })
  add({ type: 'underline', page: 0, quads: [quad(72, 680, 200, 14)] })
  add({ type: 'strikeout', page: 0, quads: [quad(72, 660, 200, 14)] })
  add({ type: 'squiggly', page: 0, quads: [quad(72, 640, 200, 14)] })
  const note = add({
    type: 'text',
    page: 0,
    rect: { x: 520, y: 700, width: 20, height: 20 },
    contents: 'A note',
    author: 'Sam',
  })
  add({
    type: 'text',
    page: 0,
    rect: { x: 520, y: 700, width: 20, height: 20 },
    contents: 'A reply',
    inReplyTo: note.id,
  })
  add({
    type: 'freetext',
    page: 0,
    rect: { x: 300, y: 560, width: 160, height: 40 },
    contents: 'Saved by Inkbar',
    borderColor: '#336699',
    width: 1,
  })
  add({
    type: 'square',
    page: 0,
    rect: { x: 72, y: 540, width: 80, height: 60 },
    width: 2,
  })
  add({
    type: 'circle',
    page: 0,
    rect: { x: 180, y: 540, width: 80, height: 60 },
    interiorColor: '#FFEEAA',
  })
  add({
    type: 'line',
    page: 0,
    start: { x: 72, y: 500 },
    end: { x: 260, y: 520 },
    width: 2,
    head: 'OpenArrow',
    tail: 'Circle',
  })
  add({
    type: 'polyline',
    page: 0,
    vertices: [
      { x: 300, y: 480 },
      { x: 360, y: 520 },
      { x: 420, y: 480 },
    ],
  })
  add({
    type: 'polygon',
    page: 0,
    vertices: [
      { x: 450, y: 480 },
      { x: 540, y: 480 },
      { x: 495, y: 530 },
    ],
  })
  add({
    type: 'ink',
    page: 0,
    width: 3,
    inklist: [
      [
        { x: 72, y: 400 },
        { x: 110, y: 450 },
        { x: 150, y: 400 },
      ],
    ],
    pressure: [[0.2, 0.6, 1]],
  })
  add({
    type: 'stamp',
    page: 0,
    subject: 'Approved',
    rect: { x: 300, y: 380, width: 120, height: 60 },
    imagedata: PNG,
  })
  add({ type: 'loupe', page: 0, rect: { x: 450, y: 360, width: 90, height: 90 } })
  add({ type: 'redact', page: 0, rect: { x: 300, y: 220, width: 200, height: 40 } })
  add({ type: 'square', page: 1, rect: { x: 100, y: 100, width: 120, height: 80 } })
}

describe('save', () => {
  it('gives the opened bytes when nothing changed', async () => {
    const { loader } = realEngine()
    const plain = await open('text-simple', { engine: loader })
    expect(await plain.save()).toEqual(await fixtureBytes('text-simple'))

    const lifted = await open('saved-annotations', { engine: loader })
    await lifted._liftSettled
    expect(lifted.changed.get()).toBe(false)
    expect(await lifted.save()).toEqual(await fixtureBytes('saved-annotations'))
    expect(loader).not.toHaveBeenCalled()
  })

  it('rejects without an engine once an annotation is added', async () => {
    const doc = await open('text-simple')
    expect(await doc.save()).toEqual(await fixtureBytes('text-simple'))
    doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 1, y: 1, width: 9, height: 9 },
    })
    await expect(doc.save()).rejects.toMatchObject({
      name: 'InkError',
      code: 'EngineUnavailable',
    })
  })

  it('writes every annotation type', async () => {
    const doc = await open('text-simple', { engine: realEngine().loader })
    addEveryType(doc)
    const bytes = await save(doc, 'every type')
    const back = await reopen(bytes)
    expect(embedded(back)).toEqual([])
    expect(session(back)).toEqual(session(doc))
    expect(back.changed.get()).toBe(false)
  })

  it('writes an annotation with nothing to draw', async () => {
    const engine = realEngine()
    const doc = await open('text-simple', { engine: engine.loader })
    // A square with no stroke and no fill: a stroke of no width is not drawn.
    doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 100, y: 100, width: 50, height: 50 },
      width: 0,
    })
    const back = await reopen(await save(doc, 'nothing to draw'))
    const content = engine.writes[0]!.annotations![0]!.appearance!.content
    // The appearance paints nothing: no path is filled or stroked, no image or text drawn.
    expect(new TextDecoder().decode(content)).not.toMatch(
      /(^|\s)(f\*?|S|s|B\*?|b\*?|Do|Tj|TJ)(\s|$)/
    )
    expect(embedded(back)).toEqual([])
    expect(session(back)).toEqual(session(doc))
  })

  it.each([
    [
      'a level line of no width',
      {
        type: 'line',
        page: 0,
        start: { x: 100, y: 300 },
        end: { x: 200, y: 300 },
        width: 0,
      },
    ],
    [
      'a see-through level line of no width',
      {
        type: 'line',
        page: 0,
        start: { x: 100, y: 320 },
        end: { x: 200, y: 320 },
        width: 0,
        opacity: 0.5,
      },
    ],
    [
      'a stamp of no size',
      {
        type: 'stamp',
        page: 0,
        subject: 'Approved',
        rect: { x: 300, y: 380, width: 0, height: 0 },
        imagedata: PNG,
      },
    ],
    [
      'an ink stroke of one point',
      { type: 'ink', page: 0, width: 0, inklist: [[{ x: 150, y: 400 }]] },
    ],
  ] satisfies [string, AnnotationInput][])(
    'writes %s, whose drawing has no area, and lifts it back as it was',
    async (name, input) => {
      const engine = realEngine()
      const doc = await open('text-simple', { engine: engine.loader })
      const added = doc.annotations.add(input)
      const back = await reopen(await save(doc, name))
      // The box written has an area, and the data stored records that same box.
      const { bounds } = engine.writes[0]!.annotations![0]!.appearance!
      expect(bounds.width).toBeGreaterThan(0)
      expect(bounds.height).toBeGreaterThan(0)
      expect(embedded(back)).toEqual([])
      expect(session(back)).toEqual([added])
      expect(back.changed.get()).toBe(false)
    }
  )

  it('removes what the user deleted', async () => {
    const doc = await open('saved-annotations', { engine: realEngine().loader })
    await doc._liftSettled
    const expected = await written('saved-annotations')
    const gone = expected.find((a) => a.type === 'square')!
    doc.annotations.remove(gone.id)
    const back = await reopen(await save(doc, 'removed'))
    expect(embedded(back)).toEqual([])
    expect(byId(session(back))).toEqual(byId(expected.filter((a) => a.id !== gone.id)))
  })

  it('writes a shared id once, with the host’s edit', async () => {
    const expected = await written('saved-annotations')
    const host: Annotation = { ...expected[7]!, color: '#00AA00' }
    const onChange = vi.fn<(next: Annotation[], change: AnnotationChange) => void>()
    const doc = await open('saved-annotations', {
      engine: realEngine().loader,
      annotations: { mode: 'controlled', initial: [host], onChange },
    })
    await doc._liftSettled
    doc.annotations.setControlledValue(onChange.mock.calls.at(-1)![0])
    const back = await reopen(await save(doc, 'shared id'))
    const copies = session(back).filter((a) => a.id === host.id)
    expect(copies).toEqual([host])
    expect(byId(session(back))).toEqual(
      byId([host, ...expected.filter((a) => a.id !== host.id)])
    )
  })

  it('shares a running write', async () => {
    const engine = realEngine()
    const doc = await open('text-simple', { engine: engine.loader })
    doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 1, y: 1, width: 9, height: 9 },
    })
    const [a, b] = await Promise.all([doc.save(), doc.save()])
    expect(engine.writes).toHaveLength(1)
    expect(a).toEqual(b)
  })

  it('reuses the copy until something changes', async () => {
    const engine = realEngine()
    const doc = await open('text-simple', { engine: engine.loader })
    const square = doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 1, y: 1, width: 9, height: 9 },
    })
    const first = await doc.save()
    expect(await doc.save()).toEqual(first)
    expect(engine.writes).toHaveLength(1)

    doc.annotations.update(square.id, { color: '#00AA00' })
    await doc.save()
    expect(engine.writes).toHaveLength(2)
    doc.history.undo()
    await doc.save()
    expect(engine.writes).toHaveLength(3)
    doc.history.redo()
    await doc.save()
    expect(engine.writes).toHaveLength(4)

    expect(engine.loader).toHaveBeenCalledTimes(1)
  })

  it('reports changed from when lifting lands', async () => {
    const doc = await open('saved-annotations', { engine: realEngine().loader })
    expect(doc.changed.get()).toBe(false)
    await doc._liftSettled
    expect(doc.changed.get()).toBe(false)
    const heard: boolean[] = []
    doc.changed.subscribe((c) => heard.push(c))
    const [first] = session(doc)
    doc.annotations.update(first!.id, { color: '#00AA00' })
    expect(doc.changed.get()).toBe(true)
    doc.history.undo()
    expect(doc.changed.get()).toBe(false)
    expect(heard).toEqual([true, false])
  })

  it('waits for lifting', async () => {
    const engine = realEngine()
    const doc = await open('saved-annotations', { engine: engine.loader })
    let settled = false
    void doc._liftSettled.then(() => (settled = true))
    const mine = doc.annotations.add({
      type: 'square',
      page: 1,
      rect: { x: 10, y: 10, width: 20, height: 20 },
    })
    const saving = save(doc, 'before lifting')
    expect(settled).toBe(false)
    const bytes = await saving
    const expected = await written('saved-annotations')
    expect(engine.writes).toHaveLength(1)
    expect(engine.writes[0]!.annotations).toHaveLength(expected.length + 1)
    expect(engine.writes[0]!.remove).toHaveLength(expected.length)
    const back = await reopen(bytes)
    expect(embedded(back)).toEqual([])
    expect(byId(session(back))).toEqual(byId([mine, ...expected]))
  })

  it('does not grow on every save', async () => {
    const first = await open('text-simple', { engine: realEngine().loader })
    addEveryType(first)
    const count = session(first).length
    const rounds: { bytes: Uint8Array; single: Uint8Array }[] = []
    /** A single save, from the file as it came, of the list `doc` holds. */
    const singleSaveOf = async (doc: InkDocument) => {
      const once = await open('text-simple', {
        engine: realEngine().loader,
        annotations: { mode: 'uncontrolled', initial: [...session(doc)] },
      })
      await once._liftSettled
      return save(once, 'single save')
    }
    let bytes = await save(first, 'grow 0')
    rounds.push({ bytes, single: await singleSaveOf(first) })
    for (let round = 1; round <= 3; round++) {
      const doc = await reopen(bytes)
      // Every annotation came back as Inkbar's, once: no file copy is left behind.
      expect(embedded(doc)).toEqual([])
      expect(session(doc)).toHaveLength(count)
      const square = session(doc).find((a) => a.type === 'square')!
      doc.annotations.update(square.id, {
        rect: { ...square.rect, x: square.rect.x + round },
      })
      bytes = await save(doc, `grow ${round}`)
      rounds.push({ bytes, single: await singleSaveOf(doc) })
    }
    const last = await reopen(bytes)
    expect(embedded(last)).toEqual([])
    expect(session(last)).toHaveLength(count)
    for (const { bytes: each, single } of rounds) {
      const now = objectsIn(each)
      const once = objectsIn(single)
      // The same objects as a single save of the same list: nothing removed is kept.
      expect(now.live).toBe(once.live)
      // What does grow is the cross-reference table: PDFium keeps the object number of each
      // object it removed as a free entry, 20 bytes each, and new objects get higher numbers,
      // which take more digits where they are written.
      expect(each.length - single.length).toBeLessThanOrEqual(
        XREF_ENTRY * (now.free - once.free) + (now.digits - once.digits) + SLACK
      )
    }
  })

  it('keeps a signature pinned', async () => {
    const doc = await open('form-fields', { engine: realEngine().loader })
    await doc._liftSettled
    const field = doc.form.fields.get().find((f) => f.name === 'sig')!
    const id = signField(doc, 'sig', field.widgets[0]!.id, createImageTemplate(PNG, 4))
    expect(doc.changed.get()).toBe(true)
    const back = await reopen(await save(doc, 'signed'))
    expect(back.annotations.get(id)).toEqual(doc.annotations.get(id))
    expect(back.annotations._isPinned(id)).toBe(true)
    expect(back.form.get('sig')).toEqual({ signature: id })
    expect(back.changed.get()).toBe(false)
  })

  it('saves formatted text', async () => {
    const doc = await open('form-format', { engine: realEngine().loader })
    await doc._liftSettled
    doc.form.set({ amount: '1234.5' })
    // Node runs no scripts, so the format script's text is set as it would set it.
    doc.form._setFormatted('amount', '$1,234.50')
    const back = await reopen(await save(doc, 'formatted'))
    expect(back.form.get('amount')).toBe('1234.5')
    const page = await back._pdfjs.getPage(0)
    const annotations = (await page.getAnnotations()) as {
      fieldName?: string
      textContent?: string[]
    }[]
    expect(annotations.find((a) => a.fieldName === 'amount')?.textContent).toEqual([
      '$1,234.50',
    ])
    expect(back.changed.get()).toBe(false)
  })

  it('saves a change to formatted text alone', async () => {
    const engine = realEngine()
    const doc = await open('form-format', { engine: engine.loader })
    await doc._liftSettled
    doc.form.set({ amount: '1234.5' })
    await doc.save()
    doc.form._setFormatted('amount', '$1,234.50')
    expect(doc.changed.get()).toBe(true)
    await doc.save()
    expect(engine.writes.map((w) => w.fields)).toEqual([
      { amount: { value: '1234.5' } },
      { amount: { value: '1234.5', text: '$1,234.50' } },
    ])
  })

  it('wraps an engine failure, and starts a new engine for the next save', async () => {
    const engine = realEngine()
    const doc = await open('text-simple', { engine: engine.loader })
    doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 1, y: 1, width: 9, height: 9 },
    })
    const failure = new EngineError('engine-failure', 'PDFium stopped')
    engine.failNext(failure)
    await expect(doc.save()).rejects.toMatchObject({
      name: 'InkError',
      code: 'SaveFailed',
      cause: failure,
    })
    expect(engine.createEngine).toHaveBeenCalledTimes(1)
    const bytes = await save(doc, 'after failure')
    expect(engine.createEngine).toHaveBeenCalledTimes(2)
    const back = await reopen(bytes)
    expect(session(back)).toEqual(session(doc))
  })

  it('names the annotation a host without pictures cannot write', async () => {
    const doc = await open('text-simple', { engine: realEngine().loader })
    doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 1, y: 1, width: 9, height: 9 },
    })
    const box = doc.annotations.add({
      type: 'freetext',
      page: 0,
      rect: { x: 100, y: 100, width: 200, height: 40 },
      contents: '你好，世界',
    })
    const failed = await doc.save().catch((e: unknown) => e)
    expect(failed).toMatchObject({
      name: 'InkError',
      code: 'SaveFailed',
      details: { stage: 'write', annotation: box.id },
      cause: { name: 'UnpaintableError' },
    })
    // With a picture for the text the same document saves.
    const pictured = await open('text-simple', {
      engine: realEngine().loader,
      pictures: {
        textPicture: () =>
          Promise.resolve({
            png: Uint8Array.from(atob(PNG.split(',')[1]!), (c) => c.charCodeAt(0)),
            width: 60,
            ascent: 9,
            descent: 3,
          }),
      },
    })
    pictured.annotations.add({
      type: 'freetext',
      page: 0,
      rect: { x: 100, y: 100, width: 200, height: 40 },
      contents: '你好，世界',
    })
    await expect(save(pictured, 'pictured text')).resolves.toBeInstanceOf(Uint8Array)
  })

  it('fails a save whose lifted annotation has no object in the file to replace', async () => {
    const engine = realEngine()
    const doc = await open('saved-tampered', { engine: engine.loader })
    await doc._liftSettled
    const [square] = await written('saved-tampered')
    // As if the file's copy had been read with an id that names no object.
    const copy = vi.spyOn(annotationFields, 'refOfPdfjsId').mockReturnValue(undefined)
    doc.annotations.update(square!.id, { color: '#00AA00' })
    const failed = await doc.save().catch((e: unknown) => e)
    copy.mockRestore()
    expect(failed).toMatchObject({
      code: 'SaveFailed',
      details: { stage: 'write', annotation: square!.id },
    })
    expect(engine.writes).toEqual([])
  })

  it('opens an encrypted file with its password', async () => {
    const doc = await open('encrypted-aes', { engine: realEngine().loader })
    doc.annotations.add({ type: 'highlight', page: 0, quads: [quad(72, 700, 200, 14)] })
    const bytes = await save(doc, 'encrypted', 'inkbar')
    const locked = await openDocument(bytes.slice(), {
      assets: nodeAssets(),
      verbosity: 0,
    })
    await expect(locked.ready).rejects.toMatchObject({ code: 'PasswordRequired' })
    locked.destroy()
    const back = await openBytes(bytes, { password: 'inkbar' })
    expect(embedded(back).map((a) => a.type)).toEqual(['highlight'])
  })

  it('rejects a save in flight when the document is destroyed', async () => {
    const doc = await open('text-simple', { engine: realEngine().loader })
    doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 1, y: 1, width: 9, height: 9 },
    })
    const saving = doc.save()
    // Destroyed, so it has no data left to compare after the test.
    opened.splice(
      opened.findIndex((o) => o.doc === doc),
      1
    )
    expect(() => doc.destroy()).not.toThrow()
    await expect(saving).rejects.toMatchObject({ code: 'DocumentDestroyed' })
  })

  describe('form values', () => {
    it.each([
      ['uncontrolled', { mode: 'uncontrolled', initial: { name: 'Ada' } }],
      [
        'controlled',
        { mode: 'controlled', initial: { name: 'Ada' }, onChange: () => undefined },
      ],
    ] as const)(
      'counts values a %s host supplied at open as changes',
      async (_, fields) => {
        const engine = realEngine()
        const doc = await open('form-fields', { engine: engine.loader, fields })
        await doc._liftSettled
        expect(doc.form.get('name')).toBe('Ada')
        expect(doc.changed.get()).toBe(true)
        const back = await reopen(await save(doc, `host values ${fields.mode}`))
        expect(back.form.get('name')).toBe('Ada')
        expect(back.changed.get()).toBe(false)
        expect(engine.loader).toHaveBeenCalledTimes(1)
      }
    )

    it.each(['form-fields', 'saved-signed'] as const)(
      'counts a value set as soon as %s opens, before lifting lands',
      async (name) => {
        const engine = realEngine()
        const doc = await open(name, { engine: engine.loader })
        let settled = false
        void doc._liftSettled.then(() => (settled = true))
        doc.form.set({ name: 'Ada' })
        expect(settled).toBe(false)
        await doc._liftSettled
        expect(doc.changed.get()).toBe(true)
        const back = await reopen(await save(doc, `set at once, ${name}`))
        expect(back.form.get('name')).toBe('Ada')
        expect(engine.writes[0]!.fields).toEqual({ name: { value: 'Ada' } })
      }
    )

    it('counts a reset and an import made before lifting lands', async () => {
      const first = await open('form-fields', {
        engine: realEngine().loader,
        fields: { mode: 'uncontrolled', initial: {} },
      })
      first.importAnnotations({
        ...first.exportAnnotations('json'),
        fields: { name: 'Imported' },
      })
      await first._liftSettled
      expect(first.form.get('name')).toBe('Imported')
      expect(first.changed.get()).toBe(true)

      // The file has `plan` at monthly; a reset puts it at its default, yearly.
      const second = await open('form-fields', { engine: realEngine().loader })
      expect(second.form.get('plan')).toBe('monthly')
      second.form.reset(['plan'])
      await second._liftSettled
      expect(second.form.get('plan')).toBe('yearly')
      expect(second.changed.get()).toBe(true)
    })

    it('saves a combo box emptied by a reset, though it takes no text of its own', async () => {
      const engine = realEngine()
      const doc = await open('form-fields', { engine: engine.loader })
      await doc._liftSettled
      expect(doc.form.get('country')).toBe('gb')
      doc.form.reset(['country'])
      expect(doc.form.get('country')).toBe('')
      expect(doc.changed.get()).toBe(true)
      const back = await reopen(await save(doc, 'combo emptied'))
      expect(engine.writes[0]!.fields).toEqual({ country: { value: '' } })
      expect(back.form.get('country') ?? '').toBe('')
      expect(back.changed.get()).toBe(false)
    })

    it("takes what the file's scripts calculate at open as the file's", async () => {
      const { loader } = realEngine()
      // Node runs no scripts, so a calculation at open is set as the sandbox sets it: while
      // the document opens, before `ready`.
      scriptsAtOpen.values = { name: 'Calculated' }
      const doc = await open('form-fields', { engine: loader })
      await doc._liftSettled
      expect(doc.form.get('name')).toBe('Calculated')
      expect(doc.changed.get()).toBe(false)
      expect(await doc.save()).toEqual(await fixtureBytes('form-fields'))
      expect(loader).not.toHaveBeenCalled()
    })

    it('takes a signature link lifting restored as no change', async () => {
      const { loader } = realEngine()
      const doc = await open('saved-signed', { engine: loader })
      await doc._liftSettled
      const [signature] = await written('saved-signed')
      expect(doc.form.get('sig')).toEqual({ signature: signature!.id })
      expect(doc.changed.get()).toBe(false)
      expect(await doc.save()).toEqual(await fixtureBytes('saved-signed'))
      expect(loader).not.toHaveBeenCalled()
    })

    it('takes a field emptied that the file left empty as no change', async () => {
      const doc = await open('form-fields', { engine: realEngine().loader })
      await doc._liftSettled
      expect(doc.form.get('city')).toBeUndefined()
      doc.form.set({ city: 'Paris' })
      expect(doc.changed.get()).toBe(true)
      doc.form.set({ city: '' })
      expect(doc.changed.get()).toBe(false)
    })
  })

  /** The PDF.js annotations of page 0, hidden ones included. */
  const pdfjsAnnotations = async (doc: InkDocument) =>
    (await (await doc._pdfjs.getPage(0)).getAnnotations({ intent: 'any' })) as {
      id: string
      subtype: string
      annotationFlags: number
      inReplyTo?: string
      popupRef?: string | null
      parentRect?: number[]
    }[]

  describe("a reply to one of the file's own notes", () => {
    it('is saved hidden, linked to the note, and comes back in its thread', async () => {
      const doc = await open('note-icon-ap', { engine: realEngine().loader })
      await doc._liftSettled
      const [note] = embedded(doc)
      expect(note).toMatchObject({ type: 'text', locked: true })
      const reply = doc.annotations.add({
        type: 'text',
        page: 0,
        rect: note!.rect,
        contents: 'A reply',
        inReplyTo: note!.id,
      })
      expect(isReply(reply, doc.annotations.list.get())).toBe(true)
      const bytes = await save(doc, 'reply to a file note')

      const back = await reopen(bytes)
      const noteId = note!.id.split(':')[2]!
      const inFile = await pdfjsAnnotations(back)
      expect(inFile.map((a) => a.id)).toContain(noteId)
      const written = inFile.filter((a) => a.id !== noteId)
      // Nothing new shows on the page: the reply is hidden, and linked to the note.
      expect(written).toHaveLength(1)
      expect(written[0]!.annotationFlags & 2).toBe(2)
      expect(written[0]!.inReplyTo).toBe(noteId)

      expect(session(back)).toEqual([reply])
      expect(back.annotations.get(reply.id)?.locked).toBeUndefined()
      expect(isReply(reply, back.annotations.list.get())).toBe(true)
      expect(embedded(back)).toEqual([expect.objectContaining({ id: note!.id })])
      expect(back.changed.get()).toBe(false)

      // Deleted and saved again, it is gone, and the note is as it was.
      back.annotations.remove(reply.id)
      const again = await reopen(await save(back, 'reply removed'))
      expect(session(again)).toEqual([])
      const [kept] = embedded(again)
      // The file has no dates for it, so it gets the time it was read; the rest is the file's.
      const stable = (a: Annotation) => ({ ...a, createdAt: '', modifiedAt: '' })
      expect(stable(kept!)).toEqual(stable(note!))
      expect((await pdfjsAnnotations(again)).map((a) => a.id)).toEqual([noteId])
    })
  })

  describe('a file whose saved annotations another program linked to', () => {
    it('saves around them: the notes, the replies and the pop-up are left as they are', async () => {
      const engine = realEngine()
      const doc = await open('saved-replied', { engine: engine.loader })
      await doc._liftSettled
      const before = await pdfjsAnnotations(doc)
      const mine = doc.annotations.add({
        type: 'square',
        page: 0,
        rect: { x: 300, y: 300, width: 40, height: 40 },
      })
      const back = await reopen(await save(doc, 'saved around linked notes'))
      // Only the lifted square's file copy is removed and written again, with the new one.
      const [, , , square] = await written('saved-replied')
      expect(engine.writes[0]!.remove).toHaveLength(1)
      expect(engine.writes[0]!.annotations!.map((a) => a.annotation.id)).toEqual([
        square!.id,
        mine.id,
      ])
      const after = await pdfjsAnnotations(back)
      const kept = before.filter((a) => a.subtype === 'Text' || a.subtype === 'Popup')
      expect(kept).toHaveLength(5)
      // Each is still the same object, linked to the same objects.
      for (const a of kept)
        expect(after.find((b) => b.id === a.id)).toMatchObject({
          subtype: a.subtype,
          annotationFlags: a.annotationFlags,
          ...(a.inReplyTo === undefined ? {} : { inReplyTo: a.inReplyTo }),
          ...(a.popupRef === undefined ? {} : { popupRef: a.popupRef }),
          ...(a.parentRect === undefined ? {} : { parentRect: a.parentRect }),
        })
      const replies = after.filter((a) => a.inReplyTo !== undefined)
      expect(replies).toHaveLength(2)
      expect(new Set(replies.map((a) => a.inReplyTo)).size).toBe(1)
      expect(after.some((a) => a.popupRef !== undefined && a.popupRef !== null)).toBe(
        true
      )
      expect(byId(session(back))).toEqual(byId([square!, mine]))
      expect(embedded(back).map((a) => a.contents)).toEqual(
        embedded(doc).map((a) => a.contents)
      )
    })
  })

  describe('a reply to a file annotation that takes no replies', () => {
    it('is written as the note it shows, and stays in the file when opened again', async () => {
      const doc = await open('cropbox-offset', { engine: realEngine().loader })
      await doc._liftSettled
      const [square] = embedded(doc)
      expect(square).toMatchObject({ type: 'square', locked: true })
      doc.annotations.add({
        type: 'text',
        page: 0,
        rect: { x: 200, y: 200, width: 20, height: 20 },
        contents: 'About the square',
        inReplyTo: square!.id,
      })
      const back = await reopen(await save(doc, 'reply to a file square'))
      // A square roots no thread, so the note is not lifted as a reply to it.
      expect(session(back)).toEqual([])
      expect(embedded(back).map((a) => a.type)).toEqual(['square', 'text'])
      expect(embedded(back).every((a) => a.locked)).toBe(true)
    })
  })

  describe('in controlled mode, before the host answers the lift', () => {
    it('keeps the lifted annotations: no change, and a save keeps them', async () => {
      const { loader } = realEngine()
      const onChange = vi.fn<(next: Annotation[], change: AnnotationChange) => void>()
      const doc = await open('saved-signed', {
        engine: loader,
        annotations: { mode: 'controlled', initial: [], onChange },
      })
      await doc._liftSettled
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(session(doc)).toEqual([])
      expect(doc.changed.get()).toBe(false)
      expect(await doc.save()).toEqual(await fixtureBytes('saved-signed'))
      expect(loader).not.toHaveBeenCalled()

      // Another change is written with the lifted signature still in place.
      doc.form.set({ name: 'Ada' })
      expect(doc.changed.get()).toBe(true)
      const back = await reopen(await save(doc, 'controlled, unanswered'))
      const [signature] = await written('saved-signed')
      expect(session(back)).toEqual([signature])
      expect(back.form.get('sig')).toEqual({ signature: signature!.id })
      expect(back.form.get('name')).toBe('Ada')
    })

    it('takes the list the host pushes as the session from then on', async () => {
      const onChange = vi.fn<(next: Annotation[], change: AnnotationChange) => void>()
      const doc = await open('saved-annotations', {
        engine: realEngine().loader,
        annotations: { mode: 'controlled', initial: [], onChange },
      })
      await doc._liftSettled
      expect(doc.changed.get()).toBe(false)
      const proposed = onChange.mock.calls[0]![0]
      doc.annotations.setControlledValue(proposed)
      expect(doc.changed.get()).toBe(false)

      // A host that leaves them out has deleted them.
      doc.annotations.setControlledValue([])
      expect(doc.changed.get()).toBe(true)
      const back = await reopen(await save(doc, 'controlled, dropped'))
      expect(session(back)).toEqual([])
      expect(embedded(back)).toEqual([])
    })
  })

  // Last, so it sees every file the tests above saved.
  it.skipIf(!qpdfAvailable)('saves files qpdf --check passes', async () => {
    expect(saved.length).toBeGreaterThan(10)
    for (const { name, bytes, password } of saved)
      expect({ name, result: await qpdfCheck(bytes, password) }).toEqual({
        name,
        result: { ok: true },
      })
  })
})
