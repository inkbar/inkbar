<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import type { DocumentSource, InkError, PdfAssets } from '@inkbar/core'

  let {
    src,
    assets,
    password,
    passwordPrompt,
    customLocked = false,
  }: {
    src: DocumentSource | null
    assets: PdfAssets
    password?: string | undefined
    passwordPrompt?: boolean | undefined
    /** Renders the viewport's `locked` snippet with a button that calls `promptPassword`. */
    customLocked?: boolean
  } = $props()

  // The test reads error codes from the DOM, as the React suite does.
  let codes = $state<string[]>([])
</script>

<InkRoot
  {src}
  {assets}
  {password}
  {passwordPrompt}
  onError={(e: InkError) => (codes = [...codes, e.code])}
>
  {#snippet children({ status })}
    <output data-testid="status">
      {status.state === 'locked' ? `locked:${status.incorrect}` : status.state}
    </output>
    <output data-testid="error-codes">{codes.join(',')}</output>
    <div style="height: 700px; width: 900px">
      {#if customLocked}
        <InkViewport>
          {#snippet locked({ incorrect, promptPassword })}
            <button type="button" data-testid="custom-unlock" onclick={promptPassword}>
              Custom unlock {incorrect ? 'again' : ''}
            </button>
          {/snippet}
        </InkViewport>
      {:else}
        <InkViewport />
      {/if}
    </div>
  {/snippet}
</InkRoot>
