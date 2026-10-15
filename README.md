# Inkbar

Browser PDF viewer and editor for Vue, React and Svelte, built on PDF.js. Headless primitives, typed annotations, one coordinate system.

Made by [Redactr](https://redactr.io).

Try it in the browser: [inkbar.github.io/inkbar](https://inkbar.github.io/inkbar/), with one page each for React, Vue, Svelte and plain TypeScript.

## Packages

| Package              | Purpose                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `@inkbar/core`       | Document model, rendering, annotations and tools, with no framework dependency.                 |
| `@inkbar/vue`        | Vue 3 components, composables and a default toolbar.                                            |
| `@inkbar/react`      | React 19 components, hooks and a default toolbar.                                               |
| `@inkbar/svelte`     | Svelte 5 components, hooks and a default toolbar.                                               |
| `@inkbar/theme`      | Default stylesheet. Zero specificity, compatible with shadcn token names.                       |
| `@inkbar/fixtures`   | Test PDFs and helpers for the test suites. Private, not published.                              |
| `@inkbar/e2e-vue`    | Review app for end-to-end, accessibility and performance checks. Private, not published.        |
| `@inkbar/e2e-react`  | The review app on React. Private, not published.                                                |
| `@inkbar/e2e-svelte` | The review app on Svelte. Private, not published.                                               |
| `@inkbar/e2e-shared` | End-to-end suite, fake server and helpers the three review apps run. Private, not published.    |
| `@inkbar/sandbox`    | The sandbox at sandbox.inkbar.dev: an index and one page per framework. Private, not published. |

## Install

```sh
pnpm add @inkbar/vue @inkbar/core @inkbar/theme
```

```sh
pnpm add @inkbar/react @inkbar/core @inkbar/theme
```

```sh
pnpm add @inkbar/svelte @inkbar/core @inkbar/theme
```

The five packages are released together and share one version. `@inkbar/vue`, `@inkbar/react` and `@inkbar/svelte` depend on the exact `@inkbar/core` version they were built against. See each package README for usage.

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm --filter @inkbar/e2e-vue dev  # the review app on http://localhost:5180
pnpm --filter @inkbar/e2e-react dev  # the React review app on http://localhost:5181
pnpm --filter @inkbar/e2e-svelte dev  # the Svelte review app on http://localhost:5182
pnpm --filter @inkbar/sandbox dev  # the sandbox on http://localhost:5190
```

## Releasing

All five packages are released together at one version. On every push to `main`, the `release-please` workflow updates an open release PR. The PR bumps the version in each package and in `CHANGELOG.md`, picking the next version from the conventional commits since the last release. Merging it tags the commit and publishes the GitHub release.

Publishing the release starts the `release` workflow. It checks out the tag, builds and tests, then runs `pnpm publish` for each package with provenance. pnpm replaces `workspace:*` with the released version at publish time.

The workflows need these settings:

- Organisation variable `IB_APP_CLIENT_ID` and secret `IB_APP_PRIVATE_KEY`: the `inkbar-ci` GitHub App, installed on this repository with contents and pull requests write access. Its token opens the release PR and publishes the release. A release made with `GITHUB_TOKEN` would not start the `release` workflow.
- Secret `NPM_TOKEN`: an npm automation token with publish rights on the `@inkbar` scope.

If publishing fails, rerun the `release` workflow from the Actions tab. pnpm skips versions already on the registry, so a rerun finishes a partial publish.

Licence: MIT.
