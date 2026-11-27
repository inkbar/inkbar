var e={html:`<pre class="shiki inkbar-ink" style="background-color:#0D1026;color:#C9CEE6" tabindex="0"><code><span class="line"><span style="color:#A9AFCB">/*</span></span>
<span class="line"><span style="color:#A9AFCB"> * The words of the Suggest redactions plugin, English by default. A host in another language</span></span>
<span class="line"><span style="color:#A9AFCB"> * passes its own through the plugin's \`text\` option. They sit in a file of their own so a host</span></span>
<span class="line"><span style="color:#A9AFCB"> * can import them without the plugin.</span></span>
<span class="line"><span style="color:#A9AFCB"> */</span></span>
<span class="line"><span style="color:#9DABFF">import</span><span style="color:#C9CEE6"> { plural, template, </span><span style="color:#9DABFF">type</span><span style="color:#C9CEE6"> MessageFn } </span><span style="color:#9DABFF">from</span><span style="color:#E4FF4A"> '@inkbar/core'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/** The kinds of personal data Suggest looks for. */</span></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> type</span><span style="color:#FFFFFF"> KindId</span><span style="color:#9DABFF"> =</span><span style="color:#E4FF4A"> 'ni-number'</span><span style="color:#9DABFF"> |</span><span style="color:#E4FF4A"> 'email'</span><span style="color:#9DABFF"> |</span><span style="color:#E4FF4A"> 'phone'</span></span>
<span class="line"></span>
<span class="line"><span style="color:#A9AFCB">/** Every word the plugin shows. */</span></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> interface</span><span style="color:#FFFFFF"> SuggestionsText</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#A9AFCB">  /** The command's button. */</span></span>
<span class="line"><span style="color:#C9CEE6">  command</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#A9AFCB">  /** The command's status after a run. */</span></span>
<span class="line"><span style="color:#C9CEE6">  found</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> MessageFn</span><span style="color:#C9CEE6">&#x3C;{ count</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> number }></span></span>
<span class="line"><span style="color:#A9AFCB">  /** The command's status when a run fails. */</span></span>
<span class="line"><span style="color:#C9CEE6">  failed</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#A9AFCB">  /** A mark's accessible name. */</span></span>
<span class="line"><span style="color:#C9CEE6">  mark</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> MessageFn</span><span style="color:#C9CEE6">&#x3C;{ reason</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string }></span></span>
<span class="line"><span style="color:#A9AFCB">  /** The card's accessible name. */</span></span>
<span class="line"><span style="color:#C9CEE6">  card</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#C9CEE6">  lowConfidence</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#C9CEE6">  mediumConfidence</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#C9CEE6">  highConfidence</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#C9CEE6">  accept</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#C9CEE6">  dismiss</span><span style="color:#9DABFF">:</span><span style="color:#C9CEE6"> string</span></span>
<span class="line"><span style="color:#A9AFCB">  /** Each kind's name, the card's title. */</span></span>
<span class="line"><span style="color:#C9CEE6">  reasons</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Record</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">KindId</span><span style="color:#C9CEE6">, string></span></span>
<span class="line"><span style="color:#A9AFCB">  /** Each kind's explanation, the card's body. */</span></span>
<span class="line"><span style="color:#C9CEE6">  explanations</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> Record</span><span style="color:#C9CEE6">&#x3C;</span><span style="color:#FFFFFF">KindId</span><span style="color:#C9CEE6">, string></span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span>
<span class="line"><span style="color:#9DABFF">export</span><span style="color:#9DABFF"> const</span><span style="color:#C9CEE6"> englishText</span><span style="color:#9DABFF">:</span><span style="color:#FFFFFF"> SuggestionsText</span><span style="color:#9DABFF"> =</span><span style="color:#C9CEE6"> {</span></span>
<span class="line"><span style="color:#C9CEE6">  command: </span><span style="color:#E4FF4A">'Suggest redactions'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  found: </span><span style="color:#FFFFFF">plural</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'en'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'count'</span><span style="color:#C9CEE6">, {</span></span>
<span class="line"><span style="color:#C9CEE6">    one: </span><span style="color:#E4FF4A">'{count} suggestion'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    other: </span><span style="color:#E4FF4A">'{count} suggestions'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  }),</span></span>
<span class="line"><span style="color:#C9CEE6">  failed: </span><span style="color:#E4FF4A">'Could not check this document.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  mark: </span><span style="color:#FFFFFF">template</span><span style="color:#C9CEE6">(</span><span style="color:#E4FF4A">'en'</span><span style="color:#C9CEE6">, </span><span style="color:#E4FF4A">'Suggested redaction: {reason}'</span><span style="color:#C9CEE6">),</span></span>
<span class="line"><span style="color:#C9CEE6">  card: </span><span style="color:#E4FF4A">'Suggested redaction'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  lowConfidence: </span><span style="color:#E4FF4A">'Low confidence'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  mediumConfidence: </span><span style="color:#E4FF4A">'Medium confidence'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  highConfidence: </span><span style="color:#E4FF4A">'High confidence'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  accept: </span><span style="color:#E4FF4A">'Accept'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  dismiss: </span><span style="color:#E4FF4A">'Dismiss'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  reasons: {</span></span>
<span class="line"><span style="color:#E4FF4A">    'ni-number'</span><span style="color:#C9CEE6">: </span><span style="color:#E4FF4A">'National Insurance number'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    email: </span><span style="color:#E4FF4A">'Email address'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    phone: </span><span style="color:#E4FF4A">'Phone number'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  },</span></span>
<span class="line"><span style="color:#C9CEE6">  explanations: {</span></span>
<span class="line"><span style="color:#E4FF4A">    'ni-number'</span><span style="color:#C9CEE6">: </span><span style="color:#E4FF4A">'Two letters, six digits and a final letter.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    email: </span><span style="color:#E4FF4A">'A customer’s email address.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">    phone: </span><span style="color:#E4FF4A">'Eleven digits starting 07, like a UK mobile number.'</span><span style="color:#C9CEE6">,</span></span>
<span class="line"><span style="color:#C9CEE6">  },</span></span>
<span class="line"><span style="color:#C9CEE6">}</span></span>
<span class="line"></span></code></pre>`,code:`/*
 * The words of the Suggest redactions plugin, English by default. A host in another language
 * passes its own through the plugin's \`text\` option. They sit in a file of their own so a host
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
`};export{e as default};