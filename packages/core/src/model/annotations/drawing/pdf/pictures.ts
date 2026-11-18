// The pictures a save asks its host for. Kept apart from the painter, which names the engine's
// types: these are part of core's public types, and those name nothing from the engine.
import type { TextFont } from '../types'

export interface TextPictureRequest {
  text: string
  font: TextFont
  size: number
  color: string
  /** Extra points added to each U+0020 in `text`, none to U+00A0; absent means none. */
  wordSpacing?: number
}

/**
 * A picture of one run of text. `width`, `ascent`, `descent` in points: the picture spans the
 * run's origin to origin + width, and baseline - descent to baseline + ascent. `width` includes
 * the request's word spacing.
 */
export type TextPicture = (
  r: TextPictureRequest
) => Promise<{ png: Uint8Array; width: number; ascent: number; descent: number }>

/** A data URL the file cannot hold as it is, as PNG, `width` by `height` pixels. */
export type ToPng = (
  dataUrl: string,
  width: number,
  height: number
) => Promise<Uint8Array>
