# Projektstand und Prüfnachweise

Stand: **26. Oktober 2026**. Aktuelle Launcher-Version: **0.2.0**. Diese Übersicht unterscheidet implementierte Funktionen, automatisierte lokale Prüfungen und Rückmeldungen aus dem Spiel.

## Implementierter Stand

| Bereich | Vorhanden | Grenze / weitere Arbeit |
| --- | --- | --- |
| Desktop | Suche, Details, Favoriten/Verlauf, Direktverbindung, mehrere Profile, Länderflaggen, Online-/Offline-Status | Detailliertere Download-/Modübersicht |
| Dateien | Manifest v2, Größen/SHA-256, Unterordner, Cache/Reparatur, Ladereihenfolge und reversibler Serverwechsel | Teildownloads, Retry-Regeln und Cache-Limits |
| Runtime | Externe Versionskataloge, PE-Versionsprüfung, passende Client-/SKSE-/Address-Library-Pakete | Jede neue native Ausgabe und Modkombination separat im Spiel prüfen |
| Anmeldung | Steam-Ticket, Server-Policy, zusätzliche Spielernamen und bedarfsabhängige Legacy-Kontoanmeldung | Erfordert passende Serverimplementierung und gültige Serverkonfiguration |
| Oberfläche | DE/EN/RU, Streamer-Modus, optionaler Hintergrundklang und Discord-Aktivität | Betrieb von Discord/OAuth separat prüfen |
| Start und Diagnose | Splash mit Fortschritt und automatischem Schließen nach Startbestätigung; echte Prozess-/Exitcode-Beobachtung; zustimmungsbasierte Crashreports | Vollständige Mehrspieler-/Langzeitabnahme je Freigabe |
| Veröffentlichung | Windows-x64-EXE, portables ZIP, Lizenzen und SHA-256 für manuelle GitHub-Releases | Signierter Selbstupdateablauf ist nicht implementiert |

## Aktueller Windows-Release

Die lokal vorbereitete Ausgabe liegt unter `local-builds/releases/v0.2.0/`. Ihr Launcher-Quellstand ist Commit `e599a8145958d7850e6b8450d0f28c8ad98fb916`. Dokumentationsänderungen danach erzeugen keine neue EXE.

Nur die drei Dateien unter `upload/` sind GitHub-Release-Assets:

- `SkyMP-Launcher-v0.2.0.exe`
- `SkyMP-Launcher-v0.2.0-windows-x64.zip`
- `SHA256SUMS`

`portable/` ist der Rohinhalt des ZIPs; `diagnostics/` enthält lokale Protokolle und passende Debugsymbole. Beide Ordner gehören nicht zusätzlich zum Upload. Tag und GitHub-Release werden manuell eingerichtet; ihre Veröffentlichung wird aus dem lokalen Build nicht abgeleitet.

Am 26.10.2026 bestanden:

- TypeScript-/Vite-Produktionsbuild und Windows-x64-Tauri-Releasebuild.
- **69 Rust-Tests**, **0 fehlgeschlagen**, **3 separate Integrationsprüfungen ausgenommen**.
- Prüfung der zehn Dateien im portablen ZIP gegen Größen und SHA-256.
- Passende EXE/PDB-Symbole über GUID und Age; Symbole bleiben im Diagnoseordner.

Nachweise: `local-builds/releases/v0.2.0/VALIDATION.json` und die Protokolle in dessen `diagnostics/`. Diese lokalen Builddateien sind nicht Teil des Git-Repositorys.

Die Splash-Änderung wurde zusätzlich mit der echten React-Komponente und einer simulierten Tauri-Schnittstelle in DE/EN/RU geprüft: noch laufende Vorbereitung, automatisches Schließen bei Erfolg, sichtbarer Startfehler und Vorbereitung ohne Spielstart. Das ist ein UI-Nachweis, kein echter Steam-/Serversitzungstest.

## Spielrückmeldung und externe Runtime

Der Nutzer hat mit der separat bereitgestellten nativen Runtime einen erfolgreichen Start und Bewegung in der Spielwelt ohne den zuvor gemeldeten Absturz bestätigt. Die Threadpool-, CEF- und Tint-Korrekturen gehören zum separaten nativen Client im Server-Fork und sind nicht in die Launcher-EXE eingebaut.

Diese Rückmeldung ist ein konkreter Fortschritt, keine Freigabe aller Spielversionen, Server, Mods oder langen Mehrspielersitzungen. Server- und Runtime-Pakete haben eigene Versionen, Prüfsummen und Abnahmen.

## Web- und Serverstand

Dokumentiert sind sieben getrennte PHP-/statische Webroots, der Steam-/Legacy-Vertrag, der DEV-Reportdienst und die Server-Schnittstellen. Änderungen an Webseiten, Datenbanken, SMTP, OAuth, VPS und Dashboard müssen auf den jeweiligen Zielhosts geprüft werden. Ein erreichbarer Host oder ein bestandener lokaler Test ersetzt diese Abnahme nicht.

Die lokale Spielerprofil-Korrektur im Server-Fork und das zugehörige VPS-Update sind vom Launcher-Release getrennt. Ein neuer Launcher-Build übernimmt diese Serverkorrektur nicht.

## English / Русский

The 0.2.0 Windows launcher is built and packaged locally, with 69 passing Rust tests and three excluded integration tests. The user confirmed startup and movement with the separate native runtime. Broader multiplayer and production acceptance remain separate; a release tag or upload is not implied.

Лаунчер 0.2.0 для Windows собран локально: 69 тестов пройдены, три отдельные интеграционные проверки исключены. Пользователь подтвердил запуск и движение в игре с отдельной нативной средой. Расширенная игровая проверка, боевые сервисы и публикация релиза проверяются отдельно.

Weiter: [Roadmap](../ROADMAP.md), [Release-Anleitung](RELEASING.md), [Live-Abnahme](LIVE_ROLLOUT_CHECKLIST.md).
