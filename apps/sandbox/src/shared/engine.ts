/*
 * Loads @inkbar/engine, so Download and Print in every scenario hand over the file with the
 * session's annotations and form values written into it. It loads on the first save with
 * changes; a visit that changes nothing never fetches it. The Save and reopen scenario shows the
 * option in place.
 *
 * Each engine it makes gets the fallback fonts the build ships under `fonts/`, for text whose
 * font the file does not carry. An engine fetches a font only when a page it draws needs one.
 */
export const FONT_BASE = `${import.meta.env.BASE_URL}fonts/`

export const engine = async () => {
  const [real, { fontUrls }] = await Promise.all([
    import('@inkbar/engine'),
    import('@inkbar/fonts'),
  ])
  return {
    ...real,
    createEngine: () => real.createEngine({ fallbackFonts: fontUrls(FONT_BASE) }),
  }
}
