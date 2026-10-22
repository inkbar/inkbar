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
        'InkToolbar',
        'InkToolButton',
        'InkToolbarSeparator',
        'InkUndo',
        'InkRedo',
        'InkZoomIn',
        'InkZoomOut',
        'InkZoomSelect',
        'InkPageInput',
        'InkPageCount',
        'InkPrevPage',
        'InkNextPage',
        'InkThreadPopover',
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
        'InkCommand',
        'useCommand',
      ])
    )
    expect(evaluated.pdfjs).toBe(false)

    const { default: SsrHost } = await import('./harness/SsrHost.svelte')
    // Plugins are set up only once mounted in the browser: on the server a command button
    // renders disabled.
    const { definePlugin } = await import('@inkbar/core/dom')
    const setup = vi.fn()
    const plugin = definePlugin({ id: 'sandbox', setup })
    const { body } = render(SsrHost, { props: { assets, plugins: [plugin] } })
    expect(body).toContain('data-ink-root')
    expect(body).toContain('data-state="idle"')
    expect(body).toContain('<p>slot</p>')
    expect(body).toContain('data-ink-toolbar')
    expect(body).toContain('aria-label="Document tools"')
    expect(body).toContain('aria-label="Page and zoom"')
    expect(body).toMatch(/<button[^>]*data-command="sandbox\.ping"[^>]*disabled/)
    expect(setup).not.toHaveBeenCalled()
    expect(body).toContain('data-ink-viewport-root')
    // Once on the root and once on the viewport, which renders its empty scroll element.
    expect(body.match(/data-state="idle"/g)).toHaveLength(2)
    expect(body).toContain('data-ink-scroll')
    // Pages are `.ink-page[data-page]`; the toolbar's page input and count are not pages.
    expect(body).not.toContain('data-page=')
    expect(body).not.toMatch(/class="ink-page[ "]/)
    expect(evaluated.pdfjs).toBe(false)

    // Control: the same mock fires once a document actually opens, so the falses above mean something.
    const { openDocument } = await import('@inkbar/core')
    await openDocument(new Uint8Array([1]), { assets })
    expect(evaluated.pdfjs).toBe(true)
    // The import of the library is the slow part, and only on a cold transform cache, as in CI:
    // about 2.3 s of the 2.6 s is the import of Bits UI's single entry, where the Svelte compiler
    // goes through some 230 components, measured alone on a fast machine. Warm, the whole test
    // takes 0.5 s. The default 5 s is too close to that when other packages' tasks run beside it.
  }, 30_000)
})
