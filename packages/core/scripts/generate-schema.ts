import { writeFileSync } from 'node:fs'

import { format, resolveConfig } from 'prettier'
import { z } from 'zod'

import {
  AnnotationDocumentSchema,
  AnnotationSchema,
} from '../src/model/annotations/types'

const annotation = z.toJSONSchema(AnnotationSchema, { target: 'draft-2020-12' })
const { $schema: _schema, ...envelope } = z.toJSONSchema(AnnotationDocumentSchema, {
  target: 'draft-2020-12',
}) as Record<string, unknown> & { properties: Record<string, unknown> }

// The document references the single Annotation definition instead of inlining it a second time.
const annotationDocument = {
  ...envelope,
  properties: {
    ...envelope.properties,
    annotations: { type: 'array', items: { $ref: '#/$defs/Annotation' } },
  },
}

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://inkbar.dev/schema/annotations-v1.json',
  title: 'Inkbar annotations',
  description:
    'Typed annotation export. Coordinates are PDF user space in points, origin bottom-left.',
  ...annotationDocument,
  $defs: { Annotation: annotation, AnnotationDocument: annotationDocument },
}

const target = new URL('../schema.json', import.meta.url)
const options = await resolveConfig(target.pathname)
const json = await format(JSON.stringify(schema), {
  ...options,
  filepath: target.pathname,
})
writeFileSync(target, json)
console.log('wrote schema.json')
