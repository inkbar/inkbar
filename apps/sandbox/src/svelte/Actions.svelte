<script lang="ts">
  /* Hooks only work inside InkRoot, so these controls are their own component. */
  import { isInkError } from '@inkbar/core'
  import { useAnnotations, useDocument, useHistory } from '@inkbar/svelte'

  import { exposeDocument } from '../shared/e2e-hook'
  import { suggestionCount, suggestRedactions } from '../shared/suggest'

  const doc = useDocument()
  const annotations = useAnnotations()
  const history = useHistory()
  let busy = $state(false)
  let result = $state('')

  $effect(() => {
    exposeDocument(doc.document)
    return () => exposeDocument(null)
  })

  async function suggest() {
    const current = doc.document
    if (!current) return
    busy = true
    try {
      const found = await suggestRedactions(current, annotations.annotations)
      history.batch(() => {
        for (const input of found) annotations.add(input)
      })
      result = suggestionCount(found.length)
    } catch (e) {
      // Opening another file mid-run destroys the document; that is not a failure.
      if (!(isInkError(e) && e.code === 'DocumentDestroyed'))
        result = 'Could not check this document.'
    } finally {
      busy = false
    }
  }
</script>

<div class="demo-actions" role="group" aria-label="Suggest">
  <button type="button" disabled={!doc.isReady || busy} onclick={suggest}>
    Suggest redactions
  </button>
  <span class="demo-result" role="status">{result}</span>
</div>
