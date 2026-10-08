# Fonts

The guest site and admin area use two typefaces, served from this folder (no
request to Google Fonts or any other host):

- `CormorantGaramond-Variable.woff2`, `CormorantGaramond-Italic-Variable.woff2`:
  Cormorant Garamond 4.001 (variable, weights 300–700), for headings.
- `BeVietnamPro-Regular.woff2`, `-Medium.woff2`, `-SemiBold.woff2`:
  Be Vietnam Pro 1.002 (weights 400, 500, 600), for everything else.

Both cover Vietnamese. They are declared in `src/index.css` with
`font-display: swap`, so text shows in the fallback font until they arrive.

License: SIL Open Font License 1.1 (see `OFL.txt` in this folder): free to
embed and redistribute in software.
