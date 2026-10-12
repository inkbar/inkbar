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

## Install

```sh
pnpm add @inkbar/vue @inkbar/core @inkbar/theme
```

The three packages are released together and share one version. `@inkbar/vue` depends on the exact `@inkbar/core` version it was built against. See each package README for usage.

## Development

```sh
pnpm install
pnpm build
pnpm test
```

## Releasing

The `release` workflow runs from the Actions tab and publishes all three packages to npm at the same version. release-it picks the version from conventional commits on `main`, commits `release: v<version>` and tags it, creates the GitHub release with the generated changelog, then runs `pnpm publish --access public` for each package. pnpm replaces `workspace:*` with the released version at publish time.

The workflow needs these settings:

- Repository variable `INKBAR_CI_APP_CLIENT_ID` and secret `INKBAR_CI_APP_PRIVATE_KEY`: a GitHub App with contents write access, installed on this repository. Its token pushes the release commit and tag to `main`.
- Secret `NPM_TOKEN`: an npm automation token with publish rights on the `@inkbar` scope.

release-it pushes straight to `main`. Once `main` is protected, add the App to the bypass list for the branch protection rule, or the push is rejected.

If publishing fails after the tag exists, check out the tag and run `pnpm -r --filter @inkbar/core --filter @inkbar/vue --filter @inkbar/theme publish --access public --no-git-checks`. pnpm skips versions already on the registry, so a partial publish can be finished this way.

Licence: MIT.
