import { writeFileSync } from 'node:fs'

import { format, resolveConfig } from 'prettier'

import { buildAnnotationSchema } from '../src/model/annotations/schema'

const target = new URL('../schema.json', import.meta.url)
const options = await resolveConfig(target.pathname)
const json = await format(JSON.stringify(buildAnnotationSchema()), {
  ...options,
  filepath: target.pathname,
})
writeFileSync(target, json)
console.log('wrote schema.json')
