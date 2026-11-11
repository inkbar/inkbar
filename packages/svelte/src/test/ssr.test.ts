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
        'useInkContext',
        'useReadable',
        'useDocument',
        'useAnnotations',
        'useTool',
        'useSelection',
        'useZoom',
        'usePage',
        'useHistory',
        'useSearch',
        'InkSearchButton',
        'InkFindBar',
        'useEmbedded',
        'InkCommand',
        'useCommand',
        'useForm',
        'InkSidebar',
        'InkPanel',
        'InkThumbnail',
        'InkThumbnails',
        'InkOutline',
        'InkBack',
        'InkForward',
        'InkRecordList',
        'InkSearchResults',
        'useRecords',
        'useRecordSelection',
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
    // Disabled and out of the accessibility tree while it has no name to give.
    const button = /<button[^>]*data-command="sandbox\.ping"[^>]*>/.exec(body)?.[0] ?? ''
    expect(button).toMatch(/\sdisabled/)
    expect(button).toContain('aria-hidden="true"')
    expect(button).not.toMatch(/aria-label|title=/)
    expect(setup).not.toHaveBeenCalled()
    expect(body).toContain('data-ink-viewport-root')
    // Once on the root and once on the viewport, which renders its empty scroll element.
    expect(body.match(/data-state="idle"/g)).toHaveLength(2)
    expect(body).toContain('data-ink-scroll')
    // The search button renders (disabled); the find bar waits for the viewport to mount.
    expect(body).toContain('data-ink-search-button')
    expect(body).not.toContain('data-ink-find-bar')
    expect(body).toMatch(/<output data-testid="form" data-fields="0" data-values="\{}"/)
    expect(body).not.toContain('data-ink-form-alert')
    expect(body).not.toContain('data-ink-sign-field-menu')
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
  it('InkOutline renders an empty tree on the server', async () => {
    const { default: Host } = await import('./harness/OutlineSsrHost.svelte')
    const { body } = render(Host, { props: { assets } })
    const tree = /<ul[^>]*class="[^"]*ink-outline-tree[^"]*"[^>]*>/.exec(body)?.[0] ?? ''
    expect(tree).toContain('role="tree"')
    expect(tree).toContain('aria-label="Outline"')
    expect(body).not.toContain('ink-outline-item')
    expect(body).not.toContain('ink-outline-empty')
    expect(body).toMatch(/<button[^>]*data-ink-back[^>]*disabled/)
    expect(body).toMatch(/<button[^>]*data-ink-forward[^>]*disabled/)
  }, 30_000)
  it('InkSidebar renders the default width and a handle on the server', async () => {
    const { createMemoryStorage } = await import('@inkbar/core')
    const { default: Host } = await import('./harness/SidebarWidthSsrHost.svelte')
    const html = render(Host, { props: { assets, root: true } }).body
    const rootTag = /<div class="ink-sidebar"[^>]*>/.exec(html)?.[0] ?? ''
    expect(rootTag).toContain('--ink-sidebar-width: 320px')
    const handle = /<div[^>]*class="ink-sidebar-handle"[^>]*>/.exec(html)?.[0] ?? ''
    expect(handle).toContain('role="separator"')
    expect(handle).toContain('aria-label="Resize sidebar"')
    expect(handle).toContain('aria-valuenow="320"')
    expect(handle).not.toMatch(/\shidden/)
    // The handle names the panels element.
    const id = /aria-controls="([^"]+)"/.exec(handle)?.[1]
    expect(id).toBeTruthy()
    expect(html).toMatch(
      new RegExp(
        `class="ink-sidebar-panels"[^>]*id="${id}"|id="${id}"[^>]*class="ink-sidebar-panels"`
      )
    )

    // A store that answers at once shows its width on the server too; a bound number wins.
    const storage = createMemoryStorage({ 'sidebar.left.width': 400 })
    expect(render(Host, { props: { assets, storage } }).body).toContain(
      '--ink-sidebar-width: 400px'
    )
    expect(render(Host, { props: { assets, storage, width: 280 } }).body).toContain(
      '--ink-sidebar-width: 280px'
    )
  }, 30_000)
  it('InkSidebar renders its chrome on the server; thumbnails render empty', async () => {
    const { default: Host } = await import('./harness/SidebarSsrHost.svelte')
    const html = (layout: 'rail' | 'tabs' | 'stack', open?: string) =>
      render(Host, { props: { assets, layout, ...(open !== undefined && { open }) } })
        .body

    for (const layout of ['rail', 'tabs'] as const) {
      const body = html(layout)
      expect(body).toMatch(/<div class="ink-sidebar"[^>]*data-ink-sidebar/)
      expect(body).toContain(`data-layout="${layout}"`)
      expect(body).toContain('data-side="right"')
      expect(body).toContain('role="tablist"')
      // The first panel is open; the others are hidden, with their content mounted.
      const panels = body.match(/<div[^>]*role="tabpanel"[^>]*>/g) ?? []
      expect(panels).toHaveLength(2)
      expect(panels[0]).toContain('data-ink-sidebar-panel="pages"')
      expect(panels[0]).not.toMatch(/\shidden/)
      expect(panels[1]).toContain('data-ink-sidebar-panel="search"')
      expect(panels[1]).toMatch(/\shidden/)
      // The frame shows the open panel: the root is open and the strip is there for the
      // buttons that follow once mounted.
      const rootTag = /<div class="ink-sidebar"[^>]*>/.exec(body)?.[0] ?? ''
      expect(rootTag).toContain('data-state="open"')
      expect(body).toContain(`ink-sidebar-${layout === 'rail' ? 'rail' : 'tabs'}`)
      // The panels sit in the slot hook the theme lays out.
      expect(body).toMatch(/<div class="ink-sidebar-slot/)
    }

    // A given open panel shows on the server, though it registers after the first one.
    const controlled = html('rail', 'search')
    expect(/<div class="ink-sidebar"[^>]*>/.exec(controlled)?.[0]).toContain(
      'data-state="open"'
    )
    const shown = controlled.match(/<div[^>]*role="tabpanel"[^>]*>/g) ?? []
    expect(shown[0]).toMatch(/\shidden/)
    expect(shown[1]).toContain('data-ink-sidebar-panel="search"')
    expect(shown[1]).not.toMatch(/\shidden/)

    const body = html('stack')
    expect(body).toContain('data-layout="stack"')
    expect(body).not.toContain('role="tablist"')
    // Stack headers are the panels' own: they render on the server.
    const headers = body.match(/<button[^>]*class="ink-sidebar-header"[^>]*>/g) ?? []
    expect(headers).toHaveLength(2)
    expect(headers[0]).toContain('aria-expanded="true"')
    expect(headers[1]).toContain('aria-expanded="false"')
    expect(headers[1]).toContain('aria-label="Search, 2"')
    expect(body).toContain('<span class="ink-sidebar-label">Pages</span>')
    // The list renders empty: no items until a document opens in the browser.
    expect(body).toMatch(/<div class="ink-thumbnails"[^>]*role="list"/)
    expect(body).not.toContain('data-ink-thumbnail-item')
    expect(body).not.toContain('<canvas')
  }, 30_000)
  it('InkRecordList and InkSearchResults render empty on the server', async () => {
    const { default: Host } = await import('./harness/RecordListSsrHost.svelte')
    const { body } = render(Host, { props: { assets } })
    const lists = body.match(/<div class="ink-records"[^>]*>/g) ?? []
    expect(lists).toHaveLength(2)
    expect(body).not.toContain('data-ink-record=')
    // No plugins or search yet: not "Nothing here yet." until the list knows.
    const empties = body.match(/<p class="ink-record-list-empty"[^>]*>/g) ?? []
    expect(empties).toHaveLength(2)
    for (const empty of empties) expect(empty).toMatch(/\shidden/)
    expect(body).toContain('aria-label="Find in document"')
    expect(body).toMatch(/<div class="ink-search-results"[^>]*data-ink-search-results/)
  }, 30_000)
})
