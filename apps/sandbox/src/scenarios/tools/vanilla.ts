/*
 * Only the tools you import end up in your bundle. This viewer registers highlight and note;
 * every other creation tool stays out, and its button has nothing to switch on. Select text and
 * Select come with every viewer. createViewer has no tool callback, so the active tool is a
 * readable on the viewer's tool controller.
 */
import {
  createHighlightMenu,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createRedo,
  createToolbar,
  createToolButton,
  createUndo,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
  highlightTool,
  noteTool,
} from '@inkbar/core/dom'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import type { ScenarioProps } from '../../frameworks/types'
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

export function mount(el: HTMLElement, { source, log, onDocument }: ScenarioProps) {
  const viewer = createViewer(el, {
    source,
    assets,
    tools: [highlightTool(), noteTool()],
    onReady: (doc) => {
      log('onReady', { pages: doc.pages.length })
      onDocument(doc)
    },
  })
  viewer.element.classList.add('scenario-root')

  // The tool controller changes when a document opens, so follow the current one's tool.
  let unfollowTool = (): void => undefined
  const unfollowTools = viewer.tools.subscribe((controller) => {
    unfollowTool()
    unfollowTool = controller
      ? controller.active.subscribe((tool) => log('tools.active', tool))
      : () => undefined
  })

  const tools = createToolbar()
  tools.classList.add('scenario-toolbar')
  tools.append(
    createHighlightMenu(viewer),
    group(
      'Tools',
      'scenario-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select'),
      createToolButton(viewer, 'note')
    ),
    createUndo(viewer),
    createRedo(viewer)
  )

  const status = createToolbar({ label: 'Page and zoom' })
  status.classList.add('scenario-status-bar')
  status.append(
    group(
      'Page',
      'scenario-group',
      createPrevPage(viewer),
      createPageInput(viewer),
      createPageCount(viewer),
      createNextPage(viewer)
    ),
    group(
      'Zoom',
      'scenario-group scenario-zoom',
      createZoomOut(viewer),
      createZoomSelect(viewer),
      createZoomIn(viewer)
    )
  )

  viewer.element.prepend(tools)
  viewer.element.append(status)

  return {
    open: (next: DocumentSource) => viewer.open(next),
    destroy() {
      unfollowTool()
      unfollowTools()
      viewer.destroy()
    },
  }
}
