import { afterEach, describe, expect, it, vi } from 'vitest'

import { en } from '../messages'
import { InkError } from '../model/errors'
import { writable } from '../model/readable'

import {
  applyRedactionsFlow,
  redactionBusy,
  redactionDoneMessage,
  runRedaction,
  type RedactionFlowOptions,
  type RedactionView,
} from './redaction-actions'

import type { Annotation } from '../model/annotations/types'
import type { InkDocument } from '../model/document'
import type { RedactionPreview, RedactionResult } from '../model/redaction/types'

const result = (over: Partial<RedactionResult> = {}): RedactionResult =>
  ({
    marks: 1,
    pages: 1,
    removed: { session: [], file: 0 },
    foreignMarks: 0,
    ownLockedMarks: 0,
    hiddenLayers: false,
    signed: false,
    ...over,
  }) as RedactionResult

const note = (id: string, type = 'square', source = 'session') =>
  ({ id, type, source }) as unknown as Annotation

const bytes = new Uint8Array([37, 80, 68, 70])

/** A document that holds `list` and applies with `apply`. */
function fakeDoc(
  opts: {
    list?: Annotation[]
    controlled?: boolean
    apply?: () => Promise<{
      bytes: Uint8Array
      result: RedactionResult
      _marks: readonly string[]
    }>
  } = {}
) {
  const list = writable<readonly Annotation[]>(opts.list ?? [note('m', 'redact')])
  const replaceAll = vi.fn()
  const select = vi.fn()
  const applyRedactions = vi.fn(
    opts.apply ?? (() => Promise.resolve({ bytes, result: result(), _marks: ['m'] }))
  )
  const doc = {
    key: 'doc-key',
    fileName: 'contract.pdf',
    _saves: true,
    info: { isEncrypted: false },
    redactionPreview: () => ({
      marks: list.get().filter((a) => a.type === 'redact').length,
      pages: 1,
      overlapped: 0,
      signed: false,
      lockedMarks: 0,
    }),
    _applyRedactions: applyRedactions,
    annotations: {
      mode: opts.controlled ? 'controlled' : 'uncontrolled',
      list,
      replaceAll,
      select,
    },
  } as unknown as InkDocument
  return { doc, list, replaceAll, select, applyRedactions }
}

/** The bytes a reopen opens. */
const reopenData = (out: Awaited<ReturnType<typeof applyRedactionsFlow>>) =>
  (out?.reopen?.source as { data: Uint8Array } | undefined)?.data

const view: RedactionView = {
  zoom: 1.5,
  page: 2,
  mode: 'continuous',
  rotation: 90,
  tool: 'redact-area',
}

/** The flow's options with spies, over `over`. */
function options(over: Partial<RedactionFlowOptions> = {}) {
  const spies = {
    notify: vi.fn(),
    onError: vi.fn(),
    showFailure: vi.fn(),
  }
  const opts: RedactionFlowOptions = {
    confirm: () => Promise.resolve(true),
    isCurrent: () => true,
    callbackName: 'onRedacted',
    messages: () => en,
    view: () => view,
    password: 'pw',
    ...spies,
    ...over,
  }
  return { opts, ...spies }
}

/** Runs the microtasks the flow queues to rethrow, and returns what they threw. */
function rethrown() {
  const thrown: unknown[] = []
  const original = globalThis.queueMicrotask.bind(globalThis)
  vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((cb) => {
    original(() => {
      try {
        cb()
      } catch (error) {
        thrown.push(error)
      }
    })
  })
  return thrown
}

describe('applyRedactionsFlow', () => {
  it('applies, tells the host and returns what to reopen', async () => {
    const { doc, replaceAll } = fakeDoc()
    const { opts, notify, onError, showFailure } = options()
    const out = await applyRedactionsFlow(doc, opts)
    expect(notify).toHaveBeenCalledExactlyOnceWith({ bytes, result: result() })
    expect(out).toEqual({
      result: result(),
      reopen: {
        source: { data: bytes, key: 'doc-key' },
        fileName: 'contract.pdf',
        password: 'pw',
        view,
        initial: undefined,
        message: '1 redaction applied.',
      },
    })
    expect(replaceAll).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(showFailure).not.toHaveBeenCalled()
  })

  it('keeps the document busy when it hands back a reopen, until the caller replaces it', async () => {
    const { doc } = fakeDoc()
    const out = await applyRedactionsFlow(doc, options().opts)
    expect(out?.reopen).not.toBeNull()
    expect(redactionBusy(doc).get()).toBe(true)
  })

  it.each([
    ['cancelled', () => options({ confirm: () => Promise.resolve(false) })],
    [
      'not current after the notify',
      () => {
        let current = true
        return options({
          isCurrent: () => current,
          notify: () => {
            current = false
          },
        })
      },
    ],
  ])('is not busy once it ends with no reopen: %s', async (_, made) => {
    const { doc } = fakeDoc()
    await applyRedactionsFlow(doc, made().opts)
    expect(redactionBusy(doc).get()).toBe(false)
  })

  it('is not busy once the apply has failed', async () => {
    const { doc } = fakeDoc({
      apply: () =>
        Promise.reject(new InkError('RedactionFailed', 'failed', { stage: 'apply' })),
    })
    await applyRedactionsFlow(doc, options().opts)
    expect(redactionBusy(doc).get()).toBe(false)
  })

  it('a cancelled confirmation applies nothing', async () => {
    const { doc, applyRedactions } = fakeDoc()
    const { opts, notify } = options({ confirm: () => Promise.resolve(false) })
    await expect(applyRedactionsFlow(doc, opts)).resolves.toBeNull()
    expect(applyRedactions).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('marks added while the reader is asked: asks again with them, then applies', async () => {
    const { doc, list, applyRedactions } = fakeDoc()
    const asked: number[] = []
    const confirm = (preview: RedactionPreview) => {
      asked.push(preview.marks)
      if (asked.length === 1) list.set([note('m', 'redact'), note('m2', 'redact')])
      return Promise.resolve(true)
    }
    const out = await applyRedactionsFlow(doc, options({ confirm }).opts)
    expect(asked).toEqual([1, 2])
    expect(applyRedactions).toHaveBeenCalledTimes(1)
    expect(out?.reopen).not.toBeNull()
  })

  it('a mark moved while the reader is asked: asks again though the counts agree', async () => {
    const { doc, list, applyRedactions } = fakeDoc()
    const confirm = vi.fn(() => {
      if (confirm.mock.calls.length === 1)
        list.set([{ ...note('m', 'redact'), rect: { x: 1, y: 1, width: 9, height: 9 } }])
      return Promise.resolve(true)
    })
    await applyRedactionsFlow(doc, options({ confirm }).opts)
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(applyRedactions).toHaveBeenCalledTimes(1)
  })

  it('a cancel on the second ask applies nothing', async () => {
    const { doc, list, applyRedactions } = fakeDoc()
    const confirm = vi.fn(() => {
      if (confirm.mock.calls.length === 1) {
        list.set([note('m2', 'redact')])
        return Promise.resolve(true)
      }
      return Promise.resolve(false)
    })
    await expect(applyRedactionsFlow(doc, options({ confirm }).opts)).resolves.toBeNull()
    expect(applyRedactions).not.toHaveBeenCalled()
  })

  it('every mark removed while the reader is asked: nothing is applied or said', async () => {
    const { doc, list, applyRedactions } = fakeDoc()
    const confirm = vi.fn(() => {
      list.set([note('kept')])
      return Promise.resolve(true)
    })
    const { opts, showFailure, onError } = options({ confirm })
    await expect(applyRedactionsFlow(doc, opts)).resolves.toBeNull()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(applyRedactions).not.toHaveBeenCalled()
    expect(showFailure).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('a confirmation that rejects is reported, and the flow resolves', async () => {
    const { doc, applyRedactions } = fakeDoc()
    const { opts, onError, showFailure } = options({
      confirm: () => Promise.reject(new Error('host dialog failed')),
    })
    await expect(applyRedactionsFlow(doc, opts)).resolves.toBeNull()
    expect(applyRedactions).not.toHaveBeenCalled()
    expect(showFailure).toHaveBeenCalledExactlyOnceWith(en.viewer.redactFailed)
    expect(onError.mock.calls[0]![0]).toMatchObject({ code: 'RedactionFailed' })
  })

  it('not current after the run: nothing is told and nothing reopens', async () => {
    const { doc } = fakeDoc()
    let current = true
    const { opts, notify } = options({ isCurrent: () => current })
    const running = applyRedactionsFlow(doc, opts)
    current = false
    await expect(running).resolves.toBeNull()
    expect(notify).not.toHaveBeenCalled()
  })

  it('not current after the notify: the result, and no reopen', async () => {
    const { doc, replaceAll } = fakeDoc({ controlled: true })
    let current = true
    const { opts } = options({
      isCurrent: () => current,
      notify: () => {
        current = false
      },
    })
    await expect(applyRedactionsFlow(doc, opts)).resolves.toEqual({
      result: result(),
      reopen: null,
    })
    expect(replaceAll).not.toHaveBeenCalled()
  })

  it('a notify that throws reaches onError, and the reopen goes ahead', async () => {
    const { doc } = fakeDoc()
    const thrown = new Error('host failed')
    const { opts, onError } = options({
      callbackName: 'redacted',
      notify: () => {
        throw thrown
      },
    })
    const out = await applyRedactionsFlow(doc, opts)
    expect(out?.reopen).not.toBeNull()
    expect(onError).toHaveBeenCalledTimes(1)
    const error = onError.mock.calls[0]![0] as InkError
    expect(error).toMatchObject({
      code: 'RedactionFailed',
      details: { callback: 'redacted' },
    })
    expect(error.cause).toBe(thrown)
  })

  it('a notify that throws an InkError hands it on as it is', async () => {
    const { doc } = fakeDoc()
    const thrown = new InkError('SaveFailed', 'host')
    const { opts, onError } = options({
      notify: () => {
        throw thrown
      },
    })
    await applyRedactionsFlow(doc, opts)
    expect(onError).toHaveBeenCalledExactlyOnceWith(thrown)
  })

  it('controlled: proposes the host list without the marks and what went with them', async () => {
    const list = [
      note('kept'),
      note('mark', 'redact'),
      note('under'),
      note('file', 'square', 'pdf'),
    ]
    const { doc, replaceAll } = fakeDoc({
      list,
      controlled: true,
      apply: () =>
        Promise.resolve({
          bytes,
          result: result({ removed: { session: ['under'], file: 1 } }),
          _marks: ['mark'],
        }),
    })
    const { opts } = options()
    const out = await applyRedactionsFlow(doc, opts)
    expect(replaceAll).toHaveBeenCalledExactlyOnceWith([list[0]], 'redaction')
    expect(out?.reopen?.initial).toEqual([list[0]])
  })

  it('controlled: a mark added while the apply ran stays in the proposed list', async () => {
    const list = [note('kept'), note('mark', 'redact')]
    const late = note('late', 'redact')
    let added: () => void = () => undefined
    const {
      doc,
      list: held,
      replaceAll,
      applyRedactions,
    } = fakeDoc({
      list,
      controlled: true,
      apply: () =>
        new Promise((resolve) => {
          added = () => resolve({ bytes, result: result(), _marks: ['mark'] })
        }),
    })
    const running = applyRedactionsFlow(doc, options().opts)
    await vi.waitFor(() => expect(applyRedactions).toHaveBeenCalled())
    // The host takes a new mark while the engine works.
    held.set([...list, late])
    added()
    const out = await running
    expect(replaceAll).toHaveBeenCalledExactlyOnceWith([list[0], late], 'redaction')
    expect(out?.reopen?.initial).toEqual([list[0], late])
  })

  it('reopens on a copy of the bytes, so a host that changes its own leaves the reopen intact', async () => {
    const own = new Uint8Array([37, 80, 68, 70, 45])
    const { doc } = fakeDoc({
      apply: () => Promise.resolve({ bytes: own, result: result(), _marks: ['m'] }),
    })
    const { opts } = options({ notify: ({ bytes: given }) => given.fill(0) })
    const out = await applyRedactionsFlow(doc, opts)
    expect(own).toEqual(new Uint8Array(5))
    expect(reopenData(out)).not.toBe(own)
    expect(reopenData(out)).toEqual(new Uint8Array([37, 80, 68, 70, 45]))
  })

  it('a host that transfers the bytes it is given leaves the reopen intact', async () => {
    const own = new Uint8Array([37, 80, 68, 70, 45])
    const { doc } = fakeDoc({
      apply: () => Promise.resolve({ bytes: own, result: result(), _marks: ['m'] }),
    })
    const { opts } = options({
      notify: ({ bytes: given }) =>
        void structuredClone(given, { transfer: [given.buffer] }),
    })
    const out = await applyRedactionsFlow(doc, opts)
    expect(own.byteLength).toBe(0)
    expect(reopenData(out)).toEqual(new Uint8Array([37, 80, 68, 70, 45]))
  })

  describe('an onError that throws', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('after a failed apply: the flow resolves, says why, and the throw is rethrown', async () => {
      const thrown = rethrown()
      const failure = new InkError('RedactionFailed', 'failed', { stage: 'apply' })
      const listener = new Error('listener failed')
      const { doc } = fakeDoc({ apply: () => Promise.reject(failure) })
      const { opts, showFailure } = options({
        onError: () => {
          throw listener
        },
      })
      await expect(applyRedactionsFlow(doc, opts)).resolves.toBeNull()
      expect(showFailure).toHaveBeenCalledExactlyOnceWith(en.viewer.redactFailed)
      await vi.waitFor(() => expect(thrown).toEqual([listener]))
    })

    it('after a throwing notify: the reopen goes ahead, and the throw is rethrown', async () => {
      const thrown = rethrown()
      const listener = new Error('listener failed')
      const { doc } = fakeDoc()
      const { opts } = options({
        notify: () => {
          throw new Error('host failed')
        },
        onError: () => {
          throw listener
        },
      })
      const out = await applyRedactionsFlow(doc, opts)
      expect(out?.reopen).not.toBeNull()
      await vi.waitFor(() => expect(thrown).toEqual([listener]))
    })
  })

  it('runs proposed straight after the proposal, before the host can answer', async () => {
    const { doc, replaceAll } = fakeDoc({ controlled: true })
    const order: string[] = []
    replaceAll.mockImplementation(() => {
      order.push('replaceAll')
      // A framework hands the host's answer back on a later microtask.
      queueMicrotask(() => order.push('answer'))
    })
    const proposed = vi.fn((initial: Annotation[]) => {
      order.push(`proposed ${initial.length}`)
    })
    const { opts } = options({ proposed })
    const out = await applyRedactionsFlow(doc, opts)
    expect(order).toEqual(['replaceAll', 'proposed 0', 'answer'])
    expect(proposed).toHaveBeenCalledExactlyOnceWith(out!.reopen!.initial)
  })

  it('a proposed hook that throws: the flow resolves, reopens, and the throw is rethrown', async () => {
    const thrown = rethrown()
    try {
      const { doc } = fakeDoc({ controlled: true })
      const hook = new Error('hook failed')
      const { opts, onError } = options({
        proposed: () => {
          throw hook
        },
      })
      const out = await applyRedactionsFlow(doc, opts)
      expect(out?.reopen?.initial).toEqual([])
      expect(onError).not.toHaveBeenCalled()
      await vi.waitFor(() => expect(thrown).toEqual([hook]))
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('does not run proposed when the annotations are uncontrolled', async () => {
    const { doc } = fakeDoc()
    const proposed = vi.fn()
    await applyRedactionsFlow(doc, options({ proposed }).opts)
    expect(proposed).not.toHaveBeenCalled()
  })

  it('not current after the proposal: no reopen', async () => {
    const { doc, replaceAll } = fakeDoc({ controlled: true })
    let current = true
    replaceAll.mockImplementation(() => {
      current = false
    })
    const { opts } = options({ isCurrent: () => current })
    await expect(applyRedactionsFlow(doc, opts)).resolves.toEqual({
      result: result(),
      reopen: null,
    })
  })

  it.each([
    [{ stage: 'engine' }, en.viewer.redactUnavailable],
    [{ stage: 'apply' }, en.viewer.redactFailed],
    [{ stage: 'verify' }, en.viewer.redactUnverified],
  ])('a RedactionFailed at %o says why and reaches onError', async (details, message) => {
    const failure = new InkError('RedactionFailed', 'failed', details)
    const { doc } = fakeDoc({ apply: () => Promise.reject(failure) })
    const { opts, onError, showFailure, notify } = options()
    await expect(applyRedactionsFlow(doc, opts)).resolves.toBeNull()
    expect(showFailure).toHaveBeenCalledExactlyOnceWith(message)
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure)
    expect(notify).not.toHaveBeenCalled()
  })

  it.each([
    [
      ['m1', 'm2'],
      '2 marks cover content that cannot be removed. Move or delete them and try again.',
    ],
    [
      ['m1'],
      '1 mark covers content that cannot be removed. Move or delete it and try again.',
    ],
    [
      [],
      '1 mark covers content that cannot be removed. Move or delete it and try again.',
    ],
  ])(
    'marks over content that cannot be removed (%j) are named and selected',
    async (ids, message) => {
      const failure = new InkError('RedactionFailed', 'refused', {
        stage: 'apply',
        reason: 'unremovable-content',
        annotations: ids,
        kinds: ['pattern'],
        page: 0,
      })
      const { doc, select } = fakeDoc({ apply: () => Promise.reject(failure) })
      const { opts, onError, showFailure } = options()
      await expect(applyRedactionsFlow(doc, opts)).resolves.toBeNull()
      expect(showFailure).toHaveBeenCalledExactlyOnceWith(message)
      expect(onError).toHaveBeenCalledExactlyOnceWith(failure)
      if (ids.length > 0) expect(select).toHaveBeenCalledExactlyOnceWith(ids)
      else expect(select).not.toHaveBeenCalled()
    }
  )

  it('a refusal once the caller has gone selects nothing', async () => {
    let current = true
    const { doc, select } = fakeDoc({
      apply: () => {
        current = false
        return Promise.reject(
          new InkError('RedactionFailed', 'refused', {
            stage: 'apply',
            reason: 'unremovable-content',
            annotations: ['m'],
          })
        )
      },
    })
    const { opts } = options({ isCurrent: () => current })
    await applyRedactionsFlow(doc, opts)
    expect(select).not.toHaveBeenCalled()
  })

  it('a page the engine could not look under says it could not verify', async () => {
    const failure = new InkError('RedactionFailed', 'blind', {
      stage: 'apply',
      reason: 'could-not-inspect',
      page: 0,
    })
    const { doc } = fakeDoc({ apply: () => Promise.reject(failure) })
    const { opts, showFailure } = options()
    await applyRedactionsFlow(doc, opts)
    expect(showFailure).toHaveBeenCalledExactlyOnceWith(en.viewer.redactUnverified)
  })

  it('a failure that is not an InkError is reported as RedactionFailed', async () => {
    const { doc } = fakeDoc({ apply: () => Promise.reject(new Error('boom')) })
    const { opts, onError, showFailure } = options()
    await expect(applyRedactionsFlow(doc, opts)).resolves.toBeNull()
    expect(showFailure).toHaveBeenCalledExactlyOnceWith(en.viewer.redactFailed)
    expect(onError.mock.calls[0]![0]).toMatchObject({ code: 'RedactionFailed' })
  })

  it('a closed document fails silently', async () => {
    const { doc } = fakeDoc({
      apply: () => Promise.reject(new InkError('DocumentDestroyed', 'closed')),
    })
    const { opts, onError, showFailure } = options()
    await expect(applyRedactionsFlow(doc, opts)).resolves.toBeNull()
    expect(onError).not.toHaveBeenCalled()
    expect(showFailure).not.toHaveBeenCalled()
  })

  it('a failure once the caller has gone is not reported', async () => {
    let current = true
    const { doc } = fakeDoc({
      apply: () => {
        current = false
        return Promise.reject(
          new InkError('RedactionFailed', 'failed', { stage: 'apply' })
        )
      },
    })
    const { opts, onError, showFailure } = options({ isCurrent: () => current })
    await expect(applyRedactionsFlow(doc, opts)).resolves.toBeNull()
    expect(onError).not.toHaveBeenCalled()
    expect(showFailure).not.toHaveBeenCalled()
  })
})

describe('runRedaction', () => {
  it('resolves with the bytes and the result only', async () => {
    const { doc } = fakeDoc()
    const out = await runRedaction(doc, { confirm: () => Promise.resolve(true) })
    expect(out).toEqual({ bytes, result: result() })
  })
})

describe('redactionDoneMessage', () => {
  it('counts the marks and adds the hidden layers and foreign marks when there are any', () => {
    expect(redactionDoneMessage(result({ marks: 2 }), en)).toBe('2 redactions applied.')
    expect(
      redactionDoneMessage(result({ hiddenLayers: true, foreignMarks: 1 }), en)
    ).toBe(
      '1 redaction applied. This file has hidden layers. Their content was not removed. 1 redaction mark from another program was left in place.'
    )
  })
})
