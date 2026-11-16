import { existsSync, readFileSync } from 'node:fs'

import { serveFixtures } from '@inkbar/fixtures/vite-serve'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, type Plugin } from 'vitest/config'

/** Serves the built package untransformed at /engine-dist/, as a host would. */
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
        const prefix = '/engine-dist/'
        if (!req.url?.startsWith(prefix)) return next()
        const name = decodeURIComponent(req.url.slice(prefix.length).split('?')[0] ?? '')
        const file = new URL(name, dist)
        if (!file.href.startsWith(dist.href) || !existsSync(file)) return next()
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
        plugins: [serveFixtures(), serveBuiltPackage(), serveHtmlAsWasm()],
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
