// `@inkbar/core/dom`. Nothing here may evaluate PDF.js at module load: frameworks import this
// entry during server rendering.
export { createPageTransform, normalizeRotation } from './transform'
export type { CssRect, PageTransform, ViewRotation } from './transform'
export {
  computeCssLayout,
  fitZoomCss,
  mostVisiblePageCss,
  visibleRangeCss,
} from './layout'
export type { CssLayout, CssLayoutInput, CssPageBox, LayoutMode } from './layout'
export { createViewport } from './viewport'
export type { Viewport, ViewportHit, ViewportOptions, ZoomValue } from './viewport'
export { attachViewportKeys } from './viewport-keys'
export type { ViewportKeysOptions } from './viewport-keys'
export { createPageRenderer } from './page-renderer'
export type { PageRenderer, PageRendererOptions } from './page-renderer'
export { createTextLayer } from './text-layer'
export type { TextLayerHandle, TextLayerOptions } from './text-layer'
export { cssRectsToUserRects, getSelectionQuads } from './selection'
export type { SelectionQuads } from './selection'
export { confidenceAttr, createOverlay } from './overlay'
export type { Overlay, OverlayOptions } from './overlay'
export { renderAnnotationContent } from './overlay-render'
export { createPageMount } from './page-mount'
export type { PageLayer, PageMount, PageMountOptions } from './page-mount'
export {
  builtinTools,
  createToolController,
  highlightTool,
  hitFor,
  noteTool,
  redactAreaTool,
  selectTool,
  viewTool,
} from './tools'
export type {
  PageHit,
  Tool,
  ToolContext,
  ToolController,
  ToolControllerOptions,
  ToolId,
} from './tools'
export { cssVariableDefaults } from '../model/annotations/defaults'
export { TOOL_LABELS, ZOOM_LEVELS } from './ui'
export type {
  AnnotationSlotProps,
  AnnotationState,
  NotePopoverSlotProps,
  SuggestionCardSlotProps,
} from './ui'
export { annotationElementFor, observeAnnotationElement } from './annotation-element'
