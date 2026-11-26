import { browserAssets, fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { en } from '../messages'
import { openDocument, type EngineLoader, type InkDocument } from '../model/document'
import { InkError } from '../model/errors'
import { readerKind } from '../reader/select'

import {
  canRedact,
  redactionBusy,
  redactionFailure,
  runRedaction,
} from './redaction-actions'
import { savePictures } from './save-pictures'

import type { RedactionPreview } from '../model/redaction/types'

const opened: InkDocument[] = []
afterEach(() => {
  vi.restoreAllMocks()
  opened.splice(0).forEach((d) => d.destroy())
})

/** A fixture opened as a viewer opens it, with the real engine as its loader unless `bare`. */
async function open(name: FixtureName = 'redact-text', bare = false, password?: string) {
  const loader = vi.fn<EngineLoader>(() => import('@inkbar/engine'))
  const doc = await openDocument(fixtureUrl(name), {
    assets: browserAssets(),
    pictures: savePictures(document),
    password,
    ...(bare ? {} : { engine: loader }),
  })
  opened.push(doc)
  await doc.ready
  return { doc, loader }
}

/** A mark over SECRET-ALPHA in `redact-text`: the fixture's region. */
const markSecret = (doc: InkDocument) =>
  doc.annotations.add({
    type: 'redact',
    page: 0,
    rect: { x: 45, y: 190, width: 170, height: 35 },
  })

/** A promise and its resolve, for a confirmation a test answers. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => (resolve = res))
  return { promise, resolve }
}

describe('canRedact', () => {
  it('follows the marks, and needs an engine', async () => {
    const { doc } = await open()
    // A count of the marks: no preview, with its overlap pass, on each change.
    const preview = vi.spyOn(doc, 'redactionPreview')
    const can = canRedact(doc)
    expect(canRedact(doc)).toBe(can)
    const seen: boolean[] = []
    const stop = can.subscribe((v) => seen.push(v))
    expect(can.get()).toBe(false)
    const mark = markSecret(doc)
    expect(can.get()).toBe(true)
    doc.annotations.remove(mark.id)
    expect(can.get()).toBe(false)
    expect(seen).toEqual([true, false])
    stop()
    expect(preview).not.toHaveBeenCalled()

    // The engine reader cannot open a file without an engine (and this project's setup file gives
    // every open one), so there is no document without an engine to ask.
    if (readerKind() === 'engine') return
    const { doc: bare } = await open('redact-text', true)
    markSecret(bare)
    expect(canRedact(bare).get()).toBe(false)
  })
})

describe('canRedact in an encrypted file', () => {
  it('counts the locked marks an earlier save left', async () => {
    const { doc } = await open('encrypted-aes', false, 'inkbar')
    // Over "Enc" of the file's one word, Encrypted, on the baseline y 700.
    doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 70, y: 695, width: 25, height: 20 },
    })
    const saved = await doc.save()
    const back = await openDocument(saved, {
      assets: browserAssets(),
      pictures: savePictures(document),
      password: 'inkbar',
      engine: () => import('@inkbar/engine'),
    })
    opened.push(back)
    await back.ready
    // Nothing comes back editable: the mark is locked, and still applies.
    expect(back.annotations.list.get().filter((a) => a.source !== 'pdf')).toEqual([])
    expect(canRedact(back).get()).toBe(true)
  })
})

describe('runRedaction', () => {
  it('cancelling changes nothing', async () => {
    const { doc, loader } = await open()
    // The engine reader loads the engine once to open the file; the apply would load it again.
    const opening = loader.mock.calls.length
    const mark = markSecret(doc)
    const before = doc.annotations.list.get()
    const changed = doc.changed.get()
    const confirm = vi.fn((_: RedactionPreview) => Promise.resolve(false))
    const apply = vi.spyOn(doc, '_applyRedactions')
    const out = await runRedaction(doc, { confirm })
    expect(out).toBeNull()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0]![0]).toEqual({
      marks: 1,
      pages: 1,
      overlapped: 0,
      signed: false,
      lockedMarks: 0,
    })
    expect(apply).not.toHaveBeenCalled()
    expect(loader).toHaveBeenCalledTimes(opening)
    expect(doc.annotations.get(mark.id)).toBeDefined()
    expect(doc.annotations.list.get()).toBe(before)
    expect(doc.changed.get()).toBe(changed)
    expect(redactionBusy(doc).get()).toBe(false)
  })

  it('a second press while one runs does nothing', async () => {
    const { doc } = await open()
    markSecret(doc)
    const answer = deferred<boolean>()
    const confirm = vi.fn((_: RedactionPreview) => answer.promise)
    const apply = vi.spyOn(doc, '_applyRedactions')
    const busy = redactionBusy(doc)
    const first = runRedaction(doc, { confirm })
    // While the confirmation is open: nothing else starts.
    await expect(runRedaction(doc, { confirm })).resolves.toBeNull()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(busy.get()).toBe(false)
    // A press the moment it starts applying: the same.
    let during: Promise<unknown> | undefined
    const stop = busy.subscribe((on) => {
      if (on) during ??= runRedaction(doc, { confirm })
    })
    answer.resolve(true)
    const out = await first
    stop()
    await expect(during).resolves.toBeNull()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(out!.result.marks).toBe(1)
    expect(out!.bytes.byteLength).toBeGreaterThan(0)
    expect(busy.get()).toBe(false)
  })

  // The engine reader cannot open a file without an engine (and this project's setup file gives
  // every open one), so there is no document without an engine to apply with.
  it.skipIf(readerKind() === 'engine')(
    'without an engine rejects with EngineUnavailable, asking nothing',
    async () => {
      const { doc } = await open('redact-text', true)
      markSecret(doc)
      const confirm = vi.fn(() => Promise.resolve(true))
      const error = await runRedaction(doc, { confirm }).catch((e: unknown) => e)
      expect(confirm).not.toHaveBeenCalled()
      expect(error).toMatchObject({ code: 'EngineUnavailable' })
      expect(redactionBusy(doc).get()).toBe(false)
      expect(redactionFailure(error, en)).toMatchObject({
        error,
        message: en.viewer.redactFailed,
      })
    }
  )

  it('redactionFailure words the apply’s errors', () => {
    const failed = (stage: string) => new InkError('RedactionFailed', 'failed', { stage })
    expect(redactionFailure(failed('engine'), en)?.message).toBe(
      en.viewer.redactUnavailable
    )
    expect(redactionFailure(failed('verify'), en)?.message).toBe(
      en.viewer.redactUnverified
    )
    expect(redactionFailure(failed('apply'), en)?.message).toBe(en.viewer.redactFailed)
    const unavailable = new InkError(
      'EngineUnavailable',
      'The engine could not be loaded'
    )
    expect(redactionFailure(unavailable, en)).toMatchObject({
      error: unavailable,
      message: en.viewer.redactFailed,
    })
    expect(
      redactionFailure(new InkError('DocumentDestroyed', 'gone'), en)
    ).toBeUndefined()
    const plain = redactionFailure(new Error('boom'), en)!
    expect(plain.error).toBeInstanceOf(InkError)
    expect(plain.message).toBe(en.viewer.redactFailed)
  })
})
