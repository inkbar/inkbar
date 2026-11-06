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
import {
  findCountText,
  handleResultsFieldKey,
  isBlankQuery,
  searchSource,
} from '@inkbar/core/dom'
import { Search } from '@inkbar/icons'
import { computed } from 'vue'

import { useSearch } from '../composables/useSearch'
import { injectInkContext } from '../context'

import InkIcon from './InkIcon.vue'
import RecordCards from './RecordCards.vue'

withDefaults(defineProps<{ field?: boolean }>(), { field: true })

const ctx = injectInkContext()
const search = useSearch()
const { state } = search

const source = computed(() => (ctx.search.value ? searchSource(ctx.search.value) : null))
const count = computed(() => findCountText(state.value))
// Nothing found yet is the count's to say while a query is in: "No results", or a scan.
const blank = computed(() => isBlankQuery(state.value.query))
</script>

<template>
  <div class="ink-search-results" data-ink-search-results>
    <div class="ink-search-results-bar" :role="field ? 'search' : undefined">
      <div v-if="field" class="ink-input-group">
        <span class="ink-input-accessory"><InkIcon :icon="Search" /></span>
        <input
          type="text"
          aria-label="Find in document"
          placeholder="Find in document"
          autocomplete="off"
          spellcheck="false"
          :value="state.query"
          @input="search.setQuery(($event.target as HTMLInputElement).value)"
          @keydown="handleResultsFieldKey($event, search)"
        />
      </div>
      <span class="ink-find-count" data-ink-search-results-count>{{ count }}</span>
    </div>
    <RecordCards :source="source" :empty-shown="blank">
      <template #empty>Search to list every match.</template>
    </RecordCards>
  </div>
</template>
