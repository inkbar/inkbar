import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

const evaluated = vi.hoisted(() => ({ pdfjs: false }))

// The factory only runs if something imports PDF.js while the entry loads.
vi.mock('#pdfjs', () => {
  evaluated.pdfjs = true
  return {}
})
vi.mock('pdfjs-dist', () => {
  evaluated.pdfjs = true
  return {}
})

describe('package entry', () => {
  it('does not evaluate PDF.js on import', async () => {
    const entry = await import('./index')
    expect(evaluated.pdfjs).toBe(false)
    expect(Object.keys(entry)).not.toContain('loadPdfjs')
    expect(Object.keys(entry)).not.toContain('openProxy')
  })

  it('only references src/pdfjs through type imports', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    const lines = source.split('\n').filter((line) => line.includes('pdfjs'))
    for (const line of lines) expect(line).toMatch(/^\s*export type\b|^\s*import type\b/)
  })
})
