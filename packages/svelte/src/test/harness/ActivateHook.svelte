<script lang="ts">
  import { useInkContext } from '../../lib/context.js'

  import type { HostWindow } from './PopoverHarness.svelte'

  /** Test-only: activates an annotation the way app code would, with no press or key. */
  const ctx = useInkContext('ActivateHook')
  $effect(() => {
    ;(window as HostWindow).__inkActivate = (id) => ctx.setActivated(id)
    return () => {
      ;(window as HostWindow).__inkActivate = undefined
    }
  })
</script>
