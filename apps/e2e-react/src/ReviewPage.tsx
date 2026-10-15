/*
 * Mirrors a host integration: a signed URL whose signature changes while the document key
 * does not, annotations owned by the host and synced to a server, and suggested redactions
 * that the reader accepts or dismisses. Same test ids and strings as the Vue sandbox: both
 * run the shared end-to-end suite.
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
import { createFakeServer } from '@inkbar/e2e-shared/fake-server'
import { recordReady } from '@inkbar/e2e-shared/metrics'
import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import {
  DefaultToolbar,
  InkNotePopover,
  InkRoot,
  InkSuggestionCard,
  InkViewport,
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
  /** Outcome of the last suggestion run, announced apart from the sync status. */
  const [suggestResult, setSuggestResult] = useState('')
  const [document, setDocument] = useState<InkDocument | null>(null)
  const documentRef = useRef<InkDocument | null>(null)
  const root = useRef<InkRootHandle>(null)
  const [largeBytes, setLargeBytes] = useState<Uint8Array | null>(null)
  /** The key whose saved annotations have been loaded; saving waits for it. */
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  /** Set once saved annotations for this key are in state: clear history, then open for saving. */
  const [loadedPending, setLoadedPending] = useState<string | null>(null)
  /** The toolbar stays inert, and the tool at view, until the current key has loaded. */
  const [failed, setFailed] = useState(false)
  const [tool, setTool] = useState<ToolId>('view')

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

  const latest = useRef({ loadedKey, key, readyCount, annotations })
  latest.current = { loadedKey, key, readyCount, annotations }

  async function onReady(doc: InkDocument): Promise<void> {
    const count = import.meta.env.DEV ? recordReady() : latest.current.readyCount + 1
    setReadyCount(count)
    setDocument(doc)
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
    setDocument(null)
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
          format: ANNOTATION_FORMAT,
          version: ANNOTATION_VERSION,
          documentKey: forKey,
          annotations: JSON.parse(JSON.stringify(annotations)) as Annotation[],
        })
        .then(() => {
          if (latest.current.loadedKey === forKey) setStatus('saved')
        })
    saveTimer.current = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS)
  }, [annotations, server, flushSave])
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  async function suggest(): Promise<void> {
    const doc = documentRef.current
    if (!doc) return
    setSuggestResult('Looking for personal data…')
    const inputs = await server.suggest(doc)
    if (documentRef.current !== doc) return
    // In controlled mode each add is a proposal; proposals in one tick compose into one list.
    // Running again must not repeat a suggestion already on the page.
    const seen = new Set(
      latest.current.annotations
        .filter((a) => a.type === 'redact')
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
    setSuggestResult(
      `${fresh.length} suggested redaction${fresh.length === 1 ? '' : 's'}`
    )
  }

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
    setTool('view')
    setDocument(null)
    documentRef.current = null
    setAnnotations([])
    setSuggestResult('')
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
        <DefaultToolbar>
          <div className="sandbox-actions" role="group" aria-label="Review">
            <button
              type="button"
              data-testid="suggest"
              disabled={!document || loading}
              onClick={() => void suggest()}
            >
              Suggest redactions
            </button>
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
        </DefaultToolbar>
      </div>
      <EmbeddedBanner />
      <div inert={loading} className="sandbox-editor" data-testid="editor-gate">
        <InkViewport />
        <InkNotePopover />
        <InkSuggestionCard />
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
      <p className="sandbox-status" role="status" data-testid="suggest-result">
        {suggestResult}
      </p>
    </InkRoot>
  )
}
