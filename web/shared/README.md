# Gemeinsame Gestaltung

`design-system.css` ist die gemeinsame Grundlage von Web und Launcher: kühle
dunkle Flächen, goldene Akzente, Noto Sans für Texte und Bedienelemente, Noto Serif
für Titel. Farben, Schriftgrößen, Rundungen und Felder sind CSS-Variablen.

`worlds.css` enthält ausschließlich das vollständige Weblayout. Der Launcher
importiert dieselbe Grundlage und ergänzt seine Fenster- und Serveransichten in
`launcher/src/Worlds.css` und `ServerBrowser.css`.

Nach einer Änderung `node scripts/sync-web-assets.mjs` im Projektverzeichnis ausführen.
Alle sechs Webroots erhalten ihre eigenen CSS- und Schriftdateien. Die CSS-Verweise
werden anhand ihres Inhalts versioniert, einschließlich der importierten Dateien.
`assets/styles.css` ist nur ein Weiterverweis für ältere zwischengespeicherte Seiten.
Der frühere Theme-Mix und externe Google-Fonts-Einbindungen werden nicht geladen.

`platform.json` hält den offiziellen Community-Link und die Dokumentationsadresse. Navigation und Footer aller
Webbereiche sowie die Launcher-Community verwenden diesen Link. Vom Betreiber
eingetragene Webseiten und Discord-Adressen einzelner Server bleiben unabhängig.

`site.js` hält die gemeinsame Sprachsteuerung der statischen Plattformseiten.
Dokumentationslinks übernehmen die gewählte Sprache. Das Betreiberhandbuch unter
`docs.skymp-worlds.net` erzeugt vollständige statische Sprachfassungen aus den
Markdown-Quellen unter `docs/` und verwendet einen eigenen lokalen Suchindex.
`scripts/web-sites.json` ist das gemeinsame Verzeichnis der sechs Webroots für
Synchronisierung und Paketierung.

Die Domain-ZIPs sind eigenständig. Auf dem Webspace wird kein zusätzlicher
`shared`-Ordner benötigt. Stets die Seiten und ihren gesamten `assets`-Ordner
gemeinsam aktualisieren.
