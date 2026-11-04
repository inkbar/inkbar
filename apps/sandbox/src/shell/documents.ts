import type { DocumentName } from '../../vite/documents/index.ts'
import type { DocumentSource } from '@inkbar/core'

/** Where a generated document is served. The base is a parameter so node tests can pass one. */
export function documentSource(
  name: DocumentName,
  base: string = import.meta.env.BASE_URL
): DocumentSource {
  return { url: `${base}documents/${name}.pdf`, key: name }
}
