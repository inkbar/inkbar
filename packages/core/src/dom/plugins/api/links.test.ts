import { describe, expect, it, vi } from 'vitest'

import { staticDefaults } from '../../../model/annotations/defaults'
import { createHistory } from '../../../model/annotations/history'
import { exportAnnotations, importAnnotations } from '../../../model/annotations/json'
import { createSnapshotHistory } from '../../../model/annotations/snapshot-history'
import {
  createAnnotationStore,
  type AnnotationStore,
} from '../../../model/annotations/store'
import { quadsFromRect } from '../../../model/geometry'
import { writable } from '../../../model/readable'
import { definePlugin } from '../define'
import { createPluginHost } from '../host'

import type { Records } from './records'
import type { PluginHistory } from '../../../model/annotations/history'
import type { Annotation } from '../../../model/annotations/types'
import type { DocumentStatus, InkDocument } from '../../../model/document'
import type { RecordBase } from '../../../model/records'

interface Finding extends RecordBase {
  page: number
  status: 'suggested' | 'accepted'
}

const s1: Finding = { id: 's1', page: 0, status: 'suggested' }
const s2: Finding = { id: 's2', page: 1, status: 'suggested' }
const rect = (y: number) => ({ x: 10, y, width: 100, height: 20 })

function fakeDocument(key: string, annotations: AnnotationStore): InkDocument {
  return {
    key,
    status: writable<DocumentStatus>({ state: 'ready' }),
    annotations,
  } as unknown as InkDocument
}

type Spec = Parameters<Records<Finding>['annotates']>[1]

/**
 * A plugin with one records store of findings and two links on it: `redaction` (redact) and
 * `mark` (highlight). `spec` adds callbacks to the redaction link.
 */
function findingsPlugin(spec: Partial<Spec> = {}) {
  let findings!: Records<Finding>
  let redaction!: ReturnType<Records<Finding>['annotates']>
  let mark!: ReturnType<Records<Finding>['annotates']>
  const factory = definePlugin('finder', (plugin) => {
    findings = plugin.records<Finding>('findings', { initial: () => [s1, s2] })
    redaction = findings.annotates('redact', {
      from: (f) => ({ page: f.page, rect: rect(10) }),
      ...spec,
    })
    mark = findings.annotates('highlight', {
      from: (f) => ({ page: f.page, quads: quadsFromRect(rect(50)) }),
    })
  })
  return {
    plugin: factory(),
    findings: () => findings,
    redaction: () => redaction,
    mark: () => mark,
  }
}

/** An uncontrolled document whose store the host's history tracks. */
function uncontrolled(spec: Partial<Spec> = {}) {
  const p = findingsPlugin(spec)
  const annotations = createAnnotationStore({
    mode: { mode: 'uncontrolled' },
    defaults: staticDefaults,
  })
  const history = createHistory(annotations)
  const document = writable<InkDocument | null>(null)
  createPluginHost({
    plugins: [p.plugin],
    document,
    history: () => history,
    activated: writable<string | null>(null),
    setActivated() {},
    root: writable<HTMLElement | null>(null),
  })
  const doc = fakeDocument('a', annotations)
  document.set(doc)
  return { ...p, annotations, history, document, doc }
}

describe('records.annotates', () => {
  it('add creates the annotation with the type default colour and the link', () => {
    const { redaction, annotations } = uncontrolled()
    const a = redaction().add(s1)!
    expect(a.type).toBe('redact')
    expect(a.color).toBe(staticDefaults.color('redact'))
    expect(a.custom).toEqual({ finder: { findings: 's1' } })
    expect(annotations.list.get()).toEqual([a])
  })

  it('add keeps a colour and custom data from gives', () => {
    const { findings } = uncontrolled()
    const link = findings().annotates('square', {
      from: (f) => ({
        page: f.page,
        rect: rect(10),
        color: '#00FF00',
        custom: { other: { x: 1 }, finder: { note: 'y' } },
      }),
    })
    const a = link.add(s1)!
    expect(a.color).toBe('#00FF00')
    expect(a.custom).toEqual({ other: { x: 1 }, finder: { note: 'y', findings: 's1' } })
  })

  it('of returns every linked annotation of this type, in document order; another annotates call’s type is not included', () => {
    const { redaction, mark, annotations } = uncontrolled()
    const first = redaction().add(s1)!
    const other = redaction().add(s2)!
    const highlight = mark().add(s1)!
    const second = redaction().add(s1)!
    annotations.add({ type: 'redact', page: 0, rect: rect(90) })
    expect(redaction().of(s1)).toEqual([first, second])
    expect(redaction().of(s2)).toEqual([other])
    expect(mark().of(s1)).toEqual([highlight])
  })

  it('removing a linked annotation calls onRemoved once per annotation, inside the removal’s undo step', () => {
    const onRemoved = vi.fn((f: Finding, _a: Annotation) => {
      env.findings().update(f.id, { status: 'suggested' })
    })
    const env = uncontrolled({ onRemoved })
    const findings = env.findings()
    const { redaction, annotations, history } = env
    let a!: Annotation
    history.batch(() => {
      a = redaction().add(s1)!
      findings.update('s1', { status: 'accepted' })
    })
    const highlight = env.mark().add(s1)!
    annotations.remove(highlight.id)
    expect(onRemoved).not.toHaveBeenCalled()
    annotations.remove(a.id)
    expect(onRemoved).toHaveBeenCalledOnce()
    expect(onRemoved).toHaveBeenCalledWith(
      { ...s1, status: 'accepted' },
      expect.objectContaining({ id: a.id })
    )
    expect(findings.find('s1')?.status).toBe('suggested')
    history.undo()
    expect(annotations.get(a.id)).toBeDefined()
    expect(findings.find('s1')?.status).toBe('accepted')
  })

  it('calls onChanged for a user update of a linked annotation', () => {
    const onChanged = vi.fn()
    const { redaction, annotations } = uncontrolled({ onChanged })
    const a = redaction().add(s1)!
    annotations.update(a.id, { contents: 'why' })
    expect(onChanged).toHaveBeenCalledOnce()
    expect(onChanged).toHaveBeenCalledWith(
      s1,
      expect.objectContaining({ contents: 'why' })
    )
  })

  it('undo and redo never call onRemoved', () => {
    const onRemoved = vi.fn()
    const { redaction, annotations, history } = uncontrolled({ onRemoved })
    const a = redaction().add(s1)!
    annotations.remove(a.id)
    expect(onRemoved).toHaveBeenCalledOnce()
    history.undo()
    history.redo()
    history.undo()
    history.undo()
    history.redo()
    expect(onRemoved).toHaveBeenCalledOnce()
  })

  it('works with a controlled host', async () => {
    vi.useFakeTimers()
    try {
      const onRemoved = vi.fn((f: Finding) =>
        p.findings().update(f.id, { status: 'suggested' })
      )
      const p = findingsPlugin({ onRemoved })
      let value: Annotation[] = []
      const host = (next: Annotation[]) => {
        queueMicrotask(() => {
          value = next
          annotations.setControlledValue(next)
          history.observe(next)
        })
      }
      const annotations = createAnnotationStore({
        mode: { mode: 'controlled', initial: [], onChange: (next) => host(next) },
        defaults: staticDefaults,
      })
      const history = createSnapshotHistory({
        apply: (list) => host(list),
        enabled: () => true,
      })
      history.observe(value)
      history.attach(annotations)
      const document = writable<InkDocument | null>(null)
      createPluginHost({
        plugins: [p.plugin],
        document,
        history: (): PluginHistory => history,
        activated: writable<string | null>(null),
        setActivated() {},
        root: writable<HTMLElement | null>(null),
      })
      document.set(fakeDocument('a', annotations))
      const findings = p.findings()
      let a!: Annotation
      history.batch(() => {
        a = p.redaction().add(s1)!
        findings.update('s1', { status: 'accepted' })
      })
      await vi.runAllTimersAsync()
      expect(value).toHaveLength(1)
      expect(p.redaction().of(s1)).toEqual([a])
      annotations.remove(a.id)
      expect(onRemoved).toHaveBeenCalledOnce()
      expect(findings.find('s1')?.status).toBe('suggested')
      await vi.runAllTimersAsync()
      expect(value).toEqual([])
      history.undo()
      await vi.runAllTimersAsync()
      expect(value).toEqual([a])
      expect(findings.find('s1')?.status).toBe('accepted')
      expect(onRemoved).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('the link survives a Gloss export and import', () => {
    const { redaction, annotations, document } = uncontrolled()
    const a = redaction().add(s1)!
    const saved = JSON.stringify(exportAnnotations(annotations))
    const next = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    document.set(fakeDocument('b', next))
    expect(redaction().of(s1)).toEqual([])
    importAnnotations(next, saved, { mode: 'replace' })
    const [back] = redaction().of(s1)
    expect(back?.id).toBe(a.id)
    expect(back?.custom).toEqual({ finder: { findings: 's1' } })
  })

  it('add with no document open returns undefined', () => {
    const { redaction, document } = uncontrolled()
    document.set(null)
    expect(redaction().add(s1)).toBeUndefined()
    expect(redaction().of(s1)).toEqual([])
  })
})
