// What applying redactions reports. Kept apart from the apply itself, which paints and writes
// through modules that name the engine's types: these are public, and name nothing of it.
import type { RedactionFindings, RedactionSanitised } from '../save/saver'

/** What applying redactions did. Counts, ids of the session's own annotations, and places. */
export interface RedactionResult {
  /** Marks applied, Inkbar's earlier locked marks in an encrypted file included. */
  marks: number
  /** Pages where marks were applied. */
  pages: number
  removed: {
    /** Ids of the session annotations removed with the content under the marks. */
    session: readonly string[]
    /** File annotations the marks removed, pop-ups included. */
    file: number
  }
  /** Redact annotations from other programs, left in the file unapplied. */
  foreignMarks: number
  /** Inkbar's own earlier marks applied where they came back locked, in an encrypted file. */
  ownLockedMarks: number
  /** What sanitising removed. */
  sanitised: RedactionSanitised
  /** Whether the file has layers that are hidden. They are not cleaned. */
  hiddenLayers: boolean
  /** Whether the file held a digital signature, which no longer verifies. */
  signed: boolean
  /** What the check of the redacted bytes found: every region clean. */
  findings: RedactionFindings
}

/** What applying redactions would do, for a confirmation. */
export interface RedactionPreview {
  /** The session's redaction marks. */
  marks: number
  /** Pages with at least one mark. */
  pages: number
  /** Other annotations a mark overlaps, which go with the content under it. */
  overlapped: number
  /** Whether the file holds a digital signature, which would stop verifying. */
  signed: boolean
}
