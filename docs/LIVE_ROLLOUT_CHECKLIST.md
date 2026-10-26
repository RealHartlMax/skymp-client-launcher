# Abnahme nach Veröffentlichung

Stand: **26.10.2026**, Launcher **0.2.0**. Diese Liste beschreibt Prüfungen auf den Zielsystemen; offene Punkte werden nicht durch einen lokalen Build automatisch erledigt. Die bisherigen Nachweise stehen in [STATUS.md](STATUS.md).

## Bereits nachgewiesen

- [x] Windows-Launcher mit TypeScript/Vite und Tauri im Releaseprofil gebaut.
- [x] 69 aktive Rust-Tests bestanden; drei gesonderte Integrationsprüfungen ausgenommen.
- [x] Portable EXE-/ZIP-Dateien, Produktversion, Prüfsummen und passende Symbole geprüft.
- [x] Automatisches Schließen des Splashscreens sowie Fehler-/Vorbereitungsfälle in DE/EN/RU simuliert geprüft.
- [x] Nutzer meldet erfolgreichen Spielstart und Bewegung mit der separat bereitgestellten nativen Runtime.

## 1. GitHub-Launcher-Release

- [ ] Tag und Quellcommit des gewünschten Builds stimmen überein.
- [ ] EXE, portables ZIP und `SHA256SUMS` aus dem Release-Ordner `upload/` veröffentlicht.
- [ ] Releasetext seit v0.1.0 eingefügt; interne Diagnoseordner nicht hochgeladen.
- [ ] Öffentlich heruntergeladene EXE und ZIP stimmen mit den veröffentlichten SHA-256-Werten überein.
- [ ] Start auf einem weiteren Windows-PC mit Steam, WebView2 und unterstützter Skyrim-Version geprüft.

## 2. PHP-Webhosting

- [ ] DNS und gültiges HTTPS für Hauptseite, API, Verwaltung, Serverbrowser, UPDATE, DOCS und DEV geprüft.
- [ ] Jeder Webroot enthält nur die passende Domain-Ausgabe samt eigenen Styles/Schriften/Flaggen.
- [ ] Bestehende `config.php`, Konten, Serverdaten und geschützte Speicher erhalten.
- [ ] API-Health, Serverliste und die erforderlichen Master-Routen funktionieren.
- [ ] Registrierung, Anmeldung, Passwort-zurücksetzen und Mailzustellung geprüft.
- [ ] Optionale Discord-Webanmeldung und ausdrückliche Kontoverknüpfung geprüft.

Die aktuellen Konfigurationsschritte stehen in [PHP_HOSTING.md](PHP_HOSTING.md). Alte Registry-Schemabeispiele dürfen die vorhandene Dashboard-Identität nicht ersetzen. JSON-/MySQL-Daten werden nicht durch leere Beispielbestände überschrieben.

## 3. Gameserver und Ressourcen

- [ ] Richtiger Server-Build installiert; eigene Konfiguration, Welten, Mods, Schlüssel und Gamemode erhalten.
- [ ] Spielport (`7777/UDP` oder konfiguriert) und öffentlicher Dateiserver erreichbar; interne Prozesssteuerung bleibt lokal.
- [ ] Launcher-Anbindung im Server-Adminpanel gespeichert; Name und Spielerlimit stammen aus dessen Konfiguration.
- [ ] Heartbeat meldet den richtigen Server und aktualisiert Status/Spielerzahlen.
- [ ] Offline-Meldung bzw. Heartbeat-Ausfall wird im Web und Launcher sichtbar.
- [ ] `logo.png` und `banner.png` im Serverordner erscheinen nach dem Heartbeat korrekt.
- [ ] Manifest und alle referenzierten Downloadpfade funktionieren; keine Schlüssel oder Spiel-Originaldateien werden veröffentlicht.
- [ ] Ressourcenansicht erkennt Mods; gespeicherte Ladereihenfolge stimmt mit der tatsächlichen Serverkonfiguration überein.
- [ ] Bei Backend-/Dashboard-Updates wurde der gesamte Dienst einschließlich Dashboard neu gestartet.

## 4. Native Runtime und Spielablauf

- [ ] Vollständiges Clientpaket für die Ziel-Spielversion bereitgestellt; neue Versionsdateien vor dem Katalog veröffentlicht.
- [ ] Vorbereitung ohne Spielstart, Kaltstart und Cache-Wiederverwendung geprüft.
- [ ] SKSE und Ingame-Oberfläche laden, Steam-Zugang und serverseitige Freigabe funktionieren.
- [ ] Spielername und bestätigte Steam-ID erscheinen im Server-Dashboard; Profil öffnet ohne vorherigen REST-Listenabruf.
- [ ] Charakter laden/erstellen, bewegen, wiederverbinden und längere Sitzung geprüft.
- [ ] Mehrere Spieler, vorgesehene Mods, Serverwechsel und Wiederherstellung geprüft.
- [ ] Splash verschwindet nach Startbestätigung, Fehler bleiben verständlich und der Launcher bleibt nach Spielende bedienbar.

## 5. DEV und Crashreports

- [ ] DEV/Reports, API und Verwaltung nach der [DEV-Anleitung](DEV_PORTAL_SETUP.de.md) auf dem PHP-Webhosting eingerichtet.
- [ ] Nicht freigegebene Konten können keine Berichte lesen; Speicherdaten sind nicht öffentlich abrufbar.
- [ ] Lokaler Export, Import und ein zustimmungsbasierter Testupload geprüft.
- [ ] Speicherung nach Jahr/Monat/Tag und Bericht-ID, Größenlimits und Aufbewahrung funktionieren.
- [ ] Minidumps erfordern eigene Freigabe; passende interne Symbole sind zum tatsächlichen Build archiviert.

## 6. Downloadseite und Dokumentation

- [ ] Launcher-Assetname, Datei-Hash und Downloadadresse stimmen mit dem tatsächlich angebotenen Build überein.
- [ ] Nur verfügbare Aktualisierungskanäle werden angeboten; GitHub-Release und Website-Manifeste wurden bewusst getrennt aktualisiert.
- [ ] DE/EN/RU-Handbücher wurden aus den aktuellen Quellen gerendert; Links, Suche und Mobilansicht geprüft.

Datum, Versionen, Zielhosts und Ergebnisse jeder tatsächlichen Abnahme notieren. Diese Dokumentation führt keinen Commit, Push, Upload oder Spielstart aus.

## English / Русский

Local builds and a reported gameplay success are recorded above. All remaining checkboxes require a real check of the published assets or target host. Preserve existing state, keep the launcher/runtime/server/web releases separate, and do not infer deployment from a successful package test.

Выше отмечены локальная сборка и подтверждённый пользователем игровой результат. Остальные пункты требуют проверки опубликованных файлов или целевого сервиса. Сохраняйте данные и проверяйте лаунчер, runtime, сервер и сайты раздельно.
