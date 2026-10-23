import { applyMatrix, multiplyMatrix, type Matrix } from '../model/geometry'

import type { PdfjsModule, PdfjsPage } from './types'
import type { PageGlyph } from '../model/glyph-advances'

interface Glyph {
  unicode: string
  width: number
  isSpace: boolean
}

interface Font {
  fontMatrix?: readonly number[]
  vertical?: boolean
  isType3Font?: boolean
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
const FONT_IDENTITY = [0.001, 0, 0, 0.001, 0, 0]

/** The parts of PDF.js's canvas state that move the pen, copied on save. */
interface State {
  ctm: Matrix
  textMatrix: Matrix
  x: number
  y: number
  lineX: number
  lineY: number
  font: Font
  fontSize: number
  fontDirection: number
  charSpacing: number
  wordSpacing: number
  hScale: number
  leading: number
  rise: number
}

/**
 * The glyphs a page draws, in content order, with where each starts and where its own width ends
 * in user space. The pen moves the way PDF.js's canvas renderer moves it (`showText` and
 * `showType3Text`): text matrix and moves, the current transformation matrix, font size and font
 * matrix, character and word spacing, horizontal scaling, and `TJ` kerning. Glyphs in vertical
 * fonts are left out. Annotation appearances are not read.
 */
export async function pageGlyphs(
  page: PdfjsPage,
  pdfjs: PdfjsModule
): Promise<PageGlyph[]> {
  const ops = pdfjs.OPS
  const list = await page.getOperatorList({
    annotationMode: pdfjs.AnnotationMode.DISABLE,
  })
  const out: PageGlyph[] = []
  let s: State = {
    ctm: IDENTITY,
    textMatrix: IDENTITY,
    x: 0,
    y: 0,
    lineX: 0,
    lineY: 0,
    font: {},
    fontSize: 0,
    fontDirection: 1,
    charSpacing: 0,
    wordSpacing: 0,
    hScale: 1,
    leading: 0,
    rise: 0,
  }
  const saved: State[] = []
  const save = () => {
    saved.push(s)
    s = { ...s }
  }
  const restore = () => {
    s = saved.pop() ?? s
  }
  const setFont = (name: unknown, size: unknown) => {
    let font: Font = {}
    try {
      font = (page.commonObjs.get(String(name)) as Font | null) ?? {}
    } catch {
      // A font PDF.js has not resolved draws nothing; keep the size so the pen still moves.
    }
    const n = Number(size)
    s.font = font
    s.fontDirection = n < 0 ? -1 : 1
    s.fontSize = Math.abs(n)
  }
  const moveText = (x: number, y: number) => {
    s.x = s.lineX += x
    s.y = s.lineY += y
  }
  const show = (glyphs: readonly (Glyph | number | null)[]) => {
    const { font, fontSize, fontDirection, charSpacing, wordSpacing } = s
    if (fontSize === 0) return
    const fontMatrix = font.fontMatrix ?? FONT_IDENTITY
    const toUser = multiplyMatrix(s.textMatrix, s.ctm)
    const at = (x: number): ReturnType<typeof applyMatrix> =>
      applyMatrix(toUser, { x: s.x + x, y: s.y + s.rise })
    const hScale = s.hScale * fontDirection
    let x = 0
    for (const g of glyphs) {
      if (typeof g === 'number') {
        x += (-g * fontSize) / 1000
        continue
      }
      if (!g) continue
      const spacing = charSpacing + (g.isSpace ? wordSpacing : 0)
      // A Type3 width goes through the whole font matrix; other fonts scale by its first entry.
      const width = font.isType3Font
        ? (g.width * fontMatrix[0]! + fontMatrix[4]!) * fontSize
        : g.width * fontSize * fontMatrix[0]!
      if (!font.vertical) {
        out.push({
          text: g.unicode,
          start: at(x * hScale),
          end: at((x + width) * hScale),
        })
      }
      x += width + spacing * (font.isType3Font ? 1 : fontDirection)
    }
    s.x += x * hScale
  }
  for (let i = 0; i < list.fnArray.length; i++) {
    const args = list.argsArray[i] as unknown[] | null
    switch (list.fnArray[i]) {
      case ops.save:
        save()
        break
      case ops.restore:
        restore()
        break
      case ops.paintFormXObjectBegin:
        save()
        if (args?.[0]) s.ctm = multiplyMatrix(args[0] as unknown as Matrix, s.ctm)
        break
      case ops.paintFormXObjectEnd:
        restore()
        break
      case ops.transform:
        s.ctm = multiplyMatrix(args as unknown as Matrix, s.ctm)
        break
      case ops.beginText:
        s.textMatrix = IDENTITY
        s.x = s.lineX = s.y = s.lineY = 0
        break
      case ops.setTextMatrix:
        s.textMatrix = args![0] as Matrix
        s.x = s.lineX = s.y = s.lineY = 0
        break
      case ops.moveText:
        moveText(Number(args![0]), Number(args![1]))
        break
      case ops.setLeadingMoveText:
        s.leading = Number(args![1])
        moveText(Number(args![0]), Number(args![1]))
        break
      case ops.setLeading:
        s.leading = -Number(args![0])
        break
      case ops.nextLine:
        moveText(0, s.leading)
        break
      case ops.setFont:
        setFont(args![0], args![1])
        break
      case ops.setGState:
        for (const [key, value] of args![0] as [string, unknown][]) {
          if (key === 'Font') {
            const [name, size] = value as [unknown, unknown]
            setFont(name, size)
          }
        }
        break
      case ops.setCharSpacing:
        s.charSpacing = Number(args![0])
        break
      case ops.setWordSpacing:
        s.wordSpacing = Number(args![0])
        break
      case ops.setHScale:
        s.hScale = Number(args![0]) / 100
        break
      case ops.setTextRise:
        s.rise = Number(args![0])
        break
      case ops.showText:
        show(args![0] as (Glyph | number | null)[])
        break
    }
  }
  return out
}
