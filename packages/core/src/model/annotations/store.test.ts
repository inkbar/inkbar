import { describe, expect, it, vi } from 'vitest'

import { normalizeColor, staticDefaults } from './defaults'
import { createAnnotationStore, deriveRect } from './store'

import type { Annotation } from './types'

const quads = [
  {
    p1: { x: 72, y: 715 },
    p2: { x: 300, y: 715 },
    p3: { x: 72, y: 695 },
    p4: { x: 300, y: 695 },
  },
]
const ids = (() => {
  let n = 0
  return () => `id-${++n}`
})()
const now = () => '2026-10-12T12:00:00.000Z'

function store(initial: Annotation[] = []) {
  return createAnnotationStore({
    mode: { mode: 'uncontrolled', initial },
    defaults: staticDefaults,
    id: ids,
    now,
  })
}

describe('deriveRect', () => {
  it('derives from quads, paths, line and vertices', () => {
    expect(deriveRect({ type: 'highlight', page: 0, quads })).toEqual({
      x: 72,
      y: 695,
      width: 228,
      height: 20,
    })
    expect(
      deriveRect({
        type: 'ink',
        page: 0,
        paths: [
          [
            { x: 0, y: 0 },
            { x: 10, y: 4 },
          ],
        ],
        strokeWidth: 2,
      })
    ).toEqual({ x: -1, y: -1, width: 12, height: 6 })
    expect(
      deriveRect({ type: 'line', page: 0, start: { x: 5, y: 5 }, end: { x: 1, y: 9 } })
    ).toEqual({ x: 1, y: 5, width: 4, height: 4 })
    expect(
      deriveRect({
        type: 'polygon',
        page: 0,
        vertices: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 2, y: 3 },
        ],
      })
    ).toEqual({ x: 0, y: 0, width: 4, height: 3 })
  })
  it('throws when a rect-based type has no rect', () => {
    expect(() => deriveRect({ type: 'note', page: 0 })).toThrow(/rect is required/)
  })
})

describe('normalizeColor', () => {
  it('accepts hex and rgb forms', () => {
    expect(normalizeColor('#abc')).toBe('#AABBCC')
    expect(normalizeColor(' #f2c230 ')).toBe('#F2C230')
    expect(normalizeColor('rgb(242, 194, 48)')).toBe('#F2C230')
    expect(normalizeColor('rgb(242 194 48)')).toBe('#F2C230')
    expect(normalizeColor('tomato')).toBeUndefined()
  })
})

describe('AnnotationStore (uncontrolled)', () => {
  it('completes input with id, timestamps, source, defaults and derived rect', () => {
    const s = store()
    const a = s.add({ type: 'highlight', page: 0, quads })
    expect(a).toMatchObject({
      id: 'id-1',
      type: 'highlight',
      source: 'session',
      createdAt: now(),
      modifiedAt: now(),
      color: staticDefaults.color('highlight'),
      opacity: staticDefaults.opacity('highlight'),
      rect: { x: 72, y: 695, width: 228, height: 20 },
    })
    expect(s.list.get()).toEqual([a])
    expect(s.get('id-1')).toBe(a)
  })

  it('fills redact fill and origin defaults', () => {
    const a = store().add({
      type: 'redact',
      page: 1,
      rect: { x: 1, y: 1, width: 5, height: 5 },
    })
    expect(a.type).toBe('redact')
    if (a.type === 'redact') {
      expect(a.fill).toBe(staticDefaults.fill())
      expect(a.origin).toBe('user')
    }
  })

  it('colours a suggested redaction by its confidence bucket', () => {
    const s = store()
    const suggest = (confidence: number, color?: string) =>
      s.add({
        type: 'redact',
        page: 0,
        quads,
        origin: 'suggested',
        suggestion: { confidence },
        ...(color === undefined ? {} : { color }),
      })
    const low = suggest(0.2)
    const medium = suggest(0.6)
    const high = suggest(0.95)
    expect(low.color).toBe(staticDefaults.suggestion('low'))
    expect(medium.color).toBe(staticDefaults.suggestion('medium'))
    expect(high.color).toBe(staticDefaults.suggestion('high'))
    expect(new Set([low.color, medium.color, high.color]).size).toBe(3)
    if (high.type === 'redact') expect(high.fill).toBe(staticDefaults.fill())
    expect(suggest(0.95, '#123456').color).toBe('#123456')
  })

  it('rejects invalid input through zod', () => {
    expect(() => store().add({ type: 'highlight', page: -1, quads })).toThrow()
  })

  it('updates bump modifiedAt and emit before/after', () => {
    let t = 0
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
      id: ids,
      now: () => `t${++t}`,
    })
    const a = s.add({
      type: 'note',
      page: 0,
      rect: { x: 0, y: 0, width: 20, height: 20 },
      contents: 'hi',
    })
    const fn = vi.fn()
    s.on('change', fn)
    const b = s.update(a.id, { contents: 'edited' })
    expect(b?.contents).toBe('edited')
    expect(b?.modifiedAt).toBe('t2')
    expect(b?.createdAt).toBe('t1')
    expect(fn).toHaveBeenCalledWith({ kind: 'update', id: a.id, before: a, after: b })
    expect(s.update('missing', { contents: 'x' })).toBeUndefined()
  })

  it('refuses to move a locked annotation but allows selecting it', () => {
    const s = store()
    const a = s.add({
      type: 'note',
      page: 0,
      rect: { x: 0, y: 0, width: 20, height: 20 },
    })
    s.update(a.id, { locked: true })
    expect(
      s.update(a.id, { rect: { x: 5, y: 5, width: 20, height: 20 } })
    ).toBeUndefined()
    s.select([a.id])
    expect(s.selection.get()).toEqual([a.id])
  })

  it('removes and prunes selection, returns false for unknown ids', () => {
    const s = store()
    const a = s.add({
      type: 'note',
      page: 0,
      rect: { x: 0, y: 0, width: 20, height: 20 },
    })
    s.select([a.id])
    expect(s.remove(a.id)).toBe(true)
    expect(s.selection.get()).toEqual([])
    expect(s.remove(a.id)).toBe(false)
  })

  it('removing a note removes its replies', () => {
    const s = store()
    const root = s.add({
      type: 'note',
      page: 0,
      rect: { x: 0, y: 0, width: 20, height: 20 },
    })
    const reply = s.add({
      type: 'note',
      page: 0,
      rect: { x: 0, y: 0, width: 20, height: 20 },
      inReplyTo: root.id,
    })
    s.remove(root.id)
    expect(s.get(reply.id)).toBeUndefined()
  })

  it('byPage filters and replaceAll emits a replace change', () => {
    const s = store()
    s.add({ type: 'note', page: 0, rect: { x: 0, y: 0, width: 20, height: 20 } })
    const b = s.add({
      type: 'note',
      page: 2,
      rect: { x: 0, y: 0, width: 20, height: 20 },
    })
    expect(s.byPage(2)).toEqual([b])
    const fn = vi.fn()
    s.on('change', fn)
    s.replaceAll([b], 'import')
    expect(s.list.get()).toEqual([b])
    expect(fn).toHaveBeenCalledWith({ kind: 'replace', reason: 'import' })
  })
})

describe('AnnotationStore (controlled warning timing)', () => {
  it('warns only when the host never applies the change', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const s = createAnnotationStore({
        mode: {
          mode: 'controlled',
          initial: [],
          onChange: (next) => {
            // Like Vue's v-model: the host applies the list a microtask later.
            void Promise.resolve().then(() => {
              s.setControlledValue(next)
            })
          },
        },
        defaults: staticDefaults,
        id: ids,
        now,
      })
      s.add({ type: 'note', page: 0, rect: { x: 0, y: 0, width: 20, height: 20 } })
      await vi.runAllTimersAsync()
      expect(warn).not.toHaveBeenCalled()
      expect(s.list.get()).toHaveLength(1)

      const ignoring = createAnnotationStore({
        mode: { mode: 'controlled', initial: [], onChange: () => undefined },
        defaults: staticDefaults,
        id: ids,
        now,
      })
      ignoring.add({ type: 'note', page: 0, rect: { x: 0, y: 0, width: 20, height: 20 } })
      await vi.runAllTimersAsync()
      expect(warn).toHaveBeenCalledOnce()
      expect(warn.mock.calls[0]?.[0]).toMatch(/ControlledMutationIgnored/)
    } finally {
      warn.mockRestore()
      vi.useRealTimers()
    }
  })
})
