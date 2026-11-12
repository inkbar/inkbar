# Accessibility

We aim for Inkbar's viewer and editor to meet [WCAG 2.2](https://www.w3.org/TR/WCAG22/) level AA. Nobody has audited it yet, so we don't claim conformance. This page lists what works today, what doesn't, and how to tell us about a problem.

## What works

- **Keyboard.** You can reach the toolbar controls, menus, sidebars and annotations from the keyboard. You can make highlights, text redactions, notes, shapes, text boxes and signatures from the keyboard, then move, resize and delete them. The [`@inkbar/core` README](packages/core/README.md#tools-and-keyboard) lists every key.
- **Focus.** Focus stays visible on controls, links and annotations. When an Undo or Redo button disables itself, focus moves to the document instead of dropping to the page.
- **Screen readers.** Controls carry names, roles and states (pressed, expanded, checked, selected). Menus, tabs and radio groups follow the ARIA patterns for them. The find bar announces its result count, and the viewer announces errors and form alerts.
- **Reading order.** The arrow keys move between a page's annotations in reading order. Tab moves through form fields in the order the file sets, including a tagged file's structure order.
- **Motion.** The viewer animates only when your system allows motion.

## Known gaps

- Freehand drawing, area redactions, loupes and masks need a pointer.
- Inkbar doesn't pass a tagged PDF's structure on to assistive technology yet. A screen reader reads each page's text in the order the file stores it, without the file's headings, lists, tables or alternative text.
- A scanned PDF with no text layer gives a screen reader nothing to read. Inkbar doesn't run OCR.
- We haven't tested Windows high contrast mode (forced colours).

## How we check

The end-to-end suite runs [axe-core](https://github.com/dequelabs/axe-core) against the WCAG 2.2 AA rules in the Vue, React and Svelte review apps. Automated rules catch only part of WCAG, which is why we don't claim conformance on their results alone.

## Your app's part

Inkbar gives you components. The page around them, and any controls you add, are yours to make accessible. Give the viewer a heading or landmark that names the document, and keep your own controls reachable from the keyboard.

## Report a problem

[Open an accessibility issue](https://github.com/inkbar/inkbar/issues/new?template=accessibility.yml), or email [inbox@inkbar.dev](mailto:inbox@inkbar.dev) if you'd rather not post in public. Tell us what you were doing, the browser and assistive technology you use, and what happened.
