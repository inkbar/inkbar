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

/** A value in qpdf's JSON form of a file's objects. */
type QpdfValue =
  string | number | boolean | null | QpdfValue[] | { [key: string]: QpdfValue }
type QpdfDict = { [key: string]: QpdfValue }

/** An image in a file, as `qpdfImages` lists it. */
export interface QpdfImage {
  /** Its reference, as `"7 0 R"`. */
  ref: string
  /**
   * A page names it in its own `/XObject` resources, or it is the mask of an image that does. This
   * says the page refers to it, not that the content paints it.
   */
  namedOnPage: boolean
  /** Its samples with every filter qpdf can undo undone, or undefined when one is left. */
  samples: Uint8Array | undefined
}

/**
 * Every image in the file: each stream with `/Subtype /Image`, or with `/Width` and `/Height` and
 * no `/Subtype` (a page thumbnail), objects nothing refers to included.
 */
export async function qpdfImages(
  saved: Uint8Array,
  password?: string
): Promise<QpdfImage[]> {
  return withFile(saved, async (file) => {
    const pass = password === undefined ? [] : [`--password=${password}`]
    const json = (
      await qpdfStdout([...pass, '--json=2', '--json-key=qpdf', file])
    ).toString('utf8')
    const objects = (JSON.parse(json) as { qpdf: [unknown, Record<string, QpdfValue>] })
      .qpdf[1]
    const isDict = (v: QpdfValue | undefined): v is QpdfDict =>
      typeof v === 'object' && v !== null && !Array.isArray(v)
    const resolve = (v: QpdfValue | undefined): QpdfValue | undefined => {
      if (typeof v !== 'string' || !v.endsWith(' R')) return v
      const object = objects[`obj:${v}`]
      return isDict(object) ? (object.value ?? object) : undefined
    }
    const streamDict = (ref: string) => {
      const object = objects[`obj:${ref}`]
      const stream = isDict(object) ? object.stream : undefined
      return isDict(stream) && isDict(stream.dict) ? stream.dict : undefined
    }
    const isImage = (dict: QpdfDict | undefined) =>
      dict !== undefined &&
      (dict['/Subtype'] === '/Image' ||
        (dict['/Subtype'] === undefined && '/Width' in dict && '/Height' in dict))
    const refs = Object.keys(objects)
      .filter((key) => key.startsWith('obj:'))
      .map((key) => key.slice(4))
    const onPage = new Set<string>()
    for (const ref of refs) {
      const page = resolve(ref)
      if (!isDict(page) || page['/Type'] !== '/Page') continue
      const resources = resolve(page['/Resources'])
      const xobjects = isDict(resources) ? resolve(resources['/XObject']) : undefined
      if (!isDict(xobjects)) continue
      for (const value of Object.values(xobjects)) {
        if (typeof value !== 'string' || !isImage(streamDict(value))) continue
        onPage.add(value)
        for (const key of ['/SMask', '/Mask']) {
          const mask = streamDict(value)?.[key]
          if (typeof mask === 'string' && mask.endsWith(' R')) onPage.add(mask)
        }
      }
    }
    const images: QpdfImage[] = []
    for (const ref of refs.filter((r) => isImage(streamDict(r)))) {
      const number = ref.split(' ')[0] as string
      const samples = await qpdfStdout([
        ...pass,
        '--decode-level=all',
        `--show-object=${number}`,
        '--filtered-stream-data',
        file,
      ]).then(
        (data) => new Uint8Array(data),
        () => undefined
      )
      images.push({ ref, namedOnPage: onPage.has(ref), samples })
    }
    return images
  })
}

/** qpdf's standard output for `args`, a run that ends in warnings included. */
async function qpdfStdout(args: string[]): Promise<Buffer> {
  return run('qpdf', args, { encoding: 'buffer', maxBuffer: 1 << 28 }).then(
    ({ stdout }) => stdout,
    (error: { code?: number; stdout?: Buffer }) => {
      if (error.code !== 3 || error.stdout === undefined) throw error
      return error.stdout
    }
  )
}
