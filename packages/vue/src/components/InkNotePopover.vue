<script setup lang="ts">
/*
 * The thread for the activated note, anchored to the note's overlay element. Activating a
 * reply opens its root's thread. Closing (Close, Escape, a press outside) clears `activated`.
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

const note = computed<NoteAnnotation | null>(() => {
  const a = find(ctx.activated.value ?? undefined)
  if (a?.type !== 'note') return null
  const root = a.inReplyTo ? find(a.inReplyTo) : a
  return root?.type === 'note' ? root : a
})
const anchor = useAnnotationElement(
  ctx,
  computed(() => note.value?.id ?? null)
)
const focusReturn = useFocusReturn(ctx)
const open = computed(() => note.value !== null && anchor.value !== null)
const thread = computed<Annotation[]>(() =>
  note.value ? [note.value, ...replies(note.value.id)] : []
)

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
function removeThread(): void {
  const root = note.value
  if (root && !root.locked) {
    focusReturn.beforeRemove(anchor.value)
    remove(root.id)
  }
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
