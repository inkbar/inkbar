import { ANNOTATION_TYPES } from 'gloss-format'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { staticDefaults } from './defaults'
import { exportAnnotations, importAnnotations, KNOWN_TYPES } from './json'
import { createAnnotationStore } from './store'
import { ExportedAnnotationSchema, GLOSS_FORMAT, type AnnotationDocument } from './types'

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
      format: GLOSS_FORMAT,
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
      head: 'ClosedArrow',
      tail: 'Circle',
      subject: 'Arrow',
      intent: 'LineArrow',
    })
    s.add({ type: 'square', page: 0, rect, dashes: [4, 2] })
    const text = JSON.stringify(exportAnnotations(s, [], 'k'))
    const s2 = mk()
    expect(importAnnotations(s2, text, { mode: 'replace' }).errors).toEqual([])
    expect(s2.list.get()).toEqual(s.list.get())
    expect(s2.list.get()[0]).toMatchObject({ dashes: [3, 3], head: 'ClosedArrow' })
  })

  it('round-trips PDF names Inkbar does not know', () => {
    const mk = () =>
      createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
    const s = mk()
    s.add({ type: 'text', page: 0, rect, icon: 'Check' })
    s.add({
      type: 'line',
      page: 0,
      start: { x: 0, y: 0 },
      end: { x: 10, y: 10 },
      head: 'ROpenArrow',
      intent: 'InkHighlight',
    })
    const text = JSON.stringify(exportAnnotations(s, [], 'k'))
    const s2 = mk()
    expect(importAnnotations(s2, text, { mode: 'replace' }).errors).toEqual([])
    expect(s2.list.get()).toEqual(s.list.get())
    expect(s2.list.get()[0]).toMatchObject({ icon: 'Check' })
    expect(s2.list.get()[1]).toMatchObject({ head: 'ROpenArrow', intent: 'InkHighlight' })
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

  it('round-trips a stamp with its image, subject and rotation', () => {
    const mk = () =>
      createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
    const s = mk()
    s.add({
      type: 'stamp',
      page: 0,
      rect: { x: 10, y: 20, width: 150, height: 50 },
      imagedata: 'data:image/png;base64,iVBORw0KGgo=',
      subject: 'Signature',
      rotation: 90,
    })
    const text = JSON.stringify(exportAnnotations(s, [], 'k'))
    const s2 = mk()
    expect(importAnnotations(s2, text, { mode: 'replace' }).errors).toEqual([])
    expect(s2.list.get()).toEqual(s.list.get())
    expect(s2.list.get()[0]).toMatchObject({
      type: 'stamp',
      imagedata: 'data:image/png;base64,iVBORw0KGgo=',
      subject: 'Signature',
      rotation: 90,
    })
  })

  it('round-trips a loupe with its magnification and rim', () => {
    const mk = () =>
      createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
    const s = mk()
    s.add({
      type: 'loupe',
      page: 0,
      rect: { x: 100, y: 500, width: 72, height: 72 },
      magnification: 3,
      color: '#2B5A9E',
      width: 4,
    })
    const out = exportAnnotations(s, [], 'k')
    // Gloss doesn't define a loupe, so the file writes it as the circle it draws.
    expect(out.annotations[0]).toMatchObject({
      type: 'circle',
      color: '#2B5A9E',
      width: 4,
      custom: { inkbar: { type: 'loupe', magnification: 3 } },
    })
    expect(out.annotations[0]).not.toHaveProperty('magnification')
    expect(s.list.get()[0]?.type).toBe('loupe')
    const text = JSON.stringify(out)
    const s2 = mk()
    expect(importAnnotations(s2, text, { mode: 'replace' }).errors).toEqual([])
    expect(s2.list.get()).toEqual(s.list.get())
    expect(s2.list.get()[0]).toMatchObject({
      type: 'loupe',
      magnification: 3,
      color: '#2B5A9E',
      width: 4,
    })
  })

  it('round-trips a mask with its shape and dim', () => {
    const mk = () =>
      createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
    const s = mk()
    s.add({
      type: 'mask',
      page: 0,
      rect: { x: 100, y: 500, width: 200, height: 120 },
      shape: 'ellipse',
      dim: 0.8,
    })
    const out = exportAnnotations(s, [], 'k')
    expect(out.annotations[0]).toMatchObject({
      type: 'circle',
      custom: { inkbar: { type: 'mask', dim: 0.8 } },
    })
    expect(out.annotations[0]).not.toHaveProperty('shape')
    const text = JSON.stringify(out)
    const s2 = mk()
    expect(importAnnotations(s2, text, { mode: 'replace' }).errors).toEqual([])
    expect(s2.list.get()).toEqual(s.list.get())
    expect(s2.list.get()[0]).toMatchObject({ type: 'mask', shape: 'ellipse', dim: 0.8 })
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
        format: GLOSS_FORMAT,
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
        format: GLOSS_FORMAT,
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
        format: GLOSS_FORMAT,
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
      format: GLOSS_FORMAT,
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
    ).toThrow(/gloss v1/)
  })

  it('parses every type Gloss defines today', () => {
    expect([...KNOWN_TYPES].sort()).toEqual([...ANNOTATION_TYPES].sort())
    for (const type of ANNOTATION_TYPES) {
      const parsed = ExportedAnnotationSchema.safeParse({ type })
      // Fails on missing fields, never on the type itself.
      expect(parsed.error?.issues.some((i) => i.path[0] === 'type')).toBe(false)
    }
  })

  it('keeps x-loupe and plain loupe items as unknown types', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const loupe = {
      id: 'l1',
      page: 0,
      rect: { x: 100, y: 500, width: 72, height: 72 },
      color: '#2B5A9E',
      opacity: 1,
      createdAt: '2026-10-20T12:00:00Z',
      modifiedAt: '2026-10-20T12:00:00Z',
    }
    const items = [
      { ...loupe, type: 'x-loupe' },
      { ...loupe, id: 'l2', type: 'loupe' },
    ]
    const result = importAnnotations(
      s,
      { format: GLOSS_FORMAT, version: 1, annotations: items },
      { mode: 'replace' }
    )
    expect(result).toEqual({ imported: 0, unknown: items, errors: [] })
    expect(s.list.get()).toEqual([])
  })

  it('drops a top-level pressure from an older file', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const ink = {
      type: 'ink',
      id: 'i1',
      page: 0,
      rect,
      color: '#000000',
      opacity: 1,
      createdAt: '2026-10-20T12:00:00Z',
      modifiedAt: '2026-10-20T12:00:00Z',
      inklist: [[{ x: 1, y: 1 }]],
      pressure: [[0.5]],
    }
    const result = importAnnotations(
      s,
      { format: GLOSS_FORMAT, version: 1, annotations: [ink] },
      { mode: 'replace' }
    )
    expect(result).toEqual({ imported: 1, unknown: [], errors: [] })
    expect(s.list.get()[0]).not.toHaveProperty('pressure')
  })

  it.each([
    ['out of range', [[1.5]]],
    ['not shaped like inklist', [[0.5, 0.5]]],
  ])('reports ink pressure %s at custom.inkbar.pressure', (_, pressure) => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const ink = {
      type: 'ink',
      id: 'i1',
      page: 0,
      rect,
      color: '#000000',
      opacity: 1,
      createdAt: '2026-10-20T12:00:00Z',
      modifiedAt: '2026-10-20T12:00:00Z',
      inklist: [[{ x: 1, y: 1 }]],
      custom: { inkbar: { pressure } },
    }
    const result = importAnnotations(
      s,
      { format: GLOSS_FORMAT, version: 1, annotations: [ink] },
      { mode: 'replace' }
    )
    expect(result.imported).toBe(0)
    expect(result.errors).toHaveLength(1)
    const issues = result.errors[0]?.issues ?? []
    expect(issues.length).toBeGreaterThan(0)
    for (const issue of issues) expect(issue).toMatch(/^custom\.inkbar\.pressure(\.|:)/)
  })

  it('reports a loupe with an invalid magnification', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const loupe = {
      type: 'circle',
      id: 'l1',
      page: 0,
      rect,
      color: '#2B5A9E',
      opacity: 1,
      createdAt: '2026-10-20T12:00:00Z',
      modifiedAt: '2026-10-20T12:00:00Z',
      custom: { inkbar: { type: 'loupe', magnification: 0.5 } },
    }
    const result = importAnnotations(
      s,
      { format: GLOSS_FORMAT, version: 1, annotations: [loupe] },
      { mode: 'replace' }
    )
    expect(result.imported).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(
      result.errors[0]?.issues.some((i) => i.startsWith('custom.inkbar.magnification:'))
    ).toBe(true)
    expect(result.errors[0]?.issues.some((i) => i.startsWith('magnification'))).toBe(
      false
    )
  })

  it('rejects an inkbar/annotations document', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const old = { format: 'inkbar/annotations', version: 1, annotations: [] }
    const run = () => importAnnotations(s, old as never, { mode: 'replace' })
    expect(run).toThrow(TypeError)
    expect(run).toThrow(/gloss v1/)
  })

  it('core is stricter than Gloss', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    // Valid Gloss, but Inkbar needs the fill, colour, opacity and dates.
    const minimal = { type: 'redact', id: 'r1', page: 0, rect }
    const result = importAnnotations(
      s,
      { format: GLOSS_FORMAT, version: 1, annotations: [minimal] } as never,
      { mode: 'replace' }
    )
    expect(result.imported).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.index).toBe(0)
    expect(result.errors[0]?.issues.join('\n')).toMatch(/interiorColor/)
    expect(s.list.get()).toEqual([])
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
        format: GLOSS_FORMAT,
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
          format: GLOSS_FORMAT,
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
