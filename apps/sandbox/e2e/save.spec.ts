import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page } from '@playwright/test'

import { FRAMEWORK_ORDER } from '../src/shell/frameworks.ts'

guardConsole(test)

/** Where playwright.config.ts builds the sandbox. */
const built = new URL('../dist-e2e/', import.meta.url)
const engineRoot = pathToFileURL(
  createRequire(import.meta.url).resolve('@inkbar/engine/package.json')
)
const engineFile = (name: string) => new URL(`dist/${name}`, engineRoot)
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

const viewer = (page: Page) => page.locator('[data-scenario-viewer]')
const root = (page: Page) => viewer(page).locator('[data-ink-root]')
const highlights = (page: Page) =>
  viewer(page).locator('[data-annotation][data-type="highlight"]')
/** A request for the engine's binary. */
const isEngineBinary = (url: string) => /\/inkbar-pdfium[^/]*\.wasm(\?|$)/.test(url)

async function waitForViewer(page: Page): Promise<void> {
  await expect(root(page)).toHaveAttribute('data-state', 'ready', { timeout: 20_000 })
  await expect(
    viewer(page).locator('.ink-page[data-page="0"] canvas[data-ink-canvas]')
  ).toBeVisible({ timeout: 20_000 })
}

/** Highlights the first long line on page 1 by dragging across it with the highlight tool. */
async function highlightALine(page: Page): Promise<void> {
  const line = (await viewer(page)
    .locator('.ink-page[data-page="0"] [data-ink-text-layer] span')
    .filter({ hasText: /\w{8}/ })
    .first()
    .boundingBox())!
  const midY = line.y + line.height / 2
  await viewer(page).locator('button[data-tool="highlight"]').click()
  await page.mouse.move(line.x + 1, midY)
  await page.mouse.down()
  await page.mouse.move(line.x + line.width - 1, midY, { steps: 5 })
  await page.mouse.up()
}

for (const framework of FRAMEWORK_ORDER) {
  test(`${framework} save: a highlight saved by Download comes back editable`, async ({
    page,
  }) => {
    const workers: string[] = []
    page.on('worker', (worker) => workers.push(worker.url()))
    const responses = new Map<string, number>()
    page.on('response', (response) => responses.set(response.url(), response.status()))

    await page.goto(`./#/${framework}/save`)
    await waitForViewer(page)
    await expect(highlights(page)).toHaveCount(0)
    await highlightALine(page)
    await expect(highlights(page)).toHaveCount(1)
    const id = await highlights(page).getAttribute('data-annotation')

    const saving = page.waitForEvent('download')
    await viewer(page).getByRole('button', { name: 'Download' }).click()
    const file = await saving
    // Saved into the test's output folder, inside the repository, not the system temp folder.
    const path = test.info().outputPath('saved.pdf')
    await file.saveAs(path)
    const bytes = await readFile(path)
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')

    // The engine ran in one worker, the one the plugin copies, with the one wasm it copies.
    expect(workers).toHaveLength(1)
    expect(workers[0]).toMatch(/\/inkbar\/[^/]+\/worker\.mjs$/)
    expect(responses.get(workers[0]!)).toBe(200)
    const wasm = [...responses].filter(([url]) => isEngineBinary(url))
    expect(wasm.map(([, status]) => status)).toEqual([200])

    // Open the downloaded file in the same scenario, as the Open button would.
    await page.locator('input[type=file]').setInputFiles(path)
    await expect(root(page)).toHaveAttribute('data-state', 'ready', { timeout: 20_000 })
    await expect(highlights(page)).toHaveCount(1)
    const mark = highlights(page)
    // Lifted from the file: the same annotation, a session one, not locked.
    await expect(mark).toHaveAttribute('data-annotation', id!)
    await expect(mark).toHaveAttribute('data-source', 'session')
    await expect(mark).not.toHaveAttribute('data-locked')

    await viewer(page).locator('button[data-tool="select"]').click()
    await mark.click()
    await expect(mark).toHaveAttribute('data-state', 'selected')
    // A click on a highlight also opens its comment thread, which takes the focus. Close it.
    const thread = page.getByRole('dialog', { name: 'Comment thread' })
    await expect(thread).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(thread).toBeHidden()
    const before = (await mark.boundingBox())!
    await mark.focus()
    await page.keyboard.press('Shift+Alt+ArrowRight')
    await expect
      .poll(async () => (await mark.boundingBox())!.x)
      .toBeGreaterThan(before.x + 5)
    await expect(highlights(page)).toHaveCount(1)
  })
}

test('the other scenarios write the session into the file too', async ({ page }) => {
  await page.goto('./#/vanilla/tools')
  await waitForViewer(page)
  await highlightALine(page)
  const saving = page.waitForEvent('download')
  await viewer(page).getByRole('button', { name: 'Download' }).click()
  const path = test.info().outputPath('saved.pdf')
  await (await saving).saveAs(path)
  const bytes = await readFile(path)
  expect(bytes.toString('latin1')).toContain('/INKB_Gloss')
})

test('an ordinary visit fetches the engine once, and a download with no changes hands over the file as opened', async ({
  page,
}) => {
  const requested: string[] = []
  page.on('request', (request) => requested.push(request.url()))
  await page.goto('./#/react/save')
  await waitForViewer(page)
  const saving = page.waitForEvent('download')
  await viewer(page).getByRole('button', { name: 'Download' }).click()
  const path = test.info().outputPath('unchanged.pdf')
  await (await saving).saveAs(path)
  const opened = await (await page.request.get('./documents/letter.pdf')).body()
  expect(sha(await readFile(path))).toBe(sha(opened))
  expect(requested.filter(isEngineBinary)).toHaveLength(1)
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

test("the build carries the engine's wasm and worker once each, where the plugin copies them", async () => {
  expect(await copiesOf('inkbar-pdfium.wasm')).toEqual([
    expect.stringMatching(/^inkbar\/[^/]+\/inkbar-pdfium\.wasm$/),
  ])
  expect(await copiesOf('worker.mjs')).toEqual([
    expect.stringMatching(/^inkbar\/[^/]+\/worker\.mjs$/),
  ])
  // Vite stands an empty chunk in for each Node module it externalizes, and warns.
  const files = await readdir(built, { recursive: true })
  expect(files.filter((file) => file.includes('__vite-browser-external'))).toEqual([])
})
