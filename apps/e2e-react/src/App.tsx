import { isFormFixture } from '@inkbar/e2e-shared/form-actions'
import { isLinksFixture } from '@inkbar/e2e-shared/links-fixture'
import { clampPageCount } from '@inkbar/e2e-shared/page-count'
import {
  isRedactionFixture,
  redactionPageOptions,
} from '@inkbar/e2e-shared/redaction-page'

import { FormPage } from './FormPage'
import { LinksPage } from './LinksPage'
import { RedactPage } from './RedactPage'
import { ReviewPage } from './ReviewPage'

const params = new URLSearchParams(location.search)
const doc = params.get('doc') ?? 'text-simple'
const large = clampPageCount(params.get('large'))
const redaction = redactionPageOptions(params)

export function App() {
  return (
    <main className="sandbox">
      <h1 className="sandbox-title">Inkbar review app</h1>
      {isFormFixture(doc) ? (
        <FormPage fixture={doc} />
      ) : isLinksFixture(doc) ? (
        <LinksPage fixture={doc} />
      ) : isRedactionFixture(doc) ? (
        <RedactPage
          fixture={doc}
          controlled={redaction.controlled}
          confirm={redaction.confirm}
        />
      ) : (
        <ReviewPage fixture={doc} largePages={large} />
      )}
    </main>
  )
}
