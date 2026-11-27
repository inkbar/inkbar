import { describe, expect, it, vi } from 'vitest'

import { sandboxLoader } from '../pdfjs/sandbox'

const evaluated = vi.hoisted(() => ({ pdfjs: false }))

// The factory only runs when something actually imports PDF.js's scripting sandbox, the one part
// of PDF.js core loads.
vi.mock('#pdfjs-sandbox', () => {
  evaluated.pdfjs = true
  return { QuickJSSandbox: () => undefined }
})

describe('@inkbar/core/dom entry', () => {
  it('evaluates no PDF.js code on import, and the mock is live', async () => {
    const entry = await import('./index')
    expect(evaluated.pdfjs).toBe(false)
    expect(Object.keys(entry)).not.toContain('confidenceAttr')
    expect(Object.keys(entry)).not.toContain('builtinTools')
    expect(Object.keys(entry)).toEqual(
      expect.arrayContaining([
        'createViewport',
        'attachViewportKeys',
        'attachHistoryKeys',
        'computeCssLayout',
        'createPageTransform',
        'createPageRenderer',
        'createTextLayer',
        'getSelectionQuads',
        'cssRectsToUserRects',
        'createOverlay',
        'renderAnnotationContent',
        'cssVariableDefaults',
        'createPageMount',
        'createToolController',
        'allTools',
        'unknownTool',
        'withHostTools',
        'drawTool',
        'sketchTool',
        'hitFor',
        'createPopover',
        'placePanel',
        'definePlugin',
        'createPluginHost',
        'createPluginLayers',
        'createSidebarController',
        'createSidebar',
        'sidebarBadge',
        'isBlankQuery',
        'createPasswordPrompt',
        'lockedStatus',
        'createMessageState',
        'runRedaction',
        'canRedact',
        'redactionBusy',
        'editingPaused',
        'redactionFailure',
        'applyRedactionsFlow',
        'redactionDoneMessage',
        'createRedactionDialog',
        'createApplyRedactionsButton',
      ])
    )

    // Control: the same mock does fire once the sandbox loads, so the false above is meaningful.
    await sandboxLoader.load()
    expect(evaluated.pdfjs).toBe(true)
  })
})
