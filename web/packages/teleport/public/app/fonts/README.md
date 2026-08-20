# Vendored UI fonts

These files are the font assets the Psiphon Access UI serves. They live in
this tree so the build does not read another checkout or the host font
directory.

| File | Family | Source |
|---|---|---|
| `InterVariable.woff2` | Inter | Inter 4.1, `web/InterVariable.woff2` from https://github.com/rsms/inter/releases/tag/v4.1 |
| `Inter-OFL.txt` | Inter | `LICENSE.txt` from that release |
| `DMMono-Regular.ttf` | DM Mono | https://github.com/googlefonts/dm-mono `exports/DMMono-Regular.ttf` at master |
| `DMMono-Medium.ttf` | DM Mono | `exports/DMMono-Medium.ttf` at master |
| `DMMono-OFL.txt` | DM Mono | SIL OFL 1.1, copyright line from that project's AUTHORS |

Do not replace these from `<brand-assets>` or any other host
path. If the face must change, replace the file here and record the new
upstream tag or commit.

These are the full released faces, not a subset. Subsetting and a measured
`unicode-range` remain `an internal issue`.
