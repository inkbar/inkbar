/* Inside InkRoot: shows how many signatures the root's library holds and saves one more. */
import { useInkContext } from '../../src/context'
import { useReadable } from '../../src/use-readable'

export function SignatureStorageProbe() {
  const ctx = useInkContext('SignatureStorageProbe')
  const templates = useReadable(ctx.signatures.templates, [])
  return (
    <>
      <output data-testid="signatures">{templates.length}</output>
      <button
        type="button"
        data-testid="save-signature"
        onClick={() =>
          void ctx.signatures.save({
            id: 'added',
            kind: 'ink',
            inklist: [
              [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ],
            ],
            aspect: 1,
          })
        }
      >
        Save signature
      </button>
    </>
  )
}
