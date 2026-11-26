/*
 * The plain DOM front end: `createViewer` with the controls from `@inkbar/core/dom`.
 */
import {
  createApplyRedactionsButton,
  createDownloadButton,
  createOutline,
  createPageCount,
  createPageInput,
  createPrintButton,
  createRedo,
  createThumbnails,
  createToolbar,
  createToolButton,
  createUndo,
  createViewer,
} from '@inkbar/core/dom'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { redactionConfirm, tools, type MountFront } from '../front.ts'

export const mount: MountFront = (el, props) => {
  const viewer = createViewer(el, {
    source: props.source,
    assets,
    tools: tools(),
    redactionConfirm,
    ...(props.messages ? { messages: props.messages } : {}),
    onReady: props.onReady,
    onRedacted: ({ bytes }) => props.onRedacted(bytes),
    onError: (error) => console.info('viewer error', error.code),
  })
  props.onApply(() => viewer.applyRedactions())

  const bar = createToolbar({ messages: viewer.messages })
  bar.append(
    createToolButton(viewer, 'select-text'),
    createToolButton(viewer, 'highlight'),
    createToolButton(viewer, 'draw'),
    createToolButton(viewer, 'redact-area'),
    createUndo(viewer),
    createRedo(viewer),
    createApplyRedactionsButton(viewer),
    createDownloadButton(viewer),
    createPrintButton(viewer),
    createPageInput(viewer),
    createPageCount(viewer)
  )
  viewer.element.prepend(bar)

  const panels = document.createElement('div')
  panels.className = 'smoke-panels'
  panels.append(createThumbnails(viewer), createOutline(viewer))
  viewer.element.append(panels)

  return {
    open: (source) => viewer.open(source),
    setMessages: (messages) => viewer.setMessages(messages),
    unmount: () => viewer.destroy(),
  }
}
