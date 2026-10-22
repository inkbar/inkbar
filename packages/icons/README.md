<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-dark.svg">
    <img src="https://raw.githubusercontent.com/inkbar/inkbar/main/.github/assets/inkbar-mark-on-light.svg" alt="Inkbar" width="72" height="72">
  </picture>
</p>

<h1 align="center">@inkbar/icons</h1>

<p align="center">
  The icons Inkbar's toolbar controls show, as plain data.
</p>

<p align="center">
  <a href="https://inkbar.dev">Website</a> ·
  <a href="https://inkbar.dev/docs/">Docs</a> ·
  <a href="https://sandbox.inkbar.dev">Sandbox</a> ·
  <a href="https://github.com/inkbar/inkbar">GitHub</a>
</p>

---

The toolbar controls in `@inkbar/vue`, `@inkbar/react`, `@inkbar/svelte` and `@inkbar/core` show these icons until you pass your own. They are 46 icons from [Lucide](https://lucide.dev), copied so the package has no dependencies.

You don't need to install this package to get the icons. Install it when you want the same icons on your own buttons, so they match the rest of the toolbar.

## Usage

Each icon is an array of `[tag, attributes]` pairs. Draw it inside an `<svg>` with `ICON_ATTRIBUTES` and a size. The framework packages export an `InkIcon` component that does this:

```vue
<script setup lang="ts">
import { Highlighter } from '@inkbar/icons'
import { InkIcon } from '@inkbar/vue'
</script>

<template>
  <button type="button" aria-label="Export"><InkIcon :icon="Highlighter" /></button>
</template>
```

Without a framework, `createIcon` from `@inkbar/core/dom` returns the `<svg>` element.

Each icon is exported under its Lucide name, such as `Highlighter`, `Undo2` or `ZoomIn`. The package's exports list them all.

## Licence

[MIT](https://github.com/inkbar/inkbar/blob/main/LICENSE). The icons come from Lucide under the ISC licence, and some of them derive from Feather under the MIT licence; this package's LICENSE file carries both notices. From the team behind [Redactr](https://redactr.io).
