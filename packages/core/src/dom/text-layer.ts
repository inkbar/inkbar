// Inline styles here are structural only: the layer covers the page host
// (`position:absolute; inset:0`) and its text must stay selectable whatever the page around it
// sets (`user-select:text`). Span styling (transparent colour, absolute positioning, font
// sizing, rotation transforms) is the theme's job. Core lays the spans out itself from the
// reader's text.
import { mountTextSpans } from './text-spans'

import type { PageTransform } from './transform'
import type { InkDocument } from '../model/document'

export interface TextLayerOptions {
  document: InkDocument
  /** Zero-based page index. */
  page: number
  /** The page host (`div.ink-page`), which must carry `--total-scale-factor`. */
  host: HTMLElement
  transform: PageTransform
  /**
   * Mount or update failures. Cancellation by `destroy` is not reported. If it throws, the
   * exception is rethrown asynchronously; `ready` still resolves.
   */
  onError?(error: unknown): void
  /** The layer mounted, or applied an `update`, without error. */
  onRendered?(): void
}

export interface TextLayerHandle {
  readonly element: HTMLElement
  /** Resolves once the latest mount or `update` has applied. Never rejects. */
  readonly ready: Promise<void>
  update(transform: PageTransform): void
  destroy(): void
}

export function createTextLayer(opts: TextLayerOptions): TextLayerHandle {
  const { document: doc, page } = opts
  const el = opts.host.ownerDocument.createElement('div')
  el.className = 'ink-text-layer'
  el.dataset.inkTextLayer = ''
  el.style.cssText = 'position:absolute;inset:0;user-select:text;'
  opts.host.append(el)

  const abort = new AbortController()
  /** The spans built from the engine reader's text, once mounted. */
  let spans: ReturnType<typeof mountTextSpans> | undefined

  const mount = async (transform: PageTransform): Promise<void> => {
    // Throws, as `_reader` does, while the document is not ready.
    const reader = doc._reader
    // Destroying the layer cancels its read, so a page scrolled past does not hold up the next.
    const [content, families, baselines, info] = await Promise.all([
      reader.text(page, { signal: abort.signal }),
      reader.textFamilies(page, abort.signal),
      reader.textBaselines(page, abort.signal),
      reader.pageInfo(page),
    ])
    if (abort.signal.aborted) return
    spans = mountTextSpans({
      content,
      families,
      baselines,
      info,
      container: el,
      transform,
    })
    opts.onRendered?.()
  }

  // A throwing `onError` must not reject `ready`: its exception is rethrown from a microtask,
  // so it still surfaces as an uncaught error.
  const report = (error: unknown) => {
    if (abort.signal.aborted || !opts.onError) return
    try {
      opts.onError(error)
    } catch (thrown) {
      queueMicrotask(() => {
        throw thrown
      })
    }
  }

  let ready: Promise<void> = mount(opts.transform).catch(report)
  let latest = opts.transform

  const api: TextLayerHandle = {
    element: el,
    get ready() {
      return ready
    },
    update(transform) {
      if (abort.signal.aborted) return
      latest = transform
      ready = ready
        .then(async () => {
          if (abort.signal.aborted) return
          if (spans) {
            spans.update(transform)
            opts.onRendered?.()
            return
          }
          // A mount that failed is tried again, so the layer can recover with the page.
          el.replaceChildren()
          await mount(transform)
        })
        .catch(report)
    },
    destroy() {
      if (abort.signal.aborted) return
      abort.abort()
      stopRestart()
      el.remove()
    },
  }
  // A document that has stopped reading and starts again: a mount that failed meanwhile is
  // tried again (`update` does that), so the page's text comes back with its pixels.
  const stopRestart = doc.engineStopped.subscribe((stopped) => {
    if (!stopped && !spans) api.update(latest)
  })
  return api
}
