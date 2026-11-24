/*
 * Where the generators write. By default that is this package: pdf/ and manifest.json. Set
 * INKBAR_FIXTURES_OUT to a directory holding its own pdf/ and manifest.json to write there
 * instead, which is how the fixtures test runs them without touching the committed files.
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const here = dirname(fileURLToPath(import.meta.url))
const root = process.env.INKBAR_FIXTURES_OUT
  ? resolve(process.env.INKBAR_FIXTURES_OUT)
  : here

export const out = join(root, 'pdf')
export const manifestPath = join(root, 'manifest.json')
