<script lang="ts">
  import { engineReaderRoute, onEngineReaderPage } from '@inkbar/e2e-shared/engine-reader'
  import { isFormFixture } from '@inkbar/e2e-shared/form-actions'
  import { isLinksFixture } from '@inkbar/e2e-shared/links-fixture'
  import { clampPageCount } from '@inkbar/e2e-shared/page-count'
  import {
    isRedactionFixture,
    redactionPageOptions,
  } from '@inkbar/e2e-shared/redaction-page'

  import EngineReaderPage from './EngineReaderPage.svelte'
  import FormPage from './FormPage.svelte'
  import LinksPage from './LinksPage.svelte'
  import RedactPage from './RedactPage.svelte'
  import ReviewPage from './ReviewPage.svelte'

  const params = new URLSearchParams(location.search)
  const doc = params.get('doc') ?? 'text-simple'
  const large = clampPageCount(params.get('large'))
  const redaction = redactionPageOptions(params)
  // Before any viewer mounts: the switch is read as a document opens.
  const engineReader = engineReaderRoute(params)
</script>

<main class="sandbox">
  <h1 class="sandbox-title">Inkbar review app</h1>
  {#if engineReader && onEngineReaderPage(doc)}
    <EngineReaderPage fixture={doc} />
  {:else if isFormFixture(doc)}
    <FormPage fixture={doc} {engineReader} />
  {:else if isLinksFixture(doc)}
    <LinksPage fixture={doc} />
  {:else if isRedactionFixture(doc)}
    <RedactPage
      fixture={doc}
      controlled={redaction.controlled}
      confirm={redaction.confirm}
    />
  {:else}
    <ReviewPage fixture={doc} largePages={large} />
  {/if}
</main>
