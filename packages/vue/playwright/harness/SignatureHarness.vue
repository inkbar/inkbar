<script setup lang="ts">
import {
  createMemoryStorage,
  type DocumentSource,
  type InkStorage,
  type PdfAssets,
  type SignatureTemplate,
} from '@inkbar/core'
import { allTools } from '@inkbar/core/dom'
import { ref, shallowRef } from 'vue'

import InkRoot from '../../src/components/InkRoot.vue'
import InkSignatureDialog from '../../src/components/InkSignatureDialog.vue'
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
    /** Storage refuses every save, as a full one would. */
    failSave?: boolean
    /** Storage refuses every removal. */
    failRemove?: boolean
    /** No tools: a plain button opens the dialog in place of the menu. */
    bare?: boolean
  }>(),
  { initial: () => [], fonts: undefined, failSave: false, failRemove: false, bare: false }
)
const tools = allTools()
const dialog = ref(false)

/** A memory storage whose templates the page shows. */
const saved = shallowRef<SignatureTemplate[]>(props.initial)
const inner = createMemoryStorage({ signatures: props.initial })
const read = async () => ((await inner.get('signatures')) ?? []) as SignatureTemplate[]
const storage: InkStorage = {
  get: (key) => inner.get(key),
  set: async (key, value) => {
    if (key === 'signatures') {
      const before = await read()
      const after = value as SignatureTemplate[]
      if (props.failSave && after.length > before.length) throw new Error('full')
      if (props.failRemove && after.length < before.length) throw new Error('full')
      await inner.set(key, value)
      saved.value = await read()
      return
    }
    await inner.set(key, value)
  },
  remove: (key) => inner.remove(key),
}
</script>

<template>
  <InkRoot
    :src="props.src"
    :assets="props.assets"
    :zoom="1"
    :storage="storage"
    :signature-fonts="props.fonts"
    :tools="props.bare ? undefined : tools"
  >
    <InkToolbar>
      <InkToolButton tool="select" />
      <button v-if="props.bare" type="button" @click="dialog = true">Open dialog</button>
      <InkSignatureMenu v-else />
    </InkToolbar>
    <InkSignatureDialog v-if="props.bare" v-model:open="dialog" />
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
    <SignatureOptionsProbe v-if="!props.bare" />
    <ComposableProbe />
  </InkRoot>
</template>
