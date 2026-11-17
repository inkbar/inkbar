// What another program does to annotations Inkbar saved, for the fixtures of saved files.
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFString } from 'pdf-lib'

/**
 * `bytes` with two additions on its first page, as a program other than Inkbar would make them:
 * a note that replies to the annotation named `replyTo` (a Text annotation whose `/IRT` is that
 * annotation, with nothing of Inkbar's stored in it), and a `/Popup` on the annotation named
 * `popupOn` with its Popup annotation. Annotations are found by `/NM`. The file is rewritten,
 * and every object keeps its number.
 */
export async function addReplyAndPopup(
  bytes: Uint8Array,
  names: { replyTo: string; popupOn: string }
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
  const { context } = pdf
  const annots = pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray)
  const named = (name: string): { ref: PDFRef; dict: PDFDict } => {
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i)
      if (!(ref instanceof PDFRef)) continue
      const dict = context.lookup(ref, PDFDict)
      const nm = dict.lookupMaybe(PDFName.of('NM'), PDFString)
      if (nm?.decodeText() === name) return { ref, dict }
    }
    throw new Error(`No annotation on the first page is named ${name}`)
  }

  const parent = named(names.replyTo)
  const reply = context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [540, 660, 560, 680],
    Contents: PDFString.of('A reply from another program'),
    T: PDFString.of('Another program'),
    M: PDFString.of('D:20261117120000Z'),
    NM: PDFString.of('other-reply'),
    Name: 'Comment',
    F: 4,
    IRT: parent.ref,
  })
  annots.push(context.register(reply))

  const noted = named(names.popupOn)
  const popup = context.obj({
    Type: 'Annot',
    Subtype: 'Popup',
    Rect: [400, 600, 580, 680],
    Parent: noted.ref,
    Open: false,
  })
  const popupRef = context.register(popup)
  annots.push(popupRef)
  noted.dict.set(PDFName.of('Popup'), popupRef)

  return pdf.save({ useObjectStreams: false })
}
