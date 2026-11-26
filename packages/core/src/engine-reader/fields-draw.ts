// What the engine draws for a pass of field appearances: which of the page's widgets, in which
// state of `/AP /N`, and the part of the page the pass's canvas shows, so the widgets land on the
// page canvas's pixel grid.
import { pageCanvasSize } from '../dom/draw-request'
import { createPageTransform, normalizeRotation } from '../dom/transform'

import { annotationId, F_HIDDEN, F_NO_VIEW, knownFlags } from './file-values'
import { toggleOnStates } from './form'

import type { FormFactsShape, PageAnnotationsShape } from './types'
import type { Rect } from '../model/geometry'
import type { PageInfo } from '../model/pages'
import type { FieldDrawRequest, FieldLook } from '../reader/types'

/** The longest state name the engine draws by name. */
const MAX_STATE = 65_535

/** @internal One place in the page's `/Annots` that holds a widget. */
export interface FieldPlace {
  index: number
  /** The names of `/AP /N`'s states. */
  states: readonly string[]
  /** A checkbox or radio: the on-state PDF.js draws for it, if any. Absent for other widgets. */
  toggle?: { onState: string | undefined }
}

/**
 * @internal The page's widgets the page canvas shows, by id, at each place `/Annots` holds
 * them.
 */
export type FieldPlaces = ReadonlyMap<string, readonly FieldPlace[]>

const noToggles: ReadonlyMap<string, string | undefined> = new Map()
/** Each form's toggles, worked out once for all its pages. */
const toggleCache = new WeakMap<FormFactsShape, ReturnType<typeof toggleOnStates>>()
const togglesOf = (form: FormFactsShape): ReturnType<typeof toggleOnStates> => {
  let toggles = toggleCache.get(form)
  if (!toggles) toggleCache.set(form, (toggles = toggleOnStates(form)))
  return toggles
}

/**
 * @internal The widgets of page `page` that the page canvas draws, from the page's annotation
 * facts and, for which are checkboxes and radios, the form's. A widget flagged Hidden or NoView
 * is left out: the page does not show it, though the engine draws one flagged NoView when asked.
 */
export function fieldPlaces(
  page: number,
  facts: PageAnnotationsShape,
  form: FormFactsShape | undefined
): FieldPlaces {
  const toggles = (form && togglesOf(form).get(page)) ?? noToggles
  const places = new Map<string, FieldPlace[]>()
  for (const a of facts.annotations) {
    if (a.subtype !== 'Widget' || (knownFlags(a.flags) & (F_HIDDEN | F_NO_VIEW)) !== 0)
      continue
    const id = annotationId(page, a)
    const place: FieldPlace = {
      index: a.index,
      states: a.appearanceStates,
      ...(toggles.has(id) ? { toggle: { onState: toggles.get(id) } } : {}),
    }
    const known = places.get(id)
    if (known) known.push(place)
    else places.set(id, [place])
  }
  return places
}

/**
 * The state of `/AP /N` the engine draws for `look` at `place`: none for `own` (the one `/AS`
 * selects), a toggle's on-state for `checked` and `Off` for `unchecked`. `undefined` when there is
 * nothing to draw: a look other than `own` of a widget that is no toggle, or a state its
 * appearance lacks, as PDF.js then has no run for it.
 */
function stateFor(place: FieldPlace, look: FieldLook): { state?: string } | undefined {
  if (look === 'own') return {}
  if (!place.toggle) return undefined
  const state = look === 'checked' ? place.toggle.onState : 'Off'
  return state !== undefined && state.length <= MAX_STATE && place.states.includes(state)
    ? { state }
    : undefined
}

/**
 * @internal What the engine draws for the `ids` in `look`, in `/Annots` order so that widgets
 * that overlap stack as on the page, and the id at each place.
 */
export function fieldAnnotations(
  places: FieldPlaces,
  ids: Iterable<string>,
  look: FieldLook
): { annotations: { index: number; state?: string }[]; idAt: Map<number, string> } {
  const annotations: { index: number; state?: string }[] = []
  const idAt = new Map<number, string>()
  for (const id of ids)
    for (const place of places.get(id) ?? []) {
      const state = stateFor(place, look)
      if (!state || idAt.has(place.index)) continue
      annotations.push({ index: place.index, ...state })
      idAt.set(place.index, id)
    }
  annotations.sort((a, b) => a.index - b.index)
  return { annotations, idAt }
}

/**
 * @internal The part of the page, in user space, that a canvas `width` × `height` device pixels
 * shows with its top-left corner at device pixel (`x`, `y`) of the page canvas `request`
 * describes. The page canvas stretches the page over whole pixels, so the region follows its
 * pixels rather than the zoom alone. `undefined` when the page canvas has no pixels.
 */
export function fieldRegion(
  info: PageInfo,
  request: Pick<FieldDrawRequest, 'zoom' | 'rotation' | 'pixelRatio' | 'x' | 'y'>,
  width: number,
  height: number
): Rect | undefined {
  const t = createPageTransform(
    info,
    request.zoom,
    normalizeRotation(request.rotation - info.rotate)
  )
  const page = pageCanvasSize(t, request.pixelRatio)
  if (page.width < 1 || page.height < 1) return undefined
  const across = t.cssWidth / page.width
  const down = t.cssHeight / page.height
  return t.fromCssRect({
    left: request.x * across,
    top: request.y * down,
    width: width * across,
    height: height * down,
  })
}
