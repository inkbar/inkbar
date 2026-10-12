import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import manifestJson from './manifest.json' with { type: 'json' }

import type { FixtureName } from './urls'

export { FIXTURE_NAMES, fixtureUrl, type FixtureName } from './urls'
export { generateLarge } from './generate-large'

export interface FixtureMeta {
  file: string
  pages: number
  opens: boolean
  password?: string
  describes: string
  annotations?: Record<string, number>
}

export const manifest = manifestJson as Record<FixtureName, FixtureMeta>
const root = dirname(fileURLToPath(import.meta.url))

export function fixturePath(name: FixtureName): string {
  return join(root, 'pdf', manifest[name].file)
}

export async function fixtureBytes(name: FixtureName): Promise<Uint8Array> {
  return new Uint8Array(await readFile(fixturePath(name)))
}
