// node:test's describe and it return promises the runner itself awaits.
/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'

const root = fileURLToPath(new URL('..', import.meta.url))
const core = `${root}packages/core/src`

const eslint = new ESLint({ cwd: root })

/** The no-restricted-imports messages ESLint reports for an import of `source` from `path`. */
async function restricted(source: string, path: string): Promise<string[]> {
  const code = `import * as everything from '${source}'\n\nexport { everything }\n`
  // A file ESLint can type-check has to exist: the text given replaces a real file's contents.
  const [result] = await eslint.lintText(code, { filePath: `${core}/${path}` })
  return result!.messages
    .filter((m) => m.ruleId === 'no-restricted-imports')
    .map((m) => m.message)
}

describe('the second reader', () => {
  for (const [path, source] of [
    ['model/document.ts', '../pdfjs/second-reader'],
    ['dom/page-renderer.ts', '../pdfjs/second-reader.ts'],
    ['index.ts', './pdfjs/second-reader'],
    ['pdfjs/sandbox.ts', './second-reader'],
  ] as const)
    it(`is refused to ${path}`, async () => {
      const messages = await restricted(source, path)
      assert.ok(
        messages.some((m) => m.includes('for tests only')),
        `${source} was not reported from ${path}: ${messages.join(' | ')}`
      )
    })

  for (const [path, source] of [
    ['dom/transform.test.ts', '../pdfjs/second-reader'],
    ['dom/saved-file.browser.test.ts', '../pdfjs/second-reader'],
    ['test-support/compare-saved.ts', '../pdfjs/second-reader'],
  ] as const)
    it(`is allowed to ${path}`, async () => {
      assert.deepEqual(await restricted(source, path), [])
    })
})

describe('PDF.js outside pdfjs/', () => {
  for (const [path, source] of [
    ['model/document.ts', 'pdfjs-dist'],
    ['model/document.ts', 'pdfjs-dist/legacy/build/pdf.mjs'],
    ['model/document.ts', '#pdfjs-sandbox'],
    ['dom/transform.test.ts', 'pdfjs-dist'],
    ['test-support/compare-saved.ts', 'pdfjs-dist'],
  ] as const)
    it(`is refused to ${path}: ${source}`, async () => {
      const messages = await restricted(source, path)
      assert.ok(
        messages.some((m) => m.includes('only inside packages/core/src/pdfjs/')),
        `${source} was not reported from ${path}: ${messages.join(' | ')}`
      )
    })
})
