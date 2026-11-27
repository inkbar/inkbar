<script lang="ts">
  import { isFormFixture } from '@inkbar/e2e-shared/form-actions'
  import { isLinksFixture } from '@inkbar/e2e-shared/links-fixture'
  import { clampPageCount } from '@inkbar/e2e-shared/page-count'
  import {
    isRedactionFixture,
    redactionPageOptions,
  } from '@inkbar/e2e-shared/redaction-page'

  import DrawingPage from './DrawingPage.svelte'
  import FormPage from './FormPage.svelte'
  import LinksPage from './LinksPage.svelte'
  import RedactPage from './RedactPage.svelte'
  import ReviewPage from './ReviewPage.svelte'

  const params = new URLSearchParams(location.search)
  const doc = params.get('doc') ?? 'text-simple'
  const large = clampPageCount(params.get('large'))
  const redaction = redactionPageOptions(params)
  /** `?view=drawing`: the page with the thumbnails and the shape tools. */
  const drawing = params.get('view') === 'drawing'
</script>

<main class="sandbox">
  <h1 class="sandbox-title">Inkbar review app</h1>
  {#if drawing}
    <DrawingPage fixture={doc} />
  {:else if isFormFixture(doc)}
    <FormPage fixture={doc} />
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
