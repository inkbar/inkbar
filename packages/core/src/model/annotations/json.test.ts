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
    const a = s.add({ type: 'note', page: 0, rect, contents: 'x' })
    s._setEmbedded([{ ...a, id: 'pdf:1R', source: 'pdf', locked: true }])
    const out = exportAnnotations(s, [], 'doc-1')
    expect(out).toEqual({
      format: ANNOTATION_FORMAT,
      version: 1,
      documentKey: 'doc-1',
      annotations: [a],
    })
    const s2 = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const result = importAnnotations(s2, JSON.stringify(out), { mode: 'replace' })
    expect(result).toEqual({ imported: 1, unknown: [], errors: [] })
    expect(s2.list.get()).toEqual([a])
  })

  it('merge keeps existing ids not in the import and overwrites matching ids', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const keep = s.add({ type: 'note', page: 0, rect })
    const change = s.add({ type: 'note', page: 0, rect, contents: 'old' })
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
        annotations: [unknown, { type: 'note' }],
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
    const a = s.add({ type: 'note', page: 0, rect })
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
    const a = s.add({ type: 'note', page: 0, rect, contents: 'first' })
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
    const a = s.add({ type: 'note', page: 0, rect, contents: 'kept' })
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
