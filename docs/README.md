# Dokumentation / Documentation / Документация

Stand: **26.10.2026**, Launcher **0.2.1**. Beginne mit dem Abschnitt für deine Aufgabe. Die README beschreibt den Launcher; die technischen Verträge stehen in den jeweiligen Fachanleitungen.

## Spieler / Players / Игроки

| Aufgabe / Task | Anleitung / Guide |
| --- | --- |
| Download, Voraussetzungen und erster Start | [Projekt-README](../README.md) |
| Server suchen, verbinden, Dateien und Wiederherstellung | [Verbindung](CONNECTING.md) |
| Konto, Spielername, Sprache, Streamer-Modus, Discord-Aktivität | [Einstellungen DE/EN/RU](LAUNCHER_SETTINGS.md) |
| Steam, Whitelist und Legacy-Anmeldung | [Authentifizierung DE/EN/RU](STEAM_AUTHENTICATION.md) |
| Absturzbericht ansehen, exportieren oder senden | [Crashreports](CRASH_REPORTS.md) |

## Entwickler und Release-Verantwortliche / Developers / Разработчики

| Aufgabe / Task | Anleitung / Guide |
| --- | --- |
| Toolchain, gemeinsam genutzte Build-Assets und lokaler Start | [Entwicklung](DEVELOPMENT.md) |
| EXE, portables ZIP, Prüfsummen und manueller GitHub-Upload | [Release-Anleitung DE/EN/RU](RELEASING.md) |
| Defender-Erkennung, Dateiprüfsumme und Windows-Codesignierung | [Antivirus-Befund und Release-Prüfung](ANTIVIRUS.md) |
| Komponenten und Datenflüsse | [Architektur](ARCHITECTURE.md) |
| Einstieg nach Rolle | [Einrichtung](SETUP.md) |
| Aktueller Nachweis und offene Abnahmen | [Status](STATUS.md), [Live-Abnahme](LIVE_ROLLOUT_CHECKLIST.md) |
| Änderungen und geplante Arbeit | [Changelog](../CHANGELOG.md), [Roadmap](../ROADMAP.md) |
| Beiträge | [Contributing](../CONTRIBUTING.md) |

## Serverbetreiber / Server operators / Владельцы серверов

- Vollständiges Handbuch: [Deutsch](SERVER_OWNER_GUIDE.de.md), [English](SERVER_OWNER_GUIDE.en.md), [Русский](SERVER_OWNER_GUIDE.ru.md).
- [Modmanifest, Downloads und Ladereihenfolge](MODPACK_PROTOCOL.md).
- [Client, SKSE, Address Library und Versionskataloge](RUNTIME_UPDATES.md).
- Server-Fork: [RealHartlMax/skymp](https://github.com/RealHartlMax/skymp). Bestehende Forks benötigen die dokumentierten Schnittstellen und eigene Kompatibilitätsprüfungen.

## Webhosting und Berichte / Hosting / Веб-хостинг

- [PHP-Webhosting](PHP_HOSTING.md), [lokale Prüfung und Veröffentlichung](LOCAL_AND_LIVE.md).
- DEV-/Report-Einrichtung: [DE](DEV_PORTAL_SETUP.de.md), [EN](DEV_PORTAL_SETUP.en.md), [RU](DEV_PORTAL_SETUP.ru.md).
- Crashreport-Kurzanleitung: [DE](CRASH_REPORTS_SETUP.de.md), [EN](CRASH_REPORTS_SETUP.en.md), [RU](CRASH_REPORTS_SETUP.ru.md).
- Discord-Webanmeldung: [DE](DISCORD_SETUP.de.md), [EN](DISCORD_SETUP.en.md), [RU](DISCORD_SETUP.ru.md).

Der Launcher läuft auf dem Spieler-PC, die Webseiten auf PHP-Webhosting und der Gameserver auf dem VPS. Jeder Bereich hat eigene Pakete. Für einen GitHub-Launcher-Release werden EXE, Full-ZIP, Update-ZIP und `SHA256SUMS` hochgeladen.

The launcher, PHP websites, game server and native client runtime are separate deliverables. The release guide identifies the four GitHub assets. Build success, a user-reported game session and production acceptance are recorded separately.

Лаунчер, PHP-сайты, игровой сервер и нативная среда клиента публикуются отдельно. Для релиза лаунчера на GitHub нужны EXE, Full ZIP, Update ZIP и `SHA256SUMS`. Результаты сборки, пользовательская игровая проверка и проверка боевых сервисов различаются.

Community: [Discord](https://discord.gg/NSXtNNbjuR).
