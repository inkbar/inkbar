// Measures what drawing costs in Node, with the engine in the calling thread: for each file, the
// time to open it, the time to draw its first page at scale 2, and the peak resident memory
// while its first 20 pages are drawn. Each file runs in a process of its own, so one file's
// engine memory (which never shrinks) does not count for the next.
//
//   node scripts/measure-render.ts           all three files
//   node scripts/measure-render.ts <file>    one: text-simple, large-500 or transfer-function
//
// It runs the built engine, so build it first (`pnpm run build`): Node's type stripping cannot
// run the engine's source. It asserts nothing.
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { generateLarge } from '@inkbar/fixtures/generate-large'

import type * as EngineModule from '../src/index.ts'

// The built module, typed as the source it is built from.
const { createEngine } = (await import(
  new URL('../dist/index.mjs', import.meta.url).href
)) as typeof EngineModule

const FILES = {
  'text-simple': 'text-simple: 3 pages of text (fixtures/pdf/text-simple.pdf)',
  'large-500': 'large-500: 500 pages of text, made with generateLarge(500)',
  'transfer-function':
    'transfer-function: 2 image-only pages, a JBIG2 and a CCITT image (fixtures/corpus/transfer_function.pdf)',
} as const
type FileName = keyof typeof FILES

const PAGES = 20
const SCALE = 2
const fixtures = new URL('../../../fixtures/', import.meta.url)

async function bytesOf(name: FileName): Promise<Uint8Array> {
  if (name === 'large-500') return generateLarge(500)
  const path =
    name === 'text-simple' ? 'pdf/text-simple.pdf' : 'corpus/transfer_function.pdf'
  return new Uint8Array(await readFile(new URL(path, fixtures)))
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const ms = (start: number) => `${(performance.now() - start).toFixed(1)} ms`

async function measure(name: FileName): Promise<void> {
  const bytes = await bytesOf(name)
  const wasm = await readFile(new URL('../dist/inkbar-pdfium.wasm', import.meta.url))
  const before = process.memoryUsage().rss
  let peak = before
  const sample = () => {
    peak = Math.max(peak, process.memoryUsage().rss)
  }
  // Also sampled on a timer, so a peak inside a long call is not missed between the samples
  // taken after each step.
  const timer = setInterval(sample, 5)

  let start = performance.now()
  const engine = await createEngine({ wasm, worker: false })
  const started = ms(start)
  sample()
  start = performance.now()
  const doc = await engine.open(bytes)
  const opened = ms(start)
  sample()
  start = performance.now()
  const first = await doc.renderPage(0, { scale: SCALE })
  const firstPage = ms(start)
  sample()
  const count = Math.min(PAGES, doc.pageCount)
  start = performance.now()
  for (let page = 1; page < count; page++) {
    await doc.renderPage(page, { scale: SCALE })
    sample()
  }
  const rest = count > 1 ? ms(start) : '-'
  clearInterval(timer)
  sample()
  await engine.destroy()

  const row = (label: string, value: string) =>
    console.log(`  ${label.padEnd(30)}${value}`)
  console.log(FILES[name])
  row('file size', `${bytes.length.toLocaleString('en')} bytes`)
  row('engine start', started)
  row('open', opened)
  row(`first page at scale ${SCALE}`, `${firstPage} (${first.width} x ${first.height})`)
  row(`pages 2 to ${count}`, rest)
  row('rss before the engine', mb(before))
  row(`peak rss over ${count} pages`, `${mb(peak)} (+${mb(peak - before)})`)
}

const asked = process.argv[2] as FileName | undefined
if (asked !== undefined) {
  if (!(asked in FILES))
    throw new Error(`unknown file ${asked}: ${Object.keys(FILES).join(', ')}`)
  await measure(asked)
} else {
  console.log(`node ${process.version}, ${process.platform} ${process.arch}`)
  for (const name of Object.keys(FILES))
    execFileSync(process.execPath, [fileURLToPath(import.meta.url), name], {
      stdio: 'inherit',
    })
}
