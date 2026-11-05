<script module lang="ts">
  import type { RecordBase } from '@inkbar/core'
  import type { CardSpec, RecordListSource } from '@inkbar/core/dom'
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  export interface InkRecordListProps<
    T extends RecordBase & { page: number } = RecordBase & { page: number },
  > extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    /** The records to list, as `<plugin>.<name>`. */
    records?: string | undefined
    /**
     * A host's own source, listed in place of `records` with the same controller and cards.
     * `card`, `where` and `sort` do not apply to it.
     */
    source?: RecordListSource | undefined
    /** The card each record shows. Default: its mark's card. */
    card?: ((record: T) => CardSpec) | undefined
    /** Which records to list. Default: those that have a mark. */
    where?: ((record: T) => boolean) | undefined
    /** The order. Default: reading order by the marks' rects. */
    sort?: ((a: T, b: T) => number) | undefined
    /** Bindable, read-only: the number listed, from once the list has mounted. */
    count?: number | undefined
    /** Replaces "Nothing here yet.". */
    empty?: Snippet | undefined
  }
</script>

<script
  lang="ts"
  generics="T extends RecordBase & { page: number } = RecordBase & { page: number }"
>
  /*
   * The records a plugin keeps under `records` (`<plugin>.<name>`) as a list of cards, the same
   * cards their marks open, with the same actions: `createRecordList` on core's record list
   * controller. The list, the marks and `useRecordSelection` share one selection. `card`, `where`
   * and `sort` replace the marks' card, filter and reading order; a new function rebuilds the
   * list, so pass functions defined once rather than inline. `bind:count` gives the number
   * listed whenever it changes; the `empty` snippet replaces "Nothing here yet.". It fills its
   * parent's height. Inside `InkRoot`; it renders empty on the server.
   *
   * In place of `records`, `source` takes a host's own `RecordListSource` and lists it with the
   * same controller and cards. Give one of the two: with both, `source` wins and a development
   * build warns.
   */
  import { recordsSource, type RecordsSourceOptions } from '@inkbar/core/dom'
  import { DEV } from 'esm-env'

  import { useInkContext } from '../context.js'
  import { toReadable } from '../to-readable.svelte.js'

  import RecordCards from './RecordCards.svelte'

  let {
    records,
    source,
    card,
    where,
    sort,
    // Written, never read: the list reports its count to the host.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    count = $bindable(),
    empty,
    ...rest
  }: InkRecordListProps<T> = $props()

  const ctx = useInkContext('InkRecordList')
  const viewport = toReadable(() => ctx.viewport)

  if (DEV)
    $effect(() => {
      if (records !== undefined && source !== undefined)
        console.warn(
          '[inkbar] InkRecordList takes `records` or `source`, not both: it lists `source`.'
        )
    })

  const listed = $derived.by((): RecordListSource | null => {
    if (source) return source
    const pluginHost = ctx.pluginHost
    if (!pluginHost || records === undefined) return null
    const opts: RecordsSourceOptions<T> = {}
    if (card) opts.card = card
    if (where) opts.where = where
    if (sort) opts.sort = sort
    return recordsSource<T>({ pluginHost, viewport }, records, opts)
  })
</script>

<RecordCards {...rest} source={listed} {empty} oncount={(n) => (count = n)} />
