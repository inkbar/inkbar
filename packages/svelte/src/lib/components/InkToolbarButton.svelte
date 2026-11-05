<script module lang="ts">
  import type { ChildSnippet } from './child-snippet.js'
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  export interface InkToolbarButtonProps extends Omit<HTMLButtonAttributes, 'children'> {
    children?: Snippet | undefined
    /** Render your own button: spread `props` on it. */
    child?: ChildSnippet | undefined
  }
</script>

<!--
  Your own button in an `InkToolbar`. It joins the toolbar's arrow-key focus and takes the
  theme's toolbar button styles; what it shows and does is up to you.
-->
<script lang="ts">
  import { Toolbar } from 'bits-ui'

  import { asBitsProps } from './child-snippet.js'

  let { class: className, children, child, ...rest }: InkToolbarButtonProps = $props()
</script>

<Toolbar.Button
  type="button"
  class={['ink-toolbar-button', className]}
  data-ink-toolbar-button=""
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
>
  {@render children?.()}
</Toolbar.Button>
