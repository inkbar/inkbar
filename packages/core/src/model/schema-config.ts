// Imported first by every module of core that builds a schema or imports Gloss's, so it runs
// before any schema is built. Zod then validates without compiling code: it neither compiles a
// schema with `Function` nor probes once whether it may, a probe a content security policy
// without `'unsafe-eval'` reports as a violation although it is caught.
import { config } from 'zod'

config({ jitless: true })
