/*
 * The browsers and devices the BrowserStack run covers, one Playwright project each. Capability
 * names follow BrowserStack's Playwright samples for a direct connection
 * (wss://cdp.browserstack.com/playwright): `os`, `os_version`, `browser` and `browser_version`
 * for a desktop, `deviceName`, `osVersion`, `browser` and `realMobile` for a real device.
 *
 * Their desktop macOS offer is Playwright's own WebKit build, not Safari, so it is left out: the
 * Safari job drives real Safari on a Mac instead. Their Firefox is Playwright's patched Firefox
 * build, the only Firefox they offer for Playwright.
 */

export type TargetKind = 'desktop' | 'ios' | 'android'

export interface Target {
  /** The project name, and the session name on BrowserStack. */
  name: string
  kind: TargetKind
  /** Which Playwright client connects: Chromium for Chrome and Edge, WebKit for iOS Safari. */
  client: 'chromium' | 'firefox' | 'webkit' | 'android'
  caps: Record<string, string>
}

export const TARGETS: readonly Target[] = [
  {
    name: 'iPhone',
    kind: 'ios',
    client: 'webkit',
    caps: {
      browser: 'safari',
      deviceName: 'iPhone 17',
      osVersion: '26',
      realMobile: 'true',
    },
  },
  {
    name: 'iPad',
    kind: 'ios',
    client: 'webkit',
    caps: {
      browser: 'safari',
      deviceName: 'iPad Air 11 2026',
      osVersion: '26',
      realMobile: 'true',
    },
  },
  {
    name: 'Android',
    kind: 'android',
    client: 'android',
    caps: {
      browser: 'chrome',
      deviceName: 'Google Pixel 9',
      osVersion: '16.0',
      realMobile: 'true',
    },
  },
  {
    name: 'Edge on Windows',
    kind: 'desktop',
    client: 'chromium',
    caps: { browser: 'edge', browser_version: 'latest', os: 'Windows', os_version: '11' },
  },
  {
    name: 'Firefox on Windows',
    kind: 'desktop',
    client: 'firefox',
    caps: {
      browser: 'playwright-firefox',
      browser_version: 'latest',
      os: 'Windows',
      os_version: '11',
    },
  },
]

export const targetNamed = (name: string): Target => {
  const target = TARGETS.find((t) => t.name === name)
  if (!target) throw new Error(`No BrowserStack target named ${name}`)
  return target
}
