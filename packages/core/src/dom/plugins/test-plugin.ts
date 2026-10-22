// The plugin the framework packages' component tests share, imported by relative path. Test
// support only: not exported from the package, and not part of its build.
import { writable, type Readable } from '../../model/readable'

import { definePlugin } from './define'

import type { RecordStore } from '../../model/records'

export interface Mark {
  id: string
  status: 'suggested' | 'accepted'
  /** The redaction accepting it added. */
  annotationId?: string | undefined
}

export interface TestPluginOptions {
  /** Records the layer's teardown and the plugin's cleanup, in order. */
  log?: string[] | undefined
  /** Called each time the plugin is set up. */
  onSetup?: (() => void) | undefined
}

/**
 * A plugin small enough to read in one go: one store of marks, `accept` (marks `m1` accepted and
 * adds a redaction, in one step), `work` (with an icon; busy until the harness releases it), a
 * `stamp` tool, a reaction that puts a mark back to suggested when its redaction is deleted, and
 * an empty page layer.
 */
export function createTestPlugin({ log = [], onSetup }: TestPluginOptions = {}) {
  // Plugins are set up once the root has mounted: the harness reads this one readable from
  // the start, and setup points it at the plugin's store.
  const marks = writable<RecordStore<Mark> | null>(null)
  const status = writable('')
  let finish = () => {}
  const plugin = definePlugin({
    id: 'sandbox',
    setup(ctx) {
      onSetup?.()
      const store = ctx.store<Mark>('marks', {
        initial: () => [{ id: 'm1', status: 'suggested' }],
      })
      marks.set(store.get())
      const stopMarks = store.subscribe((s) => marks.set(s))
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
      ctx.layer({
        render: () => undefined,
        destroy: (_el, page) => {
          if (page === 0) log.push('layer destroyed')
        },
      })
      return () => {
        stopMarks()
        log.push('plugin cleaned up')
      }
    },
  })
  return {
    plugin,
    marks: (): Readable<RecordStore<Mark> | null> => marks,
    finish: () => finish(),
  }
}
