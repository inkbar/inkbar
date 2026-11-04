/*
 * The form document: two pages holding every field and script of the form fixtures in
 * fixtures/generate.ts (`form-fields` and `form-scripted`), under the same names, so a test or a
 * tester can reach for the same field in either. Among them are the choice lists `country` and
 * `city`, and the `send` button's submit-form action. The rows draw the fields; `finishForm`
 * then writes what pdf-lib has no helper for.
 */
import {
  PDFDict,
  PDFHexString,
  PDFName,
  PDFString,
  degrees,
  type PDFContext,
  type PDFDocument,
  type PDFField,
  type PDFForm,
  type PDFPage,
  type PDFRadioGroup,
} from 'pdf-lib'

import {
  H,
  INK,
  MUTED,
  WHITE,
  boxTitle,
  featurePage,
  hex,
  newDocument,
  save,
  type Box,
  type Fonts,
  type Row,
  type Sheet,
} from './layout.ts'

const FIELD_H = 17
const FIELD_PITCH = 34
const FIELD_BORDER = hex('#8A8FA8')
const HELV = '/Helv 10 Tf 0 g'

/** A field's rectangle as pdf-lib takes it, from a top-down box. */
function at(x: number, top: number, w: number, h = FIELD_H) {
  return { x, y: H - top - h, width: w, height: h }
}

/** A PDF literal string with `\`, `(` and `)` escaped; UTF-16 hex when the text is not ASCII. */
function pdfText(value: string): PDFString | PDFHexString {
  return /^[\x20-\x7e]*$/.test(value)
    ? PDFString.of(value.replace(/[\\()]/g, (c) => `\\${c}`))
    : PDFHexString.fromText(value)
}

function js(ctx: PDFContext, code: string): PDFDict {
  return ctx.obj({ S: 'JavaScript', JS: pdfText(code) })
}

function widgetDict(field: PDFField, i = 0): PDFDict {
  const w = field.acroField.getWidgets()[i]
  if (!w) throw new Error(`${field.getName()} has no widget ${i}`)
  return w.dict
}

/** Sets /DA on the field and drops any copy pdf-lib wrote on its widgets. */
function setDA(field: PDFField, da: string): void {
  field.acroField.dict.set(PDFName.of('DA'), PDFString.of(da))
  for (const w of field.acroField.getWidgets()) w.dict.delete(PDFName.of('DA'))
}

/** pdf-lib names radio on-states 0, 1, …; this renames them and drops the /Opt it wrote. */
function nameRadioStates(radio: PDFRadioGroup, states: string[], value: string): void {
  radio.acroField.getWidgets().forEach((w, i) => {
    const ap = w.dict.lookup(PDFName.of('AP'), PDFDict)
    for (const key of ['N', 'D']) {
      const sub = ap.lookupMaybe(PDFName.of(key), PDFDict)
      const stream = sub?.get(PDFName.of(String(i)))
      if (!sub || !stream) continue
      sub.delete(PDFName.of(String(i)))
      sub.set(PDFName.of(states[i]!), stream)
    }
    w.dict.set(PDFName.of('AS'), PDFName.of(states[i] === value ? value : 'Off'))
  })
  radio.acroField.dict.delete(PDFName.of('Opt'))
  radio.acroField.dict.set(PDFName.of('V'), PDFName.of(value))
}

/**
 * pdf-lib registers each new non-terminal twice and keeps one, leaving an unreferenced copy
 * in the file. This deletes the copy so the file holds one `header` dictionary.
 */
function dropDuplicateParent(d: PDFDocument, field: PDFField): void {
  const parent = field.acroField.dict.get(PDFName.of('Parent'))
  const t = field.acroField.dict
    .lookup(PDFName.of('Parent'), PDFDict)
    .get(PDFName.of('T'))
  for (const [r, o] of d.context.enumerateIndirectObjects()) {
    if (r !== parent && o instanceof PDFDict && o.get(PDFName.of('T')) === t)
      d.context.delete(r)
  }
}

/** An empty signature field: pdf-lib has no helper for one. */
function signatureField(form: PDFForm, page: PDFPage, name: string, box: Box): void {
  const ctx = page.doc.context
  const ref = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      F: 4,
      FT: 'Sig',
      T: PDFString.of(name),
      P: page.ref,
      Rect: [box.x, H - box.top - box.h, box.x + box.w, H - box.top],
      MK: { BC: [0.541, 0.561, 0.659] },
    })
  )
  form.acroForm.addField(ref)
  page.node.addAnnot(ref)
}

/** The form's rows: one page of every field type and flag, one of scripts and actions. */
export function formRows(
  d: PDFDocument,
  fonts: Fonts
): { fields: Row[]; scripted: Row[] } {
  const form = d.getForm()
  const look = {
    font: fonts.regular,
    borderColor: FIELD_BORDER,
    borderWidth: 0.75,
    backgroundColor: WHITE,
    textColor: INK,
  }
  const label = (s: Sheet, text: string, x: number, top: number): void =>
    s.text(text, x, top - 4, { size: 9, color: MUTED })
  /** Fields go in two columns, one row every FIELD_PITCH below the box title. */
  const grid = (b: Box) => {
    const w = (b.w - 14) / 2
    return {
      w,
      left: b.x,
      right: b.x + w + 14,
      top: (i: number) => b.top + FIELD_PITCH + i * FIELD_PITCH,
    }
  }
  const text = (
    s: Sheet,
    name: string,
    caption: string,
    box: { x: number; top: number; w: number; h?: number }
  ) => {
    const f = form.createTextField(name)
    f.addToPage(s.page, { ...at(box.x, box.top, box.w, box.h), ...look })
    f.setFontSize(10)
    label(s, caption, box.x, box.top)
    return f
  }
  /** A checkbox or radio button with its text to the right. */
  const beside = (s: Sheet, text: string, x: number, top: number): void =>
    s.text(text, x + 18, top + 9.5, { size: 10.5 })

  const textFields: Row = {
    weight: 1.05,
    title: 'Text fields',
    body: 'Single-line, multiline, password and comb fields, with a maximum length, auto-size text, and read-only, required and no-export flags.',
    tryIt: 'Try it: type your name, then press Tab to move through the form.',
    demo(s, b) {
      boxTitle(s, b, 'Club membership')
      const g = grid(b)
      const name = text(s, 'name', 'Full name', { x: g.left, top: g.top(0), w: g.w })
      name.setText('Sam Carter')
      name.setAlignment(0)
      text(s, 'email', 'Email (required)', {
        x: g.right,
        top: g.top(0),
        w: g.w,
      }).enableRequired()
      const pin = text(s, 'pin', 'PIN', { x: g.left, top: g.top(1), w: 44 })
      pin.enablePassword()
      pin.setMaxLength(4)
      const code = text(s, 'code', 'Code (comb)', {
        x: g.left + 56,
        top: g.top(1),
        w: g.w - 56,
      })
      code.setMaxLength(6)
      code.enableCombing()
      const locked = text(s, 'locked', 'Member no. (read-only)', {
        x: g.right,
        top: g.top(1),
        w: g.w,
      })
      locked.setText('M-0042')
      locked.enableReadOnly()
      text(s, 'auto', 'Nickname (auto size)', { x: g.left, top: g.top(2), w: g.w })
      const internal = text(s, 'internal', 'Office use (no export)', {
        x: g.right,
        top: g.top(2),
        w: g.w,
      })
      internal.setText('Batch 7')
      internal.disableExporting()
      text(s, 'styled', 'Boat name (Times bold)', { x: g.left, top: g.top(3), w: g.w })
      const notes = text(s, 'notes', 'Notes (multiline)', {
        x: g.right,
        top: g.top(3),
        w: g.w,
        h: 30,
      })
      notes.enableMultiline()
      notes.setAlignment(1)
    },
  }

  const choices: Row = {
    weight: 1,
    title: 'Choices',
    body: 'Checkboxes, radio buttons, drop-downs and lists. A drop-down can take typed text, and a list can hold several picks.',
    tryIt: 'Try it: pick yearly, then choose two interests.',
    demo(s, b) {
      boxTitle(s, b, 'Preferences')
      const g = grid(b)
      const tick = { ...look, width: 12, height: 12 }
      const box = (x: number, top: number) => ({ ...tick, ...at(x, top + 2, 12, 12) })

      label(s, 'Rules', g.left, g.top(0))
      form.createCheckBox('agree').addToPage(s.page, box(g.left, g.top(0)))
      beside(s, 'I agree', g.left, g.top(0))

      label(s, 'Plan', g.right, g.top(0))
      const plan = form.createRadioGroup('plan')
      plan.addOptionToPage('monthly', s.page, box(g.right, g.top(0)))
      plan.addOptionToPage('yearly', s.page, box(g.right + 66, g.top(0)))
      plan.select('monthly')
      beside(s, 'Monthly', g.right, g.top(0))
      beside(s, 'Yearly', g.right + 66, g.top(0))

      // Two widgets share the export value "A" but have their own on-states, so they toggle apart.
      label(s, 'Shared value', g.left, g.top(1))
      const shared = form.createRadioGroup('shared')
      shared.addOptionToPage('A', s.page, box(g.left, g.top(1)))
      shared.addOptionToPage('A', s.page, box(g.left + 50, g.top(1)))
      beside(s, 'A', g.left, g.top(1))
      beside(s, 'A', g.left + 50, g.top(1))

      const country = form.createDropdown('country')
      country.setOptions(['United Kingdom', 'France'])
      country.select('United Kingdom')
      country.addToPage(s.page, { ...at(g.right, g.top(1), g.w), ...look })
      country.setFontSize(10)
      label(s, 'Country', g.right, g.top(1))

      const city = form.createDropdown('city')
      city.setOptions(['Leeds', 'Lyon', 'Lisbon'])
      city.enableEditing()
      city.addToPage(s.page, { ...at(g.left, g.top(2), g.w), ...look })
      city.setFontSize(10)
      label(s, 'City (pick or type)', g.left, g.top(2))

      const interests = form.createOptionList('interests')
      interests.setOptions(['maths', 'engines', 'poetry'])
      interests.enableMultiselect()
      interests.addToPage(s.page, { ...at(g.right, g.top(2), g.w, 44), ...look })
      interests.setFontSize(10)
      label(s, 'Interests (pick several)', g.right, g.top(2))
    },
  }

  const signing: Row = {
    weight: 0.95,
    title: 'Signatures and layout',
    body: 'Sign a signature field with a saved signature. One field can show in two places, and a field can turn on the page.',
    tryIt: 'Try it: sign as the member, then press Reset.',
    demo(s, b) {
      boxTitle(s, b, 'Sign and reset')
      const g = grid(b)
      const sigTop = g.top(0)
      signatureField(form, s.page, 'sig', { x: g.left, top: sigTop, w: g.w, h: 32 })
      label(s, 'Member', g.left, sigTop)
      signatureField(form, s.page, 'sig2', { x: g.right, top: sigTop, w: g.w, h: 32 })
      label(s, 'Witness', g.right, sigTop)

      const lower = sigTop + 32 + 22
      const ref = text(s, 'header.ref', 'Reference (in two places)', {
        x: g.left,
        top: lower,
        w: g.w,
      })
      dropDuplicateParent(d, ref)
      ref.setText('REF-0042')
      const reset = form.createButton('reset')
      reset.addToPage('Reset', s.page, { ...at(g.left, lower + 30, 64, 20), ...look })
      reset.setFontSize(10)

      // /MK /R 90 turns the field's content; the rectangle stays as the page has it.
      label(s, 'Turned', g.right, lower)
      const turned = { ...look, rotate: degrees(90) }
      const tall = (x: number) => ({ x, y: H - lower - 52, width: FIELD_H, height: 52 })
      ref.addToPage(s.page, { ...turned, ...tall(g.right) })
      ref.acroField.getWidgets()[1]!.setRectangle(tall(g.right))
      const rotated = form.createTextField('rotated')
      rotated.addToPage(s.page, { ...turned, ...tall(g.right + 30) })
      rotated.acroField.getWidgets()[0]!.setRectangle(tall(g.right + 30))
      rotated.setFontSize(10)
    },
  }

  const calculations: Row = {
    weight: 1.05,
    title: 'Calculations and formats',
    body: 'Scripts in the PDF format numbers, money and dates, check what you type and work out totals as you go.',
    tryIt: 'Try it: order 3 at 12.50, then give a discount of 0.1 and watch what is due.',
    demo(s, b) {
      boxTitle(s, b, 'Order', 'Prices in pounds')
      const g = grid(b)
      const third = (b.w - 20) / 3
      text(s, 'qty', 'Quantity', { x: b.x, top: g.top(0), w: third })
      text(s, 'price', 'Unit price', { x: b.x + third + 10, top: g.top(0), w: third })
      text(s, 'total', 'Total', {
        x: b.x + (third + 10) * 2,
        top: g.top(0),
        w: third,
      }).enableReadOnly()
      text(s, 'discount', 'Discount (0.1 is 10%)', { x: b.x, top: g.top(1), w: third })
      text(s, 'due', 'Due', {
        x: b.x + (third + 10) * 2,
        top: g.top(1),
        w: third,
      }).enableReadOnly()
      text(s, 'when', 'Delivery date (dd/mm/yyyy)', { x: g.left, top: g.top(2), w: g.w })
      text(s, 'age', 'Age (18 to 120)', { x: g.right, top: g.top(2), w: 56 })
      s.para(
        'Scripts in the PDF work out the total and the amount due after the discount. An age outside 18 to 120 is refused.',
        b.x,
        g.top(3) + 4,
        b.w,
        { size: 9.75, leading: 14, color: MUTED }
      )
    },
  }

  const showHide: Row = {
    weight: 0.7,
    title: 'Show and hide',
    body: 'A script can show or hide other fields.',
    tryIt: 'Try it: tick the box to show one more field.',
    demo(s, b) {
      boxTitle(s, b, 'Delivery')
      const g = grid(b)
      form
        .createCheckBox('more')
        .addToPage(s.page, { ...look, ...at(g.left, g.top(0) - 12, 12, 12) })
      beside(s, 'Send to a second address', g.left, g.top(0) - 14)
      form
        .createTextField('extra')
        .addToPage(s.page, { ...look, ...at(g.left, g.top(1) - 14, b.w), hidden: true })
    },
  }

  const buttons: Row = {
    weight: 1.25,
    title: 'Buttons and actions',
    body: 'Buttons can submit the form, send mail, open a link, print or show a message. Inkbar never sends or opens anything itself: it hands each request to the page.',
    tryIt: 'Try it: press Submit, then look at the Form panel beside the viewer.',
    demo(s, b) {
      boxTitle(s, b, 'Actions')
      const captions: [string, string][] = [
        ['hello', 'Hello'],
        ['ask', 'Ask'],
        ['submit', 'Submit'],
        ['mail', 'Mail'],
        ['link', 'Link'],
        ['print', 'Print'],
        ['send', 'Send'],
        ['site', 'Site'],
        ['clear', 'Clear'],
      ]
      const w = (b.w - 20) / 3
      captions.forEach(([name, caption], i) => {
        const x = b.x + (i % 3) * (w + 10)
        const top = b.top + 26 + Math.floor(i / 3) * 30
        const button = form.createButton(name)
        button.addToPage(caption, s.page, { ...at(x, top, w, 22), ...look })
        button.setFontSize(10)
      })
      s.para(
        'Hello shows a message and Ask asks a question. Submit and Send post the form, Mail starts an email, Link and Site open a page, Print prints. Clear empties the form.',
        b.x,
        b.top + 136,
        b.w,
        { size: 9.75, leading: 14, color: MUTED }
      )
    },
  }

  return {
    fields: [textFields, choices, signing],
    scripted: [calculations, showHide, buttons],
  }
}

/** Writes what pdf-lib has no helper for: fonts, flags, option lists and every script. */
export function finishForm(d: PDFDocument, fonts: Fonts): void {
  const ctx = d.context
  const form = d.getForm()
  form.updateFieldAppearances(fonts.regular)

  // Every hand-written /DA names /Helv, a plain Helvetica in the AcroForm /DR.
  const acro = form.acroForm.dict
  const dr = acro.lookupMaybe(PDFName.of('DR'), PDFDict) ?? ctx.obj({})
  const dict = dr.lookupMaybe(PDFName.of('Font'), PDFDict) ?? ctx.obj({})
  const type1 = (base: string) =>
    ctx.register(
      ctx.obj({
        Type: 'Font',
        Subtype: 'Type1',
        BaseFont: base,
        Encoding: 'WinAnsiEncoding',
      })
    )
  dict.set(PDFName.of('Helv'), type1('Helvetica'))
  // /F1 is a resource name, not a family: only the /DR says it is Times-Bold.
  dict.set(PDFName.of('F1'), type1('Times-Bold'))
  dr.set(PDFName.of('Font'), dict)
  acro.set(PDFName.of('DR'), dr)
  acro.set(PDFName.of('DA'), PDFString.of(HELV))
  for (const f of form.getFields())
    if (f.acroField.dict.has(PDFName.of('DA'))) setDA(f, HELV)
  setDA(form.getTextField('auto'), '/Helv 0 Tf 0 g')
  setDA(form.getTextField('styled'), '/F1 10 Tf 0.153 0.251 0.961 rg')

  form.getTextField('email').acroField.dict.set(PDFName.of('TU'), PDFString.of('Email'))
  // /TU names one field and is not inherited: header.ref has none of its own.
  form
    .getTextField('header.ref')
    .acroField.dict.lookup(PDFName.of('Parent'), PDFDict)
    .set(PDFName.of('TU'), PDFString.of('Header'))
  form.getCheckBox('agree').acroField.dict.set(PDFName.of('V'), PDFName.of('Off'))
  const plan = form.getRadioGroup('plan')
  nameRadioStates(plan, ['monthly', 'yearly'], 'monthly')
  plan.acroField.dict.set(PDFName.of('DV'), PDFName.of('yearly'))
  const shared = form.getRadioGroup('shared').acroField.dict
  shared.set(PDFName.of('V'), PDFName.of('Off'))
  // Both states map to the shared export "A"; /DV names the second widget's state.
  shared.set(PDFName.of('DV'), PDFName.of('1'))
  const country = form.getDropdown('country').acroField.dict
  country.set(
    PDFName.of('Opt'),
    ctx.obj([
      [PDFString.of('gb'), PDFString.of('United Kingdom')],
      [PDFString.of('fr'), PDFString.of('France')],
    ])
  )
  country.set(PDFName.of('V'), PDFString.of('gb'))
  widgetDict(form.getButton('reset')).set(PDFName.of('A'), ctx.obj({ S: 'ResetForm' }))

  const scripts = (name: string, actions: Record<string, string>): void => {
    const aa: Record<string, PDFDict> = {}
    for (const [k, code] of Object.entries(actions)) aa[k] = js(ctx, code)
    form.getField(name).acroField.dict.set(PDFName.of('AA'), ctx.obj(aa))
  }
  const pounds = '2, 0, 0, 0, "£", true'
  scripts('qty', {
    K: 'AFNumber_Keystroke(0, 0, 0, 0, "", true)',
    F: 'AFNumber_Format(0, 0, 0, 0, "", true)',
  })
  scripts('price', {
    K: `AFNumber_Keystroke(${pounds})`,
    F: `AFNumber_Format(${pounds})`,
  })
  scripts('total', {
    C: 'AFSimple_Calculate("PRD", new Array("qty", "price"))',
    F: `AFNumber_Format(${pounds})`,
  })
  scripts('discount', { K: 'AFPercent_Keystroke(1, 0)', F: 'AFPercent_Format(1, 0)' })
  scripts('due', {
    // A Calculate script of its own, not one of the AF helpers.
    C: 'var total = this.getField("total").value; var off = this.getField("discount").value; event.value = total * (1 - off);',
    F: `AFNumber_Format(${pounds})`,
  })
  scripts('when', {
    K: 'AFDate_KeystrokeEx("dd/mm/yyyy")',
    F: 'AFDate_FormatEx("dd/mm/yyyy")',
  })
  scripts('age', { V: 'event.rc = event.value >= 18 && event.value <= 120' })
  acro.set(
    PDFName.of('CO'),
    ctx.obj([form.getTextField('total').ref, form.getTextField('due').ref])
  )
  widgetDict(form.getCheckBox('more')).set(
    PDFName.of('AA'),
    ctx.obj({
      U: js(
        ctx,
        'this.getField("extra").display = event.target.value == "Off" ? display.hidden : display.visible'
      ),
    })
  )

  const action = (name: string, a: PDFDict): void =>
    widgetDict(form.getButton(name)).set(PDFName.of('A'), a)
  action('hello', js(ctx, 'app.alert("Hello")'))
  action('ask', js(ctx, 'app.response("Name?")'))
  action('submit', js(ctx, 'this.submitForm("https://example.com/submit")'))
  action('mail', js(ctx, 'this.mailDoc(false, "forms@example.com")'))
  action('link', js(ctx, 'app.launchURL("https://example.com", true)'))
  action('print', js(ctx, 'this.print()'))
  action(
    'send',
    ctx.obj({ S: 'SubmitForm', F: PDFString.of('https://example.com/xfdf'), Flags: 32 })
  )
  action('site', ctx.obj({ S: 'URI', URI: PDFString.of('https://example.com') }))
  action('clear', ctx.obj({ S: 'ResetForm' }))
  d.addJavaScript('init', 'var formReady = true;')
}

export async function makeForm(): Promise<Uint8Array> {
  const { d, fonts, sheet } = await newDocument('Inkbar form sample')
  const rows = formRows(d, fonts)
  const label = 'Form sample'
  featurePage(sheet(), { n: 1, total: 2, label }, rows.fields)
  featurePage(sheet(), { n: 2, total: 2, label }, rows.scripted)
  finishForm(d, fonts)
  return save(d)
}
