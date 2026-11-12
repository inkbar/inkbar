/*
 * Makes vite/documents/locked.pdf: the letter, encrypted with AES-256 and opened by the user
 * password "inkbar". Not part of the build; the sandbox only reads the committed file.
 *
 * Needs qpdf on PATH. CI uses release 12.4.2 (see .github/actions/setup-qpdf), a static Linux
 * build at https://github.com/qpdf/qpdf/releases/tag/v12.4.2.
 *
 * Re-run from apps/sandbox: node scripts/encrypt-letter.ts
 *
 * The owner password is random, printed once and not kept; the sandbox never needs it.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { makeLetter } from '../vite/documents/letter.ts'

const out = fileURLToPath(new URL('../vite/documents/locked.pdf', import.meta.url))
const owner = randomBytes(12).toString('hex')
const dir = await mkdtemp(join(tmpdir(), 'inkbar-locked-'))
try {
  const input = join(dir, 'letter.pdf')
  await writeFile(input, await makeLetter())
  execFileSync('qpdf', ['--encrypt', 'inkbar', owner, '256', '--', input, out], {
    stdio: 'inherit',
  })
  console.log(`Wrote ${out}. Owner password (not stored): ${owner}`)
} finally {
  await rm(dir, { recursive: true, force: true })
}
