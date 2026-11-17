<script lang="ts" module>
  import type { ChildSnippet } from './child-snippet.js'
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  export interface InkDownloadButtonProps extends Omit<HTMLButtonAttributes, 'children'> {
    children?: Snippet | undefined
    /** Render your own button: spread `props` on it. */
    child?: ChildSnippet | undefined
    /** The name to save under. Default: the document's `fileName`. */
    filename?: string | undefined
  }
</script>

<script lang="ts">
  /*
   * Saves the open document's file through the browser's download, under its `fileName`
   * or `filename`. Disabled until the document is ready. With InkRoot's `engine` and changes,
   * that is a copy with them written in; otherwise the file as it was opened. While a download
   * or print writes its copy the button is `aria-busy` and `aria-disabled`, keeping focus, and a
   * press does nothing. A copy that cannot be written reaches InkRoot's `onError`, and the
   * reader is told in InkViewport's message box.
   */
  import { downloadDocument, fileBusy } from '@inkbar/core/dom'
  import { Download } from '@inkbar/icons'
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
    filename,
    ...rest
  }: InkDownloadButtonProps = $props()

  const ctx = useInkContext('InkDownloadButton')
  const ready = $derived(ctx.document !== null && ctx.status.state === 'ready')
  const busy = useReadable(() => (ctx.document ? fileBusy(ctx.document) : null), false)
  const m = useMessages()
</script>

<Toolbar.Button
  class={['ink-download', className]}
  data-ink-download=""
  aria-label={m.current.toolbar.download}
  title={m.current.toolbar.download}
  aria-busy={busy.current}
  aria-disabled={busy.current ? 'true' : undefined}
  disabled={(!ready && !busy.current) || !!disabled}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    const doc = ctx.document
    if (e.defaultPrevented || !doc) return
    void downloadDocument(doc, filename === undefined ? {} : { filename }).catch(
      ctx.reportFileError
    )
  }}
>
  {#if children}{@render children()}{:else}<InkIcon icon={Download} />{/if}
</Toolbar.Button>
