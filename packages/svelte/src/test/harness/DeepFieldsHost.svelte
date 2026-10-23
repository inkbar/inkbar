<script lang="ts">
  import { untrack } from 'svelte'

  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import type { FieldValues, PdfAssets } from '@inkbar/core'

  /**
   * A host that holds the field values in deep `$state`, as an app that does not reach for
   * `$state.raw` would: every value written back through `bind:fields` is a new proxy.
   */
  let { src, assets, initial }: { src: string; assets: PdfAssets; initial: FieldValues } =
    $props()

  let values = $state<FieldValues>(untrack(() => initial))
  let heard = $state(0)
</script>

<InkRoot {src} {assets} zoom={1} bind:fields={values} onFieldsChange={() => (heard += 1)}>
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 600px; width: 900px">
    <InkViewport />
  </div>
  <output
    data-testid="host-fields"
    data-values={JSON.stringify(values)}
    data-heard={heard}
  ></output>
</InkRoot>
