import { describeFreeText } from './freetext'
import { describeInk } from './ink'
import { describeLine } from './lines'
import { describeLoupe } from './loupe'
import { describeMarkup, describeRedact } from './markup'
import { describeMask } from './mask'
import { describeNote } from './note'
import { describeShape } from './shapes'
import { describeStamp } from './stamp'

import type { Annotation, MaskAnnotation } from '../types'
import type { DrawContext, Drawing } from './types'

/**
 * Whether the page canvas draws `a`, so the overlay gives it only a hit area. PDF.js paints
 * embedded annotations, with a stand-in for most that have no appearance stream, but draws no
 * icon for a note without one: the overlay draws that note's icon itself.
 */
export function paintedByCanvas(a: Annotation): boolean {
  return a.source === 'pdf' && !(a.type === 'text' && a.hasAppearance === false)
}

/** Reading order in user space: top edge first (y grows upwards), then left edge. */
export function readingOrder(a: Annotation, b: Annotation): number {
  return b.rect.y + b.rect.height - (a.rect.y + a.rect.height) || a.rect.x - b.rect.x
}

/**
 * The mask a page dims for: the first of `list` in reading order. A page has one dimming
 * layer, so wherever a page is drawn (the viewer, a thumbnail) this picks the same mask.
 */
export function dimmingMask(list: readonly Annotation[]): MaskAnnotation | undefined {
  return list.filter((a): a is MaskAnnotation => a.type === 'mask').sort(readingOrder)[0]
}

/**
 * The drawing of `a`, or `undefined` for one the page canvas paints.
 */
export function describeAnnotation(
  a: Annotation,
  context: DrawContext
): Drawing | undefined {
  return paintedByCanvas(a) ? undefined : describeDrawing(a, context)
}

/**
 * The drawing of `a` wherever it comes from. A draft or a copy of an embedded annotation (a
 * drag preview, an edited text box) is drawn with this: the canvas paints the original, not
 * the draft. A reply has a drawing too: whether an annotation is a reply depends on the list it
 * is in (`withoutReplies`), so whoever draws a page leaves the replies out before asking.
 */
export function describeDrawing(
  a: Annotation,
  context: DrawContext
): Drawing | undefined {
  switch (a.type) {
    case 'highlight':
    case 'underline':
    case 'strikeout':
    case 'squiggly':
      return describeMarkup(a)
    case 'redact':
      return describeRedact(a)
    case 'square':
    case 'circle':
      return describeShape(a)
    case 'line':
    case 'polyline':
    case 'polygon':
      return describeLine(a)
    case 'text':
      return describeNote(a, context)
    case 'freetext':
      return describeFreeText(a, context)
    case 'ink':
      return describeInk(a)
    case 'stamp':
      return describeStamp(a)
    case 'loupe':
      return describeLoupe(a)
    case 'mask':
      return describeMask(a, context)
    default:
      return undefined
  }
}
