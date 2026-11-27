import { createRequire } from 'node:module'

import type { Plugin } from 'vite'

/**
 * Sends the content security policy in `E2E_CSP`, when it is set, with every response of
 * `vite preview`. The Playwright config sets it for the preview server the policy spec runs
 * against.
 */
export function previewPolicy(): Plugin {
  const policy = process.env.E2E_CSP
  return {
    name: 'inkbar-sandbox:preview-policy',
    config: () =>
      policy ? { preview: { headers: { 'Content-Security-Policy': policy } } } : {},
  }
}

/**
 * A Vite plugin every sandbox lists. Its `config` hook is deep-merged with the sandbox's own
 * config, so a sandbox can still add its own aliases or `optimizeDeps.include`.
 *
 * Core loads the script sandbox for forms through a dynamic import that Vite's dependency scan
 * does not follow. Found on the first page load instead, it is optimised late and the page can
 * reload under the first end-to-end test. The id does not resolve from a sandbox (PDF.js belongs
 * to @inkbar/core), so it is resolved from core's own copy and aliased, which lets Vite
 * pre-bundle it. Only this exact id is aliased; other subpaths resolve as before.
 */
export function prebundlePdfEngine(): Plugin {
  const fromCore = createRequire(import.meta.resolve('@inkbar/core/package.json'))
  const sandbox = 'pdfjs-dist/build/pdf.sandbox.mjs'
  return {
    name: 'inkbar-sandbox:prebundle-pdf-engine',
    config: () => ({
      resolve: {
        alias: [
          {
            find: /^pdfjs-dist\/build\/pdf\.sandbox\.mjs$/,
            replacement: fromCore.resolve(sandbox),
          },
        ],
      },
      optimizeDeps: { include: [sandbox] },
    }),
  }
}
