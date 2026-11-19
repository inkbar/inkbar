import { fileURLToPath } from 'node:url'

import { inkbar } from '@inkbar/core/vite'
import { prebundlePdfEngine } from '@inkbar/e2e-shared/vite'
import react from '@vitejs/plugin-react'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

import { highlightSource } from './vite/highlight.ts'
import { generatedPdfs } from './vite/sample.ts'

const entry = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  // The site is served from the root of sandbox.inkbar.dev. The end-to-end suite sets a
  // sub-path to catch URLs that ignore the base.
  base: process.env.SANDBOX_BASE ?? '/',
  plugins: [
    react({ include: /\.tsx$/ }),
    vue(),
    svelte(),
    inkbar(),
    prebundlePdfEngine(),
    generatedPdfs(),
    highlightSource(),
  ],
  build: {
    rollupOptions: {
      input: {
        index: entry('./index.html'),
        react: entry('./react/index.html'),
        vue: entry('./vue/index.html'),
        svelte: entry('./svelte/index.html'),
        vanilla: entry('./vanilla/index.html'),
        plugin: entry('./plugin/index.html'),
        // The in-browser smoke check that real browsers and devices run (src/smoke/).
        smoke: entry('./smoke/index.html'),
      },
    },
  },
  server: { port: 5190, strictPort: true },
  // bs-local.com is how devices reach this machine through the BrowserStack Local tunnel.
  preview: { port: 4190, strictPort: true, allowedHosts: ['bs-local.com'] },
})
