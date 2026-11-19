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

The build downloads a prebuilt PDFium archive for `@inkbar/engine`. To build offline, set `INKBAR_PDFIUM_ARCHIVE` to a local copy of it.

The [README](README.md#development) shows how to run the sandbox and the review apps, and what each directory holds.

## Make the change

- Add or update tests with the change. Unit tests sit next to the code as `*.test.ts`, browser tests as `*.browser.test.ts`, and component tests as `*.ct.ts` or `*.ct.tsx`. The end-to-end suite lives in `apps/e2e-shared`.
- A change to a component lands in all three bindings: Vue, React and Svelte.
- Every coordinate is in PDF user space: points, origin bottom-left, before `/Rotate`. Only `packages/core/src/dom/transform.ts` converts to CSS pixels.
- Import PDF.js only under `packages/core/src/pdfjs/`. The one exception is the engine's tests, where PDF.js is an independent reader of the files the engine writes.
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

## Smoke tests in real browsers

Every suite above runs in Playwright's Chromium on Linux. The smoke tests run a short list of checks in real browsers: real Safari on a Mac, and Safari on an iPhone and an iPad, Chrome on an Android phone, and Edge and Firefox on Windows 11 through [BrowserStack](https://www.browserstack.com/).

The checks live in one page of the sandbox, `apps/sandbox/src/smoke/`, served at `/smoke/`. They are written once and run through each front end in turn: `?front=vanilla` (`createViewer`), `?front=vue`, `?front=react` and `?front=svelte`, one per page load, so a failure in one cannot hide another. Each front end mounts its binding's own components. Inside the browser, the page checks that:

- the engine's WebAssembly loads in its worker and opens a file;
- a page renders, its text layer holds its text, and the thumbnails render;
- an annotation added through the model shows, undo removes it and redo restores it, and a save writes it into the file;
- a text selection, made by script with the browser's Selection API, becomes a highlight over that text;
- Print prepares the file with the right page count, without opening the print dialog;
- switching to French relabels the toolbar in place, and search finds a word;
- applying a redaction through the binding's own apply removes the text, the binding hands over the redacted file and reopens it, no undo step remains, `checkRedaction` finds the place clean, and Download hands over the redacted file;
- a form field takes text typed by script, a field the form's scripts calculate updates (PDF.js runs those scripts in a second WebAssembly module), and the values survive a save;
- an internal link and an outline entry each change the page;
- a locked file asks for its password, refuses a wrong one and opens with the right one.

A check that needs an earlier one's result is skipped, with the reason, when that one fails. The page shows the results as text, keeps them on `window.__inkbarSmoke`, and POSTs them to the URL in `?report=` when there is one. On the phones and tablets, the BrowserStack run also taps a tool button, and on Android it draws with a finger and pinches to zoom, once, on the plain DOM page. BrowserStack's iOS automation has no touch drag or multi-touch, so those two gestures are not tested on iOS.

`.github/workflows/smoke.yml` runs them on release pull requests, on pull requests that change the smoke page, its scripts or the workflow, and by hand from the Actions tab. They are not required checks. The sandbox's own suite also opens the page in Chromium (`apps/sandbox/e2e/smoke.spec.ts`), so ordinary CI covers the page itself.

To run them locally, build the sandbox first:

```sh
pnpm exec turbo run build --filter=@inkbar/sandbox
pnpm --filter @inkbar/smoke serve   # serves it at http://127.0.0.1:3010/smoke/
```

Open that URL, with `?front=` set, in any browser to see the results. For real Safari on a Mac, allow automation once with `sudo safaridriver --enable`, then, with the sandbox served, run the four front ends:

```sh
pnpm --filter @inkbar/smoke safari
```

In CI the Safari job passes `--slow-runner`, which gives every wait on the page 20 seconds more. On GitHub's macOS runner, Safari stops a page for about 15 seconds, once or twice, when a document with form fields is first shown or replaced: its GPU process does not answer the request to create a canvas, and WebKit waits out a timeout before it replaces that process. The system log says so (`RemoteImageBufferProxy::ensureBackendCreated` timed out, then `GPUProcess … became unresponsive, terminating it`). Real Macs do not do this, so local runs and the BrowserStack devices keep the short waits, and a slow page still fails there. Each check's result notes the longest time the page stopped, when it was over a second.

The BrowserStack run reads `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` from the environment. It serves the sandbox, starts the BrowserStack Local tunnel, runs one session per target, five at a time, loads the four front ends in turn in each session, and stops the tunnel. Each session uses the account's minutes, so run one target first:

```sh
pnpm --filter @inkbar/smoke browserstack --project=iPhone
pnpm --filter @inkbar/smoke browserstack
```

The targets are in `apps/smoke/browserstack/targets.ts`. In CI the BrowserStack job runs only when the repository variable `BROWSERSTACK_SMOKE` is `true` and the repository secrets `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` are set. A pull request from a fork gets no secrets, so the job skips its steps and passes. A manual run from the Actions tab can also leave the job out, to save the account's minutes.

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

It builds `@inkbar/core` first if its locales are missing or out of date. Drafts go to `<lang>-missing.ts` and comparisons to `<lang>-compare.md`, in `$TMPDIR/inkbar-translate` unless you pass `--out`. Drafts and comparisons always go outside the repository, and the script never edits `<lang>.ts`. Only `--accept` writes inside the repository, to `<lang>.sources.json`. Read each draft before you paste it in. Use the words other PDF tools use, keep labels as short as the English, and use formal German ("Sie").

### Add a language

1. Create `packages/core/src/locales/<lang>.ts` as a stub, and add a `locales/<lang>` entry to `packages/core/tsdown.config.ts`. The script only works on languages that have a locale file.

   ```ts
   import type { InkMessages } from '../messages/types'

   export const it = { lang: 'it' } as InkMessages
   ```

2. Run `pnpm translate --lang <lang>`. Every key is missing from the stub, so the draft holds them all, grouped as in `fr.ts`.
3. The draft is not a whole file. It holds the groups only. Paste them into the stub's object after `lang: '<lang>'`. Change `as InkMessages` to a type annotation (`export const it: InkMessages = { … }`), import `plural` and `template` as `fr.ts` does, and correct the strings by hand.
4. Add the language to `shipped` in `packages/core/src/locales/locales.test.ts`, then run `pnpm translate --accept <lang> --all`.

## Open the pull request

Open it against `main`. We squash merge, and the pull request title becomes the commit message, so write it as a [Conventional Commit](https://www.conventionalcommits.org/) with the package as the scope: `feat(vue): expose the page count`, `fix(core): keep the selection after a zoom`. Commits carry the title only, with no body. A Git hook checks your local commits the same way.

[release-please](https://github.com/googleapis/release-please) builds the changelog and each release from those titles, and the seven packages share one version number.

## Releasing

Merging the release pull request publishes a GitHub release, and `.github/workflows/release.yml` then builds the tag and publishes every package to npm. The workflow holds no npm token. It uses npm trusted publishing: each package's settings on npm name this workflow as a trusted publisher.

npm lets you add a trusted publisher only to a package that already exists. So a package new to npm needs two steps by hand before the first release that includes it:

1. Publish the package once by hand, from a build of `main`, with an npm account that can publish to the `@inkbar` scope.
2. In the package's settings on npm, add a trusted publisher for GitHub Actions: the `inkbar/inkbar` repository and the `release.yml` workflow.

Until both are done, the release workflow fails for that package and may stop the other packages from publishing. All seven packages are set up. `@inkbar/engine` was added this way before 0.16.0; the first six were published by this workflow with an npm token and moved to trusted publishing afterwards.

By contributing, you agree to license your work under the [MIT licence](LICENSE).
