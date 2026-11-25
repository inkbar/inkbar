import { describe, expect, it, vi } from 'vitest'

import { createTextReads } from './text-reads'

import type { PdfjsPage } from './types'

/** A page whose text stream gives a piece each time `give()` is called, and ends on `end()`. */
function slowPage() {
  let controller!: ReadableStreamDefaultController<unknown>
  let cancelled = false
  const page = {
    streamTextContent: () =>
      new ReadableStream({
        start(c) {
          controller = c
        },
        cancel() {
          cancelled = true
        },
      }),
  } as unknown as PdfjsPage
  const piece = (str: string) => ({ items: [{ str }], styles: {}, lang: null })
  return {
    page,
    give: (str: string) => controller.enqueue(piece(str)),
    end: () => controller.close(),
    fail: (error: Error) => controller.error(error),
    cancelled: () => cancelled,
  }
}

const settledWithin = async (promise: Promise<void>, ms = 20): Promise<boolean> =>
  Promise.race([
    promise.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ])

describe('text reads', () => {
  it('passes the pieces and the end through', async () => {
    const reads = createTextReads()
    const source = slowPage()
    const reader = reads.open(source.page).getReader()
    source.give('a')
    source.give('b')
    source.end()
    const read: string[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      read.push((value.items[0] as { str: string }).str)
    }
    expect(read).toEqual(['a', 'b'])
    expect(await settledWithin(reads.settle())).toBe(true)
  })

  it('passes a failure through', async () => {
    const reads = createTextReads()
    const source = slowPage()
    const reader = reads.open(source.page).getReader()
    source.fail(new Error('broken page'))
    await expect(reader.read()).rejects.toThrow('broken page')
    expect(await settledWithin(reads.settle())).toBe(true)
  })

  it('reads a cancelled stream to its end, and settles only then', async () => {
    const reads = createTextReads()
    const source = slowPage()
    const reader = reads.open(source.page).getReader()
    await reader.cancel(new DOMException('gone', 'AbortError'))
    expect(source.cancelled()).toBe(false)
    const settled = reads.settle()
    expect(await settledWithin(settled)).toBe(false)
    source.give('unread')
    expect(await settledWithin(settled)).toBe(false)
    source.end()
    expect(await settledWithin(settled)).toBe(true)
  })

  it('settle ends a stream for a reader still waiting on it', async () => {
    const reads = createTextReads()
    const source = slowPage()
    const reader = reads.open(source.page).getReader()
    const waiting = reader.read()
    const settled = reads.settle()
    expect((await waiting).done).toBe(true)
    expect(await settledWithin(settled)).toBe(false)
    source.end()
    expect(await settledWithin(settled)).toBe(true)
  })

  it('settles at once with nothing open, and when a source fails after a cancel', async () => {
    expect(await settledWithin(createTextReads().settle())).toBe(true)
    const reads = createTextReads()
    const source = slowPage()
    await reads.open(source.page).cancel()
    source.fail(new Error('late'))
    expect(await settledWithin(reads.settle())).toBe(true)
  })

  it('waits for a tracked read, whether it ends well or badly', async () => {
    const reads = createTextReads()
    let finish!: () => void
    let fail!: (error: Error) => void
    const good = reads.track(() => new Promise<void>((resolve) => (finish = resolve)))
    const bad = reads.track(() => new Promise<void>((_, reject) => (fail = reject)))
    const settled = reads.settle()
    expect(await settledWithin(settled)).toBe(false)
    finish()
    expect(await settledWithin(settled)).toBe(false)
    fail(new Error('broken'))
    expect(await settledWithin(settled)).toBe(true)
    await expect(good).resolves.toBeUndefined()
    await expect(bad).rejects.toThrow('broken')
  })

  it('starts nothing once settling has begun', async () => {
    const reads = createTextReads()
    await reads.settle()
    let started = false
    const source = slowPage()
    const opened = vi.spyOn(source.page, 'streamTextContent')
    expect((await reads.open(source.page).getReader().read()).done).toBe(true)
    expect(opened).not.toHaveBeenCalled()
    expect(
      reads.track(() => {
        started = true
        return Promise.resolve()
      })
    ).toBeUndefined()
    expect(started).toBe(false)
  })
})
