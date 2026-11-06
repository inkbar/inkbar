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
        'InkToolbarButton',
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
        'InkSidebar',
        'InkPanel',
        'InkThumbnail',
        'InkThumbnails',
        'InkRecordList',
        'InkSearchResults',
        'useRecords',
        'useRecordSelection',
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

  it('InkSidebar renders its chrome on the server; thumbnails render empty', async () => {
    const { Search, Square } = await import('@inkbar/icons')
    const sidebar = (layout: 'rail' | 'tabs' | 'stack') =>
      createElement(
        entry.InkSidebar,
        { layout, side: 'right' },
        createElement(
          entry.InkPanel,
          { id: 'pages', label: 'Pages', icon: Square },
          createElement(entry.InkThumbnails)
        ),
        createElement(
          entry.InkPanel,
          { id: 'search', label: 'Search', icon: Search, badge: 2 },
          createElement(entry.InkThumbnail, { page: 0 })
        )
      )
    const render = (layout: 'rail' | 'tabs' | 'stack') =>
      renderToString(
        createElement(entry.InkRoot, { src: '/doc.pdf', assets }, sidebar(layout))
      )

    for (const layout of ['rail', 'tabs'] as const) {
      const html = render(layout)
      expect(html).toMatch(/<div class="ink-sidebar"[^>]*data-ink-sidebar/)
      expect(html).toContain(`data-layout="${layout}"`)
      expect(html).toContain('data-side="right"')
      expect(html).toContain('role="tablist"')
      // The first panel is open; the others are hidden, with their content mounted.
      const panels = html.match(/<div[^>]*role="tabpanel"[^>]*>/g) ?? []
      expect(panels).toHaveLength(2)
      expect(panels[0]).toContain('data-ink-sidebar-panel="pages"')
      expect(panels[0]).not.toMatch(/\shidden/)
      expect(panels[1]).toContain('data-ink-sidebar-panel="search"')
      expect(panels[1]).toMatch(/\shidden/)
      // The frame shows the open panel: the root is open and the strip is there for the
      // buttons that follow once mounted.
      const rootTag = /<div class="ink-sidebar"[^>]*>/.exec(html)?.[0] ?? ''
      expect(rootTag).toContain('data-state="open"')
      expect(html).toContain(`ink-sidebar-${layout === 'rail' ? 'rail' : 'tabs'}`)
      // The panels sit in the slot hook the theme lays out.
      expect(html).toMatch(/<div class="ink-sidebar-slot"/)
    }

    // An open panel the host gives shows on the server, though it registers after the first
    // one; controlled or as the uncontrolled start.
    for (const props of [{ open: 'search' }, { defaultOpen: 'search' }]) {
      const html = renderToString(
        createElement(
          entry.InkRoot,
          { src: '/doc.pdf', assets },
          createElement(
            entry.InkSidebar,
            { layout: 'rail', ...props },
            createElement(entry.InkPanel, { id: 'pages', label: 'Pages' }, 'A'),
            createElement(entry.InkPanel, { id: 'search', label: 'Search' }, 'B')
          )
        )
      )
      expect(/<div class="ink-sidebar"[^>]*>/.exec(html)?.[0]).toContain(
        'data-state="open"'
      )
      const shown = html.match(/<div[^>]*role="tabpanel"[^>]*>/g) ?? []
      expect(shown[0]).toMatch(/\shidden/)
      expect(shown[1]).toContain('data-ink-sidebar-panel="search"')
      expect(shown[1]).not.toMatch(/\shidden/)
    }

    const html = render('stack')
    expect(html).toContain('data-layout="stack"')
    expect(html).not.toContain('role="tablist"')
    // Stack headers are the panels' own: they render on the server.
    const headers = html.match(/<button[^>]*class="ink-sidebar-header"[^>]*>/g) ?? []
    expect(headers).toHaveLength(2)
    expect(headers[0]).toContain('aria-expanded="true"')
    expect(headers[1]).toContain('aria-expanded="false"')
    expect(headers[1]).toContain('aria-label="Search, 2"')
    expect(html).toContain('<span class="ink-sidebar-label">Pages</span>')
    // The list renders empty: no items until a document opens in the browser.
    expect(html).toMatch(/<div class="ink-thumbnails"[^>]*role="list"/)
    expect(html).not.toContain('data-ink-thumbnail-item')
    expect(html).not.toContain('<canvas')
  })
  it('InkRecordList and InkSearchResults render empty on the server', () => {
    const html = renderToString(
      createElement(
        entry.InkRoot,
        { src: '/doc.pdf', assets },
        createElement(entry.InkRecordList, { records: 'sandbox.suggestions' }),
        createElement(entry.InkSearchResults)
      )
    )
    const lists = html.match(/<div class="ink-records"[^>]*>/g) ?? []
    expect(lists).toHaveLength(2)
    expect(html).not.toContain('data-ink-record=')
    // No plugins or search yet: not "Nothing here yet." until the list knows.
    const empties = html.match(/<p class="ink-record-list-empty"[^>]*>/g) ?? []
    expect(empties).toHaveLength(2)
    for (const empty of empties) expect(empty).toMatch(/\shidden/)
    expect(html).toContain('aria-label="Find in document"')
    expect(html).toMatch(/<div class="ink-search-results"[^>]*data-ink-search-results/)
  })
})
