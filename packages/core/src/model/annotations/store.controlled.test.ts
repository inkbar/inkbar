import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { staticDefaults } from './defaults'
import { createAnnotationStore, type AnnotationChange } from './store'

import type { Annotation } from './types'

const rect = { x: 0, y: 0, width: 20, height: 20 }
const fixedNow = () => '2026-10-12T12:00:00.000Z'

function controlledStore(initial: Annotation[] = []) {
  let value: Annotation[] = initial
  const onChange = vi.fn((next: Annotation[], _change: AnnotationChange) => {
    value = next
  })
  const s = createAnnotationStore({
    mode: { mode: 'controlled', initial, onChange },
    defaults: staticDefaults,
  })
  return { s, onChange, apply: () => s.setControlledValue(value), value: () => value }
}

function ignoringStore(initial: Annotation[] = [], now?: () => string) {
  const nexts: Annotation[][] = []
  const s = createAnnotationStore({
    mode: {
      mode: 'controlled',
      initial,
      onChange: (next) => {
        nexts.push(next)
      },
    },
    defaults: staticDefaults,
    ...(now ? { now } : {}),
  })
  return { s, nexts }
}

describe('AnnotationStore (controlled)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('proposes changes without applying them until the host pushes a value', () => {
    const { s, onChange, apply } = controlledStore()
    const a = s.add({ type: 'note', page: 0, rect })
    expect(s.list.get()).toEqual([])
    expect(onChange).toHaveBeenCalledWith([a], { kind: 'add', annotation: a })
    apply()
    expect(s.list.get()).toEqual([a])
  })

  it('leaves the list unchanged after update and remove until the host applies, and reports the right shapes', () => {
    const { s, onChange, apply, value } = controlledStore()
    const a = s.add({ type: 'note', page: 0, rect, contents: 'one' })
    apply()
    const b = s.update(a.id, { contents: 'two' })
    expect(b?.contents).toBe('two')
    expect(s.get(a.id)?.contents).toBe('one')
    expect(onChange).toHaveBeenLastCalledWith([b], {
      kind: 'update',
      id: a.id,
      before: a,
      after: b,
    })
    apply()
    expect(s.get(a.id)?.contents).toBe('two')
    expect(s.remove(a.id)).toBe(true)
    expect(s.list.get()).toHaveLength(1)
    expect(onChange).toHaveBeenLastCalledWith([], { kind: 'remove', annotation: b })
    expect(value()).toEqual([])
    apply()
    expect(s.list.get()).toEqual([])
  })

  it('reconciles by id when the host passes a new list', () => {
    const { s, apply, value } = controlledStore()
    const a = s.add({ type: 'note', page: 0, rect })
    apply()
    s.select([a.id])
    const serverVersion: Annotation = { ...a, contents: 'server edit' }
    s.setControlledValue([serverVersion, ...value().filter((x) => x.id !== a.id)])
    expect(s.get(a.id)?.contents).toBe('server edit')
    expect(s.selection.get()).toEqual([a.id])
    s.setControlledValue([])
    expect(s.selection.get()).toEqual([])
  })

  it('warns when the host ignores a mutation', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { s } = ignoringStore()
    const a = s.add({ type: 'note', page: 0, rect })
    vi.runAllTimers()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('ControlledMutationIgnored')
    expect(warn.mock.calls[0]![0]).toContain(a.id)
    expect(s.list.get()).toEqual([])
  })

  it('does not warn when the host applies before the macrotask fires', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { s, apply } = controlledStore()
    s.add({ type: 'note', page: 0, rect })
    apply()
    vi.runAllTimers()
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not warn in production builds', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubEnv('NODE_ENV', 'production')
    const { s } = ignoringStore()
    s.add({ type: 'note', page: 0, rect })
    vi.runAllTimers()
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns once, naming the second change, when only the first of two same-millisecond updates is applied', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const a: Annotation = {
      ...controlledStore().s.completeInput({
        type: 'note',
        page: 0,
        rect,
        contents: 'zero',
      }),
    }
    const { s, nexts } = ignoringStore([a], fixedNow)
    s.update(a.id, { contents: 'first' })
    s.update(a.id, { contents: 'second' })
    s.setControlledValue(nexts[0]!)
    vi.runAllTimers()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('update')
    expect(s.get(a.id)?.contents).toBe('first')
  })

  it('does not warn when the host applies an update but re-stamps modifiedAt', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const base = controlledStore().s.completeInput({ type: 'note', page: 0, rect })
    const { s, nexts } = ignoringStore([base], fixedNow)
    s.update(base.id, { contents: 'edited' })
    s.setControlledValue(
      nexts[0]!.map((x) => ({ ...x, modifiedAt: '2030-01-01T00:00:00.000Z' }))
    )
    vi.runAllTimers()
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not collide with an annotation whose id is "replace"', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { s } = ignoringStore()
    const a = s.add({ type: 'note', page: 0, rect, id: 'replace' })
    s.replaceAll([], 'import')
    vi.runAllTimers()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain(a.id)
  })

  it('does not arm a warning for replace changes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { s } = ignoringStore()
    s.replaceAll([], 'import')
    expect(vi.getTimerCount()).toBe(0)
    vi.runAllTimers()
    expect(warn).not.toHaveBeenCalled()
  })

  it('destroy cancels a pending warning and makes later calls no-ops', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { s, onChange } = controlledStore()
    s.add({ type: 'note', page: 0, rect })
    s.destroy()
    expect(vi.getTimerCount()).toBe(0)
    onChange.mockClear()
    const a = s.completeInput({ type: 'note', page: 0, rect })
    s.setControlledValue([a])
    expect(s.list.get()).toEqual([])
    expect(s.add({ type: 'note', page: 0, rect })).toBeDefined()
    expect(s.update(a.id, { contents: 'x' })).toBeUndefined()
    expect(s.remove(a.id)).toBe(false)
    s.replaceAll([a], 'import')
    expect(onChange).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    vi.runAllTimers()
    expect(warn).not.toHaveBeenCalled()
  })

  it('destroyed uncontrolled stores ignore mutations too', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    s.destroy()
    s.add({ type: 'note', page: 0, rect })
    expect(s.list.get()).toEqual([])
  })

  it('does not alias the host array', () => {
    const { s } = controlledStore()
    const a = s.completeInput({ type: 'note', page: 0, rect })
    const hostList = [a]
    s.setControlledValue(hostList)
    hostList.push(s.completeInput({ type: 'note', page: 1, rect }))
    expect(s.list.get()).toHaveLength(1)

    const initial = [a]
    const u = createAnnotationStore({
      mode: { mode: 'uncontrolled', initial },
      defaults: staticDefaults,
    })
    initial.pop()
    expect(u.list.get()).toHaveLength(1)
  })

  it('setControlledValue throws in uncontrolled mode', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    expect(() => s.setControlledValue([])).toThrow(TypeError)
  })
})
