/*
 * Inkbar without a framework: open the document with @inkbar/core, then wire the viewport,
 * page layers and tools from @inkbar/core/dom. The toolbar and the two popovers are in the
 * files next to this one.
 */
import {
  isInkError,
  openDocument,
  type DocumentSource,
  type InkDocument,
} from '@inkbar/core'
import {
  attachViewportKeys,
  createPageMount,
  createToolController,
  createViewport,
  cssVariableDefaults,
  getSelectionQuads,
  type PageLayer,
  type PageMount,
} from '@inkbar/core/dom'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { h } from './dom'
import { createNotePopover } from './note-popover'
import { createSuggestionCard } from './suggestion-card'
import { createToolbar } from './toolbar'

/** Mounts a viewer for `source` into `el`. Returns a function that tears it down. */
export function mountDemo(el: HTMLElement, source: DocumentSource): () => void {
  const root = h('div', {
    class: 'demo-root',
    'data-ink-root': '',
    'data-state': 'loading',
  })
  const status = h(
    'div',
    { class: 'ink-status', role: 'status', 'aria-live': 'polite' },
    'Loading document…'
  )
  const scroll = h('div', {
    class: 'ink-scroll',
    'data-ink-scroll': '',
    tabindex: '0',
    role: 'document',
    'aria-label': 'Document',
  })
  const viewportRoot = h(
    'div',
    { class: 'ink-viewport-root', 'data-ink-viewport-root': '', 'data-state': 'loading' },
    status,
    scroll
  )
  root.append(viewportRoot)
  el.append(root)

  let doc: InkDocument | null = null
  let stopViewer = (): void => undefined
  let cancelled = false
  // The theme's colour variables are read from the root, so it must be in the page first.
  void openDocument(source, { assets, defaults: cssVariableDefaults(root) }).then(
    (opened) => {
      if (cancelled) {
        opened.destroy()
        return
      }
      doc = opened
      const s = opened.status.get()
      root.dataset.state = s.state
      viewportRoot.dataset.state = s.state
      if (s.state === 'error') {
        status.className = 'ink-status ink-error'
        status.setAttribute('role', 'alert')
        status.removeAttribute('aria-live')
        // The engine's message is not written for readers: it stays on the code's tooltip.
        status.replaceChildren(
          h('p', { class: 'ink-error-title' }, 'This document could not be opened.'),
          h(
            'p',
            {},
            h('code', { class: 'ink-error-code', title: s.error.message }, s.error.code)
          )
        )
        return
      }
      status.remove()
      stopViewer = startViewer(opened, root, scroll)
    }
  )
  return () => {
    cancelled = true
    stopViewer()
    doc?.destroy()
    root.remove()
  }
}

function startViewer(
  doc: InkDocument,
  root: HTMLElement,
  scroll: HTMLElement
): () => void {
  const pages = new Map<number, PageMount>()
  const notes = createNotePopover(root, doc.annotations)
  const card = createSuggestionCard(root, doc.annotations)
  // Each popover opens for its own annotation type and closes for any other.
  const activate = (id: string): void => {
    notes.open(id)
    card.open(id)
  }

  const viewport = createViewport({
    container: scroll,
    document: doc,
    onMount: (page, host, transform) => {
      pages.set(
        page,
        createPageMount({
          document: doc,
          page,
          host,
          transform,
          store: doc.annotations,
          onActivate: activate,
          ...pageErrors(host, page),
        })
      )
    },
    onUpdate: (page, _host, transform) => pages.get(page)?.update(transform),
    onUnmount: (page) => {
      pages.get(page)?.destroy()
      pages.delete(page)
    },
  })
  const tools = createToolController({
    ctx: {
      store: doc.annotations,
      viewport,
      root: scroll,
      selectionQuads: () =>
        getSelectionQuads(scroll, (host) => {
          const page = Number(host.dataset.page)
          return { page, transform: viewport.transformFor(page) }
        }),
      clearSelection: () => window.getSelection()?.removeAllRanges(),
      onActivate: activate,
    },
  })
  const stopKeys = attachViewportKeys(scroll, {
    viewport,
    pageCount: () => doc.pages.length,
  })
  const toolbar = createToolbar(root, { doc, viewport, tools })

  return () => {
    toolbar.destroy()
    stopKeys()
    notes.destroy()
    card.destroy()
    tools.destroy()
    for (const mount of pages.values()) mount.destroy()
    pages.clear()
    viewport.destroy()
  }
}

/**
 * A page whose canvas or text layer fails shows an error in its place; the other pages carry
 * on. It clears once every failed layer has rendered again.
 */
function pageErrors(host: HTMLElement, page: number) {
  const failed = new Set<PageLayer>()
  let shown: HTMLElement | null = null
  return {
    onError(cause: unknown, layer: PageLayer): void {
      failed.add(layer)
      if (shown) return
      host.dataset.state = 'error'
      shown = h(
        'div',
        { class: 'ink-page-error', 'data-ink-page-error': '', role: 'alert' },
        h('p', {}, `Page ${page + 1} could not be shown.`),
        h(
          'code',
          { class: 'ink-error-code' },
          isInkError(cause) ? cause.code : 'InvalidPdf'
        )
      )
      host.append(shown)
    },
    onRendered(layer: PageLayer): void {
      failed.delete(layer)
      if (!shown || failed.size > 0) return
      shown.remove()
      shown = null
      delete host.dataset.state
    },
  }
}
