import { cssFont } from './text-fonts'

import type { TextBlock } from '../model/annotations/drawing/text/layout'

/** A non-space character of a text box as the browser laid it out. */
export interface BrowserChar {
  char: string
  /** The line it is on, from 0. */
  line: number
  /** Its left and right edges, in px from the box's left edge. */
  left: number
  right: number
}

/**
 * Lays `block` out in a real `div` with the text box's CSS (`pre-wrap`, `overflow-wrap:
 * break-word`, `line-height: 1.2`) and reads back where each non-space character went. For the
 * browser comparison tests only.
 */
export function browserChars(
  block: TextBlock,
  kerning = true
): { chars: BrowserChar[]; lineCount: number } {
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden'
  const box = document.createElement('div')
  box.style.cssText = [
    `width:${block.width}px`,
    'box-sizing:border-box',
    `font:${cssFont(block.font, block.size)}`,
    kerning ? 'font-kerning:auto' : 'font-kerning:none',
    'line-height:1.2',
    'white-space:pre-wrap',
    'overflow-wrap:break-word',
    `text-align:${block.align}`,
    'margin:0',
  ].join(';')
  const node = document.createTextNode(block.text)
  box.append(node)
  host.append(box)
  document.body.append(host)
  try {
    const lineHeight = block.size * 1.2
    const boxRect = box.getBoundingClientRect()
    const lineCount = Math.max(Math.round(boxRect.height / lineHeight), 1)
    const range = document.createRange()
    const chars: BrowserChar[] = []
    let offset = 0
    for (const char of block.text) {
      if (!/\s/.test(char)) {
        range.setStart(node, offset)
        range.setEnd(node, offset + char.length)
        const rect = range.getBoundingClientRect()
        const line = Math.floor((rect.top + rect.height / 2 - boxRect.top) / lineHeight)
        chars.push({
          char,
          line: Math.min(Math.max(line, 0), lineCount - 1),
          left: rect.left - boxRect.left,
          right: rect.right - boxRect.left,
        })
      }
      offset += char.length
    }
    return { chars, lineCount }
  } finally {
    host.remove()
  }
}

/** The non-space characters on each line of `block` as the browser lays it out. */
export function browserLines(block: TextBlock, kerning = true): string[] {
  const { chars, lineCount } = browserChars(block, kerning)
  const lines = Array.from({ length: lineCount }, () => '')
  for (const c of chars) lines[c.line] += c.char
  return lines
}

/** Left edge of the first and right edge of the last non-space character on a line, from the box's left. */
export interface Edge {
  left: number
  right: number
  text: string
}

/** The edges of each line of `block`, laid out with no kerning; `undefined` for a line with no character. */
export function browserEdges(block: TextBlock): (Edge | undefined)[] {
  const { chars, lineCount } = browserChars(block, false)
  const edges: (Edge | undefined)[] = Array.from({ length: lineCount }, () => undefined)
  for (const c of chars) {
    const edge = edges[c.line]
    edges[c.line] = edge
      ? {
          left: Math.min(edge.left, c.left),
          right: Math.max(edge.right, c.right),
          text: edge.text + c.char,
        }
      : { left: c.left, right: c.right, text: c.char }
  }
  return edges
}
