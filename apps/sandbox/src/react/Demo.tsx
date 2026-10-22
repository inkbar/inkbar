import {
  InkColorMenu,
  InkCommand,
  InkFindBar,
  InkHighlightMenu,
  InkLineStyleMenu,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRedo,
  InkRoot,
  InkSearchButton,
  InkShapeMenu,
  InkSignatureMenu,
  InkTextStyleMenu,
  InkThreadPopover,
  InkToolbar,
  InkToolbarSeparator,
  InkToolButton,
  InkUndo,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { useEffect, useState } from 'react'
import { assets } from 'virtual:inkbar-assets'

import { suggestionsPlugin } from '../plugin/suggestions'
import '../plugin/suggestions.css'
import { glossFields, logAction, type LoggedAction } from '../shared/form'
import { signatureFonts, signatures } from '../shared/signatures'

import type { DocumentSource, FormAction, InkDocument } from '@inkbar/core'

/*
 * The document keeps its own annotations, form values and undo history, so Undo covers field
 * edits too. The page follows the form's values (`doc.form.values`) for the Gloss view and
 * hears the form's requests (onFormAction), which the Form panel lists. The toolbars are built from Inkbar's components, so each control is yours to
 * keep, move or drop. Pass a button your own icon to replace the one it shows. Suggest
 * redactions is a plugin (src/plugin/suggestions.ts): registered in `plugins`, with its button
 * placed by InkCommand.
 */
export function Demo({ source }: { source: DocumentSource }) {
  const [doc, setDoc] = useState<InkDocument | null>(null)
  const [actions, setActions] = useState<LoggedAction[]>([])
  const [gloss, setGloss] = useState('')

  // The Gloss view follows each change to the open document's values.
  useEffect(() => {
    if (!doc) return
    setGloss(glossFields(doc))
    return doc.form.values.subscribe(() => setGloss(glossFields(doc)))
  }, [doc])

  function onFormAction(a: FormAction) {
    setActions((log) => logAction(log, a))
  }

  return (
    <InkRoot
      src={source}
      assets={assets}
      signatures={signatures}
      signatureFonts={signatureFonts}
      plugins={[suggestionsPlugin()]}
      onFormAction={onFormAction}
      onReady={setDoc}
      className="demo-root"
    >
      <InkToolbar className="demo-toolbar">
        <InkHighlightMenu />
        <div className="demo-group" role="group" aria-label="Tools">
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
          <InkToolButton tool="redact-area" />
          <InkToolButton tool="sketch" />
          <InkToolButton tool="draw" />
          <InkShapeMenu />
          <InkToolButton tool="freetext" />
          <InkSignatureMenu />
          <InkToolButton tool="note" />
        </div>
        <InkToolbarSeparator />
        <div className="demo-group" role="group" aria-label="Style">
          <InkLineStyleMenu />
          <InkColorMenu property="border" />
          <InkColorMenu property="fill" />
          <InkTextStyleMenu />
        </div>
        <InkUndo />
        <InkRedo />
        <InkSearchButton />
        <div className="demo-actions" role="group" aria-label="Suggest">
          <InkCommand id="sandbox.suggest" />
        </div>
      </InkToolbar>
      <div className="demo-body">
        <InkViewport />
        {/* It scrolls, so it takes focus for keyboard scrolling. */}
        <section className="demo-form" aria-labelledby="demo-form-title" tabIndex={0}>
          <h2 id="demo-form-title">Form</h2>
          <p>
            Inkbar never sends, opens or prints anything. The form's requests come here.
          </p>
          <h3>Actions</h3>
          {actions.length > 0 ? (
            <ol>
              {actions.map((a) => (
                <li key={a.id}>{a.text}</li>
              ))}
            </ol>
          ) : (
            <p>None yet. Try the buttons on page 6.</p>
          )}
          <h3>Fields as Gloss</h3>
          <pre>{gloss}</pre>
        </section>
      </div>
      <InkFindBar />
      <InkToolbar label="Page and zoom" className="demo-status-bar">
        <div className="demo-group" role="group" aria-label="Page">
          <InkPrevPage />
          <InkPageInput />
          <InkPageCount />
          <InkNextPage />
        </div>
        <div className="demo-group demo-zoom" role="group" aria-label="Zoom">
          <InkZoomOut />
          <InkZoomSelect />
          <InkZoomIn />
        </div>
      </InkToolbar>
      <InkThreadPopover />
    </InkRoot>
  )
}
