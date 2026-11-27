import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { serveFixtures } from '@inkbar/fixtures/vite-serve'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, type Plugin } from 'vitest/config'

import type { BrowserCommand } from 'vitest/node'

const root = dirname(fileURLToPath(import.meta.url))
/**
 * The package core's scripting sandbox comes from. Core loads the sandbox through its
 * `#pdfjs-sandbox` import, which Vite's dependency scan does not follow, so on a cold cache Vite
 * found it mid-run and reloaded the page, failing every test. Aliased so the name resolves from
 * here and can be pre-bundled under the name core asks for.
 */
const sandboxPackage = dirname(
  createRequire(
    createRequire(import.meta.url).resolve('@inkbar/core/package.json')
  ).resolve('pdfjs-dist/package.json')
)
/** `PARITY_REPORT=1` writes what differs from its baseline to `.report/`. */
const report = ['', '0'].includes(process.env.PARITY_REPORT ?? '') ? 'off' : 'differences'
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

const readParityFile: BrowserCommand<[string, 'base64' | 'utf8']> = (
  _ctx,
  path,
  encoding
) => {
  const file = inside(path, ['baselines'])
  return existsSync(file) ? readFileSync(file).toString(encoding) : null
}

const baselines = join(root, 'baselines')

/**
 * Every file under `baselines/`, relative to it, `/` between folders, sorted. A dotfile, such as
 * one a file manager leaves (`.DS_Store`), is left out, and so is anything in a dot folder.
 */
const listBaselines: BrowserCommand<[]> = () =>
  existsSync(baselines)
    ? readdirSync(baselines, { recursive: true, withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            !relative(baselines, join(entry.parentPath, entry.name))
              .split(sep)
              .some((part) => part.startsWith('.'))
        )
        .map((entry) =>
          relative(baselines, join(entry.parentPath, entry.name)).split(sep).join('/')
        )
        .sort()
    : []

const removeBaseline: BrowserCommand<[string]> = (_ctx, path) => {
  rmSync(inside(join('baselines', path), ['baselines']))
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
          include: ['pdfjs-dist/build/pdf.sandbox.mjs', '@inkbar/fonts'],
        },
        resolve: { alias: { 'pdfjs-dist': sandboxPackage } },
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          // A fixture's data is read on every page of the file.
          testTimeout: 120_000,
          // Empties .report/ when a report run starts and indexes it when the run ends.
          globalSetup: ['src/report-setup.ts'],
          provide: { parityReport: report, parityBaseline: baseline },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium', viewport: { width: 1280, height: 900 } }],
            commands: { writeParityFile, readParityFile, listBaselines, removeBaseline },
            screenshotFailures: false,
          },
        },
      },
    ],
  },
})
