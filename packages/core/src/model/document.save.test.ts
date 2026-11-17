import { readFile } from 'node:fs/promises'

import { EngineError } from '@inkbar/engine'
import { fixtureBytes, fixturePath, manifest, type FixtureName } from '@inkbar/fixtures'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'
import { qpdfAvailable, qpdfCheck, requireQpdfInCi } from '../test-support/qpdf'

import { openDocument, type InkDocument, type OpenOptions } from './document'
import { signField } from './form/sign'
import { createImageTemplate } from './signatures'

import type { AnnotationChange } from './annotations/store'
import type { Annotation, AnnotationInput } from './annotations/types'
import type { EngineLoader } from './save/saver'
import type { Engine, EngineDocument, WriteInput } from '@inkbar/engine'

requireQpdfInCi()

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
          write(input) {
            writes.push(input)
            if (fail) {
              const e = fail
              fail = undefined
              return Promise.reject(e)
            }
            return d.write(input)
          },
          save: (o) => d.save(o),
          close: () => d.close(),
        }
        return doc
      },
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
    let bytes = await save(first, 'grow 0')
    for (let round = 1; round <= 3; round++) {
      const doc = await reopen(bytes)
      const square = session(doc).find((a) => a.type === 'square')!
      doc.annotations.update(square.id, {
        rect: { ...square.rect, x: square.rect.x + round },
      })
      bytes = await save(doc, `grow ${round}`)
    }
    const last = await reopen(bytes)
    const once = await open('text-simple', {
      engine: realEngine().loader,
      annotations: { mode: 'uncontrolled', initial: session(last) },
    })
    await once._liftSettled
    const single = await save(once, 'single save')
    // A copy of the list left behind would add most of a single save each time. What does
    // grow is the cross-reference table: PDFium keeps the object numbers of what it removed as
    // free entries, 20 bytes each, so each save adds that much and no more.
    const sizes = saved
      .filter((s) => s.name.startsWith('grow '))
      .map((s) => s.bytes.length)
    expect(sizes).toHaveLength(4)
    for (let i = 1; i < sizes.length; i++)
      expect(sizes[i]! - sizes[i - 1]!).toBeLessThan(single.length * 0.1)
    expect(Math.abs(sizes[0]! - single.length)).toBeLessThan(single.length * 0.1)
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
