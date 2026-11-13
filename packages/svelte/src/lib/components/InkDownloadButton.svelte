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
   * or `filename`. Disabled until the document is ready. Today that is the file as it was opened,
   * without this session's annotations.
   */
  import { downloadDocument } from '@inkbar/core/dom'
  import { Download } from '@inkbar/icons'
  import { Toolbar } from 'bits-ui'

  import { useInkContext } from '../context.js'
  import { useMessages } from '../messages.js'

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
  const m = useMessages()
</script>

<Toolbar.Button
  class={['ink-download', className]}
  data-ink-download=""
  aria-label={m.current.toolbar.download}
  title={m.current.toolbar.download}
  disabled={!ready || !!disabled}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    const doc = ctx.document
    if (e.defaultPrevented || !doc) return
    void downloadDocument(doc, filename === undefined ? {} : { filename }).catch(
      () => undefined
    )
  }}
>
  {#if children}{@render children()}{:else}<InkIcon icon={Download} />{/if}
</Toolbar.Button>
