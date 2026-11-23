import { describe, expect, it, vi } from 'vitest'

import { readTextContent } from './text-content'

import type { PdfjsPage } from './types'

/** A page whose text stream gives `pieces`, then stays open unless `end` is true. */
function pageOf(pieces: unknown[], end: boolean) {
  const cancel = vi.fn()
  const page = {
    streamTextContent: () =>
      new ReadableStream({
        start(controller) {
          for (const piece of pieces) controller.enqueue(piece)
          if (end) controller.close()
        },
        cancel,
      }),
  } as unknown as PdfjsPage
  return { page, cancel }
}

const piece = (str: string, lang: string | null = null) => ({
  items: [{ str }],
  styles: { [str]: { fontFamily: 'sans-serif' } },
  lang,
})

describe('readTextContent', () => {
  it('merges the pieces in order, with the first lang given', async () => {
    const { page } = pageOf([piece('a'), piece('b', 'en'), piece('c', 'fr')], true)
    const content = await readTextContent(page)
    expect(content.items).toEqual([{ str: 'a' }, { str: 'b' }, { str: 'c' }])
    expect(content.lang).toBe('en')
    expect(Object.keys(content.styles)).toEqual(['a', 'b', 'c'])
  })

  it('rejects with the reason of a signal aborted before the read, and reads nothing', async () => {
    const stream = vi.fn()
    const reason = new Error('moved on')
    await expect(
      readTextContent(
        { streamTextContent: stream } as unknown as PdfjsPage,
        AbortSignal.abort(reason)
      )
    ).rejects.toBe(reason)
    expect(stream).not.toHaveBeenCalled()
  })

  it('cancels the stream and rejects with the reason once the signal aborts', async () => {
    const { page, cancel } = pageOf([piece('a')], false)
    const c = new AbortController()
    const reason = new Error('moved on')
    const reading = readTextContent(page, c.signal)
    await new Promise((resolve) => setTimeout(resolve))
    c.abort(reason)
    await expect(reading).rejects.toBe(reason)
    expect(cancel).toHaveBeenCalledWith(reason)
  })

  it('reads to the end with a signal that does not abort', async () => {
    const { page } = pageOf([piece('a'), piece('b')], true)
    const content = await readTextContent(page, new AbortController().signal)
    expect(content.items).toEqual([{ str: 'a' }, { str: 'b' }])
  })
})
