<script setup lang="ts">
/*
 * The search hits as a list of cards, for a sidebar panel: `createSearchResults` on core's
 * record list controller over the root's search. One card per hit, with its page and the text
 * around it. Choosing a card makes its hit current, as the find bar's next and previous do, and
 * the current hit is the selected card. Above the cards, a query field ("Find in document";
 * `:field="false"` leaves it out when a find bar is on the page) and the find bar's match count.
 * Field and find bar share the search state, so they never disagree. It fills its parent's
 * height. Inside `InkRoot`; it renders empty on the server.
 */
import { findCountText, handleResultsFieldKey, searchSource } from '@inkbar/core/dom'
import { computed } from 'vue'

import { useSearch } from '../composables/useSearch'
import { injectInkContext } from '../context'

import RecordCards from './RecordCards.vue'

withDefaults(defineProps<{ field?: boolean }>(), { field: true })

const ctx = injectInkContext()
const search = useSearch()
const { state } = search

const source = computed(() => (ctx.search.value ? searchSource(ctx.search.value) : null))
const count = computed(() => findCountText(state.value))
// Nothing found yet is the count's to say while a query is in: "No results", or a scan. The
// count says nothing and no scan runs only while the query is blank.
const blank = computed(() => count.value === '' && !state.value.scanning)
</script>

<template>
  <div class="ink-search-results" data-ink-search-results>
    <div class="ink-search-results-bar" :role="field ? 'search' : undefined">
      <input
        v-if="field"
        type="text"
        aria-label="Find in document"
        autocomplete="off"
        spellcheck="false"
        :value="state.query"
        @input="search.setQuery(($event.target as HTMLInputElement).value)"
        @keydown="handleResultsFieldKey($event, search)"
      />
      <span class="ink-find-count" data-ink-search-results-count>{{ count }}</span>
    </div>
    <RecordCards :source="source" :empty-shown="blank" />
  </div>
</template>
