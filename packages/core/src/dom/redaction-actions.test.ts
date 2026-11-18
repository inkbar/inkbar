import { describe, expect, it, vi } from 'vitest'

import { en } from '../messages'
import { InkError } from '../model/errors'
import { writable } from '../model/readable'

import {
  applyRedactionsFlow,
  redactionDoneMessage,
  type RedactionFlowOptions,
  type RedactionView,
} from './redaction-actions'

import type { Annotation } from '../model/annotations/types'
import type { InkDocument } from '../model/document'
import type { RedactionResult } from '../model/redaction/types'

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
    apply?: () => Promise<{ bytes: Uint8Array; result: RedactionResult }>
  } = {}
) {
  const list = writable<readonly Annotation[]>(opts.list ?? [note('m', 'redact')])
  const replaceAll = vi.fn()
  const select = vi.fn()
  const applyRedactions = vi.fn(
    opts.apply ?? (() => Promise.resolve({ bytes, result: result() }))
  )
  const doc = {
    key: 'doc-key',
    fileName: 'contract.pdf',
    _saves: true,
    info: { isEncrypted: false },
    redactionPreview: () => ({
      marks: 1,
      pages: 1,
      overlapped: 0,
      signed: false,
      lockedMarks: 0,
    }),
    applyRedactions,
    annotations: {
      mode: opts.controlled ? 'controlled' : 'uncontrolled',
      list,
      replaceAll,
      select,
    },
  } as unknown as InkDocument
  return { doc, replaceAll, select, applyRedactions }
}

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

  it('a cancelled confirmation applies nothing', async () => {
    const { doc, applyRedactions } = fakeDoc()
    const { opts, notify } = options({ confirm: () => Promise.resolve(false) })
    await expect(applyRedactionsFlow(doc, opts)).resolves.toBeNull()
    expect(applyRedactions).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
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
        }),
    })
    const { opts } = options()
    const out = await applyRedactionsFlow(doc, opts)
    expect(replaceAll).toHaveBeenCalledExactlyOnceWith([list[0]], 'redaction')
    expect(out?.reopen?.initial).toEqual([list[0]])
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
