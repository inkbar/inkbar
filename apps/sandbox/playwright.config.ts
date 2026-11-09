import { defineConfig, devices } from '@playwright/test'

const port = 4190

/**
 * Runs against a production build served under `/sandbox/` rather than the root, so a URL
 * that ignores the base fails here. The build goes to `dist-e2e` so it never replaces the
 * `dist` that Turbo caches.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${port}/sandbox/`, trace: 'retain-on-failure' },
  webServer: {
    command: 'vite build --outDir dist-e2e && vite preview --outDir dist-e2e',
    env: { SANDBOX_BASE: '/sandbox/' },
    url: `http://localhost:${port}/sandbox/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
      grepInvert: /@touch/,
    },
    // A phone, for the tests tagged @touch: pinch, long press and drawing with a finger.
    {
      name: 'touch',
      use: { ...devices['Pixel 7'] },
      testMatch: ['events.spec.ts', 'finger-drawing.spec.ts'],
      grep: /@touch/,
    },
  ],
})
