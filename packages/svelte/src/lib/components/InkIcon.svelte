<script module lang="ts">
  import type { IconNode } from '@inkbar/icons'

  export interface InkIconProps {
    icon: IconNode
    size?: number | undefined
  }
</script>

<script lang="ts">
  /*
   * An icon from `@inkbar/icons`, hidden from assistive technology: the control it sits in
   * carries the name. The theme sizes it with `--ink-icon-size`.
   */
  import { ICON_ATTRIBUTES } from '@inkbar/icons'

  let { icon, size = 18 }: InkIconProps = $props()
</script>

<svg {...ICON_ATTRIBUTES} width={size} height={size} class="ink-icon" aria-hidden="true">
  {#each icon as [tag, attrs], i (i)}
    <svelte:element this={tag} {...attrs} />
  {/each}
</svg>
