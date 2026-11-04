/*
 * Two hundred pages, and no creation tools. The viewer renders only the pages near the
 * viewport, but search reads every page's text, so the find bar counts every hit and steps to
 * any of them. Find opens the bar, as does Ctrl+F or Cmd+F. `viewer.search` holds the same
 * state the bar shows, for a control of your own.
 */
import {
  createFindBar,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createSearchButton,
  createToolbar,
  createToolButton,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
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
    onReady: (doc) => {
      log('onReady', { pages: doc.pages.length })
      onDocument(doc)
    },
  })
  viewer.element.classList.add('scenario-root')

  // Log each finished search and each step to a hit.
  let last = viewer.search.state.get()
  const unfollowSearch = viewer.search.state.subscribe((s) => {
    const finished = last.scanning && !s.scanning
    const stepped = !s.scanning && s.current !== last.current
    last = s
    if (s.query && (finished || stepped))
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

  viewer.element.prepend(tools)
  viewer.element.append(status)
  // The find bar floats over the pages, so it goes in the viewport.
  viewer.element.querySelector('[data-ink-viewport-root]')?.append(createFindBar(viewer))

  return {
    open: (next: DocumentSource) => viewer.open(next),
    destroy() {
      unfollowSearch()
      viewer.destroy()
    },
  }
}
