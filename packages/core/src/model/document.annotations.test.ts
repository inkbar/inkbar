import { readFileSync } from 'node:fs'

import { fixtureBytes } from '@inkbar/fixtures'
import { Ajv2020 } from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'

import { openDocument } from './document'

const rect = { x: 0, y: 0, width: 20, height: 20 }

describe('document annotations', () => {
  it('imports embedded annotations on open and summarises them', async () => {
    const doc = await openDocument(await fixtureBytes('annotated-notes-threaded'), {
      assets: nodeAssets(),
    })
    await doc.ready
    expect(doc.embedded).toEqual([{ subtype: 'Text', count: 4, supported: true }])
    expect(doc.annotations.list.get()).toHaveLength(4)
    expect(doc.annotations.list.get().every((a) => a.source === 'pdf' && a.locked)).toBe(
      true
    )
    expect(doc.history.canUndo.get()).toBe(false)
    doc.destroy()
  })

  it('has no embedded annotations for a plain document', async () => {
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    await doc.ready
    expect(doc.pages).toHaveLength(3)
    expect(doc.embedded).toEqual([])
    expect(doc.annotations.list.get().filter((a) => a.source === 'pdf')).toEqual([])
    doc.destroy()
  })

  it('export excludes embedded, import replaces session items only', async () => {
    const doc = await openDocument(await fixtureBytes('annotated-markup'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const mine = doc.annotations.add({ type: 'note', page: 0, rect })
    const out = doc.exportAnnotations('json')
    expect(out.documentKey).toBe(doc.key)
    expect(out.annotations).toEqual([mine])
    doc.importAnnotations({ ...out, annotations: [] })
    expect(doc.annotations.list.get().filter((a) => a.source === 'session')).toEqual([])
    expect(doc.annotations.list.get().filter((a) => a.source === 'pdf')).toHaveLength(4)
    doc.destroy()
  })

  it('exports JSON that validates against the published schema', async () => {
    const doc = await openDocument(await fixtureBytes('annotated-markup'), {
      assets: nodeAssets(),
    })
    await doc.ready
    doc.annotations.add({ type: 'note', page: 0, rect, contents: 'hello' })
    doc.annotations.add({
      type: 'highlight',
      page: 0,
      quads: [
        {
          p1: { x: 0, y: 10 },
          p2: { x: 10, y: 10 },
          p3: { x: 0, y: 0 },
          p4: { x: 10, y: 0 },
        },
      ],
    })
    const schema = JSON.parse(
      readFileSync(new URL('../../schema.json', import.meta.url), 'utf8')
    ) as object
    const validate = new Ajv2020({ strict: false }).compile(schema)
    const out = doc.exportAnnotations('json')
    expect(out.annotations).toHaveLength(2)
    expect(validate(JSON.parse(JSON.stringify(out)))).toBe(true)
    doc.destroy()
  })

  it('history and controlled mode are wired', async () => {
    const changes: unknown[] = []
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
      annotations: {
        mode: 'controlled',
        initial: [],
        onChange: (next) => changes.push(next),
      },
    })
    await doc.ready
    doc.annotations.add({ type: 'note', page: 0, rect })
    expect(changes).toHaveLength(1)
    expect(doc.history.canUndo.get()).toBe(false)
    doc.destroy()
  })

  it('keeps embedded annotations in a controlled list without calling onChange', async () => {
    const changes: unknown[][] = []
    const doc = await openDocument(await fixtureBytes('annotated-notes-threaded'), {
      assets: nodeAssets(),
      annotations: {
        mode: 'controlled',
        initial: [],
        onChange: (next) => changes.push(next),
      },
    })
    await doc.ready
    expect(changes).toEqual([])
    expect(doc.annotations.list.get()).toHaveLength(4)
    // A host that only tracks its own items still sees the embedded ones.
    doc.annotations.setControlledValue([])
    expect(doc.annotations.list.get()).toHaveLength(4)
    doc.destroy()
  })

  it('records undo history in uncontrolled mode, and not when disabled', async () => {
    const on = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    await on.ready
    on.annotations.add({ type: 'note', page: 0, rect })
    expect(on.history.canUndo.get()).toBe(true)
    on.history.undo()
    expect(on.annotations.list.get()).toEqual([])
    on.destroy()

    const off = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
      history: false,
    })
    await off.ready
    off.annotations.add({ type: 'note', page: 0, rect })
    expect(off.history.canUndo.get()).toBe(false)
    off.destroy()
  })

  it('save rejects with EngineUnavailable', async () => {
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const saving = doc.save()
    await expect(saving).rejects.toMatchObject({ code: 'EngineUnavailable' })
    await expect(saving).rejects.toThrow(/@inkbar\/engine/)
    doc.destroy()
  })

  it('destroy stops the store', async () => {
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    await doc.ready
    doc.destroy()
    doc.annotations.add({ type: 'note', page: 0, rect })
    expect(doc.annotations.list.get()).toEqual([])
  })
})
