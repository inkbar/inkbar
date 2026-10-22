<script lang="ts">
  import { writable } from '@inkbar/core'
  import { definePlugin } from '@inkbar/core/dom'

  import InkRoot from '../../lib/components/InkRoot.svelte'

  import CommandStateProbe from './CommandStateProbe.svelte'

  import type { PdfAssets } from '@inkbar/core'

  let { assets, id }: { assets: PdfAssets; id: string } = $props()

  // `always` is enabled without a document, so only plugin setup decides when it turns on.
  const plugins = [
    definePlugin({
      id: 'sandbox',
      setup(ctx) {
        ctx.commands.add({
          id: 'always',
          label: 'Always',
          enabled: writable(true),
          run: () => undefined,
        })
      },
    }),
  ]
</script>

<svelte:boundary>
  <div data-testid="harness" data-error="">
    <InkRoot src={null} {assets} {plugins}>
      <CommandStateProbe {id} />
    </InkRoot>
  </div>
  {#snippet failed(error)}
    <div
      data-testid="harness"
      data-error={(error as { code?: string }).code ?? String(error)}
    ></div>
  {/snippet}
</svelte:boundary>
