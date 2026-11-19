import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { serveFixtures } from '@inkbar/fixtures/vite-serve'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, type Plugin } from 'vitest/config'

import type { BrowserCommand } from 'vitest/node'

const root = dirname(fileURLToPath(import.meta.url))
/**
 * Core's own PDF.js. Core loads it through its `#pdfjs` import, which Vite's dependency scan does
 * not follow, so on a cold cache Vite found it mid-run and reloaded the page, failing every test.
 * Aliased so the name resolves from here and can be pre-bundled under the name core asks for.
 */
const pdfjsDir = dirname(
  createRequire(
    createRequire(import.meta.url).resolve('@inkbar/core/package.json')
  ).resolve('pdfjs-dist/package.json')
)
/** `PARITY_REPORT=1` lists the pages that are not the same; `PARITY_REPORT=all` lists every page. */
const reportMode = process.env.PARITY_REPORT ?? ''
const report =
  reportMode === 'all'
    ? 'all'
    : reportMode === '' || reportMode === '0'
      ? 'off'
      : 'differences'
const baseline = process.env.PARITY_BASELINE ?? ''

/** `path` resolved inside the package, or an error when it would land outside `dirs`. */
function inside(path: string, dirs: string[]): string {
  const file = resolve(root, path)
  const rel = relative(root, file)
  if (!dirs.some((dir) => rel.startsWith(dir + sep))) {
    throw new Error(`parity writes only under ${dirs.join(' and ')}, not ${path}`)
  }
  return file
}

const writeParityFile: BrowserCommand<[string, string, 'base64' | 'utf8']> = (
  _ctx,
  path,
  content,
  encoding
) => {
  const file = inside(path, ['.report', 'baselines'])
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, Buffer.from(content, encoding))
}

const readParityFile: BrowserCommand<[string]> = (_ctx, path) => {
  const file = inside(path, ['baselines'])
  return existsSync(file) ? readFileSync(file).toString('base64') : null
}

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
        test: {
          name: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [serveFixtures(), serveFonts()],
        // Pre-bundled up front: discovering one mid-run makes Vite reload the test page.
        optimizeDeps: {
          include: ['pdfjs-dist', 'pdfjs-dist/build/pdf.sandbox.mjs', '@inkbar/fonts'],
        },
        resolve: { alias: { 'pdfjs-dist': pdfjsDir } },
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          // A fixture draws up to three pages twice at 2 px per point.
          testTimeout: 120_000,
          // Empties .report/ when a report run starts.
          globalSetup: ['src/report-setup.ts'],
          provide: { parityReport: report, parityBaseline: baseline },
          browser: {
            enabled: true,
            headless: true,
            // PDF.js draws text through the browser, with the machine's fonts and font settings.
            // fontconfig.xml fixes both, so a page compares the same on every Linux machine.
            provider: playwright({
              launchOptions: {
                env: { ...process.env, FONTCONFIG_FILE: join(root, 'fontconfig.xml') },
              },
            }),
            instances: [{ browser: 'chromium', viewport: { width: 1280, height: 900 } }],
            commands: { writeParityFile, readParityFile },
            screenshotFailures: false,
          },
        },
      },
    ],
  },
})
