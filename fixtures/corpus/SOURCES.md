# Corpus sources

These PDFs come from the PDFium test resources, `testing/resources` in the `inkbar/pdfium` fork at
commit `7b7eb2b9f2598ae324022dcf2613b76acab4abc2`. PDFium is licensed under the BSD 3-Clause
licence (the `LICENSE` file at the top of that repository), whose BSD 3-Clause text reads:

```
Copyright 2014 The PDFium Authors

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

   * Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above
copyright notice, this list of conditions and the following disclaimer
in the documentation and/or other materials provided with the
distribution.
   * Neither the name of Google Inc. nor the names of its
contributors may be used to endorse or promote products derived from
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

The files are here to compare how renderers draw them. Each is used unchanged, except the ones
marked "expanded": the fork keeps those as `.in` templates, and each was turned into a PDF with
the fork's `testing/tools/fixup_pdf_template.py --output-dir <dir> <file>.in`, which fills in the
byte offsets and writes nothing else.

| File                                 | Source                                               | Features                                            |
| ------------------------------------ | ---------------------------------------------------- | --------------------------------------------------- |
| `shade.pdf`                          | `pixel/shade.in (expanded)`                          | axial-shading, radial-shading, mesh-shading, clip   |
| `shade-tensor.pdf`                   | `pixel/shade-tensor.in (expanded)`                   | mesh-shading, clip                                  |
| `radial_shading_point_at_center.pdf` | `pixel/radial_shading_point_at_center.in (expanded)` | radial-shading                                      |
| `gradient_pattern_stroke_order.pdf`  | `gradient_pattern_stroke_order.pdf`                  | axial-shading                                       |
| `bug_1258968.pdf`                    | `pixel/bug_1258968.in (expanded)`                    | mesh-shading, tiling-pattern, soft-mask, icc-colour |
| `pattern_fill.pdf`                   | `pattern_fill.pdf`                                   | tiling-pattern                                      |
| `pattern_stroke_uncolored.pdf`       | `pattern_stroke_uncolored.pdf`                       | tiling-pattern                                      |
| `embedpdf_tiling_patterns.pdf`       | `embedpdf_tiling_patterns.pdf`                       | tiling-pattern                                      |
| `alpha_composite.pdf`                | `pixel/alpha_composite.in (expanded)`                | blend-mode                                          |
| `matte.pdf`                          | `matte.pdf`                                          | soft-mask                                           |
| `bug_1845.pdf`                       | `pixel/bug_1845.in (expanded)`                       | soft-mask, clip                                     |
| `type3.pdf`                          | `pixel/type3.in (expanded)`                          | type3-font                                          |
| `embedpdf_chrome_type3_text.pdf`     | `embedpdf_chrome_type3_text.pdf`                     | type3-font                                          |
| `jpxdecode.pdf`                      | `pixel/jpxdecode.in (expanded)`                      | jpeg2000                                            |
| `bug_1469.pdf`                       | `pixel/bug_1469.in (expanded)`                       | jpeg2000                                            |
| `bug_1396264.pdf`                    | `bug_1396264.pdf`                                    | jpeg2000                                            |
| `bug_1236.pdf`                       | `pixel/bug_1236.in (expanded)`                       | jbig2, soft-mask                                    |
| `bug_631912.pdf`                     | `bug_631912.pdf`                                     | jbig2                                               |
| `transfer_function.pdf`              | `pixel/transfer_function.in (expanded)`              | jbig2, ccitt                                        |
| `bug_1746.pdf`                       | `pixel/bug_1746.in (expanded)`                       | type3-font, ccitt, clip                             |
| `bug_1087.pdf`                       | `pixel/bug_1087.pdf`                                 | jbig2, ccitt                                        |
| `bug_42270471.pdf`                   | `bug_42270471.pdf`                                   | icc-colour                                          |
| `bug_1479436.pdf`                    | `pixel/bug_1479436.in (expanded)`                    | icc-colour                                          |
| `bug_1768.pdf`                       | `bug_1768.pdf`                                       | clip                                                |
| `bug_1558.pdf`                       | `bug_1558.pdf`                                       | clip                                                |
| `bug_1883.pdf`                       | `pixel/bug_1883.in (expanded)`                       | rotated-page                                        |
| `rectangles_multi_pages.pdf`         | `rectangles_multi_pages.pdf`                         | rotated-page                                        |
| `dashed_lines.pdf`                   | `dashed_lines.pdf`                                   | dash                                                |
| `long_dashed_line.pdf`               | `pixel/long_dashed_line.in (expanded)`               | dash                                                |
| `bug_1822.pdf`                       | `pixel/bug_1822.in (expanded)`                       | dash                                                |
| `text_render_mode.pdf`               | `text_render_mode.pdf`                               | text-render-mode                                    |
| `bug_1388.pdf`                       | `pixel/bug_1388.in (expanded)`                       | text-render-mode                                    |
| `bug_842.pdf`                        | `pixel/bug_842.in (expanded)`                        | axial-shading                                       |
| `bug_557320961.pdf`                  | `pixel/bug_557320961.in (expanded)`                  | blend-mode                                          |
| `bug_1976.pdf`                       | `pixel/bug_1976.in (expanded)`                       | soft-mask                                           |
| `bug_1399.pdf`                       | `bug_1399.pdf`                                       | cropped-page, dash                                  |
| `annots.pdf`                         | `annots.pdf`                                         | cropped-page                                        |

What each file draws is in `fixtures/manifest.json`, under the file's `describes` entry.
