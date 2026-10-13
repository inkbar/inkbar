<script module lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'

  export type InkPageCountProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'>
</script>

<script lang="ts">
  import { usePage } from '../hooks/usePage.svelte.js'

  let { class: className, ...rest }: InkPageCountProps = $props()

  const page = usePage()
</script>

<span
  class={['ink-page-count', className]}
  data-ink-page-count=""
  aria-live="polite"
  {...rest}>of {page.count}</span
>
