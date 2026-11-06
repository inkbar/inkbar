/*
 * A page thumbnail: one page drawn as a static image at a small size, with the page's live
 * annotations and plugin marks on top. The painter works on any element the caller gives it (a
 * binding's own markup, or `createThumbnail`'s div): it adds a class, `role="img"`, an
 * accessible name, its size and three layers, and `destroy()` takes all of that back off.
 *
 * Nothing renders until the element comes within 200px of the visible area; before that, and
 * while no document is open, the element is a placeholder of the right size. The canvas is the
 * page renderer's, with every form widget drawn as the PDF saved it. The annotations layer
 * draws each annotation's default look and the marks layer copies each plugin mark (rect, class
 * and style), with no handles, hit areas, focus or pointer handling: the layers are inert.
 *
 * Thumbnails ignore the viewer's rotation; only the page's own /Rotate applies.
 */
import { annotationBox, renderAnnotationContent } from '../overlay-render'
import { createPageRenderer, type PageRenderer } from '../page-renderer'
import { toCssName } from '../plugins/api/marks'
import { createPageTransform, type PageTransform } from '../transform'
import { onViewerDestroy, pluginHostOf, type Viewer } from '../viewer/create-viewer'

import type { Annotation } from '../../model/annotations/types'
import type { InkDocument } from '../../model/document'
import type { PageInfo } from '../../model/pages'
import type { Readable } from '../../model/readable'
import type { RecordBase } from '../../model/records'
import type { PluginHost } from '../plugins/host'

/** Width in CSS pixels when neither `width` nor `height` is given; the theme's `--ink-thumbnail-width`. */
export const THUMBNAIL_WIDTH = 120

/** Height over width of a placeholder with no page to take its shape from: A4 portrait. */
const PLACEHOLDER_RATIO = Math.SQRT2

/** How far outside the visible area a thumbnail starts to render. */
const ROOT_MARGIN = '200px'

export interface ThumbnailDeps {
  document: Readable<InkDocument | null>
  /** Where plugin marks come from. Without it, the thumbnail draws no marks. */
  pluginHost?: Readable<PluginHost | null>
}

export interface ThumbnailOptions {
  /** Zero-based page index. */
  page: number
  /** Width in CSS pixels; the height follows the page's shape. Wins over `height`. */
  width?: number
  /** Height in CSS pixels, used when `width` is absent; the width follows the page's shape. */
  height?: number
  /** Draw the page's annotations. Default true. */
  annotations?: boolean
  /** Draw plugin marks. Default true. */
  marks?: boolean
  /** The accessible name. Default "Page N", N being `page + 1`. */
  label?: string
}

export interface ThumbnailPainter {
  /** Applies changed options; the others stay as they were. */
  update(opts: Partial<ThumbnailOptions>): void
  /** Stops painting and removes everything the painter added to the element. */
  destroy(): void
}

/** CSS size and zoom for `page` fitted to width or height (width wins when both), /Rotate applied. */
export function thumbnailSize(
  page: PageInfo,
  size: { width?: number | undefined; height?: number | undefined }
): { width: number; height: number; zoom: number } {
  // The page's size at zoom 1, /Rotate and /UserUnit applied.
  const unit = createPageTransform(page, 1)
  if (size.width === undefined && size.height !== undefined) {
    const zoom = size.height / unit.cssHeight
    return { width: unit.cssWidth * zoom, height: size.height, zoom }
  }
  const width = size.width ?? THUMBNAIL_WIDTH
  const zoom = width / unit.cssWidth
  return { width, height: unit.cssHeight * zoom, zoom }
}

/** The placeholder's size with no page to measure: `width`, else `height`, else the default. */
function placeholderSize(opts: ThumbnailOptions): { width: number; height: number } {
  if (opts.width === undefined && opts.height !== undefined)
    return { width: opts.height / PLACEHOLDER_RATIO, height: opts.height }
  const width = opts.width ?? THUMBNAIL_WIDTH
  return { width, height: width * PLACEHOLDER_RATIO }
}

/** Restores an attribute to `value`, removing it when it was absent. */
function restoreAttr(el: Element, name: string, value: string | null): void {
  if (value === null) el.removeAttribute(name)
  else el.setAttribute(name, value)
}

/**
 * Paints page `opts.page` of the open document into `el`. The element keeps its own children
 * and classes; the painter appends its layers after them.
 */
export function createThumbnailPainter(
  el: HTMLElement,
  deps: ThumbnailDeps,
  initial: ThumbnailOptions
): ThumbnailPainter {
  const doc = el.ownerDocument
  let opts: ThumbnailOptions = { ...initial }

  // What the element had, so `destroy` leaves it as it was.
  const had = {
    class: el.classList.contains('ink-thumbnail'),
    role: el.getAttribute('role'),
    label: el.getAttribute('aria-label'),
    width: el.style.width,
    height: el.style.height,
  }
  el.classList.add('ink-thumbnail')
  el.setAttribute('role', 'img')

  /** A full-size layer: hidden from assistive tech, and inert so presses pass through it. */
  const layer = (className: string): HTMLElement => {
    const div = doc.createElement('div')
    div.className = className
    div.setAttribute('aria-hidden', 'true')
    div.inert = true
    div.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;'
    return div
  }
  const canvasLayer = layer('ink-thumbnail-canvas')
  el.append(canvasLayer)
  let annotationsLayer: HTMLElement | null = null
  let marksLayer: HTMLElement | null = null

  let current = deps.document.get()
  let host = deps.pluginHost?.get() ?? null
  let transform: PageTransform | null = null
  /** Whether the element is within the root margin of the visible area now. */
  let near = false
  /** Whether it ever was: the layers keep following edits once drawn. */
  let seen = false
  let destroyed = false

  let renderer: PageRenderer | null = null
  /** The document, page and transform `renderer` paints. */
  let painting: { doc: InkDocument; page: number; transform: PageTransform } | null = null

  const pageInfo = (): PageInfo | null => current?.pages[opts.page] ?? null

  /** Sizes the element and builds the transform; keeps the transform when nothing changed. */
  function layout(): void {
    const page = pageInfo()
    let size: { width: number; height: number }
    if (page) {
      const fit = thumbnailSize(page, opts)
      size = fit
      if (transform?.page !== page || transform.zoom !== fit.zoom)
        transform = createPageTransform(page, fit.zoom)
    } else {
      size = placeholderSize(opts)
      transform = null
    }
    el.style.width = `${size.width}px`
    el.style.height = `${size.height}px`
    el.setAttribute('aria-label', opts.label ?? `Page ${opts.page + 1}`)
  }

  function dropCanvas(): void {
    renderer?.destroy()
    renderer = null
    painting = null
  }

  function paintCanvas(): void {
    if (!current || !transform) {
      dropCanvas()
      return
    }
    if (!near) return
    if (painting?.doc === current && painting.page === opts.page) {
      if (painting.transform !== transform) {
        painting.transform = transform
        renderer!.update(transform)
      }
      return
    }
    dropCanvas()
    // A failed render leaves the placeholder; the viewport reports the page's error.
    renderer = createPageRenderer({
      document: current,
      page: opts.page,
      host: canvasLayer,
      transform,
      drawWidgets: true,
    })
    painting = { doc: current, page: opts.page, transform }
  }

  /** Each drawn annotation's element and what it was drawn from. */
  const drawn = new Map<string, { a: Annotation; t: PageTransform; node: HTMLElement }>()

  function drawAnnotations(): void {
    if (!annotationsLayer) return
    // Embedded annotations are on the canvas already, as the viewport draws them.
    const list =
      seen && current && transform
        ? current.annotations.byPage(opts.page).filter((a) => a.source !== 'pdf')
        : []
    const t = transform!
    const ids = new Set(list.map((a) => a.id))
    for (const [id, entry] of drawn) {
      if (ids.has(id)) continue
      entry.node.remove()
      drawn.delete(id)
    }
    let next = annotationsLayer.firstElementChild
    for (const a of list) {
      let entry = drawn.get(a.id)
      if (!entry) {
        const node = doc.createElement('div')
        node.className = 'ink-thumbnail-annotation'
        node.style.position = 'absolute'
        entry = { a, t, node }
        drawn.set(a.id, entry)
        draw(entry)
      } else if (entry.a !== a || entry.t !== t) {
        entry.a = a
        entry.t = t
        draw(entry)
      }
      if (entry.node === next) next = next.nextElementSibling
      else annotationsLayer.insertBefore(entry.node, next)
    }
  }

  function draw({ a, t, node }: { a: Annotation; t: PageTransform; node: HTMLElement }) {
    node.dataset.type = a.type
    const box = annotationBox(a, t)
    node.style.left = `${box.left}px`
    node.style.top = `${box.top}px`
    node.style.width = `${box.width}px`
    node.style.height = `${box.height}px`
    renderAnnotationContent(node, a, t)
  }

  function drawMarks(): void {
    if (!marksLayer) return
    const marks: HTMLElement[] = []
    const t = transform
    if (seen && host && t) {
      for (const key of host.marks.keys()) {
        for (const record of host
          .records<RecordBase & { page: number }>(key)
          .list.get()) {
          if (record.page !== opts.page) continue
          const reg = host.marks.resolve(key, record)
          if (!reg) continue
          const mark = doc.createElement('div')
          if (reg.className) mark.className = reg.className
          for (const [name, value] of Object.entries(
            (reg.style?.(record) ?? {}) as Record<string, string>
          ))
            mark.style.setProperty(toCssName(name), value)
          mark.dataset.record = record.id
          mark.dataset.plugin = reg.plugin
          const r = t.toCssRect(reg.rect(record))
          mark.style.position = 'absolute'
          mark.style.left = `${r.left}px`
          mark.style.top = `${r.top}px`
          mark.style.width = `${r.width}px`
          mark.style.height = `${r.height}px`
          marks.push(mark)
        }
      }
    }
    marksLayer.replaceChildren(...marks)
  }

  // Subscriptions, each restarted when what it follows changes.
  let stopAnnotations: (() => void) | null = null
  let stopRegistry: (() => void) | null = null
  let stopRecords: (() => void)[] = []

  function followAnnotations(): void {
    stopAnnotations?.()
    stopAnnotations =
      annotationsLayer && current
        ? current.annotations.list.subscribe(drawAnnotations)
        : null
  }

  function followRecords(): void {
    for (const stop of stopRecords) stop()
    stopRecords =
      marksLayer && host
        ? host.marks.keys().map((key) => host!.records(key).list.subscribe(drawMarks))
        : []
  }

  function followMarks(): void {
    stopRegistry?.()
    stopRegistry =
      marksLayer && host
        ? host.marks.watch(() => {
            followRecords()
            drawMarks()
          })
        : null
    followRecords()
  }

  /** Adds or removes the optional layers, keeping canvas, annotations, marks in that order. */
  function placeLayers(): void {
    const wantAnnotations = opts.annotations ?? true
    if (wantAnnotations && !annotationsLayer) {
      annotationsLayer = layer('ink-thumbnail-annotations')
      canvasLayer.after(annotationsLayer)
      followAnnotations()
    } else if (!wantAnnotations && annotationsLayer) {
      annotationsLayer.remove()
      annotationsLayer = null
      drawn.clear()
      followAnnotations()
    }
    const wantMarks = opts.marks ?? true
    if (wantMarks && !marksLayer) {
      marksLayer = layer('ink-thumbnail-marks')
      ;(annotationsLayer ?? canvasLayer).after(marksLayer)
      followMarks()
    } else if (!wantMarks && marksLayer) {
      marksLayer.remove()
      marksLayer = null
      followMarks()
    }
  }

  function refresh(): void {
    layout()
    placeLayers()
    paintCanvas()
    drawAnnotations()
    drawMarks()
  }

  const stopDocument = deps.document.subscribe((next) => {
    current = next
    // Another document is another page: nothing drawn from the last one carries over.
    dropCanvas()
    followAnnotations()
    refresh()
  })
  const stopHost = deps.pluginHost?.subscribe((next) => {
    host = next
    followMarks()
    drawMarks()
  })

  const onNear = (isNear: boolean): void => {
    if (destroyed || isNear === near) return
    near = isNear
    if (!near) return
    const first = !seen
    seen = true
    paintCanvas()
    if (first) {
      drawAnnotations()
      drawMarks()
    }
  }
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => onNear(entries[entries.length - 1]!.isIntersecting),
          { rootMargin: ROOT_MARGIN }
        )
  observer?.observe(el)

  refresh()
  // Without an observer (outside a browser), it is always in view.
  if (!observer) onNear(true)

  return {
    update(patch) {
      if (destroyed) return
      opts = { ...opts, ...patch }
      refresh()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      observer?.disconnect()
      stopDocument()
      stopHost?.()
      stopAnnotations?.()
      stopRegistry?.()
      for (const stop of stopRecords) stop()
      dropCanvas()
      canvasLayer.remove()
      annotationsLayer?.remove()
      marksLayer?.remove()
      drawn.clear()
      if (!had.class) el.classList.remove('ink-thumbnail')
      restoreAttr(el, 'role', had.role)
      restoreAttr(el, 'aria-label', had.label)
      el.style.width = had.width
      el.style.height = had.height
    },
  }
}

/**
 * A thumbnail of page `opts.page` of `viewer`'s open document, with its annotations and plugin
 * marks. Place it anywhere; it stops when the viewer is destroyed.
 */
export function createThumbnail(viewer: Viewer, opts: ThumbnailOptions): HTMLElement {
  const el = viewer.element.ownerDocument.createElement('div')
  const host = pluginHostOf(viewer)
  const painter = createThumbnailPainter(
    el,
    {
      document: viewer.document,
      pluginHost: { get: () => host, subscribe: () => () => undefined },
    },
    opts
  )
  onViewerDestroy(viewer, () => painter.destroy())
  return el
}
