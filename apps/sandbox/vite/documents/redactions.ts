/*
 * The redactions document: one page of three customer records holding the personal data the
 * Suggest redactions plugin looks for. Every value is made up: `QQ` National Insurance prefixes
 * are never issued, the phone numbers are in Ofcom's drama range and the domain is
 * `example.com`.
 */
import {
  MUTED,
  PAPER,
  RULE,
  SIDE,
  W,
  boxTitle,
  footer,
  header,
  newDocument,
  save,
} from './layout.ts'

export interface CustomerRecord {
  ref: string
  name: string
  since: string
  /** National Insurance numbers; a record may have none. */
  ni: string[]
  emails: string[]
  phones: string[]
  address: string
  plan: string
  /** The call note under the record. It repeats some of the values above. */
  note: string
}

const RECORDS: readonly CustomerRecord[] = [
  {
    ref: 'C-30918',
    name: 'Margaret Okafor',
    since: 'March 2019',
    ni: ['QQ123456C'],
    emails: ['m.okafor@example.com'],
    phones: ['07700 900123'],
    address: '41 Station Road, Hebden Bridge HX7 8AD',
    plan: 'Household, billed monthly',
    note: 'Called on 2 October about a duplicate charge. Refund agreed; confirmation sent to m.okafor@example.com.',
  },
  {
    ref: 'C-31207',
    name: 'Daniel Price',
    since: 'August 2021',
    ni: ['QQ654321A'],
    emails: ['dan.price@example.com'],
    phones: ['07700 900456'],
    address: '9 Mill Close, Ilkley LS29 9QT',
    plan: 'Household, billed quarterly',
    note: 'Moving house in December. Asked us to call 07700 900456 first, then send the final bill to dan.price@example.com.',
  },
  {
    ref: 'C-32550',
    name: 'Aisha Rahman',
    since: 'January 2024',
    ni: [],
    emails: ['aisha.rahman@example.com'],
    phones: ['07700 900789'],
    address: 'Flat 12, 3 Canal Wharf, Leeds LS11 5PS',
    plan: 'Business, billed monthly',
    note: 'Wants invoices addressed to the business, not to Aisha Rahman. Updated the account on 14 October.',
  },
]

/** The records the document draws, in page order. */
export function redactionRecords(): readonly CustomerRecord[] {
  return RECORDS
}

export async function makeRedactions(): Promise<Uint8Array> {
  const { d, sheet } = await newDocument('Customer records')
  const s = sheet()
  header(s, false, 'Customer records')

  const x = SIDE
  const w = W - SIDE * 2
  const pad = 14
  let top = 80
  for (const record of RECORDS) {
    const fields: [string, string][] = [
      ['Name', record.name],
      ['Customer since', record.since],
      ...record.ni.map((n): [string, string] => ['NI number', n]),
      ...record.emails.map((e): [string, string] => ['Email', e]),
      ...record.phones.map((p): [string, string] => ['Phone', p]),
      ['Address', record.address],
      ['Plan', record.plan],
    ]
    const h = pad * 2 + 18 + fields.length * 18 + 40
    s.rect({ x, top, w, h }, { fill: PAPER, stroke: RULE, radius: 7.5 })
    const inner = { x: x + pad, top: top + pad, w: w - pad * 2, h: h - pad * 2 }
    boxTitle(s, inner, 'Customer record', `Ref ${record.ref}`, true)
    let y = inner.top + 16
    fields.forEach(([label, value], i) => {
      s.text(label, inner.x, y + 13, { size: 10.5, color: MUTED })
      s.text(value, inner.x + 110, y + 13, { size: 10.5 })
      y += 18
      if (i < fields.length - 1) s.line(inner.x, y, inner.x + inner.w, y)
    })
    s.para(record.note, inner.x, y + 22, inner.w, { size: 10.5, leading: 15 })
    top += h + 14
  }

  footer(s, 1, 1, 'Fictional records for the Inkbar sandbox')
  return save(d)
}
