// node:test's describe and it return promises the runner itself awaits.
/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'

const root = fileURLToPath(new URL('..', import.meta.url))
const core = `${root}packages/core/src`

const eslint = new ESLint({ cwd: root })

/**
 * The import-fence messages ESLint reports for an import of `source` from `path`, under
 * `packages/core/src` unless `path` starts at the repository's root (`packages/…`). `dynamic`
 * makes it an `import()`.
 */
async function restricted(
  source: string,
  path: string,
  dynamic = false
): Promise<string[]> {
  const code = dynamic
    ? `export const everything = () => import('${source}')\n`
    : `import * as everything from '${source}'\n\nexport { everything }\n`
  const filePath = path.startsWith('packages/') ? `${root}${path}` : `${core}/${path}`
  // A file ESLint can type-check has to exist: the text given replaces a real file's contents.
  const [result] = await eslint.lintText(code, { filePath })
  return result!.messages
    .filter(
      (m) => m.ruleId === 'no-restricted-imports' || m.ruleId === 'no-restricted-syntax'
    )
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

describe('PDF.js through import()', () => {
  for (const [path, source] of [
    ['model/document.ts', 'pdfjs-dist'],
    ['model/document.ts', 'pdfjs-dist/legacy/build/pdf.mjs'],
    ['model/document.ts', '#pdfjs-sandbox'],
    ['dom/transform.test.ts', 'pdfjs-dist/legacy/build/pdf.mjs'],
  ] as const)
    it(`is refused to ${path}: ${source}`, async () => {
      const messages = await restricted(source, path, true)
      assert.ok(
        messages.some((m) => m.includes('only inside packages/core/src/pdfjs/')),
        `import('${source}') was not reported from ${path}: ${messages.join(' | ')}`
      )
    })

  for (const [path, source] of [
    ['pdfjs/sandbox.ts', '#pdfjs-sandbox'],
    ['packages/engine/src/write.fixtures.test.ts', 'pdfjs-dist/legacy/build/pdf.mjs'],
  ] as const)
    it(`is allowed to ${path}: ${source}`, async () => {
      assert.deepEqual(await restricted(source, path, true), [])
    })
})

describe('test support', () => {
  for (const [path, source, dynamic] of [
    ['model/document.ts', '../test-support/stoppable-engines', false],
    ['dom/page-renderer.ts', '../test-support/compare-saved.ts', false],
    ['pdfjs/sandbox.ts', '../test-support/compare-saved', false],
    ['index.ts', './test-support/held-engines', true],
  ] as const)
    it(`is refused to ${path}: ${source}`, async () => {
      const messages = await restricted(source, path, dynamic)
      assert.ok(
        messages.some((m) => m.includes('test-support/ is for tests only')),
        `${source} was not reported from ${path}: ${messages.join(' | ')}`
      )
    })

  for (const [path, source] of [
    ['dom/engine-notice.browser.test.ts', '../test-support/stoppable-engines'],
    ['test-support/compare-saved.ts', './held-engines'],
  ] as const)
    it(`is allowed to ${path}`, async () => {
      assert.deepEqual(await restricted(source, path), [])
    })
})
