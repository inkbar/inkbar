# Fixture fonts

Font programs that `generate-scripts.ts` embeds in fixtures.

| File                         | What it is                                                                        | Where it came from                                                                                                                                                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NotoSansHebrew-Regular.ttf` | Noto Sans Hebrew Regular, unhinted TrueType, version 3.001, used by `text-rtl`.   | `NotoSansHebrew/unhinted/ttf/NotoSansHebrew-Regular.ttf` in the release archive https://github.com/notofonts/hebrew/releases/download/NotoSansHebrew-v3.001/NotoSansHebrew-v3.001.zip (archive SHA-256 `df0a71814b4e63644cf40fcc4529111b61266b7a2dafbe95068b29a7520cc3cb`), unchanged. |
| `OFL.txt`                    | The SIL Open Font License 1.1 and the copyright line of the Noto Project Authors. | `OFL.txt` at the top of the same archive, unchanged.                                                                                                                                                                                                                                   |

SHA-256 of the files as committed:

```
04272f5600d0ec816d31d0df73b23aa8d3501ea359ebe820da31c11ffcf00853  NotoSansHebrew-Regular.ttf
9b9fe028b5ba74d231659a1bbaf0ed09b11e759d1ca6a070999e16d151616b47  OFL.txt
```

The font is licensed under the SIL Open Font License 1.1, which allows it to be embedded in and
redistributed with these test files.
