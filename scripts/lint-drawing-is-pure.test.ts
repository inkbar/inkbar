// node:test's describe and it return promises the runner itself awaits.
/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'

const root = fileURLToPath(new URL('..', import.meta.url))
const drawing = `${root}packages/core/src/model/annotations/drawing`

const eslint = new ESLint({ cwd: root })

// A file ESLint can type-check has to exist, so the fixtures are linted in the place of two real
// files, one in drawing/ and one in drawing/text/: the text given replaces their contents.
const IN_DRAWING = 'path-data.ts'
const IN_TEXT = 'text/measure.ts'

/** The rule ids and messages ESLint reports for `code` linted as the file `path`. */
async function report(code: string, path: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path })
  return result!.messages.map((m) => `${m.ruleId}: ${m.message}`)
}

const GLOBALS = [
  'document',
  'window',
  'navigator',
  'getComputedStyle',
  'requestAnimationFrame',
  'Element',
  'Node',
  'HTMLElement',
  'SVGElement',
  'Event',
  'CanvasRenderingContext2D',
  'OffscreenCanvas',
  'Image',
  'Path2D',
  'DOMMatrix',
  'DOMRect',
]

describe('inkbar/drawing-is-pure', () => {
  for (const global of GLOBALS)
    it(`reports the DOM global ${global}`, async () => {
      const code = `export const x: unknown = typeof ${global} === 'undefined' ? 0 : ${global}\n`
      const messages = await report(code, `${drawing}/${IN_DRAWING}`)
      assert.ok(
        messages.some((m) => m.startsWith('no-restricted-globals')),
        `${global} was not reported: ${messages.join(' | ')}`
      )
    })

  for (const [name, path, source] of [
    ['the package index from drawing/', IN_DRAWING, '../../..'],
    ['the package index from drawing/text/', IN_TEXT, '../../../..'],
    ['the package index file from drawing/text/', IN_TEXT, '../../../../index'],
    ['dom/ from drawing/text/', IN_TEXT, '../../../../dom/text-fonts'],
    ['PDF.js', IN_DRAWING, 'pdfjs-dist'],
  ] as const)
    it(`reports an import of ${name}`, async () => {
      const code = `import * as everything from '${source}'\n\nexport { everything }\n`
      const messages = await report(code, `${drawing}/${path}`)
      assert.ok(
        messages.some((m) => m.startsWith('no-restricted-imports')),
        `${source} was not reported: ${messages.join(' | ')}`
      )
    })

  it('reports nothing for a pure file', async () => {
    const code = `import type { Point } from '../../geometry'\n\nexport const origin: Point = { x: 0, y: 0 }\n`
    const messages = await report(code, `${drawing}/${IN_DRAWING}`)
    assert.deepEqual(
      messages.filter((m) => m.startsWith('no-restricted')),
      []
    )
  })
})
