<script lang="ts" module>
  import type { ChildSnippet } from './child-snippet.js'
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  export interface InkApplyRedactionsProps extends Omit<
    HTMLButtonAttributes,
    'children'
  > {
    children?: Snippet<[{ label: string; busy: boolean; disabled: boolean }]> | undefined
    /** Render your own button: spread `props` on it. */
    child?: ChildSnippet | undefined
  }
</script>

<script lang="ts">
  /*
   * Applies the open document's redaction marks, as `useRedaction().apply` does: asks first
   * (InkRoot's `redactionConfirm`), removes the content under them and shows the redacted file.
   * Disabled until the document is ready, was opened with InkRoot's `engine` and holds a mark.
   * While the marks are applied the button says so and is `aria-busy` and `aria-disabled`,
   * keeping focus, and a press does nothing. `disabled` turns it off whatever the state, and
   * whatever element `child` renders. The `children` snippet receives
   * `{ label, busy, disabled }`.
   */
  import { Toolbar } from 'bits-ui'

  import { useRedaction } from '../hooks/useRedaction.svelte.js'
  import { useMessages } from '../messages.js'

  import { asBitsProps } from './child-snippet.js'

  let {
    class: className,
    children,
    child,
    disabled,
    onclick,
    ...rest
  }: InkApplyRedactionsProps = $props()

  const redaction = useRedaction()
  const m = useMessages()
  const label = $derived(
    redaction.busy ? m.current.viewer.redacting : m.current.viewer.applyRedactions
  )
  const off = $derived(!!disabled || (!redaction.canRedact && !redaction.busy))
</script>

<Toolbar.Button
  type="button"
  class={['ink-apply-redactions', className]}
  data-ink-apply-redactions=""
  aria-busy={redaction.busy}
  aria-disabled={redaction.busy ? 'true' : undefined}
  disabled={off}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    // A host's own element that is not a button takes clicks whatever `disabled` says.
    if (off || e.defaultPrevented) return
    void redaction.apply()
  }}
>
  {#if children}{@render children({
      label,
      busy: redaction.busy,
      disabled: off,
    })}{:else}{label}{/if}
</Toolbar.Button>
