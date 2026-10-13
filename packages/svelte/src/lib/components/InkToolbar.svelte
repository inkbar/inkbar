<script module lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  export interface InkToolbarProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'children'
  > {
    label?: string | undefined
    children?: Snippet | undefined
    /** Render your own toolbar element: spread `props` on it and put the controls inside. */
    child?: Snippet<[{ props: Record<string, unknown> }]> | undefined
  }
</script>

<script lang="ts">
  import { Toolbar } from 'bits-ui'

  let {
    label = 'Document tools',
    class: className,
    children,
    ...rest
  }: InkToolbarProps = $props()
  // Bits UI types attributes without `| null | undefined` (exactOptionalPropertyTypes); the
  // values, `child` included, are passed through untouched.
  const passthrough = $derived(rest as Record<string, unknown>)
</script>

<Toolbar.Root
  orientation="horizontal"
  aria-label={label}
  data-ink-toolbar=""
  class={['ink-toolbar', className]}
  {...passthrough}
>
  {@render children?.()}
</Toolbar.Root>
