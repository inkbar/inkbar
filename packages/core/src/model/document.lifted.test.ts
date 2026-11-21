import { readFile } from 'node:fs/promises'

import { fixtureBytes, fixturePath, manifest, type FixtureName } from '@inkbar/fixtures'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'

import { openDocument, type InkDocument, type OpenOptions } from './document'

import type { AnnotationChange } from './annotations/store'
import type { Annotation } from './annotations/types'

const opened: InkDocument[] = []
afterEach(() => opened.splice(0).forEach((d) => d.destroy()))

async function open(name: FixtureName, opts: Partial<OpenOptions> = {}) {
  const password = manifest[name].password
  const doc = await openDocument(await fixtureBytes(name), {
    assets: nodeAssets(),
    verbosity: 0,
    ...(password ? { password } : {}),
    ...opts,
  })
  opened.push(doc)
  await doc.ready
  return doc
}

/** The annotations the fixture script wrote into `name`, in order, as the session had them. */
async function written(name: FixtureName): Promise<Annotation[]> {
  const path = fixturePath(name).replace(/\.pdf$/, '.annotations.json')
  return JSON.parse(await readFile(path, 'utf8')) as Annotation[]
}

const embedded = (doc: InkDocument) =>
  doc.annotations.list.get().filter((a) => a.source === 'pdf')

describe.each(['saved-annotations', 'saved-incremental'] as const)(
  'opening %s',
  (name) => {
    it('lifts every annotation Inkbar saved, as it was saved', async () => {
      const doc = await open(name)
      await doc._liftSettled
      const expected = await written(name)
      const list = doc.annotations.list.get()
      expect(embedded(doc)).toEqual([])
      expect(list.every((a) => a.source === 'session' && a.locked === undefined)).toBe(
        true
      )
      expect(list).toEqual(expected)
      // One PDF.js id per annotation written, the hidden reply's included.
      expect(doc._lifted.get().size).toBe(expected.length)
    })

    it('is no undo step and no change the user made', async () => {
      const doc = await open(name)
      await doc._liftSettled
      expect(doc.history.canUndo.get()).toBe(false)
      expect(doc.history.canRedo.get()).toBe(false)
    })
  }
)

describe('lifting', () => {
  it('shows the file copies locked until it lands, then swaps them in one change', async () => {
    const doc = await open('saved-annotations')
    const before = embedded(doc)
    expect(before.length).toBeGreaterThan(0)
    expect(before.every((a) => a.locked)).toBe(true)
    const changes: AnnotationChange[] = []
    doc.annotations.on('change', (c) => changes.push(c))
    await doc._liftSettled
    const lifted = changes.filter((c) => c.kind === 'replace' && c.reason === 'file')
    expect(lifted).toHaveLength(1)
    expect(lifted[0]).toMatchObject({
      kind: 'replace',
      reason: 'file',
      removed: before.map((a) => a.id),
      lifted: await written('saved-annotations'),
    })
  })

  it('keeps an edit made before it lands, with its undo step', async () => {
    const doc = await open('saved-annotations')
    const mine = doc.annotations.add({
      type: 'square',
      page: 2,
      rect: { x: 10, y: 10, width: 20, height: 20 },
    })
    expect(doc.history.canUndo.get()).toBe(true)
    await doc._liftSettled
    const expected = await written('saved-annotations')
    expect(doc.annotations.list.get()).toEqual([mine, ...expected])
    doc.history.undo()
    expect(doc.annotations.list.get()).toEqual(expected)
    doc.history.redo()
    expect(doc.annotations.list.get()).toEqual([mine, ...expected])
  })

  it('leaves the annotations another program changed as locked file annotations', async () => {
    const doc = await open('saved-tampered')
    await doc._liftSettled
    const [square] = await written('saved-tampered')
    expect(doc.annotations.list.get().filter((a) => a.source === 'session')).toEqual([
      square,
    ])
    const locked = embedded(doc)
    expect(locked.map((a) => a.type)).toEqual(['circle', 'line'])
    expect(locked.every((a) => a.locked)).toBe(true)
    expect(doc._lifted.get().size).toBe(1)
  })

  it('lifts nothing from an encrypted file', async () => {
    const doc = await open('saved-encrypted')
    await doc._liftSettled
    expect(doc.annotations.list.get().filter((a) => a.source === 'session')).toEqual([])
    expect(embedded(doc).map((a) => a.type)).toEqual(['square', 'text'])
    expect(doc._lifted.get().size).toBe(0)
  })

  it('signs the signature field the saved signature signed, outside history', async () => {
    const doc = await open('saved-signed')
    await doc._liftSettled
    const [signature] = await written('saved-signed')
    expect(doc.annotations.get(signature!.id)).toEqual(signature)
    expect(doc.form.get('sig')).toEqual({ signature: signature!.id })
    expect(doc.annotations._isPinned(signature!.id)).toBe(true)
    expect(doc.history.canUndo.get()).toBe(false)
  })

  it('settles for a file without annotations, an unreadable file and a destroyed document', async () => {
    const plain = await open('text-simple')
    await expect(plain._liftSettled).resolves.toBeUndefined()
    expect(plain._lifted.get().size).toBe(0)

    const broken = await openDocument(await fixtureBytes('malformed-truncated'), {
      assets: nodeAssets(),
      verbosity: 0,
    })
    opened.push(broken)
    await expect(broken._liftSettled).resolves.toBeUndefined()

    const gone = await open('saved-annotations')
    gone.destroy()
    await expect(gone._liftSettled).resolves.toBeUndefined()
    expect(gone._lifted.get().size).toBe(0)
  })
})

describe('an annotation Inkbar saved that another program has linked to', () => {
  it('is not lifted: the replied-to note, the note with a pop-up and the replies stay in the file', async () => {
    const doc = await open('saved-replied')
    await doc._liftSettled
    const [replied, , popped, square] = await written('saved-replied')
    // Only the square, which nothing else in the file points at, joins the session.
    expect(doc.annotations.list.get().filter((a) => a.source === 'session')).toEqual([
      square,
    ])
    expect(doc._lifted.get().size).toBe(1)
    const locked = embedded(doc)
    // Inkbar's own reply to the first note stays with it, as the file has it.
    expect(locked.map((a) => a.contents)).toEqual([
      replied!.contents,
      'A reply Inkbar saved',
      popped!.contents,
      'A reply from another program',
    ])
    expect(locked.every((a) => a.locked && a.type === 'text')).toBe(true)
    expect(locked[1]!.inReplyTo).toBe(locked[0]!.id)
    expect(locked[3]!.inReplyTo).toBe(locked[0]!.id)
  })
})

describe('the summary of the file', () => {
  const count = (doc: InkDocument) =>
    Object.fromEntries(doc.embedded.map((s) => [s.subtype, s.count]))

  it('stops counting the annotations lifted, and never counted them as unsupported stamps', async () => {
    const doc = await open('saved-annotations')
    const before = doc.embedded
    expect(count(doc)).toMatchObject({ Stamp: 3, Square: 2, Text: 2 })
    const heard: (readonly unknown[])[] = []
    doc._embedded.subscribe((s) => heard.push(s))
    await doc._liftSettled
    expect(doc.embedded).toEqual([])
    // A new array, so a host that kept the old one sees what it was given.
    expect(doc.embedded).not.toBe(before)
    expect(heard).toEqual([[]])
  })

  it('keeps counting what stays in the file', async () => {
    const tampered = await open('saved-tampered')
    expect(count(tampered)).toEqual({ Square: 1, Circle: 1, Line: 1 })
    await tampered._liftSettled
    expect(count(tampered)).toEqual({ Circle: 1, Line: 1 })
    expect(tampered.embedded.every((s) => s.supported)).toBe(true)

    const replied = await open('saved-replied')
    await replied._liftSettled
    expect(count(replied)).toEqual({ Text: 4, Popup: 1 })

    const plain = await open('annotated-shapes')
    const summary = plain.embedded
    await plain._liftSettled
    expect(plain.embedded).toBe(summary)
  })
})

describe("another program's redaction marks", () => {
  const count = (doc: InkDocument) =>
    Object.fromEntries(doc.embedded.map((s) => [s.subtype, s.count]))

  it('are adopted once lifting settles', async () => {
    const doc = await open('redact-foreign-mark')
    expect(count(doc)).toEqual({ Redact: 1 })
    await doc._liftSettled
    const list = doc.annotations.list.get()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ type: 'redact', source: 'session', page: 1 })
    expect((list[0] as Annotation & { locked?: boolean }).locked).toBeUndefined()
    expect(doc._lifted.get().size).toBe(1)
    expect(count(doc)).toEqual({})
  })

  it('take their pop-up along', async () => {
    const doc = await open('redact-foreign-popup')
    expect(count(doc)).toEqual({ Redact: 1, Popup: 1 })
    await doc._liftSettled
    expect(doc.annotations.list.get().map((a) => a.source)).toEqual(['session'])
    expect(doc._lifted.get().size).toBe(2)
    expect(count(doc)).toEqual({})
  })

  it('are not a change', async () => {
    const doc = await open('redact-foreign-popup')
    await doc._liftSettled
    expect(doc.annotations.list.get()).toHaveLength(1)
    expect(doc.changed.get()).toBe(false)
    expect(doc.history.canUndo.get()).toBe(false)
    expect(await doc.save()).toEqual(await fixtureBytes('redact-foreign-popup'))
  })

  it('come back on undo after a delete', async () => {
    const doc = await open('redact-foreign-popup')
    await doc._liftSettled
    const [mark] = doc.annotations.list.get()
    const copies = doc._lifted.get()
    doc.annotations.remove(mark!.id)
    expect(doc.annotations.list.get()).toEqual([])
    expect(doc.changed.get()).toBe(true)
    doc.history.undo()
    expect(doc.annotations.list.get()).toEqual([mark])
    expect(doc._lifted.get()).toEqual(copies)
    expect(doc._lifted.get().has('6R')).toBe(true)
    expect(doc.changed.get()).toBe(false)
  })

  it('stay locked in an encrypted file', async () => {
    const doc = await open('redact-foreign-encrypted')
    await doc._liftSettled
    const list = doc.annotations.list.get()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ type: 'redact', source: 'pdf', locked: true })
    expect(doc._lifted.get().size).toBe(0)
    expect(count(doc)).toEqual({ Redact: 1 })
  })

  it('are proposed to a controlled host once', async () => {
    const onChange = vi.fn<(next: Annotation[], change: AnnotationChange) => void>()
    const doc = await open('redact-foreign-mark', {
      annotations: { mode: 'controlled', initial: [], onChange },
    })
    await doc._liftSettled
    expect(onChange).toHaveBeenCalledTimes(1)
    const [next, change] = onChange.mock.calls[0]!
    expect(next).toEqual([
      expect.objectContaining({ type: 'redact', source: 'session', page: 1 }),
    ])
    expect(change).toMatchObject({ kind: 'replace', reason: 'file', lifted: next })
    // Not shown until the host pushes it back, and the file copy is gone already.
    expect(doc.annotations.list.get()).toEqual([])
    expect(doc._lifted.get().size).toBe(1)
    expect(doc.changed.get()).toBe(false)
    doc.annotations.setControlledValue(next)
    expect(doc.annotations.list.get()).toEqual(next)
    expect(doc.changed.get()).toBe(false)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('both marks of annotated-redact are adopted', async () => {
    const doc = await open('annotated-redact')
    await doc._liftSettled
    const list = doc.annotations.list.get()
    expect(list.map((a) => [a.type, a.source])).toEqual([
      ['redact', 'session'],
      ['redact', 'session'],
    ])
    // One over text, with quads, and one over an area, with none.
    const quads = list.map((a) => (a.type === 'redact' ? (a.quads?.length ?? 0) : -1))
    expect(quads.filter((n) => n > 0)).toHaveLength(1)
    expect(quads.filter((n) => n === 0)).toHaveLength(1)
    expect(doc._lifted.get().size).toBe(2)
    expect(doc.embedded).toEqual([])
  })
})

describe('lifting in controlled mode', () => {
  it('proposes the lifted annotations once, with reason file, and hides the file copies', async () => {
    const onChange = vi.fn<(next: Annotation[], change: AnnotationChange) => void>()
    const doc = await open('saved-annotations', {
      annotations: { mode: 'controlled', initial: [], onChange },
    })
    await doc._liftSettled
    const expected = await written('saved-annotations')
    expect(onChange).toHaveBeenCalledTimes(1)
    const [next, change] = onChange.mock.calls[0]!
    expect(next).toEqual(expected)
    expect(change).toMatchObject({ kind: 'replace', reason: 'file', lifted: expected })
    // Not shown until the host pushes them back, and the file copies are gone already.
    expect(doc.annotations.list.get()).toEqual([])
    expect(doc._lifted.get().size).toBe(expected.length)
    doc.annotations.setControlledValue(next)
    expect(doc.annotations.list.get()).toEqual(expected)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("keeps the host's copy of an id it already holds", async () => {
    const expected = await written('saved-annotations')
    const host: Annotation = { ...expected[7]!, color: '#00AA00' }
    const onChange = vi.fn<(next: Annotation[], change: AnnotationChange) => void>()
    const doc = await open('saved-annotations', {
      annotations: { mode: 'controlled', initial: [host], onChange },
    })
    await doc._liftSettled
    expect(onChange).toHaveBeenCalledTimes(1)
    const [next] = onChange.mock.calls[0]!
    expect(next).toEqual([host, ...expected.filter((a) => a.id !== host.id)])
    expect(doc.annotations.list.get()).toEqual([host])
    // The file's copy of it is hidden all the same.
    expect(doc._lifted.get().size).toBe(expected.length)
  })
})
