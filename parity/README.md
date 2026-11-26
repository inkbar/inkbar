# @inkbar/parity

Draws the first three pages of every fixture that opens with both of core's readers, PDF.js and the engine, with and without the form layer, reads their text, links, outline, facts, form fields, annotations, Tab order and JavaScript, and checks each fixture against the verdicts `parity.json` records for it. Private: never published.

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

## The form layer

`src/parity.browser.test.ts` also draws the pages a person sees on a form: for every compared page that holds a widget of a form field in either reader, it mounts the page with `createPageMount` from `@inkbar/core/dom`, as the viewer does, at 2 pixels per point and pixel ratio 1. The page canvas leaves the fields' widgets out, and the form layer draws each widget's appearance into a canvas of its own. The check copies the page canvas, then each appearance canvas the layer shows, at the place the layer puts it and in the layer's order, and compares the two readers' copies with the checks above. It captures canvases only: the form layer's HTML controls and the other DOM layers stay out.

A widget whose look either reader's layer hands to its HTML control (a script changed its value or colour) or hides (a script hid it) shows no appearance canvas, so the check leaves it out of both copies and takes both copies in one step. Which widgets those are depends on what the file's scripts have run by then: `form-timer` bumps a field every 50 ms. For a fixture compared with its baseline, the check compares the engine's copy with that baseline.

A page without fields is not drawn again and counts as the same. Its verdict is `formLayer` in `parity.json`, apart from the page's own: a page whose drawing differs can match with the form layer on, and the other way round. `.report/form-layer-measures.json` holds every page's numbers.

## Text, links, outline, fields, annotations and scripts

More checks read what each reader gives besides pixels, for every fixture that opens. Each holds its own verdict in `parity.json`.

- **Text** (`src/text.browser.test.ts`). For each compared page, the check reads both readers' text with exact character boundaries and joins it the way search joins it (core's `searchableText`), with whitespace runs collapsed to one space and the ends trimmed. The two strings must be equal. Then the check pairs the characters that are not whitespace and measures how far apart the readers put them, as a fraction of the font size:
  - Where both items holding a character carry `advances`, the check compares the character's centre: the middle of its share of its item's box, cut at the item's `advances`, which rise along the box for left-to-right and vertical text and fall for right-to-left text.
  - Where either item has none, the check compares stretches of the same characters instead. A stretch is a run of consecutive characters in one item without `advances`, or in one on each side when both lack them. Each side places a character's start and end at equal shares in an item without `advances` and at the `advances` of an item that has them. Inside a stretch the check compares every item boundary on either side: where a character is the first of the stretch or the first in its item on either side, the check compares the two sides' starts of that character, and where it is the last of the stretch or the last in its item on either side, their ends. So an item moved on either side, the middle one of a stretch included, is measured against where the other side puts the same characters, whichever way each side splits the stretch into items. Where one side has no character positions, a boundary inside its item is placed by equal shares, so in a proportional font a difference there can come from that estimate and not from a moved glyph. `TextItem.advances` documents that an item without them gives each character an equal share, and core's PDF.js reader gives right-to-left items no `advances`, so a per-character centre there would measure that estimate against the engine's glyphs.

  Every distance must be within `TEXT_TOLERANCE`. A box, boundary or font size that is not a finite number counts as a difference. The check pairs characters, so the readers may split a line into runs at different places.

- **Links** (`src/links.browser.test.ts`). On every page of the file, both readers must give the same links in the same order: the same count, and for each link the same id, `order`, target and quads, and a rect within 0.01 pt. The check compares a destination by where it goes, as each reader resolves it: both readers write an explicit destination's array as PDF.js does, but the engine holds its numbers in single precision. Two explicit destinations that go nowhere count as equal.
- **Outline** (same file). The same tree: for each item its title, bold, italic, open, resolved destination and number of children.

- **Facts and form fields** (`src/form.browser.test.ts`). The title, author and whether the file is encrypted, as `facts()` gives them. Then the fields `form()` gives, paired by full name: the same fields in the same order, and for each field every key, its widgets paired by id in their order with every key of each, on-states and actions included.
- **Annotations and Tab order** (`src/annotations.browser.test.ts`). On every page of the file, the annotations `annotations(page)` gives, paired by id: the same ones in the same order, each with every key. Then the page's structure order of annotation ids, `tabOrder(page)`.
- **JavaScript** (`src/scripts.browser.test.ts`). Whether the file has any, the document scripts paired by name with each source compared as text, the document actions, the calculation order and the field entries `scripts()` gives, and every page's actions from `pageScripts(page)`.

These three compare core's own shapes. A `rect` may be 0.01 pt apart, as a link's; every other number, string and list must be equal, and a key one reader leaves out counts as different unless the other leaves it out too. Two fields of one name pair in turn, the first with the first. When the readers give different things, the check names each one only one reader gives, or, with the same number on both sides, each place whose name or id differs.

A failure names each difference: the character where the two strings first differ, or the worst character and its distance; the link or outline item and the field, with both readers' values; the field, widget, annotation or script and the key, with both readers' values, and for a long string the first character where they differ.

`src/search.browser.test.ts` runs the queries core's own search tests run, on the same fixtures, with each reader. Both readers must find the same number of hits, on the same pages, with the same text, and the centre of each hit's quads must lie within `TEXT_TOLERANCE` of the other reader's. It has no verdicts: any difference fails.

### How the tolerance was chosen

`TEXT_TOLERANCE` is 0.25 of the font size. We measured every fixture with text, as for the pixel constants. A report run writes the numbers to `.report/text-measures.json`: per page, `charOffset` for characters compared by their own boundaries, `itemOffset` for stretches compared at their item boundaries, and `heightRatio`, the lowest and highest ratio of the engine's box height to PDF.js's.

- Box heights match. The engine reader stands each box on the font's ascent and descent as PDF.js does (`fontMetrics` in core's engine reader says which figures), so the ratio of the engine's box height to PDF.js's is 1 on every page but `corpus-type3`'s, where it is 0.962: PDF.js scales a Type 3 font's size by the height of its glyph space, /FontBBox times /FontMatrix (1.04 there), and the engine reports neither.
- Characters compared by their own boundaries: the noise ceiling is 0.066 (`unembedded-greek`), then 0.065 (`redact-text-rotated`, unembedded Helvetica on a baseline turned 30 degrees), 0.040 (`redact-text-vertical`), 0.036 (`text-search`) and 0.021 (`corpus-type3`, from the Type 3 size above). Every other page measures at most 0.0005. The first four lie along the run, not across it: in `unembedded-greek`, `redact-text-rotated` and `redact-text-vertical` at the end of a run, where the engine's last glyph box reaches past the advance PDF.js ends the run at (on a turned baseline that box is upright, so it reaches further; Ahem's glyphs stand 1.28 pt lower in their cells than the font's /DW2 puts them, so down a column the last one reaches past it), and in `text-search` inside a kerned word.
- Stretches compared at their item boundaries: the noise ceiling is below 0.000001 (the Hebrew line of `text-rtl`).
- No real difference in where the readers put characters remains: the real differences left change the text itself.

The limit was set at twice the noise ceiling of the time, 0.123, when the engine reader's boxes were taller than PDF.js's. It stays there: it still catches a character moved by 0.3 of the font size, which the unit tests pin. To get a fixture past it, record the difference in `parity.json`; leave the constant alone.

## parity.json

One entry per fixture that opens:

- `{ "state": "same" }`: every page compared must be the same, and at least one reader must draw something on it. Two blank pages match whatever went wrong, so a page both readers draw pure white fails.
- `{ "state": "same", "blank": true }`: for a fixture whose compared pages are meant to be empty. Both readers must draw every one of them pure white.
- `{ "state": "different", "reason": "...", "accepted": false }`: every compared page must differ. With `"pages": [2, 3]` (counting from 1), the listed pages must differ and every other compared page must be the same, so a new difference on a page that matches today still fails. The reason says what differs and, where known, which drawing feature causes it. Only the project owner sets `accepted` to `true`. When a recorded difference goes away, the test fails with "page N is now the same: update parity.json".
- `{ "state": "baseline", "reason": "..." }`: PDF.js cannot be the reference (it draws text in fonts the file does not embed with whatever fonts the machine has), so the test compares the engine's drawing with `baselines/<fixture>-<page>.png`, the engine's own committed output, and skips PDF.js.
- `{ "state": "skipped", "reason": "..." }`: one reader does not open the file, or the readers count its pages differently. The test checks that this still holds.

An entry that is not `skipped` may also hold `text`, `links`, `outline`, `facts`, `form`, `annotations`, `scripts` and `formLayer`, each `{ "state": "same" }` or `{ "state": "different", "reason": "...", "accepted": false }` with the same rules, `pages` included. A missing key means `same`. The outline, facts, form fields and JavaScript are each read once for the whole file and take no `pages`. Links and annotations are compared on every page, so their verdicts' `pages` may list any page of the file. Text and the form layer list compared pages.

Whatever the verdict, both readers must agree on each page's box (within 0.01 pt), rotation and user unit, and on the page count. A fixture with no entry fails with "no verdict recorded". The unit tests check the file's shape: a known `state`, a non-empty `reason` where the state needs one, a boolean `accepted`, valid `pages`, no unknown keys, and an entry for every fixture that opens and nothing else.

## Commands

Run from the repository root. The engine needs its PDFium archive (`INKBAR_PDFIUM_ARCHIVE`, as for `@inkbar/engine`), and `@inkbar/core` and `@inkbar/engine` must be built.

```sh
pnpm --filter @inkbar/parity test --maxWorkers=4           # unit tests: compare, parity.json
pnpm --filter @inkbar/parity test:browser --maxWorkers=4   # the suite, in headless Chromium
```

The report: `PARITY_REPORT=1 pnpm --filter @inkbar/parity test:browser` writes `parity/.report/index.html` with every page that is not the same, most different first: the PDF.js (or baseline) image, the engine image, a difference image (over a faded copy of the page: red where the blurred images differ, blue for unmatched pixels, orange for differing flat areas), the numbers and the recorded reason. `PARITY_REPORT=all` lists every page. Both also write `parity/.report/measures.json` with every page's numbers. The text check writes `parity/.report/text.html` in the same way: for each page listed, the two strings with the first difference (or the worst character) marked, and the engine's drawing with both readers' item boxes and character centres over it, PDF.js's in blue and the engine's in red. Beside each page's image is a JSON file of both readers' text, and `text-measures.json` holds every page's worst offset. The link check writes `parity/.report/links.html` with each page's link differences and the outline's. The form layer check writes `parity/.report/form-layer.html` with the same images and numbers as `index.html`. The facts and form, annotation and script checks write `form.html`, `annotations.html` and `scripts.html`, each a table with one row per difference: fixture, part, page, verdict, reason and the difference. A report run empties the folder first. Git ignores it.

Baselines: `PARITY_BASELINE=unembedded-japanese pnpm --filter @inkbar/parity test:browser -t unembedded-japanese` writes that fixture's PNGs under `parity/baselines/`. Several fixtures can be given, separated by commas. Look at the images before committing them.
