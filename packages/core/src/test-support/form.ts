import { fixtureBytes, type FixtureName } from '@inkbar/fixtures'

import { openDocument } from '../model/document'
import { buildFormFields, type RawWidget } from '../model/form/structure'
import { readFormExtras } from '../pdf/form-fields'
import { openPdfObjects } from '../pdf/objects'
import { nodeAssets } from '../pdfjs/node-assets'

import type { FormField } from '../model/form/types'
import type { PdfjsAnnotationData } from '../pdfjs/types'

/** The fields `buildFormFields` makes from the widgets PDF.js reports for a fixture. */
export async function formFieldsOf(name: FixtureName): Promise<FormField[]> {
  const doc = await openDocument(await fixtureBytes(name), { assets: nodeAssets() })
  await doc.ready
  const raw: RawWidget[] = []
  for (let page = 0; page < doc.pages.length; page++) {
    const annots = (await (
      await doc._pdfjs.getPage(page)
    ).getAnnotations()) as PdfjsAnnotationData[]
    for (const data of annots) if (data.subtype === 'Widget') raw.push({ page, data })
  }
  doc.destroy()
  const objs = await openPdfObjects(await fixtureBytes(name))
  const extras = await readFormExtras(
    objs,
    raw.map((r) => r.data.id)
  )
  return buildFormFields(raw, extras)
}
