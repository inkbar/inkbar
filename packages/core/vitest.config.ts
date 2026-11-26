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

/**
 * The settings both browser projects share: Chromium, the fixtures and the fallback fonts. Made
 * afresh for each project, as Vitest names each browser instance after its project.
 */
const browserProject = (
  name: string,
  test: { include: string[]; exclude?: string[]; setupFiles?: string[] }
) => ({
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
    name,
    ...test,
    testTimeout: 30_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        { browser: 'chromium' as const, viewport: { width: 1280, height: 900 } },
      ],
      screenshotFailures: true,
    },
  },
})

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
      browserProject('browser', {
        include: ['src/**/*.browser.test.ts'],
        // Its subject is the engine reading the file: it runs in `browser-engine` alone.
        exclude: ['src/dom/no-pdfjs.browser.test.ts'],
      }),
      // The tests that read text, search, links, the outline, the form and its scripts, and draw
      // pages, thumbnails and the viewer with the file's annotations, with the engine reading the
      // file: the setup file switches the reader and passes every document the engine. Left out:
      // the tests that count or withhold the engine a save or an apply loads, which the setup
      // file's loader would answer, and the saved-file comparison, which draws with PDF.js and
      // the engine side by side.
      browserProject('browser-engine', {
        include: [
          'src/dom/no-pdfjs.browser.test.ts',
          'src/dom/text-layer.browser.test.ts',
          'src/dom/text-spans.browser.test.ts',
          'src/dom/search/*.browser.test.ts',
          'src/model/search.browser.test.ts',
          'src/model/text-stream.browser.test.ts',
          'src/dom/link-layer.browser.test.ts',
          'src/dom/links-press.browser.test.ts',
          'src/dom/outline/*.browser.test.ts',
          'src/dom/tools.browser.test.ts',
          'src/dom/overlay.browser.test.ts',
          'src/dom/form-layer.browser.test.ts',
          'src/dom/viewer/create-viewer.browser.test.ts',
          'src/model/form/scripting.browser.test.ts',
          'src/dom/page-renderer.browser.test.ts',
          'src/dom/loupe-layer.browser.test.ts',
          'src/dom/lifted.browser.test.ts',
          'src/dom/thumbnails/*.browser.test.ts',
          'src/dom/viewer-engine.browser.test.ts',
          'src/dom/viewer/create-viewer-messages.browser.test.ts',
          'src/dom/viewer/form-alert.browser.test.ts',
          'src/dom/viewer/messages-live.browser.test.ts',
          'src/dom/viewer/password-dialog.browser.test.ts',
          'src/dom/viewer/popover.browser.test.ts',
          'src/dom/viewer/redaction-dialog.browser.test.ts',
        ],
        setupFiles: ['src/test-support/engine-reader-setup.ts'],
      }),
    ],
  },
})
