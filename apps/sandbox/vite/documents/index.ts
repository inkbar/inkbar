/*
 * The sandbox's generated documents, one per scenario. Each is built in memory with pdf-lib;
 * none is ever written into the source tree. The exception is the locked file, which is a
 * committed encrypted PDF.
 */
import { makeForm } from './form.ts'
import { makeHandbook } from './handbook.ts'
import { makeLetter } from './letter.ts'
import { makeLocked } from './locked.ts'
import { makeLong } from './long.ts'
import { makeRedactions } from './redactions.ts'
import { makeTour } from './tour.ts'

export const DOCUMENT_NAMES = [
  'tour',
  'letter',
  'form',
  'redactions',
  'long',
  'handbook',
  'locked',
] as const

export type DocumentName = (typeof DOCUMENT_NAMES)[number]

const BUILDERS: Record<DocumentName, () => Promise<Uint8Array>> = {
  tour: makeTour,
  letter: makeLetter,
  form: makeForm,
  redactions: makeRedactions,
  long: makeLong,
  handbook: makeHandbook,
  locked: makeLocked,
}

export function makeDocument(name: DocumentName): Promise<Uint8Array> {
  return BUILDERS[name]()
}
