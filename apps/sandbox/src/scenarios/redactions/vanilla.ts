/*
 * Suggest redactions is a plugin (src/plugin/suggestions.ts). Register it in `plugins` and place
 * its command where you want with createCommandButton. Suggest adds the plugin's own records,
 * draws a mark on each and opens a card when you press one. Accept turns a suggestion into a
 * redaction. Thumbnails of the pages sit in a sidebar on the left. On the right, the plugin's
 * open suggestions as a list, and the ones accepted so far, written here on `viewer.records`.
 */
import {
  allTools,
  createColorMenu,
  createCommandButton,
  createHighlightMenu,
  createDownloadButton,
  createIcon,
  createPrintButton,
  createLineStyleMenu,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createRecordList,
  createRedo,
  createShapeMenu,
  createSidebar,
  createSignatureMenu,
  createTextStyleMenu,
  createThumbnails,
  createToolbar,
  createToolbarSeparator,
  createToolButton,
  createUndo,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
  type SidebarPanelInfo,
} from '@inkbar/core/dom'
import { Check, Square, SquareDashed } from '@inkbar/icons'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import {
  acceptedFrom,
  suggestionsPlugin,
  type Suggestion,
} from '../../plugin/suggestions'
import '../../plugin/suggestions.css'
import { FileUp } from '../../shared/file-up'
import { signatureFonts, signatures } from '../../shared/signatures'

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
    tools: allTools(),
    plugins: [suggestionsPlugin()],
    signatures,
    signatureFonts,
    onReady: (doc) => {
      log('onReady', { pages: doc.pages.length })
      onDocument(doc)
    },
    onActivate: (id) => log('onActivate', id),
  })
  viewer.element.classList.add('scenario-root')

  // Each result of the Suggest command arrives as its status.
  const suggest = viewer.commands.get('sandbox.suggest')
  const unfollowCommand =
    suggest?.status?.subscribe((status) => {
      if (status) log('command', status)
    }) ?? (() => undefined)

  const tools = createToolbar()
  tools.classList.add('scenario-toolbar')
  tools.append(
    createHighlightMenu(viewer),
    group(
      'Tools',
      'scenario-group',
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
      'scenario-group',
      createLineStyleMenu(viewer),
      createColorMenu(viewer, { property: 'border' }),
      createColorMenu(viewer, { property: 'fill' }),
      createTextStyleMenu(viewer)
    ),
    createUndo(viewer),
    createRedo(viewer),
    group('Suggest', 'scenario-actions', createCommandButton(viewer, 'sandbox.suggest'))
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

  // Thumbnails of the pages, in a sidebar on the left. It starts closed, leaving the pages the
  // room.
  const left = createSidebar({
    side: 'left',
    layout: 'rail',
    panels: [{ id: 'pages', label: 'Pages', icon: Square }],
    open: null,
    content: { pages: createThumbnails(viewer) },
    onOpenChange: (open) => left.controller.update({ open }),
  })

  // On the right, the plugin's open suggestions as the cards their marks open, and the ones
  // accepted so far. Closed until Suggest has something to show.
  const suggestions = viewer.records<Suggestion>('sandbox.suggestions')
  const panels = (open: number): SidebarPanelInfo[] => [
    { id: 'suggestions', label: 'Suggestions', icon: SquareDashed, badge: open },
    { id: 'accepted', label: 'Accepted', icon: Check },
  ]
  const accepted = document.createElement('div')
  accepted.className = 'accepted'
  const right = createSidebar({
    side: 'right',
    layout: 'rail',
    panels: panels(0),
    open: null,
    content: {
      suggestions: createRecordList(viewer, { records: 'sandbox.suggestions' }),
      accepted,
    },
    onOpenChange: (open) => right.controller.update({ open }),
  })

  /** Puts a suggestion back up for review and removes its redaction, in one undo step. */
  function undoAccept(suggestion: Suggestion): void {
    suggestions.batch(() => {
      suggestions.update(suggestion.id, { status: 'suggested' })
      const annotations = viewer.document.get()?.annotations
      for (const a of annotations?.list.get() ?? [])
        if (acceptedFrom(a) === suggestion.id) annotations?.remove(a.id)
    })
  }

  function showAccepted(list: readonly Suggestion[]): void {
    const items = list
      .filter((s) => s.status === 'accepted')
      .map((s) => {
        const li = document.createElement('li')
        const reason = document.createElement('span')
        reason.className = 'accepted-reason'
        reason.textContent = s.reason
        const meta = document.createElement('span')
        meta.className = 'accepted-meta'
        meta.textContent = `${s.text}, page ${s.page + 1}`
        const undo = document.createElement('button')
        undo.type = 'button'
        undo.textContent = 'Undo accept'
        undo.addEventListener('click', () => undoAccept(s))
        li.append(reason, meta, undo)
        return li
      })
    if (items.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'accepted-empty'
      empty.textContent = 'Nothing accepted yet.'
      accepted.replaceChildren(empty)
    } else {
      const ul = document.createElement('ul')
      ul.append(...items)
      accepted.replaceChildren(ul)
    }
  }

  const unfollowRecords = suggestions.list.subscribe((list) => {
    right.controller.update({
      panels: panels(list.filter((s) => s.status === 'suggested').length),
    })
    showAccepted(list)
  })

  // Suggest opens the Suggestions panel when it finishes.
  let wasBusy = false
  const unfollowBusy =
    suggest?.busy.subscribe((busy) => {
      if (wasBusy && !busy) right.controller.update({ open: 'suggestions' })
      wasBusy = busy
    }) ?? (() => undefined)

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
      unfollowCommand()
      unfollowRecords()
      unfollowBusy()
      left.controller.destroy()
      right.controller.destroy()
      viewer.destroy()
    },
  }
}
