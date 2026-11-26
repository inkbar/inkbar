// A page's text as search joins it.

// Core's own joining, so the text baseline holds what search matches against. It is not part of
// core's public exports; the module is pure, with type imports only.
import { searchableText } from '../../packages/core/src/model/search-text'

import type { TextContent } from '@inkbar/core'

const WHITESPACE = /\s+/gu

/** A page's text as search joins it, whitespace runs collapsed to one space, trimmed. */
export function joinedText(content: TextContent): string {
  return searchableText(content).raw.replace(WHITESPACE, ' ').trim()
}
