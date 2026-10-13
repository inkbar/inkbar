import { createRequire } from 'node:module'

import { inkbar } from '@inkbar/core/vite'
import { serveFixtures } from '@inkbar/fixtures/vite-serve'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// Core loads `pdfjs-dist` through a dynamic import that Vite's dependency scan does not follow.
// Found on the first page load instead, it is optimised late and the page reloads under the
// first end-to-end test. The bare name does not resolve from this app (PDF.js belongs to
// @inkbar/core), so it is resolved from core and aliased, which lets Vite pre-bundle it.
const fromCore = createRequire(import.meta.resolve('@inkbar/core/package.json'))
const pdfjs = fromCore.resolve('pdfjs-dist')

export default defineConfig({
  plugins: [svelte(), inkbar(), serveFixtures()],
  resolve: { alias: { 'pdfjs-dist': pdfjs } },
  optimizeDeps: { include: ['pdfjs-dist'] },
  server: { port: 5182, strictPort: true },
  preview: { port: 4182, strictPort: true },
})
