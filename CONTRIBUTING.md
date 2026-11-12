# Contributing to Inkbar

Thanks for helping. This guide covers inkbar/inkbar. Everyone who takes part follows the [Code of Conduct](https://github.com/inkbar/.github/blob/main/CODE_OF_CONDUCT.md).

## Before you start

Small fixes can go straight to a pull request. For a new feature or a change to a public API, open an issue first so we can agree on the approach before you write the code.

Report security problems privately, as the [security policy](https://github.com/inkbar/.github/blob/main/SECURITY.md) describes, not in an issue.

## Set up

You need Git, Node 24 and pnpm. The repository pins its pnpm version in `package.json`, so `corepack enable` picks the right one. You also need [qpdf](https://qpdf.sourceforge.io/) to generate the test fixtures.

```sh
git clone https://github.com/inkbar/inkbar.git
cd inkbar
pnpm install
pnpm build
pnpm --filter @inkbar/core exec playwright install chromium
```

The [README](README.md#development) shows how to run the sandbox and the review apps, and what each directory holds.

## Make the change

- Add or update tests with the change. Unit tests sit next to the code as `*.test.ts`, browser tests as `*.browser.test.ts`, and component tests as `*.ct.ts` or `*.ct.tsx`. The end-to-end suite lives in `apps/e2e-shared`.
- A change to a component lands in all three bindings: Vue, React and Svelte.
- Every coordinate is in PDF user space: points, origin bottom-left, before `/Rotate`. Only `packages/core/src/dom/transform.ts` converts to CSS pixels.
- Import PDF.js only under `packages/core/src/pdfjs/`.
- Keep new controls usable from the keyboard and give them accessible names. See [ACCESSIBILITY.md](ACCESSIBILITY.md).
- Update the package README when you change what a package does.

Before you push, run:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm test:browser
```

## Open the pull request

Open it against `main`. We squash merge, and the pull request title becomes the commit message, so write it as a [Conventional Commit](https://www.conventionalcommits.org/) with the package as the scope: `feat(vue): expose the page count`, `fix(core): keep the selection after a zoom`. Commits carry the title only, with no body. A Git hook checks your local commits the same way.

[release-please](https://github.com/googleapis/release-please) builds the changelog and each release from those titles, and the six packages share one version number.

By contributing, you agree to license your work under the [MIT licence](LICENSE).
