import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { staticDefaults } from './defaults'
import { createAnnotationStore, type AnnotationChange } from './store'
import { createToolStyle } from './tool-style'

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
    const a = s.add({ type: 'text', page: 0, rect })
    expect(s.list.get()).toEqual([])
    expect(onChange).toHaveBeenCalledWith([a], { kind: 'add', annotation: a })
    apply()
    expect(s.list.get()).toEqual([a])
  })

  it('leaves the list unchanged after update and remove until the host applies, and reports the right shapes', () => {
    const { s, onChange, apply, value } = controlledStore()
    const a = s.add({ type: 'text', page: 0, rect, contents: 'one' })
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
    expect(onChange).toHaveBeenLastCalledWith([], {
      kind: 'remove',
      annotation: b,
      removed: [b],
    })
    expect(value()).toEqual([])
    apply()
    expect(s.list.get()).toEqual([])
  })

  it('reconciles by id when the host passes a new list', () => {
    const { s, apply, value } = controlledStore()
    const a = s.add({ type: 'text', page: 0, rect })
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
    const a = s.add({ type: 'text', page: 0, rect })
    vi.runAllTimers()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('ControlledMutationIgnored')
    expect(warn.mock.calls[0]![0]).toContain(`for annotation ${a.id}.`)
    expect(s.list.get()).toEqual([])
  })

  it('drops an ignored add from the selection', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { s } = ignoringStore()
    const a = s.add({ type: 'text', page: 0, rect })
    s.select([a.id])
    expect(s.selection.get()).toEqual([a.id])
    vi.runAllTimers()
    expect(s.selection.get()).toEqual([])
  })

  it('does not warn when the host applies before the macrotask fires', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { s, apply } = controlledStore()
    s.add({ type: 'text', page: 0, rect })
    apply()
    vi.runAllTimers()
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not warn in production builds', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubEnv('NODE_ENV', 'production')
    const { s } = ignoringStore()
    s.add({ type: 'text', page: 0, rect })
    vi.runAllTimers()
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns once, naming the second change, when only the first of two same-millisecond updates is applied', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const a: Annotation = {
      ...controlledStore().s.completeInput({
        type: 'text',
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
    const base = controlledStore().s.completeInput({ type: 'text', page: 0, rect })
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
    const a = s.add({ type: 'text', page: 0, rect, id: 'replace' })
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
    s.add({ type: 'text', page: 0, rect })
    s.destroy()
    expect(vi.getTimerCount()).toBe(0)
    onChange.mockClear()
    const a = s.completeInput({ type: 'text', page: 0, rect })
    s.setControlledValue([a])
    expect(s.list.get()).toEqual([])
    expect(s.add({ type: 'text', page: 0, rect })).toBeDefined()
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
    s.add({ type: 'text', page: 0, rect })
    expect(s.list.get()).toEqual([])
  })

  it('does not alias the host array', () => {
    const { s } = controlledStore()
    const a = s.completeInput({ type: 'text', page: 0, rect })
    const hostList = [a]
    s.setControlledValue(hostList)
    hostList.push(s.completeInput({ type: 'text', page: 1, rect }))
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

describe('AnnotationStore (controlled) with embedded annotations', () => {
  const embedded: Annotation = {
    id: 'pdf:0:1R',
    type: 'text',
    icon: 'Comment',
    page: 0,
    rect,
    color: '#FFD400',
    opacity: 1,
    createdAt: '2026-10-12T12:00:00.000Z',
    modifiedAt: '2026-10-12T12:00:00.000Z',
    source: 'pdf',
    locked: true,
  }

  it('keeps embedded items in the store and out of onChange', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.useFakeTimers()
    try {
      const { s, onChange, apply } = controlledStore()
      s._setEmbedded([embedded])
      expect(onChange).not.toHaveBeenCalled()
      expect(s.list.get()).toEqual([embedded])

      // Embedded edits (non-geometry) apply here; the host never sees them.
      expect(s.update(embedded.id, { color: '#000000' })?.color).toBe('#000000')
      expect(onChange).not.toHaveBeenCalled()

      const note = s.add({ type: 'text', page: 0, rect })
      expect(onChange.mock.calls[0]?.[0]).toEqual([note])
      apply()
      expect(s.list.get().map((a) => a.id)).toEqual([embedded.id, note.id])

      // A host item reusing an embedded id is dropped.
      s.setControlledValue([{ ...embedded, source: 'session', contents: 'x' }])
      expect(s.list.get()).toHaveLength(1)
      expect(s.list.get()[0]?.source).toBe('pdf')

      expect(s.remove(embedded.id)).toBe(false)
      vi.runAllTimers()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      warn.mockRestore()
    }
  })

  describe('pending proposals', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    it('composes a second add on the first before the host applies', () => {
      const { s, onChange, apply } = controlledStore()
      const a = s.add({ type: 'text', page: 0, rect })
      const b = s.add({ type: 'text', page: 1, rect })
      expect(onChange).toHaveBeenLastCalledWith([a, b], { kind: 'add', annotation: b })
      apply()
      expect(s.list.get()).toEqual([a, b])
    })

    it('composes removals, so the second proposal holds neither', () => {
      const { s, onChange, apply } = controlledStore()
      const a = s.add({ type: 'text', page: 0, rect })
      const b = s.add({ type: 'text', page: 0, rect })
      const c = s.add({ type: 'text', page: 0, rect })
      apply()
      s.select([a.id, b.id])
      expect(s.remove(a.id)).toBe(true)
      expect(s.remove(b.id)).toBe(true)
      expect(onChange.mock.lastCall![0]).toEqual([c])
      // A second remove of an id already proposed away is a no-op.
      expect(s.remove(a.id)).toBe(false)
      apply()
      expect(s.list.get()).toEqual([c])
      expect(s.selection.get()).toEqual([])
    })

    it('lets select take an id that is only proposed so far', () => {
      const { s, apply } = controlledStore()
      const a = s.add({ type: 'text', page: 0, rect })
      s.select([a.id])
      expect(s.selection.get()).toEqual([a.id])
      apply()
      expect(s.list.get()).toEqual([a])
      expect(s.selection.get()).toEqual([a.id])
    })

    it('composes an update on a pending add', () => {
      const { s, onChange, apply } = controlledStore()
      const a = s.add({ type: 'text', page: 0, rect, contents: 'one' })
      const b = s.update(a.id, { contents: 'two' })
      expect(b?.contents).toBe('two')
      expect(onChange.mock.lastCall![0]).toEqual([b])
      apply()
      expect(s.get(a.id)?.contents).toBe('two')
    })

    it('keeps newer pending proposals when an older check fires', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const { s, nexts } = ignoringStore()
      // Timers due together fire in creation order. This interleaves them so a's check fires
      // while b is still pending, and c is added between a's check and b's.
      let b: Annotation | undefined
      let c: Annotation | undefined
      let atC: Annotation[] | undefined
      // The check takes two macrotasks, so this chain is one hop longer than the check's.
      setTimeout(() => {
        setTimeout(() => {
          setTimeout(() => {
            expect(warn).toHaveBeenCalledTimes(1)
            c = s.add({ type: 'text', page: 0, rect })
            atC = nexts.at(-1)
          }, 0)
        }, 0)
        b = s.add({ type: 'text', page: 0, rect })
      }, 0)
      const a = s.add({ type: 'text', page: 0, rect })
      vi.runAllTimers()
      expect(atC).toEqual([a, b, c])
      expect(warn).toHaveBeenCalledTimes(3)
      // Every check has fired: the basis is the applied list again.
      const d = s.add({ type: 'text', page: 0, rect })
      expect(nexts.at(-1)).toEqual([d])
    })

    it('resets the basis to the applied list once the check fires without the host applying', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const { s, nexts } = ignoringStore()
      const a = s.add({ type: 'text', page: 0, rect })
      vi.runAllTimers()
      const b = s.add({ type: 'text', page: 0, rect })
      expect(nexts.at(-1)).toEqual([b])
      expect(a.id).not.toBe(b.id)
      s.select([a.id])
      expect(s.selection.get()).toEqual([])
    })
  })
})

describe('AnnotationStore (controlled) ids', () => {
  it('throws when add reuses an id, including one only proposed so far', () => {
    const { s, apply } = controlledStore()
    s.add({ id: 'dup', type: 'text', page: 0, rect })
    expect(() => s.add({ id: 'dup', type: 'text', page: 0, rect })).toThrow(/dup/)
    apply()
    expect(() => s.add({ id: 'dup', type: 'text', page: 0, rect })).toThrow(/dup/)
    expect(s.list.get()).toHaveLength(1)
  })
})

describe('tool style in controlled mode', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('toolStyle.set on a selection proposes one update per annotation inside one batch, and applies nothing first', () => {
    const { s, onChange, apply } = controlledStore()
    const a = s.add({ type: 'square', page: 0, rect })
    const b = s.add({ type: 'circle', page: 0, rect })
    apply()
    s.select([a.id, b.id])
    onChange.mockClear()
    const batches: number[] = []
    const history = {
      batch(fn: () => void) {
        batches.push(onChange.mock.calls.length)
        fn()
        batches.push(onChange.mock.calls.length)
      },
    }
    const style = createToolStyle({ store: s, history, activeGroup: () => undefined })
    style.set({ border: '#00FF00', width: 3 })
    expect(batches).toEqual([0, 2])
    const changes = onChange.mock.calls.map((c) => c[1])
    expect(changes.map((c) => c.kind)).toEqual(['update', 'update'])
    expect(changes.map((c) => (c.kind === 'update' ? c.id : ''))).toEqual([a.id, b.id])
    expect(onChange.mock.calls[1]![0]).toEqual([
      expect.objectContaining({ id: a.id, color: '#00FF00', width: 3 }),
      expect.objectContaining({ id: b.id, color: '#00FF00', width: 3 }),
    ])
    // Not applied until the host pushes the value back.
    expect(s.get(a.id)).toEqual(a)
    expect(s.get(b.id)).toEqual(b)
    apply()
    expect(s.get(a.id)).toMatchObject({ color: '#00FF00', width: 3 })
    expect(s.get(b.id)).toMatchObject({ color: '#00FF00', width: 3 })
  })

  it('edit fires before onChange for a controlled remove', () => {
    const order: string[] = []
    const s = createAnnotationStore({
      mode: {
        mode: 'controlled',
        initial: [],
        onChange: (_next, change) => {
          order.push(`onChange:${change.kind}`)
        },
      },
      defaults: staticDefaults,
      now: fixedNow,
    })
    s.on('edit', (e) => order.push(`edit:${e.kind}`))
    const a = s.add({ type: 'square', page: 0, rect })
    s.remove(a.id)
    expect(order).toEqual(['edit:add', 'onChange:add', 'edit:remove', 'onChange:remove'])
  })
})
