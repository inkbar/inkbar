import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test } from '@playwright/test'

guardConsole(test)

const textSimple = new URL('../../../fixtures/pdf/text-simple.pdf', import.meta.url)
/** Where playwright.config.ts builds the sandbox. */
const built = new URL('../dist-e2e/', import.meta.url)
const engineRoot = pathToFileURL(
  createRequire(import.meta.url).resolve('@inkbar/engine/package.json')
)
const engineFile = (name: string) => new URL(`dist/${name}`, engineRoot)
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

test('the built sandbox loads the engine in a worker', async ({ page }) => {
  await page.route('**/engine-probe/text-simple.pdf', async (route) =>
    route.fulfill({ contentType: 'application/pdf', body: await readFile(textSimple) })
  )
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  const responses = new Map<string, number>()
  page.on('response', (response) => responses.set(response.url(), response.status()))

  await page.goto('./?engine-probe')
  await expect(page.locator('output[data-engine-probe]')).toHaveText('3', {
    timeout: 20_000,
  })
  const engineWorkers = workers.filter((url) => !url.includes('pdf.worker'))
  expect(engineWorkers).toHaveLength(1)
  expect(responses.get(engineWorkers[0]!)).toBe(200)
  // PDF.js's own decoders live under inkbar/wasm/; anything else is the engine's.
  const wasm = [...responses].filter(
    ([url]) => url.endsWith('.wasm') && !url.includes('/inkbar/wasm/')
  )
  expect(wasm.map(([, status]) => status)).toEqual([200])
})

/** Files in the build that are byte-for-byte copies of the engine's `name`. */
async function copiesOf(name: string): Promise<string[]> {
  const want = sha(await readFile(engineFile(name)))
  const copies: string[] = []
  for (const file of await readdir(built, { recursive: true, withFileTypes: false }))
    if (
      file.endsWith(name.slice(name.lastIndexOf('.'))) &&
      sha(await readFile(new URL(file, built))) === want
    )
      copies.push(file)
  return copies
}

test('the build carries the engine wasm once, and no unbundled worker', async () => {
  expect(await copiesOf('inkbar-pdfium.wasm')).toHaveLength(1)
  // The bundler builds its own worker from the engine's `new Worker(...)` call.
  expect(await copiesOf('worker.mjs')).toEqual([])
  // Vite stands an empty chunk in for each Node module it externalizes, and warns.
  const files = await readdir(built, { recursive: true })
  expect(files.filter((file) => file.includes('__vite-browser-external'))).toEqual([])
})

test('an ordinary visit does not load the engine', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (request) => requested.push(request.url()))
  await page.goto('./')
  await expect(page.locator('[data-scenario-viewer] [data-ink-root]')).toHaveAttribute(
    'data-state',
    'ready',
    { timeout: 20_000 }
  )
  expect(requested.filter((url) => /inkbar-pdfium|engine/.test(url))).toEqual([])
})
