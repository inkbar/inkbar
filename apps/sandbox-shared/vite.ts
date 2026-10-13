import { createRequire } from 'node:module'

/**
 * The `resolve` and `optimizeDeps` fragment every sandbox's Vite config spreads in.
 *
 * Core loads `pdfjs-dist` through a dynamic import that Vite's dependency scan does not follow.
 * Found on the first page load instead, it is optimised late and the page can reload under the
 * first end-to-end test. The bare name does not resolve from a sandbox (PDF.js belongs to
 * @inkbar/core), so it is resolved from core's own copy and aliased, which lets Vite pre-bundle
 * it. Only the bare id is aliased; subpaths resolve as before.
 */
export function prebundlePdfEngine(): {
  resolve: { alias: { find: RegExp; replacement: string }[] }
  optimizeDeps: { include: string[] }
} {
  const fromCore = createRequire(import.meta.resolve('@inkbar/core/package.json'))
  return {
    resolve: {
      alias: [{ find: /^pdfjs-dist$/, replacement: fromCore.resolve('pdfjs-dist') }],
    },
    optimizeDeps: { include: ['pdfjs-dist'] },
  }
}
