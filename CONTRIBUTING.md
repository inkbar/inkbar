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

## Translations

Inkbar ships English, French and German. Each is a complete message set in `packages/core/src/locales/`: `en` is the source, and `fr.ts` and `de.ts` follow its shape. Write labels with values using `template` and `plural`, so numbers and plural forms follow the language.

### Add or change a key

1. Add the key to `InkMessages` in `packages/core/src/messages/types.ts` and its English to `packages/core/src/messages/en.ts`.
2. Add the French and German to `fr.ts` and `de.ts`. Typecheck fails until every language has the key.
3. Record the English each translation was made from:

   ```sh
   pnpm translate --accept fr find.field
   pnpm translate --accept de find.field
   ```

Each language keeps the English its translations were made from in `<lang>.sources.json`. A unit test fails when a key's English changes and its translations don't, and names the key. If the old translation still fits, `--accept` it. Otherwise fix the translation first.

### Draft with the script

`pnpm translate` drafts translations with DeepL. It runs locally and never in CI. Set `DEEPL_AUTH_KEY` (or `DEEPL_API_KEY`) to your own key first. A key ending in `:fx` uses the free API. The script never prints the key.

```sh
pnpm translate                    # drafts missing and stale keys for fr and de
pnpm translate --lang de          # one language
pnpm translate --compare          # compares every shipped string with DeepL's
pnpm translate --accept fr --all  # records today's English for every French key
```

It builds `@inkbar/core` first if its locales are missing or out of date. Drafts go to `<lang>-missing.ts` and comparisons to `<lang>-compare.md`, in `$TMPDIR/inkbar-translate` unless you pass `--out`. The script refuses to write inside the repository, and it never edits the locale files. Read each draft before you paste it in. Use the words other PDF tools use, keep labels as short as the English, and use formal German ("Sie").

### Add a language

1. Create `packages/core/src/locales/<lang>.ts` as a stub, and add a `locales/<lang>` entry to `packages/core/tsdown.config.ts`. The script only works on languages that have a locale file.

   ```ts
   import type { InkMessages } from '../messages/types'

   export const it = { lang: 'it' } as InkMessages
   ```

2. Run `pnpm translate --lang <lang>`. Every key is missing from the stub, so the draft holds them all, grouped as in `fr.ts`.
3. Replace the stub with the draft, keeping `lang: '<lang>'` at the top and the type `InkMessages` without the cast, and correct it by hand.
4. Add the language to `shipped` in `packages/core/src/locales/locales.test.ts`, then run `pnpm translate --accept <lang> --all`.

## Open the pull request

Open it against `main`. We squash merge, and the pull request title becomes the commit message, so write it as a [Conventional Commit](https://www.conventionalcommits.org/) with the package as the scope: `feat(vue): expose the page count`, `fix(core): keep the selection after a zoom`. Commits carry the title only, with no body. A Git hook checks your local commits the same way.

[release-please](https://github.com/googleapis/release-please) builds the changelog and each release from those titles, and the six packages share one version number.

By contributing, you agree to license your work under the [MIT licence](LICENSE).
