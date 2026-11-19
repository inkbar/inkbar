/*
 * Starts the BrowserStack Local tunnel before the run and stops it after, as BrowserStack's
 * Playwright samples do with the browserstack-local package. Through it the devices reach the
 * sandbox this machine serves, at bs-local.com (real iOS devices cannot use localhost). The
 * identifier is new for each run, so runs on other machines never share a tunnel.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { Local } from 'browserstack-local'

const logDir = fileURLToPath(new URL('../test-results/', import.meta.url))

function call(fn: (done: (error?: Error) => void) => void): Promise<void> {
  return new Promise((resolve, reject) =>
    fn((error) => (error ? reject(error) : resolve()))
  )
}

export default async function startTunnel(): Promise<() => Promise<void>> {
  const key = process.env.BROWSERSTACK_ACCESS_KEY
  if (!key)
    throw new Error('Set BROWSERSTACK_ACCESS_KEY to start the BrowserStack Local tunnel.')
  const localIdentifier = `inkbar-smoke-${randomUUID()}`
  mkdirSync(logDir, { recursive: true })
  const tunnel = new Local()
  try {
    await call((done) =>
      tunnel.start(
        { key, localIdentifier, logFile: `${logDir}browserstack-local.log` },
        done
      )
    )
  } catch (error) {
    // The binary's message does not hold the key, but make sure.
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `BrowserStack Local did not start: ${message.split(key).join('<hidden>')}`
    )
  }
  process.env.BROWSERSTACK_LOCAL_IDENTIFIER = localIdentifier
  console.log('BrowserStack Local started')
  return async () => {
    if (tunnel.isRunning()) await call((done) => tunnel.stop(() => done()))
    console.log('BrowserStack Local stopped')
  }
}
