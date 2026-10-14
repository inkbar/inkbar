/*
 * Inkbar without a framework: createViewer opens the document and renders the viewer, its
 * toolbar and its popovers. The Undo, Redo and Suggest controls are in actions.ts.
 */
import { createViewer } from '@inkbar/core/dom'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { addActions } from './actions'

import type { DocumentSource } from '@inkbar/core'

export function mountDemo(el: HTMLElement, source: DocumentSource): () => void {
  const viewer = createViewer(el, { source, assets })
  viewer.element.classList.add('demo-root')
  const actions = viewer.toolbar ? addActions(viewer.toolbar, viewer.document) : undefined
  return () => {
    actions?.destroy()
    viewer.destroy()
  }
}
