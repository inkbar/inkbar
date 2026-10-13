import { render } from 'svelte/server'
import { describe, expect, it, vi } from 'vitest'

const evaluated = vi.hoisted(() => ({ pdfjs: false }))

// `#pdfjs` belongs to @inkbar/core's package imports and resolves to the legacy build in Node,
// so mock that file by its resolved path from core's directory.
const pdfjsPath = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module')
  const path = await import('node:path')
  const fromHere = createRequire(import.meta.url)
  const core = path.dirname(fromHere.resolve('@inkbar/core/package.json'))
  return createRequire(`${core}/`).resolve('pdfjs-dist/legacy/build/pdf.mjs')
})

vi.mock(pdfjsPath, () => {
  evaluated.pdfjs = true
  return { GlobalWorkerOptions: {} }
})

const assets = { worker: 'w', cMaps: 'c', standardFonts: 's', wasm: 'm', icc: 'i' }

describe('@inkbar/svelte on the server', () => {
  it('imports without a DOM or PDF.js, and InkRoot renders its children without opening', async () => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
    const entry = await import('../lib/index.js')
    expect(Object.keys(entry)).toEqual(
      expect.arrayContaining([
        'InkRoot',
        'InkViewport',
        'InkPage',
        'InkAnnotation',
        'useInkContext',
        'useReadable',
        'useDocument',
        'useAnnotations',
        'useTool',
        'useSelection',
        'useZoom',
        'usePage',
        'useHistory',
        'useEmbedded',
      ])
    )
    expect(evaluated.pdfjs).toBe(false)

    const { default: SsrHost } = await import('./harness/SsrHost.svelte')
    const { body } = render(SsrHost, { props: { assets } })
    expect(body).toContain('data-ink-root')
    expect(body).toContain('data-state="idle"')
    expect(body).toContain('<p>slot</p>')
    expect(body).toContain('data-ink-viewport-root')
    // Once on the root and once on the viewport, which renders its empty scroll element.
    expect(body.match(/data-state="idle"/g)).toHaveLength(2)
    expect(body).toContain('data-ink-scroll')
    expect(body).not.toContain('ink-page')
    expect(evaluated.pdfjs).toBe(false)

    // Control: the same mock fires once a document actually opens, so the falses above mean something.
    const { openDocument } = await import('@inkbar/core')
    await openDocument(new Uint8Array([1]), { assets })
    expect(evaluated.pdfjs).toBe(true)
  })
})
