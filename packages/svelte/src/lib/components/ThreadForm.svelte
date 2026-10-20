<script lang="ts">
  /** The default form: the root's own text while it is empty, replies after that. */
  let {
    editingRoot,
    locked,
    deleteLabel,
    onSubmit,
    onRemove,
    onClose,
  }: {
    editingRoot: boolean
    locked: boolean
    deleteLabel: string
    onSubmit: (text: string) => void
    onRemove: () => void
    onClose: () => void
  } = $props()

  let draft = $state('')
  function submit(e: SubmitEvent): void {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    onSubmit(text)
    draft = ''
  }
</script>

<form class="ink-thread-reply" data-ink-thread-reply="" onsubmit={submit}>
  <textarea
    bind:value={draft}
    aria-label={editingRoot ? 'Comment' : 'Reply'}
    rows="2"
    placeholder={editingRoot ? 'Comment' : 'Reply'}></textarea>
  <div class="ink-thread-actions">
    <button type="submit" disabled={!draft.trim()}
      >{editingRoot ? 'Comment' : 'Reply'}</button
    >
    {#if !locked}
      <button type="button" onclick={onRemove}>{deleteLabel}</button>
    {/if}
    <button type="button" onclick={onClose}>Close</button>
  </div>
</form>
