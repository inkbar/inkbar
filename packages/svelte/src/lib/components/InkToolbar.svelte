<script module lang="ts">
  import type { ChildSnippet } from './child-snippet.js'
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  export interface InkToolbarProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'children'
  > {
    label?: string | undefined
    children?: Snippet | undefined
    /** Render your own toolbar element: spread `props` on it and put the controls inside. */
    child?: ChildSnippet | undefined
  }
</script>

<script lang="ts">
  import { Toolbar } from 'bits-ui'

  import { asBitsProps } from './child-snippet.js'

  let {
    label = 'Document tools',
    class: className,
    children,
    child,
    ...rest
  }: InkToolbarProps = $props()
</script>

<Toolbar.Root
  orientation="horizontal"
  aria-label={label}
  data-ink-toolbar=""
  class={['ink-toolbar', className]}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
>
  {@render children?.()}
</Toolbar.Root>
