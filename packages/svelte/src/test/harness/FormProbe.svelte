<script lang="ts">
  import { useForm } from '../../lib/hooks/useForm.svelte.js'

  import type { FieldValues } from '@inkbar/core'

  /** `useForm()` on the page: its fields and values as attributes, and `set` and `reset` buttons. */
  let { setTo }: { setTo?: FieldValues | undefined } = $props()

  // Read through the hook object in the template, so a hook that returned plain values would
  // freeze the probe.
  const form = useForm()
  let result = $state('')
</script>

<output
  data-testid="form"
  data-fields={form.fields.length}
  data-values={JSON.stringify(form.values)}
  data-result={result}
></output>
<button
  type="button"
  data-testid="form-set"
  onclick={() => {
    const r = form.set(setTo ?? { name: 'Set' })
    result = r ? JSON.stringify(r) : ''
  }}
>
  set
</button>
<button type="button" data-testid="form-reset" onclick={() => form.reset()}>reset</button>
