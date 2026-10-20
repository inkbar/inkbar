<script lang="ts">
  import { useToolOptions } from '../../lib/hooks/useToolOptions.svelte.js'

  import type { SignatureOptions } from '@inkbar/core'

  const signature = useToolOptions<SignatureOptions>('signature')
</script>

<output data-testid="signature-options" data-template={signature.options.templateId ?? ''}
></output>
