/*
 * The words of the Suggest redactions plugin, English by default. A host in another language
 * passes its own through the plugin's `text` option. They sit in a file of their own so a host
 * can import them without the plugin.
 */
import { plural, template, type MessageFn } from '@inkbar/core'

/** The kinds of personal data Suggest looks for. */
export type KindId = 'ni-number' | 'email' | 'phone'

/** Every word the plugin shows. */
export interface SuggestionsText {
  /** The command's button. */
  command: string
  /** The command's status after a run. */
  found: MessageFn<{ count: number }>
  /** The command's status when a run fails. */
  failed: string
  /** A mark's accessible name. */
  mark: MessageFn<{ reason: string }>
  /** The card's accessible name. */
  card: string
  lowConfidence: string
  mediumConfidence: string
  highConfidence: string
  accept: string
  dismiss: string
  /** Each kind's name, the card's title. */
  reasons: Record<KindId, string>
  /** Each kind's explanation, the card's body. */
  explanations: Record<KindId, string>
}

export const englishText: SuggestionsText = {
  command: 'Suggest redactions',
  found: plural('en', 'count', {
    one: '{count} suggestion',
    other: '{count} suggestions',
  }),
  failed: 'Could not check this document.',
  mark: template('en', 'Suggested redaction: {reason}'),
  card: 'Suggested redaction',
  lowConfidence: 'Low confidence',
  mediumConfidence: 'Medium confidence',
  highConfidence: 'High confidence',
  accept: 'Accept',
  dismiss: 'Dismiss',
  reasons: {
    'ni-number': 'National Insurance number',
    email: 'Email address',
    phone: 'Phone number',
  },
  explanations: {
    'ni-number': 'Two letters, six digits and a final letter.',
    email: 'A customer’s email address.',
    phone: 'Eleven digits starting 07, like a UK mobile number.',
  },
}
