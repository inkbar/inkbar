import { computed, reactive } from 'vue'

/**
 * What a host binds on a menu trigger in the tests: listeners that record what reached them,
 * and `disabled` when `disabled` is `'true'` or `'false'` (a string, as Vue would cast a
 * missing boolean prop to false).
 */
export function useHostTrigger(disabled: () => 'true' | 'false' | undefined) {
  const seen = reactive({ keys: [] as string[], clicks: 0 })
  const attrs = computed(() => ({
    onKeydown: (e: KeyboardEvent) => seen.keys.push(e.key),
    onClick: () => seen.clicks++,
    ...(disabled() === undefined ? {} : { disabled: disabled() === 'true' }),
  }))
  return { seen, attrs }
}
