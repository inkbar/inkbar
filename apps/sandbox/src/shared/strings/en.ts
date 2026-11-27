import { plural, template } from '@inkbar/core'

import { englishText } from '../../plugin/suggestions-text.ts'

import type { SandboxStrings } from './types.ts'

/** The sandbox's own words in English, the language every other set is made from. */
export const en: SandboxStrings = {
  lang: 'en-GB',
  shell: {
    pageTitle: template('en', '{scenario} · {framework} · Inkbar sandbox'),
    home: 'home',
    breadcrumb: 'Breadcrumb',
    mainLinks: 'Main',
    docs: 'Docs',
    language: 'Language',
    scenarios: 'Scenarios',
    framework: 'Framework',
    frameworkNamed: template('en', 'Framework: {name}'),
    frameworks: 'Frameworks',
    view: 'View',
    preview: 'Preview',
    code: 'Code',
    dropHint: 'Open or drop your own PDF. It stays in your browser.',
    panels: 'Panels',
    events: 'Events',
    values: 'Values',
    clear: 'Clear',
    eventCount: plural('en', 'count', { one: '{count} event', other: '{count} events' }),
    eventsEmpty: 'Use the viewer. Its callbacks show up here.',
    valuesNote: "The form's field values, as Gloss.",
    fieldValues: 'Field values',
    files: 'Files',
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    viewOnGitHub: 'View on GitHub',
    loadingCode: 'Loading the code…',
    codeFailed: 'The code could not be loaded. Switch tabs to try again.',
    languageFailed: 'This language could not be loaded.',
    scenarioFailed: 'This scenario could not be loaded.',
    notPdf: template('en', '{name} is not a PDF.'),
    unreadable: template('en', '{name} could not be read.'),
    opened: template('en', 'Opened {name}.'),
    noViewer: template('en', 'There is no viewer to open {name} in.'),
  },
  scenarios: {
    tour: {
      title: 'Annotation tour',
      blurb:
        'Every creation tool, on a document that already has one of each annotation.',
    },
    tools: {
      title: 'Pick your tools',
      blurb:
        'Only the tools you import end up in your bundle. This one registers highlight and note.',
    },
    forms: {
      title: 'Fill a form',
      blurb:
        'Text fields, checkboxes, radios, a choice list and a signature field. No creation tools needed.',
    },
    save: {
      title: 'Save and reopen',
      blurb:
        'Download writes your annotations into the PDF. Open the file you saved and they come back, ready to edit.',
    },
    redactions: {
      title: 'Custom plugins',
      blurb:
        'A plugin adds its own command, records, marks and cards, and runs in every framework. This one suggests redactions.',
    },
    controlled: {
      title: 'Controlled annotations',
      blurb: 'Your app owns the annotation list and hears every change.',
    },
    search: {
      title: 'Search a long document',
      blurb:
        'Two hundred pages. Only the pages near the viewport render, and search runs across all of them.',
    },
    sidebars: {
      title: 'Sidebars',
      blurb:
        'Thumbnails, search and a panel of your own in a rail, tabs or a stack, on either side.',
    },
    outline: {
      title: 'Outline and links',
      blurb:
        'Jump around a long document from its outline, its table of contents, its index and its cross-references.',
    },
    locked: {
      title: 'Open a locked file',
      blurb:
        'A password-protected PDF. Inkbar asks for the password before it opens. The password is “inkbar”.',
    },
    events: {
      title: 'Press and long press',
      blurb:
        'A plugin hears presses and long presses on the page. On a phone or tablet, pinch to zoom the document.',
    },
  },
  labels: {
    tools: 'Tools',
    style: 'Style',
    history: 'History',
    file: 'File',
    page: 'Page',
    zoom: 'Zoom',
    pageAndZoom: 'Page and zoom',
    openPdf: 'Open a PDF',
    open: 'Open',
    suggest: 'Suggest',
    layout: 'Layout',
    rail: 'Rail',
    tabs: 'Tabs',
    stack: 'Stack',
    outline: 'Outline',
    pages: 'Pages',
    search: 'Search',
    about: 'About',
    aboutFill:
      'Fill a sidebar with whatever you need: page thumbnails, search results or components of your own.',
    aboutRecords:
      'Panels can read and write plugin records, so a list here shows the same data a plugin marks on the page.',
    searchResults: 'Search results',
    suggestions: 'Suggestions',
    accepted: 'Accepted',
    undoAccept: 'Undo accept',
    nothingAccepted: 'Nothing accepted yet.',
    acceptedAt: template('en', '{text}, page {page}'),
    plugin: englishText,
  },
}
