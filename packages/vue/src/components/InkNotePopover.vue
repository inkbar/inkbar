<script setup lang="ts">
/*
 * The thread for the activated note, anchored to the note's overlay element. Activating a
 * reply opens the whole thread from its root. Closing (Close, Escape, a press outside) clears `activated`.
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

const draft = ref('')
watch(
  () => note.value?.id,
  () => (draft.value = '')
)

function reply(text: string): void {
  const root = note.value
  const contents = text.trim()
  if (!root || !contents) return
  add({ type: 'note', page: root.page, rect: root.rect, contents, inReplyTo: root.id })
  draft.value = ''
}
function close(): void {
  ctx.setActivated(null)
}
/** Locked notes cannot be removed: removing one does nothing and keeps the popover. */
function removeThread(): void {
  const root = note.value
  if (!root || root.locked) return
  focusReturn.beforeRemove(anchor.value)
  remove(root.id)
  close()
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
          <ol class="ink-thread" data-ink-thread>
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
          <form
            class="ink-thread-reply"
            data-ink-thread-reply
            @submit.prevent="reply(draft)"
          >
            <textarea v-model="draft" aria-label="Reply" rows="2" placeholder="Reply" />
            <div class="ink-thread-actions">
              <button type="submit" :disabled="!draft.trim()">Reply</button>
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
