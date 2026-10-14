import { fileURLToPath } from 'node:url'

import { inkbar } from '@inkbar/core/vite'
import { prebundlePdfEngine } from '@inkbar/sandbox-shared/vite'
import { defineConfig } from 'vite'

import { highlightSource } from './vite/highlight.ts'
import { samplePdf } from './vite/sample.ts'

const entry = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  // `/inkbar/` on GitHub Pages; the Pages workflow and the end-to-end suite set it.
  base: process.env.DEMO_BASE ?? '/',
  plugins: [inkbar(), prebundlePdfEngine(), samplePdf(), highlightSource()],
  build: {
    rollupOptions: {
      input: {
        index: entry('./index.html'),
      },
    },
  },
  server: { port: 5190, strictPort: true },
  preview: { port: 4190, strictPort: true },
})
