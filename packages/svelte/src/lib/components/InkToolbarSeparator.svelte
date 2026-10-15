<script module lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'

  export type InkToolbarSeparatorProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'>
</script>

<script lang="ts">
  /* A divider between groups of controls in a horizontal toolbar. Not focusable. */
  let { class: className, ...rest }: InkToolbarSeparatorProps = $props()
</script>

<div
  role="separator"
  aria-orientation="vertical"
  class={['ink-toolbar-separator', className]}
  data-ink-toolbar-separator=""
  {...rest}
></div>
