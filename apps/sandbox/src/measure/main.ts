/*
 * The measure page, for maintainers and linked from nowhere:
 * `<base>measure/?file=<name>&reader=engine|pdfjs` (the slash after `measure` is needed: without
 * it `vite preview` serves the sandbox's own page) opens one file with one reader and prints, as plain text, the bytes fetched from the open on,
 * the time from the open to the first page drawn, and then the first page drawn at each step of
 * Zoom in (×1.25) from zoom 1 to the viewer's largest, 8: per step the canvas size, the draw
 * time, `ok` or the error, and whether the canvas is over the most pixels the engine draws in
 * one bitmap, so that the engine drew it smaller and stretched it. It asserts nothing.
 *
 * The page loads afresh for each measurement, so one reader's files never count for the other;
 * the HTTP cache still serves what an earlier load fetched (transfer 0). The results are also on
 * `window.__inkbarMeasure`, and POSTed as JSON to `?report=<url>` when the URL has one.
 */
import { openDocument, type DocumentSource, type InkDocument } from '@inkbar/core'
import { createPageRenderer, createPageTransform } from '@inkbar/core/dom'
import { assets } from 'virtual:inkbar-assets'

import { engine, FONT_BASE } from '../shared/engine.ts'
import { readerOf, setEngineReader } from '../shared/reader.ts'
import { watchRequests, type SeenRequest } from '../shared/requests.ts'

// Watching from the first line, so the open's requests are all seen.
const watch = watchRequests()

const BASE = import.meta.env.BASE_URL
/** The most pixels the engine draws in one bitmap; a larger canvas is drawn smaller and stretched. */
const ENGINE_MAX_PIXELS = 268_435_456
/**
 * The viewer's largest zoom. The viewport does not expose it: it is the default of `maxZoom` in
 * `createViewport` (packages/core/src/dom/viewport.ts), which the viewer does not change.
 */
const MAX_ZOOM = 8
/** The factor of the viewer's Zoom in button (packages/core/src/dom/viewer/controls.ts). */
const ZOOM_IN = 1.25
const LARGE_PAGES = 50

/** The files on offer, by the name `?file=` takes. */
const FILES: Record<string, { label: string; source: () => Promise<DocumentSource> }> = {
  'text-simple': {
    label: 'text-simple: one page of Latin text',
    source: () =>
      Promise.resolve({ url: `${BASE}fixtures/text-simple.pdf`, key: 'text-simple' }),
  },
  'unembedded-japanese': {
    label: 'unembedded-japanese: Japanese text in a font the file does not carry',
    source: () =>
      Promise.resolve({
        url: `${BASE}fixtures/unembedded-japanese.pdf`,
        key: 'unembedded-japanese',
      }),
  },
  'corpus-transfer-function': {
    label: 'corpus-transfer-function: two pages of scanned-style images, no text',
    source: () =>
      Promise.resolve({
        url: `${BASE}fixtures/corpus-transfer-function.pdf`,
        key: 'corpus-transfer-function',
      }),
  },
  large: {
    label: `large: ${LARGE_PAGES} pages of text, made in the browser`,
    source: async () => {
      const { generateLarge } = await import('@inkbar/fixtures/generate-large')
      return { data: await generateLarge(LARGE_PAGES), key: 'large' }
    },
  },
}

interface Step {
  zoom: number
  /** The canvas size asked for: the page's CSS size times the device pixel ratio. */
  width: number
  height: number
  /** Over `ENGINE_MAX_PIXELS`: the engine draws it smaller and stretches it to fill. */
  overCap: boolean
  /** The size of the canvas drawn, when one was. */
  drawn?: { width: number; height: number }
  ms: number
  result: string
}

interface Measurement {
  done: boolean
  file: string
  reader: string
  devicePixelRatio: number
  userAgent: string
  firstPageMs?: number
  requests: (SeenRequest & { kind: string })[]
  steps: Step[]
  error?: string
}

declare global {
  interface Window {
    __inkbarMeasure?: Measurement
  }
}

const params = new URLSearchParams(location.search)
const out = document.querySelector<HTMLElement>('[data-measure-results]')!
const pageBox = document.querySelector<HTMLElement>('[data-measure-page]')!
const form = document.querySelector<HTMLFormElement>('[data-measure-form]')!
const fileSelect = form.elements.namedItem('file') as HTMLSelectElement
const readerSelect = form.elements.namedItem('reader') as HTMLSelectElement
const ownInput = form.elements.namedItem('own') as HTMLInputElement

fileSelect.innerHTML = Object.entries(FILES)
  .map(([id, f]) => `<option value="${id}">${f.label}</option>`)
  .join('')

/** What a request was for, from its path and the worker that made it. */
function kindOf(r: SeenRequest): string {
  const path = new URL(r.name).pathname
  if (/\/inkbar-pdfium[^/]*\.wasm$/.test(path)) return 'engine binary'
  if (path.startsWith(FONT_BASE)) return 'fallback fonts'
  if (path.startsWith(`${BASE}inkbar/`)) return 'PDF.js files'
  if (path.endsWith('.pdf')) return 'the file'
  // Any other worker's script, and what that worker fetched, is the engine's.
  if (r.from !== 'page' || watch.workers().includes(r.name)) return 'engine worker'
  return 'page scripts'
}

const KINDS = [
  'engine binary',
  'engine worker',
  'fallback fonts',
  'PDF.js files',
  'page scripts',
  'the file',
]

const bytes = (n: number) => n.toLocaleString('en-GB')
const pad = (text: string | number, width: number) => String(text).padEnd(width)

function format(m: Measurement): string {
  const lines = [
    `file: ${m.file}   reader: ${m.reader}   devicePixelRatio: ${m.devicePixelRatio}`,
    m.userAgent,
    '',
  ]
  if (m.firstPageMs !== undefined)
    lines.push(
      `open to the first page drawn: ${Math.round(m.firstPageMs)} ms`,
      '  (this includes starting each worker through the small module that watches its requests)',
      ''
    )
  if (m.requests.length > 0) {
    lines.push('bytes fetched from the open on (transfer / body):')
    let transfer = 0
    let body = 0
    for (const kind of KINDS) {
      const of = m.requests.filter((r) => r.kind === kind)
      if (of.length === 0) continue
      const t = of.reduce((n, r) => n + r.transferSize, 0)
      const b = of.reduce((n, r) => n + r.encodedBodySize, 0)
      transfer += t
      body += b
      lines.push(
        `  ${pad(kind, 16)}${pad(bytes(t), 13)}${pad(bytes(b), 13)}${of.length} files`
      )
    }
    lines.push(`  ${pad('total', 16)}${pad(bytes(transfer), 13)}${bytes(body)}`, '')
  }
  if (m.steps.length > 0) {
    lines.push(
      `page 1 at each zoom (the engine draws at most ${bytes(ENGINE_MAX_PIXELS)} pixels):`,
      `  ${pad('zoom', 7)}${pad('canvas', 14)}${pad('pixels', 14)}${pad('over', 6)}${pad('ms', 8)}result`
    )
    for (const s of m.steps)
      lines.push(
        `  ${pad(s.zoom.toFixed(2), 7)}${pad(`${s.width}x${s.height}`, 14)}${pad(
          bytes(s.width * s.height),
          14
        )}${pad(s.overCap ? 'yes' : 'no', 6)}${pad(Math.round(s.ms), 8)}${s.result}${
          s.drawn && (s.drawn.width !== s.width || s.drawn.height !== s.height)
            ? ` (the canvas is ${s.drawn.width}x${s.drawn.height})`
            : ''
        }`
      )
    const first = m.steps.find((s) => s.overCap)
    lines.push(
      '',
      first
        ? `the stretch starts at zoom ${first.zoom.toFixed(2)}${m.reader === 'engine' ? '' : ' (for the engine; this reader does not stretch)'}`
        : 'no step is over the engine’s cap, so nothing is stretched'
    )
  }
  if (m.error) lines.push('', `error: ${m.error}`)
  lines.push('', m.done ? 'Done.' : 'Measuring…')
  if (m.done && m.requests.length > 0) {
    lines.push('', 'requests:')
    for (const r of m.requests)
      lines.push(
        `  ${pad(r.kind, 16)}${pad(bytes(r.transferSize), 13)}${pad(bytes(r.encodedBodySize), 13)}${new URL(r.name).pathname}`
      )
  }
  return lines.join('\n')
}

const describe = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

const zoomSteps = (): number[] => {
  const steps = [1]
  while (steps.at(-1)! < MAX_ZOOM) steps.push(Math.min(MAX_ZOOM, steps.at(-1)! * ZOOM_IN))
  return steps
}

/** Waits for the workers' reports: each posts its entries as they come in. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 1_000))

async function measure(
  file: string,
  source: () => Promise<DocumentSource>,
  reader: string
) {
  const m: Measurement = {
    done: false,
    file,
    reader,
    devicePixelRatio: window.devicePixelRatio,
    userAgent: navigator.userAgent,
    requests: [],
    steps: [],
  }
  window.__inkbarMeasure = m
  const show = () => (out.textContent = format(m))
  show()
  setEngineReader(reader === 'engine')
  let doc: InkDocument | undefined
  try {
    const from = watch.list().length
    const t0 = performance.now()
    doc = await openDocument(await source(), { assets, engine })
    const info = doc.pages[0]!
    const host = document.createElement('div')
    pageBox.replaceChildren(host)
    let failure: unknown
    const sizeHost = (zoom: number) => {
      const t = createPageTransform(info, zoom)
      host.style.width = `${t.cssWidth}px`
      host.style.height = `${t.cssHeight}px`
      return t
    }
    const renderer = createPageRenderer({
      document: doc,
      page: 0,
      host,
      transform: sizeHost(1),
      onError: (error) => (failure = error),
    })
    await renderer.rendered
    m.firstPageMs = performance.now() - t0
    if (readerOf(doc) !== reader) m.error = `the page was drawn by ${readerOf(doc)}`
    await settle()
    m.requests = watch
      .list()
      .slice(from)
      .map((r) => ({ ...r, kind: kindOf(r) }))
    show()
    for (const zoom of zoomSteps()) {
      const transform = sizeHost(zoom)
      const dpr = window.devicePixelRatio
      const width = Math.round(transform.cssWidth * dpr)
      const height = Math.round(transform.cssHeight * dpr)
      failure = undefined
      const start = performance.now()
      renderer.update(transform)
      await renderer.rendered
      const ms = performance.now() - start
      const canvas = host.querySelector<HTMLCanvasElement>('canvas[data-ink-canvas]')
      m.steps.push({
        zoom,
        width,
        height,
        overCap: width * height > ENGINE_MAX_PIXELS,
        ...(canvas && !failure
          ? { drawn: { width: canvas.width, height: canvas.height } }
          : {}),
        ms,
        result: failure ? describe(failure) : 'ok',
      })
      show()
    }
    renderer.destroy()
  } catch (error) {
    m.error = describe(error)
  } finally {
    doc?.destroy()
    setEngineReader(false)
    m.done = true
    show()
    document.body.dataset.measure = 'done'
  }
  const to = params.get('report')
  if (to)
    await fetch(to, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(m),
    }).catch((error: unknown) => console.warn('Could not send the measurement', error))
}

// A run is a page load: the form sets the query string and loads the page again.
form.addEventListener('submit', (event) => {
  event.preventDefault()
  const next = new URLSearchParams(location.search)
  next.set('file', fileSelect.value)
  next.set('reader', readerSelect.value)
  location.search = next.toString()
})
// Your own PDF is measured on this load, so the files fetched so far count too.
ownInput.addEventListener('change', () => {
  const picked = ownInput.files?.[0]
  if (!picked) return
  void measure(
    picked.name,
    async () => ({
      data: new Uint8Array(await picked.arrayBuffer()),
      key: `own:${picked.name}`,
    }),
    readerSelect.value
  )
})

const asked = params.get('file')
const askedReader = params.get('reader') === 'engine' ? 'engine' : 'pdfjs'
readerSelect.value = askedReader
if (asked && Object.hasOwn(FILES, asked)) {
  fileSelect.value = asked
  void measure(asked, FILES[asked]!.source, askedReader)
} else {
  out.textContent = 'Pick a file and a reader, then Measure.'
}
