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
export type { PageHit, Viewport, ViewportOptions, ZoomValue } from './viewport'
