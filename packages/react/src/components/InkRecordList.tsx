import {
  recordsSource,
  type CardSpec,
  type RecordListSource,
  type RecordsSourceOptions,
} from '@inkbar/core/dom'
import { useEffect, useMemo, type ComponentPropsWithoutRef, type ReactNode } from 'react'

import { useInkContext } from '../context'
import { useToReadable } from '../to-readable'

import { RecordCards } from './RecordCards'

import type { RecordBase } from '@inkbar/core'

export interface InkRecordListProps<
  T extends RecordBase & { page: number } = RecordBase & { page: number },
> extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
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
  /** Called with the number listed whenever it changes. */
  onCountChange?: ((count: number) => void) | undefined
  /** Replaces "Nothing here yet.". */
  empty?: ReactNode
}

function isDevelopment(): boolean {
  // Bundlers replace the expression with a literal; raw browser ESM has no `process`.
  try {
    return process.env.NODE_ENV !== 'production'
  } catch {
    return false
  }
}

/**
 * The records a plugin keeps under `records` (`<plugin>.<name>`) as a list of cards, the same
 * cards their marks open, with the same actions: `createRecordList` on core's record list
 * controller. The list, the marks and `useRecordSelection` share one selection. `card`, `where`
 * and `sort` replace the marks' card, filter and reading order; a new function rebuilds the
 * list, so keep them stable (`useCallback`, or defined outside the component).
 * `onCountChange` gets the number listed whenever it changes; `empty` replaces "Nothing here
 * yet.". It fills its parent's height. Inside `InkRoot`; it renders empty on the server.
 *
 * In place of `records`, `source` takes a host's own `RecordListSource` and lists it with the
 * same controller and cards. Give one of the two: with both, `source` wins and a development
 * build warns.
 */
export function InkRecordList<
  T extends RecordBase & { page: number } = RecordBase & { page: number },
>({
  records,
  source,
  card,
  where,
  sort,
  onCountChange,
  empty,
  ...rest
}: InkRecordListProps<T>) {
  const ctx = useInkContext('InkRecordList')
  const viewport = useToReadable(ctx.viewport)
  const { pluginHost } = ctx

  const both = records !== undefined && source !== undefined
  useEffect(() => {
    if (both && isDevelopment())
      console.warn(
        '[inkbar] InkRecordList takes `records` or `source`, not both: it lists `source`.'
      )
  }, [both])

  const listed = useMemo((): RecordListSource | null => {
    if (source) return source
    if (!pluginHost || records === undefined) return null
    const opts: RecordsSourceOptions<T> = {}
    if (card) opts.card = card
    if (where) opts.where = where
    if (sort) opts.sort = sort
    return recordsSource<T>({ pluginHost, viewport }, records, opts)
  }, [source, pluginHost, records, card, where, sort, viewport])

  return (
    <RecordCards {...rest} source={listed} onCountChange={onCountChange} empty={empty} />
  )
}
