import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createImageTemplate,
  createInkTemplate,
  createMemorySignatureStore,
  createSignatureLibrary,
  createStorageSignatureStore,
  normaliseInk,
  placeSignature,
  type SignatureTemplate,
} from './signatures'
import { createLocalStorage, createMemoryStorage, type InkStorage } from './storage'

import type { Point } from './geometry'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

const ink: SignatureTemplate = {
  id: 'ink-1',
  kind: 'ink',
  inklist: [
    [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  ],
  aspect: 3,
}
const image: SignatureTemplate = {
  id: 'image-1',
  kind: 'image',
  imagedata: PNG,
  aspect: 3,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normaliseInk', () => {
  it('puts every point in 0..1 and keeps the aspect', () => {
    const { inklist, aspect } = normaliseInk([
      [
        { x: 100, y: 50 },
        { x: 300, y: 150 },
      ],
      [{ x: 200, y: 100 }],
    ])
    for (const p of inklist.flat()) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(1)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(1)
    }
    expect(aspect).toBeCloseTo(2)
    expect(inklist).toEqual([
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      [{ x: 0.5, y: 0.5 }],
    ])
  })

  it('gives a flat stroke a finite aspect and centres it across', () => {
    const { inklist, aspect } = normaliseInk([
      [
        { x: 0, y: 10 },
        { x: 100, y: 10 },
      ],
    ])
    expect(Number.isFinite(aspect)).toBe(true)
    expect(aspect).toBeGreaterThan(10)
    expect(inklist[0]!.map((p) => p.y)).toEqual([0.5, 0.5])
  })

  it('makes a single dot a square', () => {
    expect(normaliseInk([[{ x: 4, y: 4 }]])).toEqual({
      inklist: [[{ x: 0.5, y: 0.5 }]],
      aspect: 1,
    })
  })
})

describe('placeSignature', () => {
  it('places an ink template as ink signed Signature, 150 wide, centred on the point', () => {
    const input = placeSignature(ink, 2, { x: 300, y: 400 })
    expect(input).toMatchObject({
      type: 'ink',
      page: 2,
      subject: 'Signature',
      width: 2,
      rect: { x: 225, y: 375, width: 150, height: 50 },
    })
    // The strokes sit inside the rect by half the stroke width.
    const points = (input as { inklist: Point[][] }).inklist[0]!
    expect(points[0]).toEqual({ x: 226, y: 376 })
    expect(points[1]).toEqual({ x: 374, y: 424 })
  })

  it('carries pressure and takes a width', () => {
    const input = placeSignature(
      { ...ink, pressure: [[0.2, 0.8]] },
      0,
      { x: 0, y: 0 },
      300
    )
    expect(input).toMatchObject({
      pressure: [[0.2, 0.8]],
      rect: { x: -150, y: -50, width: 300, height: 100 },
    })
  })

  it('places an image template as a stamp signed Signature', () => {
    expect(placeSignature(image, 1, { x: 300, y: 400 })).toEqual({
      type: 'stamp',
      page: 1,
      subject: 'Signature',
      imagedata: PNG,
      rect: { x: 225, y: 375, width: 150, height: 50 },
    })
  })

  it('turns the signature against the rotation, so it reads upright on a turned page', () => {
    const turned = placeSignature(ink, 0, { x: 300, y: 400 }, 150, 90)
    expect(turned).toMatchObject({ rect: { x: 275, y: 325, width: 50, height: 150 } })
    // Upright bottom-left becomes the bottom-right in user space: a quarter turn anticlockwise.
    const [first, last] = (turned as { inklist: Point[][] }).inklist[0]!
    expect(first!.x).toBeCloseTo(324)
    expect(first!.y).toBeCloseTo(326)
    expect(last!.x).toBeCloseTo(276)
    expect(last!.y).toBeCloseTo(474)
    expect(placeSignature(image, 0, { x: 300, y: 400 }, 150, 270)).toMatchObject({
      type: 'stamp',
      rotation: 270,
      rect: { x: 275, y: 325, width: 50, height: 150 },
    })
  })
})

describe('template helpers', () => {
  it('builds an ink template from y-up points, with an id', () => {
    const t = createInkTemplate(
      [
        [
          { x: 0, y: 0 },
          { x: 40, y: 20 },
        ],
      ],
      [[0.3, 0.6]]
    )
    expect(t).toMatchObject({ kind: 'ink', aspect: 2, pressure: [[0.3, 0.6]] })
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('builds an image template and refuses anything but a PNG or JPEG data URL', () => {
    expect(createImageTemplate(PNG, 4)).toMatchObject({
      kind: 'image',
      imagedata: PNG,
      aspect: 4,
    })
    expect(() => createImageTemplate('http://example.com/a.png', 1)).toThrow(TypeError)
  })

  it('refuses ink with no strokes, an empty stroke, or pressure shaped unlike the strokes', () => {
    const stroke = [
      { x: 0, y: 0 },
      { x: 4, y: 2 },
    ]
    expect(() => createInkTemplate([])).toThrow(RangeError)
    expect(() => createInkTemplate([stroke, []])).toThrow(RangeError)
    expect(() => createInkTemplate([stroke], [[0.5]])).toThrow(RangeError)
    expect(() => createInkTemplate([stroke], [[0.5, 0.5], [0.5]])).toThrow(RangeError)
  })
})

describe('createMemorySignatureStore', () => {
  it('saves, lists, replaces by id and removes', async () => {
    const store = createMemorySignatureStore([ink])
    await store.save(image)
    expect((await store.list()).map((t) => t.id)).toEqual(['ink-1', 'image-1'])
    await store.save({ ...ink, aspect: 5 })
    expect(await store.list()).toEqual([{ ...ink, aspect: 5 }, image])
    await store.remove('ink-1')
    expect(await store.list()).toEqual([image])
  })

  it('hands out copies', async () => {
    const store = createMemorySignatureStore([ink])
    const [t] = await store.list()
    ;(t as { aspect: number }).aspect = 99
    expect((await store.list())[0]!.aspect).toBe(3)
  })
})

describe('createStorageSignatureStore', () => {
  it('storage signature store round-trips templates', async () => {
    const storage = createMemoryStorage()
    const store = createStorageSignatureStore(storage)
    await store.save(ink)
    await store.save(image)
    expect(await storage.get('signatures')).toEqual([ink, image])
    expect(await store.list()).toEqual([ink, image])
    await store.remove('ink-1')
    expect(await store.list()).toEqual([image])
  })

  it('storage signature store keeps entries it cannot read', async () => {
    const z = { id: 'z', kind: 'future' }
    const storage = createMemoryStorage({ signatures: [ink, z] })
    const store = createStorageSignatureStore(storage)
    expect(await store.list()).toEqual([ink])
    await store.save(image)
    expect(await storage.get('signatures')).toEqual([ink, image, z])
  })

  it('a server failure is not called storage full', async () => {
    const storage = createMemoryStorage({ signatures: [ink] })
    const failure = new Error('500')
    storage.set = () => Promise.reject(failure)
    const store = createStorageSignatureStore(storage)
    for (const run of [() => store.save(image), () => store.remove('ink-1')]) {
      const error = (await run().catch((e: unknown) => e)) as Error
      expect(error.message).toBe('The signature could not be saved')
      expect(error.cause).toBe(failure)
    }
    expect(await store.list()).toEqual([ink])
  })

  it('a quota error is', async () => {
    for (const name of ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']) {
      const storage = createMemoryStorage({ signatures: [ink] })
      const quota = new DOMException('', name)
      storage.set = () => Promise.reject(quota)
      const store = createStorageSignatureStore(storage)
      const error = (await store.save(image).catch((e: unknown) => e)) as Error
      expect(error.message).toBe(
        'The signature could not be saved: browser storage is full'
      )
      expect(error.cause).toBe(quota)
      await expect(store.remove('ink-1')).rejects.toThrow(/browser storage is full$/)
      expect(await store.list()).toEqual([ink])
    }
  })

  it('overlapping saves keep both', async () => {
    const inner = createMemoryStorage()
    const wait = (): Promise<void> => new Promise((r) => setTimeout(r, 20))
    const storage: InkStorage = {
      get: (k) => inner.get(k),
      set: async (k, v) => {
        await wait()
        void inner.set(k, v)
      },
      remove: (k) => inner.remove(k),
    }
    const store = createStorageSignatureStore(storage)
    await Promise.all([store.save(ink), store.save(image)])
    expect(await store.list()).toEqual([ink, image])
  })

  it('a rejected save does not block the next', async () => {
    const storage = createMemoryStorage()
    const set = storage.set.bind(storage)
    let calls = 0
    storage.set = (k, v) => (calls++ === 0 ? Promise.reject(new Error('500')) : set(k, v))
    const store = createStorageSignatureStore(storage)
    const first = store.save(ink)
    const second = store.save(image)
    await expect(first).rejects.toThrow()
    await second
    expect(await store.list()).toEqual([image])
  })

  it('storage signature store works with an async store', async () => {
    const inner = createMemoryStorage()
    const storage: InkStorage = {
      get: (k) => Promise.resolve(inner.get(k)),
      set: (k, v) => Promise.resolve(inner.set(k, v)),
      remove: (k) => Promise.resolve(inner.remove(k)),
    }
    const store = createStorageSignatureStore(storage)
    await store.save(ink)
    expect(await store.list()).toEqual([ink])
  })

  it('bad JSON under signatures lists nothing', async () => {
    const local = memoryStorage()
    local.setItem('inkbar:signatures', '{nope')
    vi.stubGlobal('localStorage', local)
    expect(await createStorageSignatureStore(createLocalStorage()).list()).toEqual([])
  })
})

/** A `localStorage` over a map. */
function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  }
}

describe('createSignatureLibrary', () => {
  it('loads, saves and removes through the store, and finds templates by id', async () => {
    const store = createMemorySignatureStore([ink])
    const library = createSignatureLibrary(store)
    expect(library.templates.get()).toEqual([])
    await library.refresh()
    expect(library.templates.get()).toEqual([ink])
    expect(library.get('ink-1')).toEqual(ink)
    await library.save(image)
    expect(await store.list()).toEqual([ink, image])
    expect(library.templates.get()).toEqual([ink, image])
    await library.remove('ink-1')
    expect(library.templates.get()).toEqual([image])
    expect(library.get('ink-1')).toBeUndefined()
  })

  it('leaves out templates that are not valid, whatever store they come from', async () => {
    const bad = { ...ink, id: 'bad', pressure: [[0.5]] } as SignatureTemplate
    const library = createSignatureLibrary(createMemorySignatureStore([bad, image]))
    await library.refresh()
    expect(library.templates.get()).toEqual([image])
  })

  it('reports a removal the store refuses as removeError until cleared', async () => {
    const store = createMemorySignatureStore([ink])
    const library = createSignatureLibrary(store)
    await library.refresh()
    store.remove = () => Promise.reject(new Error('full'))
    await expect(library.remove('ink-1')).rejects.toThrow('full')
    expect(library.removeError.get()).toMatch(/could not be removed/)
    expect(library.templates.get()).toEqual([ink])
    library.clearRemoveError()
    expect(library.removeError.get()).toBeUndefined()
  })

  it('keeps a slow load that succeeds when a later one fails', async () => {
    const store = createMemorySignatureStore([ink])
    const library = createSignatureLibrary(store)
    let finish!: (l: SignatureTemplate[]) => void
    store.list = () => new Promise((resolve) => (finish = resolve))
    const slow = library.refresh()
    store.list = () => Promise.reject(new Error('offline'))
    await library.refresh()
    finish([ink])
    await slow
    expect(library.templates.get()).toEqual([ink])
  })

  it('ignores a slow load that finishes after a later one succeeded', async () => {
    const store = createMemorySignatureStore([ink])
    const library = createSignatureLibrary(store)
    let finish!: (l: SignatureTemplate[]) => void
    store.list = () => new Promise((resolve) => (finish = resolve))
    const slow = library.refresh()
    store.list = () => Promise.resolve([image])
    await library.refresh()
    finish([ink])
    await slow
    expect(library.templates.get()).toEqual([image])
  })

  it('keeps the last list when the store fails to list', async () => {
    const store = createMemorySignatureStore([ink])
    const library = createSignatureLibrary(store)
    await library.refresh()
    store.list = () => Promise.reject(new Error('offline'))
    await library.refresh()
    expect(library.templates.get()).toEqual([ink])
  })
})
