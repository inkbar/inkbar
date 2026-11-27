<script lang="ts">
  /*
   * The right sidebar. Suggestions lists the plugin's open suggestions as the cards their marks
   * open. Accepted is your own component on useRecords: Undo accept puts a suggestion back up
   * for review and removes its redaction, in one undo step. The sidebar opens Suggestions when
   * the Suggest command finishes. It sits inside InkRoot to reach the records and the command.
   */
  import { Check, SquareDashed } from '@inkbar/icons'
  import {
    InkPanel,
    InkRecordList,
    InkSidebar,
    useAnnotations,
    useCommand,
    useRecords,
  } from '@inkbar/svelte'

  import { acceptedFrom, type Suggestion } from '../../plugin/suggestions'

  import type { ScenarioLabels } from '../../shared/strings/types'
  import type { SidebarOpen } from '@inkbar/core/dom'

  let { labels }: { labels: ScenarioLabels } = $props()

  const suggestions = useRecords<Suggestion>('sandbox.suggestions')
  const annotations = useAnnotations()
  const command = useCommand('sandbox.suggest')

  /** Closed until Suggest has something to show. */
  let open = $state<SidebarOpen>(null)
  let wasBusy = false
  $effect(() => {
    const busy = command.busy
    if (wasBusy && !busy) open = 'suggestions'
    wasBusy = busy
  })

  const openCount = $derived(
    suggestions.records.filter((s) => s.status === 'suggested').length
  )
  const accepted = $derived(suggestions.records.filter((s) => s.status === 'accepted'))

  function undoAccept(suggestion: Suggestion): void {
    const records = suggestions.handle
    records?.batch(() => {
      records.update(suggestion.id, { status: 'suggested' })
      for (const a of annotations.annotations)
        if (acceptedFrom(a) === suggestion.id) annotations.remove(a.id)
    })
  }
</script>

<InkSidebar name="redactions-right" side="right" layout="rail" bind:open>
  <InkPanel
    id="suggestions"
    label={labels.suggestions}
    icon={SquareDashed}
    badge={openCount}
  >
    <InkRecordList records="sandbox.suggestions" />
  </InkPanel>
  <InkPanel id="accepted" label={labels.accepted} icon={Check}>
    <div class="accepted">
      {#if accepted.length > 0}
        <ul>
          {#each accepted as s (s.id)}
            <li>
              <span class="accepted-reason">{labels.plugin.reasons[s.kind]}</span>
              <span class="accepted-meta">
                {labels.acceptedAt({ text: s.text, page: s.page + 1 })}
              </span>
              <button type="button" onclick={() => undoAccept(s)}
                >{labels.undoAccept}</button
              >
            </li>
          {/each}
        </ul>
      {:else}
        <p class="accepted-empty">{labels.nothingAccepted}</p>
      {/if}
    </div>
  </InkPanel>
</InkSidebar>
