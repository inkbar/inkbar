import { fileURLToPath } from 'node:url'

import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test'

/**
 * The Playwright config every sandbox runs. The suite lives beside this file; each sandbox
 * passes its own dev-server and preview ports. The commands run in the sandbox's directory (the
 * directory of the config that calls this), so `pnpm dev` starts that sandbox.
 *
 * The `preview` project runs the engine-reader spec again against a production build served by
 * `vite preview`, so the engine's worker, binary and glue are known to survive the bundler with
 * no setting of their own. The build goes to `dist-e2e`, never replacing the `dist` Turbo caches.
 */
export function defineSandboxConfig(opts: {
  port: number
  previewPort: number
}): PlaywrightTestConfig {
  const { port, previewPort } = opts
  const chrome = {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 900 },
  }
  return defineConfig({
    testDir: fileURLToPath(new URL('./e2e', import.meta.url)),
    timeout: 60_000,
    // The performance checks measure frame times; parallel workers would skew them.
    workers: 1,
    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
    use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
    webServer: [
      {
        command: 'pnpm dev',
        port,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
      {
        command: `pnpm exec vite build --outDir dist-e2e && pnpm exec vite preview --outDir dist-e2e --port ${previewPort} --strictPort`,
        port: previewPort,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
    ],
    // The viewport goes after the device preset, which would otherwise reset it to 1280x720.
    projects: [
      {
        name: 'chromium',
        use: {
          ...chrome,
          // `performance.memory` reports coarse, bucketed values without this flag.
          launchOptions: { args: ['--enable-precise-memory-info'] },
        },
      },
      {
        name: 'preview',
        testMatch: 'engine-reader.spec.ts',
        use: { ...chrome, baseURL: `http://localhost:${previewPort}` },
      },
    ],
  })
}
