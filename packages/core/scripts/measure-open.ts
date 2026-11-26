// Measures what opening a file costs a host in Chromium, with core's internal reader switch off
// (PDF.js reads the file) and on (the engine reads it): the time from the viewer's open to page
// 1 drawn, the peak memory while it opens, and the JavaScript the page loads by then.
//
//   node scripts/measure-open.ts [runs] [out]    default 5 runs, out .tmp/measures.json
//
// The page is scripts/measure-open/index.html, built with Vite against core's and the engine's
// built output (so build first: `pnpm turbo run build`) and served by `vite preview`. Each run
// is a new browser, so nothing is cached between runs and one run's engine memory does not count
// for the next. Per run:
// - time: `performance.now()` in the page, from `createViewer` (which starts the open) to page
//   1's canvas in the DOM with a size, the bytes already fetched;
// - memory: the resident memory of the browser's process tree (every process under the one
//   Playwright launched, from /proc, so Linux only), sampled every 5 ms from just before the
//   open until page 1 is drawn; the peak less the sample taken just before. It holds the page's
//   and every worker's JavaScript heap, PDF.js's worker and the engine's WebAssembly memory
//   alike. The main thread's JavaScript heap is also read, through the DevTools protocol, at the
//   same times;
// - JavaScript: every .js or .mjs response the browser received from page load until page 1 is
//   drawn, workers' included, sized from the built files on disk, raw and gzipped (level 9); the
//   WebAssembly the same way, apart.
// It prints and writes the median of each over the runs. It asserts nothing.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { generateLarge } from '@inkbar/fixtures/generate-large'
import { chromium, type CDPSession } from 'playwright'
import { build, preview, type Plugin } from 'vite'

import { inkbar } from '@inkbar/core/vite'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = join(HERE, '..', '..', '..')
const ROOT = join(HERE, 'measure-open')
const OUT_DIR = join(REPO, '.tmp', 'measure-open')
const runs = Number(process.argv[2] ?? 5)
const outFile = process.argv[3] ?? join(REPO, '.tmp', 'measures.json')

const LARGE_PAGES = 1000
const FILES = {
  large: () => generateLarge(LARGE_PAGES),
  'form-fields': () =>
    new Uint8Array(readFileSync(join(REPO, 'fixtures', 'pdf', 'form-fields.pdf'))),
} as const
type FileName = keyof typeof FILES
const READERS = ['pdfjs', 'engine'] as const
type Reader = (typeof READERS)[number]

/** Serves the measured files at `/measure/<name>.pdf` from the preview server. */
function serveFiles(files: Record<string, Uint8Array>): Plugin {
  return {
    name: 'measure-open:files',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /^\/measure\/([\w-]+)\.pdf$/.exec(req.url ?? '')
        const bytes = match ? files[match[1]!] : undefined
        if (!bytes) return next()
        res.setHeader('Content-Type', 'application/pdf')
        res.end(bytes)
      })
    },
  }
}

/** Every process under `root`, `root` included, from /proc. */
function processTree(root: number): number[] {
  const children = new Map<number, number[]>()
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    try {
      const stat = readFileSync(`/proc/${entry}/stat`, 'utf8')
      // The fourth field, after the command name in parentheses.
      const parent = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
      const list = children.get(parent) ?? []
      list.push(Number(entry))
      children.set(parent, list)
    } catch {
      // The process ended while it was read.
    }
  }
  const tree = [root]
  for (let i = 0; i < tree.length; i++) tree.push(...(children.get(tree[i]!) ?? []))
  return tree
}

/** Resident memory of `pids`, in bytes. */
function residentBytes(pids: number[]): number {
  let total = 0
  for (const pid of pids) {
    try {
      const status = readFileSync(`/proc/${pid}/status`, 'utf8')
      const kb = /^VmRSS:\s+(\d+) kB$/m.exec(status)
      if (kb) total += Number(kb[1]) * 1024
    } catch {
      // The process ended while it was read.
    }
  }
  return total
}

async function mainHeap(cdp: CDPSession): Promise<number> {
  const { usedSize } = await cdp.send('Runtime.getHeapUsage')
  return usedSize
}

interface Run {
  ms: number
  peakTreeBytes: number
  peakMainHeapBytes: number
  scripts: string[]
  binaries: string[]
}

async function once(base: string, file: FileName, reader: Reader): Promise<Run> {
  const server = await chromium.launchServer({ headless: true })
  try {
    const browser = await chromium.connect(server.wsEndpoint())
    const context = await browser.newContext()
    const scripts = new Set<string>()
    const binaries = new Set<string>()
    context.on('response', (r) => {
      const path = new URL(r.url()).pathname
      if (/\.m?js$/.test(path)) scripts.add(path)
      if (path.endsWith('.wasm')) binaries.add(path)
    })
    const page = await context.newPage()
    const query = reader === 'engine' ? '?reader=engine' : ''
    await page.goto(`${base}/${query}`)
    await page.waitForFunction(
      () => (globalThis as { measureReady?: boolean }).measureReady
    )
    const cdp = await context.newCDPSession(page)
    const root = server.process().pid!

    const pids = processTree(root)
    const treeBefore = residentBytes(pids)
    const heapBefore = await mainHeap(cdp)
    let treePeak = treeBefore
    let heapPeak = heapBefore
    let sampling = true
    const treeTimer = setInterval(() => {
      treePeak = Math.max(treePeak, residentBytes(processTree(root)))
    }, 5)
    const heapLoop = (async () => {
      while (sampling) {
        heapPeak = Math.max(heapPeak, await mainHeap(cdp).catch(() => 0))
        await new Promise((r) => setTimeout(r, 5))
      }
    })()
    let result: { elapsed: number; reader: string }
    try {
      result = await page.evaluate(
        (url) =>
          (
            globalThis as unknown as {
              measureOpen: (u: string) => Promise<{ elapsed: number; reader: string }>
            }
          ).measureOpen(url),
        `/measure/${file}.pdf`
      )
    } finally {
      sampling = false
      clearInterval(treeTimer)
      await heapLoop
    }
    treePeak = Math.max(treePeak, residentBytes(processTree(root)))
    heapPeak = Math.max(heapPeak, await mainHeap(cdp))
    if (result.reader !== reader)
      throw new Error(`${file} opened with ${result.reader}, not ${reader}`)
    await browser.close()
    return {
      ms: result.elapsed,
      peakTreeBytes: treePeak - treeBefore,
      peakMainHeapBytes: heapPeak,
      scripts: [...scripts].sort(),
      binaries: [...binaries].sort(),
    }
  } finally {
    await server.close()
  }
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}
const mb = (bytes: number) => Number((bytes / 1024 / 1024).toFixed(1))

function sizesOf(dist: string, scripts: string[]) {
  let raw = 0
  let gzip = 0
  const files = scripts.map((path) => {
    const bytes = readFileSync(join(dist, path))
    const zipped = gzipSync(bytes, { level: 9 }).length
    raw += bytes.length
    gzip += zipped
    return { path, raw: bytes.length, gzip: zipped }
  })
  return { raw, gzip, files }
}

const files = Object.fromEntries(
  await Promise.all(
    Object.entries(FILES).map(async ([name, make]) => [name, await make()] as const)
  )
)
mkdirSync(OUT_DIR, { recursive: true })
await build({
  root: ROOT,
  logLevel: 'warn',
  plugins: [inkbar()],
  build: { outDir: OUT_DIR, emptyOutDir: true },
})
const server = await preview({
  root: ROOT,
  logLevel: 'warn',
  plugins: [inkbar(), serveFiles(files)],
  build: { outDir: OUT_DIR },
  preview: { port: 0, strictPort: false },
})
const base = server.resolvedUrls!.local[0]!.replace(/\/$/, '')

const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
  cwd: REPO,
  encoding: 'utf8',
}).trim()
const results: Record<string, unknown> = {}
try {
  for (const file of Object.keys(FILES) as FileName[])
    for (const reader of READERS) {
      const measured: Run[] = []
      for (let i = 0; i < runs; i++) measured.push(await once(base, file, reader))
      const sizes = sizesOf(OUT_DIR, measured[0]!.scripts)
      const wasm = sizesOf(OUT_DIR, measured[0]!.binaries)
      const row = {
        runs,
        openToFirstPageMs: Number(median(measured.map((r) => r.ms)).toFixed(1)),
        peakProcessTreeRssIncreaseMB: mb(median(measured.map((r) => r.peakTreeBytes))),
        peakMainThreadJsHeapMB: mb(median(measured.map((r) => r.peakMainHeapBytes))),
        javascriptAtOpen: { raw: sizes.raw, gzip: sizes.gzip, files: sizes.files },
        webAssemblyAtOpen: { raw: wasm.raw, gzip: wasm.gzip, files: wasm.files },
        each: measured.map((r) => ({
          ms: Number(r.ms.toFixed(1)),
          treeMB: mb(r.peakTreeBytes),
          heapMB: mb(r.peakMainHeapBytes),
        })),
      }
      results[`${file}, switch ${reader === 'engine' ? 'on' : 'off'}`] = row
      console.log(
        `${file.padEnd(12)} switch ${reader === 'engine' ? 'on ' : 'off'}  ` +
          `${String(row.openToFirstPageMs).padStart(7)} ms  ` +
          `tree +${row.peakProcessTreeRssIncreaseMB} MB  ` +
          `main heap ${row.peakMainThreadJsHeapMB} MB  ` +
          `JS ${sizes.raw.toLocaleString('en')} B (${sizes.gzip.toLocaleString('en')} gzipped)`
      )
    }
} finally {
  await server.close()
}

mkdirSync(join(outFile, '..'), { recursive: true })
writeFileSync(
  outFile,
  JSON.stringify(
    {
      commit,
      measured: new Date().toISOString(),
      machine: `${process.platform} ${process.arch}, node ${process.version}, chromium ${chromium.executablePath()}`,
      large: `generateLarge(${LARGE_PAGES}): ${files.large!.length} bytes`,
      formFields: `fixtures/pdf/form-fields.pdf: ${files['form-fields']!.length} bytes`,
      results,
    },
    null,
    2
  ) + '\n'
)
console.log(`written to ${outFile}`)
