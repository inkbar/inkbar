import { ArgumentError } from '../errors.ts'

import type { RenderRequestOptions } from '../protocol.ts'
import type { PageInfo } from '../types.ts'

const MAX_PIXELS = 268_435_456
/** The bound on any placement number, well inside the 32-bit integers the module takes. */
const MAX_PLACEMENT = 2 ** 30
const MAX_OBJECT_NUMBER = 2 ** 32 - 1
/** The most object numbers `hide` may list: far more annotations than any page holds. */
export const MAX_HIDDEN = 1_000_000

/** Where a render puts the page in its bitmap. */
export interface RenderGeometry {
  /** Bitmap width in pixels. */
  width: number
  /** Bitmap height in pixels. */
  height: number
  /** Left of the whole page in the bitmap, in pixels; negative when the region starts inside it. */
  startX: number
  /** Top of the whole page in the bitmap, in pixels. */
  startY: number
  /** Width of the whole page in the bitmap, in pixels, after every turn. */
  sizeX: number
  /** Height of the whole page in the bitmap, in pixels, after every turn. */
  sizeY: number
  /** Quarter turns clockwise on top of /Rotate, which the module applies itself. */
  rotate: 0 | 1 | 2 | 3
}

const ANGLES: readonly unknown[] = [0, 90, 180, 270]

/** Quarter turns for an angle of 0, 90, 180 or 270 degrees, or undefined for anything else. */
const quarterTurns = (angle: unknown) => {
  const turns = ANGLES.indexOf(angle)
  return turns < 0 ? undefined : (turns as 0 | 1 | 2 | 3)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * The left and top of `region`, in points from the top-left corner of the page as displayed
 * after `turns` quarter turns clockwise, with the region's displayed width and height.
 */
function displayed(
  box: PageInfo['box'],
  region: PageInfo['box'],
  turns: number
): { left: number; top: number; width: number; height: number } {
  // The region's distance from each edge of the page box, unturned.
  const fromLeft = region.x - box.x
  const fromBottom = region.y - box.y
  const fromRight = box.x + box.width - (region.x + region.width)
  const fromTop = box.y + box.height - (region.y + region.height)
  const { width, height } = region
  // A quarter turn clockwise brings the left edge to the top and the bottom edge to the left.
  switch (turns) {
    case 1:
      return { left: fromBottom, top: fromLeft, width: height, height: width }
    case 2:
      return { left: fromRight, top: fromBottom, width, height }
    case 3:
      return { left: fromTop, top: fromRight, width: height, height: width }
    default:
      return { left: fromLeft, top: fromTop, width, height }
  }
}

/**
 * The bitmap size and the page's placement in it for a render of `page` with `options`. Pure.
 * Sizes are in user-space units, as `page` gives them. Throws a `RangeError` for a bad scale,
 * size, region or rotation, or a bitmap over 268,435,456 pixels.
 */
export function renderGeometry(
  page: PageInfo,
  options: RenderRequestOptions
): RenderGeometry {
  const { scale, size, region = page.box, rotation = 0 } = options
  if (scale !== undefined && size !== undefined)
    throw new ArgumentError('pass scale or size, not both')
  if (scale !== undefined && (!finite(scale) || scale <= 0))
    throw new ArgumentError('scale must be a finite number above 0')
  if (
    size !== undefined &&
    (!isRecord(size) ||
      !Number.isInteger(size.width) ||
      !Number.isInteger(size.height) ||
      size.width < 1 ||
      size.height < 1)
  )
    throw new ArgumentError(
      'size must have a width and height that are whole numbers from 1'
    )
  if (
    !isRecord(region) ||
    !finite(region.x) ||
    !finite(region.y) ||
    !finite(region.width) ||
    !finite(region.height) ||
    region.width <= 0 ||
    region.height <= 0
  )
    throw new ArgumentError(
      'region must have a finite x and y, and a finite width and height above 0'
    )
  const rotate = quarterTurns(rotation)
  if (rotate === undefined) throw new ArgumentError('rotation must be 0, 90, 180 or 270')

  const turns = (quarterTurns(page.rotation) ?? 0) + rotate
  const area = displayed(page.box, region, turns % 4)
  const pageWidth = turns % 2 === 0 ? page.width : page.height
  const pageHeight = turns % 2 === 0 ? page.height : page.width

  let width: number,
    height: number,
    sizeX: number,
    sizeY: number,
    xScale: number,
    yScale: number
  if (size === undefined) {
    // One scale both ways. The page is placed as in a whole-page render at the same scale,
    // so a region's bitmap is a cut from that render.
    xScale = yScale = scale ?? 1
    width = Math.ceil(area.width * xScale)
    height = Math.ceil(area.height * yScale)
    sizeX = Math.ceil(pageWidth * xScale)
    sizeY = Math.ceil(pageHeight * yScale)
  } else {
    // The region is stretched to fill the size asked.
    ;({ width, height } = size)
    xScale = width / area.width
    yScale = height / area.height
    sizeX = Math.round(pageWidth * xScale)
    sizeY = Math.round(pageHeight * yScale)
  }
  // `0 -` keeps a zero offset +0.
  const startX = 0 - Math.round(area.left * xScale)
  const startY = 0 - Math.round(area.top * yScale)

  if (width < 1 || height < 1 || width * height > MAX_PIXELS)
    throw new ArgumentError('the rendered page would be too large')
  if ([startX, startY, sizeX, sizeY].some((n) => !(Math.abs(n) <= MAX_PLACEMENT)))
    throw new ArgumentError(
      size === undefined
        ? 'the page lies too far from the region, or is too large at this scale'
        : 'the region is too small for the size asked'
    )
  if (sizeX < 1 || sizeY < 1)
    throw new ArgumentError(
      size === undefined
        ? 'the scale is too small to draw the page'
        : 'the region is too large for the size asked'
    )
  return { width, height, startX, startY, sizeX, sizeY, rotate }
}

/** The largest place in `/Annots` the module takes: it reads places as 32-bit integers. */
const MAX_PLACE = 2 ** 31 - 1

const isPlace = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_PLACE

/** What a render leaves out: annotations by object number, and by place in `/Annots`. */
export interface Hidden {
  objects: number[]
  places: number[]
}

/**
 * The annotations to leave out, checked and split by how each is named. Throws a `RangeError`
 * for a list that is not one of object numbers (whole numbers from 1 to 4,294,967,295) and
 * places (`{ index }`, a whole number from 0 to 2,147,483,647), or that is longer than
 * `MAX_HIDDEN`.
 */
export function hiddenAnnotations(hide: unknown): Hidden {
  const hidden: Hidden = { objects: [], places: [] }
  if (hide === undefined) return hidden
  if (Array.isArray(hide) && hide.length > MAX_HIDDEN)
    throw new ArgumentError('hide may list at most 1,000,000 annotations')
  if (!Array.isArray(hide))
    throw new ArgumentError('hide must be a list of object numbers and places')
  for (const item of hide as unknown[]) {
    if (
      Number.isInteger(item) &&
      (item as number) >= 1 &&
      (item as number) <= MAX_OBJECT_NUMBER
    )
      hidden.objects.push(item as number)
    else if (isRecord(item) && isPlace(item.index)) hidden.places.push(item.index)
    else
      throw new ArgumentError(
        'hide must list object numbers, whole numbers from 1, and places, { index } with a whole number from 0'
      )
  }
  return hidden
}

/** One annotation to draw alone, checked. */
export interface AnnotationDraw {
  index: number
  /** The state's name as its bytes, without a NUL; absent for the state `/AS` selects. */
  state?: Uint8Array
}

/**
 * The annotations `renderAnnotations` draws, checked. Throws a `RangeError` for a list that is
 * not one of `{ index, state? }`, with a place as `hide` takes it and a state of one or more
 * characters from U+0001 to U+00FF, or that is longer than `MAX_HIDDEN`.
 */
export function annotationDraws(annotations: unknown): AnnotationDraw[] {
  if (!Array.isArray(annotations))
    throw new ArgumentError('annotations must be a list of { index, state? }')
  if (annotations.length > MAX_HIDDEN)
    throw new ArgumentError('annotations may list at most 1,000,000 entries')
  return (annotations as unknown[]).map((item, i) => {
    if (!isRecord(item) || !isPlace(item.index))
      throw new ArgumentError(
        `annotation ${i}: index must be a whole number from 0 to 2,147,483,647`
      )
    const { state } = item
    if (state === undefined) return { index: item.index }
    // A name's bytes, one a character; a NUL would end the name the module reads.
    // eslint-disable-next-line no-control-regex -- U+0001 is the first byte a name may hold
    if (typeof state !== 'string' || !/^[\u0001-\u00ff]+$/.test(state))
      throw new ArgumentError(
        `annotation ${i}: state must be a name of one or more characters from U+0001 to U+00FF`
      )
    return { index: item.index, state: Uint8Array.from(state, (c) => c.charCodeAt(0)) }
  })
}

/**
 * The matrix the module's annotation draw takes, which it applies after the page's display
 * matrix, for the same placement as a render with `geometry`. The display matrix takes the page
 * to `width` by `height` points (its size after /Rotate), top left at the origin; a render maps
 * the page onto the rectangle `startX`, `startY`, `sizeX`, `sizeY` turned `rotate` quarters, as
 * PDFium's `GetDisplayMatrixForRect` does. The result undoes the first and applies the second.
 */
export function annotationMatrix(
  geometry: RenderGeometry,
  width: number,
  height: number
): [number, number, number, number, number, number] {
  const left = geometry.startX
  const right = geometry.startX + geometry.sizeX
  // PDFium's float rectangle from a device rectangle: its bottom is the device top.
  const bottom = geometry.startY
  const top = geometry.startY + geometry.sizeY
  // As `GetDisplayMatrixForFloatRect`: the base point, that point moved along the page's y, and
  // along its x.
  const [x0, y0, x1, y1, x2, y2] = [
    [left, top, left, bottom, right, top],
    [left, bottom, right, bottom, left, top],
    [right, bottom, right, top, left, bottom],
    [right, top, left, top, right, bottom],
  ][geometry.rotate] as [number, number, number, number, number, number]
  const a = (x2 - x0) / width
  const b = (y2 - y0) / width
  const c = (x1 - x0) / height
  const d = (y1 - y0) / height
  // The display matrix sends the page's (x, y) to (x, height - y); undo that, then place it.
  return [a, b, -c, -d, height * c + x0, height * d + y0]
}
