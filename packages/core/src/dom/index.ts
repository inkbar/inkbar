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
  createToolOptions,
  freetextTool,
  highlightTool,
  hitFor,
  noteTool,
  redactAreaTool,
  selectTextTool,
  selectTool,
  shapeTool,
  signatureTool,
  trackToolStyle,
  withHostTools,
} from './tools'
export type {
  BuiltinToolId,
  PageHit,
  Tool,
  ToolContext,
  ToolController,
  ToolControllerOptions,
  ToolId,
  ToolOptions,
  ToolStyleTracker,
} from './tools'
export {
  DEFAULT_CORNER_RADIUS,
  DEFAULT_FREETEXT_WIDTH,
  DEFAULT_HIGHLIGHT_OPTIONS,
  DEFAULT_SHAPE_SIZE,
  MARKUP_KINDS,
  SHAPE_KINDS,
} from './tools'
export type {
  HighlightOptions,
  MarkupKind,
  ShapeKind,
  ShapeOptions,
  SignatureOptions,
} from './tools'
export type {
  CurrentStyle,
  ScopedToolStyle,
  StyleGroup,
  StyleKey,
  StyleProps,
  ToolStyle,
} from '../model/annotations/tool-style'
export { cssVariableDefaults } from '../model/annotations/defaults'
export {
  ARROWHEAD_CHOICES,
  ARROWHEAD_ENDING,
  COLOR_COLUMNS,
  COLOR_LABELS,
  DASH_PATTERN,
  FONT_FAMILIES,
  LINE_WEIGHTS,
  MARKUP_LABELS,
  SHAPE_COLUMNS,
  SHAPE_LABELS,
  SIGNATURE_FONTS,
  SIGNATURE_LABELS,
  SIGNATURE_TABS,
  TOOL_LABELS,
  ZOOM_LEVELS,
  arrowheadChoice,
  clampFontSize,
  colorMenuModel,
  highlightMenuModel,
  lineStyleMenuModel,
  shapeMenuModel,
  signatureMenuModel,
  textStyleMenuModel,
  threadPopoverLabel,
} from './ui'
export { PALETTE } from './palette'
export type { Palette } from './palette'
export type {
  ArrowheadChoice,
  ColorMenuModel,
  ColorMenuSwatch,
  ColorProperty,
  ColorTrigger,
  HighlightMenuItem,
  HighlightMenuModel,
  LineStyleMenuItem,
  LineStyleMenuModel,
  LineStyleMenuSection,
  ShapeMenuItem,
  ShapeMenuModel,
  SignatureMenuItem,
  SignatureMenuModel,
  SignatureTab,
  TextAlignChoice,
  TextAlignKey,
  TextStyleMenuModel,
  TextStyleToggle,
  TextToggleKey,
} from './ui'
export type {
  AnnotationSlotProps,
  AnnotationState,
  ThreadPopoverSlotProps,
  SuggestionCardSlotProps,
} from './ui'
export { editFreeText } from './freetext-editor'
export type { FreeTextEditor, FreeTextEditorOptions } from './freetext-editor'
export {
  focusInitialMenuItem,
  handleMenuKeys,
  handleRadioKeys,
  handleTabKeys,
  menuItems,
  trapTab,
} from './menu-keys'
export { annotationElementFor, observeAnnotationElement } from './annotation-element'
export { createFocusReturn, shouldKeepOpenOnAnnotation } from './popover-focus'
export type { FocusReturn, FocusReturnOptions } from './popover-focus'
export { mountViewer } from './viewer-engine'
export type { MountViewerOptions, ViewerEngine } from './viewer-engine'
export { createViewer } from './viewer/create-viewer'
export type { CreateViewerOptions, Viewer } from './viewer/create-viewer'
export {
  createIcon,
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createRedo,
  createToolbar,
  createToolbarSeparator,
  createToolButton,
  createUndo,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
} from './viewer/controls'
export { createLineStyleMenu } from './viewer/style-menu'
export { createColorMenu } from './viewer/color-menu'
export { createTextStyleMenu } from './viewer/text-style-menu'
export { createShapeMenu } from './viewer/shape-menu'
export { createHighlightMenu } from './viewer/highlight-menu'
export { SHAPE_ICONS } from './shape-icons'
export { MARKUP_ICONS } from './markup-icons'
export type { ColorMenuOptions } from './viewer/color-menu'
export { createMenu } from './viewer/menu'
export type { Menu, MenuOptions } from './viewer/menu'
export {
  createImageSignature,
  createSignaturePad,
  createTypedSignature,
  fontFamilyValue,
  renderTypedSignature,
  SIGNATURE_IMAGE_TYPES,
  signaturePreview,
} from './signature-pad'
export type { SignaturePad, TypedSignatureOptions } from './signature-pad'
export { createSignatureDraft } from './signature-draft'
export type { SignatureDraft, SignatureDraftState } from './signature-draft'
export { createSignatureMenu, createSignaturePreview } from './viewer/signature-menu'
export { createSignatureDialog } from './viewer/signature-dialog'
export type { SignatureDialog, SignatureDialogOptions } from './viewer/signature-dialog'
