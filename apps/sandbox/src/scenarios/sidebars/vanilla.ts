/*
 * A sidebar either side of the pages, each a set of panels you fill. Pages lists thumbnails,
 * Search finds text, and Notes and Keys are your own elements. Layout switches both sidebars
 * between a rail, tabs and a stack; a closed panel keeps its content, so a note stays put.
 * Remove pages… opens a dialog of your own with one createThumbnail per page inside its
 * checkbox label. It removes nothing: Remove only closes it.
 */
import {
  createIcon,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createSearchResults,
  createSidebar,
  createThumbnail,
  createThumbnails,
  createToolbar,
  createToolButton,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
  type SidebarLayout,
} from '@inkbar/core/dom'
import { MessageSquareText, Search, Square, Type } from '@inkbar/icons'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'

import type { ScenarioProps } from '../../frameworks/types'
import type { DocumentSource } from '@inkbar/core'

const KEYS: Record<SidebarLayout, string> = {
  rail: 'Up and Down move between the buttons, Home and End go to the first and last, and Enter or Space opens a panel, or closes the open one.',
  tabs: 'Left and Right move between the tabs, Home and End go to the first and last, and Enter or Space opens one.',
  stack:
    'Each header is a Tab stop. Up and Down move between them, and Enter or Space expands or collapses a section.',
}

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
  for (const [value, text] of [
    ['rail', 'Rail'],
    ['tabs', 'Tabs'],
    ['stack', 'Stack'],
  ] as const)
    picker.append(new Option(text, value))
  const layoutLabel = document.createElement('label')
  layoutLabel.className = 'scenario-layout'
  layoutLabel.append('Layout', picker)

  const removeButton = document.createElement('button')
  removeButton.type = 'button'
  removeButton.textContent = 'Remove pages…'

  const tools = createToolbar()
  tools.classList.add('scenario-toolbar')
  tools.append(
    group(
      'Tools',
      'scenario-group',
      createToolButton(viewer, 'select-text'),
      createToolButton(viewer, 'select')
    ),
    layoutLabel,
    group('Pages', 'scenario-actions', removeButton)
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
  tools.append(group('File', 'scenario-group scenario-file', openButton))

  // Thumbnails and search on the left; your own Notes and Keys on the right.
  const left = createSidebar({
    side: 'left',
    layout: 'rail',
    panels: [
      { id: 'pages', label: 'Pages', icon: Square },
      { id: 'search', label: 'Search', icon: Search },
    ],
    content: { pages: createThumbnails(viewer), search: createSearchResults(viewer) },
  })

  const notes = document.createElement('div')
  notes.className = 'sidebar-notes'
  const textarea = document.createElement('textarea')
  textarea.setAttribute('aria-label', 'Notes')
  textarea.placeholder = 'Anything to remember'
  notes.append(textarea)
  const keys = document.createElement('p')
  keys.className = 'sidebar-keys'
  keys.textContent = KEYS.rail
  const right = createSidebar({
    side: 'right',
    layout: 'rail',
    panels: [
      { id: 'notes', label: 'Notes', icon: MessageSquareText },
      { id: 'keys', label: 'Keys', icon: Type },
    ],
    content: { notes, keys },
  })

  picker.addEventListener('change', () => {
    const layout = picker.value as SidebarLayout
    left.controller.update({ layout })
    right.controller.update({ layout })
    keys.textContent = KEYS[layout]
  })

  // The dialog: a checkbox per page, its label wrapped around a thumbnail of the page.
  const dialog = document.createElement('dialog')
  dialog.className = 'remove-pages'
  dialog.setAttribute('aria-labelledby', 'remove-pages-title')
  const form = document.createElement('form')
  form.method = 'dialog'
  const title = document.createElement('h2')
  title.id = 'remove-pages-title'
  title.textContent = 'Remove pages'
  const list = document.createElement('ul')
  const actions = document.createElement('div')
  actions.className = 'remove-pages-actions'
  for (const [value, text] of [
    ['cancel', 'Cancel'],
    ['remove', 'Remove'],
  ]) {
    const b = document.createElement('button')
    b.value = value!
    b.textContent = text!
    actions.append(b)
  }
  form.append(title, list, actions)
  dialog.append(form)
  removeButton.addEventListener('click', () => dialog.showModal())

  // A thumbnail follows the open document, so each page's item is made once and kept.
  const items: HTMLLIElement[] = []
  function item(page: number): HTMLLIElement {
    const li = document.createElement('li')
    const label = document.createElement('label')
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.value = String(page)
    const number = document.createElement('span')
    number.setAttribute('aria-hidden', 'true')
    number.textContent = String(page + 1)
    label.append(box, createThumbnail(viewer, { page, width: 96 }), number)
    li.append(label)
    return li
  }
  const unfollowDocument = viewer.document.subscribe((doc) => {
    const count = doc?.pages.length ?? 0
    for (let page = items.length; page < count; page++) items.push(item(page))
    list.replaceChildren(...items.slice(0, count))
  })

  // The sidebars go either side of the pages.
  const body = document.createElement('div')
  body.className = 'scenario-body'
  const viewport = viewer.element.querySelector('[data-ink-viewport-root]')
  viewport?.replaceWith(body)
  body.append(left.element, ...(viewport ? [viewport] : []), right.element)

  viewer.element.prepend(tools)
  viewer.element.append(status, dialog)

  return {
    open: (next: DocumentSource) => viewer.open(next),
    destroy() {
      unfollowDocument()
      left.controller.destroy()
      right.controller.destroy()
      viewer.destroy()
    },
  }
}
