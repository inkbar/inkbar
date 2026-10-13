<script setup lang="ts">
/*
 * The thread for the activated note, anchored to the note's overlay element. Activating a
 * reply opens the whole thread from its root. Closing (Close, Escape, a press outside) clears `activated`.
 *
 * A new note has no text. While its root is empty (and unlocked) the default form writes the
 * root's own `contents`, labelled "Comment", and the thread list stays hidden until there is
 * something in it; after that the form adds replies. Closing a root that is still empty and
 * has no replies removes it, so an abandoned note does not stay on the page.
 */
import { isAbandonedNote, threadOf, threadRoot } from '@inkbar/core'
import { PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { computed, ref, watch } from 'vue'

import { useAnnotations } from '../composables/useAnnotations'
import { injectInkContext } from '../context'

import { useAnnotationElement } from './annotation-element'
import { keepOpenOnAnnotation, useFocusReturn } from './popover-focus'

import type { Annotation, NoteAnnotation } from '@inkbar/core'
import type { NotePopoverSlotProps } from '@inkbar/core/dom'

export type { NotePopoverSlotProps } from '@inkbar/core/dom'

defineSlots<{ default?(props: NotePopoverSlotProps): unknown }>()

const ctx = injectInkContext()
const { annotations, add, update, remove } = useAnnotations()

const find = (id: string | undefined) =>
  id ? annotations.value.find((a) => a.id === id) : undefined

const note = computed<NoteAnnotation | null>(() => {
  const a = find(ctx.activated.value ?? undefined)
  return a?.type === 'note' ? threadRoot(annotations.value, a) : null
})
const anchor = useAnnotationElement(
  ctx,
  computed(() => note.value?.id ?? null)
)
const focusReturn = useFocusReturn(ctx)
const open = computed(() => note.value !== null && anchor.value !== null)
const thread = computed<Annotation[]>(() =>
  note.value ? threadOf(annotations.value, note.value) : []
)

/** True while the default form writes the root note's own text rather than a reply. */
const editingRoot = computed(() => {
  const root = note.value
  return root !== null && !root.locked && !root.contents?.trim()
})

const draft = ref('')
watch(
  () => note.value?.id,
  (_next, previous) => {
    draft.value = ''
    // Activation moved on from a note that never got any text: drop it.
    if (previous !== undefined) dropIfEmpty(previous)
  }
)

/** Removes an unlocked root note with no text and no replies. True when it did. */
/**
 * Notes this popover wrote text or a reply for. In controlled mode the write is a proposal
 * the host may not have applied yet, so the applied list still shows the note empty; these
 * are never dropped as abandoned.
 */
const written = new Set<string>()

function dropIfEmpty(id: string): boolean {
  if (written.has(id) || !isAbandonedNote(annotations.value, id)) return false
  remove(id)
  return true
}

function reply(text: string): void {
  const root = note.value
  const contents = text.trim()
  if (!root || !contents) return
  written.add(root.id)
  add({ type: 'note', page: root.page, rect: root.rect, contents, inReplyTo: root.id })
  draft.value = ''
}
function close(): void {
  const root = note.value
  if (root && find(root.id) && isEmptyRoot(root)) {
    focusReturn.beforeRemove(anchor.value)
    dropIfEmpty(root.id)
  }
  ctx.setActivated(null)
}
function isEmptyRoot(root: NoteAnnotation): boolean {
  return (
    !written.has(root.id) &&
    !root.locked &&
    !root.contents?.trim() &&
    thread.value.length === 1
  )
}
function submit(): void {
  const text = draft.value.trim()
  if (!text) return
  if (editingRoot.value) {
    updateContents(text)
    draft.value = ''
  } else reply(text)
}
/** Locked notes cannot be removed: removing one does nothing and keeps the popover. */
function removeThread(): void {
  const root = note.value
  if (!root || root.locked) return
  focusReturn.beforeRemove(anchor.value)
  remove(root.id)
  // Not `close()`: under a slow controlled host the note is still listed, and close would
  // try to drop it a second time.
  ctx.setActivated(null)
}
function updateContents(contents: string): void {
  if (!note.value || note.value.locked) return
  if (contents.trim()) written.add(note.value.id)
  update(note.value.id, { contents })
}
function onOpenChange(next: boolean): void {
  if (!next) close()
}
</script>

<template>
  <PopoverRoot :open="open" @update:open="onOpenChange">
    <PopoverPortal>
      <PopoverContent
        v-if="note && anchor"
        :reference="anchor"
        class="ink-note-popover"
        data-ink-note-popover
        side="right"
        :side-offset="8"
        :collision-padding="8"
        v-bind="{ 'aria-label': 'Note thread' }"
        @interact-outside="keepOpenOnAnnotation"
        @close-auto-focus="focusReturn.onCloseAutoFocus($event, anchor)"
      >
        <slot
          :note="note"
          :replies="thread.slice(1)"
          :reply="reply"
          :update="updateContents"
          :remove="removeThread"
          :close="close"
        >
          <ol v-if="!editingRoot || thread.length > 1" class="ink-thread" data-ink-thread>
            <li
              v-for="item in thread"
              :key="item.id"
              class="ink-thread-item"
              data-ink-thread-item
              :data-reply="item.inReplyTo ? '' : undefined"
            >
              <span class="ink-thread-author">{{ item.author ?? 'Anonymous' }}</span>
              <time class="ink-thread-time" :datetime="item.createdAt">
                {{ new Date(item.createdAt).toLocaleString() }}
              </time>
              <p class="ink-thread-text">{{ item.contents }}</p>
            </li>
          </ol>
          <form class="ink-thread-reply" data-ink-thread-reply @submit.prevent="submit">
            <textarea
              v-model="draft"
              :aria-label="editingRoot ? 'Comment' : 'Reply'"
              rows="2"
              :placeholder="editingRoot ? 'Comment' : 'Reply'"
            />
            <div class="ink-thread-actions">
              <button type="submit" :disabled="!draft.trim()">
                {{ editingRoot ? 'Comment' : 'Reply' }}
              </button>
              <button v-if="!note.locked" type="button" @click="removeThread">
                Delete
              </button>
              <button type="button" @click="close">Close</button>
            </div>
          </form>
        </slot>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
