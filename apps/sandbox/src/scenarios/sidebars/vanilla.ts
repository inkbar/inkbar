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
  type SidebarPanelInfo,
} from '@inkbar/core/dom'
import { Info, Search, Square } from '@inkbar/icons'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'
import { storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { ScenarioLabels } from '../../shared/strings/types'
import type { DocumentSource, InkMessagesInput } from '@inkbar/core'

export function mount(
  el: HTMLElement,
  { source, messages, locale, labels, log, onDocument, openFile }: ScenarioProps
) {
  /** The groups this file names itself, each with its name in a set of labels. */
  const groups: [HTMLElement, (words: ScenarioLabels) => string][] = []
  function group(
    label: (words: ScenarioLabels) => string,
    className: string,
    ...controls: HTMLElement[]
  ): HTMLElement {
    const g = document.createElement('div')
    g.className = className
    g.setAttribute('role', 'group')
    g.append(...controls)
    groups.push([g, label])
    return g
  }

  const viewer = createViewer(el, {
    storage,
    source,
    ...(messages ? { messages } : {}),
    ...(locale ? { locale } : {}),
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
  const options = {
    rail: new Option('', 'rail'),
    tabs: new Option('', 'tabs'),
    stack: new Option('', 'stack'),
  }
  picker.append(options.rail, options.tabs, options.stack)
  const layoutText = document.createTextNode('')
  const layoutLabel = document.createElement('label')
  layoutLabel.className = 'scenario-layout'
  layoutLabel.append(layoutText, picker)

  const tools = createToolbar({ messages: viewer.messages })
  tools.classList.add('scenario-toolbar')
  tools.append(
    group(
      (w) => w.tools,
      'scenario-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select')
    ),
    layoutLabel
  )

  const status = createToolbar({ label: labels.pageAndZoom })
  status.classList.add('scenario-status-bar')
  status.append(
    group(
      (w) => w.page,
      'scenario-group',
      createPrevPage(viewer),
      createPageInput(viewer),
      createPageCount(viewer),
      createNextPage(viewer)
    ),
    group(
      (w) => w.zoom,
      'scenario-group scenario-zoom',
      createZoomOut(viewer),
      createZoomSelect(viewer),
      createZoomIn(viewer)
    )
  )

  // Your own button joins the toolbar like the built-in ones: arrow keys reach it.
  const openButton = document.createElement('button')
  openButton.type = 'button'
  const openText = document.createTextNode('')
  openButton.append(createIcon(FileUp), openText)
  openButton.addEventListener('click', openFile)
  tools.append(
    group(
      (w) => w.file,
      'scenario-group scenario-file',
      openButton,
      createDownloadButton(viewer),
      createPrintButton(viewer)
    )
  )

  // Thumbnails and search on the left; your own About on the right.
  const leftPanels = (words: ScenarioLabels): SidebarPanelInfo[] => [
    { id: 'pages', label: words.pages, icon: Square },
    { id: 'search', label: words.search, icon: Search },
  ]
  const rightPanels = (words: ScenarioLabels): SidebarPanelInfo[] => [
    { id: 'about', label: words.about, icon: Info },
  ]
  const left = createSidebar({
    storage,
    name: 'sidebars-left',
    side: 'left',
    layout: 'rail',
    panels: leftPanels(labels),
    content: { pages: createThumbnails(viewer), search: createSearchResults(viewer) },
  })

  const about = document.createElement('div')
  about.className = 'sidebar-about'
  const aboutFill = document.createElement('p')
  const aboutRecords = document.createElement('p')
  about.append(aboutFill, aboutRecords)
  const right = createSidebar({
    storage,
    name: 'sidebars-right',
    side: 'right',
    layout: 'rail',
    panels: rightPanels(labels),
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

  /** Writes the words this file supplies itself; a change of language writes them again. */
  function showLabels(words: ScenarioLabels): void {
    for (const [g, label] of groups) g.setAttribute('aria-label', label(words))
    status.setAttribute('aria-label', words.pageAndZoom)
    openButton.setAttribute('aria-label', words.openPdf)
    openButton.title = words.openPdf
    openText.data = words.open
    layoutText.data = words.layout
    options.rail.text = words.rail
    options.tabs.text = words.tabs
    options.stack.text = words.stack
    aboutFill.textContent = words.aboutFill
    aboutRecords.textContent = words.aboutRecords
    left.controller.update({ panels: leftPanels(words) })
    right.controller.update({ panels: rightPanels(words) })
  }
  showLabels(labels)

  return {
    open: (next: DocumentSource) => viewer.open(next),
    setLanguage(
      m: InkMessagesInput | undefined,
      l: string | undefined,
      words: ScenarioLabels
    ) {
      showLabels(words)
      viewer.setMessages(m)
      viewer.setLocale(l)
    },
    destroy() {
      left.controller.destroy()
      right.controller.destroy()
      viewer.destroy()
    },
  }
}
