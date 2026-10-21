<script lang="ts">
  import { untrack } from 'svelte'

  import InkRoot from '../../lib/components/InkRoot.svelte'

  import PluginControls from './PluginControls.svelte'
  import { createTestPlugin } from './test-plugin.js'

  import type { Annotation, DocumentSource, PdfAssets } from '@inkbar/core'

  /** Plugins hold functions, built here once so a test passes only plain props. */
  let {
    src,
    assets,
    controlled = false,
    history,
    log,
  }: {
    src: DocumentSource
    assets: PdfAssets
    /** The host owns the annotation list through a function binding. */
    controlled?: boolean
    history?: boolean | undefined
    /** Records the plugin's layer teardown and cleanup. */
    log?: string[] | undefined
  } = $props()

  // Built once: a later prop change is not applied, as with InkRoot's `plugins`.
  const { plugin, marks, finish } = createTestPlugin(untrack(() => log))
  const plugins = [plugin]
  let list = $state.raw<Annotation[]>([])
</script>

{#if controlled}
  <InkRoot
    {src}
    {assets}
    {plugins}
    {history}
    bind:annotations={() => list, (next: Annotation[]) => (list = next)}
  >
    <PluginControls {marks} {finish} />
    <output data-testid="host-count">{list.length}</output>
  </InkRoot>
{:else}
  <InkRoot {src} {assets} {plugins}>
    <PluginControls {marks} {finish} />
  </InkRoot>
{/if}
