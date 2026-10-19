<script setup lang="ts">
import {
  createMemorySignatureStore,
  type DocumentSource,
  type PdfAssets,
  type SignatureStore,
  type SignatureTemplate,
} from '@inkbar/core'
import { shallowRef } from 'vue'

import InkRoot from '../../src/components/InkRoot.vue'
import InkSignatureMenu from '../../src/components/InkSignatureMenu.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkToolButton from '../../src/components/InkToolButton.vue'
import InkViewport from '../../src/components/InkViewport.vue'

import ComposableProbe from './ComposableProbe.vue'
import SignatureOptionsProbe from './SignatureOptionsProbe.vue'

const props = withDefaults(
  defineProps<{
    src: DocumentSource
    assets: PdfAssets
    initial?: SignatureTemplate[]
    fonts?: string[] | undefined
  }>(),
  { initial: () => [], fonts: undefined }
)

/** A memory store whose contents the page shows. */
const saved = shallowRef<SignatureTemplate[]>(props.initial)
const inner = createMemorySignatureStore(props.initial)
const sync = async () => {
  saved.value = await inner.list()
}
const store: SignatureStore = {
  list: () => inner.list(),
  save: async (t) => {
    await inner.save(t)
    await sync()
  },
  remove: async (id) => {
    await inner.remove(id)
    await sync()
  },
}
</script>

<template>
  <InkRoot
    :src="props.src"
    :assets="props.assets"
    :zoom="1"
    :signatures="store"
    :signature-fonts="props.fonts"
  >
    <InkToolbar>
      <InkToolButton tool="select" />
      <InkSignatureMenu />
    </InkToolbar>
    <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
    <div style="height: 600px; width: 900px">
      <InkViewport />
    </div>
    <output
      data-testid="signature-store"
      :data-count="saved.length"
      :data-ids="saved.map((t) => t.id).join(',')"
      :data-kinds="saved.map((t) => t.kind).join(',')"
    />
    <SignatureOptionsProbe />
    <ComposableProbe />
  </InkRoot>
</template>
