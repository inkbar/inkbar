import { createLocalSignatureStore } from '@inkbar/core'

/*
 * Signatures made in the sandbox stay in this browser's localStorage, shared by every
 * framework page. A host would keep them wherever its users' data lives.
 */
export const signatures = createLocalSignatureStore('inkbar-sandbox-signatures')

/** The handwriting fonts a typed signature offers, loaded in styles/fonts.css. */
export const signatureFonts = ['Dancing Script']
