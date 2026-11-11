<script lang="ts">
  /* Inside InkRoot: shows how many signatures the root's library holds and saves one more. */
  import { useInkContext } from '../../lib/context.js'
  import { useReadable } from '../../lib/use-readable.svelte.js'

  const ctx = useInkContext('SignatureStorageProbe')
  const templates = useReadable(() => ctx.signatures.templates, [])

  function save(): void {
    void ctx.signatures.save({
      id: 'added',
      kind: 'ink',
      inklist: [
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      ],
      aspect: 1,
    })
  }
</script>

<output data-testid="signatures">{templates.current.length}</output>
<button type="button" data-testid="save-signature" onclick={save}>Save signature</button>
