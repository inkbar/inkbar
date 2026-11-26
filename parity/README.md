# @inkbar/parity

Checks that core's reader still draws and reads every fixture the way it did when the results under `baselines/` were committed. A failure means the output changed: a fix or upgrade in core or the engine moved pixels or data. Private: never published.

## What it checks

The suite runs in headless Chromium over every fixture the manifest marks as opening. It opens each one with `openDocument`, the manifest's password included, and reads it through `doc._reader`. That is internal to core, and this package is the only place outside core that uses it.

- **Pages** (`src/pages.browser.test.ts`). The first three pages, or fewer when the file has fewer, drawn whole at 1 pixel per point, pixel ratio 1, at the page's own `/Rotate`, with nothing hidden. Each must match `baselines/<fixture>/page-<n>.png` pixel for pixel.
- **The form layer** (`src/form-layer.browser.test.ts`). Each of those pages that holds a form field's widget, mounted with `createPageMount` as the viewer mounts it. The capture copies the page canvas, which leaves the widgets out, then each appearance canvas the form layer shows, at its place and in the layer's order. The HTML controls and the other DOM layers are left out, so a widget whose look the layer hands to its HTML control, or hides, shows nothing. Each must match `baselines/<fixture>/form-layer-<n>.png` pixel for pixel.
- **Data** (`src/data.browser.test.ts`). Seven parts, each kept as JSON in `baselines/<fixture>/<part>.json` and compared as text:

  | File               | What it holds                                                                                                                                                             |
  | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `facts.json`       | The title, author and whether the file is encrypted.                                                                                                                      |
  | `text.json`        | For each page drawn: the text as search joins it, then every run with its box, font and character boundaries. A run's `rect` is left out: it is the bounds of its `quad`. |
  | `links.json`       | Every page's links, each destination replaced by the page and place it resolves to.                                                                                       |
  | `outline.json`     | The outline.                                                                                                                                                              |
  | `fields.json`      | The form fields with their widgets.                                                                                                                                       |
  | `annotations.json` | Every page's annotations and its Tab order.                                                                                                                               |
  | `scripts.json`     | The file's JavaScript and each page's actions.                                                                                                                            |

  A part that holds nothing for a fixture has no file. Links, annotations and scripts list only the pages that hold some.

- **Placement** (`src/placement.browser.test.ts`). The baselines hold whole pages at their own `/Rotate`, so a region drawn in the wrong place would pass them. For `text-simple`, `text-rotated-90`, `cropbox-offset` and `userunit-2`, the test draws the first page whole and a region over two lines of its text, as the loupe draws one, at 2 pixels per unit. The region must equal the same area cut from the whole page, pixel for pixel, with the page turned a further 0, 90 and 270 degrees. One case moves the region's corner a quarter point, between two pixels. The engine places a page at whole pixels, so that region equals the area cut at the nearest whole pixel, half rounded up. A last case moves the region 1 pt and checks the test sees it.

Search is not checked here. Core's own search tests run their queries on the same fixtures and pin the hits, and `text.json` holds the text and positions search matches against.

## Why exact

The engine draws inside WebAssembly, with its own fonts and the fallback fonts this package's test server serves from `@inkbar/fonts`, and core puts its pixels on the canvas unchanged. Nothing the suite captures goes through the browser's text drawing or image decoding. The form layer's appearance canvases are copied onto one canvas at whole pixels. So the same commit gives the same pixels on any machine, and the suite allows no tolerance.

This was checked when the baselines were written. The suite passed unchanged in an Ubuntu 24.04 container with another Node and Chromium build. It also passed with the browser's GPU and 2D canvas acceleration off and on, with a forced colour profile, with a device scale factor of 2, and with two different font configurations.

## The JSON

`src/stable-json.ts` writes the same data as the same text, so a reviewer sees only lines that changed:

- Object keys are sorted.
- Every number is rounded to four decimals: a ten-thousandth of a point for a position, a ten-thousandth of a run for a character boundary. `-0` is written as `0`.
- A list or object that fits on a line of 100 characters is written on one line. A longer list of numbers or strings is packed several to a line. Anything else gets one entry per line.

Nothing in the files depends on the machine or the time: dates and ids come from the fixture files.

## Running it

Run from the repository root. The engine needs its PDFium archive (`INKBAR_PDFIUM_ARCHIVE`, as for `@inkbar/engine`), and the packages must be built: `pnpm turbo run build --filter=@inkbar/parity... --concurrency=2`.

```sh
pnpm --filter @inkbar/parity test --maxWorkers=4           # unit tests
pnpm --filter @inkbar/parity test:browser --maxWorkers=4   # the suite
```

## Reading a failure

Each failure names the fixture in the test's name and the file it was held to:

- `page 2 differs from parity/baselines/text-simple/page-2.png: 12 pixels differ, within 4 × 3 px at (100, 200)`.
- `links differs from parity/baselines/links/links.json:` with one line per value that changed, named by its place in the file: `[0].links[0].rect.x: was 69, now 68`.
- `no baseline at parity/baselines/...`: a page, form layer drawing or part that has none. The suite never writes a missing baseline on its own.
- A file under `baselines/` that the suite no longer reads fails the last test of the file that owns its kind: a page or form layer drawing that is no longer drawn, a part that the suite no longer reads, or a fixture that no longer opens. The data test also fails on any name that is not a baseline's.

`PARITY_REPORT=1` writes what differs to `parity/.report/`, starting from an empty folder. Open `index.html`: it links a page for each kind. A drawing shows the baseline, the drawing now, and the baseline faded with each differing pixel in red. Data shows the lines above. The placement test writes its drawings to `.report/placement/`. CI sets `PARITY_REPORT=1` and keeps the folder as an artifact of a failed run. Git ignores it.

## Updating baselines

`PARITY_BASELINE=<fixture>[,<fixture>...]` rewrites the named fixtures' baselines, pixels and data, and deletes their files the suite no longer reads. `PARITY_BASELINE=all` rewrites every fixture's. Add `-t <fixture>` to run only those fixtures:

```sh
PARITY_BASELINE=text-simple pnpm --filter @inkbar/parity test:browser -t text-simple
```

Writing a fixture's baselines again from the same commit gives the same bytes, so `git status` shows only what the change moved.

When you review a baseline change:

- Open the old and new images side by side, or run the suite with `PARITY_REPORT=1` before rewriting to see each difference marked. Check every changed page is one the change was meant to move.
- Read the JSON diff. Many numbers moved by the same amount point to a shift; a changed string means the text read differs.
- A new or deleted file means a page, form layer drawing or part appeared or went away. Check the reason in the change's description.

The baselines are only as good as the engine's output when they were written. Do not rewrite them to make a failure go away without knowing why the output moved.

## Excluded

- **`form-timer` with the form layer.** A script bumps a field every 50 ms, so what the form layer shows depends on when the capture runs. Its page drawing and data still have baselines. The list is `TIMED` in `src/form-layer.browser.test.ts`. Every other drawing with the form layer gave the same pixels in five runs in a row.
- **Pages after the third.** Links, annotations and scripts are read on every page; drawings and text only on the first three.

## Size

The baselines must stay under 15 MB (`du -sb parity/baselines`). They hold about 5.3 MB today: 228 pages, 31 drawings with the form layer and 458 JSON files for 190 fixtures. If a change takes them over, lower `PAGES_PER_FIXTURE` in `src/draw.ts` before lowering `PIXELS_PER_POINT`.
