<script lang="ts">
  import { useAnnotations } from '../../lib/hooks/useAnnotations.svelte.js'
  import { useDocument } from '../../lib/hooks/useDocument.svelte.js'

  /** Adds one note from an effect once the document is ready. */
  const doc = useDocument()
  const annotations = useAnnotations()
  let added = false
  $effect(() => {
    if (doc.isReady && !added) {
      added = true
      annotations.add({
        type: 'note',
        page: 0,
        rect: { x: 0, y: 0, width: 20, height: 20 },
      })
    }
  })
</script>
