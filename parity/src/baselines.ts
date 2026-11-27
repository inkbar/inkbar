// Browser side of the baselines and the report: where each baseline lives, reading and writing
// files through the test server's commands, and PNG in and out.
import { inject } from 'vitest'
import { commands } from 'vitest/browser'

import { OPENING } from './draw'
import { PARTS, type Part } from './read'

import type { FixtureName } from '@inkbar/fixtures/urls'

declare module 'vitest/browser' {
  interface BrowserCommands {
    /**
     * Writes `content` to `path`, relative to the package and inside `.report/` or `baselines/`
     * only. `encoding` is how `content` is written: `base64` for a PNG, `utf8` for text.
     */
    writeParityFile: (
      path: string,
      content: string,
      encoding: 'base64' | 'utf8'
    ) => Promise<void>
    /** The file at `path` under `baselines/`, in `encoding`; null when there is none. */
    readParityFile: (path: string, encoding: 'base64' | 'utf8') => Promise<string | null>
    /** Every file under `baselines/`, relative to it, with `/` between folders. */
    listBaselines: () => Promise<string[]>
    /** Deletes the file at `path` under `baselines/`. */
    removeBaseline: (path: string) => Promise<void>
  }
}

declare module 'vitest' {
  interface ProvidedContext {
    /**
     * Set by `PARITY_REPORT`: `differences` (`=1`) writes the drawings and data that differ from
     * their baselines to `.report/`, and `off` writes nothing.
     */
    parityReport: 'off' | 'differences'
    /**
     * Set by `PARITY_BASELINE=<fixture>[,<fixture>…]` or `all`: rewrite those fixtures'
     * baselines. Empty when unset.
     */
    parityBaseline: string
  }
}

const rewriting = inject('parityBaseline').split(',').filter(Boolean)

/** Whether this run rewrites `name`'s baselines (`PARITY_BASELINE`). */
export const rewrites = (name: FixtureName): boolean =>
  rewriting.includes('all') || rewriting.includes(name)

/** Whether this run writes the report (`PARITY_REPORT`). */
export const reporting = inject('parityReport') !== 'off'

/** The three kinds of baseline, each held by its own test file. */
export type Kind = 'pages' | 'form-layer' | 'data'

/** Where page `page` (from 0) of `name` is kept, relative to `baselines/`. */
export const pageFile = (name: string, page: number) => `${name}/page-${page + 1}.png`
/** Where page `page` (from 0) of `name` drawn with the form layer is kept. */
export const formLayerFile = (name: string, page: number) =>
  `${name}/form-layer-${page + 1}.png`
/** Where part `part` of `name` is kept. */
export const partFile = (name: string, part: Part) => `${name}/${part}.json`

const PAGE = /^page-[1-9]\d*\.png$/
const FORM_LAYER = /^form-layer-[1-9]\d*\.png$/
const PART_FILES = new Set<string>(PARTS.map((part) => `${part}.json`))

/**
 * The fixture and kind a file under `baselines/` belongs to by its name; `undefined` for a name
 * no baseline has, or a fixture the manifest does not list as opening.
 */
export function ownerOf(file: string): { name: FixtureName; kind: Kind } | undefined {
  const parts = file.split('/')
  if (parts.length !== 2) return undefined
  const [name, base] = parts as [FixtureName, string]
  if (!OPENING.includes(name)) return undefined
  if (PAGE.test(base)) return { name, kind: 'pages' }
  if (FORM_LAYER.test(base)) return { name, kind: 'form-layer' }
  if (PART_FILES.has(base)) return { name, kind: 'data' }
  return undefined
}

/**
 * Keeps track of the baseline files of one kind that this run reads, fixture by fixture, and
 * checks the folder for files of that kind it did not read.
 */
export class BaselineFiles {
  private readonly used = new Map<FixtureName, Set<string>>()

  constructor(private readonly kind: Kind) {}

  /**
   * Records that `files` are every file of this kind `name` has. When this run rewrites `name`,
   * deletes the other files of this kind in its folder, which the suite no longer uses.
   */
  async expect(name: FixtureName, files: readonly string[]): Promise<void> {
    this.used.set(name, new Set(files))
    if (!rewrites(name)) return
    for (const file of await commands.listBaselines()) {
      const owner = ownerOf(file)
      if (owner?.name === name && owner.kind === this.kind && !files.includes(file))
        await commands.removeBaseline(file)
    }
  }

  /**
   * Files of this kind that no test of this run reads: those of a fixture whose files this run
   * recorded but not among them, and those of a fixture that does not open. The data kind also
   * takes every file whose name no baseline has. Fixtures this run did not reach (a run filtered
   * by name, or a test that failed before it listed its files) are not checked.
   */
  async unused(): Promise<string[]> {
    return (await commands.listBaselines()).filter((file) => {
      const owner = ownerOf(file)
      if (owner === undefined) return this.kind === 'data'
      if (owner.kind !== this.kind) return false
      const used = this.used.get(owner.name)
      return used !== undefined && !used.has(file)
    })
  }

  /** How many fixtures this run recorded. */
  get fixtures(): number {
    return this.used.size
  }
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return bytes
}

/** `img` as PNG bytes, through the browser's own encoder. */
export async function encodePng(img: ImageData): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(img.width, img.height)
  canvas.getContext('2d')!.putImageData(img, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}

/** PNG bytes as pixels, with no colour conversion. */
export async function decodePng(bytes: Uint8Array): Promise<ImageData> {
  const bitmap = await createImageBitmap(
    new Blob([bytes as BlobPart], { type: 'image/png' }),
    { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }
  )
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/** Writes `img` as a PNG at `path`, relative to the package. */
export async function writePng(path: string, img: ImageData): Promise<void> {
  await commands.writeParityFile(path, toBase64(await encodePng(img)), 'base64')
}

/** Writes `text` at `path`, relative to the package. */
export async function writeText(path: string, text: string): Promise<void> {
  await commands.writeParityFile(path, text, 'utf8')
}

/** The pixels of the baseline `file`, relative to `baselines/`; null when there is none. */
export async function readBaselinePng(file: string): Promise<ImageData | null> {
  const text = await commands.readParityFile(`baselines/${file}`, 'base64')
  return text === null ? null : decodePng(fromBase64(text))
}

/** The text of the baseline `file`, relative to `baselines/`; null when there is none. */
export async function readBaselineText(file: string): Promise<string | null> {
  return commands.readParityFile(`baselines/${file}`, 'utf8')
}
