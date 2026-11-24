import type { PdfjsPage, PdfjsTextContent } from './types'

type Piece = Pick<PdfjsTextContent, 'items' | 'styles' | 'lang'>
type Params = Parameters<PdfjsPage['streamTextContent']>[0]

/**
 * The reads of page text that one document has running in PDF.js.
 *
 * PDF.js logs a console warning when its document is destroyed while the worker is still reading
 * a page's text or drawing commands, and a cancelled stream does not say when its read has
 * ended. So a stream opened here is read to its end whatever its reader does, and the document
 * waits for `settle()` before it destroys PDF.js.
 *
 * @internal
 */
export interface TextReads {
  /** `page.streamTextContent(params)`, read to its end even when the reader cancels. */
  open(page: PdfjsPage, params?: Params): ReadableStream<Piece>
  /** Starts a read that gives a promise, unless `settle()` has been called: then `undefined`. */
  track<T>(start: () => Promise<T>): Promise<T> | undefined
  /**
   * Ends every open stream for its reader, and resolves once PDF.js has finished every read.
   * From this call on `open()` gives an empty stream and `track()` starts nothing.
   */
  settle(): Promise<void>
}

interface Stream {
  finished: Promise<void>
  end(): void
}

export function createTextReads(): TextReads {
  const streams = new Set<Stream>()
  const promises = new Set<Promise<void>>()
  let closed = false
  return {
    open(page, params) {
      if (closed) {
        return new ReadableStream<Piece>({
          start(controller) {
            controller.close()
          },
        })
      }
      const source = (page.streamTextContent(params) as ReadableStream<Piece>).getReader()
      let passing = true
      let controller!: ReadableStreamDefaultController<Piece>
      const out = new ReadableStream<Piece>({
        start(c) {
          controller = c
        },
        cancel() {
          passing = false
        },
      })
      const stream: Stream = {
        finished: Promise.resolve(),
        end() {
          if (!passing) return
          passing = false
          controller.close()
        },
      }
      stream.finished = (async () => {
        try {
          for (;;) {
            const { done, value } = await source.read()
            if (done) break
            if (passing) controller.enqueue(value)
          }
          if (passing) controller.close()
        } catch (error) {
          if (passing) controller.error(error)
        } finally {
          passing = false
          streams.delete(stream)
        }
      })()
      streams.add(stream)
      return out
    },
    track(start) {
      if (closed) return undefined
      const read = start()
      const over = read.then(
        () => undefined,
        () => undefined
      )
      promises.add(over)
      void over.then(() => promises.delete(over))
      return read
    },
    async settle() {
      closed = true
      const open = [...streams]
      for (const stream of open) stream.end()
      await Promise.all([...open.map((stream) => stream.finished), ...promises])
    },
  }
}
