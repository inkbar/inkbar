/*
 * The handbook: a made-up field handbook of about sixteen pages for the outline and link
 * scenarios. It has a cover, a contents page whose lines are links, four chapters of sections
 * with cross references, a footnote and one web link, an appendix and an index whose page
 * numbers are links. Chapters are reached by named destinations and sections by explicit ones,
 * and the outline repeats both. The body is laid out first; the contents and the index are
 * written from the positions it records.
 */
import { PDFName, PDFNumber, PDFString, type PDFDocument, type PDFRef } from 'pdf-lib'

import {
  ACCENT,
  H,
  INK,
  MUTED,
  PAPER,
  RULE,
  SIDE,
  W,
  WHITE,
  HIGHLIGHTER,
  DOT,
  footer,
  header,
  newDocument,
  pdfRect,
  save,
  type Box,
  type Literal,
  type Sheet,
} from './layout.ts'

const TEAM = 'Harrow Vale Survey Team'
const WEB = 'https://inkbar.dev'
const SIZE = 12.5
const LEADING = 22
const WIDTH = W - SIDE * 2
/** Where the first line of a page's body sits, from the top. */
const START = 104
/** The lowest a body line may end; the footer sits below it. */
const BOTTOM = H - 76
const NOTE_HEIGHT = 34

interface Section {
  title: string
  blocks: Block[]
}
interface Chapter {
  title: string
  intro: string
  sections: Section[]
}
type Block = string | { list: string[] } | { callout: string }

/**
 * Body text. `{s:2.1}` is a link to a section, `{url}` the web link and `{fn}` the footnote
 * marker. Every name, place and address is made up.
 */
const CHAPTERS: Chapter[] = [
  {
    title: 'Before you go out',
    intro:
      'A survey is won or lost before anyone reaches the site. This chapter covers the evening before: the plan, the permission and the kit.',
    sections: [
      {
        title: 'Planning the day',
        blocks: [
          'Every job starts the evening before. Read the brief, find the site on the map and decide what the day must produce: a set of heights, a boundary pegged out, a check of last week’s work. Write that goal at the top of the day sheet in one line. If you cannot write it in one line, ring the office before you leave, because the crew will not be able to tell when they are finished.',
          'Look at the weather forecast for the whole shift, not just the morning. Wind makes a tripod drift, rain ruins a paper notebook and low sun behind the target washes out a prism. A job that needs a calm, dry day is better moved than rushed. The office can reschedule most visits with a day’s notice, whereas a half-finished survey costs far more to repair.',
          'Agree the roles before you arrive. One person runs the instrument, one holds the staff or the prism and one keeps the notebook, and the roles change at lunch so nobody’s eyes tire. Swap phone numbers with everyone on the crew and tell the office where you will be. Getting onto the site is covered separately (see {s:1.2}).',
          {
            callout:
              'One line for the goal, one forecast for the whole shift, one name against each role. If any of the three is missing, stay in the office.',
          },
        ],
      },
      {
        title: 'Permissions and access',
        blocks: [
          'Most of our sites belong to someone who is not the client. Before any visit, check that the landowner or their agent has agreed in writing, and keep a copy of the permission in the van. An email is enough; a verbal yes passed along by a neighbour is not. If the permission names a time window, treat it as a limit rather than a suggestion.',
          'Boundaries need extra care. Agree with the landowner where you may put in pegs and where you must use paint marks or a nail in the kerb instead. Never drive a peg into a verge, a drive or a lawn without asking, and photograph anything you disturb before you leave so the original state can be shown later.',
          'Leave gates as you found them. Park where you will not block a field entrance, switch on the hazard lights when working beside a road and carry the access sheet with the site contact on it. If someone challenges you, show your ID card and the permission, stay polite and call the office. The site contact can usually settle it in a minute.',
          'Keep a short log of who you spoke to on site and when. Names and times are what settle a disagreement a week later, long after everyone has forgotten the detail. Add the entry to the day sheet before you drive away, not that evening, and photograph the sheet with the rest of the notebook.',
        ],
      },
      {
        title: 'Packing the van',
        blocks: [
          'Load the van from the checklist in the appendix, not from memory. The kit is split into three crates: instruments, markers and paperwork. The instrument crate goes in last and comes out first, and it travels on the floor behind the passenger seat where it cannot slide. Tripods lie flat on the rack with the legs strapped.',
          'Check every battery before it goes in. Charge the instrument and radio batteries overnight and pack one spare of each. A flat radio on a long traverse means walking back to the instrument for every instruction. Bring a power bank for the data tablet too, and read the notes on looking after the instruments themselves (see {s:4.2}).',
          'Last, open the paperwork crate: spare notebooks, pencils, the site plan, the risk assessment and your copy of the permission. Sign the van sheet when you take the keys and again when you return them, with any fault noted. A scratch on the bodywork is forgiven; an unreported one is not.',
          {
            list: [
              'Instruments: level, total station, tripod, prism pole, staff',
              'Markers: pins, nails, pegs, paint, tapes, cones',
              'Paperwork: site plan, day sheet, permission, risk assessment',
              'Personal: waterproofs, gloves, water, high-visibility jacket',
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Setting out the site',
    intro:
      'Control comes first, heights second and detail last. Work in that order and each stage checks the one before it.',
    sections: [
      {
        title: 'Control points',
        blocks: [
          'Control points are the fixed marks the whole survey hangs from. Every measurement you take is relative to them, so they come first. Walk the site and find at least three marks that can see one another. Use existing marks where the plan lists them and check each against its neighbour before trusting it. A control point that has been knocked is worse than none, because it still looks reliable.',
          'Where the sky is open, a GNSS receiver can fix the first pair of points quickly. Under trees or beside tall buildings it drifts, so fall back to the instrument. When a site has no usable marks, set new ones: a steel pin in firm ground or a nail in a concrete slab, never in tarmac that will be resurfaced. Give each a number, sketch its surroundings and measure two tape distances to nearby fixed features so it can be found again.',
          'Check the geometry before you start. Control points that lie nearly in a straight line give weak fixes for anything off to the side. A triangle is better than a line, and a wide triangle better than a narrow one. If the site forces a poor shape, say so in the notebook and plan an extra check. Record the coordinates of each point the moment you establish it.',
          {
            list: [
              'Mark number and a sketch of where it sits',
              'Two tape ties to fixed features nearby',
              'The material it is set in and its condition',
              'The date, the weather and the initials of whoever set it',
            ],
          },
        ],
      },
      {
        title: 'Levelling',
        blocks: [
          'Levelling gives heights. Set the level roughly midway between two points, so that errors in the instrument tend to cancel, and read the staff at the first point (the backsight) and then at the second (the foresight). The difference is the rise or fall. Keep sights under fifty metres; beyond that the staff is too hard to read.',
          'Heights in this handbook are given above the local datum.{fn} Start every run from a known benchmark and finish on another, so that the run checks itself. A run that starts and ends on the same point proves very little, since a consistent mistake cancels out and leaves nothing to see.',
          'Hold the staff plumb. A staff leaning a few degrees reads high, and the error grows with the reading. Use the bubble on the staff and rock it gently towards and away from the instrument; the lowest reading is the true one. Read to the nearest millimetre and say each figure aloud as the booker writes it.',
          {
            callout:
              'Start on a benchmark, finish on a benchmark, keep the sights short and hold the staff plumb. Everything else in a levelling run is detail.',
          },
        ],
      },
      {
        title: 'Running a traverse',
        blocks: [
          'A traverse links control points with a chain of measured angles and distances. Use it where levelling is no help: to pick up a boundary, a building footprint or a track. Set the instrument over the first station, sight back to the previous point, then turn to the next and read the bearing and the distance.',
          'Centre the instrument with care. The tripod head should look level to the eye before you use the optical plummet, and the legs should be pressed firmly into the ground. Sight the prism by its centre, with the pole held upright. Read both faces of the instrument at every station and compare them; a gap of more than a few seconds means something has moved.',
          'Run the traverse round in a loop where you can, finishing at the point you started from, and work out the closure in the field before you pack up (see {s:3.2}). Closing on a different known point works too, but a loop is easier to check at the end of a long day.',
          'Keep the station list in the notebook in the order you occupied the points, with the instrument and target heights beside each. When a figure looks wrong at the end of the day, the list shows which station to go back to. Without it, the only remedy is to start again, which nobody wants at five o\u2019clock.',
        ],
      },
    ],
  },
  {
    title: 'Recording and checking',
    intro:
      'The measurements are only worth keeping if someone else can read them, check them and use them a year from now.',
    sections: [
      {
        title: 'Field notebooks',
        blocks: [
          'The notebook is the survey. Instruments fail and files vanish, but a clear page stays readable. Write in pencil, rule off after every station and never erase: a wrong figure is struck through with a single line and the right one written beside it. Date and sign each page, and note the weather, the instrument number and who held the staff.',
          'Number every sketch to match the point list. A page that says “peg by the gatepost” is useless in a year; one that says “P14, nail in concrete, 1.2 m north of the gatepost” can be found with a tape. Draw north on every sketch and write down the scale you meant.',
          'Photograph each notebook page at the end of the day and send the pictures to the office before you leave the site. It takes two minutes, and it means the day’s work survives a lost bag.',
          {
            list: [
              'The date, the job number and the weather',
              'The instrument number and the names of the crew',
              'A sketch with north arrow, scale and point numbers',
              'Initials against every corrected figure',
            ],
          },
        ],
      },
      {
        title: 'Closure and tolerance',
        blocks: [
          'Closure is the check that tells you whether the numbers can be trusted. A levelling run that starts and finishes on benchmarks should close to within a few millimetres, and a traverse that returns to its start should close to within the tolerance written on the job sheet. The difference you actually get is the misclosure.',
          'If the misclosure is inside the tolerance, spread it evenly along the run in proportion to its length and carry on. If it is outside, do not adjust anything. Look for the cause first: a mis-booked figure, a station that moved, a prism height left unchanged. Observe the suspect section again before you repeat the whole run.',
          'Write the misclosure and the tolerance on the page beside the run and initial both. When a result is borderline, tell the office instead of rounding it into compliance. A candid note about a marginal result is worth more than a clean one nobody can trust.',
          {
            callout:
              'Compute the misclosure on site. A check that waits until Monday cannot be fixed on Monday, because the crew has already left.',
          },
          'A table of the usual tolerances is pinned inside the lid of the paperwork crate. Levelling runs are held to a few millimetres per kilometre, traverse angles to a few seconds and traverse distances to a part in ten thousand. The job sheet may be stricter than the table, and when it is, the job sheet wins.',
        ],
      },
      {
        title: 'Handing over data',
        blocks: [
          'Back at the office the data is only as good as its labels. Name each file with the job number, the date and your initials, copy it to the shared drive before you leave the building and keep the original on the tablet until the office confirms it has arrived. Raw observations and adjusted coordinates go in separate folders.',
          'The coordinates sheet has one row per point: number, easting, northing, height and a short description. Use the codes in the templates rather than inventing your own, so that the drawing team can plot without guessing. The current templates are listed at {url}, with the newest version linked from the front page.',
          'Finish the handover with a short note: what was done, what was not and anything the office should check. If the access arrangements changed during the day, say so (see {s:1.2}).',
          {
            list: [
              'Job number, date and initials in every file name',
              'Raw observations in one folder, adjusted coordinates in another',
              'A copy on the shared drive before you leave the building',
              'The original kept on the tablet until the office confirms',
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Staying safe and caring for kit',
    intro:
      'Nothing on a survey is worth an injury, and nothing in the van is worth leaving to chance. Both come down to habits.',
    sections: [
      {
        title: 'Weather and hazards',
        blocks: [
          'Stop work when lightning is close. A tripod and a metal staff are the tallest things on an open site. Count the seconds between the flash and the thunder; under thirty, pack up and shelter in the van, never under a tree. Hot days bring sunburn and dehydration, so carry water and wear a hat, and in the cold keep spare gloves in the instrument crate.',
          'In fog or low light wear the high-visibility jacket and keep the radio on. Beside a road, set out the cones and signs shown in the risk assessment, and never let a person with a staff stand in a live lane. If you are not sure a spot is safe, it is not.',
          'Every site has hazards the plan does not show: overhead lines, open drains, livestock, loose ground at the edge of a cutting. Note what you find on the risk assessment, tell the crew and keep the first-aid kit in the van where everyone knows it is. Report any injury or near miss to the office the same day.',
          {
            list: [
              'Lightning within thirty seconds of its thunder',
              'Ice or standing water around the tripod feet',
              'A gust that moves the instrument on its legs',
              'Anyone on the crew feeling faint, cold or unwell',
            ],
          },
        ],
      },
      {
        title: 'Looking after instruments',
        blocks: [
          'The instruments are the most expensive things we carry and the easiest to harm. Carry them in their cases, never by the telescope, and check the tribrach clamps and the tripod legs for play each morning. Wipe a lens with the cloth only after you have blown the dust off, never with a sleeve.',
          'If an instrument gets wet, do not pack it wet. Dry the outside, leave the case open in the van with the heater running and let it warm gradually. Taking a cold instrument into a warm room invites condensation inside the optics, which is slow and costly to clear.',
          'Check the collimation of each level once a month with the two-peg test and enter the result in the instrument’s log. A level that fails the test goes to the workshop with a tag on it and does not go back in the van. Calibration records are inspected every year, and an empty log looks worse than a poor result.',
          'Never leave an instrument unattended on its tripod, even for a minute, even in a quiet field. Someone will walk into it, a gust will take it or livestock will rub against the legs. If you must step away, lift it off and put it back in its case. It takes thirty seconds, and a fall costs a month.',
          {
            callout:
              'Carry by the case, dry before packing, test each month and log every result. Kit that is treated this way is still accurate in ten years.',
          },
        ],
      },
    ],
  },
]

const APPENDIX: { title: string; items: string[] }[] = [
  {
    title: 'Instruments',
    items: [
      'Level, case and tripod',
      'Total station and tribrach',
      'Prism pole with spare prism',
      'Levelling staff, folded',
      'GNSS receiver and charger',
      'Radios, one per person',
    ],
  },
  {
    title: 'Markers',
    items: [
      'Steel pins and club hammer',
      'Masonry nails, a full box',
      'Marker paint and spare cap',
      'Wooden pegs, bundled',
      'Two tapes, 30 m and 5 m',
      'Cones and warning signs',
    ],
  },
  {
    title: 'Paperwork',
    items: [
      'Site plan and day sheet',
      'Copy of the permission',
      'Risk assessment, signed',
      'Spare notebooks and pencils',
      'Charged data tablet',
      'First-aid kit and ID cards',
    ],
  },
]

const TERMS = [
  'backsight',
  'battery',
  'bearing',
  'benchmark',
  'calibration',
  'checklist',
  'closure',
  'collimation',
  'condensation',
  'control point',
  'coordinates',
  'datum',
  'first-aid',
  'foresight',
  'GNSS',
  'hazard',
  'landowner',
  'lightning',
  'misclosure',
  'notebook',
  'peg',
  'permission',
  'plummet',
  'prism',
  'radio',
  'risk assessment',
  'sketch',
  'staff',
  'tape',
  'templates',
  'tolerance',
  'traverse',
  'tribrach',
  'tripod',
]

/** A place on a page: 0-based page index and distance from the top edge. */
interface Place {
  page: number
  top: number
}

type Target = { section: string } | { note: Place } | { url: string }

interface Pending {
  page: number
  box: Box
  target: Target
}

/** One styled piece of a word. */
interface Part {
  text: string
  size: number
  font: 'regular' | 'bold'
  kind: 'plain' | 'link' | 'note'
  target?: Target
}

/** The body, laid out top-down one line at a time. */
class Flow {
  readonly sheets: Sheet[] = []
  /** Everything drawn on each page, line breaks as spaces, for the index. */
  readonly texts: string[] = []
  readonly notes = new Map<number, number>()
  readonly links: Pending[] = []
  readonly sections = new Map<string, Place>()
  readonly chapters: Place[] = []
  y = START

  readonly #make: () => Sheet

  constructor(make: () => Sheet) {
    this.#make = make
  }

  get page(): number {
    return this.sheets.length - 1
  }

  get sheet(): Sheet {
    return this.sheets.at(-1)!
  }

  /** The lowest a line may go on this page: above its footnote when it has one. */
  get limit(): number {
    const note = this.notes.get(this.page)
    return note === undefined ? BOTTOM : note - 12
  }

  newPage(): void {
    this.sheets.push(this.#make())
    this.texts.push('')
    this.y = START
  }

  /** Starts a new page unless `height` still fits on this one. */
  ensure(height: number): void {
    if (this.page < 0 || this.y + height > this.limit) this.newPage()
  }

  note(text: string): void {
    this.texts[this.page] += ` ${text}`
  }

  /** Reserves the foot of the page for the footnote. */
  reserveNote(): void {
    if (this.notes.has(this.page)) return
    if (this.y + LEADING * 3 > BOTTOM - NOTE_HEIGHT - 12) this.newPage()
    this.notes.set(this.page, BOTTOM - NOTE_HEIGHT)
  }

  chapter(n: number, title: string, intro: string): void {
    this.newPage()
    this.chapters.push({ page: this.page, top: this.y })
    const s = this.sheet
    s.text(String(n), SIDE, this.y + 30, { size: 34, font: 'bold', color: ACCENT })
    s.text(title, SIDE + 42, this.y + 30, { size: 26, font: 'bold' })
    s.line(SIDE, this.y + 46, W - SIDE, this.y + 46, { color: RULE })
    this.note(title)
    this.y += 64
    this.text(intro, { italic: true })
  }

  section(num: string, title: string): void {
    this.ensure(LEADING * 4)
    if (this.y > START) this.y += 12
    this.sections.set(num, { page: this.page, top: this.y })
    this.sheet.text(`${num}   ${title}`, SIDE, this.y + 15, { size: 15, font: 'bold' })
    this.note(title)
    this.y += 32
  }

  /** A short boxed reminder: the point of the section in a sentence or two. */
  callout(text: string): void {
    const inner = WIDTH - 36
    let lines = 1
    let line = ''
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word
      if (line && this.sheet.width(next, 11, 'bold') > inner) {
        lines++
        line = word
      } else line = next
    }
    const height = lines * 17 + 26
    this.ensure(height + 12)
    this.sheet.rect(
      { x: SIDE, top: this.y + 4, w: WIDTH, h: height },
      { fill: PAPER, stroke: RULE, radius: 6 }
    )
    this.sheet.para(text, SIDE + 18, this.y + 4 + 13 + 11, inner, {
      size: 11,
      leading: 17,
      font: 'bold',
    })
    this.note(text)
    this.y += height + 18
  }

  /** A paragraph, wrapped to the measure, with its links recorded. */
  text(
    source: string,
    opts: { italic?: boolean; indent?: number; bullet?: boolean; footnote?: string } = {}
  ): void {
    const indent = opts.indent ?? 0
    const width = WIDTH - indent
    const font = opts.italic ? 'italic' : 'regular'
    const color = opts.italic ? MUTED : INK
    const s = () => this.sheet
    const space = s().width(' ', SIZE, font)
    if (source.includes('{fn}')) this.reserveNote()

    // Words are runs between spaces; a word holds its link and footnote parts.
    const words = source.split(' ').map((w) => this.#parts(w))
    const lines: Part[][][] = [[]]
    let used = 0
    for (const word of words) {
      const w = word.reduce((sum, p) => sum + this.#partWidth(p, font), 0)
      if (lines.at(-1)!.length > 0 && used + space + w > width) {
        lines.push([])
        used = 0
      }
      used += (lines.at(-1)!.length > 0 ? space : 0) + w
      lines.at(-1)!.push(word)
    }

    lines.forEach((line, i) => {
      this.ensure(LEADING)
      const sheet = s()
      const baseline = this.y + SIZE
      let x = SIDE + indent
      if (opts.bullet && i === 0)
        sheet.text('–', SIDE + indent - 14, baseline, { size: SIZE, color: MUTED })
      line.forEach((word, j) => {
        if (j > 0) x += space
        for (const p of word) {
          const pf = p.kind === 'plain' ? font : p.font
          const drawn = p.kind === 'note' ? baseline - 4 : baseline
          sheet.text(p.text, x, drawn, {
            size: p.size,
            font: pf,
            color: p.kind === 'plain' ? color : ACCENT,
          })
          const w = this.#partWidth(p, font)
          if (p.kind === 'link')
            sheet.line(x, baseline + 2, x + w, baseline + 2, {
              color: ACCENT,
              width: 0.5,
            })
          if (p.kind !== 'plain') {
            if (p.kind === 'note' && !this.notes.has(this.page))
              throw new Error('The footnote marker landed on a page without its note')
            this.links.push({
              page: this.page,
              box: {
                x,
                top: drawn - p.size,
                w,
                h: p.size + 5,
              },
              target:
                p.kind === 'note'
                  ? { note: { page: this.page, top: this.notes.get(this.page)! } }
                  : p.target!,
            })
          }
          x += w
        }
      })
      this.note(line.map((word) => word.map((p) => p.text).join('')).join(' '))
      this.y += LEADING
    })
    this.y += 7
  }

  #partWidth(p: Part, base: 'regular' | 'italic'): number {
    return this.sheet.width(p.text, p.size, p.kind === 'plain' ? base : p.font)
  }

  /** Splits a word on its `{...}` markers into styled parts. */
  #parts(word: string): Part[] {
    return word
      .split(/(\{[^}]+\})/)
      .filter(Boolean)
      .map((piece): Part => {
        const m = /^\{(s:([\d.]+)|url|fn)\}$/.exec(piece)
        if (!m) return { text: piece, size: SIZE, font: 'regular', kind: 'plain' }
        if (m[1] === 'fn')
          return { text: '1', size: SIZE * 0.65, font: 'bold', kind: 'note' }
        if (m[1] === 'url')
          return {
            text: 'inkbar.dev',
            size: SIZE,
            font: 'regular',
            kind: 'link',
            target: { url: WEB },
          }
        return {
          text: `section ${m[2]}`,
          size: SIZE,
          font: 'regular',
          kind: 'link',
          target: { section: m[2]! },
        }
      })
  }
}

/**
 * Dots from `left` to `right`, ending flush on the right. Measured one glyph at a time: the
 * font's kerning pair for a full stop and a space would make `width('. ')` shorter than the
 * viewer draws it, since pdf-lib's text operators apply no kerning.
 */
function leader(s: Sheet, left: number, right: number, baseline: number): void {
  const space = s.width(' ', 10)
  const unit = s.width('.', 10) + space
  const n = Math.floor((right - left + space) / unit)
  if (n < 1) return
  s.text('. '.repeat(n).trimEnd(), right - (n * unit - space), baseline, {
    size: 10,
    color: DOT,
  })
}

const escape = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The pages (0-based, body only) on which `term` appears, as a whole word or its plural. */
function pagesOf(texts: string[], term: string): number[] {
  const re = new RegExp(`(?<![\\w-])${escape(term)}(?:e?s)?(?![\\w-])`, 'i')
  return texts.flatMap((t, i) => (re.test(t) ? [i] : []))
}

interface OutlineItem {
  title: string
  to: Literal
  /** PDF outline item flags: 1 italic, 2 bold. */
  flags?: number
  children?: OutlineItem[]
  /** Collapsed at first: written as a negative /Count. */
  closed?: boolean
}

/** Registers `items` as one level of an outline under `parent`; returns its ends and open count. */
function outlineLevel(
  ctx: PDFDocument['context'],
  parent: PDFRef,
  items: OutlineItem[]
): { first: PDFRef; last: PDFRef; visible: number } {
  const refs = items.map(() => ctx.nextRef())
  let visible = items.length
  items.forEach((item, i) => {
    const dict = ctx.obj({
      Title: PDFString.of(item.title),
      Parent: parent,
      Dest: item.to,
      ...(item.flags ? { F: item.flags } : {}),
    })
    if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]!)
    if (i < items.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]!)
    if (item.children) {
      const sub = outlineLevel(ctx, refs[i]!, item.children)
      dict.set(PDFName.of('First'), sub.first)
      dict.set(PDFName.of('Last'), sub.last)
      dict.set(
        PDFName.of('Count'),
        PDFNumber.of(item.closed ? -sub.visible : sub.visible)
      )
      if (!item.closed) visible += sub.visible
    }
    ctx.assign(refs[i]!, dict)
  })
  return { first: refs[0]!, last: refs[refs.length - 1]!, visible }
}

/** An explicit /XYZ destination at the top of a heading, leaving the left edge and zoom alone. */
const xyz = (ref: PDFRef, place: Place): Literal =>
  [ref, 'XYZ', null, H - place.top, null] as unknown as Literal

/** Chapters, then sections; the third chapter starts closed, "Index" is bold and "Appendix" italic. */
function writeOutline(
  d: PDFDocument,
  flow: Flow,
  refOf: (page: number) => PDFRef,
  appendix: Place,
  indexPage: number
): void {
  const ctx = d.context
  const root = ctx.nextRef()
  const top = outlineLevel(ctx, root, [
    ...CHAPTERS.map((chapter, c): OutlineItem => ({
      title: `${c + 1}. ${chapter.title}`,
      // Chapters go by name, sections by explicit destination.
      to: PDFString.of(`chapter-${c + 1}`) as unknown as Literal,
      closed: c === 2,
      children: chapter.sections.map((section, i) => ({
        title: `${c + 1}.${i + 1} ${section.title}`,
        to: xyz(
          refOf(flow.sections.get(`${c + 1}.${i + 1}`)!.page),
          flow.sections.get(`${c + 1}.${i + 1}`)!
        ),
      })),
    })),
    {
      title: 'Appendix: kit checklist',
      to: xyz(refOf(appendix.page), appendix),
      flags: 1,
    },
    { title: 'Index', to: xyz(refOf(indexPage), { page: indexPage, top: 0 }), flags: 2 },
  ])
  ctx.assign(
    root,
    ctx.obj({ Type: 'Outlines', First: top.first, Last: top.last, Count: top.visible })
  )
  d.catalog.set(PDFName.of('Outlines'), root)
}

/** The chapters' names in the catalog's /Names /Dests tree, sorted as a name tree requires. */
function writeNames(d: PDFDocument, flow: Flow, refOf: (page: number) => PDFRef): void {
  const names = flow.chapters.flatMap((place, c) => [
    PDFString.of(`chapter-${c + 1}`),
    d.context.obj(xyz(refOf(place.page), place)),
  ])
  d.catalog.set(PDFName.of('Names'), d.context.obj({ Dests: { Names: names } }))
}

export async function makeHandbook(): Promise<Uint8Array> {
  const { d, sheet } = await newDocument('Field handbook')
  const ctx = d.context
  const make = sheet

  // The cover and the contents are laid out last but occupy pages 1 and 2.
  const cover = make()
  const contents = make()

  const flow = new Flow(make)
  CHAPTERS.forEach((chapter, c) => {
    flow.chapter(c + 1, chapter.title, chapter.intro)
    chapter.sections.forEach((section, i) => {
      flow.section(`${c + 1}.${i + 1}`, section.title)
      for (const block of section.blocks) {
        if (typeof block === 'string') flow.text(block)
        else if ('callout' in block) flow.callout(block.callout)
        else for (const item of block.list) flow.text(item, { indent: 18, bullet: true })
      }
    })
  })

  // The appendix: a checklist in three columns, each box a square to tick.
  flow.newPage()
  const appendix: Place = { page: flow.page, top: flow.y }
  const as = flow.sheet
  as.text('Appendix: kit checklist', SIDE, flow.y + 28, { size: 26, font: 'bold' })
  as.line(SIDE, flow.y + 46, W - SIDE, flow.y + 46, { color: RULE })
  flow.note('Appendix kit checklist')
  as.para(
    'Tick each item as it goes into the van, and again as it comes out. The person who signs the van sheet checks the list.',
    SIDE,
    flow.y + 74,
    WIDTH,
    { size: SIZE, leading: LEADING, font: 'italic', color: MUTED }
  )
  const col = (WIDTH - 40) / 3
  APPENDIX.forEach((group, i) => {
    const x = SIDE + i * (col + 20)
    as.text(group.title, x, flow.y + 142, { size: 14, font: 'bold' })
    group.items.forEach((item, j) => {
      const base = flow.y + 176 + j * 30
      as.rect(
        { x, top: base - 10, w: 11, h: 11 },
        { stroke: INK, strokeWidth: 0.9, radius: 2 }
      )
      as.text(item, x + 20, base, { size: 10.5 })
      flow.note(item)
    })
  })

  // The index page comes after the body, so every body page number is known.
  const indexSheet = make()
  const indexPage = d.getPageCount() - 1
  const total = d.getPageCount()
  const refOf = (page: number): PDFRef => d.getPage(page).ref
  const destAt = (place: Place): Literal =>
    [refOf(place.page + 2), 'XYZ', null, H - place.top, null] as unknown as Literal

  // Cover.
  header(cover, true, 'Edition 4')
  cover.rect({ x: SIDE, top: 190, w: WIDTH, h: 320 }, { fill: INK, radius: 14 })
  cover.text('Field handbook', SIDE + 36, 330, { size: 46, font: 'bold', color: WHITE })
  cover.rect({ x: SIDE + 36, top: 348, w: 150, h: 9 }, { fill: HIGHLIGHTER })
  cover.para(
    'How we plan a visit, set out a site, record the work and look after each other and the kit.',
    SIDE + 36,
    400,
    WIDTH - 140,
    { size: 14, leading: 21, color: PAPER }
  )
  cover.text(TEAM, SIDE, 570, { size: 15, font: 'bold' })
  cover.text('Working notes for the crew. Keep a copy in the van.', SIDE, 592, {
    size: 11,
    color: MUTED,
  })
  cover.text('field@example.com', SIDE, H - 42, { size: 9.75, color: MUTED })

  const chapterName = (n: number): string => `chapter-${n}`

  const pages: PDFRef[] = Array.from({ length: total }, (_, i) => refOf(i))
  const annots = new Map<number, PDFRef[]>()
  const add = (page: number, ref: PDFRef): void => {
    annots.set(page, [...(annots.get(page) ?? []), ref])
  }
  const linkAnnot = (page: number, box: Box, fields: Literal): void =>
    add(
      page,
      ctx.register(
        ctx.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: pdfRect(box),
          Border: [0, 0, 0],
          F: 4,
          ...fields,
        })
      )
    )

  // Contents.
  header(contents, false, 'Field handbook')
  contents.text('Contents', SIDE, 126, { size: 30, font: 'bold' })
  contents.line(SIDE, 142, W - SIDE, 142, { color: RULE })
  let top = 168
  const entry = (
    label: string,
    title: string,
    place: Place,
    opts: { section: boolean; name?: string }
  ): void => {
    const pageNo = String(place.page + 3)
    const baseline = top + 15
    const labelX = opts.section ? SIDE + 22 : SIDE
    const titleX = labelX + (opts.section ? 32 : 28)
    const font = opts.section ? 'regular' : 'bold'
    const size = opts.section ? 11 : 12.5
    contents.text(label, labelX, baseline, {
      size,
      font,
      color: opts.section ? MUTED : ACCENT,
    })
    contents.text(title, titleX, baseline, { size, font })
    const end = titleX + contents.width(title, size, font) + 8
    const numWidth = contents.width(pageNo, size, font)
    leader(contents, end, W - SIDE - numWidth - 8, baseline)
    contents.text(pageNo, W - SIDE, baseline, { size, font, align: 'right' })
    const box = { x: SIDE, top: top + 1, w: WIDTH, h: size + 9 }
    linkAnnot(
      1,
      box,
      opts.name
        ? { Dest: PDFString.of(opts.name) }
        : { Dest: destAt({ page: place.page, top: place.top }) }
    )
    top += opts.section ? 24 : 34
  }
  CHAPTERS.forEach((chapter, c) => {
    if (c > 0) top += 4
    entry(String(c + 1), chapter.title, flow.chapters[c]!, {
      section: false,
      name: chapterName(c + 1),
    })
    chapter.sections.forEach((section, i) =>
      entry(`${c + 1}.${i + 1}`, section.title, flow.sections.get(`${c + 1}.${i + 1}`)!, {
        section: true,
      })
    )
  })
  top += 4
  entry('', 'Appendix: kit checklist', appendix, { section: false })
  entry('', 'Index', { page: indexPage - 2, top: 0 }, { section: false })

  // Index.
  header(indexSheet, false, 'Field handbook')
  indexSheet.text('Index', SIDE, 126, { size: 30, font: 'bold' })
  indexSheet.line(SIDE, 142, W - SIDE, 142, { color: RULE })
  const terms = [...TERMS].sort((a, b) => a.localeCompare(b, 'en'))
  const half = Math.ceil(terms.length / 2)
  const colWidth = (WIDTH - 36) / 2
  terms.forEach((term, i) => {
    const found = pagesOf(flow.texts, term).slice(0, 4)
    if (found.length === 0) throw new Error(`The index term “${term}” is not in the body`)
    const x = SIDE + Math.floor(i / half) * (colWidth + 36)
    const baseline = 176 + (i % half) * 36
    const right = x + colWidth
    indexSheet.text(term, x, baseline, { size: 11.5 })
    // Page numbers from the right, each its own link, separated by commas.
    let nx = right
    for (let k = found.length - 1; k >= 0; k--) {
      const label = String(found[k]! + 3)
      const w = indexSheet.width(label, 11.5)
      nx -= w
      indexSheet.text(label, nx, baseline, { size: 11.5, color: ACCENT })
      indexSheet.line(nx, baseline + 2, nx + w, baseline + 2, {
        color: ACCENT,
        width: 0.5,
      })
      linkAnnot(
        indexPage,
        { x: nx - 1, top: baseline - 11, w: w + 2, h: 16 },
        { Dest: [pages[found[k]! + 2]!, 'XYZ', null, H, null] }
      )
      if (k > 0) {
        nx -= indexSheet.width(', ', 11.5)
        indexSheet.text(',', nx, baseline, { size: 11.5, color: MUTED })
      }
    }
    leader(indexSheet, x + indexSheet.width(term, 11.5) + 8, nx - 6, baseline)
  })

  // Body links, now every heading has a place.
  for (const link of flow.links) {
    const page = link.page + 2
    const t = link.target
    if ('url' in t) {
      linkAnnot(page, link.box, { A: { S: 'URI', URI: PDFString.of(t.url) } })
    } else if ('note' in t) {
      linkAnnot(page, link.box, { Dest: destAt(t.note) })
    } else {
      const place = flow.sections.get(t.section)
      if (!place) throw new Error(`No section ${t.section} to link to`)
      linkAnnot(page, link.box, { Dest: destAt(place) })
    }
  }

  // The footnote itself, at the foot of its page.
  for (const [page, noteTop] of flow.notes) {
    const s = flow.sheets[page]!
    s.line(SIDE, noteTop, SIDE + 120, noteTop, { color: RULE })
    s.text('1', SIDE, noteTop + 14, { size: 7, font: 'bold', color: ACCENT })
    s.para(
      'The local datum is the brass bolt in the yard wall at Harrow Vale. Every height here is measured from it, not from sea level.',
      SIDE + 8,
      noteTop + 14,
      WIDTH - 8,
      { size: 9.5, leading: 13, color: MUTED }
    )
  }

  // Footers on every page but the cover.
  d.getPages().forEach((_, i) => {
    if (i === 0) return
    const s = i === 1 ? contents : i === total - 1 ? indexSheet : flow.sheets[i - 2]!
    if (i > 1 && i < total - 1) header(s, false, 'Field handbook')
    footer(s, i + 1, total, TEAM)
  })

  for (const [page, refs] of annots)
    d.getPage(page).node.set(PDFName.of('Annots'), ctx.obj(refs))

  writeOutline(d, flow, (page) => pages[page + 2]!, appendix, indexPage - 2)
  writeNames(d, flow, (page) => pages[page + 2]!)
  return save(d)
}
