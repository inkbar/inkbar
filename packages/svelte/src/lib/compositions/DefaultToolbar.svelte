<script module lang="ts">
  import type { Snippet } from 'svelte'

  export interface DefaultToolbarProps {
    label?: string | undefined
    class?: string | undefined
    children?: Snippet | undefined
  }
</script>

<script lang="ts">
  /*
   * The standard toolbar: tools, zoom and page controls with icons. It adds no styles of its
   * own; the theme styles the `data-ink-*` hooks. Extra controls go in `children`.
   */
  // One module per icon: the package's index evaluates every icon it ships, which costs a
  // server (or a test) that imports this file well over a second.
  import Hand from '@lucide/svelte/icons/hand'
  import Highlighter from '@lucide/svelte/icons/highlighter'
  import MessageSquare from '@lucide/svelte/icons/message-square'
  import MousePointer2 from '@lucide/svelte/icons/mouse-pointer-2'
  import Square from '@lucide/svelte/icons/square'
  import ZoomIn from '@lucide/svelte/icons/zoom-in'
  import ZoomOut from '@lucide/svelte/icons/zoom-out'

  import { cx } from '../class-names.js'
  import InkPageCount from '../components/InkPageCount.svelte'
  import InkPageInput from '../components/InkPageInput.svelte'
  import InkToolbar from '../components/InkToolbar.svelte'
  import InkToolButton from '../components/InkToolButton.svelte'
  import InkZoomIn from '../components/InkZoomIn.svelte'
  import InkZoomOut from '../components/InkZoomOut.svelte'
  import InkZoomSelect from '../components/InkZoomSelect.svelte'

  let {
    label = 'Document tools',
    class: className,
    children,
  }: DefaultToolbarProps = $props()

  const ICON = 18
</script>

<InkToolbar
  {label}
  class={cx('ink-default-toolbar', className)}
  data-ink-default-toolbar=""
>
  <div
    class="ink-toolbar-group"
    data-ink-toolbar-group="tools"
    role="group"
    aria-label="Tools"
  >
    <InkToolButton tool="view"><Hand size={ICON} aria-hidden="true" /></InkToolButton>
    <InkToolButton tool="select"
      ><MousePointer2 size={ICON} aria-hidden="true" /></InkToolButton
    >
    <InkToolButton tool="highlight"
      ><Highlighter size={ICON} aria-hidden="true" /></InkToolButton
    >
    <InkToolButton tool="redact-area"
      ><Square size={ICON} aria-hidden="true" /></InkToolButton
    >
    <InkToolButton tool="note"
      ><MessageSquare size={ICON} aria-hidden="true" /></InkToolButton
    >
  </div>
  <div
    class="ink-toolbar-group"
    data-ink-toolbar-group="zoom"
    role="group"
    aria-label="Zoom"
  >
    <InkZoomOut><ZoomOut size={ICON} aria-hidden="true" /></InkZoomOut>
    <InkZoomSelect />
    <InkZoomIn><ZoomIn size={ICON} aria-hidden="true" /></InkZoomIn>
  </div>
  <div
    class="ink-toolbar-group"
    data-ink-toolbar-group="page"
    role="group"
    aria-label="Page"
  >
    <InkPageInput />
    <InkPageCount />
  </div>
  {@render children?.()}
</InkToolbar>
