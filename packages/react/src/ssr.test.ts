import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type * as Entry from './index'

const evaluated = vi.hoisted(() => ({ pdfjs: false }))

// `#pdfjs` belongs to @inkbar/core's package imports and resolves to the legacy build in Node,
// so mock that file by its resolved path from core's directory.
const pdfjsPath = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module')
  const path = await import('node:path')
  const fromReact = createRequire(import.meta.url)
  const core = path.dirname(fromReact.resolve('@inkbar/core/package.json'))
  return createRequire(`${core}/`).resolve('pdfjs-dist/legacy/build/pdf.mjs')
})

vi.mock(pdfjsPath, () => {
  evaluated.pdfjs = true
  return { GlobalWorkerOptions: {} }
})

const assets = { worker: 'w', cMaps: 'c', standardFonts: 's', wasm: 'm', icc: 'i' }

describe('@inkbar/react on the server', () => {
  let entry: typeof Entry

  // The first import compiles every component on a cold transform cache. That takes several
  // seconds on a busy CI runner, so it gets its own budget and the test's covers the render.
  beforeAll(async () => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
    entry = await import('./index')
  }, 30_000)

  it('imports without a DOM or PDF.js, and InkRoot renders its children without opening', async () => {
    expect(Object.keys(entry)).toEqual(
      expect.arrayContaining([
        'InkRoot',
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
        'InkViewport',
        'InkPage',
        'InkAnnotation',
      ])
    )
    expect(evaluated.pdfjs).toBe(false)

    const html = renderToString(
      createElement(
        entry.InkRoot,
        { src: '/doc.pdf', assets },
        createElement('p', null, 'slot'),
        createElement(
          entry.InkToolbar,
          null,
          createElement(entry.InkToolButton, { tool: 'highlight' })
        ),
        createElement(
          entry.InkToolbar,
          { label: 'Page and zoom' },
          createElement(entry.InkPrevPage),
          createElement(entry.InkPageInput),
          createElement(entry.InkPageCount),
          createElement(entry.InkNextPage),
          createElement(entry.InkZoomOut),
          createElement(entry.InkZoomSelect),
          createElement(entry.InkZoomIn)
        ),
        createElement(entry.InkThreadPopover)
      )
    )
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
