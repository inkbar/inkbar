import type { PdfjsModule, PdfjsPage } from './types'
import type { PageGlyph } from '../model/glyph-advances'

interface Glyph {
  unicode: string
  width: number
  isSpace: boolean
}

interface TextState {
  fontSize: number
  charSpacing: number
  wordSpacing: number
}

/**
 * The glyphs a page draws, in content order, from its operator list. Advances are in text space
 * the way PDF.js's canvas renderer moves the pen: the glyph width (per 1000 em) at the font size,
 * plus character spacing, plus word spacing on spaces. A kerning number in a `TJ` array becomes a
 * glyph with no text. Horizontal scaling is left out: it scales a whole run evenly.
 */
export async function pageGlyphs(
  page: PdfjsPage,
  ops: PdfjsModule['OPS']
): Promise<PageGlyph[]> {
  const list = await page.getOperatorList()
  const out: PageGlyph[] = []
  let state: TextState = { fontSize: 0, charSpacing: 0, wordSpacing: 0 }
  const saved: TextState[] = []
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i]
    const args = list.argsArray[i] as unknown[] | null
    switch (fn) {
      case ops.save:
      case ops.paintFormXObjectBegin:
        saved.push(state)
        state = { ...state }
        break
      case ops.restore:
      case ops.paintFormXObjectEnd:
        state = saved.pop() ?? state
        break
      case ops.setFont:
        state.fontSize = Number(args![1])
        break
      case ops.setCharSpacing:
        state.charSpacing = Number(args![0])
        break
      case ops.setWordSpacing:
        state.wordSpacing = Number(args![0])
        break
      case ops.showText:
        for (const g of args![0] as (Glyph | number | null)[]) {
          if (typeof g === 'number') {
            out.push({ text: '', advance: (-g * state.fontSize) / 1000 })
          } else if (g) {
            const spacing = state.charSpacing + (g.isSpace ? state.wordSpacing : 0)
            out.push({
              text: g.unicode,
              advance: (g.width * state.fontSize) / 1000 + spacing,
              spacing,
            })
          }
        }
        break
    }
  }
  return out
}
