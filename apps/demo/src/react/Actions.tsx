import { isInkError } from '@inkbar/core'
import { useAnnotations, useDocument, useHistory } from '@inkbar/react'
import { useState } from 'react'

import { suggestionCount, suggestRedactions } from '../shared/suggest'

/** Hooks only work inside InkRoot, so these controls are their own component. */
export function Actions() {
  const { document, isReady } = useDocument()
  const { annotations, add } = useAnnotations()
  const { undo, redo, canUndo, canRedo } = useHistory()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')

  async function suggest() {
    if (!document) return
    setBusy(true)
    try {
      const found = await suggestRedactions(document, annotations)
      for (const input of found) add(input)
      setResult(suggestionCount(found.length))
    } catch (e) {
      // Opening another file mid-run destroys the document; that is not a failure.
      if (!(isInkError(e) && e.code === 'DocumentDestroyed'))
        setResult('Could not check this document.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="demo-actions" role="group" aria-label="Edit">
      <button type="button" onClick={undo} disabled={!canUndo}>
        Undo
      </button>
      <button type="button" onClick={redo} disabled={!canRedo}>
        Redo
      </button>
      <button type="button" onClick={() => void suggest()} disabled={!isReady || busy}>
        Suggest redactions
      </button>
      <span className="demo-result" role="status">
        {result}
      </span>
    </div>
  )
}
