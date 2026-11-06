<script lang="ts" module>
  import type { ChildSnippet } from './child-snippet.js'
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  export interface InkPrintButtonProps extends Omit<HTMLButtonAttributes, 'children'> {
    children?: Snippet | undefined
    /** Render your own button: spread `props` on it. */
    child?: ChildSnippet | undefined
  }
</script>

<script lang="ts">
  /*
   * Prints the open document's file with the browser's own PDF viewer (on iOS, in a new
   * tab). Disabled until the document is ready. Today that is the file as it was opened,
   * without this session's annotations.
   */
  import { printDocument } from '@inkbar/core/dom'
  import { Printer } from '@inkbar/icons'
  import { Toolbar } from 'bits-ui'

  import { useInkContext } from '../context.js'

  import { asBitsProps } from './child-snippet.js'
  import InkIcon from './InkIcon.svelte'

  let {
    class: className,
    children,
    child,
    disabled,
    onclick,
    ...rest
  }: InkPrintButtonProps = $props()

  const ctx = useInkContext('InkPrintButton')
  const ready = $derived(ctx.document !== null && ctx.status.state === 'ready')
</script>

<Toolbar.Button
  class={['ink-print', className]}
  data-ink-print=""
  aria-label="Print"
  title="Print"
  disabled={!ready || !!disabled}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    const doc = ctx.document
    if (e.defaultPrevented || !doc) return
    void printDocument(doc).catch(() => undefined)
  }}
>
  {#if children}{@render children()}{:else}<InkIcon icon={Printer} />{/if}
</Toolbar.Button>
