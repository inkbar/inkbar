// Test support: not imported by the package itself.
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

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

/** Runs `use` with `bytes` written to a file in a fresh temporary directory. */
async function withFile<T>(bytes: Uint8Array, use: (file: string) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), 'inkbar-qpdf-'))
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
 * uncompressed, as Latin-1 text.
 */
export async function qpdfQdf(saved: Uint8Array): Promise<string> {
  return withFile(saved, async (file) => {
    const out = `${file}.qdf`
    // Exit status 3 means warnings: the output is still written.
    await run('qpdf', ['--qdf', '--object-streams=disable', file, out]).catch(
      (error: { code?: number }) => {
        if (error.code !== 3) throw error
      }
    )
    return (await readFile(out)).toString('latin1')
  })
}
