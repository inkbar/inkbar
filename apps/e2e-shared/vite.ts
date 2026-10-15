import { createRequire } from 'node:module'

import type { Plugin } from 'vite'

/**
 * A Vite plugin every sandbox lists. Its `config` hook is deep-merged with the sandbox's own
 * config, so a sandbox can still add its own aliases or `optimizeDeps.include`.
 *
 * Core loads `pdfjs-dist` through a dynamic import that Vite's dependency scan does not follow.
 * Found on the first page load instead, it is optimised late and the page can reload under the
 * first end-to-end test. The bare name does not resolve from a sandbox (PDF.js belongs to
 * @inkbar/core), so it is resolved from core's own copy and aliased, which lets Vite pre-bundle
 * it. Only the bare id is aliased; subpaths resolve as before.
 */
export function prebundlePdfEngine(): Plugin {
  const fromCore = createRequire(import.meta.resolve('@inkbar/core/package.json'))
  return {
    name: 'inkbar-sandbox:prebundle-pdf-engine',
    config: () => ({
      resolve: {
        alias: [{ find: /^pdfjs-dist$/, replacement: fromCore.resolve('pdfjs-dist') }],
      },
      optimizeDeps: { include: ['pdfjs-dist'] },
    }),
  }
}
