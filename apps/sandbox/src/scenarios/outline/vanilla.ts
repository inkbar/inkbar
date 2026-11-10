/*
 * A table of contents, an index and an outline in one document. The outline lists the
 * chapters on the left; click an entry to jump to it, and press the right arrow on
 * "3. Recording and checking" to open it. Click a line of the contents on page 2, or a page
 * number in the index on the last page, then use Back to return. The web link in section 3.3
 * is not opened by Inkbar: it comes to onAction, and this code opens the tab.
 */
import {
  createBack,
  createDownloadButton,
  createForward,
  createIcon,
  createNextPage,
  createOutline,
  createPageCount,
  createPageInput,
  createPrevPage,
  createPrintButton,
  createSearchResults,
  createSidebar,
  createThumbnails,
  createToolbar,
  createToolButton,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
} from '@inkbar/core/dom'
import { List, Search, Square } from '@inkbar/icons'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'

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

export function mount(
  el: HTMLElement,
  { source, log, onDocument, openFile }: ScenarioProps
) {
  const viewer = createViewer(el, {
    source,
    assets,
    onAction: (action) => {
      log('onAction', action)
      if (action.kind === 'open-url') window.open(action.url, '_blank', 'noopener')
    },
    onReady: (doc) => {
      log('onReady', { pages: doc.pages.length })
      onDocument(doc)
    },
  })
  viewer.element.classList.add('scenario-root')

  // Your own button joins the toolbar like the built-in ones: arrow keys reach it.
  const openButton = document.createElement('button')
  openButton.type = 'button'
  openButton.setAttribute('aria-label', 'Open a PDF')
  openButton.title = 'Open a PDF'
  openButton.append(createIcon(FileUp), 'Open')
  openButton.addEventListener('click', openFile)

  const tools = createToolbar()
  tools.classList.add('scenario-toolbar')
  tools.append(
    group(
      'Tools',
      'scenario-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select')
    ),
    group('History', 'scenario-group', createBack(viewer), createForward(viewer)),
    group(
      'File',
      'scenario-group scenario-file',
      openButton,
      createDownloadButton(viewer),
      createPrintButton(viewer)
    )
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

  const left = createSidebar({
    side: 'left',
    layout: 'rail',
    open: 'outline',
    panels: [
      { id: 'outline', label: 'Outline', icon: List },
      { id: 'pages', label: 'Pages', icon: Square },
      { id: 'search', label: 'Search', icon: Search },
    ],
    content: {
      outline: createOutline(viewer),
      pages: createThumbnails(viewer),
      search: createSearchResults(viewer),
    },
  })

  // The sidebar goes beside the pages.
  const body = document.createElement('div')
  body.className = 'scenario-body'
  const viewport = viewer.element.querySelector('[data-ink-viewport-root]')
  viewport?.replaceWith(body)
  body.append(left.element, ...(viewport ? [viewport] : []))

  viewer.element.prepend(tools)
  viewer.element.append(status)

  return {
    open: (next: DocumentSource) => viewer.open(next),
    destroy() {
      left.controller.destroy()
      viewer.destroy()
    },
  }
}
