/*
 * The smoke page: a short list of checks that run inside the browser against the real library,
 * so a real Safari, a phone or a tablet can show in under a minute whether the engine's
 * WebAssembly loads in its worker, pages render, and saving, redacting, downloading and search
 * work. It uses only standard web APIs, so it runs in any browser the library supports. The
 * results are on `window.__inkbarSmoke`, on the page as text, and POSTed to `?report=<url>`.
 */
import {
  createToolbar,
  createToolButton,
  createViewer,
  drawTool,
  type Viewer,
} from '@inkbar/core/dom'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { runChecks, type SmokeCheck } from './run.ts'

import type { InkDocument, Quad } from '@inkbar/core'
import type { Engine } from '@inkbar/engine'

/** The redactions document: one page of three made-up customer records. */
const FIXTURE = `${import.meta.env.BASE_URL}documents/redactions.pdf`
const PAGES = 1
/** Text the first record holds once, which the redaction removes. */
const SECRET = '07700 900123'
const SECRET_DIGITS = '900123'
/** Text that stays after the redaction. */
const KEPT = 'Customer record'
/** A word search must find. */
const WORD = 'Marlowby'
const HIGHLIGHT_ID = 'smoke-highlight'

const engineLoader = () => import('@inkbar/engine')

/** Polls `test` until it gives a value, or throws once `ms` have passed. */
async function until<T>(
  what: string,
  test: () => T | undefined | null | false | Promise<T | undefined | null | false>,
  ms: number
): Promise<T> {
  const end = performance.now() + ms
  for (;;) {
    const value = await test()
    if (value) return value
    if (performance.now() > end) throw new Error(`${what} did not happen within ${ms} ms`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const startsWithPdf = (bytes: Uint8Array): boolean =>
  String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-'

/** Quads made a little larger on every side, so a mark surely covers the glyphs. */
function padded(quads: readonly Quad[], by: number): Quad[] {
  return quads.map((q) => ({
    p1: { x: q.p1.x - by, y: q.p1.y + by },
    p2: { x: q.p2.x + by, y: q.p2.y + by },
    p3: { x: q.p3.x - by, y: q.p3.y - by },
    p4: { x: q.p4.x + by, y: q.p4.y - by },
  }))
}

const host = document.querySelector<HTMLElement>('[data-smoke-viewer]')!
const out = document.querySelector<HTMLElement>('[data-smoke-results]')!

/** What the checks hand on to each other. */
let original: Uint8Array | undefined
let engine: Engine | undefined
let viewer: Viewer | undefined
let saved: Uint8Array | undefined
let redacted: Uint8Array | undefined
let mark: Quad[] | undefined

/** The viewer's documents as each becomes ready; a redaction opens a new one. */
const ready: InkDocument[] = []

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`no ${what}: an earlier check failed`)
  return value
}

const currentDoc = (): InkDocument =>
  need(viewer?.document.get() ?? undefined, 'open document')
const firstPage = (): HTMLElement | null => host.querySelector('.ink-page[data-page="0"]')
const textLayerText = (): string =>
  firstPage()?.querySelector('[data-ink-text-layer]')?.textContent ?? ''

/**
 * Where page 1 draws `text`, from its text items, which hold each value of the fixture as a run
 * of its own. Search is a check of its own, so the other checks do not lean on it.
 */
async function quadsOf(doc: InkDocument, text: string): Promise<Quad[]> {
  const { items } = await doc.text(0)
  const item = items.find((i) => i.str.trim() === text)
  assert(item, `page 1 has no text item ${text}`)
  return [item.quad]
}

/** Opens `bytes` with core on their own, for reading back: no viewer, no engine. */
async function reopen(bytes: Uint8Array): Promise<InkDocument> {
  const { openDocument } = await import('@inkbar/core')
  const doc = await openDocument(
    { data: bytes.slice(), key: `smoke-${Date.now()}` },
    { assets }
  )
  await doc.ready
  return doc
}

const checks: SmokeCheck[] = [
  {
    name: 'engine loads in a worker and opens the file',
    timeout: 60_000,
    async run() {
      const response = await fetch(FIXTURE)
      assert(response.ok, `fetching the fixture gave HTTP ${response.status}`)
      original = new Uint8Array(await response.arrayBuffer())
      const { createEngine } = await engineLoader()
      // In a browser the engine runs PDFium in a Web Worker unless told otherwise.
      engine = await createEngine()
      const doc = await engine.open(original.slice())
      try {
        assert(
          doc.pageCount === PAGES,
          `expected ${PAGES} page, the engine read ${doc.pageCount}`
        )
      } finally {
        await doc.close()
      }
    },
  },
  {
    name: 'page renders',
    timeout: 30_000,
    async run() {
      const bytes = need(original, 'fixture')
      viewer = createViewer(host, {
        source: { data: bytes.slice(), key: 'smoke' },
        assets,
        tools: [drawTool()],
        engine: engineLoader,
        // Applies without the dialog: the page has no one to answer it.
        redactionConfirm: () => Promise.resolve(true),
        onReady: (doc) => ready.push(doc),
        onRedacted: ({ bytes }) => (redacted = bytes),
        onError: (error) => console.error('viewer error', error),
      })
      const bar = createToolbar({ messages: viewer.messages })
      bar.append(
        createToolButton(viewer, 'select-text'),
        createToolButton(viewer, 'draw')
      )
      viewer.element.prepend(bar)
      await until('the document opening', () => ready.length > 0, 20_000)
      const canvas = await until(
        'the page canvas',
        () => firstPage()?.querySelector<HTMLCanvasElement>('canvas[data-ink-canvas]'),
        20_000
      )
      assert(canvas.width > 0 && canvas.height > 0, 'the page canvas has no size')
      const context = canvas.getContext('2d')
      assert(context, 'the page canvas gave no 2D context')
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
      // Pages are painted on opaque white; text and rules are anything darker.
      let inked = 0
      for (let i = 0; i < data.length; i += 4 * 7)
        if (data[i]! < 200 || data[i + 1]! < 200 || data[i + 2]! < 200) inked++
      assert(inked > 50, `the page canvas is blank (${inked} dark samples)`)
    },
  },
  {
    name: 'text layer holds the page text',
    timeout: 15_000,
    async run() {
      await until('the text layer', () => textLayerText().includes(SECRET), 10_000)
    },
  },
  {
    name: 'an annotation added through the model shows',
    timeout: 15_000,
    async run() {
      const doc = currentDoc()
      const quads = await quadsOf(doc, 'Margaret Okafor')
      doc.annotations.add({ id: HIGHLIGHT_ID, type: 'highlight', page: 0, quads })
      await until(
        'the highlight element',
        () => host.querySelector(`[data-annotation="${HIGHLIGHT_ID}"]`),
        10_000
      )
    },
  },
  {
    name: 'save writes the annotation into the file',
    timeout: 45_000,
    async run() {
      saved = await currentDoc().save()
      assert(startsWithPdf(saved), 'the saved bytes do not start with %PDF-')
      const doc = await reopen(saved)
      try {
        await until(
          'the saved highlight coming back',
          () => doc.annotations.list.get().some((a) => a.id === HIGHLIGHT_ID),
          10_000
        )
      } finally {
        doc.destroy()
      }
    },
  },
  {
    name: 'applying a redaction removes the text',
    timeout: 60_000,
    async run() {
      const doc = currentDoc()
      mark = padded(await quadsOf(doc, SECRET), 1)
      doc.annotations.add({ type: 'redact', page: 0, quads: mark })
      const before = ready.length
      const result = await need(viewer, 'viewer').applyRedactions()
      assert(result, 'the apply gave no result: it failed or was cancelled')
      assert(result.marks === 1, `expected 1 mark applied, got ${result.marks}`)
      const bytes = need(redacted, 'redacted file from onRedacted')
      assert(startsWithPdf(bytes), 'the redacted bytes do not start with %PDF-')
      await until('the viewer reopening', () => ready.length > before, 20_000)
      // The new text layer: the other text is there and the redacted text is not.
      await until(
        'a text layer without the redacted text',
        () => {
          const text = textLayerText()
          return text.includes(KEPT) && !text.includes(SECRET_DIGITS)
        },
        10_000
      )
      // The viewer says how many redactions it applied; close that, so the pages take input.
      const ok = await until(
        'the message saying the redaction was applied',
        // The message box sits on <body>, outside the viewer.
        () => document.querySelector<HTMLButtonElement>('[data-ink-form-alert-ok]'),
        10_000
      )
      ok.click()
      const back = await reopen(bytes)
      try {
        const hits = await back.search(SECRET_DIGITS).all()
        assert(
          hits.length === 0,
          `the redacted file still holds the text (${hits.length} hits)`
        )
        assert(
          (await back.search(KEPT).all()).length > 0,
          'the redacted file lost the other text'
        )
      } finally {
        back.destroy()
      }
    },
  },
  {
    name: 'checkRedaction finds the region clean',
    timeout: 30_000,
    async run() {
      // The engine takes Gloss quads: the same corners, as plain objects.
      const quads = need(mark, 'mark').map(({ p1, p2, p3, p4 }) => ({
        p1: { ...p1 },
        p2: { ...p2 },
        p3: { ...p3 },
        p4: { ...p4 },
      }))
      const findings = await need(engine, 'engine').checkRedaction(
        need(redacted, 'redacted file'),
        { regions: [{ page: 0, quads }] }
      )
      const verdicts = findings.candidates.map((c) => c.verdict)
      assert(verdicts.length === 1, `expected 1 region checked, got ${verdicts.length}`)
      assert(verdicts[0] === 'clean', `the region is ${verdicts[0]}`)
    },
  },
  {
    name: 'download hands over the file',
    timeout: 20_000,
    async run() {
      const expected = need(redacted, 'redacted file')
      // Catch the link Download clicks, so the browser keeps its download UI out of the way.
      let href: string | undefined
      const catcher = (event: MouseEvent) => {
        const link = event.target
        if (link instanceof HTMLAnchorElement && link.hasAttribute('download')) {
          event.preventDefault()
          href = link.href
        }
      }
      document.addEventListener('click', catcher, true)
      try {
        await need(viewer, 'viewer').download()
      } finally {
        document.removeEventListener('click', catcher, true)
      }
      assert(href, 'Download clicked no link')
      const blob = await (await fetch(href)).blob()
      assert(
        blob.size === expected.length,
        `the download is ${blob.size} bytes, the file ${expected.length}`
      )
      assert(
        startsWithPdf(new Uint8Array(await blob.slice(0, 5).arrayBuffer())),
        'the download is not a PDF'
      )
    },
  },
  {
    name: 'search finds a word',
    timeout: 15_000,
    async run() {
      const hits = await currentDoc().search(WORD).all()
      assert(hits.length > 0, `search found no ${WORD}`)
    },
  },
]

void runChecks(checks, out).finally(() => {
  void engine?.destroy()
})
