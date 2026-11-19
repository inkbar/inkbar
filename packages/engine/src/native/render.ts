import { ArgumentError } from '../errors.ts'

import type { RenderRequestOptions } from '../protocol.ts'
import type { PageInfo } from '../types.ts'

const MAX_PIXELS = 268_435_456
/** The bound on any placement number, well inside the 32-bit integers the module takes. */
const MAX_PLACEMENT = 2 ** 30
const MAX_OBJECT_NUMBER = 2 ** 32 - 1

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
    throw new ArgumentError('the region is too small for the size asked')
  if (sizeX < 1 || sizeY < 1)
    throw new ArgumentError('the region is too large for the size asked')
  return { width, height, startX, startY, sizeX, sizeY, rotate }
}

/**
 * The object numbers to leave out, checked. Throws a `RangeError` for a list that is not one of
 * whole numbers from 1 to 4,294,967,295.
 */
export function hiddenObjects(hide: unknown): readonly number[] {
  if (hide === undefined) return []
  if (
    !Array.isArray(hide) ||
    !hide.every(
      (n: unknown) =>
        Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_OBJECT_NUMBER
    )
  )
    throw new ArgumentError('hide must be a list of object numbers, whole numbers from 1')
  return hide as number[]
}
