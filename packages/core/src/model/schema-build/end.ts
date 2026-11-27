// The last step of building core's schemas, and Gloss's: Zod's `jitless` back to what `./begin`
// found, so a host's own schemas built later are as they would be without core.
import { config } from 'zod'

import { found } from './begin'

const settings = config()
if (found.set) settings.jitless = found.value
else delete settings.jitless
