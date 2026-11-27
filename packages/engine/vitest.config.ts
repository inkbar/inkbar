import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'

import { serveFixtures } from '@inkbar/fixtures/vite-serve'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, type Plugin } from 'vitest/config'

/**
 * Serves the built package untransformed at /engine-dist/, as a host would, and again for a page
 * on another origin: at /engine-cors/ with CORS headers, as a host serving it to that page would,
 * and at /engine-no-cors/ with none, not even the ones the dev server adds for local origins.
 */
function serveBuiltPackage(): Plugin {
  const types: Record<string, string> = {
    '.mjs': 'text/javascript',
    '.wasm': 'application/wasm',
  }
  const dist = new URL('dist/', import.meta.url)
  return {
    name: 'inkbar-serve-built-engine',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const prefix = ['/engine-dist/', '/engine-cors/', '/engine-no-cors/'].find((p) =>
          req.url?.startsWith(p)
        )
        if (!prefix || !req.url) return next()
        const name = decodeURIComponent(req.url.slice(prefix.length).split('?')[0] ?? '')
        const file = new URL(name, dist)
        if (!file.href.startsWith(dist.href) || !existsSync(file)) return next()
        if (prefix === '/engine-cors/') res.setHeader('Access-Control-Allow-Origin', '*')
        if (prefix === '/engine-no-cors/') res.removeHeader('Access-Control-Allow-Origin')
        res.setHeader('Content-Type', types[name.slice(name.lastIndexOf('.'))] ?? '')
        res.setHeader('Cache-Control', 'no-store')
        res.end(readFileSync(file))
      })
    },
  }
}

/** Serves an HTML page where a wasm file is expected, as a misconfigured host might. */
function serveHtmlAsWasm(): Plugin {
  return {
    name: 'inkbar-serve-html-as-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/engine-test/html-instead-of.wasm') return next()
        res.setHeader('Content-Type', 'text/html')
        res.end('<!doctype html><title>Not found</title>')
      })
    },
  }
}

/**
 * Serves the `@inkbar/fonts` files at any path holding `/inkbar-fonts/`, so a test can show which
 * base a relative URL was resolved against, and logs each request's path at
 * `/inkbar-fonts-log`. A path holding `/inkbar-fonts/hang/` is never answered. The log is one for
 * the whole server: a test puts a segment of its own in its font URLs and reads back only those,
 * since several browsers may share the server.
 */
function serveFonts(): Plugin {
  const dir = dirname(
    createRequire(import.meta.url).resolve('@inkbar/fonts/files/NotoSans-Regular.ttf')
  )
  const log: string[] = []
  return {
    name: 'inkbar-serve-fonts',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        if (path === '/inkbar-fonts-log') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(log))
          return
        }
        if (!path.includes('/inkbar-fonts/')) return next()
        log.push(path)
        if (path.includes('/inkbar-fonts/hang/')) return
        const file = join(dir, basename(decodeURIComponent(path)))
        res.setHeader('Cache-Control', 'no-store')
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

const browsers = (process.env.ENGINE_BROWSERS ?? 'chromium')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean)

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          exclude: ['**/*.browser.test.ts'],
          environment: 'node',
          testTimeout: 20_000,
        },
      },
      {
        plugins: [serveFixtures(), serveBuiltPackage(), serveHtmlAsWasm(), serveFonts()],
        // Pre-bundled up front: discovering it mid-run makes Vite reload the test page.
        optimizeDeps: { include: ['@inkbar/fixtures > pdf-lib', '@inkbar/fonts'] },
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          testTimeout: 30_000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: browsers.map((browser) => ({
              browser: browser as 'chromium' | 'firefox' | 'webkit',
              viewport: { width: 1280, height: 900 },
            })),
            screenshotFailures: true,
          },
        },
      },
    ],
  },
})
