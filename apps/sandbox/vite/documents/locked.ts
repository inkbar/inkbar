/*
 * The locked file: the letter, encrypted. Its password is "inkbar". It is read from the
 * committed locked.pdf (made by scripts/encrypt-letter.ts), since encrypting needs qpdf and the
 * build doesn't.
 */
import { readFile } from 'node:fs/promises'

export async function makeLocked(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(new URL('./locked.pdf', import.meta.url)))
}
