import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { fixtureBytes } from '@inkbar/fixtures'
import { Ajv2020 } from 'ajv/dist/2020'
import { describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'

import { staticDefaults } from './annotations/defaults'
import { exportAnnotations, importAnnotations } from './annotations/json'
import { createAnnotationStore } from './annotations/store'
import { openDocument } from './document'

import type { Annotation } from './annotations/types'

const rect = { x: 0, y: 0, width: 20, height: 20 }

/** What an export carries for `a`: no viewer state. */
const exported = ({ source: _source, locked: _locked, ...rest }: Annotation) => rest

const compileSchema = () =>
  new Ajv2020({ strict: false, validateFormats: false }).compile(
    JSON.parse(
      readFileSync(
        createRequire(import.meta.url).resolve('gloss-format/schema.json'),
        'utf8'
      )
    ) as object
  )

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
    const mine = doc.annotations.add({ type: 'text', page: 0, rect })
    const out = doc.exportAnnotations('json')
    expect(out.documentKey).toBe(doc.key)
    expect(out.annotations).toEqual([exported(mine)])
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
    doc.annotations.add({ type: 'text', page: 0, rect, contents: 'hello' })
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
    const validate = compileSchema()
    const out = doc.exportAnnotations('json')
    expect(out.annotations).toHaveLength(2)
    expect(validate(JSON.parse(JSON.stringify(out)))).toBe(true)
    doc.destroy()
  })

  it('export carries the gloss format marker', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    expect(exportAnnotations(store).format).toBe('gloss')
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
    doc.annotations.add({ type: 'text', page: 0, rect })
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
    on.annotations.add({ type: 'text', page: 0, rect })
    expect(on.history.canUndo.get()).toBe(true)
    on.history.undo()
    expect(on.annotations.list.get()).toEqual([])
    on.destroy()

    const off = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
      history: false,
    })
    await off.ready
    off.annotations.add({ type: 'text', page: 0, rect })
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
    doc.annotations.add({ type: 'text', page: 0, rect })
    expect(doc.annotations.list.get()).toEqual([])
  })

  it('keeps embedded annotations out of controlled host state', async () => {
    const changes: Annotation[][] = []
    const doc = await openDocument(await fixtureBytes('annotated-notes-threaded'), {
      assets: nodeAssets(),
      annotations: {
        mode: 'controlled',
        initial: [],
        onChange: (next) => changes.push(next),
      },
    })
    await doc.ready
    try {
      const pdfIds = doc.annotations.list.get().map((a) => a.id)
      expect(pdfIds).toHaveLength(4)

      const note = doc.annotations.add({ type: 'text', page: 0, rect })
      expect(changes).toEqual([[note]])
      doc.annotations.setControlledValue(changes[0]!)
      expect(doc.annotations.list.get().map((a) => a.id)).toEqual([...pdfIds, note.id])

      doc.annotations.setControlledValue([])
      expect(doc.annotations.list.get().map((a) => a.id)).toEqual(pdfIds)

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      vi.useFakeTimers()
      try {
        expect(doc.annotations.remove(pdfIds[0]!)).toBe(false)
        vi.runAllTimers()
        expect(warn).not.toHaveBeenCalled()
        expect(changes).toHaveLength(1)
        expect(doc.annotations.list.get()).toHaveLength(4)
      } finally {
        vi.useRealTimers()
        warn.mockRestore()
      }
    } finally {
      doc.destroy()
    }
  })

  it('refuses to remove embedded annotations in uncontrolled mode', async () => {
    const doc = await openDocument(await fixtureBytes('annotated-notes-threaded'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const [first] = doc.annotations.list.get()
    expect(doc.annotations.remove(first!.id)).toBe(false)
    expect(doc.annotations.list.get()).toHaveLength(4)
    doc.destroy()
  })

  it('round-trips foreign items, which validate as unknown annotations', async () => {
    const foreign = {
      id: 'f1',
      type: 'hologram',
      page: 0,
      rect,
      depth: { layers: [1, 2, 3], tint: null },
      source: 'session',
    }
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const mine = doc.annotations.add({ type: 'text', page: 0, rect })
      doc.importAnnotations(
        { format: 'gloss', version: 1, annotations: [mine, foreign] },
        { mode: 'replace' }
      )
      const out = doc.exportAnnotations('json')
      expect(out.annotations).toEqual([exported(mine), foreign])
      const json = JSON.stringify(out)
      expect(compileSchema()(JSON.parse(json))).toBe(true)

      const fresh = createAnnotationStore({
        mode: { mode: 'uncontrolled' },
        defaults: staticDefaults,
      })
      const result = importAnnotations(fresh, json, { mode: 'replace' })
      expect(result.imported).toBe(1)
      expect(result.unknown.map((u) => JSON.stringify(u))).toEqual([
        JSON.stringify(foreign),
      ])
      expect(warn).toHaveBeenCalledTimes(2)
    } finally {
      warn.mockRestore()
      doc.destroy()
    }
  })

  it('merges by id across known and foreign items', async () => {
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const envelope = { format: 'gloss' as const, version: 1 as const }
      const known = doc.annotations.completeInput({
        id: 'x',
        type: 'text',
        page: 0,
        rect,
      })
      const foreign = { id: 'x', type: 'hologram', page: 0 }

      doc.importAnnotations({ ...envelope, annotations: [foreign] })
      doc.importAnnotations({ ...envelope, annotations: [known] }, { mode: 'merge' })
      expect(doc.exportAnnotations('json').annotations).toEqual([exported(known)])

      doc.importAnnotations({ ...envelope, annotations: [foreign] }, { mode: 'merge' })
      expect(doc.exportAnnotations('json').annotations).toEqual([foreign])
      expect(doc.annotations.list.get()).toEqual([])
    } finally {
      warn.mockRestore()
      doc.destroy()
    }
  })

  it('records foreign items before the store announces the import', async () => {
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const foreign = { id: 'f', type: 'hologram', page: 0 }
      const seen: unknown[][] = []
      doc.annotations.on('change', () =>
        seen.push(doc.exportAnnotations('json').annotations)
      )
      doc.importAnnotations({
        format: 'gloss',
        version: 1,
        annotations: [foreign],
      })
      expect(seen).toEqual([[foreign]])
    } finally {
      warn.mockRestore()
      doc.destroy()
    }
  })

  it('exports JSON-safe copies of host data', async () => {
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    await doc.ready
    try {
      const callback = () => 'host'
      const a = doc.annotations.add({
        type: 'text',
        page: 0,
        rect,
        custom: { callback, label: 'kept' },
      })
      const out = doc.exportAnnotations('json')
      expect(out.annotations).toEqual([{ ...exported(a), custom: { label: 'kept' } }])
      expect(doc.annotations.get(a.id)?.custom?.callback).toBe(callback)
    } finally {
      doc.destroy()
    }
  })

  it('reserves an embedded id so a later item with it is a duplicate', async () => {
    const doc = await openDocument(await fixtureBytes('annotated-notes-threaded'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const [pdf] = doc.annotations.list.get()
      const id = pdf!.id
      const result = doc.importAnnotations({
        format: 'gloss',
        version: 1,
        annotations: [
          { ...pdf!, source: 'session' },
          { id, type: 'hologram', page: 0 },
        ],
      })
      expect(result.imported).toBe(0)
      expect(result.unknown).toEqual([])
      expect(result.errors).toEqual([
        { index: 0, issues: [expect.stringMatching(/embedded in the PDF/)] },
        { index: 1, issues: [`id: duplicate id "${id}", already used by item 0`] },
      ])
      expect(doc.exportAnnotations('json').annotations).toEqual([])
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
      doc.destroy()
    }
  })
})
