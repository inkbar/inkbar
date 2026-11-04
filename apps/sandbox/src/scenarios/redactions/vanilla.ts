/*
 * Suggest redactions is a plugin (src/plugin/suggestions.ts). Register it in `plugins` and place
 * its command where you want with createCommandButton. Suggest adds the plugin's own records,
 * draws a mark on each and opens a card when you press one. Accept turns a suggestion into a
 * redaction.
 */
import {
  allTools,
  createColorMenu,
  createCommandButton,
  createHighlightMenu,
  createLineStyleMenu,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createRedo,
  createShapeMenu,
  createSignatureMenu,
  createTextStyleMenu,
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

import { suggestionsPlugin } from '../../plugin/suggestions'
import '../../plugin/suggestions.css'
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

export function mount(el: HTMLElement, { source, log, onDocument }: ScenarioProps) {
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

  viewer.element.prepend(tools)
  viewer.element.append(status)

  return {
    open: (next: DocumentSource) => viewer.open(next),
    destroy() {
      unfollowCommand()
      viewer.destroy()
    },
  }
}
