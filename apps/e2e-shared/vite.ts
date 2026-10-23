import { createRequire } from 'node:module'

import type { Plugin } from 'vite'

/**
 * A Vite plugin every sandbox lists. Its `config` hook is deep-merged with the sandbox's own
 * config, so a sandbox can still add its own aliases or `optimizeDeps.include`.
 *
 * Core loads `pdfjs-dist`, and the script sandbox for forms, through dynamic imports that Vite's
 * dependency scan does not follow. Found on the first page load instead, they are optimised
 * late and the page can reload under the first end-to-end test. The ids do not resolve from a
 * sandbox (PDF.js belongs to @inkbar/core), so they are resolved from core's own copy and
 * aliased, which lets Vite pre-bundle them. Only these exact ids are aliased; other subpaths
 * resolve as before.
 */
export function prebundlePdfEngine(): Plugin {
  const fromCore = createRequire(import.meta.resolve('@inkbar/core/package.json'))
  const sandbox = 'pdfjs-dist/build/pdf.sandbox.mjs'
  return {
    name: 'inkbar-sandbox:prebundle-pdf-engine',
    config: () => ({
      resolve: {
        alias: [
          { find: /^pdfjs-dist$/, replacement: fromCore.resolve('pdfjs-dist') },
          {
            find: /^pdfjs-dist\/build\/pdf\.sandbox\.mjs$/,
            replacement: fromCore.resolve(sandbox),
          },
        ],
      },
      optimizeDeps: { include: ['pdfjs-dist', sandbox] },
    }),
  }
}
