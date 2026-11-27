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
  createApplyRedactionsButton,
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
import { signatureFonts, storage } from '../../shared/signatures'

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

  /** The words this file supplies itself, and the plugin's; a change of language replaces them. */
  let current = labels
  const viewer = createViewer(el, {
    source,
    ...(messages ? { messages } : {}),
    ...(locale ? { locale } : {}),
    assets,
    tools: allTools(),
    // The plugin reads its words when it shows them, so they follow the language.
    plugins: [suggestionsPlugin({ text: () => current.plugin })],
    storage,
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

  const tools = createToolbar({ messages: viewer.messages })
  tools.classList.add('scenario-toolbar')
  tools.append(
    createHighlightMenu(viewer),
    group(
      (w) => w.tools,
      'scenario-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select'),
      createToolButton(viewer, 'redact-area'),
      createApplyRedactionsButton(viewer),
      createToolButton(viewer, 'sketch'),
      createToolButton(viewer, 'draw'),
      createShapeMenu(viewer),
      createToolButton(viewer, 'freetext'),
      createSignatureMenu(viewer),
      createToolButton(viewer, 'note')
    ),
    createToolbarSeparator(),
    group(
      (w) => w.style,
      'scenario-group',
      createLineStyleMenu(viewer),
      createColorMenu(viewer, { property: 'border' }),
      createColorMenu(viewer, { property: 'fill' }),
      createTextStyleMenu(viewer)
    ),
    createUndo(viewer),
    createRedo(viewer),
    group(
      (w) => w.suggest,
      'scenario-actions',
      createCommandButton(viewer, 'sandbox.suggest')
    )
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

  const leftPanels = (words: ScenarioLabels): SidebarPanelInfo[] => [
    { id: 'pages', label: words.pages, icon: Square },
  ]
  // Thumbnails of the pages, in a sidebar on the left. It starts closed, leaving the pages the
  // room.
  const left = createSidebar({
    storage,
    name: 'redactions-left',
    side: 'left',
    layout: 'rail',
    panels: leftPanels(labels),
    open: null,
    content: { pages: createThumbnails(viewer) },
    onOpenChange: (open) => left.controller.update({ open }),
  })

  // On the right, the plugin's open suggestions as the cards their marks open, and the ones
  // accepted so far. Closed until Suggest has something to show.
  const suggestions = viewer.records<Suggestion>('sandbox.suggestions')
  const panels = (open: number): SidebarPanelInfo[] => [
    { id: 'suggestions', label: current.suggestions, icon: SquareDashed, badge: open },
    { id: 'accepted', label: current.accepted, icon: Check },
  ]
  const accepted = document.createElement('div')
  accepted.className = 'accepted'
  const right = createSidebar({
    storage,
    name: 'redactions-right',
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
        reason.textContent = current.plugin.reasons[s.kind]
        const meta = document.createElement('span')
        meta.className = 'accepted-meta'
        meta.textContent = current.acceptedAt({ text: s.text, page: s.page + 1 })
        const undo = document.createElement('button')
        undo.type = 'button'
        undo.textContent = current.undoAccept
        undo.addEventListener('click', () => undoAccept(s))
        li.append(reason, meta, undo)
        return li
      })
    if (items.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'accepted-empty'
      empty.textContent = current.nothingAccepted
      accepted.replaceChildren(empty)
    } else {
      const ul = document.createElement('ul')
      ul.append(...items)
      accepted.replaceChildren(ul)
    }
  }

  const showSuggestions = (list: readonly Suggestion[]): void => {
    right.controller.update({
      panels: panels(list.filter((s) => s.status === 'suggested').length),
    })
    showAccepted(list)
  }
  const unfollowRecords = suggestions.list.subscribe(showSuggestions)

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

  /** Writes the words this file supplies itself; a change of language writes them again. */
  function showLabels(words: ScenarioLabels): void {
    current = words
    for (const [g, label] of groups) g.setAttribute('aria-label', label(words))
    status.setAttribute('aria-label', words.pageAndZoom)
    openButton.setAttribute('aria-label', words.openPdf)
    openButton.title = words.openPdf
    openText.data = words.open
    left.controller.update({ panels: leftPanels(words) })
    showSuggestions(suggestions.list.get())
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
      unfollowCommand()
      unfollowRecords()
      unfollowBusy()
      left.controller.destroy()
      right.controller.destroy()
      viewer.destroy()
    },
  }
}
