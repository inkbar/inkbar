<script lang="ts">
  /* The records hooks over the suggestions, with a select and an add through them. */
  import { useRecords } from '../../lib/hooks/useRecords.svelte.js'
  import { useRecordSelection } from '../../lib/hooks/useRecordSelection.svelte.js'

  import type { Suggestion } from './suggestions-plugin.js'

  const records = useRecords<Suggestion>('sandbox.suggestions')
  const selection = useRecordSelection('sandbox.suggestions')
  // What initialisation saw: the plugins are set up only once the root has mounted.
  const first = `${records.handle !== null}/${records.records.length}/${selection.selected}`
  const open = $derived(records.records.filter((s) => s.status === 'open').length)
</script>

<output data-testid="first">{first}</output>
<output data-testid="ready">{String(records.handle !== null)}</output>
<output data-testid="open-count">{open}</output>
<output data-testid="selected">{selection.selected ?? 'none'}</output>
<button type="button" data-testid="select-s2" onclick={() => selection.select('s2')}>
  Select s2
</button>
<button
  type="button"
  data-testid="add-s9"
  onclick={() =>
    records.handle?.add({
      id: 's9',
      page: 0,
      rect: { x: 72, y: 500, width: 120, height: 14 },
      reason: 'Suggestion 9',
      status: 'open',
    })}
>
  Add s9
</button>
