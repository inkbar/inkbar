import { serveFixtures } from '@inkbar/fixtures/vite-serve'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

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
        // Pre-bundled up front: discovering it mid-run makes Vite reload the test page.
        optimizeDeps: { include: ['pdfjs-dist'] },
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
            instances: [{ browser: 'chromium', viewport: { width: 1280, height: 900 } }],
            screenshotFailures: true,
          },
        },
      },
    ],
  },
})
