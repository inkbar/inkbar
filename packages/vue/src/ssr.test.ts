import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

const evaluated = vi.hoisted(() => ({ pdfjs: false }))

// `#pdfjs` belongs to @inkbar/core's package imports and resolves to the legacy build in Node,
// so mock that file by its resolved path from core's directory.
const pdfjsPath = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module')
  const path = await import('node:path')
  const fromVue = createRequire(import.meta.url)
  const core = path.dirname(fromVue.resolve('@inkbar/core/package.json'))
  return createRequire(`${core}/`).resolve('pdfjs-dist/legacy/build/pdf.mjs')
})

vi.mock(pdfjsPath, () => {
  evaluated.pdfjs = true
  return { GlobalWorkerOptions: {} }
})

const assets = { worker: 'w', cMaps: 'c', standardFonts: 's', wasm: 'm', icc: 'i' }

describe('@inkbar/vue on the server', () => {
  it('imports without a DOM or PDF.js, and InkRoot renders its slot without opening', async () => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
    const entry = await import('./index')
    expect(Object.keys(entry)).toEqual(
      expect.arrayContaining([
        'InkRoot',
        'injectInkContext',
        'useReadable',
        'useDocument',
        'useAnnotations',
        'useTool',
        'useSelection',
        'useZoom',
        'usePage',
        'useHistory',
        'useEmbedded',
        'InkToolbar',
        'InkToolButton',
        'InkZoomIn',
        'InkZoomOut',
        'InkZoomSelect',
        'InkPageInput',
        'InkPageCount',
        'InkNotePopover',
        'InkSuggestionCard',
        'DefaultToolbar',
      ])
    )
    expect(evaluated.pdfjs).toBe(false)

    const app = createSSRApp({
      render: () =>
        h(entry.InkRoot, { src: '/doc.pdf', assets }, () => [
          h('p', 'slot'),
          h(entry.DefaultToolbar),
          h(entry.InkNotePopover),
          h(entry.InkSuggestionCard),
        ]),
    })
    const html = await renderToString(app)
    expect(html).toContain('data-ink-root')
    expect(html).toContain('data-state="idle"')
    expect(html).toContain('<p>slot</p>')
    expect(html).toContain('data-ink-toolbar')
    expect(html).toContain('aria-label="Document tools"')
    expect(evaluated.pdfjs).toBe(false)

    // Control: the same mock fires once a document actually opens, so the falses above mean something.
    const { openDocument } = await import('@inkbar/core')
    await openDocument(new Uint8Array([1]), { assets })
    expect(evaluated.pdfjs).toBe(true)
  })
})
