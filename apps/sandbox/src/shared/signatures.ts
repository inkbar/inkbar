import { createLocalStorage } from '@inkbar/core'

/*
 * What the sandbox keeps between visits (signatures, sidebar widths) lives in this browser's
 * localStorage under the `inkbar-sandbox` prefix, shared by every scenario. A host would keep
 * it wherever its users' data lives.
 */
export const storage = createLocalStorage('inkbar-sandbox')

/** The handwriting fonts a typed signature offers, loaded in styles/fonts.css. */
export const signatureFonts = ['Dancing Script']
