import { writable } from '@inkbar/core'
import { definePlugin } from '@inkbar/core/dom'

import type { Readable, RecordStore } from '@inkbar/core'

export interface Mark {
  id: string
  status: 'suggested' | 'accepted'
  /** The redaction accepting it added. */
  annotationId?: string | undefined
}

/**
 * A plugin small enough to read in one go: one store of marks, `accept` (marks `m1` accepted and
 * adds a redaction, in one step), `work` (with an icon; busy until the harness releases it), a
 * `stamp` tool, and a reaction that puts a mark back to suggested when its redaction is deleted.
 */
export function createTestPlugin() {
  let marks: Readable<RecordStore<Mark> | null> = {
    get: () => null,
    subscribe: () => () => {},
  }
  const status = writable('')
  let finish = () => {}
  const plugin = definePlugin({
    id: 'sandbox',
    setup(ctx) {
      marks = ctx.store<Mark>('marks', {
        initial: () => [{ id: 'm1', status: 'suggested' }],
      })
      ctx.commands.add({
        id: 'accept',
        label: 'Accept',
        run() {
          const store = marks.get()
          const doc = ctx.document.get()
          if (!store || !doc) return
          ctx.history.batch(() => {
            const a = doc.annotations.add({
              type: 'redact',
              page: 0,
              rect: { x: 40, y: 40, width: 120, height: 30 },
            })
            store.update('m1', { status: 'accepted', annotationId: a.id })
          })
        },
      })
      ctx.commands.add({
        id: 'work',
        label: 'Work',
        icon: [['path', { d: 'M4 12h16' }]],
        status,
        run: () =>
          new Promise<void>((resolve) => {
            status.set('Working')
            finish = () => {
              status.set('Done')
              resolve()
            }
          }),
      })
      ctx.tools.add({
        id: 'stamp',
        label: 'Stamp',
        icon: [['circle', { cx: '12', cy: '12', r: '8' }]],
        cursor: 'crosshair',
        activate: () => undefined,
        deactivate: () => undefined,
      })
      ctx.onAnnotationEdit((edit) => {
        if (edit.kind !== 'remove') return
        const store = marks.get()
        const mark = store?.list.get().find((m) => m.annotationId === edit.annotation.id)
        if (mark) store?.update(mark.id, { status: 'suggested', annotationId: undefined })
      })
    },
  })
  return { plugin, marks: () => marks, finish: () => finish() }
}
