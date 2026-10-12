import { serveFixtures } from '@inkbar/fixtures/vite-serve'
import { defineConfig, devices } from '@playwright/experimental-ct-vue'
import vue from '@vitejs/plugin-vue'

// CT bundles with `vite build`, which defaults NODE_ENV to production and strips dev-only code.
// Component tests need development builds: InkRoot's `__inkDocument` hook and Vue's warnings.
process.env.NODE_ENV = 'development'

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.ct.ts',
  snapshotDir: './__snapshots__',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    ctPort: 3100,
    ctViteConfig: { mode: 'development', plugins: [vue(), serveFixtures()] },
  },
  // The viewport goes after the device preset, which would otherwise reset it to 1280x720.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
})
