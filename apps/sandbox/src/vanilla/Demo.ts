/*
 * Inkbar without a framework: createViewer opens the document and renders the viewer and its
 * popovers. The document keeps its own form values and undo history, so Undo covers field
 * edits too. The page follows the form's values (`doc.form.values`) for the Gloss view and
 * hears the form's requests (`onFormAction`), which the Form panel lists. The toolbars are
 * built from Inkbar's controls, so each one is yours to keep, move or drop, and each button
 * takes your own icon in place of the one it shows. Suggest redactions is a plugin
 * (src/plugin/suggestions.ts): registered in `plugins`, with its button placed by
 * createCommandButton.
 */
import {
  createColorMenu,
  createCommandButton,
  createFindBar,
  createHighlightMenu,
  createLineStyleMenu,
  createTextStyleMenu,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createRedo,
  createSearchButton,
  createShapeMenu,
  createSignatureMenu,
  createToolbar,
  createToolbarSeparator,
  createToolButton,
  createUndo,
  createViewer,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
} from '@inkbar/core/dom'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { suggestionsPlugin } from '../plugin/suggestions'
import '../plugin/suggestions.css'
import { glossFields, logAction, type LoggedAction } from '../shared/form'
import { signatureFonts, signatures } from '../shared/signatures'

import type { DocumentSource, FormAction } from '@inkbar/core'

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

function element(tag: string, text = ''): HTMLElement {
  const e = document.createElement(tag)
  e.textContent = text
  return e
}

/** The Form panel: the form's latest actions and its values as Gloss, set as text only. */
function formPanel() {
  const panel = element('section')
  panel.className = 'demo-form'
  panel.setAttribute('aria-labelledby', 'demo-form-title')
  // It scrolls, so it takes focus for keyboard scrolling.
  panel.tabIndex = 0
  const title = element('h2', 'Form')
  title.id = 'demo-form-title'
  const list = element('ol')
  const empty = element('p', 'None yet. Try the buttons on page 6.')
  const gloss = element('pre')
  panel.append(
    title,
    element(
      'p',
      "Inkbar never sends, opens or prints anything. The form's requests come here."
    ),
    element('h3', 'Actions'),
    empty,
    element('h3', 'Fields as Gloss'),
    gloss
  )
  let log: LoggedAction[] = []
  return {
    element: panel,
    action(a: FormAction) {
      log = logAction(log, a)
      list.replaceChildren(...log.map((entry) => element('li', entry.text)))
      if (empty.isConnected) empty.replaceWith(list)
    },
    gloss(text: string) {
      gloss.textContent = text
    },
  }
}

export function mountDemo(el: HTMLElement, source: DocumentSource): () => void {
  const panel = formPanel()
  /** Stops following the last document's values. */
  let unfollow = (): void => undefined
  const viewer = createViewer(el, {
    source,
    assets,
    signatures,
    signatureFonts,
    plugins: [suggestionsPlugin()],
    onFormAction: (a) => panel.action(a),
    // The Gloss view follows each change to the open document's values.
    onReady: (doc) => {
      unfollow()
      panel.gloss(glossFields(doc))
      unfollow = doc.form.values.subscribe(() => panel.gloss(glossFields(doc)))
    },
  })
  viewer.element.classList.add('demo-root')

  // The panel sits beside the viewport, in a row of its own.
  const body = element('div')
  body.className = 'demo-body'
  const viewport = viewer.element.querySelector('.ink-viewport-root')!
  viewport.replaceWith(body)
  body.append(viewport, panel.element)

  const tools = createToolbar()
  tools.classList.add('demo-toolbar')
  tools.append(
    createHighlightMenu(viewer),
    group(
      'Tools',
      'demo-group',
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
      'demo-group',
      createLineStyleMenu(viewer),
      createColorMenu(viewer, { property: 'border' }),
      createColorMenu(viewer, { property: 'fill' }),
      createTextStyleMenu(viewer)
    ),
    createUndo(viewer),
    createRedo(viewer),
    createSearchButton(viewer),
    group('Suggest', 'demo-actions', createCommandButton(viewer, 'sandbox.suggest'))
  )

  const status = createToolbar({ label: 'Page and zoom' })
  status.classList.add('demo-status-bar')
  status.append(
    group(
      'Page',
      'demo-group',
      createPrevPage(viewer),
      createPageInput(viewer),
      createPageCount(viewer),
      createNextPage(viewer)
    ),
    group(
      'Zoom',
      'demo-group demo-zoom',
      createZoomOut(viewer),
      createZoomSelect(viewer),
      createZoomIn(viewer)
    )
  )

  viewer.element.querySelector('[data-ink-viewport-root]')?.append(createFindBar(viewer))
  viewer.element.prepend(tools)
  viewer.element.append(status)
  return () => {
    unfollow()
    viewer.destroy()
  }
}
