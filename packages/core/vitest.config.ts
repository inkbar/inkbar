import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'

import { serveFixtures } from '@inkbar/fixtures/vite-serve'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, type Plugin } from 'vitest/config'

import pkg from './package.json' with { type: 'json' }

/** What tsdown defines at build time: `version` in src/index.ts. */
const define = { __INKBAR_VERSION__: JSON.stringify(pkg.version) }

/** Serves the `@inkbar/fonts` files at `/inkbar-fonts/`, for the engine's fallback fonts. */
function serveFonts(): Plugin {
  const dir = dirname(
    createRequire(import.meta.url).resolve('@inkbar/fonts/files/NotoSans-Regular.ttf')
  )
  return {
    name: 'inkbar-serve-fonts',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        if (!path.startsWith('/inkbar-fonts/')) return next()
        const file = join(dir, basename(decodeURIComponent(path)))
        if (!existsSync(file)) {
          res.statusCode = 404
          res.end()
          return
        }
        res.setHeader('Content-Type', file.endsWith('.ttf') ? 'font/ttf' : 'font/otf')
        res.end(readFileSync(file))
      })
    },
  }
}

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
        plugins: [serveFixtures(), serveFonts()],
        // Pre-bundled up front: discovering it mid-run makes Vite reload the test page.
        optimizeDeps: {
          include: [
            'pdfjs-dist',
            'pdfjs-dist/build/pdf.sandbox.mjs',
            '@inkbar/fixtures > pdf-lib',
            '@inkbar/fonts',
          ],
        },
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
