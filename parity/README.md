# @inkbar/parity

Draws the first three pages of every fixture that opens with both of core's readers, PDF.js and the engine, and checks each fixture against the verdict `parity.json` records for it. Private: never published.

It opens each fixture twice with `openDocument`, once with `globalThis.__INKBAR_READER__ = 'engine'` set first and once without, and draws through `doc._reader.draw` at 2 pixels per point, pixel ratio 1, the page's own `/Rotate`, nothing hidden. That switch and `_reader` are internal to core. This package is the one place outside core that uses them.

## How two drawings are compared

`src/compare.ts` box-blurs both images by `BLUR_RADIUS` pixels, so antialiasing and pixel snapping wash out, then counts a pixel as differing when any channel is more than `CHANNEL_TOLERANCE` apart. Two drawings are the same when the differing pixels are at most `MAX_SHARE` of the page and at most `MAX_BLOCK` of any 16 × 16 block. The block limit catches one missing glyph; the share limit catches a difference spread thin over the page.

We set the constants by measuring every fixture, and the unit tests pin what they must catch. To get a fixture past them, record the difference in `parity.json`; leave the constants alone.

## parity.json

One entry per fixture that opens:

- `{ "state": "same" }`: every page compared must be the same, and at least one reader must draw something on it. Two blank pages match whatever went wrong, so a page both readers draw pure white fails.
- `{ "state": "same", "blank": true }`: for a fixture whose compared pages are meant to be empty. Both readers must draw every one of them pure white.
- `{ "state": "different", "reason": "...", "accepted": false }`: at least one page must differ. The reason says what differs and, where known, which drawing feature causes it. Only the project owner sets `accepted` to `true`. When the difference goes away, the test fails with "now the same: update parity.json": change the entry to `same`.
- `{ "state": "baseline", "reason": "..." }`: PDF.js cannot be the reference (it draws text in fonts the file does not embed with whatever fonts the machine has), so the test compares the engine's drawing with `baselines/<fixture>-<page>.png`, the engine's own committed output, and skips PDF.js.
- `{ "state": "skipped", "reason": "..." }`: one reader does not open the file, or the readers count its pages differently. The test checks that this still holds.

Whatever the verdict, both readers must agree on each page's box (within 0.01 pt), rotation and user unit, and on the page count. A fixture with no entry fails with "no verdict recorded".

## Commands

Run from the repository root. The engine needs its PDFium archive (`INKBAR_PDFIUM_ARCHIVE`, as for `@inkbar/engine`), and `@inkbar/core` and `@inkbar/engine` must be built.

```sh
pnpm --filter @inkbar/parity test --maxWorkers=4           # unit tests of compare
pnpm --filter @inkbar/parity test:browser --maxWorkers=4   # the suite, in headless Chromium
```

The report: `PARITY_REPORT=1 pnpm --filter @inkbar/parity test:browser` writes `parity/.report/index.html` with every page that is not the same, most different first: the PDF.js (or baseline) image, the engine image, a difference image (differing pixels red over a faded copy of the page), the numbers and the recorded reason. `PARITY_REPORT=all` lists every page. Both also write `parity/.report/measures.json` with every page's numbers. A report run empties the folder first. Git ignores it.

Baselines: `PARITY_BASELINE=unembedded-japanese pnpm --filter @inkbar/parity test:browser -t unembedded-japanese` writes that fixture's PNGs under `parity/baselines/`. Several fixtures can be given, separated by commas. Look at the images before committing them.
