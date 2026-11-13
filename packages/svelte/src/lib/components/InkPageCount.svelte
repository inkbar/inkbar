<script module lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'

  export type InkPageCountProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'>
</script>

<script lang="ts">
  import { usePage } from '../hooks/usePage.svelte.js'
  import { useMessages } from '../messages.js'

  let { class: className, ...rest }: InkPageCountProps = $props()

  const page = usePage()
  const m = useMessages()
</script>

<span
  class={['ink-page-count', className]}
  data-ink-page-count=""
  aria-live="polite"
  {...rest}>{m.current.toolbar.pageOf({ total: page.count })}</span
>
