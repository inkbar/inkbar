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

/** An import of @inkbar/engine, of any kind: static, dynamic, required or of a type. */
const ENGINE_IMPORT =
  /(\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']@inkbar\/engine/

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
        if (file.endsWith('.mjs') && ENGINE_IMPORT.test(text))
          found.push(`${file}: imports @inkbar/engine`)
      }
      expect(found).toEqual([])
    }
  )

  // A document opened as usual downloads none of the engine reader: it is a chunk of its own,
  // which only a dynamic import loads, once the internal switch selects it.
  it.skipIf(!existsSync(dist) && !process.env.CI)(
    'keeps the engine reader in a chunk that only a dynamic import loads',
    async () => {
      const files = (await readdir(dist, { recursive: true, withFileTypes: true }))
        .filter((f) => f.isFile() && f.name.endsWith('.mjs'))
        .map((f) => join(f.parentPath, f.name))
      const texts = new Map(
        await Promise.all(files.map(async (f) => [f, await readFile(f, 'utf8')] as const))
      )
      const holders = [...texts].flatMap(([file, text]) =>
        text.includes('function createEngineReader(') ? [file] : []
      )
      expect(holders).toHaveLength(1)
      const chunk = holders[0]!.slice(dist.length + 1)
      expect(['index.mjs', 'dom.mjs']).not.toContain(chunk)
      const name = JSON.stringify(`./${chunk}`)
      const dynamic: string[] = []
      const fixed: string[] = []
      for (const [file, text] of texts) {
        if (text.includes(`import(${name})`)) dynamic.push(file)
        if (text.includes(`from ${name}`) || text.includes(`import ${name}`))
          fixed.push(file)
      }
      expect(dynamic).toHaveLength(1)
      expect(fixed).toEqual([])
    }
  )

  // A host that has not installed the engine checks these with `skipLibCheck: false`.
  it.skipIf(!existsSync(dist) && !process.env.CI)(
    'declares no type from @inkbar/engine, here or in the bindings',
    async () => {
      const packages = join(import.meta.dirname, '..', '..')
      const found: string[] = []
      let checked = 0
      for (const name of ['core', 'vue', 'react', 'svelte']) {
        const built = join(packages, name, 'dist')
        // A binding that is not built yet is checked by the run that builds it.
        if (!existsSync(built)) continue
        const files = (await readdir(built, { recursive: true, withFileTypes: true }))
          .filter((f) => f.isFile() && /\.d\.m?ts$/.test(f.name))
          .map((f) => join(f.parentPath, f.name))
        for (const file of files) {
          checked++
          // Comments name the engine where they tell a host how to load it.
          const code = (await readFile(file, 'utf8'))
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '')
          if (ENGINE_IMPORT.test(code)) found.push(`${file}: imports @inkbar/engine`)
        }
      }
      expect(checked).toBeGreaterThan(0)
      expect(found).toEqual([])
    }
  )
})
