/*
 * Runs the sandbox's smoke page in real Safari through safaridriver and prints each check.
 * Exits 1 when a check fails or the page does not finish in time, 2 when Safari could not be
 * driven at all.
 *
 *   node safari.ts [--url <smoke page>] [--timeout <seconds>] [--screenshot <file.png>]
 *
 * It starts `safaridriver` itself on a free port and stops it at the end. Safari only allows
 * automation once `safaridriver --enable` has run (it asks for an administrator password), or
 * after Develop > Allow Remote Automation in Safari's settings.
 *
 * It speaks the W3C WebDriver protocol over fetch: a session, a URL, a script that reads
 * `window.__inkbarSmoke`, a screenshot. That is a few requests, so it needs no client library.
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { parseArgs } from 'node:util'

interface SmokeResult {
  name: string
  ok: boolean
  error?: string
  ms: number
}

interface SmokeState {
  done: boolean
  results: SmokeResult[]
  userAgent: string
}

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:3010/smoke/' },
    timeout: { type: 'string', default: '120' },
    screenshot: { type: 'string' },
  },
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A port nothing listens on now. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port'))
      )
    })
  })
}

/** One WebDriver command. Throws with the driver's own error and message. */
async function command<T>(
  base: string,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = (await response.json()) as {
    value: T & { error?: string; message?: string }
  }
  if (!response.ok || json.value?.error)
    throw new Error(
      `${method} ${path}: ${json.value?.error ?? response.status} ${json.value?.message ?? ''}`
    )
  return json.value
}

async function waitForDriver(base: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      const status = await command<{ ready: boolean }>(base, 'GET', '/status')
      if (status.ready) return
    } catch {
      // Not listening yet.
    }
    await sleep(100)
  }
  throw new Error('safaridriver did not start within 10 seconds')
}

function print(state: SmokeState): void {
  console.log(state.userAgent)
  for (const r of state.results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${Math.round(r.ms)} ms`)
    if (r.error) console.log(`      ${r.error}`)
  }
}

async function main(): Promise<number> {
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const driver = spawn('safaridriver', ['--port', String(port)], { stdio: 'inherit' })
  const exited = new Promise<never>((_, reject) =>
    driver.on('exit', (code) => reject(new Error(`safaridriver exited with ${code}`)))
  )
  // An unhandled exit would end the run before the summary; the race below reports it.
  exited.catch(() => undefined)
  let session: string | undefined
  try {
    await Promise.race([waitForDriver(base), exited])
    const created = await command<{
      sessionId: string
      capabilities: Record<string, unknown>
    }>(base, 'POST', '/session', {
      capabilities: { alwaysMatch: { browserName: 'safari' } },
    })
    session = created.sessionId
    console.log(
      `Safari ${String(created.capabilities.browserVersion)}, opening ${args.url}`
    )
    await command(base, 'POST', `/session/${session}/url`, { url: args.url })

    const end = Date.now() + Number(args.timeout) * 1000
    let state: SmokeState | null = null
    while (Date.now() < end) {
      state = await command<SmokeState | null>(
        base,
        'POST',
        `/session/${session}/execute/sync`,
        {
          script: 'return window.__inkbarSmoke ?? null',
          args: [],
        }
      )
      if (state?.done) break
      await sleep(500)
    }
    if (state) print(state)
    const passed = !!state?.done && state.results.every((r) => r.ok)
    if (!state?.done)
      console.log(`The smoke page did not finish within ${args.timeout} s.`)
    else
      console.log(
        passed ? 'Every check passed.' : 'Some checks failed: see the lines marked FAIL.'
      )
    if (!passed && args.screenshot) {
      const png = await command<string>(base, 'GET', `/session/${session}/screenshot`)
      writeFileSync(args.screenshot, Buffer.from(png, 'base64'))
      console.log(`Screenshot saved to ${args.screenshot}`)
    }
    return passed ? 0 : 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    return 2
  } finally {
    if (session)
      await command(base, 'DELETE', `/session/${session}`).catch(() => undefined)
    driver.kill()
  }
}

process.exitCode = await main()
