# @inkbar/parity

Draws the first three pages of every fixture that opens with both of core's readers, PDF.js and the engine, and checks each fixture against the verdict `parity.json` records for it. Private: never published.

It opens each fixture twice with `openDocument`, once with `globalThis.__INKBAR_READER__ = 'engine'` set first and once without, and draws through `doc._reader.draw` at 2 pixels per point, pixel ratio 1, the page's own `/Rotate`, nothing hidden. That switch and `_reader` are internal to core. This package is the one place outside core that uses them.

`src/placement.browser.test.ts` checks what the main suite does not: a page turned on top of its own `/Rotate`, and a region of a page, as the loupe draws one. For `text-simple`, `text-rotated-90`, `cropbox-offset` and `userunit-2` it draws the whole first page turned a further 90 and 270 degrees, and a region over two lines of text at the page's own turn and turned a further 90, with both readers, and each pair must be the same. It does not read `parity.json`. Each page is drawn at 2 pixels per unit, so `userunit-2` is drawn at zoom 1. One case is marked as failing: a region whose top edge falls between two pixels, which the engine draws half a pixel away from PDF.js because it places a page at whole pixels.

## How two drawings are compared

`src/compare.ts` runs three checks, and two drawings are the same only when all three pass:

- **Blurred.** Both images are box-blurred by `BLUR_RADIUS` pixels, so antialiasing and pixel snapping wash out, and a pixel differs when any channel is more than `CHANNEL_TOLERANCE` apart. The differing pixels may cover at most `MAX_SHARE` of the page and `MAX_BLOCK` of any 16 × 16 block. The block limit catches one missing glyph; the share limit catches a difference spread thin over the page.
- **Unmatched.** Without the blur, a pixel is unmatched when, on some channel, it lies more than `SHIFT_TOLERANCE` below the darkest or above the lightest pixel of the other image's 3 × 3 neighbourhood. A stroke one reader snaps to whole pixels stays inside the other's range; a line the other leaves out does not. The longest straight run of unmatched pixels, across or down, may be at most `MAX_UNMATCHED_RUN`: 60 px, which is 30 pt at 2 px per point. This catches a missing 0.5 pt rule at least 30 pt long, which the blur hides.
- **Flat.** Where both images are a single colour over the whole blur window, their colours may differ by at most `FLAT_TOLERANCE`, over at most `MAX_FLAT_SHARE` of the page and `MAX_FLAT_BLOCK` of any block. This catches a missing pale fill, which lies within `CHANNEL_TOLERANCE` of white.

We set the constants by measuring every fixture, and the unit tests pin what they must catch. To get a fixture past them, record the difference in `parity.json`; leave the constants alone.

### How the constants were chosen

Each check's limit sits between the highest value measured on a page judged the same (the noise ceiling) and the lowest value of a real difference (the signal), at 2 px per point in Chromium.

| Check     | Constant                                                          | Noise ceiling on a `same` page                                                                                  | Signal                                                                                  | Limit                                                                   |
| --------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Blurred   | `BLUR_RADIUS` 4, `CHANNEL_TOLERANCE` 48                           | at radius 2, text noise reached a worst block of 0.34, as high as a missing glyph; at radius 4 it falls to 0.03 | a missing 1 pt rule is about 57 levels after the blur                                   | below 40 the noise rises fast; above 48 a missing 1 pt rule slips       |
| Blurred   | `MAX_BLOCK` 0.2                                                   | worst block 0.109 (`form-fieldmdp`), then 0.094, 0.070, 0.051                                                   | 0.328, the smallest real difference (`corpus-annots`, a 12 × 6 px arrow)                | catches 155 of 168 erased glyph parts of 40 px or more on `text-simple` |
| Blurred   | `MAX_SHARE` 0.001                                                 | 0.0037%                                                                                                         | real differences start at 0.04%                                                         | about 2,000 px spread over an A4 page                                   |
| Unmatched | `SHIFT_TOLERANCE` 48, `MAX_UNMATCHED_RUN` 60 px                   | longest run 30 px (`redact-text-vertical`); at tolerance 32 it is 59 px, at 24 it is 108 px                     | runs on `different` pages reach 456 px; a missing 1 px black rule 360 px long gives 360 | twice the noise ceiling                                                 |
| Flat      | `FLAT_TOLERANCE` 8, `MAX_FLAT_SHARE` 0.0001, `MAX_FLAT_BLOCK` 0.1 | 0 at every tolerance from 6 to 16                                                                               | up to 21% (`corpus-matte`)                                                              | about 200 px on an A4 page, near the smallest area the check can see    |

### What the comparison cannot see

A drawing that leaves out any of these still passes as `same`:

- a rule shorter than 30 pt (60 px), or a diagonal one: runs are counted only across and down;
- a dashed or dotted rule, whose dashes each make a short run;
- a pale hairline, lighter than about `#D0` on white, which stays within `SHIFT_TOLERANCE` of its neighbourhood;
- a line within 1 px of other dark content, such as an underline touching descenders or a rule beside a border: the dark content widens the other image's neighbourhood range;
- a pale shape narrower than 9 px, which is never flat over the blur window;
- a flat tint within 8 levels of the other image;
- a small glyph part such as a dot: about 8% of glyph parts of 40 px or more are missed, and most smaller ones.

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
