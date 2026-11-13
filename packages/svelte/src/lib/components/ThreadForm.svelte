<script lang="ts">
  /** The default form: the root's own text while it is empty, replies after that. */
  import { useMessages } from '../messages.js'

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

  const m = useMessages()
  const action = $derived(editingRoot ? m.current.notes.comment : m.current.notes.reply)

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
  <textarea bind:value={draft} aria-label={action} rows="2" placeholder={action}
  ></textarea>
  <div class="ink-thread-actions">
    <button type="submit" disabled={!draft.trim()}>{action}</button>
    {#if !locked}
      <button type="button" onclick={onRemove}>{deleteLabel}</button>
    {/if}
    <button type="button" onclick={onClose}>{m.current.notes.close}</button>
  </div>
</form>
