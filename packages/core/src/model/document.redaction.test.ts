import { EngineError } from '@inkbar/engine'
import { fixtureBytes, manifest, type FixtureName } from '@inkbar/fixtures'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'

import { openDocument, type InkDocument, type OpenOptions } from './document'

import type { Annotation } from './annotations/types'
import type { Quad } from './geometry'
import type { EngineLoader } from './save/saver'
import type {
  CheckRedactionOptions,
  Engine,
  EngineDocument,
  RedactInput,
  RedactResult,
  RedactionCandidate,
  WriteInput,
} from '@inkbar/engine'

const quad = (x: number, y: number, width: number, height: number): Quad => ({
  p1: { x, y: y + height },
  p2: { x: x + width, y: y + height },
  p3: { x, y },
  p4: { x: x + width, y },
})

/** Over SECRET-ALPHA in `redact-text`: the fixture's region. */
const SECRET = { x: 45, y: 190, width: 170, height: 35 }
/** Over KEEP-BETA in `redact-text`, which starts at x 300 on the baseline y 200. */
const KEEP = quad(300, 195, 110, 22)

const nothingSanitised: RedactResult['sanitised'] = {
  metadata: false,
  attachments: 0,
  scripts: false,
  thumbnails: false,
  privateData: false,
}

/**
 * A stand-in engine that records its calls and what each `redact` and check is given. Its calls
 * run one at a time in the order they were made. A redaction applies every mark, on its page,
 * unless `pages` says otherwise; the check finds every region clean unless `verdicts` says
 * otherwise. `hold(op)` holds the next call of that kind until `release`.
 */
function fakeEngine() {
  const calls: string[] = []
  const redactions: RedactInput[] = []
  const checks: CheckRedactionOptions[] = []
  let held: string | undefined
  let release: (() => void) | undefined
  const state: {
    pages?: RedactResult['pages']
    /** Inkbar's earlier locked marks the redaction reports it applied, by region. */
    ownLockedRegions?: { page: number; quads: Quad[] }[]
    verdicts?: RedactionCandidate['verdict'][]
    failRedact?: Error
    failCheck?: Error
    /** Rewrites the candidates the check answers with. */
    answer?: (candidates: RedactionCandidate[]) => RedactionCandidate[]
  } = {}
  let engines = 0
  const createEngine = vi.fn(() => {
    const n = ++engines
    let queue: Promise<unknown> = Promise.resolve()
    const queued = <T>(op: string, work: () => T | Promise<T>): Promise<T> => {
      const result = queue.then(async () => {
        calls.push(`${op} ${n}`)
        if (held === op) {
          held = undefined
          await new Promise<void>((r) => (release = r))
        }
        return work()
      })
      queue = result.catch(() => undefined)
      return result
    }
    const doc: EngineDocument = {
      pageCount: 1,
      pageInfo: () => Promise.reject(new Error('unused')),
      renderPage: () => Promise.reject(new Error('unused')),
      write: (_input: WriteInput) => queued('write', () => undefined),
      redact: (input) =>
        queued('redact', () => {
          redactions.push(input)
          if (state.failRedact) throw state.failRedact
          const counts = new Map<number, number>()
          for (const m of input.marks) counts.set(m.page, (counts.get(m.page) ?? 0) + 1)
          return {
            pages:
              state.pages ??
              [...counts].map(([page, marks]) => ({
                page,
                marks,
                annotationsRemoved: 0,
              })),
            ownLockedMarks: (state.ownLockedRegions ?? []).reduce(
              (n, r) => n + r.quads.length,
              0
            ),
            // Core's quads stand in for Gloss quads, which only add an index signature.
            ownLockedRegions: (state.ownLockedRegions ??
              []) as RedactResult['ownLockedRegions'],
            foreignMarks: 0,
            fieldsSkipped: [],
            sanitised: nothingSanitised,
            hiddenLayers: false,
            signed: false,
          }
        }),
      save: () => queued('save', () => new TextEncoder().encode('%PDF-redacted')),
      close: () => queued('close', () => undefined),
    }
    const engine: Engine = {
      open: () => queued('open', () => doc),
      checkRedaction: (_bytes, options = {}) =>
        queued('check', () => {
          checks.push(options)
          if (state.failCheck) throw state.failCheck
          const answered = (options.regions ?? []).map((r, i): RedactionCandidate => ({
            page: r.page,
            region: i,
            rect: { x: r.quads[0]!.p3.x, y: r.quads[0]!.p3.y, width: 1, height: 1 },
            kind: 'region' as const,
            text: 'none' as const,
            image: 'none' as const,
            drawing: 'none' as const,
            verdict: state.verdicts?.[i] ?? 'clean',
          }))
          return {
            candidates: state.answer ? state.answer(answered) : answered,
            file: {
              earlierVersions: 0,
              metadata: false,
              attachments: 0,
              scripts: false,
              hiddenLayers: false,
              signed: false,
            },
          }
        }),
      destroy() {
        calls.push(`destroy ${n}`)
        return Promise.resolve()
      },
    }
    return Promise.resolve(engine)
  })
  const loader = vi.fn<EngineLoader>(() => Promise.resolve({ createEngine }))
  return {
    calls,
    redactions,
    checks,
    state,
    loader,
    hold: (op: string) => (held = op),
    release: () => release?.(),
  }
}

/**
 * A loader that gives the real engine, in this thread. `last` keeps the last engine made, so a
 * test can check bytes with it.
 */
function realEngine() {
  const made: Engine[] = []
  const loader: EngineLoader = async () => {
    const m = await import('@inkbar/engine')
    return {
      createEngine: async () => {
        const engine = await m.createEngine({ worker: false })
        made.push(engine)
        return engine
      },
    }
  }
  return { loader, made }
}

/** Every document a test opened, with the bytes it was opened from. */
const opened: { doc: InkDocument; bytes: Uint8Array }[] = []

afterEach(async () => {
  const docs = opened.splice(0)
  try {
    // Whatever was applied, the document's own data stays the bytes it was opened from.
    for (const { doc, bytes } of docs)
      if (doc.status.get().state === 'ready') expect(await doc.getData()).toEqual(bytes)
  } finally {
    docs.forEach(({ doc }) => doc.destroy())
  }
})

async function openBytes(bytes: Uint8Array, opts: Partial<OpenOptions> = {}) {
  // PDF.js detaches what it is given, so it gets a copy and the original stays to compare.
  const doc = await openDocument(bytes.slice(), {
    assets: nodeAssets(),
    verbosity: 0,
    ...opts,
  })
  opened.push({ doc, bytes })
  await doc.ready
  await doc._liftSettled
  return doc
}

async function open(name: FixtureName, opts: Partial<OpenOptions> = {}) {
  const password = manifest[name].password
  return openBytes(await fixtureBytes(name), {
    ...(password ? { password } : {}),
    ...opts,
  })
}

/** Leaves `doc` out of the closing data check: a destroyed document has no data. */
function forget(doc: InkDocument): void {
  opened.splice(
    opened.findIndex((o) => o.doc === doc),
    1
  )
}

const markOver = (doc: InkDocument, rect = SECRET, page = 0) =>
  doc.annotations.add({ type: 'redact', page, rect, interiorColor: '#000000' })

const session = (doc: InkDocument) =>
  doc.annotations.list.get().filter((a) => a.source === 'session')

describe('applyRedactions', () => {
  it('resolves with redacted bytes and a result and leaves the document as it was', async () => {
    const fake = fakeEngine()
    const doc = await open('redact-text', { engine: fake.loader })
    const mark = markOver(doc)
    const kept = doc.annotations.add({ type: 'highlight', page: 0, quads: [KEEP] })
    const before = doc.annotations.list.get()
    expect(doc.changed.get()).toBe(true)

    const { bytes, result } = await doc.applyRedactions()

    expect(new TextDecoder().decode(bytes)).toBe('%PDF-redacted')
    const { findings, ...counts } = result
    expect(counts).toEqual({
      marks: 1,
      pages: 1,
      removed: { session: [], file: 0 },
      foreignMarks: 0,
      ownLockedMarks: 0,
      sanitised: nothingSanitised,
      hiddenLayers: false,
      signed: false,
    })
    expect(findings.candidates.map((c) => c.verdict)).toEqual(['clean'])
    expect(doc.annotations.list.get()).toBe(before)
    expect(session(doc).map((a) => a.id)).toEqual([mark.id, kept.id])
    expect(doc.changed.get()).toBe(true)
  })

  it('writes marks first, then the kept annotations, and leaves out the removed ones', async () => {
    const fake = fakeEngine()
    const doc = await open('redact-text', { engine: fake.loader })
    const mark = markOver(doc)
    const under = doc.annotations.add({
      type: 'highlight',
      page: 0,
      quads: [quad(50, 195, 150, 22)],
    })
    const kept = doc.annotations.add({ type: 'highlight', page: 0, quads: [KEEP] })

    const { result } = await doc.applyRedactions()

    const [input] = fake.redactions
    expect(input!.marks.map((m) => m.annotation.id)).toEqual([mark.id])
    // What is left in the mark's place is its overlay, over the mark's own box: filled in the
    // mark's fill colour at full opacity, with no outline. The 15% tint the screen shows has both.
    const overlay = input!.marks[0]!.appearance!
    expect(overlay.bounds).toEqual(SECRET)
    const ops = new TextDecoder().decode(overlay.content)
    expect(ops).toMatch(/\b0 0 0 rg\b/)
    expect(ops).toMatch(/\bf\*?\s/)
    expect(ops).not.toMatch(/\b(?:RG|S|s|B\*?|b\*?|gs)\b/)
    expect(Object.values(overlay.opacities ?? {})).toEqual([])
    expect(input!.annotations?.map((a) => a.annotation.id)).toEqual([kept.id])
    expect(input!.remove).toEqual([])
    expect(result.removed.session).toEqual([under.id])
  })

  it('passes the mark regions to the check', async () => {
    const fake = fakeEngine()
    const doc = await open('redact-text', { engine: fake.loader })
    markOver(doc)
    doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 300, y: 100, width: 50, height: 20 },
      quads: [quad(300, 100, 50, 20)],
    })
    await doc.applyRedactions()
    expect(fake.calls.filter((c) => !c.startsWith('open'))).toEqual([
      'redact 1',
      'save 1',
      'check 1',
    ])
    expect(fake.checks).toEqual([
      {
        regions: [
          { page: 0, quads: [quad(45, 190, 170, 35)] },
          { page: 0, quads: [quad(300, 100, 50, 20)] },
        ],
      },
    ])
  })

  it('rejects with RedactionFailed at verify when the check finds content', async () => {
    const fake = fakeEngine()
    const doc = await open('redact-text', { engine: fake.loader })
    markOver(doc)
    fake.state.verdicts = ['content-remains']
    const failed = await doc.applyRedactions().then(
      () => undefined,
      (e: unknown) => e
    )
    expect(failed).toMatchObject({
      name: 'InkError',
      code: 'RedactionFailed',
      details: {
        stage: 'verify',
        regions: [{ page: 0, rect: SECRET }],
      },
    })
    // No bytes escape: the error carries places, nothing of the file.
    expect(JSON.stringify(failed)).not.toContain('PDF')
  })

  describe('rejects at verify unless every region is answered clean', () => {
    const answers: [string, (c: RedactionCandidate[]) => RedactionCandidate[]][] = [
      ['with no answer', () => []],
      ['answered under the wrong index', (c) => c.map((x) => ({ ...x, region: 5 }))],
      ['answered as another kind', (c) => c.map((x) => ({ ...x, kind: 'filled-box' }))],
      ['answered twice for one region and not for the other', (c) => [c[0]!, c[0]!]],
    ]
    it.each(answers)('%s', async (_, answer) => {
      const fake = fakeEngine()
      const doc = await open('redact-text', { engine: fake.loader })
      markOver(doc)
      markOver(doc, { x: 300, y: 100, width: 50, height: 20 })
      fake.state.answer = answer
      const failed = await doc.applyRedactions().then(
        () => undefined,
        (e: unknown) => e
      )
      expect(failed).toMatchObject({
        code: 'RedactionFailed',
        details: { stage: 'verify' },
      })
      const { regions } = (failed as { details: { regions: unknown[] } }).details
      expect(regions.length).toBeGreaterThan(0)
    })

    it.each([
      ['an index out of range', 7],
      ['no index', undefined],
    ])('rejects a region answer that is not clean under %s', async (_, region) => {
      const fake = fakeEngine()
      const doc = await open('redact-text', { engine: fake.loader })
      markOver(doc)
      fake.state.answer = (c) => {
        const stray: RedactionCandidate = { ...c[0]!, verdict: 'content-remains' }
        if (region === undefined) delete stray.region
        else stray.region = region
        return [...c, stray]
      }
      await expect(doc.applyRedactions()).rejects.toMatchObject({
        code: 'RedactionFailed',
        details: { stage: 'verify' },
      })
    })

    it('names the regions not answered clean', async () => {
      const fake = fakeEngine()
      const doc = await open('redact-text', { engine: fake.loader })
      markOver(doc)
      markOver(doc, { x: 300, y: 100, width: 50, height: 20 })
      fake.state.answer = (c) => [c[0]!]
      await expect(doc.applyRedactions()).rejects.toMatchObject({
        details: {
          stage: 'verify',
          regions: [{ page: 0, rect: { x: 300, y: 100, width: 50, height: 20 } }],
        },
      })
    })
  })

  it.each([
    ['a RangeError', new RangeError('bad region')],
    ['an engine failure', new EngineError('engine-failure', 'gone')],
    ['a lack of memory', new EngineError('out-of-memory', 'out')],
    ['a crash', new Error('worker crashed')],
  ])('fails at verify when the check throws %s', async (_, cause) => {
    const fake = fakeEngine()
    const doc = await open('redact-text', { engine: fake.loader })
    markOver(doc)
    fake.state.failCheck = cause
    await expect(doc.applyRedactions()).rejects.toMatchObject({
      code: 'RedactionFailed',
      details: { stage: 'verify' },
      cause,
    })
    const stopped = cause instanceof EngineError
    expect(fake.calls.includes('destroy 1')).toBe(stopped)
  })

  describe("checks Inkbar's earlier marks the engine applied", () => {
    const earlier = { page: 0, quads: [quad(300, 100, 50, 20)] }

    it('after the session marks', async () => {
      const fake = fakeEngine()
      const doc = await open('redact-text', { engine: fake.loader })
      markOver(doc)
      fake.state.ownLockedRegions = [earlier]
      const { result } = await doc.applyRedactions()
      expect(fake.checks).toEqual([
        { regions: [{ page: 0, quads: [quad(45, 190, 170, 35)] }, earlier] },
      ])
      expect(result.findings.candidates.map((c) => c.region)).toEqual([0, 1])
    })

    it('rejects when one is not clean', async () => {
      const fake = fakeEngine()
      const doc = await open('redact-text', { engine: fake.loader })
      markOver(doc)
      fake.state.ownLockedRegions = [earlier]
      fake.state.verdicts = ['clean', 'content-remains']
      await expect(doc.applyRedactions()).rejects.toMatchObject({
        code: 'RedactionFailed',
        details: {
          stage: 'verify',
          regions: [{ page: 0, rect: { x: 300, y: 100, width: 50, height: 20 } }],
        },
      })
    })

    it('rejects when one has no answer', async () => {
      const fake = fakeEngine()
      const doc = await open('redact-text', { engine: fake.loader })
      markOver(doc)
      fake.state.ownLockedRegions = [earlier]
      fake.state.answer = (c) => c.slice(0, 1)
      await expect(doc.applyRedactions()).rejects.toMatchObject({
        code: 'RedactionFailed',
        details: {
          stage: 'verify',
          regions: [{ page: 0, rect: { x: 300, y: 100, width: 50, height: 20 } }],
        },
      })
    })
  })

  it('rejects with RedactionFailed at verify when the check could not inspect', async () => {
    const fake = fakeEngine()
    const doc = await open('redact-text', { engine: fake.loader })
    markOver(doc)
    const cause = new EngineError('check-failed', 'Page 1 could not be inspected.', {
      page: 0,
    })
    fake.state.failCheck = cause
    await expect(doc.applyRedactions()).rejects.toMatchObject({
      code: 'RedactionFailed',
      details: { stage: 'verify', page: 0 },
      cause,
    })
  })

  it('names the page and mark the engine could not apply', async () => {
    const fake = fakeEngine()
    const doc = await open('redact-text', { engine: fake.loader })
    const mark = markOver(doc)
    fake.state.failRedact = new EngineError('redaction-failed', 'no', {
      page: 0,
      annotation: mark.id,
    })
    await expect(doc.applyRedactions()).rejects.toMatchObject({
      code: 'RedactionFailed',
      details: { stage: 'apply', page: 0, annotation: mark.id },
    })
  })

  it('rejects NothingToRedact with no marks', async () => {
    const fake = fakeEngine()
    const doc = await open('redact-text', { engine: fake.loader })
    doc.annotations.add({ type: 'highlight', page: 0, quads: [KEEP] })
    await expect(doc.applyRedactions()).rejects.toMatchObject({
      name: 'InkError',
      code: 'NothingToRedact',
    })
    expect(fake.loader).not.toHaveBeenCalled()
  })

  it("rejects NothingToRedact for another program's marks alone, without loading the engine", async () => {
    const fake = fakeEngine()
    const doc = await open('annotated-redact', { engine: fake.loader })
    await expect(doc.applyRedactions()).rejects.toMatchObject({ code: 'NothingToRedact' })
    expect(fake.loader).not.toHaveBeenCalled()
  })

  it('rejects EngineUnavailable without a loader', async () => {
    const doc = await open('redact-text')
    markOver(doc)
    await expect(doc.applyRedactions()).rejects.toMatchObject({
      name: 'InkError',
      code: 'EngineUnavailable',
    })
  })

  it('returns the same promise for a second call while one runs', async () => {
    const fake = fakeEngine()
    const doc = await open('redact-text', { engine: fake.loader })
    markOver(doc)
    const first = doc.applyRedactions()
    expect(doc.applyRedactions()).toBe(first)
    await first
    expect(fake.calls.filter((c) => c.startsWith('redact'))).toHaveLength(1)
    // Once it has settled, the next call applies again.
    const next = doc.applyRedactions()
    expect(next).not.toBe(first)
    await next
    expect(fake.calls.filter((c) => c.startsWith('redact'))).toHaveLength(2)
  })

  it('waits for a save in flight', async () => {
    const fake = fakeEngine()
    const doc = await open('redact-text', { engine: fake.loader })
    markOver(doc)
    fake.hold('write')
    const saving = doc.save()
    await vi.waitFor(() => expect(fake.calls).toContain('write 1'))
    const applying = doc.applyRedactions()
    await new Promise((r) => setTimeout(r, 20))
    // The save's write and its save are one turn: the apply waits for both.
    expect(fake.calls).not.toContain('redact 1')
    fake.release()
    await Promise.all([saving, applying])
    expect(fake.calls).toEqual([
      'open 1',
      'write 1',
      'save 1',
      'redact 1',
      'save 1',
      'check 1',
    ])
    // A save after the apply writes into the file as opened, not into the redacted copy.
    doc.annotations.add({ type: 'highlight', page: 0, quads: [KEEP] })
    await doc.save()
    expect(fake.calls.slice(6)).toEqual(['close 1', 'open 1', 'write 1', 'save 1'])
  })

  it('rejects DocumentDestroyed when destroyed mid-apply and releases the engine', async () => {
    const fake = fakeEngine()
    const doc = await open('redact-text', { engine: fake.loader })
    markOver(doc)
    fake.hold('redact')
    const applying = doc.applyRedactions()
    await vi.waitFor(() => expect(fake.calls).toContain('redact 1'))
    forget(doc)
    doc.destroy()
    fake.release()
    await expect(applying).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    expect(fake.calls).toContain('destroy 1')
    await expect(doc.applyRedactions()).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
  })

  it('drops the engine when it stops, as a save does', async () => {
    const fake = fakeEngine()
    const doc = await open('redact-text', { engine: fake.loader })
    markOver(doc)
    fake.state.failRedact = new EngineError('engine-failure', 'gone')
    await expect(doc.applyRedactions()).rejects.toMatchObject({
      code: 'RedactionFailed',
      details: { stage: 'apply' },
    })
    expect(fake.calls).toContain('destroy 1')
    delete fake.state.failRedact
    await doc.applyRedactions()
    expect(fake.calls).toContain('redact 2')
  })

  it('counts a mark off the page as skipped, not as a failure', async () => {
    const fake = fakeEngine()
    const doc = await open('redact-text', { engine: fake.loader })
    markOver(doc)
    markOver(doc, { x: 2000, y: 2000, width: 50, height: 20 })
    // The engine skips the second and applies the first.
    fake.state.pages = [{ page: 0, marks: 1, annotationsRemoved: 0 }]
    const { result } = await doc.applyRedactions()
    expect(result.marks).toBe(1)
    expect(result.findings.candidates.map((c) => c.verdict)).toEqual(['clean', 'clean'])
  })
})

describe('redactionPreview', () => {
  it('counts marks, pages and what the marks overlap', async () => {
    const doc = await open('redact-text')
    expect(doc.redactionPreview()).toEqual({
      marks: 0,
      pages: 0,
      overlapped: 0,
      signed: false,
      lockedMarks: 0,
    })
    markOver(doc)
    doc.annotations.add({ type: 'highlight', page: 0, quads: [quad(50, 195, 150, 22)] })
    doc.annotations.add({ type: 'highlight', page: 0, quads: [KEEP] })
    expect(doc.redactionPreview()).toEqual({
      marks: 1,
      pages: 1,
      overlapped: 1,
      signed: false,
      lockedMarks: 0,
    })
  })

  it("counts the file's own annotations a mark overlaps", async () => {
    const doc = await open('redact-annotations')
    // The fixture's stamp and note lie under x 40..240, y 150..250.
    markOver(doc, { x: 40, y: 150, width: 200, height: 100 })
    const locked = doc.annotations.list.get().filter((a) => a.source === 'pdf')
    expect(locked.length).toBeGreaterThan(0)
    expect(doc.redactionPreview().overlapped).toBe(locked.length)
  })

  it('counts no locked marks in a file that is not encrypted', async () => {
    const doc = await open('annotated-redact')
    expect(
      doc.annotations.list.get().filter((a) => a.type === 'redact' && a.source === 'pdf')
    ).toHaveLength(2)
    expect(doc.redactionPreview().lockedMarks).toBe(0)
  })

  it('says when the file is signed', async () => {
    const doc = await open('signed')
    expect(doc.redactionPreview().signed).toBe(true)
  })
})

describe('applyRedactions with the engine', () => {
  it('redacts a fixture end to end', async () => {
    const { loader } = realEngine()
    const doc = await open('redact-text', { engine: loader })
    markOver(doc)
    const kept = doc.annotations.add({ type: 'highlight', page: 0, quads: [KEEP] })
    expect(await doc.pageText(0)).toContain('SECRET')

    const { bytes, result } = await doc.applyRedactions()

    expect(result).toMatchObject({
      marks: 1,
      pages: 1,
      removed: { session: [], file: 0 },
    })
    expect(result.sanitised.metadata).toBe(true)
    const back = await openBytes(bytes, { engine: loader })
    const list = back.annotations.list.get()
    expect(list.filter((a) => a.type === 'redact')).toEqual([])
    expect(list).toEqual([expect.objectContaining({ id: kept.id, source: 'session' })])
    expect((list[0] as Annotation & { locked?: boolean }).locked).toBeFalsy()
    const text = await back.pageText(0)
    expect(text).not.toContain('SECRET')
    expect(text).not.toContain('ALPHA')
    expect(text).toContain('KEEP-BETA')
  })

  it('a loupe saved before the apply is clean after it', async () => {
    const { loader } = realEngine()
    const doc = await open('redact-text', { engine: loader })
    const beside = doc.annotations.add({
      type: 'loupe',
      page: 0,
      rect: { x: 300, y: 100, width: 60, height: 60 },
    })
    const over = doc.annotations.add({
      type: 'loupe',
      page: 0,
      rect: { x: 100, y: 180, width: 60, height: 60 },
    })
    const saved = await doc.save()

    const reopened = await openBytes(saved, { engine: loader })
    expect(session(reopened).map((a) => a.id)).toEqual([beside.id, over.id])
    markOver(reopened)
    const { bytes, result } = await reopened.applyRedactions()

    // The lens over the mark goes; the one beside it is written from the redacted page.
    expect(result.removed.session).toEqual([over.id])
    expect(result.findings.candidates.map((c) => c.verdict)).toEqual(['clean'])
    const back = await openBytes(bytes, { engine: loader })
    expect(session(back).map((a) => a.id)).toEqual([beside.id])
    expect(await back.pageText(0)).not.toContain('SECRET')
  })

  it("applies Inkbar's earlier marks in an encrypted file", async () => {
    const { loader } = realEngine()
    const password = manifest['encrypted-aes'].password
    const doc = await open('encrypted-aes', { engine: loader })
    // The file's one word, Encrypted, runs from x 72 to 135 on the baseline y 700.
    markOver(doc, { x: 70, y: 695, width: 25, height: 20 })
    const saved = await doc.save()

    // An encrypted file lifts nothing: the mark comes back locked.
    const reopened = await openBytes(saved, { engine: loader, password })
    expect(session(reopened)).toEqual([])
    expect(reopened.redactionPreview()).toMatchObject({ marks: 0, lockedMarks: 1 })
    const { bytes, result } = await reopened.applyRedactions()

    expect(result.ownLockedMarks).toBe(1)
    expect(result.marks).toBe(1)
    // The engine reports the region it applied, and the check covered it.
    expect(result.findings.candidates).toEqual([
      expect.objectContaining({ kind: 'region', region: 0, page: 0, verdict: 'clean' }),
    ])
    const back = await openBytes(bytes, { password })
    const text = await back.pageText(0)
    expect(text).not.toContain('Enc')
    expect(text).toContain('pted')
  })
})
