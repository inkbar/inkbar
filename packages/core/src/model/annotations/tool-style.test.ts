import { describe, expect, it } from 'vitest'

import { staticDefaults } from './defaults'
import { createHistory } from './history'
import { createAnnotationStore } from './store'
import { createToolStyle, type StyleGroup } from './tool-style'

import type { Annotation, AnnotationInput } from './types'

const rect = { x: 10, y: 10, width: 40, height: 40 }

function setup(group: StyleGroup | 'none' = 'shape', initial: Annotation[] = []) {
  let n = 0
  const store = createAnnotationStore({
    mode: { mode: 'uncontrolled', initial },
    defaults: staticDefaults,
    id: () => `id-${++n}`,
    now: () => '2026-10-19T12:00:00.000Z',
  })
  const history = createHistory(store)
  let active: StyleGroup | undefined = group === 'none' ? undefined : group
  const style = createToolStyle({ store, history, activeGroup: () => active })
  return {
    store,
    history,
    style,
    setGroup: (g: StyleGroup | undefined) => {
      active = g
    },
  }
}

const lockedSquare: Annotation = {
  id: 'pdf:0:9R',
  type: 'square',
  page: 0,
  rect,
  color: '#000000',
  opacity: 1,
  width: 1,
  createdAt: '2026-10-19T12:00:00.000Z',
  modifiedAt: '2026-10-19T12:00:00.000Z',
  source: 'pdf',
  locked: true,
}

const quads = [
  {
    p1: { x: 0, y: 20 },
    p2: { x: 50, y: 20 },
    p3: { x: 0, y: 0 },
    p4: { x: 50, y: 0 },
  },
]

describe('createToolStyle', () => {
  it('set without selection updates only the group', () => {
    const { store, style } = setup('shape')
    const a = store.add({ type: 'square', page: 0, rect })
    style.set({ border: '#00FF00' })
    expect(style.get('shape').border).toBe('#00FF00')
    expect(style.get('ink').border).toBeUndefined()
    expect(store.get(a.id)).toBe(a)
  })

  it('set applies to selected annotations in one history step', () => {
    const { store, history, style } = setup('shape')
    const a = store.add({ type: 'square', page: 0, rect })
    const b = store.add({ type: 'square', page: 0, rect, width: 2 })
    store.select([a.id, b.id])
    style.set({ width: 4 })
    expect(store.get(a.id)).toMatchObject({ width: 4 })
    expect(store.get(b.id)).toMatchObject({ width: 4 })
    history.undo()
    expect(store.get(a.id)).toMatchObject({ width: 1 })
    expect(store.get(b.id)).toMatchObject({ width: 2 })
  })

  it('skips locked annotations and props a type lacks', () => {
    const { store, style } = setup('shape')
    store._setEmbedded([lockedSquare])
    const sq = store.add({ type: 'square', page: 0, rect })
    const hl = store.add({ type: 'highlight', page: 0, quads })
    store.select([sq.id, lockedSquare.id, hl.id])
    expect(() => style.set({ width: 4 })).not.toThrow()
    expect(store.get(sq.id)).toMatchObject({ width: 4 })
    expect(store.get(lockedSquare.id)).toBe(lockedSquare)
    expect(store.get(hl.id)).toBe(hl)
  })

  it('with a select tool (no active group) updates each selected type’s group', () => {
    const { store, style } = setup('none')
    const line = store.add({
      type: 'line',
      page: 0,
      start: { x: 0, y: 0 },
      end: { x: 10, y: 10 },
    })
    const ink = store.add({ type: 'ink', page: 0, inklist: [[{ x: 0, y: 0 }]] })
    store.select([line.id, ink.id])
    style.set({ border: '#123456' })
    expect(style.get('shape').border).toBe('#123456')
    expect(style.get('ink').border).toBe('#123456')
    expect(style.get('markup').border).toBeUndefined()
    expect(store.get(line.id)?.color).toBe('#123456')
    expect(store.get(ink.id)?.color).toBe('#123456')
  })

  it('changes nothing under a select tool with nothing selected', () => {
    const { style } = setup('none')
    style.set({ border: '#123456' })
    for (const g of ['shape', 'ink', 'text', 'markup', 'redact'] as const)
      expect(style.get(g)).toEqual({})
  })

  it('reports mixed values for a mixed selection', () => {
    const { store, style } = setup('none')
    const a = store.add({ type: 'square', page: 0, rect, width: 1 })
    const b = store.add({ type: 'square', page: 0, rect, width: 3 })
    store.select([a.id, b.id])
    expect(style.current.get().width).toBe('mixed')
    expect(style.current.get().border).toBe(staticDefaults.color('square'))
  })

  it('current follows the selection, then the active group', () => {
    const { store, style } = setup('shape')
    const values: unknown[] = []
    const stop = style.current.subscribe((v) => values.push(v.width))
    style.set({ width: 5 })
    const a = store.add({ type: 'square', page: 0, rect, width: 2 })
    store.select([a.id])
    expect(style.current.get().width).toBe(2)
    store.select([])
    expect(style.current.get().width).toBe(5)
    expect(values).toEqual([5, 2, 5])
    stop()
  })

  it('keeps current and supported stable while unobserved, for React snapshots', () => {
    const { style } = setup('shape')
    expect(style.current.get()).toBe(style.current.get())
    expect(style.supported.get()).toBe(style.supported.get())
  })

  it('supported reflects the selection, then the active group', () => {
    const { store, style, setGroup } = setup('markup')
    expect(style.supported.get().has('width')).toBe(false)
    setGroup('shape')
    expect(style.supported.get().has('head')).toBe(true)
    const a = store.add({ type: 'square', page: 0, rect })
    store.select([a.id])
    expect(style.supported.get().has('fill')).toBe(true)
    expect(style.supported.get().has('head')).toBe(false)
  })

  it('apply: false updates only the group', () => {
    const { store, style } = setup('shape')
    const a = store.add({ type: 'square', page: 0, rect })
    store.select([a.id])
    style.set({ width: 6 }, { apply: false })
    expect(style.get('shape').width).toBe(6)
    expect(store.get(a.id)).toBe(a)
  })

  it('resolve: explicit input wins, then group, then nothing (theme default left to the store)', () => {
    const { style } = setup('shape')
    const square: AnnotationInput = { type: 'square', page: 0, rect }
    expect(style.resolve('shape', square).color).toBeUndefined()
    style.set({ border: '#111111', fill: null })
    expect(style.resolve('shape', { ...square, color: '#222222' }).color).toBe('#222222')
    const resolved = style.resolve('shape', square)
    expect(resolved.color).toBe('#111111')
    expect('interiorColor' in resolved).toBe(false)
  })
})
