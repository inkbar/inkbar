<script module lang="ts">
  import type { NotePopoverSlotProps } from '@inkbar/core/dom'
  import type { Snippet } from 'svelte'

  export interface InkNotePopoverProps {
    children?: Snippet<[NotePopoverSlotProps]> | undefined
  }
</script>

<script lang="ts">
  /*
   * The thread for the activated note, anchored to the note's overlay element. Activating a
   * reply opens the whole thread from its root. Closing (Close, Escape, a press outside) clears
   * `activated`.
   *
   * A new note has no text. While its root is empty (and unlocked) the default form writes the
   * root's own `contents`, labelled "Comment", and the thread list stays hidden until there is
   * something in it; after that the form adds replies. Closing a root that is still empty and
   * has no replies removes it, so an abandoned note does not stay on the page.
   */
  import { isAbandonedNote, threadOf, threadRoot } from '@inkbar/core'
  import { Popover } from 'bits-ui'
  import { untrack } from 'svelte'

  import { useInkContext } from '../context.js'
  import { useAnnotations } from '../hooks/useAnnotations.svelte.js'

  import { useAnnotationElement } from './annotation-element.svelte.js'
  import { keepOpenOnAnnotation, useFocusReturn } from './popover-focus.js'
  import ThreadForm from './ThreadForm.svelte'

  import type { Annotation, NoteAnnotation } from '@inkbar/core'

  let { children }: InkNotePopoverProps = $props()

  const ctx = useInkContext('InkNotePopover')
  const store = useAnnotations()

  const note = $derived.by<NoteAnnotation | null>(() => {
    const a = ctx.activated
      ? store.annotations.find((x) => x.id === ctx.activated)
      : undefined
    return a?.type === 'text' ? threadRoot(store.annotations, a) : null
  })
  const anchorRef = useAnnotationElement(
    () => ctx.rootEl,
    () => note?.id ?? null
  )
  const anchor = $derived(anchorRef.current)
  const focusReturn = useFocusReturn(ctx)
  const open = $derived(note !== null && anchor !== null)
  /** The root, then every reply below it, depth first, each level in creation order. */
  const thread = $derived<Annotation[]>(note ? threadOf(store.annotations, note) : [])
  /** True while the default form writes the root note's own text rather than a reply. */
  const editingRoot = $derived(note !== null && !note.locked && !note.contents?.trim())

  /**
   * Notes this popover wrote text or a reply for. In controlled mode the write is a proposal
   * the host may not have applied yet, so the applied list still shows the note empty; these
   * are never dropped as abandoned. Bookkeeping only: nothing renders from it.
   */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const written = new Set<string>()
  /** Notes this popover has already asked to remove, so a slow host is asked once. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const dropped = new Set<string>()

  /** Removes an unlocked root note with no text and no replies. True when it did. */
  function dropIfEmpty(id: string): boolean {
    if (dropped.has(id) || written.has(id) || !isAbandonedNote(store.annotations, id))
      return false
    dropped.add(id)
    store.remove(id)
    return true
  }

  // Activation moved on from a note that never got any text: drop it.
  let previousId: string | undefined
  $effect(() => {
    const id = note?.id
    const previous = previousId
    if (previous === id) return
    previousId = id
    if (previous !== undefined) untrack(() => dropIfEmpty(previous))
  })

  function reply(text: string): void {
    const root = note
    const contents = text.trim()
    if (!root || !contents) return
    written.add(root.id)
    store.add({
      type: 'text',
      page: root.page,
      rect: root.rect,
      contents,
      inReplyTo: root.id,
    })
  }
  function isEmptyRoot(root: NoteAnnotation): boolean {
    return (
      !written.has(root.id) &&
      !root.locked &&
      !root.contents?.trim() &&
      thread.length === 1
    )
  }
  function close(): void {
    const root = note
    if (root && store.annotations.some((a) => a.id === root.id) && isEmptyRoot(root)) {
      focusReturn.beforeRemove(anchor)
      dropIfEmpty(root.id)
    }
    ctx.setActivated(null)
  }
  function updateContents(contents: string): void {
    if (!note || note.locked) return
    if (contents.trim()) written.add(note.id)
    store.update(note.id, { contents })
  }
  /** Locked notes cannot be removed: removing one does nothing and keeps the popover. */
  function removeThread(): void {
    const root = note
    if (!root || root.locked) return
    focusReturn.beforeRemove(anchor)
    // Under a slow controlled host the note stays listed for a while; it is not asked for again.
    dropped.add(root.id)
    store.remove(root.id)
    ctx.setActivated(null)
  }
  function onOpenChange(next: boolean): void {
    if (!next) close()
  }
</script>

<Popover.Root bind:open={() => open, onOpenChange}>
  <Popover.Portal>
    {#if note && anchor}
      <Popover.Content
        class="ink-note-popover"
        data-ink-note-popover=""
        role="dialog"
        side="right"
        sideOffset={8}
        collisionPadding={8}
        aria-label="Note thread"
        customAnchor={anchor}
        onInteractOutside={keepOpenOnAnnotation}
        onOpenAutoFocus={focusReturn.onOpenAutoFocus}
        onCloseAutoFocus={(e) => focusReturn.onCloseAutoFocus(e, anchor)}
      >
        {#if children}
          {@render children({
            note,
            replies: thread.slice(1),
            reply,
            update: updateContents,
            remove: removeThread,
            close,
          })}
        {:else}
          {#if !editingRoot || thread.length > 1}
            <ol class="ink-thread" data-ink-thread="">
              {#each thread as item (item.id)}
                <li
                  class="ink-thread-item"
                  data-ink-thread-item=""
                  data-reply={item.inReplyTo ? '' : undefined}
                >
                  <span class="ink-thread-author">{item.author ?? 'Anonymous'}</span>
                  <time class="ink-thread-time" datetime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString()}
                  </time>
                  <p class="ink-thread-text">{item.contents}</p>
                </li>
              {/each}
            </ol>
          {/if}
          <!-- Keyed by note: moving to another note starts with an empty draft at once. -->
          {#key note.id}
            <ThreadForm
              {editingRoot}
              locked={!!note.locked}
              onSubmit={(text) => (editingRoot ? updateContents(text) : reply(text))}
              onRemove={removeThread}
              onClose={close}
            />
          {/key}
        {/if}
      </Popover.Content>
    {/if}
  </Popover.Portal>
</Popover.Root>
