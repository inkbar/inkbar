// The first step of building core's schemas, and Gloss's: Zod's `jitless` on, so no object schema
// built from here probes whether it may compile code with `Function`, a probe a content security
// policy without `'unsafe-eval'` reports as a violation although it is caught. `jitless` is
// global to every copy of Zod 4 on the page, so `./end` puts back what was found here.
import { config } from 'zod'

const settings = config()

/** Whether `jitless` was set before core loaded, and to what. */
export const found = Object.hasOwn(settings, 'jitless')
  ? { set: true as const, value: settings.jitless }
  : { set: false as const }

settings.jitless = true
