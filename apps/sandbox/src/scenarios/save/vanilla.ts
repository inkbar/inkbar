/*
 * Download and Print write the session into the PDF: each annotation as a standard PDF
 * annotation other programs can read, and changed form values. With no changes you
 * get the file as it was opened. Open the saved file here and Inkbar's own
 * annotations come back ready to edit.
 */
import {
  createHighlightMenu,
  createDownloadButton,
  createIcon,
  createPrintButton,
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
    tools: [highlightTool(), noteTool()],
    onReady: (doc) => {
      log('onReady', { pages: doc.pages.length })
      onDocument(doc)
    },
    onError: (error) => log('onError', { code: error.code }),
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

  const tools = createToolbar({ messages: viewer.messages })
  tools.classList.add('scenario-toolbar')
  tools.append(
    createHighlightMenu(viewer),
    group(
      (w) => w.tools,
      'scenario-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select'),
      createToolButton(viewer, 'note')
    ),
    createUndo(viewer),
    createRedo(viewer)
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

  viewer.element.prepend(tools)
  viewer.element.append(status)

  /** Writes the words this file supplies itself; a change of language writes them again. */
  function showLabels(words: ScenarioLabels): void {
    for (const [g, label] of groups) g.setAttribute('aria-label', label(words))
    status.setAttribute('aria-label', words.pageAndZoom)
    openButton.setAttribute('aria-label', words.openPdf)
    openButton.title = words.openPdf
    openText.data = words.open
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
      unfollowTool()
      unfollowTools()
      viewer.destroy()
    },
  }
}
