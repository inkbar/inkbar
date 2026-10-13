import { inkbar } from '@inkbar/core/vite'
import { serveFixtures } from '@inkbar/fixtures/vite-serve'
import { prebundlePdfEngine } from '@inkbar/sandbox-shared/vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [svelte(), inkbar(), serveFixtures()],
  ...prebundlePdfEngine(),
  server: { port: 5182, strictPort: true },
  preview: { port: 4182, strictPort: true },
})
