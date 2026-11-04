/*
 * The long document: 200 pages of a made-up works log, drawn in Helvetica alone so the file
 * stays small and builds fast. The words come from `long-text.ts`.
 */
import { H, INK, SIDE, W, newDocument, save } from './layout.ts'
import { LONG_PAGES, longPageText } from './long-text.ts'

export {
  LONG_HITS,
  LONG_HIT_PAGES,
  LONG_PAGES,
  SEARCH_WORD,
  longPageText,
} from './long-text.ts'

const TOP = 72
const LEADING = 15.5
const SIZE = 10.5

export async function makeLong(): Promise<Uint8Array> {
  const { d, fonts } = await newDocument('Works log')
  const measure = W - SIDE * 2
  for (let n = 1; n <= LONG_PAGES; n++) {
    const page = d.addPage([W, H])
    const [heading, ...body] = longPageText(n)
    page.drawText(heading!, {
      x: SIDE,
      y: H - TOP,
      size: 13.5,
      font: fonts.bold,
      color: INK,
    })
    body.forEach((line, i) => {
      if (!line) return
      if (fonts.regular.widthOfTextAtSize(line, SIZE) > measure)
        throw new Error(`page ${n}: “${line}” is wider than the page`)
      page.drawText(line, {
        x: SIDE,
        y: H - TOP - 12 - (i + 1) * LEADING,
        size: SIZE,
        font: fonts.regular,
        color: INK,
      })
    })
  }
  return save(d)
}
