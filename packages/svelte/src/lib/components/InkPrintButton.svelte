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
   * tab). Disabled until the document is ready, and while its redaction marks are applied. It
   * prints what InkDownloadButton downloads, is busy while a copy is written as that button is,
   * and reports a failure the same way.
   */
  import { fileBusy, printDocument, redactionBusy } from '@inkbar/core/dom'
  import { Printer } from '@inkbar/icons'
  import { Toolbar } from 'bits-ui'

  import { useInkContext } from '../context.js'
  import { useMessages } from '../messages.js'
  import { useReadable } from '../use-readable.svelte.js'

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
  const busy = useReadable(() => (ctx.document ? fileBusy(ctx.document) : null), false)
  // The document's redaction marks are being applied: its file is about to be replaced.
  const redacting = useReadable(
    () => (ctx.document ? redactionBusy(ctx.document) : null),
    false
  )
  const m = useMessages()
</script>

<Toolbar.Button
  class={['ink-print', className]}
  data-ink-print=""
  aria-label={m.current.toolbar.print}
  title={m.current.toolbar.print}
  aria-busy={busy.current}
  aria-disabled={busy.current ? 'true' : undefined}
  disabled={(!ready && !busy.current) || redacting.current || !!disabled}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    const doc = ctx.document
    if (e.defaultPrevented || !doc) return
    void printDocument(doc, { messages: m.current }).catch(ctx.reportFileError)
  }}
>
  {#if children}{@render children()}{:else}<InkIcon icon={Printer} />{/if}
</Toolbar.Button>
