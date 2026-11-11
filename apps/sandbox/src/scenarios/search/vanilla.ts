/*
 * Two hundred pages, and no creation tools. The viewer renders only the pages near the
 * viewport, but search reads every page's text, so the find bar counts every hit and steps to
 * any of them. Find opens the bar, as does Ctrl+F or Cmd+F. The results sidebar lists every
 * hit and shows only while there are hits. `viewer.search` holds the same state the bar shows,
 * for a control of your own.
 */
import {
  createFindBar,
  createDownloadButton,
  createIcon,
  createPrintButton,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createSearchButton,
  createSearchResults,
  createToolbar,
  createToolButton,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
} from '@inkbar/core/dom'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'
import { storage } from '../../shared/signatures'

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
    storage,
    source,
    assets,
    onReady: (doc) => {
      log('onReady', { pages: doc.pages.length })
      onDocument(doc)
    },
  })
  viewer.element.classList.add('scenario-root')

  // Log each finished search and each step to a hit, while the find bar is open.
  let last = viewer.search.state.get()
  const unfollowSearch = viewer.search.state.subscribe((s) => {
    const finished = last.scanning && !s.scanning
    const stepped = !s.scanning && s.current >= 0 && s.current !== last.current
    last = s
    if (s.open && s.query && (finished || stepped))
      log('search', { query: s.query, hits: s.hits.length, current: s.current })
  })

  const tools = createToolbar()
  tools.classList.add('scenario-toolbar')
  tools.append(
    group(
      'Tools',
      'scenario-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select')
    ),
    createSearchButton(viewer)
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

  // Your own button joins the toolbar like the built-in ones: arrow keys reach it.
  const openButton = document.createElement('button')
  openButton.type = 'button'
  openButton.setAttribute('aria-label', 'Open a PDF')
  openButton.title = 'Open a PDF'
  openButton.append(createIcon(FileUp), 'Open')
  openButton.addEventListener('click', openFile)
  tools.append(
    group(
      'File',
      'scenario-group scenario-file',
      openButton,
      createDownloadButton(viewer),
      createPrintButton(viewer)
    )
  )

  // Every hit, in a panel right of the pages; the find bar is the query field. Your code
  // decides when it shows: here, while the search has hits. Hidden rather than removed, so
  // the list keeps its scroll between searches.
  const results = document.createElement('aside')
  results.className = 'results-aside'
  results.setAttribute('aria-labelledby', 'results-title')
  const title = document.createElement('h2')
  title.id = 'results-title'
  title.className = 'results-aside-title'
  title.textContent = 'Search results'
  results.append(title, createSearchResults(viewer, { field: false }))
  const showResults = () => {
    results.hidden = viewer.search.state.get().hits.length === 0
  }
  showResults()
  const unfollowResults = viewer.search.state.subscribe(showResults)
  const body = document.createElement('div')
  body.className = 'scenario-body'
  const viewport = viewer.element.querySelector('[data-ink-viewport-root]')
  viewport?.replaceWith(body)
  body.append(...(viewport ? [viewport] : []), results)

  viewer.element.prepend(tools)
  viewer.element.append(status)
  // The find bar floats over the pages, so it goes in the viewport.
  viewport?.append(createFindBar(viewer))

  return {
    open: (next: DocumentSource) => viewer.open(next),
    destroy() {
      unfollowSearch()
      unfollowResults()
      viewer.destroy()
    },
  }
}
