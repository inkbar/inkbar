# Fixture fonts

Font programs that `generate-scripts.ts` embeds in fixtures.

| File                         | What it is                                                                                  | Where it came from                                                                                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NotoSansHebrew-Regular.ttf` | Noto Sans Hebrew Regular, unhinted TrueType, version 3.001, used by `text-rtl`.             | `NotoSansHebrew/unhinted/ttf/NotoSansHebrew-Regular.ttf` in the release archive https://github.com/notofonts/hebrew/releases/download/NotoSansHebrew-v3.001/NotoSansHebrew-v3.001.zip (archive SHA-256 `df0a71814b4e63644cf40fcc4529111b61266b7a2dafbe95068b29a7520cc3cb`), unchanged. |
| `OFL.txt`                    | The SIL Open Font License 1.1 and the copyright line of the Noto Project Authors.           | `OFL.txt` at the top of the same archive, unchanged.                                                                                                                                                                                                                                   |
| `NotoSansJP-subset.otf`      | Noto Sans JP Regular, version 2.004, cut down to 日本語のテキスト, used by `text-vertical`. | Cut from `files/NotoSansJP-Regular.otf` of `@inkbar/fonts` 1.0.0 (SHA-256 `dff723ba59d57d136764a04b9b2d03205544f7cd785a711442d6d2d085ac5073`) with HarfBuzz 15.0.0, as shown below.                                                                                                    |
| `NotoSansJP-OFL.txt`         | The SIL Open Font License 1.1 and the copyright line of Noto Sans CJK.                      | The Noto Sans CJK section of `OFL.txt` in `@inkbar/fonts` 1.0.0, unchanged.                                                                                                                                                                                                            |

The Noto Sans JP subset was cut with:

```
hb-subset NotoSansJP-Regular.otf --text='日本語のテキスト' --no-hinting \
  --drop-tables+=name,GPOS,GDEF,GSUB,DSIG,BASE,VORG -o NotoSansJP-subset.otf
```

It holds nine glyphs, `.notdef` and the eight characters, as CID-keyed CFF in an OpenType
wrapper. HarfBuzz numbers the glyphs afresh and keeps each glyph's CID in the CFF charset, and
the generator reads the CIDs from there. The vertical origins (`VORG`) are left out: every glyph
the subset holds has the default origin, 880 units above the baseline, which the fixture states in
its `/DW2`. Its copyright line is `Copyright 2014-2021 Adobe (http://www.adobe.com/). Noto is a
trademark of Google Inc.` The licence declares no Reserved Font Name.

SHA-256 of the files as committed:

```
04272f5600d0ec816d31d0df73b23aa8d3501ea359ebe820da31c11ffcf00853  NotoSansHebrew-Regular.ttf
9b9fe028b5ba74d231659a1bbaf0ed09b11e759d1ca6a070999e16d151616b47  OFL.txt
db8acf25638846348d47c2cdeca69e98d4a64f4887260a90bea000c8c4d857c9  NotoSansJP-subset.otf
822ac6867bfc75f4d609e5fe7e144484c115cb66a0b32770527f9f0dff538ea2  NotoSansJP-OFL.txt
```

The fonts are licensed under the SIL Open Font License 1.1, which allows them to be embedded in
and redistributed with these test files.
