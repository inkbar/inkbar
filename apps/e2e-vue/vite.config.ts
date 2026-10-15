import { inkbar } from '@inkbar/core/vite'
import { serveFixtures } from '@inkbar/fixtures/vite-serve'
import { prebundlePdfEngine } from '@inkbar/e2e-shared/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), inkbar(), serveFixtures(), prebundlePdfEngine()],
  server: { port: 5180, strictPort: true },
  preview: { port: 4180, strictPort: true },
})
