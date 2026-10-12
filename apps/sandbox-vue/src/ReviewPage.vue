<script setup lang="ts">
/*
 * Mirrors a host integration: a signed URL whose signature changes while the document key
 * does not, annotations owned by the host through v-model and synced to a server, and
 * suggested redactions that the reader accepts or dismisses.
 */
import {
  ANNOTATION_FORMAT,
  ANNOTATION_VERSION,
  AnnotationSchema,
  type Annotation,
  type DocumentSource,
  type InkDocument,
} from '@inkbar/core'
import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import {
  DefaultToolbar,
  InkNotePopover,
  InkRoot,
  InkSuggestionCard,
  InkViewport,
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
import { createFakeServer } from './fake-server'
import { recordReady } from './metrics'

const props = defineProps<{ fixture: string; largePages: number }>()

/** Saves wait this long after the last change, so a drag or a burst of edits saves once. */
const SAVE_DEBOUNCE_MS = 150

const server = createFakeServer({ latency: 150 })
const version = ref(1)
const signature = ref(1)
const annotations = ref<Annotation[]>([])
const status = ref('loading')
const readyCount = ref(0)
/** Outcome of the last suggestion run, announced apart from the sync status. */
const suggestResult = ref('')
const document = shallowRef<InkDocument | null>(null)
const root = useTemplateRef<InstanceType<typeof InkRoot>>('root')
const largeBytes = shallowRef<Uint8Array | null>(null)
/** The key whose saved annotations have been loaded; saving waits for it. */
const loadedKey = ref<string | null>(null)

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
  document.value = null
  status.value = 'error'
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
watch(annotations, (list) => {
  const forKey = loadedKey.value
  if (forKey === null || forKey !== key.value) return
  clearTimeout(saveTimer)
  status.value = 'saving'
  saveTimer = setTimeout(() => {
    void server
      .save(forKey, {
        format: ANNOTATION_FORMAT,
        version: ANNOTATION_VERSION,
        documentKey: forKey,
        annotations: JSON.parse(JSON.stringify(list)) as Annotation[],
      })
      .then(() => {
        if (loadedKey.value === forKey) status.value = 'saved'
      })
  }, SAVE_DEBOUNCE_MS)
})
onBeforeUnmount(() => clearTimeout(saveTimer))

async function suggest(): Promise<void> {
  const doc = document.value
  if (!doc) return
  suggestResult.value = 'Looking for personal data…'
  const inputs = await server.suggest(doc)
  if (document.value !== doc) return
  // In controlled mode each add is a proposal; proposals in one tick compose into one list.
  for (const input of inputs) doc.annotations.add(input)
  suggestResult.value = `${inputs.length} suggested redaction${inputs.length === 1 ? '' : 's'}`
}

/** A new signature for the same file: the key is unchanged, so nothing reloads. */
function resign(): void {
  signature.value++
}

/** A new version of the file: a new key, so the viewer reloads and starts from the server. */
function newVersion(): void {
  clearTimeout(saveTimer)
  loadedKey.value = null
  document.value = null
  annotations.value = []
  suggestResult.value = ''
  status.value = 'loading'
  version.value++
}
</script>

<template>
  <InkRoot
    ref="root"
    v-model:annotations="annotations"
    :history="true"
    :src="src"
    :assets="assets"
    class="sandbox-root"
    @ready="onReady"
    @error="onError"
  >
    <DefaultToolbar>
      <div class="sandbox-actions" role="group" aria-label="Review">
        <button
          type="button"
          data-testid="suggest"
          :disabled="!document"
          @click="suggest"
        >
          Suggest redactions
        </button>
        <button type="button" data-testid="resign" @click="resign">Re-sign</button>
        <button type="button" data-testid="new-version" @click="newVersion">
          New version
        </button>
      </div>
    </DefaultToolbar>
    <EmbeddedBanner />
    <InkViewport />
    <InkNotePopover />
    <InkSuggestionCard />
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
    <p class="sandbox-status" role="status" data-testid="suggest-result">
      {{ suggestResult }}
    </p>
  </InkRoot>
</template>
