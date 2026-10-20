import { z } from 'zod'

import { AnnotationDocumentSchema, ExportedAnnotationSchema } from './types'

export const ANNOTATION_SCHEMA_ID = 'https://inkbar.dev/schema/annotations-v1.json'

function withoutDialect(schema: object): Record<string, unknown> {
  const { $schema: _dialect, ...rest } = schema as Record<string, unknown>
  return rest
}

/**
 * Input mode drops `additionalProperties: false` from plain objects, since zod strips unknown
 * keys. The published schema still lists every key a writer may send, so it puts that back.
 */
function closeObjects(ctx: {
  zodSchema: { _zod: { def: unknown } }
  jsonSchema: { additionalProperties?: unknown }
}): void {
  const def = ctx.zodSchema._zod.def as { type: string; catchall?: unknown }
  if (def.type === 'object' && def.catchall === undefined)
    ctx.jsonSchema.additionalProperties = false
}

/**
 * The exact object written to `schema.json`, before formatting. It describes what a writer may
 * send, so fields with a default are optional and carry that default.
 */
export function buildAnnotationSchema(): Record<string, unknown> {
  const options = {
    target: 'draft-2020-12',
    io: 'input',
    override: closeObjects,
  } as const
  const annotation = withoutDialect(z.toJSONSchema(ExportedAnnotationSchema, options))
  const envelope = withoutDialect(z.toJSONSchema(AnnotationDocumentSchema, options)) as {
    properties: Record<string, unknown>
  }
  // The document references the single Annotation definition instead of inlining it.
  const annotationDocument = {
    ...envelope,
    properties: {
      ...envelope.properties,
      annotations: { type: 'array', items: { $ref: '#/$defs/Annotation' } },
    },
  }

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: ANNOTATION_SCHEMA_ID,
    title: 'Inkbar annotations',
    description:
      'Typed annotation export. Coordinates are PDF user space in points, origin bottom-left.',
    $ref: '#/$defs/AnnotationDocument',
    $defs: { Annotation: annotation, AnnotationDocument: annotationDocument },
  }
}
