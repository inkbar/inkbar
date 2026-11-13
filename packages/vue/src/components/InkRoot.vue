<script setup lang="ts">
import {
  createMemoryStorage,
  createSignatureLibrary,
  createStorageSignatureStore,
  InkError,
  isValidLocale,
  openDocument,
  readonly,
  writable,
} from '@inkbar/core'
import {
  attachFileKeys,
  attachHistoryKeys,
  createMessageState,
  createPluginHost,
  createSearchController,
  createPasswordPrompt,
  createToolOptions,
  lockedStatus,
  handleFindKey,
  pageSelectionText,
  viewerSearchOf,
  cssVariableDefaults,
  FONT_FAMILIES,
  keepHistoryFocus,
  MIN_DOCUMENT_WIDTH,
  SIGNATURE_FONTS,
  trackToolStyle,
  unknownTool,
} from '@inkbar/core/dom'
import { Primitive } from 'reka-ui'
import {
  computed,
  onBeforeUnmount,
  onUnmounted,
  onMounted,
  onUpdated,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'

import { registeredToolIds } from '../composables/useRegisteredTool'
import { provideInkContext, type InkHistory, type InkStatus } from '../context'
import { createRefHistory } from '../ref-history'
import { useReadable } from '../use-readable'

import type {
  Annotation,
  AnnotationChange,
  AnnotationDefaults,
  DocumentSource,
  FieldsChange,
  FieldValues,
  ViewerAction,
  InkDocument,
  InkMessagesInput,
  InkStorage,
  PdfAssets,
} from '@inkbar/core'
import type {
  DecorateAnnotation,
  InkPlugin,
  Navigation,
  PluginHost,
  SearchController,
  Tool,
  ToolController,
  ToolId,
  ToolStyle,
  Viewport,
  ZoomValue,
} from '@inkbar/core/dom'

const props = withDefaults(
  defineProps<{
    src: DocumentSource | null
    assets: PdfAssets
    password?: string | undefined
    /**
     * Ask the reader for the password of a locked file. Default true. False: a locked file is
     * an error with code `PasswordRequired`, as before.
     */
    passwordPrompt?: boolean | undefined
    /** Colour defaults. Without it, the theme's CSS variables on the root element apply. */
    defaults?: AnnotationDefaults | undefined
    /**
     * Pass (with v-model) to put annotations under the host's control. The mode is fixed when a
     * document opens: passing or dropping this prop later takes effect on the next open.
     */
    annotations?: Annotation[] | undefined
    /**
     * Pass (with `v-model:fields`) to put the form's field values under the host's control. A
     * commit shows at once and is reported after; the host's push wins. The mode is fixed when
     * a document opens, as for `annotations`.
     */
    fields?: FieldValues | undefined
    /** Tints fillable form fields. Default true. A change applies to the open document in place. */
    formHighlight?: boolean | undefined
    tool?: ToolId | undefined
    /**
     * The creation tools, such as `allTools()` or a pick of the tool factories. `select-text`
     * and `select` are always present; a tool with either id replaces it. They are read when a
     * document opens: a tool added later is usable from the next open, one removed stops at
     * once. When the active tool goes, the viewer switches to `select-text` and emits
     * `update:tool`. A controlled `tool` naming a missing tool is reported back as
     * `select-text` and is not applied again when the tool appears later. Each mounted control
     * for a missing tool logs its own `UnknownTool`.
     */
    tools?: Tool[] | undefined
    /**
     * Plugins, set up once when the root is created; a later change to this prop is not
     * applied. Their tools join `tools`, their decoration and page layers apply to every
     * document, and their commands are placed with `InkCommand` or `useCommand`.
     */
    plugins?: InkPlugin[] | undefined
    /**
     * Adds `data-*` attributes, classes and a screen-reader description to each annotation's
     * element (see `DecorateAnnotation`). Decorations re-apply whenever the annotations change
     * and when this prop changes, without rebuilding the viewer. Pass a new function when its
     * output would change for any other reason.
     */
    decorateAnnotation?: DecorateAnnotation | undefined
    /**
     * The font families text boxes offer, replacing the PDF standard families
     * (`FONT_FAMILIES`). Fonts beyond those are the PDF writer's to embed.
     */
    fonts?: string[] | undefined
    /**
     * Where the viewer keeps what lasts between visits: saved signatures, each `InkSidebar`'s
     * width and the plugins' settings. Default: memory, gone on reload. `createLocalStorage`
     * keeps them in the browser; a host can keep them anywhere. Read once, when the root is
     * created.
     */
    storage?: InkStorage | undefined
    /**
     * The narrowest the document may get beside the sidebars, in CSS px, before a rail
     * sidebar's panel floats over the pages instead. Default 480 (`MIN_DOCUMENT_WIDTH`). Every
     * `InkSidebar` inside takes it unless it has its own. Read once, when the root is created.
     */
    minDocumentWidth?: number | undefined
    /** The handwriting fonts a typed signature offers; the host loads them. */
    signatureFonts?: string[] | undefined
    page?: number | undefined
    zoom?: ZoomValue | undefined
    /**
     * The words the viewer shows, over English: any group, any subset of its keys. A string,
     * or a function the viewer calls again whenever `messages` or `locale` changes. A change
     * applies in place: nothing remounts and open menus stay open.
     */
    messages?: InkMessagesInput | undefined
    /**
     * The locale dates are formatted for, and the root's `lang` when it is a valid tag.
     * Default: the browser's.
     */
    locale?: string | undefined
    /** Undo history. Defaults to on for uncontrolled, off for controlled. */
    history?: boolean | undefined
    asChild?: boolean
  }>(),
  {
    password: undefined,
    passwordPrompt: true,
    defaults: undefined,
    annotations: undefined,
    fields: undefined,
    formHighlight: undefined,
    tool: undefined,
    tools: undefined,
    plugins: undefined,
    decorateAnnotation: undefined,
    fonts: undefined,
    storage: undefined,
    minDocumentWidth: undefined,
    signatureFonts: undefined,
    page: undefined,
    zoom: undefined,
    messages: undefined,
    locale: undefined,
    history: undefined,
    asChild: false,
  }
)

const emit = defineEmits<{
  'update:annotations': [next: Annotation[]]
  change: [change: AnnotationChange]
  /** Committed field values, in full, with what changed them. */
  'update:fields': [next: FieldValues, change: FieldsChange]
  /**
   * The viewer asked the host to submit a form, open a link, send mail, print or prompt. Inkbar
   * does none of these.
   */
  action: [action: ViewerAction]
  'update:tool': [tool: ToolId]
  'update:page': [page: number]
  'update:zoom': [zoom: ZoomValue]
  ready: [doc: InkDocument]
  /**
   * Opening failed, or later a form script failed or a signature field refused its signing.
   * An error from while the document opened comes after `ready`.
   */
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
const toolController = shallowRef<ToolController | null>(null)
const navigation = shallowRef<Navigation | null>(null)
const internalTool = ref<ToolId>(props.tool ?? 'select-text')
const activated = ref<string | null>(null)

const controlled = computed(() => props.annotations !== undefined)
const fieldsControlled = computed(() => props.fields !== undefined)

function setActivated(id: string | null): void {
  activated.value = id
  if (id) emit('activate', id)
}

const noop = () => {}

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
/** The dialog's state machine. A submitted password goes straight to a retry of `src`. */
const prompt = createPasswordPrompt((password) => void open(password))
let stopFormErrors: () => void = noop
function release(): void {
  stopFormErrors()
  stopFormErrors = noop
  // Cleared first, so the plugins close their stores while the document is still alive.
  const doc = document.value
  document.value = null
  doc?.destroy()
  setTestHook(undefined)
}

/** A new source or password from the host: the prompt starts over. */
function start(): void {
  prompt.reset()
  void open()
}

/** `retryPassword` is the reader's, from the prompt: used for this load only. */
async function open(retryPassword?: string): Promise<void> {
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
      password: retryPassword ?? props.password,
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
      fields: fieldsControlled.value
        ? {
            mode: 'controlled',
            initial: props.fields ?? {},
            onChange: (next, change) => emit('update:fields', next, change),
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
    // `error` may have opened another document already.
    if (fail(error) && gen === generation) prompt.locked()
    return
  }
  if (gen !== generation) {
    doc.destroy()
    return
  }
  // The prop may have changed while the file loaded, when there was no store to apply it to.
  if (doc.annotations.mode === 'controlled' && props.annotations !== undefined)
    doc.annotations.setControlledValue(props.annotations)
  // The same for the fields; a document whose fields opened uncontrolled ignores the push.
  if (props.fields !== undefined) doc.form.setControlledValue(props.fields)
  // A form script that fails leaves the form fillable; the failure goes to `error`. Subscribed
  // before anyone hears of the document, so the form replays the errors from while it opened
  // here, not to a listener added in `ready`; they are held until `ready` has gone out.
  let held: InkError[] | undefined = []
  stopFormErrors = doc.form.on('error', (e) => {
    if (held) held.push(e)
    else emit('error', e)
  })
  document.value = doc
  override.value = null
  setTestHook(doc)
  const s = doc.status.get()
  if (s.state === 'ready') {
    prompt.reset()
    emit('ready', doc)
  } else if (s.state === 'error') {
    if (fail(s.error, true) && gen === generation) prompt.locked()
  }
  const early = held
  held = undefined
  if (gen === generation) for (const e of early) emit('error', e)
}

/**
 * A failed open: the locked status when the prompt is on and the file is locked (the prompt is
 * told once `error` has gone out), else an error.
 */
function fail(error: InkError, keepDocument = false): boolean {
  const locked = props.passwordPrompt ? lockedStatus(error) : null
  if (!locked) prompt.reset()
  if (locked || !keepDocument) override.value = locked ?? { state: 'error', error }
  emit('error', error)
  return locked !== null
}

const refHistory = createRefHistory({
  source: () => props.annotations,
  apply: (list) => document.value?.annotations.replaceAll(list, 'history'),
  enabled: computed(() => controlled.value && props.history === true),
  store: () =>
    document.value?.annotations.mode === 'controlled' ? document.value.annotations : null,
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
  track: (store) =>
    controlled.value
      ? refHistory.track(store)
      : (document.value?.history.track(store) ?? noop),
  react: (fn) =>
    controlled.value ? refHistory.react(fn) : (document.value?.history.react(fn) ?? noop),
}

// The undo and redo keys anywhere in the root do what InkUndo and InkRedo do. When either
// button undoes or redoes the last step and disables itself, focus goes back to the document.
// The find key listens here too.
watch(
  rootEl,
  (el, _prev, onCleanup) => {
    if (!el) return
    const stopKeys = attachHistoryKeys(el, () => ({
      canUndo: inkHistory.canUndo.value,
      canRedo: inkHistory.canRedo.value,
      undo: inkHistory.undo,
      redo: inkHistory.redo,
    }))
    const stopFocus = keepHistoryFocus(el, () =>
      el.querySelector<HTMLElement>('[data-ink-scroll]')
    )
    // Ctrl or Cmd+P prints and +S downloads, as InkPrintButton and InkDownloadButton do.
    const stopFileKeys = attachFileKeys(el, () => document.value)
    // Not a template listener: Vue leaves those on the element when it unmounts.
    el.addEventListener('keydown', onKeydown)
    onCleanup(() => {
      stopKeys()
      stopFocus()
      stopFileKeys()
      el.removeEventListener('keydown', onKeydown)
    })
  },
  { immediate: true }
)

/*
 * One plugin host for the root's life, built once mounted so that no `setup` runs on the
 * server, where nothing would clean it up. Until then `pluginHost` is null, and InkCommand
 * renders its command disabled. The host follows `hostDocument`, which is set after `document`
 * (a sync watch): when the host reads `inkHistory` for a new document, it is that document's
 * history.
 */
const hostDocument = writable<InkDocument | null>(null)
watch(document, (doc) => hostDocument.set(doc), { flush: 'sync' })
const viewportEl = shallowRef<HTMLElement | null>(null)
const hostRoot = writable<HTMLElement | null>(null)
watch(viewportEl, (el) => hostRoot.set(el), { flush: 'sync' })
const hostActivated = writable<string | null>(null)
watch(activated, (id) => hostActivated.set(id), { flush: 'sync' })
/** Read once, like `plugins`: the sidebars and the plugins load from it as they are created. */
const storage = props.storage ?? createMemoryStorage()
/** Read once, like `storage`: each sidebar reads it as it is created. */
const minDocumentWidth = props.minDocumentWidth ?? MIN_DOCUMENT_WIDTH
/*
 * One message state for the root's life. The props are pushed into it; the engine, the plugin
 * host and core's factories share it, and the components read its mirror below. Every set is
 * a new state, so label functions re-run even when the host passes an equal object.
 */
const messageState = createMessageState(props.messages, props.locale)
watch(
  () => props.messages,
  (next) => messageState.setMessages(next)
)
watch(
  () => props.locale,
  (next) => messageState.setLocale(next)
)
const words = useReadable(messageState, messageState.get())
const currentMessages = computed(() => words.value.messages)
const currentLocale = computed(() => words.value.locale)
const lang = computed(() =>
  isValidLocale(currentLocale.value) ? currentLocale.value : undefined
)
const pluginHost = shallowRef<PluginHost | null>(null)
/** One search controller for the root's life, built with the plugin host that shares it. */
const search = shallowRef<SearchController | null>(null)
function setUpPlugins(): void {
  const controller = createSearchController({
    document: readonly(hostDocument),
    viewport: () => viewport.value,
  })
  search.value = controller
  pluginHost.value = createPluginHost({
    plugins: props.plugins ?? [],
    document: readonly(hostDocument),
    history: () => inkHistory,
    activated: readonly(hostActivated),
    // As in `createViewer`: an id not in the open document is ignored.
    setActivated: (id) => {
      if (id === null || document.value?.annotations.get(id)) setActivated(id)
    },
    root: readonly(hostRoot),
    decorate: () => props.decorateAnnotation,
    viewport: () => viewport.value,
    search: viewerSearchOf(controller),
    storage,
    messages: messageState,
  })
}

/** Ctrl/Cmd+F while focus is in the root and a find bar is mounted; else the browser's. */
function onKeydown(e: KeyboardEvent): void {
  const controller = search.value
  const root = e.currentTarget
  if (controller && root instanceof HTMLElement)
    handleFindKey(e, controller, () => pageSelectionText(root))
}

/** The document's tool style; it batches through `inkHistory`, whichever mode is on. */
const toolStyle = shallowRef<ToolStyle | null>(null)
let setStyleTool: ((id: ToolId) => void) | undefined
watch(
  document,
  (doc) => {
    if (!doc) {
      toolStyle.value = null
      setStyleTool = undefined
      return
    }
    const tracker = trackToolStyle({
      store: doc.annotations,
      history: { batch: (fn) => inkHistory.batch(fn) },
      // The plugins' tools too, so a plugin tool's style group applies (the host is set by now:
      // it is built on mount, before the first document opens).
      tools: [...(props.tools ?? []), ...(pluginHost.value?.tools ?? [])],
      tool: internalTool.value,
    })
    setStyleTool = (id) => tracker.setTool(id)
    toolStyle.value = tracker.toolStyle
  },
  // Sync: the style is in place before InkViewport's watcher mounts the engine with it.
  { immediate: true, flush: 'sync' }
)
watch(internalTool, (id) => setStyleTool?.(id))

// Plugins and the document on the client only: on the server InkRoot renders its empty slot.
// The plugins first, so the first document opens with their stores and reactions.
onMounted(() => {
  syncRootEl()
  // A plugin whose setup throws still leaves the document to open; the error then goes to
  // Vue's error handling (`onErrorCaptured`, `app.config.errorHandler`).
  try {
    setUpPlugins()
  } finally {
    mounted.value = true
    start()
  }
})
onUpdated(syncRootEl)

// Separate sources, so a new `{ url, key }` object with the same key compares equal.
watch([() => identity(props.src), () => props.password], start)

watch(
  () => props.annotations,
  (next) => {
    if (next && document.value?.annotations.mode === 'controlled')
      document.value.annotations.setControlledValue(next)
  }
)

watch(
  () => props.fields,
  (next) => {
    if (next) document.value?.form.setControlledValue(next)
  }
)

/*
 * The tools are known once the plugins are set up on mount. A tool id nobody registered is
 * logged as `UnknownTool`; as the active tool, from a `tool` prop or because it left `tools`,
 * it falls back to `select-text`, reported through `update:tool`. A controlled `tool` that
 * stays on the missing id is not applied again.
 */
const mounted = ref(false)
/** The ids of the tools the current viewer was built with; InkViewport sets them. */
const openedToolIds = shallowRef<readonly ToolId[] | null>(null)
const toolIds = computed(() =>
  registeredToolIds(props.tools, pluginHost.value, openedToolIds.value)
)
const isRegistered = (id: ToolId): boolean => !mounted.value || toolIds.value.includes(id)
const logUnknownTool = (id: ToolId): void => console.error(unknownTool(id, toolIds.value))

function fallBack(id: ToolId): void {
  logUnknownTool(id)
  internalTool.value = 'select-text'
  emit('update:tool', 'select-text')
}

watch(
  () => props.tool,
  (t) => {
    if (!t) return
    if (isRegistered(t)) internalTool.value = t
    else fallBack(t)
  }
)
watch([mounted, toolIds], () => {
  if (!isRegistered(internalTool.value)) fallBack(internalTool.value)
})

function setTool(id: ToolId): void {
  // As the tool controller does: a missing tool is logged and nothing changes.
  if (!isRegistered(id)) {
    logUnknownTool(id)
    return
  }
  // Picking the active tool again starts it afresh, as after a one-shot tool's use.
  const tc = toolController.value
  if (internalTool.value === id && tc?.active.get() === id) tc.set(id)
  internalTool.value = id
  emit('update:tool', id)
}

onBeforeUnmount(() => {
  generation++
  release()
})

// After the children: InkViewport's engine, and the plugin layers with it, are gone by now, as
// in `createViewer`, so no layer `destroy` runs after the plugins' cleanups.
onUnmounted(() => {
  pluginHost.value?.destroy()
  pluginHost.value = null
  search.value?.destroy()
  search.value = null
})

const storageSignatures = createStorageSignatureStore(storage)
const signatures = createSignatureLibrary(storageSignatures)
void signatures.refresh()
/** Tool options last as long as the root; the tool style is per document. */
const toolOptions = createToolOptions()

provideInkContext({
  passwordPrompt: computed(() => (props.passwordPrompt ? prompt : null)),
  assets: computed(() => props.assets),
  document,
  status,
  annotations: annotationList,
  selection,
  viewport,
  tools: toolController,
  navigation,
  tool: internalTool,
  setTool,
  hostTools: computed(() => props.tools),
  openedToolIds,
  decorateAnnotation: computed(() => props.decorateAnnotation),
  fonts: computed(() => props.fonts ?? FONT_FAMILIES),
  toolOptions,
  storage,
  minDocumentWidth,
  signatures,
  signatureFonts: computed(() => props.signatureFonts ?? SIGNATURE_FONTS),
  toolStyle,
  zoomModel: computed(() => props.zoom),
  pageModel: computed(() => props.page),
  reportZoom: (z) => emit('update:zoom', z),
  reportPage: (p) => emit('update:page', p),
  activated,
  setActivated,
  pluginHost,
  search,
  viewportEl,
  history: inkHistory,
  rootEl,
  formHighlight: computed(() => props.formHighlight),
  messages: currentMessages,
  locale: currentLocale,
  messageState,
  reportAction: (a) => emit('action', a),
  reportError: (e) => emit('error', e),
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
    v-bind="{ lang }"
  >
    <slot :status="status" :document="document" />
  </Primitive>
</template>
