<script lang="ts">
  import { useInkContext } from '../../lib/context.js'
  import { useRedaction } from '../../lib/hooks/useRedaction.svelte.js'

  /*
   * What `useRedaction` says, as data attributes, read through the hook object. "Apply" runs
   * its `apply()` and shows what it resolved with: the marks applied, or `null`. "Retry" submits
   * the password prompt, which opens the document's source again.
   */
  const redaction = useRedaction()
  const ctx = useInkContext('RedactionProbe')
  let applied = $state('')
</script>

<output
  data-testid="probe"
  data-can-redact={String(redaction.canRedact)}
  data-busy={String(redaction.busy)}
  data-applied={applied}
></output>
<button
  type="button"
  data-testid="hook-apply"
  onclick={async () => {
    const result = await redaction.apply()
    applied = result ? String(result.marks) : 'null'
  }}
>
  Apply through the hook
</button>
<button
  type="button"
  data-testid="retry"
  onclick={() => ctx.passwordPrompt?.submit('again')}
>
  Retry
</button>
