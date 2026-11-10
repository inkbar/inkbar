<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-dark.svg">
    <img src="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-light.svg" alt="Inkbar" width="72" height="72">
  </picture>
</p>

<h1 align="center">@inkbar/theme</h1>

<p align="center">
  The default look for Inkbar: one stylesheet, no JavaScript.
</p>

<p align="center">
  <a href="https://inkbar.dev">Website</a> ·
  <a href="https://inkbar.dev/docs/">Docs</a> ·
  <a href="https://sandbox.inkbar.dev">Sandbox</a> ·
  <a href="https://github.com/inkbar/inkbar">GitHub</a>
</p>

---

`@inkbar/theme` styles the viewer and what it draws over pages (annotations, form fields, search matches), the toolbar controls and menus, sidebars and thumbnails, the find bar and search results, the signature dialog, note threads, and plugin cards and command buttons, from `@inkbar/vue`, `@inkbar/react`, `@inkbar/svelte` and `createViewer` in `@inkbar/core`. Import it and ship, or override any part of it with your own CSS. If your app already defines shadcn tokens, the theme picks up your colours and radius.

## Install

```sh
pnpm add @inkbar/theme
```

Import the stylesheet once in your app:

```ts
import '@inkbar/theme/theme.css'
```

Every rule sits in `@layer inkbar` and inside `:where()`, so each selector has zero specificity. Your unlayered CSS overrides it without `!important`. The one exception is the move cursor while an annotation is dragged (`[data-ink-dragging]`), which uses `!important` to show over every element's own cursor.

## Layer order

Cascade layers win by order, whatever the specificity. The browser orders layers by first appearance, so if your stylesheet declares its own layers before this file loads, `inkbar` comes later and beats them. Declare `inkbar` first, at the top of your main stylesheet:

```css
@layer inkbar, utilities;
```

Put `inkbar` ahead of your own layer names, and your utility classes override the theme.

## Tokens

The stylesheet is compatible with shadcn token names. It reads `--background`, `--foreground`, `--muted`, `--muted-foreground`, `--border`, `--primary`, `--primary-foreground`, `--ring` and `--radius` when your page defines them, and uses its own values when it does not. Dark values apply under `prefers-color-scheme: dark` or inside a `.dark` ancestor. Add `.light` to the root or an ancestor to keep the light values, including inside a `.dark` ancestor.

Colour tokens must hold complete CSS colour values. Tokens written as bare HSL channels (`--muted: 210 40% 96%`) do not work. Write the full colour instead:

```css
--muted: hsl(210 40% 96%);
```

## Annotation colours

Set these variables on `[data-ink-root]` to change the default colour for new annotations:

| Variable                                                                  | Used for                    |
| ------------------------------------------------------------------------- | --------------------------- |
| `--ink-highlight`, `--ink-underline`, `--ink-strikeout`, `--ink-squiggly` | Text markup                 |
| `--ink-note`, `--ink-free-text`                                           | Notes and text boxes        |
| `--ink-shape`, `--ink-ink`                                                | Shapes and freehand drawing |
| `--ink-redact`, `--ink-redact-fill`                                       | Redaction outline and fill  |
| `--ink-mask`                                                              | Masks                       |

Inkbar reads a colour when you create the annotation and stores it on the annotation, because the colour goes into the PDF. Changing a variable later affects new annotations only. Write these as hex (`#f2c230`) or `rgb()`: Inkbar ignores other formats and uses its own default.

## Layout

The root and viewport fill their parent as a column, and the scroll area takes the remaining height. Give the parent a height and the document scrolls inside it.

The theme gives a toolbar a background and padding and styles the controls in it. You decide where the toolbar sits, how to group its controls and what separates it from the document. Set `--ink-control-size` on a toolbar to change the height of its buttons, fields and zoom select (default `2.25rem`), and `--ink-icon-size` to change the size of their icons (default `1.125rem`). `--ink-control-size` also sizes the sidebar rail's buttons and any `ink-select`.

```css
.my-page-bar {
  --ink-control-size: 2rem;
  --ink-icon-size: 1rem;
  border-top: 1px solid var(--border);
}
```

Sidebars and thumbnails have their own sizes:

| Variable                   | Default | Sets                               |
| -------------------------- | ------- | ---------------------------------- |
| `--ink-sidebar-width`      | `280px` | The width of an open sidebar       |
| `--ink-sidebar-rail-width` | `48px`  | The width of a sidebar's icon rail |
| `--ink-thumbnail-width`    | `120px` | The width of a page thumbnail      |

## Search, form and link colours

`--ink-search-hit` and `--ink-search-current` colour search matches and the current match. `--ink-mark-selected-outline` outlines a plugin mark whose record is selected (default `2px solid #2740f5`). `--ink-form-field-bg`, `--ink-form-field-focus` and `--ink-form-field-invalid` colour form fields, the focused field and a field that fails its check. `--ink-link-hover` tints a link under the pointer (default `transparent`, so links show no box).

## Your own controls

Three classes give your own controls the look of the built-in ones. Add `ink-select` to a `<select>` to give it the zoom select's box and chevron. To put an icon in a field, wrap the input in `ink-input-group` and add an `ink-input-accessory` before it for an icon at the start, or after it for one at the end. The icon lets clicks through to the field, and the input makes room for it. The find bar and the search results field use this for their search icon.

```html
<select class="ink-select">
  …
</select>

<div class="ink-input-group">
  <span class="ink-input-accessory"><svg aria-hidden="true">…</svg></span>
  <input type="text" aria-label="Filter notes" />
</div>
```

## Licence

[MIT](https://github.com/inkbar/inkbar/blob/main/LICENSE). From the team behind [Redactr](https://redactr.io).
