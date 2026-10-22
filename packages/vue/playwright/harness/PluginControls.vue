<script setup lang="ts">
import InkCommand from '../../src/components/InkCommand.vue'
import InkRedo from '../../src/components/InkRedo.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkToolButton from '../../src/components/InkToolButton.vue'
import InkUndo from '../../src/components/InkUndo.vue'
import InkViewport from '../../src/components/InkViewport.vue'
import { useAnnotations } from '../../src/composables/useAnnotations'
import { useCommand } from '../../src/composables/useCommand'
import { useHistory } from '../../src/composables/useHistory'
import { useReadable } from '../../src/use-readable'

import type { Mark } from './test-plugin'
import type { Readable, RecordStore } from '@inkbar/core'

const props = defineProps<{ marks: () => Readable<RecordStore<Mark> | null> }>()
const emit = defineEmits<{ finish: [] }>()

const { annotations, remove } = useAnnotations()
const { canUndo } = useHistory()
const store = useReadable(() => props.marks(), null)
const list = useReadable(() => store.value?.list, [])
const accept = useCommand('sandbox.accept')

function removeRedaction(): void {
  const id = list.value.find((m) => m.id === 'm1')?.annotationId
  if (id) remove(id)
}
</script>

<template>
  <InkToolbar>
    <InkCommand id="sandbox.accept" />
    <InkCommand id="sandbox.work" />
    <InkToolButton tool="sandbox.stamp" />
    <InkUndo />
    <InkRedo />
  </InkToolbar>
  <div style="height: 600px; width: 900px"><InkViewport /></div>
  <div
    data-testid="probe"
    :data-annotations="annotations.length"
    :data-marks="list.map((m) => m.status).join(',')"
    :data-can-undo="canUndo"
    :data-accept-enabled="accept.enabled.value"
    :data-accept-label="accept.label.value"
  >
    <button data-testid="remove" @click="removeRedaction">remove</button>
    <button data-testid="finish" @click="emit('finish')">finish</button>
  </div>
</template>
