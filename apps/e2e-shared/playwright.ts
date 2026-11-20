import { fileURLToPath } from 'node:url'

import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test'

/**
 * The Playwright config every sandbox runs. The suite lives beside this file; each sandbox
 * passes its own dev-server and preview ports. The commands run in the sandbox's directory (the
 * directory of the config that calls this), so `pnpm dev` starts that sandbox.
 *
 * With `E2E_PREVIEW=1` it runs instead only the `preview` project: the engine-reader spec
 * against a production build served by `vite preview`, so the engine's worker, binary and glue
 * are known to survive the bundler with no setting of their own. Only that run builds, so a
 * broken build fails it alone. The build goes to `dist-e2e`, never replacing Turbo's `dist`.
 */
export function defineSandboxConfig(opts: {
  port: number
  previewPort: number
}): PlaywrightTestConfig {
  const { port, previewPort } = opts
  // The viewport goes after the device preset, which would otherwise reset it to 1280x720.
  const chrome = {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 900 },
  }
  const base: PlaywrightTestConfig = {
    testDir: fileURLToPath(new URL('./e2e', import.meta.url)),
    timeout: 60_000,
    // The performance checks measure frame times; parallel workers would skew them.
    workers: 1,
    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  }
  if (process.env.E2E_PREVIEW === '1')
    return defineConfig({
      ...base,
      use: { baseURL: `http://localhost:${previewPort}`, trace: 'retain-on-failure' },
      webServer: {
        command: `pnpm exec vite build --outDir dist-e2e && pnpm exec vite preview --outDir dist-e2e --port ${previewPort} --strictPort`,
        port: previewPort,
        // Always a fresh build: a preview server left running would serve an older one.
        reuseExistingServer: false,
        timeout: 180_000,
      },
      projects: [{ name: 'preview', testMatch: 'engine-reader.spec.ts', use: chrome }],
    })
  return defineConfig({
    ...base,
    use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
    webServer: {
      command: 'pnpm dev',
      port,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    projects: [
      {
        name: 'chromium',
        use: {
          ...chrome,
          // `performance.memory` reports coarse, bucketed values without this flag.
          launchOptions: { args: ['--enable-precise-memory-info'] },
        },
      },
    ],
  })
}
