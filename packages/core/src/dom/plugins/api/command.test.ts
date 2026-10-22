import { afterEach, describe, expect, it, vi } from 'vitest'

import { staticDefaults } from '../../../model/annotations/defaults'
import { createHistory } from '../../../model/annotations/history'
import { createAnnotationStore } from '../../../model/annotations/store'
import { InkError } from '../../../model/errors'
import { writable } from '../../../model/readable'
import { definePlugin } from '../define'
import { createPluginHost } from '../host'

import type { CommandOptions, CommandRun } from './command'
import type { DocumentStatus, InkDocument } from '../../../model/document'
import type { Command } from '../define'

function fakeDocument(key: string): InkDocument {
  return {
    key,
    status: writable<DocumentStatus>({ state: 'ready' }),
  } as unknown as InkDocument
}

function deferred<T = string | void>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** One plugin with one command `demo.go`, over a host with document `a` open. */
function setup(run: CommandRun, opts?: CommandOptions) {
  const docA = fakeDocument('a')
  const document = writable<InkDocument | null>(docA)
  const history = createHistory(
    createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
  )
  let command!: Command
  const factory = definePlugin('demo', (plugin) => {
    command = plugin.command('go', 'Go', run, opts)
  })
  const host = createPluginHost({
    plugins: [factory()],
    document,
    history: () => history,
    activated: writable<string | null>(null),
    setActivated() {},
    root: writable<HTMLElement | null>(null),
  })
  return { command, document, docA, host }
}

afterEach(() => vi.restoreAllMocks())

describe('plugin.command', () => {
  it('a returned string becomes the status; undefined clears it', async () => {
    let result: string | undefined = '3 found'
    const { command } = setup(() => result)
    await command.run()
    expect(command.status.get()).toBe('3 found')
    result = undefined
    await command.run()
    expect(command.status.get()).toBe('')
  })

  it('a throw sets errorStatus (default "Something went wrong.") and logs once', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = new Error('boom')
    const { command } = setup(() => {
      throw boom
    })
    await command.run()
    expect(command.status.get()).toBe('Something went wrong.')
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(boom)

    const custom = setup(() => Promise.reject(boom), { errorStatus: 'Could not search.' })
    await custom.command.run()
    expect(custom.command.status.get()).toBe('Could not search.')
    expect(log).toHaveBeenCalledTimes(2)
  })

  it('the signal aborts when another document opens, and a stale return does not set the status', async () => {
    const pending = deferred()
    let signal!: AbortSignal
    const { command, document } = setup((run) => {
      signal = run.signal
      return pending.promise
    })
    const running = command.run()
    expect(signal.aborted).toBe(false)
    document.set(fakeDocument('b'))
    expect(signal.aborted).toBe(true)
    pending.resolve('stale')
    await running
    expect(command.status.get()).toBe('')
  })

  it('the signal aborts when the document closes', async () => {
    const pending = deferred()
    let signal!: AbortSignal
    const { command, document } = setup((run) => {
      signal = run.signal
      return pending.promise
    })
    const running = command.run()
    document.set(null)
    expect(signal.aborted).toBe(true)
    pending.resolve()
    await running
  })

  it('an abort error from the run is not logged and sets no status', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pending = deferred()
    const { command, document } = setup(async ({ signal }) => {
      await pending.promise
      throw signal.reason
    })
    const running = command.run()
    document.set(fakeDocument('b'))
    pending.resolve()
    await running
    expect(log).not.toHaveBeenCalled()
    expect(command.status.get()).toBe('')

    // An AbortError thrown without the signal aborting is still a cancellation.
    const named = setup(() => {
      throw new DOMException('stopped', 'AbortError')
    })
    await named.command.run()
    expect(log).not.toHaveBeenCalled()
    expect(named.command.status.get()).toBe('')
  })

  it('DocumentDestroyed from the run is not logged', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { command } = setup(() => {
      throw new InkError('DocumentDestroyed', 'closed')
    })
    await command.run()
    expect(log).not.toHaveBeenCalled()
    expect(command.status.get()).toBe('')
  })

  it('the status clears when the document changes', async () => {
    const { command, document } = setup(() => 'done')
    await command.run()
    expect(command.status.get()).toBe('done')
    document.set(fakeDocument('b'))
    expect(command.status.get()).toBe('')
  })

  it('destroying the host clears the status and aborts a run in flight', async () => {
    const done = setup(() => 'done')
    await done.command.run()
    expect(done.command.status.get()).toBe('done')
    done.host.destroy()
    expect(done.command.status.get()).toBe('')

    const pending = deferred()
    let signal!: AbortSignal
    const { command, host } = setup((run) => {
      signal = run.signal
      return pending.promise
    })
    const running = command.run()
    host.destroy()
    expect(signal.aborted).toBe(true)
    pending.resolve('stale')
    await running
    expect(command.status.get()).toBe('')
  })

  it('run receives the document open when it started', async () => {
    const pending = deferred()
    const seen: InkDocument[] = []
    const { command, document, docA } = setup(({ doc }) => {
      seen.push(doc)
      return pending.promise
    })
    const running = command.run()
    document.set(fakeDocument('b'))
    pending.resolve()
    await running
    expect(seen).toEqual([docA])
  })

  it('returns the Command, with busy while the run is pending', async () => {
    const pending = deferred()
    const { command } = setup(() => pending.promise, { icon: [] })
    expect(command.id).toBe('demo.go')
    expect(command.label).toBe('Go')
    expect(command.icon).toEqual([])
    expect(command.busy.get()).toBe(false)
    const running = command.run()
    expect(command.busy.get()).toBe(true)
    pending.resolve('ok')
    await running
    expect(command.busy.get()).toBe(false)
    expect(command.status.get()).toBe('ok')
  })

  it('options.enabled replaces the default', () => {
    const { command } = setup(() => {}, { enabled: writable(false) })
    expect(command.enabled.get()).toBe(false)
  })
})
