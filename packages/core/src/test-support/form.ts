import { fixtureBytes, type FixtureName } from '@inkbar/fixtures'

import { buildFormFields } from '../model/form/structure'
import { readFormExtras } from '../pdf/form-fields'
import { openPdfObjects } from '../pdf/objects'
import { destinationPage } from '../pdfjs/destinations'
import { fileFieldsFromPdfjs } from '../pdfjs/file-form'

import { openWithPdfjsReader } from './pdfjs-reader'

import type { FormField } from '../model/form/types'
import type { PdfjsAnnotationData } from '../pdfjs/types'

/** The fields `buildFormFields` makes from the widgets PDF.js reports for a fixture. */
export async function formFieldsOf(name: FixtureName): Promise<FormField[]> {
  const pdfjs = await openWithPdfjsReader(await fixtureBytes(name))
  const { handles } = pdfjs
  const raw: { page: number; at: number; data: PdfjsAnnotationData }[] = []
  for (let page = 0; page < handles.proxy.numPages; page++) {
    const annots = (await (
      await handles.getPage(page)
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
    { destinationPage: (dest) => destinationPage(handles.proxy, dest) }
  )
  await pdfjs.destroy()
  return buildFormFields(fields, extras)
}
