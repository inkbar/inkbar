import { isFormFixture } from '@inkbar/e2e-shared/form-actions'
import { isLinksFixture } from '@inkbar/e2e-shared/links-fixture'
import { clampPageCount } from '@inkbar/e2e-shared/page-count'

import { FormPage } from './FormPage'
import { LinksPage } from './LinksPage'
import { ReviewPage } from './ReviewPage'

const params = new URLSearchParams(location.search)
const doc = params.get('doc') ?? 'text-simple'
const large = clampPageCount(params.get('large'))

export function App() {
  return (
    <main className="sandbox">
      <h1 className="sandbox-title">Inkbar review app</h1>
      {isFormFixture(doc) ? (
        <FormPage fixture={doc} />
      ) : isLinksFixture(doc) ? (
        <LinksPage fixture={doc} />
      ) : (
        <ReviewPage fixture={doc} largePages={large} />
      )}
    </main>
  )
}
