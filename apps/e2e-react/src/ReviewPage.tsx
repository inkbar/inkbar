/*
 * Mirrors a host integration: a signed URL whose signature changes while the document key
 * does not, and annotations owned by the host and synced to a server. Same test ids and
 * strings as the Vue sandbox: both run the shared end-to-end suite.
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
  InkSearchButton,
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
  type InkRootHandle,
} from '@inkbar/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { assets } from 'virtual:inkbar-assets'

import { EmbeddedBanner } from './EmbeddedBanner'

import type { ToolId } from '@inkbar/core/dom'

/** Saves wait this long after the last change, so a drag or a burst of edits saves once. */
const SAVE_DEBOUNCE_MS = 150

/** One generated file per page count, shared across StrictMode's double-invoked effects. */
const largeFiles = new Map<number, Promise<Uint8Array>>()
function largeFile(pages: number): Promise<Uint8Array> {
  let p = largeFiles.get(pages)
  if (!p) {
    // pdf-lib loads only for the performance check.
    p = import('@inkbar/fixtures/generate-large').then(({ generateLarge }) =>
      generateLarge(pages)
    )
    largeFiles.set(pages, p)
    // A failed generation is not kept: the next mount tries again instead of rejecting at once.
    p.catch(() => {
      if (largeFiles.get(pages) === p) largeFiles.delete(pages)
    })
  }
  return p
}

function knownAnnotations(items: readonly unknown[]): Annotation[] {
  return items.flatMap((item) => {
    const parsed = AnnotationSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

export function ReviewPage({
  fixture,
  largePages,
}: {
  fixture: string
  largePages: number
}) {
  const server = useMemo(() => createFakeServer({ latency: 150 }), [])
  const [version, setVersion] = useState(1)
  const [signature, setSignature] = useState(1)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [status, setStatus] = useState(
    largePages > 0 ? `generating ${largePages} pages` : 'loading'
  )
  const [readyCount, setReadyCount] = useState(0)
  const documentRef = useRef<InkDocument | null>(null)
  const root = useRef<InkRootHandle>(null)
  const [largeBytes, setLargeBytes] = useState<Uint8Array | null>(null)
  /** The key whose saved annotations have been loaded; saving waits for it. */
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  /** Set once saved annotations for this key are in state: clear history, then open for saving. */
  const [loadedPending, setLoadedPending] = useState<string | null>(null)
  /** The toolbar stays inert, and the tool at view, until the current key has loaded. */
  const [failed, setFailed] = useState(false)
  const [tool, setTool] = useState<ToolId>('select-text')

  const key = largePages > 0 ? `large-${largePages}:v${version}` : `case-1:v${version}`
  const loading = !failed && (loadedKey === null || loadedKey !== key)
  const src = useMemo<DocumentSource | null>(() => {
    if (largePages > 0) return largeBytes ? { data: largeBytes, key } : null
    const url = `${fixtureUrl(fixture as FixtureName)}?sig=${signature}`
    return { url, key }
  }, [largePages, largeBytes, key, fixture, signature])

  useEffect(() => {
    if (largePages <= 0) return
    let cancelled = false
    void largeFile(largePages).then((bytes) => {
      if (!cancelled) setLargeBytes(bytes)
    })
    return () => {
      cancelled = true
    }
  }, [largePages])

  const latest = useRef({ loadedKey, key, readyCount })
  latest.current = { loadedKey, key, readyCount }

  async function onReady(doc: InkDocument): Promise<void> {
    const count = import.meta.env.DEV ? recordReady() : latest.current.readyCount + 1
    setReadyCount(count)
    documentRef.current = doc
    const forKey = doc.key
    const saved = await server.load(forKey)
    if (documentRef.current !== doc) return
    if (saved) setAnnotations(knownAnnotations(saved.annotations))
    // The history has to see the loaded list before it is cleared; see the effect below.
    setLoadedPending(forKey)
  }

  // Runs after InkRoot's own effects have observed the loaded list (a parent's effects run
  // after its children's), so clearing here leaves the first undo with nothing to undo.
  useEffect(() => {
    if (loadedPending === null) return
    root.current?.history.clear()
    setLoadedKey(loadedPending)
    setStatus('ready')
    setLoadedPending(null)
  }, [loadedPending])

  function onError(): void {
    setFailed(true)
    documentRef.current = null
    setStatus('error')
  }

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** The save that the debounce is still holding back, if any. */
  const pendingSave = useRef<(() => Promise<void>) | undefined>(undefined)
  /** Saves that have started and not yet been stored. */
  const inFlight = useRef(new Set<Promise<void>>())

  /** Starts the held-back save now and resolves once it and any save in flight are stored. */
  const flushSave = useCallback(async (): Promise<void> => {
    clearTimeout(saveTimer.current)
    const run = pendingSave.current
    pendingSave.current = undefined
    if (run) {
      const saving = run()
      inFlight.current.add(saving)
      void saving.finally(() => inFlight.current.delete(saving))
    }
    await Promise.all(inFlight.current)
  }, [])

  // Every change to the host's list after its key has loaded is saved, debounced.
  const firstList = useRef(true)
  useEffect(() => {
    if (firstList.current) {
      firstList.current = false
      return
    }
    const forKey = latest.current.loadedKey
    if (forKey === null || forKey !== latest.current.key) return
    clearTimeout(saveTimer.current)
    setStatus('saving')
    pendingSave.current = () =>
      server
        .save(forKey, {
          format: GLOSS_FORMAT,
          version: GLOSS_VERSION,
          documentKey: forKey,
          annotations: JSON.parse(JSON.stringify(annotations)) as Annotation[],
        })
        .then(() => {
          if (latest.current.loadedKey === forKey) setStatus('saved')
        })
    saveTimer.current = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS)
  }, [annotations, server, flushSave])
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  /** A new signature for the same file: the key is unchanged, so nothing reloads. */
  function resign(): void {
    setSignature((s) => s + 1)
  }

  /** A new version of the file: a new key, so the viewer reloads and starts from the server. */
  async function newVersion(): Promise<void> {
    // Inert from here on. An edit still inside the debounce window belongs to the old key:
    // wait until it is stored before the key changes.
    setLoadedKey(null)
    await flushSave()
    setFailed(false)
    setTool('select-text')
    documentRef.current = null
    setAnnotations([])
    setStatus('loading')
    setVersion((v) => v + 1)
  }

  return (
    <InkRoot
      ref={root}
      annotations={annotations}
      onAnnotationsChange={setAnnotations}
      tool={tool}
      onToolChange={setTool}
      history={true}
      src={src}
      assets={assets}
      className="sandbox-root"
      onReady={(doc) => void onReady(doc)}
      onError={onError}
    >
      <div inert={loading} data-testid="toolbar-gate">
        <InkToolbar>
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
          <InkToolButton tool="highlight" />
          <InkToolButton tool="redact-area" />
          <InkToolButton tool="note" />
          <InkSearchButton />
          <div className="sandbox-actions" role="group" aria-label="Review">
            <button type="button" data-testid="resign" onClick={resign}>
              Re-sign
            </button>
            <button
              type="button"
              data-testid="new-version"
              onClick={() => void newVersion()}
            >
              New version
            </button>
          </div>
        </InkToolbar>
      </div>
      <EmbeddedBanner />
      <div inert={loading} className="sandbox-editor" data-testid="editor-gate">
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
        className="sandbox-status"
        role="status"
        data-testid="status"
        data-ready-count={readyCount}
        data-version={version}
        data-signature={signature}
      >
        {status} · {annotations.length} annotation{annotations.length === 1 ? '' : 's'}
      </p>
    </InkRoot>
  )
}
