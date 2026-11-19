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
   *
   * `need` says why the refusal is there: `shown`, independent readers find content under the
   * mark that the apply would leave; `covered`, the shape lies wholly inside the mark, so the
   * apply would remove it, and the engine refuses because it cannot show that nothing else keeps
   * what it carries in the file; `cautious`, what lies under the mark repeats what stays in view.
   */
  refused?: {
    why: string
    need: 'shown' | 'covered' | 'cautious'
    kinds?: ('pattern' | 'shading' | 'mask-group' | 'glyph')[]
  }
  /**
   * Content that PDF.js does not read as page text (text in a tiling pattern's cell, in a soft
   * mask's group or in an annotation's appearance), and where it lies on the page: its box, left,
   * bottom, right and top in PDF user space, worked out from the fixture's own geometry (the
   * cell or group's placement and the text's position).
   */
  placed?: { what: string; box: [number, number, number, number] }[]
}

// JSON reads `need` as a string and `box` as a list of numbers: the generator writes them typed.
export const manifest = manifestJson as unknown as Record<FixtureName, FixtureMeta>
const root = dirname(fileURLToPath(import.meta.url))

export function fixturePath(name: FixtureName): string {
  return join(root, 'pdf', manifest[name].file)
}

export async function fixtureBytes(name: FixtureName): Promise<Uint8Array> {
  return new Uint8Array(await readFile(fixturePath(name)))
}
