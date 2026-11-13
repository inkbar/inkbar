<script module lang="ts">
  import type { ChildSnippet } from './child-snippet.js'
  import type { Label } from '@inkbar/core'
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  export interface InkToolbarProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'children'
  > {
    /**
     * The accessible name: a string, or a function read again whenever the root's `messages`
     * change. Default "Document tools", in the root's words.
     */
    label?: Label | undefined
    children?: Snippet | undefined
    /** Render your own toolbar element: spread `props` on it and put the controls inside. */
    child?: ChildSnippet | undefined
  }
</script>

<script lang="ts">
  import { Toolbar } from 'bits-ui'

  import { hostLabel, useMessages } from '../messages.js'

  import { asBitsProps } from './child-snippet.js'

  let { label, class: className, children, child, ...rest }: InkToolbarProps = $props()

  const m = useMessages()
</script>

<Toolbar.Root
  orientation="horizontal"
  aria-label={hostLabel(label, m.current.toolbar.label)}
  data-ink-toolbar=""
  class={['ink-toolbar', className]}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
>
  {@render children?.()}
</Toolbar.Root>
