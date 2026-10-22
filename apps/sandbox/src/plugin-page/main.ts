/*
 * The plugin page: the example plugin's source, with a note on each file, beside the
 * TypeScript viewer running it.
 */
import card from '../plugin/card.ts?highlight'
import layer from '../plugin/layer.ts?highlight'
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
      note: '<code>definePlugin</code> and its <code>setup</code>, run once per viewer. It keeps the suggestions in a store, adds the Suggest command and draws a layer on each page. A host registers it in <code>plugins</code> and places the button.',
    },
    {
      path: 'src/plugin/layer.ts',
      source: layer,
      note: 'Draws the open suggestions on a page as dashed buttons. Positions are in PDF points; the transform the layer is handed turns them into pixels.',
    },
    {
      path: 'src/plugin/card.ts',
      source: card,
      note: 'The review card, built on core’s popover. Accept adds a redaction, Dismiss sets the suggestion aside, and Undo takes back either.',
    },
    {
      path: 'src/plugin/suggestions.css',
      source: css,
      note: 'The marks and the card, styled with the theme’s tokens.',
    },
  ],
  mount: mountDemo,
})
