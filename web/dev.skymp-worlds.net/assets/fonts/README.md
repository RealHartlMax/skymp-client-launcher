# Local Noto fonts

Noto Sans is used for navigation, forms and body text; Noto Serif for titles.
Both variable fonts include weights 400–700 and Latin, extended Latin,
Cyrillic and extended Cyrillic subsets. German umlauts and Russian text are covered.
Browsers request only the subsets a page uses.

The files are served locally, with no Google Fonts request at runtime.
File names contain their SHA-256 prefix. `sources.json` records the official
Google Fonts download URLs and complete hashes, downloaded on 2026-10-21.
The SIL Open Font License and copyright notice are included in `OFL.txt`.

Run `node scripts/sync-web-assets.mjs` after changing shared assets.
Every independent webroot receives its own complete copy. The launcher imports
the same `design-system.css` through Vite and embeds the generated assets.
