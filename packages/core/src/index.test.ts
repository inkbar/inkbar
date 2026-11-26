import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import pkg from '../package.json' with { type: 'json' }

import { sandboxLoader } from './pdfjs/sandbox'

const evaluated = vi.hoisted(() => ({ pdfjs: false }))

// The factory only runs when something actually imports PDF.js's scripting sandbox, the one part
// of PDF.js core loads.
vi.mock('#pdfjs-sandbox', () => {
  evaluated.pdfjs = true
  return { QuickJSSandbox: () => undefined }
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

    // Control: the same mock does fire once the sandbox loads, so the false above is meaningful.
    await sandboxLoader.load()
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

/** Each import of @inkbar/engine, of any kind, with what it names: `(` for a dynamic one. */
const ENGINE_IMPORTS =
  /(\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'](@inkbar\/engine[^"']*)["']/g

/** The imports of @inkbar/engine in `code`: `dynamic` or `static`, and the entry named. */
const engineImports = (code: string) =>
  [...code.matchAll(ENGINE_IMPORTS)].map(([, how, entry]) => ({
    how: /import\s*\(/.test(how!) ? 'dynamic' : 'static',
    entry: entry!,
  }))

describe('the built package', () => {
  const dist = join(import.meta.dirname, '..', 'dist')
  // CI builds before it tests; a local run without a build skips this.
  // The engine is loaded at the first open, through the entry that names no file locations, so
  // importing core loads none of it and a host's bundle carries no second copy of its files. Only
  // the Vite plugin names the engine's binary, to copy it.
  it.skipIf(!existsSync(dist) && !process.env.CI)(
    'holds no engine code, and imports the engine only dynamically, through its bare entry',
    async () => {
      const files = (await readdir(dist, { recursive: true, withFileTypes: true }))
        .filter((f) => f.isFile() && f.name.endsWith('.mjs'))
        .map((f) => join(f.parentPath, f.name))
      expect(files.some((f) => f.endsWith('.mjs'))).toBe(true)
      const found: string[] = []
      let dynamic = 0
      for (const file of files) {
        const text = await readFile(file, 'utf8')
        const plugin = file === join(dist, 'vite.mjs')
        if (!plugin && text.includes('inkbar-pdfium'))
          found.push(`${file}: inkbar-pdfium`)
        for (const { how, entry } of engineImports(text)) {
          if (plugin && entry === '@inkbar/engine/package.json') continue
          if (how === 'dynamic' && entry === '@inkbar/engine/bare') dynamic++
          else found.push(`${file}: ${how} import of ${entry}`)
        }
      }
      expect(found).toEqual([])
      expect(dynamic).toBe(1)
    }
  )

  // A document's reader is a chunk of its own, which only a dynamic import loads, at the first
  // open.
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

  // Types name the engine only through the entry core loads it from.
  it.skipIf(!existsSync(dist) && !process.env.CI)(
    'declares types from @inkbar/engine only through its bare entry, here or in the bindings',
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
          for (const { entry } of engineImports(code))
            if (entry !== '@inkbar/engine/bare') found.push(`${file}: imports ${entry}`)
        }
      }
      expect(checked).toBeGreaterThan(0)
      expect(found).toEqual([])
    }
  )
})
