/*
 * The checks, written once for all four front ends. They find the viewer's controls by the
 * markup the four share (`data-ink-undo`, `data-tool`, `data-ink-page-input` and so on) and press
 * them as a reader would, and reach the rest through the front end (`Front`): opening another
 * file, changing the language and the binding's own apply. Script stands in for the reader where
 * a page cannot make trusted input (typing, selecting text); those checks say so in their names.
 */
import { fr } from '@inkbar/core/locales/fr'
import { assets } from 'virtual:inkbar-assets'

import { SkipCheck, type SmokeCheck } from './run.ts'

import type { Front, MountFront } from './front.ts'
import type { InkDocument, Quad, RedactionResult } from '@inkbar/core'
import type { Engine, WriteInput } from '@inkbar/engine'

const BASE = import.meta.env.BASE_URL
/** One page of three made-up customer records. */
const RECORDS = `${BASE}documents/redactions.pdf`
/** A two-page form; page 2's total is calculated by a script. */
const FORM = `${BASE}documents/form.pdf`
/** About sixteen pages, with an outline and a contents page of links. */
const HANDBOOK = `${BASE}documents/handbook.pdf`
/** The letter, encrypted; its password is "inkbar". */
const LOCKED = `${BASE}documents/locked.pdf`
const PASSWORD = 'inkbar'

/** Text the first record holds once, which the redaction removes. */
const SECRET = '07700 900123'
const SECRET_DIGITS = '900123'
/** Text that stays after the redaction. */
const KEPT = 'Customer record'
/** A word search must find. */
const WORD = 'Marlowby'
/** Text the selection covers. */
const SELECTED = 'March 2019'
const HIGHLIGHT_ID = 'smoke-highlight'

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

/** An earlier check's result, or a skip that names what is missing. */
function need<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null)
    throw new SkipCheck(`skipped: no ${what}, as an earlier check failed`)
  return value
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

/** The axis-aligned bounds of some quads, in PDF user space. */
function bounds(quads: readonly Quad[]) {
  const xs = quads.flatMap((q) => [q.p1.x, q.p2.x, q.p3.x, q.p4.x])
  const ys = quads.flatMap((q) => [q.p1.y, q.p2.y, q.p3.y, q.p4.y])
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    bottom: Math.min(...ys),
    top: Math.max(...ys),
  }
}

/** How many sampled pixels of a canvas are darker than near-white paper. */
function inked(canvas: HTMLCanvasElement): number {
  assert(canvas.width > 0 && canvas.height > 0, 'the canvas has no size')
  const context = canvas.getContext('2d')
  assert(context, 'the canvas gave no 2D context')
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  let count = 0
  for (let i = 0; i < data.length; i += 4 * 7)
    if (data[i]! < 200 || data[i + 1]! < 200 || data[i + 2]! < 200) count++
  return count
}

/**
 * Puts `value` in an input as typing would, through the element's own value setter, so a
 * framework that tracks the value (React) sees the change, then fires `input`.
 */
function typeInto(input: HTMLInputElement, value: string): void {
  input.focus()
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
    input,
    value
  )
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
}

const pressEnter = (el: Element): boolean =>
  el.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  )

/** Milliseconds since `from`, rounded. */
const since = (from: number): number => Math.round(performance.now() - from)

/** The fields the form check changes and the ones its scripts calculate from them. */
const FORM_FIELDS = ['name', 'price', 'qty', 'total', 'due']

/**
 * The engine's open, write, save and destroy on `bytes`, each timed, on an engine of its own:
 * the path a save takes, without the rest of the library around it.
 */
async function engineStages(
  label: string,
  bytes: Uint8Array,
  input: WriteInput
): Promise<string> {
  const parts: string[] = []
  let at = performance.now()
  try {
    const { createEngine } = await import('@inkbar/engine')
    const engine = await createEngine()
    parts.push(`start ${since(at)} ms`)
    try {
      at = performance.now()
      const doc = await engine.open(bytes.slice())
      parts.push(`open ${since(at)} ms`)
      at = performance.now()
      await doc.write(input)
      parts.push(`write ${since(at)} ms`)
      at = performance.now()
      await doc.save()
      parts.push(`save ${since(at)} ms`)
      await doc.close()
    } finally {
      at = performance.now()
      await engine.destroy()
      parts.push(`destroy ${since(at)} ms`)
    }
  } catch (error) {
    parts.push(`failed after ${since(at)} ms: ${String(error)}`)
  }
  return `${label}: ${parts.join(', ')}`
}

/**
 * Before the timed save: how long PDF.js takes to hand over the file's bytes (the queue the save
 * waits in), then the engine path on those bytes with the form values the save writes.
 */
async function stagesBeforeSave(
  doc: InkDocument,
  note: (text: string) => void
): Promise<void> {
  try {
    const at = performance.now()
    const bytes = await doc.getData()
    note(`getData ${since(at)} ms`)
    const formatted = doc.form.formatted.get()
    const fields: Record<string, { value: string; text?: string }> = {}
    for (const name of FORM_FIELDS) {
      const value = doc.form.get(name)
      if (typeof value !== 'string' && typeof value !== 'number') continue
      const text = formatted[name]
      fields[name] = { value: String(value), ...(text ? { text } : {}) }
    }
    note(
      await engineStages(
        `own engine, form, ${Object.keys(fields).length} fields`,
        bytes,
        { fields }
      )
    )
  } catch (error) {
    note(`the stages before the save failed: ${String(error)}`)
  }
}

/**
 * After the timed save: a second save with nothing changed (the library keeps the written copy
 * until the next change), and the engine path on the records file with one annotation, for
 * contrast with the form.
 */
async function stagesAfterSave(
  doc: InkDocument,
  note: (text: string) => void
): Promise<void> {
  try {
    const at = performance.now()
    await doc.save()
    note(`second save, nothing changed: ${since(at)} ms`)
    const response = await fetch(RECORDS)
    const bytes = new Uint8Array(await response.arrayBuffer())
    const rect = { x: 72, y: 72, width: 40, height: 20 }
    const square: WriteInput = {
      annotations: [
        {
          page: 0,
          annotation: {
            id: 'smoke-square',
            type: 'square',
            page: 0,
            rect,
            opacity: 1,
            width: 1,
          },
          appearance: {
            bounds: rect,
            content: new TextEncoder().encode('0 G 1 w 72.5 72.5 39 19 re S'),
          },
          data: '{}',
        },
      ],
    }
    note(await engineStages('own engine, records file, 1 annotation', bytes, square))
  } catch (error) {
    note(`the stages after the save failed: ${String(error)}`)
  }
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

/**
 * The checks for one front end, mounted into `host` on the second check, and `finish`, which
 * stops the engine the first check started.
 */
export function smokeChecks(
  mountFront: MountFront,
  host: HTMLElement
): { checks: SmokeCheck[]; finish: () => Promise<void> } {
  /** What the checks hand on to each other. */
  let original: Uint8Array | undefined
  let engine: Engine | undefined
  let front: Front | undefined
  let apply: (() => Promise<RedactionResult | null>) | undefined
  let saved: Uint8Array | undefined
  let redacted: Uint8Array | undefined
  let mark: Quad[] | undefined
  let formOpen = false
  let handbookOpen = false
  let askedForPassword = false
  /** The viewer's documents as each becomes ready: opening and redacting add one. */
  const docs: InkDocument[] = []

  const root = (): HTMLElement | null => host.querySelector('[data-ink-root]')
  const state = (): string | undefined => root()?.dataset.state
  const currentDoc = (): InkDocument => need(docs.at(-1), 'open document')
  const page = (n: number): HTMLElement | null =>
    host.querySelector(`.ink-page[data-page="${n}"]`)
  const textLayerText = (): string =>
    page(0)?.querySelector('[data-ink-text-layer]')?.textContent ?? ''
  const control = <T extends HTMLElement = HTMLButtonElement>(selector: string): T =>
    need(host.querySelector<T>(selector), `control ${selector}`)
  const toolButton = (tool: string) =>
    control(`button[data-ink-tool-button][data-tool="${tool}"]`)
  const currentPage = (): string =>
    host.querySelector<HTMLInputElement>('[data-ink-page-input]')?.value ?? ''

  /** Presses an enabled control, once it is enabled. */
  async function press(selector: string): Promise<void> {
    const button = control(selector)
    await until(`${selector} enabled`, () => !button.disabled, 5_000)
    button.click()
  }

  /** Opens `url` the front end's own way and waits for it to be ready. */
  async function openUrl(url: string): Promise<InkDocument> {
    const f = need(front, 'viewer')
    const before = docs.length
    f.open(url)
    await until(
      `${url} opening`,
      () => docs.length > before && state() === 'ready',
      20_000
    )
    return currentDoc()
  }

  /** Where page 1 draws `text`, from its text items, which hold each value as a run of its own. */
  async function quadsOf(doc: InkDocument, text: string): Promise<Quad[]> {
    const { items } = await doc.text(0)
    const item = items.find((i) => i.str.trim() === text)
    assert(item, `page 1 has no text item ${text}`)
    return [item.quad]
  }

  /** Presses Open in the password prompt once the binding has taken the typed value. */
  async function submitPassword(): Promise<void> {
    const open = await until(
      'Open enabled in the password prompt',
      () => {
        const b = document.querySelector<HTMLButtonElement>(
          '[data-ink-password-form] button[type="submit"]'
        )
        return b && !b.disabled && b
      },
      5_000
    )
    open.click()
  }

  const hasHighlight = (): boolean =>
    host.querySelector(`[data-annotation="${HIGHLIGHT_ID}"]`) !== null

  const checks: SmokeCheck[] = [
    {
      name: 'engine loads in a worker and opens the file',
      timeout: 60_000,
      async run() {
        const response = await fetch(RECORDS)
        assert(response.ok, `fetching the file gave HTTP ${response.status}`)
        original = new Uint8Array(await response.arrayBuffer())
        const { createEngine } = await import('@inkbar/engine')
        // In a browser the engine runs PDFium in a Web Worker unless told otherwise.
        engine = await createEngine()
        const doc = await engine.open(original.slice())
        try {
          assert(doc.pageCount === 1, `expected 1 page, the engine read ${doc.pageCount}`)
        } finally {
          await doc.close()
        }
      },
    },
    {
      name: 'page renders',
      timeout: 30_000,
      async run() {
        const bytes = need(original, 'file')
        front = mountFront(host, {
          source: { data: bytes.slice(), key: 'smoke' },
          messages: undefined,
          onReady: (doc) => docs.push(doc),
          onRedacted: (b) => (redacted = b),
          onApply: (fn) => (apply = fn),
        })
        await until('the document opening', () => docs.length > 0, 20_000)
        const canvas = await until(
          'the page canvas',
          () => page(0)?.querySelector<HTMLCanvasElement>('canvas[data-ink-canvas]'),
          20_000
        )
        const dark = inked(canvas)
        assert(dark > 50, `the page canvas is blank (${dark} dark samples)`)
      },
    },
    {
      name: 'text layer holds the page text',
      timeout: 15_000,
      async run() {
        need(front, 'viewer')
        await until('the text layer', () => textLayerText().includes(SECRET), 10_000)
      },
    },
    {
      name: 'thumbnails render',
      timeout: 15_000,
      async run() {
        need(front, 'viewer')
        // A thumbnail paints only near the visible part of the page. On a phone the panel sits
        // below the fold, under the results and the pages, so bring it into view.
        const list = control<HTMLElement>('[data-ink-thumbnails]')
        list.scrollIntoView({ block: 'nearest' })
        const canvas = await until(
          'a thumbnail canvas',
          () =>
            host.querySelector<HTMLCanvasElement>(
              '[data-ink-thumbnails] canvas[data-ink-canvas]'
            ),
          10_000
        )
        const dark = await until(
          'a painted thumbnail',
          () => inked(canvas) || false,
          5_000
        )
        assert(dark > 10, `the thumbnail is blank (${dark} dark samples)`)
      },
    },
    {
      name: 'an annotation added through the model shows',
      timeout: 15_000,
      async run() {
        const doc = currentDoc()
        const quads = await quadsOf(doc, 'Margaret Okafor')
        doc.annotations.add({ id: HIGHLIGHT_ID, type: 'highlight', page: 0, quads })
        await until('the highlight element', hasHighlight, 10_000)
      },
    },
    {
      name: 'undo removes the annotation and redo restores it',
      timeout: 15_000,
      async run() {
        if (!hasHighlight()) throw new SkipCheck('skipped: no annotation was added')
        await press('[data-ink-undo]')
        await until('the highlight going', () => !hasHighlight(), 5_000)
        await press('[data-ink-redo]')
        await until('the highlight coming back', hasHighlight, 5_000)
      },
    },
    {
      name: 'save writes the annotation into the file',
      timeout: 45_000,
      async run() {
        if (!hasHighlight()) throw new SkipCheck('skipped: no annotation was added')
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
      name: 'a text selection made by script becomes a highlight',
      timeout: 15_000,
      async run() {
        const doc = currentDoc()
        const span = await until(
          `the text layer's ${SELECTED}`,
          () =>
            [
              ...(page(0)?.querySelectorAll<HTMLElement>('[data-ink-text-layer] span') ??
                []),
            ].find((s) => s.textContent?.trim() === SELECTED),
          10_000
        )
        await press('button[data-ink-tool-button][data-tool="highlight"]')
        await until(
          'the highlight tool',
          () => toolButton('highlight').getAttribute('aria-pressed') === 'true',
          5_000
        )
        const highlights = () =>
          doc.annotations.list.get().filter((a) => a.type === 'highlight')
        const before = highlights().length
        const range = document.createRange()
        range.selectNodeContents(span)
        const selection = window.getSelection()
        assert(selection, 'the page has no selection object')
        selection.removeAllRanges()
        selection.addRange(range)
        // Enter in the pages turns the selection into the tool's mark, as the keyboard does.
        pressEnter(span)
        const made = await until(
          'a highlight from the selection',
          () => highlights().length > before && highlights().at(-1),
          5_000
        )
        selection.removeAllRanges()
        await press('button[data-ink-tool-button][data-tool="select-text"]')
        assert(
          made.type === 'highlight' && made.quads.length > 0,
          'the highlight has no quads'
        )
        const got = bounds(made.quads)
        const want = bounds(await quadsOf(doc, SELECTED))
        const midX = (want.left + want.right) / 2
        const midY = (want.top + want.bottom) / 2
        assert(
          got.left <= midX && midX <= got.right && got.bottom <= midY && midY <= got.top,
          `the highlight (${JSON.stringify(got)}) does not lie over ${SELECTED} (${JSON.stringify(want)})`
        )
      },
    },
    {
      name: 'print prepares the file without printing',
      timeout: 30_000,
      async run() {
        need(front, 'viewer')
        // The frame Print loads the file into is taken away before it loads, so nothing prints;
        // iOS opens a tab instead, which `window.open` here only records.
        const frames: HTMLIFrameElement[] = []
        const observer = new MutationObserver((records) => {
          for (const r of records)
            for (const node of r.addedNodes)
              if (
                node instanceof HTMLIFrameElement &&
                node.hasAttribute('data-ink-print-frame')
              ) {
                frames.push(node)
                node.remove()
              }
        })
        observer.observe(document.body, { childList: true })
        const opened: string[] = []
        const realOpen = Object.getOwnPropertyDescriptor(window, 'open')
        window.open = (url?: string | URL) => {
          opened.push(String(url ?? ''))
          return null
        }
        let url: string
        try {
          await press('[data-ink-print]')
          url = await until(
            'the print copy',
            () => frames[0]?.src || opened.find((u) => u.startsWith('blob:')),
            20_000
          )
        } finally {
          observer.disconnect()
          // `open` is the window's own property in browsers; if not, the prototype's shows again.
          if (realOpen) Object.defineProperty(window, 'open', realOpen)
          else Reflect.deleteProperty(window, 'open')
        }
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
        assert(startsWithPdf(bytes), 'the print copy is not a PDF')
        const doc = await reopen(bytes)
        try {
          assert(doc.pages.length === 1, `the print copy has ${doc.pages.length} pages`)
        } finally {
          doc.destroy()
        }
      },
    },
    {
      name: 'switching to French relabels the toolbar in place',
      timeout: 10_000,
      async run() {
        const f = need(front, 'viewer')
        const label = () => control('[data-ink-apply-redactions]').textContent?.trim()
        const english = label()
        f.setMessages(fr)
        await until(
          'the French label',
          () => label() === fr.viewer.applyRedactions,
          5_000
        )
        f.setMessages(undefined)
        await until('the English label again', () => label() === english, 5_000)
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
    {
      name: "applying a redaction through the binding's own apply removes the text",
      timeout: 60_000,
      async run() {
        const doc = currentDoc()
        const applyMarks = need(apply, "binding's apply")
        mark = padded(await quadsOf(doc, SECRET), 1)
        doc.annotations.add({ type: 'redact', page: 0, quads: mark })
        const before = docs.length
        const result = await applyMarks()
        assert(result, 'the apply gave no result: it failed or was cancelled')
        assert(result.marks === 1, `expected 1 mark applied, got ${result.marks}`)
        const bytes = redacted
        assert(bytes, 'the redacted event or callback did not fire')
        assert(startsWithPdf(bytes), 'the redacted bytes do not start with %PDF-')
        await until('the viewer reopening', () => docs.length > before, 20_000)
        await until(
          'a text layer without the redacted text',
          () => {
            const text = textLayerText()
            return text.includes(KEPT) && !text.includes(SECRET_DIGITS)
          },
          10_000
        )
        // The viewer says how many redactions it applied; close that, so the pages take input.
        // The message box sits on <body>, outside the viewer.
        const ok = await until(
          'the message saying the redaction was applied',
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
      name: 'after a redaction no undo step remains',
      timeout: 10_000,
      async run() {
        need(redacted, 'redacted file')
        const doc = currentDoc()
        assert(!doc.history.canUndo.get(), "the redacted document's history can undo")
        const undo = control('[data-ink-undo]')
        await until('Undo disabled', () => undo.disabled, 5_000)
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
          await press('[data-ink-download]')
          await until('Download clicking its link', () => href, 10_000)
        } finally {
          document.removeEventListener('click', catcher, true)
        }
        const blob = await (await fetch(need(href, 'download link'))).blob()
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
      name: 'a form text field takes text typed by script',
      timeout: 30_000,
      async run() {
        const doc = await openUrl(FORM)
        formOpen = true
        const input = await until(
          'the name field',
          () => page(0)?.querySelector<HTMLInputElement>('[data-ink-field="name"] input'),
          10_000
        )
        typeInto(input, 'Robin Hale')
        pressEnter(input)
        input.blur()
        await until('the name stored', () => doc.form.get('name') === 'Robin Hale', 5_000)
      },
    },
    {
      name: "a calculated field updates (the form's scripts run)",
      timeout: 30_000,
      async run() {
        if (!formOpen) throw new SkipCheck('skipped: the form did not open')
        const doc = currentDoc()
        const field = (name: string) =>
          until(
            `the ${name} field`,
            () =>
              page(1)?.querySelector<HTMLInputElement>(
                `[data-ink-field="${name}"] input`
              ),
            10_000
          )
        for (const [name, value] of [
          ['price', '12.5'],
          ['qty', '3'],
        ] as const) {
          const input = await field(name)
          typeInto(input, value)
          pressEnter(input)
          input.blur()
        }
        const total = await field('total')
        // The total's own format script writes it in pounds.
        await until(
          'the total calculated',
          () => Number(doc.form.get('total')) === 37.5 && total.value.includes('37.50'),
          10_000
        )
      },
    },
    {
      name: 'form values survive a save and reopen',
      timeout: 45_000,
      async run(note) {
        if (!formOpen) throw new SkipCheck('skipped: the form did not open')
        const viewed = currentDoc()
        // Notes only: where a slow save spends its time, stage by stage. They never fail the
        // check.
        note(
          `${navigator.hardwareConcurrency} logical processors, ${crossOriginIsolated ? '' : 'not '}cross-origin isolated`
        )
        await stagesBeforeSave(viewed, note)
        const t0 = performance.now()
        const formSaved = await viewed.save()
        const t1 = performance.now()
        // The reopened form starts its own script sandbox before it is ready.
        const doc = await reopen(formSaved)
        const t2 = performance.now()
        note(`save ${Math.round(t1 - t0)} ms, reopen ${Math.round(t2 - t1)} ms`)
        await stagesAfterSave(viewed, note)
        try {
          assert(
            doc.form.get('name') === 'Robin Hale',
            `name is ${JSON.stringify(doc.form.get('name'))}`
          )
          assert(
            Number(doc.form.get('total')) === 37.5,
            `total is ${JSON.stringify(doc.form.get('total'))}`
          )
          // Whether the reopened form's scripts run: a new quantity recalculates the total.
          doc.form.set({ qty: '4' })
          const ran = await until(
            'the reopened total',
            () => Number(doc.form.get('total')) === 50,
            2_000
          ).catch(() => false)
          note(`the reopened form's scripts ${ran ? 'ran' : 'did not run within 2 s'}`)
        } finally {
          doc.destroy()
        }
      },
    },
    {
      name: 'an internal link, activated by script, changes the page',
      timeout: 30_000,
      async run() {
        await openUrl(HANDBOOK)
        handbookOpen = true
        const link = await until(
          'an internal link',
          () => host.querySelector<HTMLElement>('.ink-page [data-ink-link][role="link"]'),
          10_000
        )
        const from = currentPage()
        link.click()
        await until('the page changing', () => currentPage() !== from, 10_000)
      },
    },
    {
      name: 'the outline lists entries and one changes the page',
      timeout: 20_000,
      async run() {
        if (!handbookOpen) throw new SkipCheck('skipped: the handbook did not open')
        const items = await until(
          'outline entries',
          () => {
            const found = host.querySelectorAll<HTMLElement>(
              '[data-ink-outline] [role="treeitem"]'
            )
            return found.length > 1 && [...found]
          },
          10_000
        )
        const from = currentPage()
        // The last top-level entry is far from wherever the link went.
        const last = items.filter((i) => i.getAttribute('aria-level') === '1').at(-1)
        // Only an entry's row takes a press, not the item around it.
        need(last?.querySelector<HTMLElement>('.ink-outline-row'), 'outline row').click()
        await until('the page changing', () => currentPage() !== from, 10_000)
      },
    },
    {
      name: 'a locked file asks for its password and refuses a wrong one',
      timeout: 30_000,
      async run() {
        const f = need(front, 'viewer')
        f.open(LOCKED)
        const input = await until(
          'the password prompt',
          () =>
            state() === 'locked' &&
            document.querySelector<HTMLInputElement>(
              '[data-ink-password-dialog] input[type="password"]'
            ),
          20_000
        )
        askedForPassword = true
        typeInto(input, 'not-the-password')
        await submitPassword()
        await until(
          'the wrong password refused',
          () =>
            document
              .querySelector('[data-ink-password-dialog] input[type="password"]')
              ?.getAttribute('aria-invalid') === 'true',
          10_000
        )
        assert(state() === 'locked', `the viewer is ${state()}, not locked`)
      },
    },
    {
      name: 'the right password opens the locked file',
      timeout: 30_000,
      async run() {
        if (!askedForPassword) throw new SkipCheck('skipped: no password prompt appeared')
        const input = document.querySelector<HTMLInputElement>(
          '[data-ink-password-dialog] input[type="password"]'
        )
        assert(input, 'the password prompt closed')
        const before = docs.length
        typeInto(input, PASSWORD)
        await submitPassword()
        await until(
          'the file opening',
          () => docs.length > before && state() === 'ready',
          15_000
        )
        await until(
          'its page canvas',
          () => page(0)?.querySelector('canvas[data-ink-canvas]'),
          10_000
        )
      },
    },
  ]
  return { checks, finish: async () => void (await engine?.destroy()) }
}
