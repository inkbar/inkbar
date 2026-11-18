import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import pkg from '../package.json' with { type: 'json' }

import { loadPdfjs } from './pdfjs/load'
import { nodeAssets } from './pdfjs/node-assets'

const evaluated = vi.hoisted(() => ({ pdfjs: false }))

// The factory only runs when something actually imports PDF.js.
vi.mock('#pdfjs', () => {
  evaluated.pdfjs = true
  return { GlobalWorkerOptions: {} }
})

describe('package entry', () => {
  it('evaluates no PDF.js code on import, and the mock is live', async () => {
    const entry = await import('./index')
    expect(evaluated.pdfjs).toBe(false)
    expect(Object.keys(entry)).not.toContain('loadPdfjs')
    expect(Object.keys(entry)).not.toContain('openProxy')
    // Link parsing is the document's own; only its types are public.
    expect(Object.keys(entry)).not.toContain('linkFromPdfjs')
    expect(Object.keys(entry)).not.toContain('isNamedAction')

    // Control: the same mock does fire once the loader runs, so the false above is meaningful.
    await loadPdfjs(nodeAssets())
    expect(evaluated.pdfjs).toBe(true)
  })
})

describe('version', () => {
  it('is the version in package.json', async () => {
    const { version } = await import('./index')
    expect(version).toBe(pkg.version)
  })
})

describe('messages', () => {
  it('exports the message helpers', async () => {
    const entry = await import('./index')
    for (const name of [
      'en',
      'resolveMessages',
      'resolveLabel',
      'formatDate',
      'isValidLocale',
      'template',
      'plural',
    ])
      expect(Object.keys(entry), name).toContain(name)
  })
})

describe('the built package', () => {
  const dist = join(import.meta.dirname, '..', 'dist')
  // CI builds before it tests; a local run without a build skips this.
  it.skipIf(!existsSync(dist) && !process.env.CI)(
    'holds no engine code: only types from @inkbar/engine',
    async () => {
      const files = (await readdir(dist, { recursive: true, withFileTypes: true }))
        .filter((f) => f.isFile())
        .map((f) => join(f.parentPath, f.name))
      expect(files.some((f) => f.endsWith('.mjs'))).toBe(true)
      const found: string[] = []
      for (const file of files) {
        const text = await readFile(file, 'utf8')
        if (text.includes('inkbar-pdfium')) found.push(`${file}: inkbar-pdfium`)
        if (
          file.endsWith('.mjs') &&
          /(\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']@inkbar\/engine/.test(
            text
          )
        )
          found.push(`${file}: imports @inkbar/engine`)
      }
      expect(found).toEqual([])
    }
  )
})
