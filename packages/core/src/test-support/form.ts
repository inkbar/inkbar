import { fixtureBytes, manifest, type FixtureName } from '@inkbar/fixtures'

import { openDocument } from '../model/document'
import { buildFormFields } from '../model/form/structure'
import { readFormExtras } from '../pdf/form-fields'
import { openPdfObjects } from '../pdf/objects'

import { nodeAssets } from './node-assets'

import type { FormField } from '../model/form/types'

/**
 * The fields `buildFormFields` makes from a fixture's fields as the engine reader reads them,
 * with the extras read from the file's objects, as the document builds them.
 */
export async function formFieldsOf(name: FixtureName): Promise<FormField[]> {
  const doc = await openDocument(await fixtureBytes(name), {
    assets: nodeAssets(),
    password: manifest[name].password,
  })
  try {
    await doc.ready
    const reader = doc._reader
    const fields = await reader.form()
    const extras = await readFormExtras(
      await openPdfObjects(await fixtureBytes(name)),
      fields.flatMap((f) => f.widgets.map((w) => w.id)),
      {
        destinationPage: (dest) =>
          reader.resolveDestination(dest).then(
            (d) => d?.page,
            () => undefined
          ),
      }
    )
    return buildFormFields(fields, extras)
  } finally {
    doc.destroy()
  }
}
