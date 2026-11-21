// Measures what reading text costs in Node, with the engine in the calling thread: for each
// file, the time to read the text of every page in turn with `pageText`, the characters that
// came back, and the peak resident memory while it ran. Each file runs in a process of its own,
// so one file's engine memory (which never shrinks) does not count for the next.
//
//   node scripts/measure-text.ts           all files
//   node scripts/measure-text.ts <file>    one: large-500, shade or form-fields
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
  'large-500': 'large-500: 500 pages of text, made with generateLarge(500)',
  shade: 'shade: the largest file in fixtures/corpus (fixtures/corpus/shade.pdf)',
  'form-fields':
    'form-fields: the largest file in fixtures/pdf (fixtures/pdf/form-fields.pdf)',
} as const
type FileName = keyof typeof FILES

const fixtures = new URL('../../../fixtures/', import.meta.url)

async function bytesOf(name: FileName): Promise<Uint8Array> {
  if (name === 'large-500') return generateLarge(500)
  const path = name === 'shade' ? 'corpus/shade.pdf' : 'pdf/form-fields.pdf'
  return new Uint8Array(await readFile(new URL(path, fixtures)))
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

async function measure(name: FileName): Promise<void> {
  const bytes = await bytesOf(name)
  const wasm = await readFile(new URL('../dist/inkbar-pdfium.wasm', import.meta.url))
  const before = process.memoryUsage().rss
  let peak = before
  const sample = () => {
    peak = Math.max(peak, process.memoryUsage().rss)
  }
  // Also sampled on a timer, so a peak inside a long call is not missed between the samples
  // taken after each page.
  const timer = setInterval(sample, 5)

  const steps = async () => {
    const engine = await createEngine({ wasm, worker: false })
    sample()
    try {
      const doc = await engine.open(bytes)
      sample()
      let characters = 0
      const start = performance.now()
      for (let page = 0; page < doc.pageCount; page++) {
        characters += (await doc.pageText(page)).count
        sample()
      }
      return { pages: doc.pageCount, characters, elapsed: performance.now() - start }
    } finally {
      await engine.destroy()
    }
  }
  let measured: Awaited<ReturnType<typeof steps>>
  try {
    measured = await steps()
  } finally {
    // Cleared on a throw too, or the timer keeps the process alive.
    clearInterval(timer)
  }
  sample()
  const { pages, characters, elapsed } = measured

  const row = (label: string, value: string) =>
    console.log(`  ${label.padEnd(30)}${value}`)
  console.log(FILES[name])
  row('file size', `${bytes.length.toLocaleString('en')} bytes`)
  row('pages', String(pages))
  row('characters', characters.toLocaleString('en'))
  row('total', `${elapsed.toFixed(1)} ms`)
  row('per page', `${(elapsed / pages).toFixed(2)} ms`)
  row('rss before the engine', mb(before))
  row('peak rss', `${mb(peak)} (+${mb(peak - before)})`)
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
