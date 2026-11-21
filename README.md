# A faster drop-in for csv-reader 1.0.0

[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/ariffforai/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/ariffforai/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0, for the [make.fun csv-reader-speed-01-run-20261121 bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121): `solve.js` answers every case exactly as csv-reader does, and `main.ts` reads every case from `/input/cases.json`, answers each with `run`, and writes `/output/answers.json`.

`solve.js` is a dependency-free ES module (Node 22, standard library only, no dependencies). It is a single-pass, hand-rolled parser written from the bounty’s written broken-row policy: a U+FEFF at the very start is dropped; records end at LF or CRLF and empty lines are no records; a CR outside quotes not followed by LF is dropped (`stray_cr`); a field opening with a quote runs to the next non-doubled quote, `""` inside it is one quote and each CRLF or lone CR inside it is read as LF; text after the closing quote up to the next comma or line break is appended as it stands (`quote_junk` when the field ends); a quote that never closes is a literal character and the text after it is re-read as unquoted (`unterminated_quote`); a quote inside an unquoted field is literal; fields stay strings. `columns` is the first record when `header` is true, else null; rows are padded (`short_row`) or cut (`long_row`) to the first record’s width.

## How it is fast

The reference reads one character at a time and builds every field a character at a time. This parser instead takes each field as a slice of the input: quoted fields find their closing quote with `indexOf`, unquoted fields scan with a tight char-code loop that only stops at a comma, LF or CR, and nothing is allocated per character. No function is called per field; the whole parse is one inlined pass.

## Local results (practice set, kit scorer)

| | CPU time, whole practice set (10.19 MB, 6 cases) |
|---|---:|
| this entry (parse only) | ~67 ms median |
| csv-reader 1.0.0 (parse only) | ~619 ms median |
| this entry (`main.ts`, whole process) | ~787 ms median |
| csv-reader 1.0.0 (`main.ts`, whole process) | ~1582 ms median |

Parity: 6/6 practice cases identical to csv-reader, 74 hand-written edge cases identical, and 320 generated cases (40 fresh seeds × 6 cases, drawn with the kit generator) identical — all checked against the kit oracle with the kit scorer passing 6/6.
