import { defineConfig } from '@playwright/test'

import { TARGETS } from './targets.ts'

/**
 * Safari refuses some ports (the sandbox's usual 4190 among them), and BrowserStack Local reaches
 * bs-local.com on a listed set of ports only. 3010 suits both.
 */
const port = 3010

/**
 * Runs the sandbox's smoke page on real devices and desktop browsers on BrowserStack, one
 * project per target (targets.ts). Serves the sandbox's production build, which must exist
 * (`pnpm exec turbo run build --filter=@inkbar/sandbox`), and reaches it through the tunnel.
 * Each target is one session, and at most five run at once.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'smoke.spec.ts',
  // A real device takes a while to start, every command over the tunnel is slow, and the page
  // loads four times, once for each front end.
  timeout: 900_000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 5,
  fullyParallel: true,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  globalSetup: './tunnel.ts',
  use: { baseURL: `http://bs-local.com:${port}/` },
  webServer: {
    command: 'pnpm run serve',
    url: `http://127.0.0.1:${port}/smoke/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: TARGETS.map((target) => ({ name: target.name })),
})
