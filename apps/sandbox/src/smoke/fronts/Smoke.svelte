<script lang="ts">
  /*
   * The Svelte front end: InkRoot with the same controls as the other three. Apply goes through
   * `useRedaction().apply`, which needs InkRoot around it, so a small child hands it over.
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
  } from '@inkbar/svelte'
  import '@inkbar/theme/theme.css'
  import { assets } from 'virtual:inkbar-assets'

  import { redactionConfirm, tools as makeTools } from '../front.ts'

  import Apply from './SmokeApply.svelte'

  import type { FrontProps } from '../front.ts'

  let { source, messages, onReady, onRedacted, onApply }: FrontProps = $props()

  const tools = makeTools()
</script>

<InkRoot
  src={source}
  {messages}
  {assets}
  {tools}
  {redactionConfirm}
  {onReady}
  onRedacted={({ bytes }) => onRedacted(bytes)}
  onError={(error) => console.info('viewer error', error.code)}
>
  <Apply {onApply} />
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
  <div class="smoke-panels">
    <InkThumbnails />
    <InkOutline />
  </div>
  <InkThreadPopover />
</InkRoot>
