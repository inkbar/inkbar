<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'

  import type { DocumentSource, InkError, PdfAssets } from '@inkbar/core'

  let {
    src,
    assets,
    password,
    bytesFrom,
  }: {
    src: DocumentSource | null
    assets: PdfAssets
    password?: string | undefined
    /** Fetches this URL in the page and passes the bytes as the source, one array for every open. */
    bytesFrom?: string | undefined
  } = $props()

  // The test reads error codes from the DOM, as the React suite does.
  let codes = $state<string[]>([])
  let bytes = $state.raw<Uint8Array | null>(null)
  let byteLength = $state<number | null>(null)

  $effect(() => {
    const url = bytesFrom
    if (url === undefined) return
    let cancelled = false
    void fetch(url)
      .then((res) => res.arrayBuffer())
      .then((buf) => {
        if (!cancelled) bytes = new Uint8Array(buf)
      })
    return () => {
      cancelled = true
    }
  })
</script>

<InkRoot
  src={bytesFrom === undefined ? src : bytes}
  {assets}
  {password}
  onError={(e: InkError) => {
    codes = [...codes, e.code]
    byteLength = bytes?.byteLength ?? null
  }}
  onReady={() => (byteLength = bytes?.byteLength ?? null)}
>
  <output data-testid="error-codes">{codes.join(',')}</output>
  <output data-testid="byte-length">{byteLength ?? ''}</output>
</InkRoot>
