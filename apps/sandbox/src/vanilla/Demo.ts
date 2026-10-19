/*
 * Inkbar without a framework: createViewer opens the document and renders the viewer and its
 * popovers. The toolbars are built from Inkbar's controls, so each one is yours to keep, move
 * or drop, and each button takes your own icon in place of the one it shows. Suggest
 * redactions is a custom control, in actions.ts.
 */
import {
  createColorMenu,
  createLineStyleMenu,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createRedo,
  createShapeMenu,
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

import { addActions } from './actions'

import type { DocumentSource } from '@inkbar/core'

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
  const viewer = createViewer(el, { source, assets })
  viewer.element.classList.add('demo-root')

  const tools = createToolbar()
  tools.classList.add('demo-toolbar')
  tools.append(
    group('Highlight', 'demo-group', createToolButton(viewer, 'highlight')),
    group(
      'Tools',
      'demo-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select'),
      createToolButton(viewer, 'redact-area'),
      createShapeMenu(viewer),
      createToolButton(viewer, 'note')
    ),
    createToolbarSeparator(),
    group(
      'Style',
      'demo-group',
      createLineStyleMenu(viewer),
      createColorMenu(viewer, { property: 'border' }),
      createColorMenu(viewer, { property: 'fill' })
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
    actions.destroy()
    viewer.destroy()
  }
}
