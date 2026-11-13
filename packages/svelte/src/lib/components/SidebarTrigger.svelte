<script lang="ts">
  /*
   * A sidebar trigger's content: `createSidebar`'s markup, so the theme styles both alike. The
   * rail shows the icon alone (the trigger's `title` carries the label); tabs and stack headers
   * show the label too. The badge is hidden from assistive technology: the trigger's name has it.
   */
  import { sidebarBadge, sidebarLabel, type SidebarPanelInfo } from '@inkbar/core/dom'

  import InkIcon from './InkIcon.svelte'

  let { panel, rail }: { panel: SidebarPanelInfo; rail: boolean } = $props()

  const badge = $derived(sidebarBadge(panel.badge))
</script>

{#if panel.icon}<InkIcon icon={panel.icon} />{/if}{#if !panel.icon || !rail}<span
    class="ink-sidebar-label">{sidebarLabel(panel)}</span
  >{/if}<span class="ink-sidebar-badge" aria-hidden="true" hidden={badge === null}
  >{badge}</span
>
