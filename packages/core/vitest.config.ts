import { serveFixtures } from '@inkbar/fixtures/vite-serve'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

import pkg from './package.json' with { type: 'json' }

/** What tsdown defines at build time: `version` in src/index.ts. */
const define = { __INKBAR_VERSION__: JSON.stringify(pkg.version) }

export default defineConfig({
  test: {
    projects: [
      {
        define,
        test: {
          name: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts'],
          environment: 'node',
          testTimeout: 20_000,
        },
      },
      {
        define,
        plugins: [serveFixtures()],
        // Pre-bundled up front: discovering it mid-run makes Vite reload the test page.
        optimizeDeps: { include: ['pdfjs-dist', 'pdfjs-dist/build/pdf.sandbox.mjs'] },
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          testTimeout: 30_000,
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
