# @inkbar/parity

Draws the first three pages of every fixture that opens with both of core's readers, PDF.js and the engine, and checks each fixture against the verdict `parity.json` records for it. Private: never published.

It opens each fixture twice with `openDocument`, once with `globalThis.__INKBAR_READER__ = 'engine'` set first and once without, and draws through `doc._reader.draw` at 2 pixels per point, pixel ratio 1, the page's own `/Rotate`, nothing hidden. That switch and `_reader` are internal to core. This package is the one place outside core that uses them.

## How two drawings are compared

`src/compare.ts` runs three checks, and two drawings are the same only when all three pass:

- **Blurred.** Both images are box-blurred by `BLUR_RADIUS` pixels, so antialiasing and pixel snapping wash out, and a pixel differs when any channel is more than `CHANNEL_TOLERANCE` apart. The differing pixels may cover at most `MAX_SHARE` of the page and `MAX_BLOCK` of any 16 × 16 block. The block limit catches one missing glyph; the share limit catches a difference spread thin over the page.
- **Unmatched.** Without the blur, a pixel is unmatched when, on some channel, it lies more than `SHIFT_TOLERANCE` below the darkest or above the lightest pixel of the other image's 3 × 3 neighbourhood. A stroke one reader snaps to whole pixels stays inside the other's range; a line the other leaves out does not. The longest straight run of unmatched pixels, across or down, may be at most `MAX_UNMATCHED_RUN` (30 pt). This catches a missing 0.5 pt rule, which the blur hides.
- **Flat.** Where both images are a single colour over the whole blur window, their colours may differ by at most `FLAT_TOLERANCE`, over at most `MAX_FLAT_SHARE` of the page and `MAX_FLAT_BLOCK` of any block. This catches a missing pale fill, which lies within `CHANNEL_TOLERANCE` of white.

We set the constants by measuring every fixture, and the unit tests pin what they must catch. To get a fixture past them, record the difference in `parity.json`; leave the constants alone.

## parity.json

One entry per fixture that opens:

- `{ "state": "same" }`: every page compared must be the same, and at least one reader must draw something on it. Two blank pages match whatever went wrong, so a page both readers draw pure white fails.
- `{ "state": "same", "blank": true }`: for a fixture whose compared pages are meant to be empty. Both readers must draw every one of them pure white.
- `{ "state": "different", "reason": "...", "accepted": false }`: every compared page must differ. With `"pages": [2, 3]` (counting from 1), the listed pages must differ and every other compared page must be the same, so a new difference on a page that matches today still fails. The reason says what differs and, where known, which drawing feature causes it. Only the project owner sets `accepted` to `true`. When a recorded difference goes away, the test fails with "page N is now the same: update parity.json".
- `{ "state": "baseline", "reason": "..." }`: PDF.js cannot be the reference (it draws text in fonts the file does not embed with whatever fonts the machine has), so the test compares the engine's drawing with `baselines/<fixture>-<page>.png`, the engine's own committed output, and skips PDF.js.
- `{ "state": "skipped", "reason": "..." }`: one reader does not open the file, or the readers count its pages differently. The test checks that this still holds.

Whatever the verdict, both readers must agree on each page's box (within 0.01 pt), rotation and user unit, and on the page count. A fixture with no entry fails with "no verdict recorded". The unit tests check the file's shape: a known `state`, a non-empty `reason` where the state needs one, a boolean `accepted`, valid `pages`, no unknown keys, and an entry for every fixture that opens and nothing else.

## Commands

Run from the repository root. The engine needs its PDFium archive (`INKBAR_PDFIUM_ARCHIVE`, as for `@inkbar/engine`), and `@inkbar/core` and `@inkbar/engine` must be built.

```sh
pnpm --filter @inkbar/parity test --maxWorkers=4           # unit tests: compare, parity.json
pnpm --filter @inkbar/parity test:browser --maxWorkers=4   # the suite, in headless Chromium
```

The report: `PARITY_REPORT=1 pnpm --filter @inkbar/parity test:browser` writes `parity/.report/index.html` with every page that is not the same, most different first: the PDF.js (or baseline) image, the engine image, a difference image (over a faded copy of the page: red where the blurred images differ, blue for unmatched pixels, orange for differing flat areas), the numbers and the recorded reason. `PARITY_REPORT=all` lists every page. Both also write `parity/.report/measures.json` with every page's numbers. A report run empties the folder first. Git ignores it.

Baselines: `PARITY_BASELINE=unembedded-japanese pnpm --filter @inkbar/parity test:browser -t unembedded-japanese` writes that fixture's PNGs under `parity/baselines/`. Several fixtures can be given, separated by commas. Look at the images before committing them.
