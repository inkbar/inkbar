import { describeAnnotation } from '../model/annotations/drawing/describe'
import { measureWith } from '../model/annotations/drawing/text/measure'

import { browserWidth } from './text-fonts'

import type { PageTransform } from './transform'
import type { DrawContext, Drawing } from '../model/annotations/drawing/types'
import type { Annotation } from '../model/annotations/types'

/** The standard tables, with the browser's fonts measuring what they do not hold. */
const measure = measureWith(browserWidth)

/** What describing an annotation needs from its page. Zoom and view rotation are not part of it. */
export function drawContext(t: PageTransform): DrawContext {
  return {
    page: { box: t.page.box, rotate: t.page.rotate, userUnit: t.page.userUnit },
    measure,
  }
}

/** `undefined` is cached too: it means "no drawing", and the next call need not ask again. */
const cache = new WeakMap<
  Annotation,
  { page: DrawContext['page']; drawing: Drawing | undefined }
>()

const samePage = (a: DrawContext['page'], b: DrawContext['page']): boolean =>
  a.rotate === b.rotate &&
  a.userUnit === b.userUnit &&
  a.box.x === b.box.x &&
  a.box.y === b.box.y &&
  a.box.width === b.box.width &&
  a.box.height === b.box.height

/**
 * The drawing of `a`, or `undefined` when its type is not described yet. Cached by annotation
 * object: the store replaces an annotation on every update, never mutates one. The cache
 * ignores zoom and view rotation, which a drawing does not depend on; it is dropped when the
 * page's own box, rotation or unit differ from those it was made for.
 */
export function drawingFor(a: Annotation, t: PageTransform): Drawing | undefined {
  const context = drawContext(t)
  const hit = cache.get(a)
  if (hit && samePage(hit.page, context.page)) return hit.drawing
  const drawing = describeAnnotation(a, context)
  cache.set(a, { page: context.page, drawing })
  return drawing
}
