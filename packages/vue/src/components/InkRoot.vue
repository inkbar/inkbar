<script setup lang="ts">
import { InkError, openDocument } from '@inkbar/core'
import { cssVariableDefaults } from '@inkbar/core/dom'
import { Primitive } from 'reka-ui'
import {
  computed,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'

import { provideInkContext, type InkHistory, type InkStatus } from '../context'
import { createRefHistory } from '../ref-history'
import { useReadable } from '../use-readable'

import type {
  Annotation,
  AnnotationChange,
  AnnotationDefaults,
  DocumentSource,
  InkDocument,
  PdfAssets,
} from '@inkbar/core'
import type { ToolController, ToolId, Viewport, ZoomValue } from '@inkbar/core/dom'

const props = withDefaults(
  defineProps<{
    src: DocumentSource | null
    assets: PdfAssets
    password?: string | undefined
    /** Colour defaults. Without it, the theme's CSS variables on the root element apply. */
    defaults?: AnnotationDefaults | undefined
    /**
     * Pass (with v-model) to put annotations under the host's control. The mode is fixed when a
     * document opens: passing or dropping this prop later takes effect on the next open.
     */
    annotations?: Annotation[] | undefined
    tool?: ToolId | undefined
    page?: number | undefined
    zoom?: ZoomValue | undefined
    /** Undo history. Defaults to on for uncontrolled, off for controlled. */
    history?: boolean | undefined
    asChild?: boolean
  }>(),
  {
    password: undefined,
    defaults: undefined,
    annotations: undefined,
    tool: undefined,
    page: undefined,
    zoom: undefined,
    history: undefined,
    asChild: false,
  }
)

const emit = defineEmits<{
  'update:annotations': [next: Annotation[]]
  change: [change: AnnotationChange]
  'update:tool': [tool: ToolId]
  'update:page': [page: number]
  'update:zoom': [zoom: ZoomValue]
  ready: [doc: InkDocument]
  error: [error: InkError]
  activate: [id: string]
}>()

type TestHookElement = HTMLElement & { __inkDocument?: InkDocument | undefined }

// A template ref on Primitive is a component instance; the context needs its element.
const primitive = useTemplateRef<{ $el: unknown }>('primitive')
const rootEl = shallowRef<HTMLElement | null>(null)
function syncRootEl(): void {
  const el = primitive.value?.$el
  rootEl.value = el instanceof HTMLElement ? el : null
}

const document = shallowRef<InkDocument | null>(null)
/** Overrides the document's status while opening, and when opening itself failed. */
const override = shallowRef<InkStatus | null>(null)
const idle: InkStatus = { state: 'idle' }
const documentStatus = useReadable<InkStatus>(() => document.value?.status ?? null, idle)
const status = computed<InkStatus>(() => override.value ?? documentStatus.value)
const annotationList = useReadable<readonly Annotation[]>(
  () => document.value?.annotations.list ?? null,
  []
)
const selection = useReadable<readonly string[]>(
  () => document.value?.annotations.selection ?? null,
  []
)
const viewport = shallowRef<Viewport | null>(null)
const tools = shallowRef<ToolController | null>(null)
const internalTool = ref<ToolId>(props.tool ?? 'view')
const activated = ref<string | null>(null)

const controlled = computed(() => props.annotations !== undefined)

/** Signed URLs change; the key does not. Bytes and Blobs are their own identity. */
function identity(src: DocumentSource | null): unknown {
  if (src === null) return null
  if (typeof src === 'string') return src
  if ('key' in src) return src.key
  return src
}

function setTestHook(doc: InkDocument | undefined): void {
  if (import.meta.env.DEV && rootEl.value)
    (rootEl.value as TestHookElement).__inkDocument = doc
}

let generation = 0
function release(): void {
  document.value?.destroy()
  document.value = null
  setTestHook(undefined)
}

async function open(): Promise<void> {
  const gen = ++generation
  const src = props.src
  release()
  refHistory.clear()
  if (src === null) {
    override.value = null
    return
  }
  override.value = { state: 'loading' }
  syncRootEl()
  let doc: InkDocument
  try {
    doc = await openDocument(src, {
      assets: props.assets,
      password: props.password,
      defaults:
        props.defaults ?? (rootEl.value ? cssVariableDefaults(rootEl.value) : undefined),
      // Controlled hosts get the ref history below; core's own stack stays off.
      history: controlled.value ? false : (props.history ?? true),
      annotations: controlled.value
        ? {
            mode: 'controlled',
            initial: props.annotations ?? [],
            onChange: (next, change) => {
              emit('update:annotations', next)
              emit('change', change)
            },
          }
        : { mode: 'uncontrolled' },
    })
  } catch (cause) {
    if (gen !== generation) return
    const error =
      cause instanceof InkError
        ? cause
        : new InkError(
            'InvalidPdf',
            cause instanceof Error ? cause.message : String(cause),
            {},
            cause
          )
    override.value = { state: 'error', error }
    emit('error', error)
    return
  }
  if (gen !== generation) {
    doc.destroy()
    return
  }
  // The prop may have changed while the file loaded, when there was no store to apply it to.
  if (doc.annotations.mode === 'controlled' && props.annotations !== undefined)
    doc.annotations.setControlledValue(props.annotations)
  document.value = doc
  override.value = null
  setTestHook(doc)
  const s = doc.status.get()
  if (s.state === 'ready') emit('ready', doc)
  else if (s.state === 'error') emit('error', s.error)
}

const refHistory = createRefHistory({
  source: () => props.annotations,
  apply: (list) => document.value?.annotations.replaceAll(list, 'history'),
  enabled: computed(() => controlled.value && props.history === true),
})
const coreCanUndo = useReadable(() => document.value?.history.canUndo ?? null, false)
const coreCanRedo = useReadable(() => document.value?.history.canRedo ?? null, false)
const inkHistory: InkHistory = {
  canUndo: computed(() =>
    controlled.value ? refHistory.canUndo.value : coreCanUndo.value
  ),
  canRedo: computed(() =>
    controlled.value ? refHistory.canRedo.value : coreCanRedo.value
  ),
  undo: () => (controlled.value ? refHistory.undo() : document.value?.history.undo()),
  redo: () => (controlled.value ? refHistory.redo() : document.value?.history.redo()),
  clear: () => (controlled.value ? refHistory.clear() : document.value?.history.clear()),
  batch: (fn) => {
    if (controlled.value) refHistory.batch(fn)
    else if (document.value) document.value.history.batch(fn)
    else fn()
  },
}

// Open on the client only: on the server InkRoot renders its empty slot.
onMounted(() => {
  syncRootEl()
  void open()
})
onUpdated(syncRootEl)

// Separate sources, so a new `{ url, key }` object with the same key compares equal.
watch([() => identity(props.src), () => props.password], () => void open())

watch(
  () => props.annotations,
  (next) => {
    if (next && document.value?.annotations.mode === 'controlled')
      document.value.annotations.setControlledValue(next)
  }
)

watch(
  () => props.tool,
  (t) => {
    if (t) internalTool.value = t
  }
)

function setTool(id: ToolId): void {
  internalTool.value = id
  emit('update:tool', id)
}

onBeforeUnmount(() => {
  generation++
  release()
})

provideInkContext({
  assets: computed(() => props.assets),
  document,
  status,
  annotations: annotationList,
  selection,
  viewport,
  tools,
  tool: internalTool,
  setTool,
  zoomModel: computed(() => props.zoom),
  pageModel: computed(() => props.page),
  reportZoom: (z) => emit('update:zoom', z),
  reportPage: (p) => emit('update:page', p),
  activated,
  setActivated(id) {
    activated.value = id
    if (id) emit('activate', id)
  },
  history: inkHistory,
  rootEl,
})

// `history` is what `useHistory()` returns inside the root, for hosts that hold a template ref:
// a controlled host calls `history.clear()` after loading its saved list.
defineExpose({ document, status, rootEl, history: inkHistory })
</script>

<template>
  <Primitive
    ref="primitive"
    :as-child="props.asChild"
    as="div"
    data-ink-root
    :data-state="status.state"
  >
    <slot :status="status" :document="document" />
  </Primitive>
</template>
