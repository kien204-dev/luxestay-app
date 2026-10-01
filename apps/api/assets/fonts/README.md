# Fonts

`NotoSans-Regular.ttf` — Noto Sans (variable font), used to render Vietnamese
diacritics correctly in generated PDF reports (`dashboardController.js`).
pdfkit's built-in standard fonts (Helvetica etc.) have no Vietnamese glyph
coverage, so PDF text needs an embedded Unicode font instead.

Source: https://github.com/google/fonts/blob/main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf
License: SIL Open Font License 1.1 (see `OFL.txt` in this folder) — free to
embed/redistribute in software.
