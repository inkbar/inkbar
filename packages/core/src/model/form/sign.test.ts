import { fixtureBytes, type FixtureName } from '@inkbar/fixtures'
import { describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../../pdfjs/node-assets'
import { createToolStyle } from '../annotations/tool-style'
import { openDocument, type OpenOptions } from '../document'
import { createImageTemplate, createInkTemplate } from '../signatures'

import { signField } from './sign'

import type { FieldsChange, FieldValues, FormField } from './types'
import type { Annotation } from '../annotations/types'

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const ink = createInkTemplate([
  [
    { x: 0, y: 0 },
    { x: 40, y: 10 },
    { x: 80, y: 0 },
  ],
])
const image = createImageTemplate(PNG, 4)

async function open(name: FixtureName = 'form-fields', opts: Partial<OpenOptions> = {}) {
  const doc = await openDocument(await fixtureBytes(name), {
    assets: nodeAssets(),
    ...opts,
  })
  await doc.ready
  return doc
}

const fieldOf = (fields: readonly FormField[], name: string) =>
  fields.find((f) => f.name === name)!

/** `inner` lies inside `outer`, give or take rounding. */
function inside(
  inner: { x: number; y: number; width: number; height: number },
  outer: typeof inner
) {
  const e = 1e-6
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - e)
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - e)
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + e)
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + e)
}

describe('signField', () => {
  it('signs a field with one undo step', async () => {
    const doc = await open()
    const sig = fieldOf(doc.form.fields.get(), 'sig')
    const widget = sig.widgets[0]!
    const id = signField(doc, 'sig', widget.id, ink)
    expect(doc.form.get('sig')).toEqual({ signature: id })
    const a = doc.annotations.get(id)!
    expect(a.subject).toBe('Signature')
    expect(a.page).toBe(widget.page)
    inside(a.rect, widget.rect)
    // Fitted: 90% of the box on its constraining side, centred.
    const width = Math.min(widget.rect.width, widget.rect.height * ink.aspect) * 0.9
    expect(a.rect.width).toBeCloseTo(width)
    expect(a.rect.x + a.rect.width / 2).toBeCloseTo(widget.rect.x + widget.rect.width / 2)
    expect(a.rect.y + a.rect.height / 2).toBeCloseTo(
      widget.rect.y + widget.rect.height / 2
    )
    doc.history.undo()
    expect(doc.form.get('sig')).toBeUndefined()
    expect(doc.annotations.get(id)).toBeUndefined()
    expect(doc.history.canUndo.get()).toBe(false)
    doc.history.redo()
    expect(doc.form.get('sig')).toEqual({ signature: id })
    expect(doc.annotations.get(id)).toBeDefined()
    doc.destroy()
  })

  it('a drawn signature becomes ink, an image becomes a stamp', async () => {
    const doc = await open()
    const widget = fieldOf(doc.form.fields.get(), 'sig').widgets[0]!
    const drawn = signField(doc, 'sig', widget.id, ink)
    expect(doc.annotations.get(drawn)?.type).toBe('ink')
    doc.history.undo()
    const stamped = signField(doc, 'sig', widget.id, image)
    const a = doc.annotations.get(stamped)!
    expect(a.type).toBe('stamp')
    expect(a).toMatchObject({ subject: 'Signature', imagedata: PNG })
    inside(a.rect, widget.rect)
    doc.destroy()
  })

  it('deleting the signature clears the field', async () => {
    const doc = await open()
    const widget = fieldOf(doc.form.fields.get(), 'sig').widgets[0]!
    const id = signField(doc, 'sig', widget.id, ink)
    expect(doc.annotations.remove(id)).toBe(true)
    expect(doc.form.get('sig')).toBeUndefined()
    expect(doc.annotations._isPinned(id)).toBe(false)
    // One step: undo brings both back.
    doc.history.undo()
    expect(doc.annotations.get(id)).toBeDefined()
    expect(doc.form.get('sig')).toEqual({ signature: id })
    expect(doc.annotations._isPinned(id)).toBe(true)
    doc.destroy()
  })

  it('reset clears the field and removes the signature', async () => {
    const doc = await open()
    const widget = fieldOf(doc.form.fields.get(), 'sig').widgets[0]!
    const id = signField(doc, 'sig', widget.id, image)
    doc.form.reset(['sig'])
    expect(doc.form.get('sig')).toBeUndefined()
    expect(doc.annotations.get(id)).toBeUndefined()
    doc.history.undo()
    expect(doc.form.get('sig')).toEqual({ signature: id })
    expect(doc.annotations.get(id)).toBeDefined()
    doc.form.reset()
    expect(doc.annotations.get(id)).toBeUndefined()
    doc.destroy()
  })

  it('a pinned signature refuses moves', async () => {
    const doc = await open()
    const widget = fieldOf(doc.form.fields.get(), 'sig').widgets[0]!
    const id = signField(doc, 'sig', widget.id, image)
    const before = doc.annotations.get(id)!
    expect(doc.annotations._isPinned(id)).toBe(true)
    doc.annotations.update(id, { rect: { x: 0, y: 0, width: 10, height: 10 } })
    expect(doc.annotations.get(id)?.rect).toEqual(before.rect)
    doc.annotations.update(id, { page: 1 })
    expect(doc.annotations.get(id)?.page).toBe(before.page)
    // Its comment is still its own.
    doc.annotations.update(id, { contents: 'Signed in Leeds' })
    expect(doc.annotations.get(id)?.contents).toBe('Signed in Leeds')
    doc.destroy()
  })

  it('a pinned signature refuses restyles, and the style controls offer none', async () => {
    const doc = await open()
    const widget = fieldOf(doc.form.fields.get(), 'sig').widgets[0]!
    const id = signField(doc, 'sig', widget.id, ink)
    const before = doc.annotations.get(id)!
    expect(doc.annotations.update(id, { color: '#ff0000' })).toBeUndefined()
    expect(doc.annotations.update(id, { opacity: 0.5 })).toBeUndefined()
    expect(doc.annotations.update(id, { width: 6 })).toBeUndefined()
    expect(
      doc.annotations.update(id, { contents: 'x', color: '#ff0000' })
    ).toBeUndefined()
    expect(doc.annotations.get(id)).toEqual(before)

    const style = createToolStyle({
      store: doc.annotations,
      history: doc.history,
      activeGroup: () => undefined,
    })
    doc.annotations.select([id])
    expect([...style.supported.get()]).toEqual([])
    expect(() => style.set({ border: '#00ff00', opacity: 0.4, width: 4 })).not.toThrow()
    expect(doc.annotations.get(id)).toEqual(before)
    expect(doc.history.canUndo.get()).toBe(true)
    doc.history.undo()
    // Nothing was recorded for the refused restyle: the undo undid the signing.
    expect(doc.annotations.get(id)).toBeUndefined()

    // Removal still works.
    doc.history.redo()
    expect(doc.annotations.remove(id)).toBe(true)
    expect(doc.form.get('sig')).toBeUndefined()
    doc.destroy()
  })

  it('fits the box as a rotated page shows it, centred', async () => {
    const doc = await open()
    const widget = fieldOf(doc.form.fields.get(), 'sig2').widgets[0]!
    expect(doc.pages[widget.page]!.rotate).toBe(90)
    const r = widget.rect
    for (const t of [ink, image]) {
      const id = signField(doc, 'sig2', widget.id, t)
      const a = doc.annotations.get(id)!
      inside(a.rect, r)
      expect(a.rect.x + a.rect.width / 2).toBeCloseTo(r.x + r.width / 2)
      expect(a.rect.y + a.rect.height / 2).toBeCloseTo(r.y + r.height / 2)
      // A quarter turn: across the page is the rect's height, down it the rect's width.
      const across = Math.min(r.height, r.width * t.aspect) * 0.9
      expect(a.rect.height).toBeCloseTo(across)
      expect(a.rect.width).toBeCloseTo(across / t.aspect)
      doc.history.undo()
    }
    doc.destroy()
  })

  it('controlled annotations: an imported signature keeps its field', async () => {
    const source = await open()
    const widget = fieldOf(source.form.fields.get(), 'sig').widgets[0]!
    const id = signField(source, 'sig', widget.id, image)
    const gloss = source.exportAnnotations('json')
    source.destroy()

    const proposals: Annotation[][] = []
    const changes = vi.fn<(next: FieldValues, change: FieldsChange) => void>()
    const doc = await open('form-fields', {
      annotations: {
        mode: 'controlled',
        initial: [],
        onChange: (next) => proposals.push(next),
      },
      fields: { mode: 'controlled', initial: {}, onChange: changes },
    })
    doc.importAnnotations(gloss)
    expect(doc.form.get('sig')).toEqual({ signature: id })
    expect(changes).toHaveBeenCalledTimes(1)
    expect(changes.mock.calls[0]![1]).toEqual({ kind: 'import', names: ['sig'] })
    doc.annotations.setControlledValue(proposals.at(-1)!)
    expect(doc.annotations.get(id)).toBeDefined()
    expect(doc.form.get('sig')).toEqual({ signature: id })
    expect(doc.annotations._isPinned(id)).toBe(true)
    expect(changes).toHaveBeenCalledTimes(1)
    doc.destroy()
  })

  it('controlled annotations: a field waiting for its signature is being signed', async () => {
    const proposals: Annotation[][] = []
    const doc = await open('form-fields', {
      annotations: {
        mode: 'controlled',
        initial: [],
        onChange: (next) => proposals.push(next),
      },
    })
    const widget = fieldOf(doc.form.fields.get(), 'sig').widgets[0]!
    const first = signField(doc, 'sig', widget.id, ink)
    expect(() => signField(doc, 'sig', widget.id, ink)).toThrow(
      expect.objectContaining({ code: 'FieldSigned' })
    )
    expect(proposals).toHaveLength(1)
    doc.annotations.setControlledValue(proposals[0]!)
    expect(doc.form.get('sig')).toEqual({ signature: first })

    // A proposal the host lets lapse without pushing frees the field again.
    doc.annotations.setControlledValue([])
    signField(doc, 'sig', widget.id, ink)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(() => signField(doc, 'sig', widget.id, ink)).not.toThrow()
    doc.destroy()
  })

  it('controlled annotations: a host that drops the signature clears the field', async () => {
    let list: Annotation[] = []
    const proposals: Annotation[][] = []
    const doc = await open('form-fields', {
      annotations: {
        mode: 'controlled',
        initial: [],
        onChange: (next) => proposals.push(next),
      },
    })
    const widget = fieldOf(doc.form.fields.get(), 'sig').widgets[0]!
    const id = signField(doc, 'sig', widget.id, ink)
    expect(proposals).toHaveLength(1)
    // Proposed, not applied: the field waits for it.
    expect(doc.form.get('sig')).toBeUndefined()
    list = proposals[0]!
    doc.annotations.setControlledValue(list)
    expect(doc.form.get('sig')).toEqual({ signature: id })
    expect(doc.annotations._isPinned(id)).toBe(true)
    doc.annotations.setControlledValue([])
    expect(doc.form.get('sig')).toBeUndefined()
    expect(doc.annotations._isPinned(id)).toBe(false)

    // A host that never applies the proposal leaves the field empty.
    const dropped = signField(doc, 'sig', widget.id, ink)
    doc.annotations.setControlledValue([])
    expect(doc.form.get('sig')).toBeUndefined()
    // Arriving later, after the host dropped it, it signs nothing.
    doc.annotations.setControlledValue(proposals.at(-1)!)
    expect(doc.annotations.get(dropped)).toBeDefined()
    expect(doc.form.get('sig')).toBeUndefined()
    doc.destroy()
  })

  it('controlled fields hear of a signing once, and of its removal once', async () => {
    const onChange = vi.fn<(next: FieldValues) => void>()
    const doc = await open('form-fields', {
      fields: { mode: 'controlled', initial: {}, onChange },
    })
    const widget = fieldOf(doc.form.fields.get(), 'sig').widgets[0]!
    const id = signField(doc, 'sig', widget.id, ink)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0].sig).toEqual({ signature: id })
    doc.annotations.remove(id)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange.mock.calls[1]![0].sig).toBeUndefined()
    doc.destroy()
  })

  it('a signed field cannot be signed again until cleared', async () => {
    const doc = await open()
    const widget = fieldOf(doc.form.fields.get(), 'sig').widgets[0]!
    const id = signField(doc, 'sig', widget.id, ink)
    expect(() => signField(doc, 'sig', widget.id, ink)).toThrow(
      expect.objectContaining({ name: 'InkError', code: 'FieldSigned' })
    )
    expect(
      doc.annotations.list.get().filter((a) => a.subject === 'Signature')
    ).toHaveLength(1)
    doc.annotations.remove(id)
    expect(() => signField(doc, 'sig', widget.id, ink)).not.toThrow()
    doc.destroy()
  })

  it('refuses unknown fields, unknown widgets and other field types', async () => {
    const doc = await open()
    const sig = fieldOf(doc.form.fields.get(), 'sig').widgets[0]!.id
    const name = fieldOf(doc.form.fields.get(), 'name').widgets[0]!.id
    expect(() => signField(doc, 'nope', sig, ink)).toThrow(
      expect.objectContaining({ code: 'UnknownField' })
    )
    expect(() => signField(doc, 'sig', name, ink)).toThrow(
      expect.objectContaining({ code: 'UnknownField' })
    )
    expect(() => signField(doc, 'name', name, ink)).toThrow(
      expect.objectContaining({ code: 'NotSignatureField' })
    )
    expect(doc.annotations.list.get()).toHaveLength(0)
    doc.destroy()
  })

  it('a certificate-signed field is read-only', async () => {
    const doc = await open('form-signed')
    const cert = fieldOf(doc.form.fields.get(), 'cert')
    expect(cert.signed).toBe('certificate')
    expect(() => signField(doc, 'cert', cert.widgets[0]!.id, ink)).toThrow(
      expect.objectContaining({ code: 'FieldReadOnly' })
    )
    expect(doc.annotations.list.get()).toHaveLength(0)
    doc.destroy()
  })

  it('DocMDP P=1 locks every field', async () => {
    const doc = await open('form-signed')
    expect(doc.form.set({ name: 'x' }).rejected).toEqual([
      { name: 'name', reason: 'readOnly' },
    ])
    doc.destroy()
  })

  it('/Lock locks only the listed fields', async () => {
    const doc = await open('form-fieldmdp')
    expect(doc.form.set({ amount: '1.00', memo: 'Paid' })).toEqual({
      applied: ['memo'],
      rejected: [{ name: 'amount', reason: 'readOnly' }],
    })
    expect(doc.form.get('memo')).toBe('Paid')
    doc.destroy()
  })
})
