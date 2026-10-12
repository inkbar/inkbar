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
  type Quad,
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
/** Outcome of the last suggestion run, announced apart from the sync status. */
const suggestResult = ref('')
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
const tool = ref<ToolId>('view')

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
        format: ANNOTATION_FORMAT,
        version: ANNOTATION_VERSION,
        documentKey: forKey,
        annotations: JSON.parse(JSON.stringify(list)) as Annotation[],
      })
      .then(() => {
        if (loadedKey.value === forKey) status.value = 'saved'
      })
  saveTimer = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS)
})
onBeforeUnmount(() => clearTimeout(saveTimer))

/** Rounded to 0.01 pt, so a rerun finds the rect it stored before. */
function rectKey(r: { x: number; y: number; width: number; height: number }): string {
  return [r.x, r.y, r.width, r.height].map((n) => n.toFixed(2)).join(',')
}

function quadsRect(quads: readonly Quad[]) {
  const xs = quads.flatMap((q) => [q.p1.x, q.p2.x, q.p3.x, q.p4.x])
  const ys = quads.flatMap((q) => [q.p1.y, q.p2.y, q.p3.y, q.p4.y])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

async function suggest(): Promise<void> {
  const doc = document.value
  if (!doc) return
  suggestResult.value = 'Looking for personal data…'
  const inputs = await server.suggest(doc)
  if (document.value !== doc) return
  // In controlled mode each add is a proposal; proposals in one tick compose into one list.
  // Running again must not repeat a suggestion already on the page.
  const seen = new Set(
    annotations.value
      .filter((a) => a.type === 'redact' && a.origin === 'suggested')
      .map((a) => `${a.page}:${rectKey(a.rect)}`)
  )
  const fresh = inputs.filter((input) => {
    const quads = 'quads' in input ? input.quads : undefined
    if (!quads) return true
    const id = `${input.page}:${rectKey(quadsRect(quads))}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
  for (const input of fresh) doc.annotations.add(input)
  suggestResult.value = `${fresh.length} suggested redaction${fresh.length === 1 ? '' : 's'}`
}

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
  tool.value = 'view'
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
    v-model:tool="tool"
    :history="true"
    :src="src"
    :assets="assets"
    class="sandbox-root"
    @ready="onReady"
    @error="onError"
  >
    <div :inert="loading" data-testid="toolbar-gate">
      <DefaultToolbar>
        <div class="sandbox-actions" role="group" aria-label="Review">
          <button
            type="button"
            data-testid="suggest"
            :disabled="!document || loading"
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
    </div>
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
