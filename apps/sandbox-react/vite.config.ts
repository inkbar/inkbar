import { inkbar } from '@inkbar/core/vite'
import { serveFixtures } from '@inkbar/fixtures/vite-serve'
import { prebundlePdfEngine } from '@inkbar/sandbox-shared/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), inkbar(), serveFixtures()],
  ...prebundlePdfEngine(),
  server: { port: 5181, strictPort: true },
  preview: { port: 4181, strictPort: true },
})
