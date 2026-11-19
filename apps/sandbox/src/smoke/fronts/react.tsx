/*
 * The React front end: InkRoot with the same controls as the other three, in StrictMode as the
 * sandbox runs its scenarios. Apply goes through `useRedaction().apply`, which needs InkRoot
 * around it, so a small child hands it over.
 */
import {
  InkApplyRedactions,
  InkDownloadButton,
  InkOutline,
  InkPageCount,
  InkPageInput,
  InkPrintButton,
  InkRedo,
  InkRoot,
  InkThreadPopover,
  InkThumbnails,
  InkToolbar,
  InkToolButton,
  InkUndo,
  InkViewport,
  useRedaction,
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { assets } from 'virtual:inkbar-assets'

import {
  engine,
  redactionConfirm,
  tools,
  type FrontProps,
  type MountFront,
} from '../front.ts'

function Apply({ onApply }: Pick<FrontProps, 'onApply'>) {
  const { apply } = useRedaction()
  useEffect(() => onApply(apply), [apply, onApply])
  return null
}

function Smoke(props: FrontProps) {
  const [toolList] = useState(tools)
  return (
    <InkRoot
      src={props.source}
      messages={props.messages}
      assets={assets}
      tools={toolList}
      engine={engine}
      redactionConfirm={redactionConfirm}
      onReady={props.onReady}
      onRedacted={({ bytes }) => props.onRedacted(bytes)}
      onError={(error) => console.info('viewer error', error.code)}
    >
      <Apply onApply={props.onApply} />
      <InkToolbar>
        <InkToolButton tool="select-text" />
        <InkToolButton tool="highlight" />
        <InkToolButton tool="draw" />
        <InkToolButton tool="redact-area" />
        <InkUndo />
        <InkRedo />
        <InkApplyRedactions />
        <InkDownloadButton />
        <InkPrintButton />
        <InkPageInput />
        <InkPageCount />
      </InkToolbar>
      <InkViewport />
      <div className="smoke-panels">
        <InkThumbnails />
        <InkOutline />
      </div>
      <InkThreadPopover />
    </InkRoot>
  )
}

export const mount: MountFront = (el, props) => {
  const root = createRoot(el)
  let current = props
  const render = (): void =>
    root.render(
      <StrictMode>
        <Smoke {...current} />
      </StrictMode>
    )
  render()
  return {
    open(source) {
      current = { ...current, source }
      render()
    },
    setMessages(messages) {
      current = { ...current, messages }
      render()
    },
    unmount: () => root.unmount(),
  }
}
