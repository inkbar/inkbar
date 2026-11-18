// Test support: runs `qpdf` on saved files, for the packages whose tests write PDFs.
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Where the files handed to qpdf are written: inside the repository, in a directory git ignores,
 * so nothing lands in the system's temporary directory, which may be held in memory.
 */
const scratch = fileURLToPath(
  new URL('../node_modules/.cache/inkbar-qpdf/', import.meta.url)
)

/** Whether `qpdf` is on PATH. CI installs it; a local run without it skips the qpdf checks. */
export const qpdfAvailable = await run('qpdf', ['--version']).then(
  () => true,
  () => false
)

/** Fails a CI run that lacks `qpdf`, so its checks are never skipped there. */
export function requireQpdfInCi(): void {
  if (!qpdfAvailable && process.env.CI) {
    throw new Error('qpdf is required in CI and was not found on PATH.')
  }
}

/** Runs `use` with `bytes` written to a file in a fresh directory, removed afterwards. */
async function withFile<T>(bytes: Uint8Array, use: (file: string) => Promise<T>) {
  await mkdir(scratch, { recursive: true })
  const dir = await mkdtemp(join(scratch, 'check-'))
  const file = join(dir, 'saved.pdf')
  try {
    await writeFile(file, bytes)
    return await use(file)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** `qpdf --check` on the bytes: ok, or the output that shows why not. */
export async function qpdfCheck(
  saved: Uint8Array,
  password?: string
): Promise<{ ok: true } | { ok: false; output: string }> {
  return withFile(saved, async (file) => {
    const args = ['--check', ...(password ? [`--password=${password}`] : []), file]
    const result = await run('qpdf', args).then(
      ({ stdout, stderr }) => ({ code: 0, output: stdout + stderr }),
      (e: { code?: number; stdout?: string; stderr?: string }) => ({
        code: typeof e.code === 'number' ? e.code : -1,
        output: (e.stdout ?? '') + (e.stderr ?? ''),
      })
    )
    const hasError = /(^|\n)[^\n]*\berror\b/i.test(
      result.output.replace(/no errors/gi, '')
    )
    return (result.code === 0 || result.code === 3) && !hasError
      ? { ok: true }
      : { ok: false, output: result.output }
  })
}

/**
 * The file as `qpdf --qdf --object-streams=disable` writes it: every object on its own, streams
 * uncompressed, as Latin-1 text. With `password`, the file is decrypted too. With
 * `unreferenced`, objects nothing refers to are kept: qpdf drops them otherwise, so a reader
 * looking for leftover content must ask for them.
 */
export async function qpdfQdf(
  saved: Uint8Array,
  options: { password?: string; unreferenced?: boolean } = {}
): Promise<string> {
  return withFile(saved, async (file) => {
    const out = `${file}.qdf`
    const { password, unreferenced = false } = options
    const decrypt = password === undefined ? [] : [`--password=${password}`, '--decrypt']
    const keep = unreferenced ? ['--preserve-unreferenced'] : []
    // Exit status 3 means warnings: the output is still written.
    await run('qpdf', [
      ...decrypt,
      ...keep,
      '--qdf',
      '--object-streams=disable',
      file,
      out,
    ]).catch((error: { code?: number }) => {
      if (error.code !== 3) throw error
    })
    return (await readFile(out)).toString('latin1')
  })
}
