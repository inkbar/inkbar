import { describe, expect, it, vi } from 'vitest'

import { loadPdfjs } from '../pdfjs/load'
import { nodeAssets } from '../pdfjs/node-assets'

const evaluated = vi.hoisted(() => ({ pdfjs: false }))

// The factory only runs when something actually imports PDF.js.
vi.mock('#pdfjs', () => {
  evaluated.pdfjs = true
  return { GlobalWorkerOptions: {} }
})

describe('@inkbar/core/dom entry', () => {
  it('evaluates no PDF.js code on import, and the mock is live', async () => {
    const entry = await import('./index')
    expect(evaluated.pdfjs).toBe(false)
    expect(Object.keys(entry)).toEqual(
      expect.arrayContaining([
        'createViewport',
        'computeCssLayout',
        'createPageTransform',
        'createPageRenderer',
        'createTextLayer',
        'getSelectionQuads',
        'cssRectsToUserRects',
        'createOverlay',
        'confidenceAttr',
        'renderAnnotationContent',
        'cssVariableDefaults',
        'createPageMount',
        'createToolController',
        'builtinTools',
        'hitFor',
      ])
    )

    // Control: the same mock does fire once the loader runs, so the false above is meaningful.
    await loadPdfjs(nodeAssets())
    expect(evaluated.pdfjs).toBe(true)
  })
})
