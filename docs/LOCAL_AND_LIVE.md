# Lokal prüfen und gezielt veröffentlichen

Stand: **26.10.2026**. Build und Veröffentlichung sind getrennte Arbeitsschritte. Die Zuordnung verhindert, dass ein Launcher-Upload versehentlich als Server- oder Webupdate behandelt wird.

| Änderung | Ausgabe / Ziel | Anleitung |
| --- | --- | --- |
| Windows-Launcher | EXE, portables ZIP, `SHA256SUMS` → GitHub-Release | [RELEASING.md](RELEASING.md) |
| Native Spiel-Runtime | Unveränderliches Clientpaket → Runtime-Host, Katalog zuletzt | [RUNTIME_UPDATES.md](RUNTIME_UPDATES.md) |
| Gameserver oder dessen Dashboard | Serverpaket → vorhandener VPS-Serverordner | Server-Fork und dessen Update-Anleitung |
| PHP-/statische Website | Genau ein Domain-ZIP je Webroot | [PHP_HOSTING.md](PHP_HOSTING.md) |
| Betreiberhandbuch | Markdown → statischer DOCS-Webroot | [Dokumentation](README.md) |

## Launcher 0.2.0 auf GitHub

Die vorbereiteten Assets stehen unter `local-builds/releases/v0.2.0/upload/`. **Nur dessen drei Dateien** hochladen. Der Releasetext steht daneben in `RELEASE-NOTES.md`; `portable/`, `diagnostics/` und sonstige lokale Dateien gehören nicht zu den Release-Assets.

Ein manueller GitHub-Tag und ein Release sind auch ohne GitHub Actions möglich. Der Zielcommit muss zum gebauten Stand passen. Die aktuellen Release-Versionen in npm, Cargo und Tauri sind `0.2.0`; ein Dokumentationsupdate berechnet keine neue Version und verschiebt keine Tags.

Ein vorhandener Tag wird durch die Auswahl eines Branchs nicht automatisch umgehängt. Git-Branches wie `main` und Tags wie `v0.2.0` sollten verschieden heißen, damit Push-Ziele eindeutig bleiben.

## Webseiten im PHP-Webhosting

Alle sieben Domains behalten eigene Webroots. Jeweils den **Inhalt** des passenden Pakets hochladen; `index.html` bzw. `index.php` liegt direkt im Domain-Verzeichnis. Kein gemeinsamer öffentlicher Projektordner ist erforderlich.

Gemeinsame Gestaltung wird aus `web/shared/` in die domain-eigenen `assets/` kopiert. Die Domain-Dateien referenzieren ihre eigene Kopie. Eine separate öffentliche CSS-Subdomain ist nicht nötig.

DEV, API und Verwaltung laufen auf PHP-Webhosting. Der Gameserver läuft separat auf dem VPS. Webhosting-Pfade sind keine VPS-Pfade. Report-Konfiguration wird nicht in `server-settings.json` eingetragen. Einrichtung: [DEV DE](DEV_PORTAL_SETUP.de.md), [EN](DEV_PORTAL_SETUP.en.md), [RU](DEV_PORTAL_SETUP.ru.md).

## Server anbinden

Servereintrag und Schlüssel werden in der zentralen Verwaltung zugeordnet. Die Werte werden in der Browser-Ersteinrichtung bzw. **Einstellungen → Launcher-Anbindung** des entfernten Gameservers gespeichert. Das zentrale Dashboard hat keinen Dateizugriff auf dessen Konfiguration.

Name, Spielerlimit, Logo und Banner kommen vom Gameserver. Die Ressourcenansicht im Server-Adminpanel erkennt hochgeladene Mods und verwaltet deren Ladereihenfolge. Der Steam-Zugang nutzt den Spielserver; eine zusätzliche Webanmeldung hängt von dessen Policy ab. Handbuch: [DE](SERVER_OWNER_GUIDE.de.md), [EN](SERVER_OWNER_GUIDE.en.md), [RU](SERVER_OWNER_GUIDE.ru.md).

## Lokale Prüfungen und Webpakete

Mit vollständigen lokalen Webquellen und geeigneter PHP-Laufzeit:

```powershell
node tests/php-master-smoke.mjs
node tests/crash-reports.mjs
node tests/dev-portal.mjs --webroot-reports
```

Handbücher und Webassets vorbereiten:

```powershell
node scripts/build-docs.mjs
./scripts/package-web.ps1 -OutputDirectory ./local-builds/web-NEW
```

Der Ausgabeordner muss neu sein. Das Paketwerkzeug erzeugt sieben unabhängige ZIPs. Mit `-Domains docs.skymp-worlds.net` lässt sich gezielt nur die Dokumentationsdomain verpacken. Es veröffentlicht nichts und enthält keine produktiven Konfigurationen, Konten, Datenbanken, Schlüssel oder Reports.

Testdaten, lokale Dumps und Release-Diagnoseordner bleiben lokal. Eine bestandene Simulation oder Paketprüfung ist keine Abnahme von Produktionsdatenbank, SMTP, OAuth oder Mehrspielerbetrieb.

## Optionale Node-Referenz

`master-api/` benötigt Node.js 24+, hat eigene Daten/Konten und ersetzt nicht die vorhandenen PHP-Dashboard-Konten. `npm test` und `npm run preview` werden in diesem Ordner ausgeführt. Die lokalen Vorschau-Skripte starten nur diese Referenz. Sie sind keine Anleitung, Node auf PHP-Webhosting oder auf dem Gameserver-VPS nachzurüsten.

## English / Русский

Upload only the three launcher assets to GitHub. Each PHP/static domain has its own ZIP and webroot; the game server and native runtime are separate. Production settings and reports must be retained. Local tests and manual publication are recorded independently.

В GitHub загружаются только три файла лаунчера. Для каждого PHP-/статического сайта предусмотрены свой ZIP и корневая папка; игровой сервер и runtime публикуются отдельно. Настройки и отчёты сохраняются, локальные проверки не заменяют проверку боевых сервисов.
