// Places the chosen signature template. A click puts it centred on the press, about 150 pt
// wide; Enter in the viewport puts it at the centre of the current page. It is turned against
// the page's own /Rotate, so it reads upright on the page as the file displays it; a view
// rotation is the viewer's, and turns it with the page like any annotation. Ink takes the
// `ink` group's colour at the template's own width; an image is placed as it is. Either way
// the new annotation is selected, one undo step, and the tool stays active for the next one.
import {
  DEFAULT_SIGNATURE_WIDTH,
  placeSignature,
  type SignatureOptions,
  type SignatureTemplate,
} from '../../model/signatures'

import { isViewportEnter, type PageHit, type Tool, type ToolContext } from './controller'

import type { Point } from '../../model/geometry'
import type { PageRotation } from '../../model/pages'

export type { SignatureOptions }

export function signatureTool(): Tool<SignatureOptions> {
  let ctx: ToolContext | undefined
  let down: PageHit | undefined
  /** Bumped on deactivate, so a load still pending from an earlier use places nothing. */
  let generation = 0

  const place = (
    c: ToolContext,
    t: SignatureTemplate,
    page: number,
    at: Point,
    rotation: PageRotation
  ): void => {
    const input = placeSignature(t, page, at, DEFAULT_SIGNATURE_WIDTH, rotation)
    const a = c.store.add(
      input.type === 'ink' ? c.toolStyle.resolve('ink', input) : input
    )
    c.store.select([a.id])
  }

  /**
   * Places the selected template, from the library at once, or after reloading it when the
   * template was saved since the last load. False when there is nothing to place.
   */
  const placeSelected = (
    c: ToolContext,
    page: number,
    at: Point,
    rotation: PageRotation
  ): boolean => {
    const id = c.options<SignatureOptions>().templateId
    const library = c.signatures
    if (id === undefined || !library) return false
    const t = library.get(id)
    if (t) {
      place(c, t, page, at, rotation)
      return true
    }
    const gen = generation
    void library.refresh().then(() => {
      // The tool may have been switched (even away and back), or the template removed.
      const later = library.get(id)
      if (
        later &&
        ctx === c &&
        gen === generation &&
        c.options<SignatureOptions>().templateId === id
      )
        place(c, later, page, at, rotation)
    })
    return true
  }

  return {
    id: 'signature',
    cursor: 'copy',
    defaultOptions: {},
    activate(c) {
      ctx = c
    },
    deactivate() {
      ctx = undefined
      down = undefined
      generation++
    },
    onPointerDown(_e, hit, annotationId) {
      down = annotationId === undefined ? hit : undefined
      return down !== undefined
    },
    onPointerMove(e) {
      // The release was missed: treat it as a cancel.
      if (e.buttons === 0) down = undefined
    },
    onPointerCancel() {
      down = undefined
    },
    onPointerUp(_e, hit) {
      const pressed = down
      down = undefined
      if (!ctx || !pressed || !hit || hit.page !== pressed.page) return
      placeSelected(ctx, hit.page, hit.user, hit.transform.page.rotate)
    },
    onKeyDown(e) {
      if (!ctx || !isViewportEnter(e, ctx.root)) return
      const page = ctx.viewport.currentPage.get()
      const t = ctx.viewport.transformFor(page)
      const { box } = t.page
      const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      if (placeSelected(ctx, page, centre, t.page.rotate)) e.preventDefault()
    },
  }
}
