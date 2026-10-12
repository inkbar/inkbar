# Inkbar

Browser PDF viewer and editor for Vue, built on PDF.js. Headless primitives, typed annotations, one coordinate system.

Made by [Redactr](https://redactr.io).

## Packages

| Package            | Purpose                                                                         |
| ------------------ | ------------------------------------------------------------------------------- |
| `@inkbar/core`     | Document model, rendering, annotations and tools, with no framework dependency. |
| `@inkbar/vue`      | Vue 3 components, composables and a default toolbar.                            |
| `@inkbar/theme`    | Default stylesheet. Zero specificity, compatible with shadcn token names.       |
| `@inkbar/fixtures` | Test PDFs and helpers for the test suites. Private, not published.              |

## Development

```sh
pnpm install
pnpm build
pnpm test
```

Licence: MIT.
