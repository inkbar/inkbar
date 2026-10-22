/*
 * A plugin is written once against `@inkbar/core` and runs in every binding. It contributes
 * commands, tools, decorations, page layers and its own record stores through the context its
 * `setup` receives; nothing it registers shows until the host places it (a command button, a
 * tool button). Everything it names is namespaced under its id: command `suggest` of plugin
 * `sandbox` is `sandbox.suggest`, and so are its tools and stores.
 */
import { InkError } from '../../model/errors'

import { createPluginApi, type PluginApi, type PluginOptions } from './api/api'

import type { AnnotationEdit } from '../../model/annotations/store'
import type { InkDocument } from '../../model/document'
import type { Rect } from '../../model/geometry'
import type { Readable } from '../../model/readable'
import type { RecordBase, RecordChange, RecordStore } from '../../model/records'
import type { DecorateAnnotation } from '../overlay'
import type { Tool } from '../tools/controller'
import type { PageTransform } from '../transform'
import type { IconNode } from '@inkbar/icons'

export interface InkPlugin {
  /** Lower-case kebab (/^[a-z][a-z0-9-]*$/); the namespace for everything the plugin adds. */
  readonly id: string
  /** Runs once per viewer. The returned function runs when the viewer is destroyed. */
  setup(ctx: PluginContext): void | (() => void)
}

export interface CommandSpec {
  /** Namespaced to `<plugin>.<id>`. */
  id: string
  /** Names the command's button; must not be empty (`InkError('InvalidCommandLabel')`). */
  label: string
  icon?: IconNode
  /** Default: a document is open and ready. */
  enabled?: Readable<boolean>
  /** A short progress or result message, announced in a live region by the command button. */
  status?: Readable<string>
  /** May be async: the command is busy until the promise settles. */
  run(): void | Promise<void>
}

export interface Command {
  /** `<plugin>.<spec id>`. */
  readonly id: string
  readonly label: string
  readonly icon: IconNode | undefined
  /** The spec's `enabled` (or a ready document), and not busy. */
  readonly enabled: Readable<boolean>
  /** True while the promise `run` returned is pending. */
  readonly busy: Readable<boolean>
  /** The spec's status, or `''` without one. */
  readonly status: Readable<string>
  /**
   * Does nothing while busy or disabled. Never rejects: a failure is logged, and one caused by
   * the document closing mid-run (`DocumentDestroyed`) is dropped silently.
   */
  run(): Promise<void>
}

export interface LayerSpec {
  /** Draw into `el` for `page`. Called on mount, on every transform change and on invalidate. */
  render(el: HTMLElement, page: number, transform: PageTransform): void
  /** Optional teardown when the page unmounts. */
  destroy?(el: HTMLElement, page: number): void
}

export interface PluginLayerHandle {
  /** Redraws `page`, or every mounted page without one. */
  invalidate(page?: number): void
}

export interface PluginStoreOptions<T extends RecordBase> {
  /** The records a store starts with, called once for each document that opens. */
  initial?: (doc: InkDocument) => readonly T[]
  /** Called after every change with the list as it now stands. */
  onChange?: (list: readonly T[], change: RecordChange<T>) => void
}

export interface PluginContext {
  /** The plugin's id. */
  readonly id: string
  readonly document: Readable<InkDocument | null>
  /**
   * The viewer's active history. `batch` makes everything `fn` changes, annotations and plugin
   * records alike, one undo step. Stores from `store` are tracked for you, and `onAnnotationEdit`
   * runs inside the edit's step.
   */
  readonly history: { batch(fn: () => void): void }
  /** The id of the activated annotation, or null. */
  readonly activated: Readable<string | null>
  setActivated(id: string | null): void
  /** The viewport container, or null while none is mounted. */
  readonly root: Readable<HTMLElement | null>
  commands: { add(spec: CommandSpec): Command }
  /** The tool's id becomes `<plugin>.<id>`. */
  tools: { add(tool: Tool): void }
  /** Composed after the host's own decoration and earlier plugins'; earlier ones win per key. */
  decorate(fn: DecorateAnnotation): void
  /**
   * Runs every decoration again for the open document's annotations. Decorations re-apply when
   * the annotations change; call this when one reads state of your own that changed instead.
   */
  redecorate(): void
  /**
   * A record store keyed `<plugin>.<name>`, created for each document that opens and tracked by
   * its history; null while no document is open. Inkbar keeps no plugin data: pass `initial`
   * and `onChange` to load and save it.
   */
  store<T extends RecordBase>(
    name: string,
    opts?: PluginStoreOptions<T>
  ): Readable<RecordStore<T> | null>
  /** Runs for each document that opens; the returned function runs when it closes. */
  onDocument(fn: (doc: InkDocument) => void | (() => void)): void
  /**
   * Runs for every user add, update and remove of an annotation, inside that edit's undo step,
   * so store changes made here undo with it. Never runs for undo and redo.
   */
  onAnnotationEdit(fn: (edit: AnnotationEdit) => void): void
  /** Adds a layer drawn on every mounted page, above the annotations. */
  layer(spec: LayerSpec): PluginLayerHandle
  /**
   * Scrolls the viewer so `rect` (user space on `page`) is in view, centring it when it was
   * not. Moves no focus. Does nothing while no document is shown.
   */
  scrollTo(page: number, rect: Rect, opts?: { behavior?: ScrollBehavior }): void
}

/** A factory's parameters: its options, optional only when `O` has no required field. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}` tests for no required field
type PluginFactoryArgs<O> = {} extends O
  ? [options?: O & PluginOptions]
  : [options: O & PluginOptions]

const PLUGIN_ID = /^[a-z][a-z0-9-]*$/

function checkId(id: string): void {
  if (!PLUGIN_ID.test(id))
    throw new InkError(
      'InvalidPluginId',
      `Plugin id ${JSON.stringify(id)} must be lower-case kebab`,
      {
        id,
      }
    )
}

/**
 * Checks the plugin's id and returns the plugin unchanged. Throws `InkError('InvalidPluginId')`
 * for an id that is not lower-case kebab.
 */
export function definePlugin(plugin: InkPlugin): InkPlugin
/**
 * Checks the id now and returns a factory: `factory(options)` is a plugin whose setup receives
 * the plugin API and those options. Each call makes an independent plugin. The options may be
 * left out only when every field of `O` is optional.
 */
export function definePlugin<O extends object = object>(
  id: string,
  setup: (plugin: PluginApi, options: O & PluginOptions) => void | (() => void)
): (...args: PluginFactoryArgs<O>) => InkPlugin
export function definePlugin<O extends object>(
  plugin: InkPlugin | string,
  setup?: (plugin: PluginApi, options: O & PluginOptions) => void | (() => void)
): InkPlugin | ((options?: O & PluginOptions) => InkPlugin) {
  if (typeof plugin !== 'string') {
    checkId(plugin.id)
    return plugin
  }
  const id = plugin
  checkId(id)
  return (options = {} as O & PluginOptions) => ({
    id,
    setup: (ctx) => setup?.(createPluginApi(ctx, options), options),
  })
}
