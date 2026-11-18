import { fileURLToPath } from 'node:url'

import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test'

/**
 * The Playwright config every sandbox runs. The suite lives beside this file; each sandbox
 * passes its own dev-server port, and `skip` names the specs (file names in `e2e`) whose page
 * it does not have yet. The command runs in the sandbox's directory (the directory of the
 * config that calls this), so `pnpm dev` starts that sandbox.
 */
export function defineSandboxConfig(opts: {
  port: number
  skip?: readonly string[]
}): PlaywrightTestConfig {
  const { port, skip = [] } = opts
  return defineConfig({
    testDir: fileURLToPath(new URL('./e2e', import.meta.url)),
    testIgnore: skip.map((name) => `**/${name}`),
    timeout: 60_000,
    // The performance checks measure frame times; parallel workers would skew them.
    workers: 1,
    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
    use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
    webServer: {
      command: 'pnpm dev',
      port,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    // The viewport goes after the device preset, which would otherwise reset it to 1280x720.
    projects: [
      {
        name: 'chromium',
        use: {
          ...devices['Desktop Chrome'],
          viewport: { width: 1280, height: 900 },
          // `performance.memory` reports coarse, bucketed values without this flag.
          launchOptions: { args: ['--enable-precise-memory-info'] },
        },
      },
    ],
  })
}
