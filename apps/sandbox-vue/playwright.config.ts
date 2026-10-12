import { defineConfig, devices } from '@playwright/test'

const PORT = 5180

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // The performance checks measure frame times; parallel workers would skew them.
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm dev',
    port: PORT,
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
