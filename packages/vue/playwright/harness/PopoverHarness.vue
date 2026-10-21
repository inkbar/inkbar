<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from 'vue'

import InkRoot from '../../src/components/InkRoot.vue'
import InkThreadPopover from '../../src/components/InkThreadPopover.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import type { Annotation, DocumentSource, PdfAssets } from '@inkbar/core'
import type { ToolId } from '@inkbar/core/dom'

const props = defineProps<{
  src: DocumentSource
  assets: PdfAssets
  /** The host owns the list through v-model. */
  controlled?: boolean | undefined
  /** Controlled only: apply each proposal this many ms late, like a slow host. */
  applyDelay?: number | undefined
  /** Fill annotation elements with slot content (a button). */
  customAnnotations?: boolean | undefined
  /** Replace the note popover's default content with one slot-driven Remove button. */
  customNote?: boolean | undefined
  tool?: ToolId | undefined
}>()

const list = shallowRef<Annotation[]>([])
const proposals = ref(0)

function onUpdate(next: Annotation[]): void {
  proposals.value += 1
  if (props.applyDelay === undefined) list.value = next
  else setTimeout(() => (list.value = next), props.applyDelay)
}

type HostWindow = Window & { __inkHostRemove?: ((id: string) => void) | undefined }
// Test-only: the host drops an annotation from its own list, outside any popover.
;(window as HostWindow).__inkHostRemove = (id) => {
  list.value = list.value.filter((a) => a.id !== id)
}
onBeforeUnmount(() => ((window as HostWindow).__inkHostRemove = undefined))
</script>

<template>
  <InkRoot
    :src="src"
    :assets="assets"
    :zoom="1"
    :tool="tool"
    :annotations="controlled ? list : undefined"
    @update:annotations="onUpdate"
  >
    <output data-testid="proposals">{{ proposals }}</output>
    <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
    <div style="height: 600px; width: 900px">
      <InkViewport>
        <template v-if="customAnnotations" #annotation="{ annotation }">
          <button type="button" data-testid="pin">Pin {{ annotation.type }}</button>
        </template>
      </InkViewport>
    </div>
    <InkThreadPopover v-if="customNote" v-slot="{ remove }">
      <button type="button" data-testid="custom-remove" @click="remove">Remove</button>
    </InkThreadPopover>
    <InkThreadPopover v-else />
  </InkRoot>
</template>
