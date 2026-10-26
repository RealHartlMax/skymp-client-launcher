# Lokal prüfen und veröffentlichen

Die Werkzeuge ändern lokale Dateien. Sie führen keinen Commit, Push oder Upload aus.
Für den vorhandenen **PHP-Webspace mit eigenständigen Subdomains** gilt
[PHP_HOSTING.md](PHP_HOSTING.md). Der Online-Master läuft dort vollständig in PHP,
verwendet die vorhandenen Dashboard-Konten und benötigt keinen Node-Dienst.

## Vorhandenes Hosting

Jede Domain behält ihren eigenen Webroot. Der Inhalt des passenden Website-Ordners
wird direkt dort hochgeladen; ein gemeinsamer öffentlicher `web/`-Ordner ist unnötig.
Die gemeinsame Gestaltung aus `web/shared/worlds.css` wird in jeden Webroot nach
`assets/worlds.css` kopiert. Das Upload-Werkzeug erledigt das automatisch.

Der Startseiten-Button führt zum vorhandenen PHP-Dashboard unter
<https://manage.skymp-worlds.net/index.php>. Nach dem PHP-Update leitet auch
<https://api.skymp-worlds.net/account> dorthin weiter. Die API spricht den PHP-Master
im Dashboard über HTTPS an; es gibt keine Includes über Domain-Ordnergrenzen.

Im Dashboard beim Server **Launcher & Online-Anmeldung** öffnen, Download-Adressen
speichern und die vier angezeigten Werte in die bestehende Serverkonfiguration
übernehmen. Die übrigen Einstellungen und die Ladereihenfolge bleiben bestehen.
Der Launcher prüft Dateien und startet SKSE. Die Anmeldung im Spiel verwendet
anschließend dasselbe Dashboard-Konto und eine ausdrückliche Bestätigung im Browser.
Die vollständigen Upload-, Konfigurations- und Prüfschritte stehen in PHP_HOSTING.md.

## Entwicklerbereich auf dem Webhosting

DEV, API und Verwaltung werden auf dem PHP-Webhosting eingerichtet. Der VPS ist
für den Gameserver zuständig. Nach dem ZIP-Upload die drei config.php-Dateien und
den privaten Hosting-Pfad gemäß [DEV_PORTAL_SETUP.de.md](DEV_PORTAL_SETUP.de.md)
einrichten. Keine Web-Konfiguration in server-settings.json auf dem VPS eintragen.

## Paket und Tests

Die aktuelle lokale Ausgabe liegt unter `local-builds/current/`: Launcher-EXE,
sieben einzelne Website-ZIPs unter `web/` und das Clientpaket unter `client-runtime/`.
`VALIDATION.json` dokumentiert Version, Prüfsummen und Prüfungen;
`CLEANUP.json` nennt die entfernten alten Build- und Testpfade.
Die lokale PHP-Testlaufzeit liegt getrennt unter `local-builds/tools/`.

```powershell
./scripts/package-web.ps1 -OutputDirectory D:/GitHub/skymp-client-launcher/local-builds/web-php-NEW
node tests/php-master-smoke.mjs
cd launcher
npm run test:backend
npm run test:fork -- --build D:/GitHub/skymp/build --workspace ../local-builds/fork-php-NEW --online --php-master
```

Der Ausgabeordner muss neu sein. Er enthält sieben unabhängige ZIP-Dateien, eine pro Domain
mit der richtigen CSS-Kopie; ein Sammel-ZIP wird nicht erzeugt. Echte Konfigurationen, Konten, Datenbanken,
Schlüssel, Logs und Abhängigkeiten werden ausgeschlossen. Die Tests verwenden eigene,
isolierte Webroots und eine Kopie des Forks. Das produktive Spiel und der produktive
Server werden nicht verändert. Das Runtime-Paket wird gemäß
[CONNECTING.md](CONNECTING.md) separat erstellt und enthält keine Skyrim-Originaldateien.

## Optionale Node-Referenz für Entwicklung

`master-api/` bleibt als eigenständige Referenz für denselben nativen Vertrag erhalten.
Sie wird auf dem vorhandenen PHP-Webspace nicht benötigt und standardmäßig nicht
mitgepackt. Sie hat eigene Konten, die nicht mit den PHP-Dashboard-Konten geteilt werden.

```powershell
cd master-api
npm test
npm run preview
```

Voraussetzung dafür: Node.js 24+. Die Referenzvorschau ist unter
<http://127.0.0.1:8787/> erreichbar; das Referenz-Kontoportal liegt unter `/account`.
Sie verwendet eigene Daten unter `local-builds/web-preview/`, ohne Demo-Konten.
`./scripts/start-local-preview.ps1` und `./scripts/stop-local-preview.ps1` starten bzw.
stoppen nur diese optionale Node-Vorschau. Für die PHP-Abnahme den PHP-Test verwenden.
`-IncludeNodeReference` beim Paketwerkzeug nimmt die Referenz zusätzlich auf.

## Versionierung

Der Gesamtumfang ist `feat`/Minor: Servervorbereitung, Online-Anmeldung und neues Layout.
Nach dem Entfernen des entfernten `v0.2.0`-Tags ist `v0.1.0` der vorgesehene Basistag;
bei `feat` wird daraus `0.2.0`. Die Auto-Tag-Pipeline berechnet die Version aus dem
letzten Git-Tag und den Commit-Nachrichten. Ein anderer Basistag oder eine Nachricht
mit Breaking-Change-Markierung würde die Berechnung ändern.
Eine reine Umlaut- oder Linkkorrektur wäre `fix`/Patch. Die Versionsdateien sind lokal
auf **0.2.0** vorbereitet. Es werden keine Tags, Commits oder Pushes ausgeführt.
