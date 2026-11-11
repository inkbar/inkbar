import { createRequire } from 'node:module'

import { serveFixtures } from '@inkbar/fixtures/vite-serve'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

import type { Component } from 'svelte'
import type { BrowserCommand } from 'vitest/node'

// `pdfjs-dist` belongs to @inkbar/core (PDF.js stays quarantined there), so the bare name does
// not resolve from this package. Resolving it from core and aliasing it lets Vite pre-bundle the
// same module core imports, instead of discovering it mid-run and reloading the test page.
const fromCore = createRequire(import.meta.resolve('@inkbar/core/package.json'))
const pdfjs = fromCore.resolve('pdfjs-dist')
// The form scripting sandbox, which core loads on demand for a PDF with form scripts.
const pdfjsSandbox = fromCore.resolve('pdfjs-dist/build/pdf.sandbox.mjs')

/**
 * Renders a test harness to a string as a server would, for a browser test to hydrate: the
 * browser project's Vite server loads it for SSR, so the server build of the component and of
 * Svelte renders it. `harness` names a file in `src/test/harness/`.
 */
const renderServerHtml: BrowserCommand<
  [harness: string, props: Record<string, unknown>]
> = async ({ project }, harness, props) => {
  const vite = project.browser?.vite ?? project.vite
  const root = new URL('./src/test/harness/', import.meta.url).pathname
  const { render } = (await vite.ssrLoadModule(
    'svelte/server'
  )) as typeof import('svelte/server')
  const { default: component } = (await vite.ssrLoadModule(`${root}${harness}`)) as {
    default: Component<Record<string, unknown>>
  }
  return render(component, { props }).body
}

// Two projects, each with its own Svelte plugin instance: the node project compiles components
// for the server (the SSR test), the browser project for the client.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [svelte()],
        test: {
          name: 'node',
          include: ['src/test/*.test.ts'],
          exclude: ['src/test/*.browser.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [svelte(), serveFixtures()],
        // Pre-bundled up front: discovering one mid-run makes Vite reload the test page.
        // Regexes, so only these exact ids are aliased: a string key would also rewrite
        // `pdfjs-dist/...` subpaths by prefix.
        resolve: {
          alias: [
            { find: /^pdfjs-dist$/, replacement: pdfjs },
            { find: /^pdfjs-dist\/build\/pdf\.sandbox\.mjs$/, replacement: pdfjsSandbox },
          ],
        },
        optimizeDeps: {
          include: [
            'pdfjs-dist',
            'pdfjs-dist/build/pdf.sandbox.mjs',
            'esm-env',
            'bits-ui',
            '@inkbar/icons',
            'axe-core',
          ],
        },
        test: {
          name: 'browser',
          include: ['src/test/*.browser.test.ts'],
          setupFiles: ['vitest-browser-svelte', './src/test/setup.ts'],
          testTimeout: 30_000,
          // Documents take a while to open; every retrying assertion waits this long.
          expect: { poll: { timeout: 15_000, interval: 50 } },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            commands: { renderServerHtml },
            instances: [{ browser: 'chromium', viewport: { width: 1280, height: 900 } }],
            screenshotFailures: true,
          },
        },
      },
    ],
  },
})
