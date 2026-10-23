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
        'InkCommand',
        'useCommand',
        'useForm',
      ])
    )
    expect(evaluated.pdfjs).toBe(false)

    // Plugins are set up only once mounted in the browser: on the server a command button
    // renders disabled.
    const { definePlugin } = await import('@inkbar/core/dom')
    const setup = vi.fn()
    const plugin = definePlugin({ id: 'sandbox', setup })
    function FormProbe() {
      const { fields, values } = entry.useForm()
      return createElement('output', {
        'data-fields': fields.length,
        'data-values': JSON.stringify(values),
      })
    }
    const html = renderToString(
      createElement(
        entry.InkRoot,
        { src: '/doc.pdf', assets, plugins: [plugin], fields: {}, formHighlight: false },
        createElement('p', null, 'slot'),
        createElement(
          entry.InkToolbar,
          null,
          createElement(entry.InkToolButton, { tool: 'highlight' }),
          createElement(entry.InkCommand, { id: 'sandbox.ping' })
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
        createElement(entry.InkThreadPopover),
        // With the field menu and the form alert it mounts, and a form that is still empty.
        createElement(entry.InkViewport),
        createElement(FormProbe)
      )
    )
    expect(html).toContain('data-ink-root')
    expect(html).toContain('data-state="idle"')
    expect(html).toContain('<p>slot</p>')
    expect(html).toContain('data-ink-viewport-root')
    expect(html).toContain('<output data-fields="0" data-values="{}"></output>')
    expect(html).not.toContain('data-ink-form-alert')
    expect(html).not.toContain('data-ink-sign-field-menu')
    expect(html).toContain('data-ink-toolbar')
    expect(html).toContain('aria-label="Document tools"')
    // Disabled and out of the accessibility tree while it has no name to give.
    const button = /<button[^>]*data-command="sandbox\.ping"[^>]*>/.exec(html)?.[0] ?? ''
    expect(button).toMatch(/\sdisabled/)
    expect(button).toContain('aria-hidden="true"')
    expect(button).not.toMatch(/aria-label|title=/)
    expect(setup).not.toHaveBeenCalled()
    expect(evaluated.pdfjs).toBe(false)

    // Control: the same mock fires once a document actually opens, so the falses above mean something.
    const { openDocument } = await import('@inkbar/core')
    await openDocument(new Uint8Array([1]), { assets })
    expect(evaluated.pdfjs).toBe(true)
  })
})
