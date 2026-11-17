import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SRC = dirname(fileURLToPath(import.meta.url))

/** Every `.ts` file under `dir`. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

// Modules removed from the tree. The names are built from pieces so that this file does not name them whole.
const GONE = ['reference-' + 'render', 'reference-' + 'mask', 'drawing-' + 'compare']

describe('the source tree', () => {
  it('imports no module that was removed', () => {
    const importers = sources(SRC).filter((file) => {
      const text = readFileSync(file, 'utf8')
      return GONE.some((name) => new RegExp(`from '[^']*${name}'`).test(text))
    })
    expect(importers.map((f) => relative(SRC, f))).toEqual([])
  })

  it('holds none of those modules again', () => {
    const files = sources(SRC).map((f) => relative(SRC, f))
    expect(files.filter((f) => GONE.some((name) => f.includes(name)))).toEqual([])
  })
})
