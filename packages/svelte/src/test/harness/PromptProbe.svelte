<script lang="ts">
  import { useInkContext } from '../../lib/context.js'

  /** Submits a password through the prompt and switches the source in the same handler. */
  let { password, onSwitch }: { password: string; onSwitch: () => void } = $props()

  const ctx = useInkContext('PromptProbe')
</script>

<button
  type="button"
  data-testid="submit-and-switch"
  onclick={() => {
    ctx.passwordPrompt?.submit(password)
    onSwitch()
  }}
>
  submit and switch
</button>
