import { ArgumentError } from '../errors.ts'

import { withBytes, withUtf8, type Heap } from './strings.ts'

import type { Appearance, StandardFont } from '../types.ts'

/** A resource name: a PDF name without its slash, from the characters every reader accepts. */
const NAME = /^[A-Za-z0-9]+$/

const STANDARD_FONTS: ReadonlySet<string> = new Set<StandardFont>([
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Times-Roman',
  'Times-Bold',
  'Times-Italic',
  'Times-BoldItalic',
  'Courier',
  'Courier-Bold',
  'Courier-Oblique',
  'Courier-BoldOblique',
])

const IMAGE_FORMATS = { png: 0, jpeg: 1 } as const

const entries = <T>(record: Record<string, T> | undefined): [string, T][] =>
  record ? Object.entries(record) : []

/**
 * Throws an `ArgumentError` for an appearance the engine cannot install whatever the document:
 * a resource name outside `[A-Za-z0-9]+`, a font that is not a standard one, an unknown image
 * format, a page index that is not a whole number, or content that is not bytes. `where` names
 * the appearance in the message.
 */
export function checkAppearance(appearance: Appearance, where: string): void {
  const { bounds } = appearance
  if (
    typeof bounds !== 'object' ||
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
  )
    throw new ArgumentError(`${where}: bounds must be four finite numbers`)
  if (!(appearance.content instanceof Uint8Array))
    throw new ArgumentError(`${where}: content must be a Uint8Array`)
  const named = (kind: string, name: string) => {
    if (!NAME.test(name))
      throw new ArgumentError(
        `${where}: the ${kind} name "${name}" is not made of A-Z, a-z and 0-9`
      )
  }
  for (const [name, font] of entries(appearance.fonts)) {
    named('font', name)
    if (!STANDARD_FONTS.has(font))
      throw new ArgumentError(`${where}: the font ${name} is not a standard font`)
  }
  for (const [name] of entries(appearance.opacities)) named('opacity', name)
  for (const [name, image] of entries(appearance.images)) {
    named('image', name)
    if (!(image.format in IMAGE_FORMATS) || !(image.data instanceof Uint8Array))
      throw new ArgumentError(`${where}: the image ${name} must be PNG or JPEG bytes`)
  }
  for (const [name, index] of entries(appearance.pages)) {
    named('page', name)
    if (!Number.isInteger(index))
      throw new ArgumentError(`${where}: the page ${name} must be a whole page index`)
  }
  for (const [name, form] of entries(appearance.forms)) {
    named('form', name)
    checkAppearance(form, `${where}, form ${name}`)
  }
}

/**
 * Builds an appearance in `doc` and returns it, for the caller to install. Nested forms are built
 * first and handed to their parent. On any failure everything built so far is freed and the
 * error from `failed` is thrown, naming the part that failed. The appearance must have passed
 * `checkAppearance`.
 */
export function buildAppearance(
  heap: Heap,
  doc: number,
  appearance: Appearance & { group?: boolean },
  failed: (what: string) => Error,
  where = 'its appearance'
): number {
  const { fn } = heap
  const { x, y, width, height } = appearance.bounds
  const built = withBytes(heap, appearance.content, (content, length) =>
    fn.INK_Appearance_New(
      doc,
      x,
      y,
      x + width,
      y + height,
      content,
      length,
      appearance.group ? 1 : 0
    )
  )
  if (built === 0) throw failed(`${where} could not be started`)
  try {
    const add = (ok: number, what: string) => {
      if (!ok) throw failed(`${where}: ${what} could not be added`)
    }
    for (const [name, font] of entries(appearance.fonts))
      add(
        withUtf8(heap, name, (n) =>
          withUtf8(heap, font, (f) => fn.INK_Appearance_AddFont(built, n, f))
        ),
        `the font ${name}`
      )
    for (const [name, { fill, stroke }] of entries(appearance.opacities))
      add(
        withUtf8(heap, name, (n) =>
          // A negative value leaves its key out.
          fn.INK_Appearance_AddOpacity(built, n, fill ?? -1, stroke ?? -1)
        ),
        `the opacity ${name}`
      )
    for (const [name, image] of entries(appearance.images))
      add(
        withUtf8(heap, name, (n) =>
          withBytes(heap, image.data, (data, length) =>
            fn.INK_Appearance_AddImage(
              built,
              n,
              IMAGE_FORMATS[image.format],
              data,
              length
            )
          )
        ),
        `the image ${name}`
      )
    for (const [name, index] of entries(appearance.pages))
      add(
        withUtf8(heap, name, (n) => fn.INK_Appearance_AddPage(built, n, index)),
        `the page ${name} (page index ${index})`
      )
    for (const [name, form] of entries(appearance.forms)) {
      const child = buildAppearance(heap, doc, form, failed, `${where}, form ${name}`)
      // The parent takes the child whether or not adding it works, once the call is made.
      let taken = false
      try {
        add(
          withUtf8(heap, name, (n) => {
            taken = true
            return fn.INK_Appearance_AddForm(built, n, child)
          }),
          `the form ${name}`
        )
      } finally {
        if (!taken && !heap.stopped) fn.INK_Appearance_Free(child)
      }
    }
    return built
  } catch (error) {
    if (!heap.stopped) fn.INK_Appearance_Free(built)
    throw error
  }
}
