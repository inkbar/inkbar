// Whether two drawings of one page agree. Three checks: a blurred comparison that hides
// antialiasing, a check for pixels with no counterpart in the other image's 3 × 3 neighbourhood
// (a missing hairline), and a strict comparison where both images are flat (a missing pale fill).

export interface Comparison {
  /** Share of pixels that differ after blurring, 0 to 1. */
  share: number
  /** The largest share of differing pixels in any 16 × 16 block. */
  worstBlock: number
  /**
   * The longest straight run, across or down, of pixels that lie outside the range of the other
   * image's 3 × 3 neighbourhood by more than `SHIFT_TOLERANCE`. A missing rule makes a long run.
   */
  unmatchedRun: number
  /** Share of pixels, flat in both images, whose colours differ by more than `FLAT_TOLERANCE`. */
  flatShare: number
  /** The largest share of those pixels in any 16 × 16 block. */
  flatBlock: number
  same: boolean
}

// Each limit sits between the highest value measured on a page judged the same and the lowest
// real difference, over every fixture at 2 px per point; README.md has the table and the cases
// the checks cannot see.

/**
 * Box blur, pixels. At 2, text antialiasing reached a worst block of 0.34, as high as a missing
 * glyph; at 4 it falls to 0.03.
 */
export const BLUR_RADIUS = 4
/**
 * Of 255, any channel. Below 40 the noise rises fast; above 48 a missing 1 pt rule (about 57
 * levels after the blur) slips through.
 */
export const CHANNEL_TOLERANCE = 48
/** Same pages reach 0.0037%; real differences start at 0.04%. */
export const MAX_SHARE = 0.001
/**
 * Same pages reach 0.109 (`form-fieldmdp`); the smallest real difference is 0.328. Catches about
 * 92% of missing glyph parts of 40 px or more; dots and smaller parts mostly not.
 */
export const MAX_BLOCK = 0.2
/**
 * Of 255, any channel: how far a pixel may lie outside its neighbourhood in the other image. A
 * hairline paler than about #D0 on white stays inside it and is not seen.
 */
export const SHIFT_TOLERANCE = 48
/**
 * Pixels: the longest straight run of unmatched pixels allowed, 30 pt at 2 px per point. Same
 * pages reach 30 px; different pages reach 456. Runs are counted across and down only, so a
 * diagonal, dashed or dotted rule, a rule shorter than 30 pt, or a line within 1 px of other dark
 * content is not seen.
 */
export const MAX_UNMATCHED_RUN = 60
/**
 * Of 255, any channel, where both images are flat over the blur window. Same pages measure 0 at
 * every tolerance from 6 to 16. A pale shape narrower than 9 px is never flat, so not seen.
 */
export const FLAT_TOLERANCE = 8
/** 0.01%, about 200 px on an A4 page. Real differences reach 21% (`corpus-matte`). */
export const MAX_FLAT_SHARE = 0.0001
export const MAX_FLAT_BLOCK = 0.1

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
function blurredFlags(a: ImageData, b: ImageData): Uint8Array {
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

/** The least and greatest value of channel `c` of `img` over each pixel's 3 × 3 neighbourhood. */
function range3(img: ImageData, c: number): { lo: Uint8Array; hi: Uint8Array } {
  const { width: w, height: h, data } = img
  const rowLo = new Uint8Array(w * h)
  const rowHi = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let lo = 255
      let hi = 0
      for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) {
        const v = data[(y * w + xx) * 4 + c]!
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      rowLo[y * w + x] = lo
      rowHi[y * w + x] = hi
    }
  }
  const lo = new Uint8Array(w * h)
  const hi = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let l = 255
      let g = 0
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) {
        l = Math.min(l, rowLo[yy * w + x]!)
        g = Math.max(g, rowHi[yy * w + x]!)
      }
      lo[y * w + x] = l
      hi[y * w + x] = g
    }
  }
  return { lo, hi }
}

/**
 * One flag per pixel: whether, on some channel, either image's pixel lies more than
 * `SHIFT_TOLERANCE` below the least or above the greatest value of the other image's 3 × 3
 * neighbourhood. A stroke one reader snaps to whole pixels stays inside the other's range; a line
 * the other does not draw at all does not.
 */
function unmatchedFlags(a: ImageData, b: ImageData): Uint8Array {
  const n = a.width * a.height
  const flags = new Uint8Array(n)
  for (const [p, q] of [
    [a, b],
    [b, a],
  ] as const) {
    for (let c = 0; c < 3; c++) {
      const { lo, hi } = range3(q, c)
      for (let i = 0; i < n; i++) {
        const v = p.data[i * 4 + c]!
        if (v < lo[i]! - SHIFT_TOLERANCE || v > hi[i]! + SHIFT_TOLERANCE) flags[i] = 1
      }
    }
  }
  return flags
}

/** One flag per pixel: whether every pixel within `BLUR_RADIUS` across and down has its colour. */
function flatMask(img: ImageData): Uint8Array {
  const { width: w, height: h, data } = img
  const r = BLUR_RADIUS
  const n = w * h
  const colour = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    colour[i] = (data[i * 4]! << 16) | (data[i * 4 + 1]! << 8) | data[i * 4 + 2]!
  }
  // Equal neighbours in an unbroken line to the left and right, then rows that are flat and equal
  // in an unbroken line above and below. A window cut by the page edge counts what it covers.
  const left = new Uint16Array(n)
  const right = new Uint16Array(n)
  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w; x++) {
      const i = y * w + x
      if (colour[i] === colour[i - 1]) left[i] = left[i - 1]! + 1
    }
    for (let x = w - 2; x >= 0; x--) {
      const i = y * w + x
      if (colour[i] === colour[i + 1]) right[i] = right[i + 1]! + 1
    }
  }
  const row = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const x = i % w
    if (left[i]! >= Math.min(r, x) && right[i]! >= Math.min(r, w - 1 - x)) row[i] = 1
  }
  const up = new Uint16Array(n)
  const down = new Uint16Array(n)
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (row[i] && row[i - w] && colour[i] === colour[i - w]) up[i] = up[i - w]! + 1
    }
  }
  for (let y = h - 2; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (row[i] && row[i + w] && colour[i] === colour[i + w]) down[i] = down[i + w]! + 1
    }
  }
  const flat = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const y = Math.floor(i / w)
    if (row[i] && up[i]! >= Math.min(r, y) && down[i]! >= Math.min(r, h - 1 - y))
      flat[i] = 1
  }
  return flat
}

/** One flag per pixel: flat in both images, and some channel differs by more than `FLAT_TOLERANCE`. */
function flatFlags(a: ImageData, b: ImageData): Uint8Array {
  const fa = flatMask(a)
  const fb = flatMask(b)
  const flags = new Uint8Array(a.width * a.height)
  for (let p = 0; p < flags.length; p++) {
    if (!fa[p] || !fb[p]) continue
    const i = p * 4
    if (
      Math.abs(a.data[i]! - b.data[i]!) > FLAT_TOLERANCE ||
      Math.abs(a.data[i + 1]! - b.data[i + 1]!) > FLAT_TOLERANCE ||
      Math.abs(a.data[i + 2]! - b.data[i + 2]!) > FLAT_TOLERANCE
    ) {
      flags[p] = 1
    }
  }
  return flags
}

/** Share of flagged pixels, and the largest share in any 16 × 16 block. */
function shares(flags: Uint8Array, width: number, height: number) {
  let total = 0
  let worst = 0
  for (let by = 0; by < height; by += BLOCK) {
    for (let bx = 0; bx < width; bx += BLOCK) {
      const h = Math.min(BLOCK, height - by)
      const w = Math.min(BLOCK, width - bx)
      let n = 0
      for (let y = by; y < by + h; y++) {
        for (let x = bx; x < bx + w; x++) n += flags[y * width + x]!
      }
      total += n
      worst = Math.max(worst, n / (w * h))
    }
  }
  return { share: flags.length === 0 ? 0 : total / flags.length, worst }
}

/** The longest unbroken run of flags along a row or a column. */
function longestRun(flags: Uint8Array, width: number, height: number): number {
  let best = 0
  for (let y = 0; y < height; y++) {
    let run = 0
    for (let x = 0; x < width; x++) {
      run = flags[y * width + x] ? run + 1 : 0
      if (run > best) best = run
    }
  }
  for (let x = 0; x < width; x++) {
    let run = 0
    for (let y = 0; y < height; y++) {
      run = flags[y * width + x] ? run + 1 : 0
      if (run > best) best = run
    }
  }
  return best
}

/** Both images must have the same size; throws otherwise. */
export function compare(a: ImageData, b: ImageData): Comparison {
  checkSizes(a, b)
  const { width, height } = a
  const blurred = shares(blurredFlags(a, b), width, height)
  const unmatchedRun = longestRun(unmatchedFlags(a, b), width, height)
  const flat = shares(flatFlags(a, b), width, height)
  return {
    share: blurred.share,
    worstBlock: blurred.worst,
    unmatchedRun,
    flatShare: flat.share,
    flatBlock: flat.worst,
    same:
      blurred.share <= MAX_SHARE &&
      blurred.worst <= MAX_BLOCK &&
      unmatchedRun <= MAX_UNMATCHED_RUN &&
      flat.share <= MAX_FLAT_SHARE &&
      flat.worst <= MAX_FLAT_BLOCK,
  }
}

/**
 * The differing pixels over a faded copy of the first image, for the report: red where the
 * blurred images differ, blue for unmatched pixels, orange where flat areas differ.
 */
export function differenceImage(a: ImageData, b: ImageData): ImageData {
  checkSizes(a, b)
  const blurred = blurredFlags(a, b)
  const unmatched = unmatchedFlags(a, b)
  const flat = flatFlags(a, b)
  const data = new Uint8ClampedArray(a.width * a.height * 4)
  for (let p = 0; p < blurred.length; p++) {
    const i = p * 4
    if (blurred[p]) {
      data[i] = 255
      data[i + 1] = 0
      data[i + 2] = 0
    } else if (unmatched[p]) {
      data[i] = 0
      data[i + 1] = 64
      data[i + 2] = 255
    } else if (flat[p]) {
      data[i] = 255
      data[i + 1] = 140
      data[i + 2] = 0
    } else {
      // The first image faded towards white, so the page shows faintly under the marks.
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
