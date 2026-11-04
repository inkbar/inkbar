/*
 * The letter: one page of plain text with no annotations and no form, for highlighting and
 * notes. The landlord, tenant and addresses are made up.
 */
import { MUTED, SIDE, W, newDocument, save } from './layout.ts'

const SENDER = [
  'Harbour Lane Ltd',
  '14 Harbour Lane',
  'Leeds LS1 4AB',
  'lettings@example.com',
  '07700 900417',
]

const RECIPIENT = ['Joseph Mensah', 'Flat 3, 22 Kirkgate', 'Leeds LS2 7DJ']

const BODY = [
  'Dear Mr Mensah,',
  'Your tenancy of Flat 3, 22 Kirkgate renews on 1 January 2027. This letter sets out what changes and what you need to do before then.',
  'The monthly rent stays at £975. Your deposit remains with the deposit scheme under the same reference, and you do not need to pay anything more into it.',
  'We will inspect the flat on Tuesday 8 December between 10am and noon. The inspection covers the smoke alarms, the boiler and the condition of the kitchen and bathroom. You do not need to be at home, but please tell us by 1 December if you would rather we came on another day.',
  'The boiler service is booked for the same visit. The engineer will need about forty minutes and access to the airing cupboard.',
  'If you plan to leave at the end of the term, please give us two months’ notice in writing. A short email to the address above is enough.',
  'If anything in this letter is unclear, call or email us and we will go through it with you.',
  'Yours sincerely,',
]

export async function makeLetter(): Promise<Uint8Array> {
  const { d, sheet } = await newDocument('Tenancy renewal letter')
  const s = sheet()
  const width = W - SIDE * 2

  let y = 72
  s.text(SENDER[0]!, W - SIDE, y, { size: 13.5, font: 'bold', align: 'right' })
  for (const line of SENDER.slice(1)) {
    y += 15
    s.text(line, W - SIDE, y, { size: 10.5, color: MUTED, align: 'right' })
  }

  y += 48
  for (const line of RECIPIENT) {
    s.text(line, SIDE, y, { size: 11 })
    y += 15
  }
  y += 24
  s.text('20 October 2026', SIDE, y, { size: 11 })

  y += 36
  s.text('Your tenancy renewal', SIDE, y, { size: 13.5, font: 'bold' })
  y += 30
  const body = { size: 11, leading: 17 }
  for (const para of BODY) y = s.para(para, SIDE, y, width, body) + 10

  y += 30
  s.text('Priya Shah', SIDE, y, { size: 11 })
  s.text('Lettings manager, Harbour Lane Ltd', SIDE, y + 16, { size: 11, color: MUTED })
  return save(d)
}
