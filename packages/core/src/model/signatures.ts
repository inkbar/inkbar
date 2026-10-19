// Signature templates and where they live. A template is a signature drawn or typed once and
// placed many times: ink strokes in a unit box, or an image. The host owns storage through a
// `SignatureStore`; core ships a memory store and a localStorage one as conveniences.
//
// These are visual signatures, a mark on the page. Nothing here signs the file.
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'

import { IMAGE_DATA_URL, PointSchema } from './annotations/types'
import { readonly, writable, type Readable } from './readable'

import type { AnnotationInput } from './annotations/types'
import type { Point, Rect } from './geometry'

/**
 * A saved signature. Ink points lie in a unit box (0 to 1 on both axes, y growing upwards)
 * that `aspect` (width over height) stretches back to shape. An image keeps its own pixels.
 */
export type SignatureTemplate =
  | { id: string; kind: 'ink'; inklist: Point[][]; pressure?: number[][]; aspect: number }
  | { id: string; kind: 'image'; imagedata: string; aspect: number }

/** Where templates live. The host's: a server, the browser, or memory. */
export interface SignatureStore {
  list(): Promise<SignatureTemplate[]>
  /** Adds the template, or replaces the one with its id. */
  save(t: SignatureTemplate): Promise<void>
  remove(id: string): Promise<void>
}

/** Options for the `signature` tool: the template a click places. */
export interface SignatureOptions {
  templateId?: string
}

/** How wide a placed signature is, in points. */
export const DEFAULT_SIGNATURE_WIDTH = 150

/** A placed ink signature's stroke width, in points. */
export const SIGNATURE_INK_WIDTH = 2

const Aspect = z.number().positive().finite()
const TemplateSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().min(1),
    kind: z.literal('ink'),
    inklist: z.array(z.array(PointSchema).min(1)).min(1),
    pressure: z.array(z.array(z.number().min(0).max(1))).optional(),
    aspect: Aspect,
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('image'),
    imagedata: z.string().regex(IMAGE_DATA_URL),
    aspect: Aspect,
  }),
])

const copy = (t: SignatureTemplate): SignatureTemplate =>
  JSON.parse(JSON.stringify(t)) as SignatureTemplate

function upsert(
  list: readonly SignatureTemplate[],
  t: SignatureTemplate
): SignatureTemplate[] {
  const i = list.findIndex((x) => x.id === t.id)
  return i < 0 ? [...list, copy(t)] : list.map((x, j) => (j === i ? copy(t) : x))
}

/** Templates in memory, gone on reload. The default when a host passes no store. */
export function createMemorySignatureStore(
  initial: SignatureTemplate[] = []
): SignatureStore {
  let items = initial.map(copy)
  return {
    list: () => Promise.resolve(items.map(copy)),
    save(t) {
      items = upsert(items, t)
      return Promise.resolve()
    },
    remove(id) {
      items = items.filter((x) => x.id !== id)
      return Promise.resolve()
    },
  }
}

/**
 * Templates in `localStorage` under `key`, as a JSON array. Where storage is blocked or full
 * the templates stay in memory for the page's life, so signing still works.
 */
export function createLocalSignatureStore(key: string): SignatureStore {
  const storage = (): Storage | undefined => {
    try {
      return globalThis.localStorage ?? undefined
    } catch {
      return undefined
    }
  }
  /** The stored list; undefined when storage cannot be read. Invalid entries are skipped. */
  const read = (): SignatureTemplate[] | undefined => {
    try {
      const s = storage()
      if (!s) return undefined
      const raw = s.getItem(key)
      if (raw === null) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.flatMap((item) => {
        const t = TemplateSchema.safeParse(item)
        return t.success ? [t.data as SignatureTemplate] : []
      })
    } catch (e) {
      // Unreadable JSON is an empty list; a storage that throws is no storage.
      return e instanceof SyntaxError ? [] : undefined
    }
  }
  let items = read() ?? []
  /** Set when a write failed: memory holds templates storage lacks, so it stays the source. */
  let unsaved = false
  /** Picks up what another tab wrote, when storage can be read and holds everything. */
  const sync = (): void => {
    if (unsaved) return
    const stored = read()
    if (stored) items = stored
  }
  const write = (): void => {
    try {
      storage()?.setItem(key, JSON.stringify(items))
      unsaved = false
    } catch {
      // Blocked or full: the templates live on in memory.
      unsaved = true
    }
  }
  return {
    list() {
      sync()
      return Promise.resolve(items.map(copy))
    },
    save(t) {
      sync()
      items = upsert(items, t)
      write()
      return Promise.resolve()
    },
    remove(id) {
      sync()
      items = items.filter((x) => x.id !== id)
      write()
      return Promise.resolve()
    },
  }
}

/**
 * Fits strokes into a unit box, for an ink template. Points come in any y-up space; they go
 * out between 0 and 1 on both axes, and `aspect` is the box's width over its height. A flat
 * side is given 1% of the long side (a dot, a square), so the aspect stays finite, and the
 * strokes are centred across it.
 */
export function normaliseInk(inklist: Point[][]): { inklist: Point[][]; aspect: number } {
  const all = inklist.flat()
  const xs = all.map((p) => p.x)
  const ys = all.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const w = Math.max(...xs) - minX
  const h = Math.max(...ys) - minY
  const long = Math.max(w, h)
  const boxW = long === 0 ? 1 : Math.max(w, long * 0.01)
  const boxH = long === 0 ? 1 : Math.max(h, long * 0.01)
  const map = (p: Point): Point => ({
    x: (p.x - minX + (boxW - w) / 2) / boxW,
    y: (p.y - minY + (boxH - h) / 2) / boxH,
  })
  return { inklist: inklist.map((path) => path.map(map)), aspect: boxW / boxH }
}

/** An ink template from strokes in any y-up space, with a new id. */
export function createInkTemplate(
  inklist: Point[][],
  pressure?: number[][]
): SignatureTemplate {
  const fitted = normaliseInk(inklist)
  return {
    id: uuidv7(),
    kind: 'ink',
    inklist: fitted.inklist,
    ...(pressure ? { pressure: pressure.map((p) => [...p]) } : {}),
    aspect: fitted.aspect,
  }
}

/** An image template, with a new id. Throws a TypeError unless `imagedata` is a PNG or JPEG data URL. */
export function createImageTemplate(
  imagedata: string,
  aspect: number
): SignatureTemplate {
  if (!IMAGE_DATA_URL.test(imagedata))
    throw new TypeError('A signature image must be a PNG or JPEG data URL')
  if (!(aspect > 0 && Number.isFinite(aspect)))
    throw new RangeError(`aspect must be positive, got ${aspect}`)
  return { id: uuidv7(), kind: 'image', imagedata, aspect }
}

/**
 * The annotation that places `t` on `page`, `width` points wide on screen and centred on
 * `centre` (user space). `rotation` is how far the page is turned on screen (its /Rotate plus
 * the view's, clockwise): the signature is turned back by as much, so it reads upright where
 * it was placed. Ink becomes `ink` with `subject: 'Signature'`, its strokes inset by half their
 * width; an image becomes a `stamp` with `subject: 'Signature'`.
 */
export function placeSignature(
  t: SignatureTemplate,
  page: number,
  centre: Point,
  width: number = DEFAULT_SIGNATURE_WIDTH,
  rotation: 0 | 90 | 180 | 270 = 0
): AnnotationInput {
  const height = width / t.aspect
  const sideways = rotation === 90 || rotation === 270
  const rw = sideways ? height : width
  const rh = sideways ? width : height
  const rect: Rect = { x: centre.x - rw / 2, y: centre.y - rh / 2, width: rw, height: rh }
  if (t.kind === 'image')
    return {
      type: 'stamp',
      page,
      subject: 'Signature',
      imagedata: t.imagedata,
      rect,
      ...(rotation === 0 ? {} : { rotation }),
    }
  const pad = SIGNATURE_INK_WIDTH / 2
  const innerW = Math.max(width - pad * 2, 0)
  const innerH = Math.max(height - pad * 2, 0)
  const rad = (rotation * Math.PI) / 180
  const cos = Math.round(Math.cos(rad))
  const sin = Math.round(Math.sin(rad))
  const place = (p: Point): Point => {
    const u = (p.x - 0.5) * innerW
    const v = (p.y - 0.5) * innerH
    // Anticlockwise in user space (y up) undoes the page's clockwise turn on screen.
    return { x: centre.x + u * cos - v * sin, y: centre.y + u * sin + v * cos }
  }
  return {
    type: 'ink',
    page,
    subject: 'Signature',
    inklist: t.inklist.map((path) => path.map(place)),
    ...(t.pressure ? { pressure: t.pressure.map((p) => [...p]) } : {}),
    width: SIGNATURE_INK_WIDTH,
    rect,
  }
}

/**
 * A store's templates kept at hand, so the `signature` tool places one without waiting and the
 * signature menus share one list. Every change goes through the store first.
 */
export interface SignatureLibrary {
  readonly store: SignatureStore
  /** The templates as of the last load; empty until the first `refresh`. */
  readonly templates: Readable<readonly SignatureTemplate[]>
  get(id: string): SignatureTemplate | undefined
  /** Reloads from the store. A store that fails to list leaves the last list. */
  refresh(): Promise<void>
  /** Saves through the store, then reloads. Rejects when the store does. */
  save(t: SignatureTemplate): Promise<void>
  /** Removes through the store, then reloads. Rejects when the store does. */
  remove(id: string): Promise<void>
}

export function createSignatureLibrary(store: SignatureStore): SignatureLibrary {
  const templates = writable<readonly SignatureTemplate[]>([])
  /** Only the latest load writes, so a slow one cannot undo a later save. */
  let loads = 0
  const refresh = async (): Promise<void> => {
    const n = ++loads
    try {
      const list = await store.list()
      if (n === loads) templates.set(list)
    } catch {
      // The store is unavailable: keep what was there.
    }
  }
  return {
    store,
    templates: readonly(templates),
    get: (id) => templates.get().find((t) => t.id === id),
    refresh,
    async save(t) {
      await store.save(t)
      await refresh()
    },
    async remove(id) {
      await store.remove(id)
      await refresh()
    },
  }
}
