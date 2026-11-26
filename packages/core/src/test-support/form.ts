import { fixtureBytes, type FixtureName } from '@inkbar/fixtures'

import { openDocument } from '../model/document'
import { buildFormFields } from '../model/form/structure'
import { readFormExtras } from '../pdf/form-fields'
import { openPdfObjects } from '../pdf/objects'
import { destinationPage } from '../pdfjs/destinations'
import { fileFieldsFromPdfjs } from '../pdfjs/file-form'
import { nodeAssets } from '../pdfjs/node-assets'

import type { FormField } from '../model/form/types'
import type { PdfjsAnnotationData } from '../pdfjs/types'

/** The fields `buildFormFields` makes from the widgets PDF.js reports for a fixture. */
export async function formFieldsOf(name: FixtureName): Promise<FormField[]> {
  const doc = await openDocument(await fixtureBytes(name), { assets: nodeAssets() })
  await doc.ready
  const raw: { page: number; at: number; data: PdfjsAnnotationData }[] = []
  for (let page = 0; page < doc.pages.length; page++) {
    const annots = (await (
      await doc._pdfjs!.getPage(page)
    ).getAnnotations()) as PdfjsAnnotationData[]
    annots.forEach((data, at) => {
      if (data.subtype === 'Widget') raw.push({ page, at, data })
    })
  }
  const fields = fileFieldsFromPdfjs(raw)
  const objs = await openPdfObjects(await fixtureBytes(name))
  const extras = await readFormExtras(
    objs,
    fields.flatMap((f) => f.widgets.map((w) => w.id)),
    { destinationPage: (dest) => destinationPage(doc._pdfjs!.proxy, dest) }
  )
  doc.destroy()
  return buildFormFields(fields, extras)
}
