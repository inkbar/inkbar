import { describe, expect, it, vi } from 'vitest'

import { staticDefaults } from './defaults'
import { exportAnnotations, importAnnotations } from './json'
import { createAnnotationStore } from './store'
import { ANNOTATION_FORMAT, type AnnotationDocument } from './types'

const rect = { x: 0, y: 0, width: 20, height: 20 }

describe('json import/export', () => {
  it('round-trips session annotations and excludes embedded ones', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const a = s.add({ type: 'note', page: 0, rect, contents: 'x' })
    s.replaceAll([a, { ...a, id: 'pdf:1R', source: 'pdf', locked: true }], 'import')
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
        annotations: [{ type: 'hologram' }, { type: 'hologram' }, { type: 'sticker' }],
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
    s.replaceAll([pdf, a], 'import')
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
})
