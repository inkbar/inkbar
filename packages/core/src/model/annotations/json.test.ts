import { afterEach, describe, expect, it, vi } from 'vitest'

import { staticDefaults } from './defaults'
import { exportAnnotations, importAnnotations } from './json'
import { createAnnotationStore } from './store'
import { ANNOTATION_FORMAT, type AnnotationDocument } from './types'

const rect = { x: 0, y: 0, width: 20, height: 20 }

describe('json import/export', () => {
  // Restores console.warn spies even when an assertion fails first.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('round-trips session annotations and excludes embedded ones', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const a = s.add({ type: 'text', page: 0, rect, contents: 'x' })
    s._setEmbedded([{ ...a, id: 'pdf:1R', source: 'pdf', locked: true }])
    const out = exportAnnotations(s, [], 'doc-1')
    const { source: _source, ...exported } = a
    expect(out).toEqual({
      format: ANNOTATION_FORMAT,
      version: 1,
      documentKey: 'doc-1',
      annotations: [exported],
    })
    const s2 = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const result = importAnnotations(s2, JSON.stringify(out), { mode: 'replace' })
    expect(result).toEqual({ imported: 1, unknown: [], errors: [] })
    expect(s2.list.get()).toEqual([a])
  })

  it('round-trips dashes, endings, subject and intent', () => {
    const mk = () =>
      createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
    const s = mk()
    s.add({
      type: 'polyline',
      page: 0,
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      dashes: [3, 3],
      head: 'closedArrow',
      tail: 'circle',
      subject: 'Arrow',
      intent: 'LineArrow',
    })
    s.add({ type: 'square', page: 0, rect, dashes: [4, 2] })
    const text = JSON.stringify(exportAnnotations(s, [], 'k'))
    const s2 = mk()
    expect(importAnnotations(s2, text, { mode: 'replace' }).errors).toEqual([])
    expect(s2.list.get()).toEqual(s.list.get())
    expect(s2.list.get()[0]).toMatchObject({ dashes: [3, 3], head: 'closedArrow' })
  })

  it('round-trips a square corner radius', () => {
    const mk = () =>
      createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
    const s = mk()
    s.add({ type: 'square', page: 0, rect, cornerRadius: 8 })
    const text = JSON.stringify(exportAnnotations(s, [], 'k'))
    const s2 = mk()
    expect(importAnnotations(s2, text, { mode: 'replace' }).errors).toEqual([])
    expect(s2.list.get()).toEqual(s.list.get())
    expect(s2.list.get()[0]).toMatchObject({ cornerRadius: 8 })
  })

  it('round-trips ink pressure', () => {
    const mk = () =>
      createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
    const s = mk()
    s.add({
      type: 'ink',
      page: 0,
      inklist: [
        [
          { x: 1, y: 1 },
          { x: 9, y: 4 },
        ],
        [{ x: 20, y: 20 }],
      ],
      pressure: [[0.2, 0.9], [0.5]],
    })
    const text = JSON.stringify(exportAnnotations(s, [], 'k'))
    const s2 = mk()
    expect(importAnnotations(s2, text, { mode: 'replace' }).errors).toEqual([])
    expect(s2.list.get()).toEqual(s.list.get())
    expect(s2.list.get()[0]).toMatchObject({ pressure: [[0.2, 0.9], [0.5]] })
  })

  it('round-trips a free-text box with fill, border and text style', () => {
    const mk = () =>
      createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
    const s = mk()
    s.add({
      type: 'freetext',
      page: 0,
      rect,
      contents: 'Hello\nthere',
      color: '#FFFF00',
      borderColor: '#FF0000',
      width: 2,
      dashes: [3, 3],
      cornerRadius: 6,
      defaultStyle: {
        fontFamily: 'Times',
        fontSize: 18,
        color: '#123456',
        textAlign: 'justify',
        fontWeight: 'bold',
        fontStyle: 'italic',
        textDecoration: 'underline',
      },
    })
    s.add({ type: 'freetext', page: 0, rect, contents: 'Plain' })
    const text = JSON.stringify(exportAnnotations(s, [], 'k'))
    const s2 = mk()
    expect(importAnnotations(s2, text, { mode: 'replace' }).errors).toEqual([])
    expect(s2.list.get()).toEqual(s.list.get())
    expect(s2.list.get()[1]).not.toHaveProperty('color')
    expect(s2.list.get()[1]).toMatchObject({
      width: 0,
      defaultStyle: { color: staticDefaults.color('freetext'), fontSize: 12 },
    })
  })

  it('merge keeps existing ids not in the import and overwrites matching ids', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const keep = s.add({ type: 'text', page: 0, rect })
    const change = s.add({ type: 'text', page: 0, rect, contents: 'old' })
    importAnnotations(
      s,
      {
        format: ANNOTATION_FORMAT,
        version: 1,
        annotations: [{ ...change, contents: 'new' }],
      },
      { mode: 'merge' }
    )
    expect(s.get(keep.id)).toBeDefined()
    expect(s.get(change.id)?.contents).toBe('new')
  })

  it('preserves unknown types and reports invalid items', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const unknown = {
      id: 'u1',
      type: 'hologram',
      page: 0,
      rect,
      color: '#000000',
      opacity: 1,
      createdAt: 'a',
      modifiedAt: 'b',
      source: 'session',
    }
    const result = importAnnotations(
      s,
      {
        format: ANNOTATION_FORMAT,
        version: 1,
        annotations: [unknown, { type: 'text' }],
      } as never,
      { mode: 'replace' }
    )
    expect(result.imported).toBe(0)
    expect(result.unknown).toEqual([unknown])
    expect(result.errors[0]?.index).toBe(1)
    expect(result.errors[0]?.issues.some((i) => i.startsWith('id:'))).toBe(true)
    expect(exportAnnotations(s, result.unknown).annotations).toEqual([unknown])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toMatch(/hologram/)
    warn.mockRestore()
  })

  it('names each unknown type once in a single warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    importAnnotations(
      s,
      {
        format: ANNOTATION_FORMAT,
        version: 1,
        annotations: [
          { type: 'hologram', id: 'a', page: 0 },
          { type: 'hologram', id: 'b', page: 0 },
          { type: 'sticker', id: 'c', page: 1 },
        ],
      } as never,
      { mode: 'replace' }
    )
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message.match(/hologram/g)).toHaveLength(1)
    expect(message).toMatch(/sticker/)
    warn.mockRestore()
  })

  it('leaves embedded annotations alone in both modes', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const a = s.add({ type: 'text', page: 0, rect })
    const pdf = { ...a, id: 'pdf:0:1R', source: 'pdf' as const, locked: true }
    s._setEmbedded([pdf])
    const empty: AnnotationDocument = {
      format: ANNOTATION_FORMAT,
      version: 1,
      annotations: [],
    }
    importAnnotations(s, empty, { mode: 'merge' })
    expect(s.list.get()).toEqual([pdf, a])
    importAnnotations(s, empty, { mode: 'replace' })
    expect(s.list.get()).toEqual([pdf])
    const clash = importAnnotations(
      s,
      {
        ...empty,
        annotations: [{ ...pdf, source: 'session' as const, contents: 'hijack' }],
      },
      { mode: 'merge' }
    )
    expect(clash.imported).toBe(0)
    expect(clash.errors[0]?.index).toBe(0)
    expect(s.list.get()).toEqual([pdf])
  })

  it('rejects a wrong envelope', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    expect(() =>
      importAnnotations(s, { format: 'other', version: 1, annotations: [] } as never, {
        mode: 'replace',
      })
    ).toThrow(/inkbar\/annotations/)
  })

  it('reports unknown types without an id or page instead of preserving them', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const result = importAnnotations(
      s,
      {
        format: ANNOTATION_FORMAT,
        version: 1,
        annotations: [
          { type: 'hologram', page: 0 },
          { type: 'hologram', id: 'x', page: '0' },
        ],
      } as never,
      { mode: 'replace' }
    )
    expect(result.unknown).toEqual([])
    expect(result.errors.map((e) => e.index)).toEqual([0, 1])
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('keeps the first of duplicate ids and reports the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const a = s.add({ type: 'text', page: 0, rect, contents: 'first' })
    for (const mode of ['replace', 'merge'] as const) {
      const result = importAnnotations(
        s,
        {
          format: ANNOTATION_FORMAT,
          version: 1,
          annotations: [
            a,
            { ...a, contents: 'second' },
            { id: a.id, type: 'hologram', page: 0 },
          ],
        } as never,
        { mode }
      )
      expect(result.imported).toBe(1)
      expect(result.unknown).toEqual([])
      expect(result.errors.map((e) => e.index)).toEqual([1, 2])
      expect(result.errors[0]?.issues[0]).toMatch(new RegExp(`duplicate id "${a.id}"`))
      expect(s.list.get()).toEqual([a])
    }
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('exports copies, so editing the export leaves the store alone', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const a = s.add({ type: 'text', page: 0, rect, contents: 'kept' })
    const foreign = { id: 'f', type: 'hologram', page: 0, nested: { n: 1 } }
    const out = exportAnnotations(s, [foreign])
    const [mine, theirs] = out.annotations as [typeof a, typeof foreign]
    mine.contents = 'changed'
    mine.rect.x = 99
    theirs.nested.n = 2
    expect(s.get(a.id)).toEqual(a)
    expect(s.get(a.id)?.rect.x).toBe(0)
    expect(foreign.nested.n).toBe(1)
  })
})
