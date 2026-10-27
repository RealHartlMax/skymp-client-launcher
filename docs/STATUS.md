# Projektstand und Prüfnachweise

Stand: **27. Oktober 2026**. Aktuelle Launcher-Version: **0.2.1**. Diese Übersicht unterscheidet implementierte Funktionen, automatisierte lokale Prüfungen und Rückmeldungen aus dem Spiel.

## Implementierter Stand

| Bereich | Vorhanden | Grenze / weitere Arbeit |
| --- | --- | --- |
| Desktop | Suche, Details, Favoriten/Verlauf, Direktverbindung, mehrere Profile, Länderflaggen, Online-/Offline-Status | Detailliertere Download-/Modübersicht |
| Dateien | Manifest v2, Größen/SHA-256, Unterordner, Cache/Reparatur, Ladereihenfolge und reversibler Serverwechsel | Teildownloads, Retry-Regeln und Cache-Limits |
| Runtime | Externe Versionskataloge, PE-Versionsprüfung, passende Client-/SKSE-/Address-Library-Pakete | Jede neue native Ausgabe und Modkombination separat im Spiel prüfen |
| Anmeldung | Steam-Ticket, Server-Policy, zusätzliche Spielernamen und bedarfsabhängige Legacy-Kontoanmeldung | Erfordert passende Serverimplementierung und gültige Serverkonfiguration |
| Oberfläche | DE/EN/RU, Streamer-Modus, optionaler Hintergrundklang und Discord-Aktivität | Betrieb von Discord/OAuth separat prüfen |
| Start und Diagnose | Splash mit Fortschritt und automatischem Schließen nach Startbestätigung; echte Prozess-/Exitcode-Beobachtung; zustimmungsbasierte Crashreports | Vollständige Mehrspieler-/Langzeitabnahme je Freigabe |
| Veröffentlichung | Windows-x64-EXE, portables ZIP, Lizenzen, SHA-256 und Authenticode-Prüfung; automatischer Release blockiert ohne Signatur | Signieranbieter fehlt; Kandidat ist unsigniert; signierter Selbstupdateablauf ist nicht implementiert |

## Aktueller Windows-Release

Die lokal vorbereitete Ausgabe liegt unter `local-builds/releases/v0.2.1/`. Der zugehörige Quellcommit steht in BUILD-INFO.json und im Tag v0.2.1. Die Paketprüfung dokumentiert die saubere Arbeitskopie und SHA-256. Git-Tag und GitHub-Release-Veröffentlichung sind getrennte Schritte.

Die vier Dateien unter `upload/` sind GitHub-Release-Assets:

- `SkyMP-Launcher-v0.2.1.exe`
- `SkyMP-Launcher-v0.2.1-Full-windows-x64.zip`
- `SkyMP-Launcher-v0.2.1-Update-windows-x64.zip`
- `SHA256SUMS`

`portable/` ist der Rohinhalt des ZIPs; `diagnostics/` enthält lokale Protokolle und passende Debugsymbole. Beide Ordner gehören nicht zusätzlich zum Upload. Tag und GitHub-Release werden manuell eingerichtet; ihre Veröffentlichung wird aus dem lokalen Build nicht abgeleitet.

Am 26.10.2026 bestanden:

- TypeScript-/Vite-Produktionsbuild und Windows-x64-Tauri-Releasebuild.
- **74 Rust-Tests**, **0 fehlgeschlagen**, **3 separate Integrationsprüfungen ausgenommen**; einschließlich nativer Dokumente-/Systemabfragen.
- Prüfung aller 13 Full- und 10 Update-Dateien gegen Größen und SHA-256; identische EXE in beiden ZIPs.
- Passende EXE/PDB-Symbole über GUID und Age; Symbole bleiben im Diagnoseordner.

Nachweise: `local-builds/releases/v0.2.1/VALIDATION.json` und die Protokolle in dessen `diagnostics/`. Die EXE mit SHA-256 `8c18cd09c61b4454060a8bcb2f5afb10db63d14408a0165405b15c05ca7059d1` bestand den lokalen Defender-Dateiscan mit Signaturen `1.461.211.0`, Dateiausnahmen ignoriert und Bereinigung deaktiviert. Sie ist **nicht signiert**. Ein Download-/Starttest auf anderen Rechnern, SmartScreen und eine Microsoft-Fehlalarmentscheidung sind offen; siehe [Antivirus-Befund](ANTIVIRUS.md). Diese lokalen Builddateien sind nicht Teil des Git-Repositorys.

Die Splash-Änderung wurde für v0.2.0 zusätzlich mit der echten React-Komponente und einer simulierten Tauri-Schnittstelle in DE/EN/RU geprüft: noch laufende Vorbereitung, automatisches Schließen bei Erfolg, sichtbarer Startfehler und Vorbereitung ohne Spielstart. Diese Oberfläche wird durch den 0.2.1-Hotfix nicht verändert. Das ist ein früherer UI-Nachweis, kein neuer Steam-/Serversitzungstest.

## Spielrückmeldung und externe Runtime

Der Nutzer hat mit der separat bereitgestellten nativen Runtime einen erfolgreichen Start und Bewegung in der Spielwelt ohne den zuvor gemeldeten Absturz bestätigt. Die Threadpool-, CEF- und Tint-Korrekturen gehören zum separaten nativen Client im Server-Fork und sind nicht in die Launcher-EXE eingebaut.

Diese Rückmeldung ist ein konkreter Fortschritt, keine Freigabe aller Spielversionen, Server, Mods oder langen Mehrspielersitzungen. Server- und Runtime-Pakete haben eigene Versionen, Prüfsummen und Abnahmen.

## Web- und Serverstand

Dokumentiert sind sieben getrennte PHP-/statische Webroots, der Steam-/Legacy-Vertrag, der DEV-Reportdienst und die Server-Schnittstellen. Änderungen an Webseiten, Datenbanken, SMTP, OAuth, VPS und Dashboard müssen auf den jeweiligen Zielhosts geprüft werden. Ein erreichbarer Host oder ein bestandener lokaler Test ersetzt diese Abnahme nicht.

Die lokale Spielerprofil-Korrektur im Server-Fork und das zugehörige VPS-Update sind vom Launcher-Release getrennt. Ein neuer Launcher-Build übernimmt diese Serverkorrektur nicht.

## English / Русский

The 0.2.1 Windows launcher candidate is built and packaged locally, with 74 passing Rust tests and three excluded integration tests. Its exact EXE passed a local Defender file scan with file exclusions ignored and remediation disabled, but remains unsigned. Real download/start on other PCs and SmartScreen remain unverified. The earlier startup/movement report concerns the separate native runtime; no tag or upload is implied.

Кандидат лаунчера 0.2.1 для Windows собран локально: 74 теста пройдены, три отдельные интеграционные проверки исключены. Итоговая EXE прошла локальное сканирование Defender с игнорированием исключений и без исправления, но не подписана. Реальное скачивание/запуск на других ПК и SmartScreen не проверены. Прежнее подтверждение запуска и движения относится к отдельной нативной среде; тег и публикация не выполнялись.

Weiter: [Roadmap](../ROADMAP.md), [Release-Anleitung](RELEASING.md), [Live-Abnahme](LIVE_ROLLOUT_CHECKLIST.md).
