import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import manifestJson from './manifest.json' with { type: 'json' }

import type { FixtureName } from './urls'

export { FIXTURE_NAMES, fixtureUrl, type FixtureName } from './urls'
export { generateLarge } from './generate-large'

/**
 * Where a test puts a redaction mark: a page index counting from 0 and a quad in PDF user space,
 * x1 y1 to x4 y4 with corners in Gloss order: top left, top right, bottom left, bottom right.
 */
export interface RedactionRegion {
  page: number
  /** Eight numbers. */
  quad: number[]
}

export interface FixtureMeta {
  file: string
  pages: number
  opens: boolean
  password?: string
  describes: string
  annotations?: Record<string, number>
  /** Where the PDFium engine is known to behave differently, and why. Absent when it does not. */
  engine?: { open?: string; saveRewrite?: string; saveIncremental?: string }
  /** Words under the `regions` that must be gone once the regions are redacted. */
  secrets?: string[]
  /** Page text beside the `regions` that must survive their redaction. */
  keeps?: string[]
  /** Where the redaction tests put their marks. */
  regions?: RedactionRegion[]
  /**
   * Names and words that hold a copy of the content (a thumbnail, an attachment, a script) and
   * that a redaction's sanitising must leave nowhere in the file.
   */
  gone?: string[]
  /**
   * Why redacting the `regions` is refused, and where. With `kinds`, the engine refuses before
   * the apply: a mark lies over content the apply cannot remove, of those kinds, and `redact`
   * rejects with `unremovable-content` and changes nothing. Without, the apply runs and the strict
   * check after it finds content left. Absent when the regions redact cleanly.
   */
  refused?: { why: string; kinds?: ('pattern' | 'shading' | 'mask-group' | 'glyph')[] }
}

export const manifest = manifestJson as Record<FixtureName, FixtureMeta>
const root = dirname(fileURLToPath(import.meta.url))

export function fixturePath(name: FixtureName): string {
  return join(root, 'pdf', manifest[name].file)
}

export async function fixtureBytes(name: FixtureName): Promise<Uint8Array> {
  return new Uint8Array(await readFile(fixturePath(name)))
}
