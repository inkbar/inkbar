import { describe, expect, it, vi } from 'vitest'

import { InkError } from '../../model/errors'
import { writable } from '../../model/readable'

import { createCommandRegistry } from './commands'

import type { DocumentStatus, InkDocument } from '../../model/document'

function fakeDocument(state: DocumentStatus['state'] = 'ready') {
  const status = writable<DocumentStatus>(
    state === 'error' ? { state, error: new InkError('InvalidPdf', 'bad') } : { state }
  )
  return { doc: { key: 'doc', status } as unknown as InkDocument, status }
}

function deferred() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createCommandRegistry', () => {
  it('commands are namespaced and not busy until run', () => {
    const { doc } = fakeDocument()
    const registry = createCommandRegistry({
      document: writable<InkDocument | null>(doc),
    })
    const cmd = registry.add('sandbox', { id: 'suggest', label: 'Suggest', run() {} })

    expect(cmd.id).toBe('sandbox.suggest')
    expect(cmd.label).toBe('Suggest')
    expect(cmd.icon).toBeUndefined()
    expect(cmd.busy.get()).toBe(false)
    expect(cmd.enabled.get()).toBe(true)
    expect(cmd.status.get()).toBe('')
    expect(registry.commands.get('sandbox.suggest')).toBe(cmd)
    expect(() =>
      registry.add('sandbox', { id: 'suggest', label: 'Again', run() {} })
    ).toThrow(expect.objectContaining({ code: 'DuplicateId' }))
  })

  it('rejects a command without a label, which a button could not be named by', () => {
    const registry = createCommandRegistry({
      document: writable<InkDocument | null>(null),
    })
    for (const label of ['', '  '])
      expect(() => registry.add('sandbox', { id: 'blank', label, run() {} })).toThrow(
        expect.objectContaining({
          name: 'InkError',
          code: 'InvalidCommandLabel',
          details: { id: 'sandbox.blank' },
        })
      )
    expect(registry.commands.has('sandbox.blank')).toBe(false)
  })

  it('a command is busy until its promise settles and ignores runs meanwhile', async () => {
    const { doc } = fakeDocument()
    const registry = createCommandRegistry({
      document: writable<InkDocument | null>(doc),
    })
    const d = deferred()
    const run = vi.fn(() => d.promise)
    const cmd = registry.add('sandbox', { id: 'suggest', label: 'Suggest', run })
    const busy: boolean[] = []
    const enabled: boolean[] = []
    cmd.busy.subscribe((v) => busy.push(v))
    cmd.enabled.subscribe((v) => enabled.push(v))

    const first = cmd.run()
    expect(cmd.busy.get()).toBe(true)
    expect(cmd.enabled.get()).toBe(false)
    await cmd.run()
    expect(run).toHaveBeenCalledTimes(1)

    d.resolve()
    await first
    expect(cmd.busy.get()).toBe(false)
    expect(cmd.enabled.get()).toBe(true)
    expect(busy).toEqual([true, false])
    expect(enabled).toEqual([false, true])
  })

  it('a command is disabled while no document is ready', async () => {
    const document = writable<InkDocument | null>(null)
    const registry = createCommandRegistry({ document })
    const run = vi.fn()
    const own = writable(true)
    const cmd = registry.add('sandbox', { id: 'suggest', label: 'Suggest', run })
    const gated = registry.add('sandbox', {
      id: 'gated',
      label: 'Gated',
      enabled: own,
      run,
    })
    const seen: boolean[] = []
    cmd.enabled.subscribe((v) => seen.push(v))

    expect(cmd.enabled.get()).toBe(false)
    await cmd.run()
    expect(run).not.toHaveBeenCalled()

    const { doc, status } = fakeDocument('loading')
    document.set(doc)
    expect(cmd.enabled.get()).toBe(false)
    status.set({ state: 'ready' })
    expect(cmd.enabled.get()).toBe(true)
    document.set(null)
    expect(seen).toEqual([true, false])

    // A spec's own `enabled` replaces the document check.
    expect(gated.enabled.get()).toBe(true)
    own.set(false)
    expect(gated.enabled.get()).toBe(false)
  })

  it('a command running when its document closes settles quietly', async () => {
    const { doc } = fakeDocument()
    const registry = createCommandRegistry({
      document: writable<InkDocument | null>(doc),
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = deferred()
    const cmd = registry.add('sandbox', {
      id: 'suggest',
      label: 'Suggest',
      run: () => d.promise,
    })

    const running = cmd.run()
    d.reject(new InkError('DocumentDestroyed', 'gone'))
    await expect(running).resolves.toBeUndefined()
    expect(cmd.busy.get()).toBe(false)
    expect(error).not.toHaveBeenCalled()

    const failing = registry.add('sandbox', {
      id: 'fail',
      label: 'Fail',
      run: () => Promise.reject(new Error('boom')),
    })
    await expect(failing.run()).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }))
    error.mockRestore()
  })

  it('passes status through and keeps the icon', () => {
    const registry = createCommandRegistry({
      document: writable<InkDocument | null>(null),
    })
    const status = writable('Found 3')
    const icon = [['path', { d: 'M0 0' }]] as never
    const cmd = registry.add('sandbox', {
      id: 'suggest',
      label: 'Suggest',
      icon,
      status,
      run() {},
    })
    expect(cmd.icon).toBe(icon)
    expect(cmd.status.get()).toBe('Found 3')
  })
})
