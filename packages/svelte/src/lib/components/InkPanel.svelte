<script module lang="ts">
  import type { Label } from '@inkbar/core'
  import type { IconNode } from '@inkbar/icons'
  import type { Snippet } from 'svelte'

  export interface InkPanelProps {
    /** Names the panel in the sidebar's `open`. */
    id: string
    /**
     * Names its trigger: a string, or a function read again whenever the root's `messages`
     * change.
     */
    label: Label
    /** An `@inkbar/icons` node, shown on the rail. */
    icon?: IconNode | undefined
    /** A count or short text beside it, hidden when empty or 0. */
    badge?: string | number | undefined
    /** The panel's content. */
    children?: Snippet | undefined
  }
</script>

<script lang="ts">
  /*
   * One panel of an `InkSidebar`, holding `children` as its content. Closed, the panel stays
   * mounted and hidden. In a stack it renders its own header above its content.
   */
  import { resolveLabel } from '@inkbar/core'

  import { useMessages } from '../messages.js'

  import { useSidebarContext } from './sidebar-context.js'
  import SidebarTrigger from './SidebarTrigger.svelte'

  import type { SidebarPanelInfo } from '@inkbar/core/dom'

  let { id, label, icon, badge, children }: InkPanelProps = $props()

  const ctx = useSidebarContext('InkPanel')
  const m = useMessages()
  /** The label as shown now: a label function runs again on new messages. */
  const title = $derived.by(() => {
    void m.current
    return resolveLabel(label)
  })
  let wrapper = $state<HTMLDivElement | null>(null)

  const info = (): SidebarPanelInfo => ({
    id,
    label,
    ...(icon !== undefined && { icon }),
    ...(badge !== undefined && { badge }),
  })
  // Registered now, so the server renders this panel's attributes; ordered once in the DOM.
  const unregister = ctx.register({ info, element: () => wrapper })
  $effect(() => {
    ctx.arrange()
    return unregister
  })

  const view = $derived.by(() => {
    const s = ctx.state.current
    return {
      stack: s.layout === 'stack',
      trigger: ctx.controller.triggerAttrs(id),
      panel: ctx.controller.panelAttrs(id),
    }
  })
</script>

<!-- A section in a stack; in rail and tabs the theme leaves the layout to the panel. Kept in
     every layout, so the content is never remounted. -->
<div
  bind:this={wrapper}
  class={['ink-sidebar-slot', view.stack && 'ink-sidebar-section']}
>
  {#if view.stack}
    <button class="ink-sidebar-header" {...view.trigger}>
      <SidebarTrigger panel={info()} rail={false} />
    </button>
  {/if}
  <div class="ink-sidebar-panel" {...view.panel}>
    <!-- The rail button names the panel for assistive technology; this repeats it on screen. -->
    <div class="ink-sidebar-panel-title" aria-hidden="true">{title}</div>
    <div class="ink-sidebar-panel-body">{@render children?.()}</div>
  </div>
</div>
