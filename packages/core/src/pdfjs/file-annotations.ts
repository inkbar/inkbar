// A page's annotations as PDF.js lists them, in core's own shape.
import type { PdfjsAnnotationData } from './types'
import type { FileAnnotation } from '../reader/file'

type Rgb = [number, number, number]

/** The first three components, or undefined when there are fewer. */
function rgb(c: ArrayLike<number> | null | undefined): Rgb | undefined {
  return c && c.length >= 3 ? [c[0]!, c[1]!, c[2]!] : undefined
}

/** @internal One entry of `getAnnotations()` as a `FileAnnotation`. */
export function fileAnnotationFromPdfjs(d: PdfjsAnnotationData): FileAnnotation {
  const color = rgb(d.color)
  const interiorColor = rgb(d.interiorColor)
  const da = d.defaultAppearanceData
  const daColor = rgb(da?.fontColor as ArrayLike<number> | undefined)
  const [x1, y1, x2, y2] = d.rect
  return {
    id: d.id,
    subtype: d.subtype,
    rect: [x1, y1, x2, y2],
    hasAppearance: d.hasAppearance === true,
    ...(d.quadPoints ? { quads: Array.from(d.quadPoints) } : {}),
    ...(color ? { color } : {}),
    ...(interiorColor ? { interiorColor } : {}),
    ...(typeof d.opacity === 'number' ? { opacity: d.opacity } : {}),
    ...(d.contentsObj ? { contents: d.contentsObj.str } : {}),
    ...(d.titleObj ? { author: d.titleObj.str } : {}),
    ...(typeof d.creationDate === 'string' ? { created: d.creationDate } : {}),
    ...(typeof d.modificationDate === 'string' ? { modified: d.modificationDate } : {}),
    ...(d.name !== undefined ? { icon: d.name } : {}),
    ...(d.inReplyTo !== undefined ? { inReplyTo: d.inReplyTo } : {}),
    ...(d.it !== undefined ? { intent: d.it } : {}),
    ...(d.lineCoordinates ? { line: [...d.lineCoordinates] } : {}),
    ...(d.lineEndings?.length === 2
      ? { lineEndings: [d.lineEndings[0]!, d.lineEndings[1]!] }
      : {}),
    ...(d.vertices ? { vertices: Array.from(d.vertices) } : {}),
    ...(d.inkLists ? { inkLists: d.inkLists.map((p) => Array.from(p)) } : {}),
    ...(d.borderStyle ? { border: { width: d.borderStyle.width } } : {}),
    ...(da
      ? {
          defaultAppearance: {
            fontSize: da.fontSize,
            ...(da.fontName !== undefined ? { fontName: da.fontName } : {}),
            ...(daColor ? { color: daColor } : {}),
          },
        }
      : {}),
  }
}
