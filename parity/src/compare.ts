// Whether two drawings of one page agree, after the blur that hides antialiasing.

export interface Comparison {
  /** Share of pixels that differ after blurring, 0 to 1. */
  share: number
  /** The largest share of differing pixels in any 16 × 16 block. */
  worstBlock: number
  same: boolean
}

/** Box blur, pixels. */
export const BLUR_RADIUS = 4
/** Of 255, any channel. */
export const CHANNEL_TOLERANCE = 48
export const MAX_SHARE = 0.001
export const MAX_BLOCK = 0.2

const BLOCK = 16

/**
 * The red, green and blue of `img` box-blurred by `BLUR_RADIUS`, three floats per pixel. A window
 * that runs off the edge averages the pixels it covers.
 */
function blur(img: ImageData): Float32Array {
  const { width, height, data } = img
  const r = BLUR_RADIUS
  const across = new Float32Array(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0
      let count = 0
      for (let x = 0; x < Math.min(r, width); x++) {
        sum += data[(y * width + x) * 4 + c]!
        count++
      }
      for (let x = 0; x < width; x++) {
        const enter = x + r
        if (enter < width) {
          sum += data[(y * width + enter) * 4 + c]!
          count++
        }
        const leave = x - r - 1
        if (leave >= 0) {
          sum -= data[(y * width + leave) * 4 + c]!
          count--
        }
        across[(y * width + x) * 3 + c] = sum / count
      }
    }
  }
  const out = new Float32Array(width * height * 3)
  for (let x = 0; x < width; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0
      let count = 0
      for (let y = 0; y < Math.min(r, height); y++) {
        sum += across[(y * width + x) * 3 + c]!
        count++
      }
      for (let y = 0; y < height; y++) {
        const enter = y + r
        if (enter < height) {
          sum += across[(enter * width + x) * 3 + c]!
          count++
        }
        const leave = y - r - 1
        if (leave >= 0) {
          sum -= across[(leave * width + x) * 3 + c]!
          count--
        }
        out[(y * width + x) * 3 + c] = sum / count
      }
    }
  }
  return out
}

function checkSizes(a: ImageData, b: ImageData): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `compare needs images of one size: ${a.width} × ${a.height} against ${b.width} × ${b.height}`
    )
  }
}

/** One flag per pixel: whether any blurred channel differs by more than `CHANNEL_TOLERANCE`. */
function differing(a: ImageData, b: ImageData): Uint8Array {
  checkSizes(a, b)
  const ba = blur(a)
  const bb = blur(b)
  const flags = new Uint8Array(a.width * a.height)
  for (let p = 0; p < flags.length; p++) {
    const i = p * 3
    if (
      Math.abs(ba[i]! - bb[i]!) > CHANNEL_TOLERANCE ||
      Math.abs(ba[i + 1]! - bb[i + 1]!) > CHANNEL_TOLERANCE ||
      Math.abs(ba[i + 2]! - bb[i + 2]!) > CHANNEL_TOLERANCE
    ) {
      flags[p] = 1
    }
  }
  return flags
}

/** Both images must have the same size; throws otherwise. */
export function compare(a: ImageData, b: ImageData): Comparison {
  const flags = differing(a, b)
  const { width, height } = a
  let total = 0
  let worstBlock = 0
  for (let by = 0; by < height; by += BLOCK) {
    for (let bx = 0; bx < width; bx += BLOCK) {
      const h = Math.min(BLOCK, height - by)
      const w = Math.min(BLOCK, width - bx)
      let n = 0
      for (let y = by; y < by + h; y++) {
        for (let x = bx; x < bx + w; x++) n += flags[y * width + x]!
      }
      total += n
      worstBlock = Math.max(worstBlock, n / (w * h))
    }
  }
  const share = flags.length === 0 ? 0 : total / flags.length
  return { share, worstBlock, same: share <= MAX_SHARE && worstBlock <= MAX_BLOCK }
}

/** A red-on-grey image of the differing pixels, for the report. */
export function differenceImage(a: ImageData, b: ImageData): ImageData {
  const flags = differing(a, b)
  const data = new Uint8ClampedArray(a.width * a.height * 4)
  for (let p = 0; p < flags.length; p++) {
    const i = p * 4
    if (flags[p]) {
      data[i] = 255
      data[i + 1] = 0
      data[i + 2] = 0
    } else {
      // The first image faded towards white, so the page shows faintly under the red.
      const grey =
        (a.data[i]! * 0.299 + a.data[i + 1]! * 0.587 + a.data[i + 2]! * 0.114) / 4
      data[i] = data[i + 1] = data[i + 2] = 191 + grey
    }
    data[i + 3] = 255
  }
  return typeof ImageData === 'function'
    ? new ImageData(data, a.width, a.height)
    : { width: a.width, height: a.height, data, colorSpace: 'srgb' }
}
