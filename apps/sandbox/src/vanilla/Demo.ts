/*
 * Inkbar without a framework: createViewer opens the document and renders the viewer and its
 * popovers. The toolbars are built from Inkbar's controls, so each one is yours to keep, move
 * or drop, and each button takes your own icon in place of the one it shows. Suggest
 * redactions is the app's own extension: its button is in actions.ts, its review card in
 * shared/suggestion-card.ts.
 */
import {
  createColorMenu,
  createHighlightMenu,
  createLineStyleMenu,
  createTextStyleMenu,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createRedo,
  createShapeMenu,
  createSignatureMenu,
  createToolbar,
  createToolbarSeparator,
  createToolButton,
  createUndo,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
} from '@inkbar/core/dom'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { signatureFonts, signatures } from '../shared/signatures'
import { decorateSuggestion } from '../shared/suggestion'
import { mountSuggestionCard } from '../shared/suggestion-card'

import { addActions } from './actions'

import type { DocumentSource, InkDocument } from '@inkbar/core'

function group(
  label: string,
  className: string,
  ...controls: HTMLElement[]
): HTMLElement {
  const g = document.createElement('div')
  g.className = className
  g.setAttribute('role', 'group')
  g.setAttribute('aria-label', label)
  g.append(...controls)
  return g
}

export function mountDemo(el: HTMLElement, source: DocumentSource): () => void {
  const viewer = createViewer(el, {
    source,
    assets,
    signatures,
    signatureFonts,
    decorateAnnotation: decorateSuggestion,
    suggestions: false,
  })
  viewer.element.classList.add('demo-root')

  // The suggestion review card, remounted for each document opened.
  let card: { destroy(): void } | null = null
  const mountCard = (doc: InkDocument | null): void => {
    card?.destroy()
    card = doc
      ? mountSuggestionCard({
          root: viewer.element,
          store: doc.annotations,
          activated: viewer.activated,
          setActivated: (id) => viewer.setActivated(id),
        })
      : null
  }
  mountCard(viewer.document.get())
  const stopCard = viewer.document.subscribe(mountCard)

  const tools = createToolbar()
  tools.classList.add('demo-toolbar')
  tools.append(
    createHighlightMenu(viewer),
    group(
      'Tools',
      'demo-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select'),
      createToolButton(viewer, 'redact-area'),
      createToolButton(viewer, 'sketch'),
      createToolButton(viewer, 'draw'),
      createShapeMenu(viewer),
      createToolButton(viewer, 'freetext'),
      createSignatureMenu(viewer),
      createToolButton(viewer, 'note')
    ),
    createToolbarSeparator(),
    group(
      'Style',
      'demo-group',
      createLineStyleMenu(viewer),
      createColorMenu(viewer, { property: 'border' }),
      createColorMenu(viewer, { property: 'fill' }),
      createTextStyleMenu(viewer)
    ),
    createUndo(viewer),
    createRedo(viewer)
  )
  const actions = addActions(tools, viewer.document)

  const status = createToolbar({ label: 'Page and zoom' })
  status.classList.add('demo-status-bar')
  status.append(
    group(
      'Page',
      'demo-group',
      createPrevPage(viewer),
      createPageInput(viewer),
      createPageCount(viewer),
      createNextPage(viewer)
    ),
    group(
      'Zoom',
      'demo-group demo-zoom',
      createZoomOut(viewer),
      createZoomSelect(viewer),
      createZoomIn(viewer)
    )
  )

  viewer.element.prepend(tools)
  viewer.element.append(status)
  return () => {
    stopCard()
    card?.destroy()
    actions.destroy()
    viewer.destroy()
  }
}
