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
import { PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { computed, ref, watch } from 'vue'

import { useAnnotations } from '../composables/useAnnotations'
import { injectInkContext } from '../context'

import { useAnnotationElement } from './annotation-element'
import { keepOpenOnAnnotation, useFocusReturn } from './popover-focus'

import type { Annotation, NoteAnnotation } from '@inkbar/core'

export interface NotePopoverSlotProps {
  note: NoteAnnotation
  replies: Annotation[]
  reply: (text: string) => void
  update: (contents: string) => void
  remove: () => void
  close: () => void
}

defineSlots<{ default?(props: NotePopoverSlotProps): unknown }>()

const ctx = injectInkContext()
const { annotations, replies, add, update, remove } = useAnnotations()

const find = (id: string | undefined) =>
  id ? annotations.value.find((a) => a.id === id) : undefined

/**
 * The top of a note's thread: follows `inReplyTo` up through notes, stopping at a missing
 * parent, a parent that is not a note, or a cycle.
 */
function threadRoot(start: NoteAnnotation): NoteAnnotation {
  const seen = new Set([start.id])
  let current = start
  while (current.inReplyTo) {
    const parent = find(current.inReplyTo)
    if (parent?.type !== 'note' || seen.has(parent.id)) break
    seen.add(parent.id)
    current = parent
  }
  return current
}

const note = computed<NoteAnnotation | null>(() => {
  const a = find(ctx.activated.value ?? undefined)
  return a?.type === 'note' ? threadRoot(a) : null
})
const anchor = useAnnotationElement(
  ctx,
  computed(() => note.value?.id ?? null)
)
const focusReturn = useFocusReturn(ctx)
const open = computed(() => note.value !== null && anchor.value !== null)
/** The root, then every reply below it, depth first, each level in creation order. */
const thread = computed<Annotation[]>(() => {
  const root = note.value
  if (!root) return []
  const out: Annotation[] = [root]
  const seen = new Set([root.id])
  const visit = (id: string): void => {
    for (const r of replies(id)) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      out.push(r)
      visit(r.id)
    }
  }
  visit(root.id)
  return out
})

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
function dropIfEmpty(id: string): boolean {
  const a = find(id)
  if (a?.type !== 'note' || a.locked || a.inReplyTo || a.contents?.trim()) return false
  if (replies(id).length > 0) return false
  remove(id)
  return true
}

function reply(text: string): void {
  const root = note.value
  const contents = text.trim()
  if (!root || !contents) return
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
  return !root.locked && !root.contents?.trim() && thread.value.length === 1
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
  if (note.value && !note.value.locked) update(note.value.id, { contents })
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
