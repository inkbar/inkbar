<script lang="ts">
  import { writable } from '@inkbar/core'
  import { definePlugin } from '@inkbar/core/dom'

  import InkRoot from '../../lib/components/InkRoot.svelte'

  import CommandStateProbe from './CommandStateProbe.svelte'

  import type { PdfAssets } from '@inkbar/core'

  let {
    assets,
    id,
    src = null,
  }: { assets: PdfAssets; id: string; src?: string | null } = $props()

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

<InkRoot {src} {assets} {plugins}>
  <CommandStateProbe {id} />
</InkRoot>
