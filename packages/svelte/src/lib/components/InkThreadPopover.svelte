<script module lang="ts">
  import type { ThreadPopoverSlotProps } from '@inkbar/core/dom'
  import type { Snippet } from 'svelte'

  export interface InkThreadPopoverProps {
    children?: Snippet<[ThreadPopoverSlotProps]> | undefined
  }
</script>

<script lang="ts">
  /*
   * The thread for the activated note or text markup, anchored to the root's overlay
   * element. Activating a reply opens the whole thread from its root. Closing (Close, Escape,
   * a press outside) clears `activated`.
   *
   * A new note, or a highlight, has no text. While its root is empty (and unlocked) the
   * default form writes the root's own `contents`, labelled "Comment", and the thread list
   * stays hidden until there is something in it; after that the form adds replies. Closing a
   * note that is still empty and has no replies removes it, so an abandoned note does not stay
   * on the page. Markup stays: the mark is the point.
   */
  import { isAbandonedNote, threadOf, threadRoot } from '@inkbar/core'
  import { threadDeleteLabel, threadPopoverLabel } from '@inkbar/core/dom'
  import { Popover } from 'bits-ui'
  import { untrack } from 'svelte'

  import { useInkContext } from '../context.js'
  import { useAnnotations } from '../hooks/useAnnotations.svelte.js'

  import { useAnnotationElement } from './annotation-element.svelte.js'
  import { keepOpenOnAnnotation, useFocusReturn } from './popover-focus.js'
  import ThreadForm from './ThreadForm.svelte'

  import type { Annotation, ThreadRoot } from '@inkbar/core'

  let { children }: InkThreadPopoverProps = $props()

  const ctx = useInkContext('InkThreadPopover')
  const store = useAnnotations()

  const note = $derived.by<ThreadRoot | null>(() => {
    const a = ctx.activated
      ? store.annotations.find((x) => x.id === ctx.activated)
      : undefined
    return a ? threadRoot(store.annotations, a) : null
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
  /** True while the default form writes the root's own text rather than a reply. */
  const editingRoot = $derived(note !== null && !note.locked && !note.contents?.trim())

  /**
   * Roots this popover wrote text or a reply for. In controlled mode the write is a proposal
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
    const a = store.annotations.find((x) => x.id === id)
    if (
      !a ||
      dropped.has(id) ||
      written.has(id) ||
      !isAbandonedNote(a, store.annotations)
    )
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
  /** A note that closing now would remove. */
  function isEmptyRoot(root: ThreadRoot): boolean {
    return !written.has(root.id) && isAbandonedNote(root, store.annotations)
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
  /** Locked roots cannot be removed: removing one does nothing and keeps the popover. */
  function removeThread(): void {
    const root = note
    if (!root || root.locked) return
    focusReturn.beforeRemove(anchor)
    // Under a slow controlled host the root stays listed for a while; it is not asked for again.
    dropped.add(root.id)
    store.remove(root.id)
    ctx.setActivated(null)
  }
  function onOpenChange(next: boolean): void {
    if (!next) close()
  }
</script>

<svelte:document
  onpointerdowncapture={(e) =>
    open && focusReturn.onPressOutside(e, '[data-ink-thread-popover]', close)}
  onpointerup={focusReturn.onPressEnd}
  onpointercancel={focusReturn.onPressEnd}
/>

<Popover.Root bind:open={() => open, onOpenChange}>
  <Popover.Portal>
    {#if note && anchor}
      <Popover.Content
        class="ink-thread-popover"
        data-ink-thread-popover=""
        role="dialog"
        side="right"
        sideOffset={8}
        collisionPadding={8}
        aria-label={threadPopoverLabel(note)}
        customAnchor={anchor}
        onInteractOutside={keepOpenOnAnnotation}
        onOpenAutoFocus={focusReturn.onOpenAutoFocus}
        onCloseAutoFocus={(e) => focusReturn.onCloseAutoFocus(e, anchor)}
      >
        {#if children}
          {@render children({
            root: note,
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
          <!-- Keyed by root: moving to another thread starts with an empty draft at once. -->
          {#key note.id}
            <ThreadForm
              {editingRoot}
              locked={!!note.locked}
              deleteLabel={threadDeleteLabel(note)}
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
