// A binding imports `mountViewer` from `@inkbar/core/dom` and nothing else from the viewer.
// Bundling that import must leave `createViewer`, its controls and its popovers out.
import { fileURLToPath } from 'node:url'

import { build, type Rolldown } from 'vite'
import { describe, expect, it } from 'vitest'

const INDEX = fileURLToPath(new URL('./index.ts', import.meta.url))
const ENTRY = 'virtual:tree-shake-entry'
const RESOLVED = '\0' + ENTRY

/** Bundles `code` (which imports from `INDEX`) the way an app build would, and returns the JS. */
async function bundle(code: string): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'tree-shake-entry',
        resolveId: (id) => (id.endsWith(ENTRY) ? RESOLVED : null),
        load: (id) => (id === RESOLVED ? code : null),
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: { entry: ENTRY, formats: ['es'], fileName: 'out' },
      rollupOptions: { external: [/^pdfjs-dist/, '#pdfjs', 'uuid', 'zod'] },
    },
  })
  const outputs = (Array.isArray(result) ? result : [result]) as Rolldown.RolldownOutput[]
  return outputs
    .flatMap((o) => o.output)
    .map((chunk) => (chunk.type === 'chunk' ? chunk.code : ''))
    .join('\n')
}

const VIEWER_UI = ['ink-thread-popover', 'data-ink-zoom-select', 'data-ink-prev-page']

// One marker per tool module. Their string literals ('Signature', 'OpenArrow'…) also appear
// in modules the engine keeps, so the markers are the modules' own function names, which an
// unminified bundle keeps: the sketch tool, the stroke recogniser it alone uses, the signature
// tool and the shape tool.
const OTHER_TOOLS = [
  'function sketchTool',
  'function recogniseStroke',
  'function signatureTool',
  'function shapeTool',
]
const HIGHLIGHT = 'function highlightTool'

describe('tree shaking @inkbar/core/dom', () => {
  it('importing only mountViewer leaves the controls and popovers out', async () => {
    const code = await bundle(`export { mountViewer } from ${JSON.stringify(INDEX)}`)
    // The engine itself is there.
    expect(code).toContain('function mountViewer')
    for (const marker of VIEWER_UI) expect(code).not.toContain(marker)
  })

  it('importing createViewer and the controls brings them in', async () => {
    const code = await bundle(
      `export { createViewer, createZoomSelect, createPrevPage } from ${JSON.stringify(INDEX)}`
    )
    for (const marker of VIEWER_UI) expect(code).toContain(marker)
  })

  it('importing one tool leaves the others out', async () => {
    const code = await bundle(
      `export { mountViewer, highlightTool } from ${JSON.stringify(INDEX)}`
    )
    for (const marker of OTHER_TOOLS) expect(code).not.toContain(marker)
    expect(code).toContain(HIGHLIGHT)
  })

  it('importing allTools brings every tool in', async () => {
    const code = await bundle(
      `export { mountViewer, allTools } from ${JSON.stringify(INDEX)}`
    )
    for (const marker of [...OTHER_TOOLS, HIGHLIGHT]) expect(code).toContain(marker)
  })
})
