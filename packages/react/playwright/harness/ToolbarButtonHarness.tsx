import { InkToolbar } from '../../src/components/InkToolbar'
import { InkToolbarButton } from '../../src/components/InkToolbarButton'

/** A toolbar of the host's own buttons, with no viewer. */
export function ToolbarButtonHarness({ onOpen }: { onOpen: () => void }) {
  return (
    <InkToolbar>
      <InkToolbarButton>Share</InkToolbarButton>
      <InkToolbarButton className="host-open" onClick={onOpen}>
        Open a PDF
      </InkToolbarButton>
    </InkToolbar>
  )
}
