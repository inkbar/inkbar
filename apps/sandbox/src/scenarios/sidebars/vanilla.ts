/*
 * A sidebar either side of the pages, each a set of panels you fill. Pages lists thumbnails
 * and Search finds text; About on the right is your own element. Layout switches both
 * sidebars between a rail, tabs and a stack.
 */
import {
  createDownloadButton,
  createIcon,
  createPrintButton,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createSearchResults,
  createSidebar,
  createThumbnails,
  createToolbar,
  createToolButton,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
  type SidebarLayout,
} from '@inkbar/core/dom'
import { Info, Search, Square } from '@inkbar/icons'
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
    onReady: (doc) => {
      log('onReady', { pages: doc.pages.length })
      onDocument(doc)
    },
  })
  viewer.element.classList.add('scenario-root')

  // The layout picker: a select of your own, setting both sidebars.
  const picker = document.createElement('select')
  picker.className = 'ink-select'
  for (const [value, text] of [
    ['rail', 'Rail'],
    ['tabs', 'Tabs'],
    ['stack', 'Stack'],
  ] as const)
    picker.append(new Option(text, value))
  const layoutLabel = document.createElement('label')
  layoutLabel.className = 'scenario-layout'
  layoutLabel.append('Layout', picker)

  const tools = createToolbar()
  tools.classList.add('scenario-toolbar')
  tools.append(
    group(
      'Tools',
      'scenario-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select')
    ),
    layoutLabel
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

  // Thumbnails and search on the left; your own About on the right.
  const left = createSidebar({
    defaultWidth: 240,
    side: 'left',
    layout: 'rail',
    panels: [
      { id: 'pages', label: 'Pages', icon: Square },
      { id: 'search', label: 'Search', icon: Search },
    ],
    content: { pages: createThumbnails(viewer), search: createSearchResults(viewer) },
  })

  const about = document.createElement('div')
  about.className = 'sidebar-about'
  for (const text of [
    'Fill a sidebar with whatever you need: page thumbnails, search results or components of your own.',
    'Panels can read and write plugin records, so a list here shows the same data a plugin marks on the page.',
  ]) {
    const p = document.createElement('p')
    p.textContent = text
    about.append(p)
  }
  const right = createSidebar({
    defaultWidth: 240,
    side: 'right',
    layout: 'rail',
    panels: [{ id: 'about', label: 'About', icon: Info }],
    content: { about },
  })

  picker.addEventListener('change', () => {
    const layout = picker.value as SidebarLayout
    left.controller.update({ layout })
    right.controller.update({ layout })
  })

  // The sidebars go either side of the pages.
  const body = document.createElement('div')
  body.className = 'scenario-body'
  const viewport = viewer.element.querySelector('[data-ink-viewport-root]')
  viewport?.replaceWith(body)
  body.append(left.element, ...(viewport ? [viewport] : []), right.element)

  viewer.element.prepend(tools)
  viewer.element.append(status)

  return {
    open: (next: DocumentSource) => viewer.open(next),
    destroy() {
      left.controller.destroy()
      right.controller.destroy()
      viewer.destroy()
    },
  }
}
