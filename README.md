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

The `release` workflow runs from the Actions tab and publishes all five packages to npm at the same version. release-it picks the version from conventional commits on `main`, commits `release: v<version>` and tags it, creates the GitHub release with the generated changelog, then runs `pnpm publish --access public` for each package. pnpm replaces `workspace:*` with the released version at publish time.

The workflow needs these settings:

- Repository variable `INKBAR_CI_APP_CLIENT_ID` and secret `INKBAR_CI_APP_PRIVATE_KEY`: a GitHub App with contents write access, installed on this repository. Its token pushes the release commit and tag to `main`.
- Secret `NPM_TOKEN`: an npm automation token with publish rights on the `@inkbar` scope.

release-it pushes straight to `main`. Once `main` is protected, add the App to the bypass list for the branch protection rule, or the push is rejected.

If publishing fails after the tag exists, check out the tag, run `pnpm install --frozen-lockfile` and `pnpm build`, then run `pnpm -r --filter @inkbar/core --filter @inkbar/vue --filter @inkbar/react --filter @inkbar/svelte --filter @inkbar/theme publish --access public --no-git-checks`. pnpm skips versions already on the registry, so a partial publish can be finished this way.

Licence: MIT.
