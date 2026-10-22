/*
 * The plugin page: the example plugin's source, with a note on each file, beside the
 * TypeScript viewer running it.
 */
import css from '../plugin/suggestions.css?highlight'
import suggestions from '../plugin/suggestions.ts?highlight'
import { startShell } from '../shell/shell'
import { mountDemo } from '../vanilla/Demo'

startShell({
  page: 'plugin',
  files: [
    {
      path: 'src/plugin/suggestions.ts',
      source: suggestions,
      note: '<code>definePlugin</code> and its setup, run once per viewer. It keeps the suggestions as records, adds the Suggest command, draws each open suggestion as a mark with a review card, and links Accept’s redaction back to its suggestion. A host registers it in <code>plugins</code> and places the button.',
    },
    {
      path: 'src/plugin/suggestions.css',
      source: css,
      note: 'The marks’ look. The card is core’s, styled by the theme.',
    },
  ],
  mount: mountDemo,
})
