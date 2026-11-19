/*
 * One BrowserStack session per test: connects Playwright straight to BrowserStack
 * (wss://cdp.browserstack.com/playwright) with the target's capabilities, through the
 * BrowserStack Local tunnel that tunnel.ts starts, and marks the session passed or failed.
 *
 * The credentials come from BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY. They travel in
 * the connection URL, as BrowserStack's Playwright samples send them, so a failed connection's
 * error is rewritten without them before anything prints it.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

import {
  _android,
  chromium,
  firefox,
  test as base,
  webkit,
  type Page,
} from '@playwright/test'

import { targetNamed, type Target } from './targets.ts'

const playwrightVersion = (
  createRequire(import.meta.url)('@playwright/test/package.json') as { version: string }
).version

/** `inkbar smoke <short sha>`: the build every session of one run joins. */
function buildName(): string {
  const sha =
    process.env.GITHUB_SHA ??
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  return `inkbar smoke ${sha.slice(0, 7)}`
}

function credentials(): { username: string; key: string } {
  const username = process.env.BROWSERSTACK_USERNAME
  const key = process.env.BROWSERSTACK_ACCESS_KEY
  if (!username || !key)
    throw new Error(
      'Set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY to run on BrowserStack.'
    )
  return { username, key }
}

/** `text` with every form of the credentials replaced. */
function redact(text: string, secrets: readonly string[]): string {
  let out = text
  for (const secret of secrets)
    for (const form of [
      secret,
      encodeURIComponent(secret),
      JSON.stringify(secret).slice(1, -1),
    ])
      if (form) out = out.split(form).join('<hidden>')
  return out
}

/**
 * How long a session may take to start. Shorter than the test's limit, so a slow start fails
 * here, where the error is cleaned, and not as a test timeout that quotes the pending call.
 */
const CONNECT_TIMEOUT = 180_000

export interface Remote {
  page: Page
  target: Target
  close(): Promise<void>
}

async function connect(
  target: Target,
  testName: string,
  baseURL: string | undefined
): Promise<Remote> {
  const { username, key } = credentials()
  const identifier = process.env.BROWSERSTACK_LOCAL_IDENTIFIER
  if (!identifier)
    throw new Error('BROWSERSTACK_LOCAL_IDENTIFIER is not set: is the tunnel up?')
  const caps = {
    ...target.caps,
    name: `${target.name}: ${testName}`,
    build: buildName(),
    project: 'inkbar',
    'browserstack.username': username,
    'browserstack.accessKey': key,
    'browserstack.local': 'true',
    'browserstack.localIdentifier': identifier,
    'client.playwrightVersion': playwrightVersion,
  }
  const endpoint = `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(caps))}`
  try {
    if (target.client === 'android') {
      const device = await _android.connect(endpoint, { timeout: CONNECT_TIMEOUT })
      await device.shell('am force-stop com.android.chrome')
      // An Android browser's context takes none of the project's options, `baseURL` included.
      const context = await device.launchBrowser({
        hasTouch: true,
        ...(baseURL ? { baseURL } : {}),
      })
      const page = context.pages()[0] ?? (await context.newPage())
      return { page, target, close: () => device.close() }
    }
    const client = { chromium, firefox, webkit }[target.client]
    const browser = await client.connect({
      wsEndpoint: endpoint,
      timeout: CONNECT_TIMEOUT,
    })
    // Phones and tablets take taps; Playwright refuses `tap()` in a context without touch.
    const context = await browser.newContext({
      ...(target.kind === 'ios' ? { hasTouch: true } : {}),
      ...(baseURL ? { baseURL } : {}),
    })
    const page = await context.newPage()
    return { page, target, close: () => browser.close() }
  } catch (error) {
    // Playwright's message quotes the endpoint, credentials and all.
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Could not start the ${target.name} session: ${redact(message, [username, key, endpoint])}`
    )
  }
}

/** Tells BrowserStack how the session went, so its dashboard agrees with the run. */
async function setStatus(page: Page, passed: boolean, reason: string): Promise<void> {
  const command = {
    action: 'setSessionStatus',
    arguments: { status: passed ? 'passed' : 'failed', reason: reason.slice(0, 250) },
  }
  await page
    .evaluate(() => undefined, `browserstack_executor: ${JSON.stringify(command)}`)
    .catch(() => undefined)
}

export const test = base.extend<{ remote: Remote }>({
  remote: async ({ baseURL }, use, testInfo) => {
    const remote = await connect(
      targetNamed(testInfo.project.name),
      testInfo.title,
      baseURL
    )
    try {
      await use(remote)
    } finally {
      const passed =
        testInfo.status === testInfo.expectedStatus && testInfo.errors.length === 0
      await setStatus(
        remote.page,
        passed,
        passed ? 'Every check passed' : (testInfo.errors[0]?.message ?? 'failed')
      )
      await remote.close().catch(() => undefined)
    }
  },
})

export { expect } from '@playwright/test'
