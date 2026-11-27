// Every module that builds a schema when it loads, or imports Gloss's, between `./begin` and
// `./end`. Each entry of core that reaches a schema imports this first, so the schemas are all
// built inside that window. A new such module goes in the list here.
import './begin'
import '../annotations/types'
import '../annotations/callout'
import '../annotations/pdf-names'
import '../form/gloss'
import '../signatures'
import './end'
