<script lang="ts">
  /*
   * Mirrors a host integration: a signed URL whose signature changes while the document key
   * does not, and annotations owned by the host through `bind:annotations` and synced to a
   * server. Same test ids and strings as the Vue and React test apps: all three run the shared
   * end-to-end suite.
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
    InkFindBar,
    InkNextPage,
    InkThreadPopover,
    InkPageCount,
    InkPageInput,
    InkPrevPage,
    InkRoot,
    InkSearchButton,
    InkToolbar,
    InkToolButton,
    InkViewport,
    InkZoomIn,
    InkZoomOut,
    InkZoomSelect,
  } from '@inkbar/svelte'
  import { onDestroy, tick, untrack } from 'svelte'
  import { assets } from 'virtual:inkbar-assets'

  import EmbeddedBanner from './EmbeddedBanner.svelte'

  import type { ToolId } from '@inkbar/core/dom'
  import type { InkRootHandle } from '@inkbar/svelte'

  let { fixture, largePages }: { fixture: string; largePages: number } = $props()

  /** Saves wait this long after the last change, so a drag or a burst of edits saves once. */
  const SAVE_DEBOUNCE_MS = 150

  /** The page count the page was opened with: the sandbox never changes it after mount. */
  const initialLargePages = untrack(() => largePages)

  const server = createFakeServer({ latency: 150 })
  let version = $state(1)
  let signature = $state(1)
  let annotations = $state.raw<Annotation[]>([])
  let status = $state(
    initialLargePages > 0 ? `generating ${initialLargePages} pages` : 'loading'
  )
  let readyCount = $state(0)
  let openDoc = $state.raw<InkDocument | null>(null)
  let root = $state<InkRootHandle | undefined>(undefined)
  let largeBytes = $state.raw<Uint8Array | null>(null)
  /** The key whose saved annotations have been loaded; saving waits for it. */
  let loadedKey = $state<string | null>(null)
  /** The toolbar stays inert, and the tool at view, until the current key has loaded. */
  let failed = $state(false)
  let tool = $state<ToolId>('select-text')

  const key = $derived(
    largePages > 0 ? `large-${largePages}:v${version}` : `case-1:v${version}`
  )
  const loading = $derived(!failed && (loadedKey === null || loadedKey !== key))
  const src = $derived.by<DocumentSource | null>(() => {
    if (largePages > 0) return largeBytes ? { data: largeBytes, key } : null
    const url = `${fixtureUrl(fixture as FixtureName)}?sig=${signature}`
    return { url, key }
  })

  if (initialLargePages > 0) {
    // pdf-lib loads only for the performance check.
    void import('@inkbar/fixtures/generate-large')
      .then(({ generateLarge }) => generateLarge(initialLargePages))
      .then((bytes) => (largeBytes = bytes))
  }

  function knownAnnotations(items: readonly unknown[]): Annotation[] {
    return items.flatMap((item) => {
      const parsed = AnnotationSchema.safeParse(item)
      return parsed.success ? [parsed.data] : []
    })
  }

  async function onReady(doc: InkDocument): Promise<void> {
    const count = import.meta.env.DEV ? recordReady() : readyCount + 1
    readyCount = count
    openDoc = doc
    const forKey = doc.key
    const saved = await server.load(forKey)
    if (openDoc !== doc) return
    if (saved) {
      annotations = knownAnnotations(saved.annotations)
      // Undo history records every change to the list. Loading is not the reader's change, so
      // once the history has seen it, clear it: undo right after opening must not empty the list.
      await tick()
      if (openDoc !== doc) return
      root?.history.clear()
    }
    loadedKey = forKey
    status = 'ready'
  }

  function onError(): void {
    failed = true
    openDoc = null
    status = 'error'
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  /** The save that the debounce is still holding back, if any. */
  let pendingSave: (() => Promise<void>) | undefined
  /** Saves that have started and not yet been stored. Bookkeeping, never rendered. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
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

  // Every change to the host's list after its key has loaded is saved, debounced.
  let firstList = true
  $effect(() => {
    const list = annotations
    if (firstList) {
      firstList = false
      return
    }
    untrack(() => {
      const forKey = loadedKey
      if (forKey === null || forKey !== key) return
      clearTimeout(saveTimer)
      status = 'saving'
      pendingSave = () =>
        server
          .save(forKey, {
            format: GLOSS_FORMAT,
            version: GLOSS_VERSION,
            documentKey: forKey,
            annotations: JSON.parse(JSON.stringify(list)) as Annotation[],
          })
          .then(() => {
            if (loadedKey === forKey) status = 'saved'
          })
      saveTimer = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS)
    })
  })
  onDestroy(() => clearTimeout(saveTimer))

  /** A new signature for the same file: the key is unchanged, so nothing reloads. */
  function resign(): void {
    signature += 1
  }

  /** A new version of the file: a new key, so the viewer reloads and starts from the server. */
  async function newVersion(): Promise<void> {
    // Inert from here on. An edit still inside the debounce window belongs to the old key:
    // wait until it is stored before the key changes.
    loadedKey = null
    await flushSave()
    failed = false
    tool = 'select-text'
    openDoc = null
    annotations = []
    status = 'loading'
    version += 1
  }
</script>

<InkRoot
  bind:this={root}
  bind:annotations
  bind:tool
  history={true}
  {src}
  {assets}
  class="sandbox-root"
  onReady={(doc) => void onReady(doc)}
  {onError}
>
  <div inert={loading} data-testid="toolbar-gate">
    <InkToolbar>
      <InkToolButton tool="select-text" />
      <InkToolButton tool="select" />
      <InkToolButton tool="highlight" />
      <InkToolButton tool="redact-area" />
      <InkToolButton tool="note" />
      <InkSearchButton />
      <div class="sandbox-actions" role="group" aria-label="Review">
        <button type="button" data-testid="resign" onclick={resign}>Re-sign</button>
        <button type="button" data-testid="new-version" onclick={() => void newVersion()}>
          New version
        </button>
      </div>
    </InkToolbar>
  </div>
  <EmbeddedBanner />
  <div inert={loading} class="sandbox-editor" data-testid="editor-gate">
    <InkViewport />
    <InkFindBar />
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
    data-ready-count={readyCount}
    data-version={version}
    data-signature={signature}
  >
    {status} · {annotations.length} annotation{annotations.length === 1 ? '' : 's'}
  </p>
</InkRoot>
