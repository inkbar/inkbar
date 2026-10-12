# @inkbar/theme

Default styles for Inkbar. Import the stylesheet once in your app:

```ts
import '@inkbar/theme/theme.css'
```

Every rule sits in `@layer inkbar` and inside `:where()`, so each selector has zero specificity. Your unlayered CSS overrides it without `!important`.

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

| Variable                                                                   | Used for                            |
| -------------------------------------------------------------------------- | ----------------------------------- |
| `--ink-highlight`, `--ink-underline`, `--ink-strikeout`, `--ink-squiggly`  | Text markup                         |
| `--ink-note`, `--ink-free-text`                                            | Notes and text boxes                |
| `--ink-shape`, `--ink-ink`                                                 | Shapes and freehand drawing         |
| `--ink-redact`, `--ink-redact-fill`                                        | Redaction outline and fill          |
| `--ink-suggestion-low`, `--ink-suggestion-medium`, `--ink-suggestion-high` | Suggested redactions, by confidence |

Inkbar reads a colour when you create the annotation and stores it on the annotation, because the colour goes into the PDF. Changing a variable later affects new annotations only.

## Layout

The root and viewport fill their parent as a column, and the scroll area takes the remaining height. Give the parent a height and the document scrolls inside it.

Licence: MIT.
