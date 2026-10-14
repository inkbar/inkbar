import { defineConfig, devices } from '@playwright/test'

const port = 4190

/**
 * Runs against a production build served under `/inkbar/`, the GitHub Pages path, so a URL
 * that ignores the base fails here rather than on the live site. The build goes to
 * `dist-e2e` so it never replaces the `dist` that Turbo caches.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${port}/inkbar/`, trace: 'retain-on-failure' },
  webServer: {
    command: 'vite build --outDir dist-e2e && vite preview --outDir dist-e2e',
    env: { DEMO_BASE: '/inkbar/' },
    url: `http://localhost:${port}/inkbar/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
})
