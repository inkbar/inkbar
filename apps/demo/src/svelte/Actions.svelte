<script lang="ts">
  /* Hooks only work inside InkRoot, so these controls are their own component. */
  import { useAnnotations, useDocument, useHistory } from '@inkbar/svelte'

  import { suggestionCount, suggestRedactions } from '../shared/suggest'

  const doc = useDocument()
  const annotations = useAnnotations()
  const history = useHistory()
  let busy = $state(false)
  let result = $state('')

  async function suggest() {
    const current = doc.document
    if (!current) return
    busy = true
    try {
      const found = await suggestRedactions(current, annotations.annotations)
      for (const input of found) annotations.add(input)
      result = suggestionCount(found.length)
    } finally {
      busy = false
    }
  }
</script>

<div class="demo-actions" role="group" aria-label="Edit">
  <button type="button" disabled={!history.canUndo} onclick={() => history.undo()}>
    Undo
  </button>
  <button type="button" disabled={!history.canRedo} onclick={() => history.redo()}>
    Redo
  </button>
  <button type="button" disabled={!doc.isReady || busy} onclick={suggest}>
    Suggest redactions
  </button>
  <span class="demo-result" role="status">{result}</span>
</div>
