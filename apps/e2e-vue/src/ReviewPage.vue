<script setup lang="ts">
/*
 * Mirrors a host integration: a signed URL whose signature changes while the document key
 * does not, and annotations owned by the host through v-model and synced to a server.
 */
import {
  AnnotationSchema,
  GLOSS_FORMAT,
  GLOSS_VERSION,
  type Annotation,
  type DocumentSource,
  type InkDocument,
} from '@inkbar/core'
import { createFakeServer } from '@inkbar/e2e-shared/fake-server'
import { recordReady } from '@inkbar/e2e-shared/metrics'
import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import {
  InkNextPage,
  InkThreadPopover,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRoot,
  InkToolbar,
  InkToolButton,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
} from '@inkbar/vue'
import { assets } from 'virtual:inkbar-assets'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'

import EmbeddedBanner from './EmbeddedBanner.vue'

import type { ToolId } from '@inkbar/core/dom'

const props = defineProps<{ fixture: string; largePages: number }>()

/** Saves wait this long after the last change, so a drag or a burst of edits saves once. */
const SAVE_DEBOUNCE_MS = 150

const server = createFakeServer({ latency: 150 })
const version = ref(1)
const signature = ref(1)
const annotations = ref<Annotation[]>([])
const status = ref('loading')
const readyCount = ref(0)
const document = shallowRef<InkDocument | null>(null)
const root = useTemplateRef<InstanceType<typeof InkRoot>>('root')
const largeBytes = shallowRef<Uint8Array | null>(null)
/** The key whose saved annotations have been loaded; saving waits for it. */
const loadedKey = ref<string | null>(null)
/** The toolbar stays inert, and the tool at view, until the current key has loaded. */
const failed = ref(false)
const loading = computed(
  () => !failed.value && (loadedKey.value === null || loadedKey.value !== key.value)
)
const tool = ref<ToolId>('select-text')

const key = computed(() =>
  props.largePages > 0
    ? `large-${props.largePages}:v${version.value}`
    : `case-1:v${version.value}`
)
const src = computed<DocumentSource | null>(() => {
  if (props.largePages > 0)
    return largeBytes.value ? { data: largeBytes.value, key: key.value } : null
  const url = `${fixtureUrl(props.fixture as FixtureName)}?sig=${signature.value}`
  return { url, key: key.value }
})

if (props.largePages > 0) {
  status.value = `generating ${props.largePages} pages`
  // pdf-lib loads only for the performance check.
  void import('@inkbar/fixtures/generate-large')
    .then(({ generateLarge }) => generateLarge(props.largePages))
    .then((bytes) => (largeBytes.value = bytes))
}

function knownAnnotations(items: readonly unknown[]): Annotation[] {
  return items.flatMap((item) => {
    const parsed = AnnotationSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

async function onReady(doc: InkDocument): Promise<void> {
  const count = import.meta.env.DEV ? recordReady() : readyCount.value + 1
  readyCount.value = count
  document.value = doc
  const forKey = doc.key
  const saved = await server.load(forKey)
  if (document.value !== doc) return
  if (saved) {
    annotations.value = knownAnnotations(saved.annotations)
    // Undo history records every change to the list. Loading is not the reader's change, so
    // once the history has seen it, clear it: undo right after opening must not empty the list.
    await nextTick()
    root.value?.history.clear()
  }
  loadedKey.value = forKey
  status.value = 'ready'
}

function onError(): void {
  failed.value = true
  document.value = null
  status.value = 'error'
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
/** The save that the debounce is still holding back, if any. */
let pendingSave: (() => Promise<void>) | undefined
/** Saves that have started and not yet been stored. */
const inFlight = new Set<Promise<void>>()

/** Starts the held-back save now and resolves once it and any save in flight are stored. */
async function flushSave(): Promise<void> {
  clearTimeout(saveTimer)
  const run = pendingSave
  pendingSave = undefined
  if (run) {
    const saving = run()
    inFlight.add(saving)
    void saving.finally(() => inFlight.delete(saving))
  }
  await Promise.all(inFlight)
}

watch(annotations, (list) => {
  const forKey = loadedKey.value
  if (forKey === null || forKey !== key.value) return
  clearTimeout(saveTimer)
  status.value = 'saving'
  pendingSave = () =>
    server
      .save(forKey, {
        format: GLOSS_FORMAT,
        version: GLOSS_VERSION,
        documentKey: forKey,
        annotations: JSON.parse(JSON.stringify(list)) as Annotation[],
      })
      .then(() => {
        if (loadedKey.value === forKey) status.value = 'saved'
      })
  saveTimer = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS)
})
onBeforeUnmount(() => clearTimeout(saveTimer))

/** A new signature for the same file: the key is unchanged, so nothing reloads. */
function resign(): void {
  signature.value++
}

/** A new version of the file: a new key, so the viewer reloads and starts from the server. */
async function newVersion(): Promise<void> {
  // Inert from here on. An edit still inside the debounce window belongs to the old key:
  // wait until it is stored before the key changes.
  loadedKey.value = null
  await flushSave()
  failed.value = false
  tool.value = 'select-text'
  document.value = null
  annotations.value = []
  status.value = 'loading'
  version.value++
}
</script>

<template>
  <InkRoot
    ref="root"
    v-model:annotations="annotations"
    v-model:tool="tool"
    :history="true"
    :src="src"
    :assets="assets"
    class="sandbox-root"
    @ready="onReady"
    @error="onError"
  >
    <div :inert="loading" data-testid="toolbar-gate">
      <InkToolbar>
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
        <InkToolButton tool="highlight" />
        <InkToolButton tool="redact-area" />
        <InkToolButton tool="note" />
        <div class="sandbox-actions" role="group" aria-label="Review">
          <button type="button" data-testid="resign" @click="resign">Re-sign</button>
          <button type="button" data-testid="new-version" @click="newVersion">
            New version
          </button>
        </div>
      </InkToolbar>
    </div>
    <EmbeddedBanner />
    <div :inert="loading" class="sandbox-editor" data-testid="editor-gate">
      <InkViewport />
      <InkToolbar label="Page and zoom">
        <InkPrevPage />
        <InkPageInput />
        <InkPageCount />
        <InkNextPage />
        <InkZoomOut />
        <InkZoomSelect />
        <InkZoomIn />
      </InkToolbar>
      <InkThreadPopover />
    </div>
    <p
      class="sandbox-status"
      role="status"
      data-testid="status"
      :data-ready-count="readyCount"
      :data-version="version"
      :data-signature="signature"
    >
      {{ status }} · {{ annotations.length }} annotation{{
        annotations.length === 1 ? '' : 's'
      }}
    </p>
  </InkRoot>
</template>
