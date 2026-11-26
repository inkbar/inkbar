<script setup lang="ts">
import { engineReaderRoute, onEngineReaderPage } from '@inkbar/e2e-shared/engine-reader'
import { isFormFixture } from '@inkbar/e2e-shared/form-actions'
import { isLinksFixture } from '@inkbar/e2e-shared/links-fixture'
import { clampPageCount } from '@inkbar/e2e-shared/page-count'
import {
  isRedactionFixture,
  redactionPageOptions,
} from '@inkbar/e2e-shared/redaction-page'

import EngineReaderPage from './EngineReaderPage.vue'
import FormPage from './FormPage.vue'
import LinksPage from './LinksPage.vue'
import RedactPage from './RedactPage.vue'
import ReviewPage from './ReviewPage.vue'

const params = new URLSearchParams(location.search)
const doc = params.get('doc') ?? 'text-simple'
const large = clampPageCount(params.get('large'))
const redaction = redactionPageOptions(params)
// Before any viewer mounts: the switch is read as a document opens.
const engineReader = engineReaderRoute(params)
</script>

<template>
  <main class="sandbox">
    <h1 class="sandbox-title">Inkbar review app</h1>
    <EngineReaderPage v-if="engineReader && onEngineReaderPage(doc)" :fixture="doc" />
    <FormPage v-else-if="isFormFixture(doc)" :fixture="doc" />
    <LinksPage v-else-if="isLinksFixture(doc)" :fixture="doc" />
    <RedactPage
      v-else-if="isRedactionFixture(doc)"
      :fixture="doc"
      :controlled="redaction.controlled"
      :confirm="redaction.confirm"
    />
    <ReviewPage v-else :fixture="doc" :large-pages="large" />
  </main>
</template>

<style>
html,
body,
#app {
  margin: 0;
  height: 100%;
}
.sandbox {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: system-ui, sans-serif;
}
.sandbox-title {
  font-size: 1rem;
  margin: 0;
  padding: 0.5rem 1rem;
}
.sandbox-root {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.sandbox-editor {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.sandbox-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.25rem 1rem;
}
.sandbox-banner {
  margin: 0 1rem 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid #b07d12;
  background: #fbefd3;
  color: #2b2100;
  border-radius: 6px;
}
.sandbox-status {
  margin: 0;
  padding: 0.25rem 1rem;
  font-size: 0.8rem;
  color: #4a505c;
}
</style>
