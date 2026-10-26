# Einrichtung nach Aufgabe

Stand: **26.10.2026**, Launcher **0.2.0**. Wähle den passenden Einstieg; Launcher, native Spiel-Runtime, Gameserver und PHP-Webseiten sind eigenständige Komponenten.

## Spielen

Den Windows-Launcher aus einem Release verwenden, Steam starten und den Spielordner in den Einstellungen prüfen. Einen kompatiblen Server suchen und verbinden. Dateien und Ladereihenfolge werden vor dem Start vorbereitet; ein vollständiges Serverpaket liefert auch das passende SKSE.

[Projekt-README](../README.md) · [Verbindung](CONNECTING.md) · [Einstellungen](LAUNCHER_SETTINGS.md) · [Steam und Whitelist](STEAM_AUTHENTICATION.md)

## Launcher entwickeln

Die geprüfte Toolchain, die erforderlichen gemeinsamen Assets und die Buildbefehle stehen in [DEVELOPMENT.md](DEVELOPMENT.md). Die Desktop-Anwendung liegt in `launcher/`; es gibt hier kein separates Visual-Studio-Projekt namens `client-plugin`.

```powershell
cd launcher
npm ci
npm run test:backend
npm run tauri -- dev
```

Für einen Release `npm run tauri -- build` verwenden. Die Ausgabe ist derzeit portable. [RELEASING.md](RELEASING.md) erklärt exakt, welche drei Dateien auf GitHub gehören.

## Einen Gameserver anbinden

Der Spielserver läuft auf einem VPS oder einem anderen dauerhaft erreichbaren Host. Er benötigt öffentliche Spiel-/Downloadadressen, die dokumentierte Ressourcen-API und einen passenden Clientkatalog. Registrierung und Schlüsselverwaltung liegen im PHP-Dashboard; die tatsächlichen Spielserver-Einstellungen werden im Adminpanel des Spielservers gespeichert.

Das vollständige Handbuch gibt es auf [Deutsch](SERVER_OWNER_GUIDE.de.md), [English](SERVER_OWNER_GUIDE.en.md) und [Русский](SERVER_OWNER_GUIDE.ru.md). Technische Verträge: [Modmanifest](MODPACK_PROTOCOL.md) und [Runtime-Katalog](RUNTIME_UPDATES.md).

## PHP-Webhosting einrichten

Die sieben Domains haben unabhängige Webroots. Jede Domain erhält nur den Inhalt ihres eigenen Pakets. Die Webseiten benötigen keinen laufenden Node-Dienst und keinen lokalen Dateizugriff auf den Gameserver-VPS.

[PHP_HOSTING.md](PHP_HOSTING.md) beschreibt die Konten, Master-/Registry-Routen, Konfiguration und Uploads. Für DEV und Crashreports gelten die Schritte in [DE](DEV_PORTAL_SETUP.de.md), [EN](DEV_PORTAL_SETUP.en.md) oder [RU](DEV_PORTAL_SETUP.ru.md). Der optionale Node-Master unter `master-api/` ist eine eigenständige lokale Referenz mit eigenen Konten.

## Bestehende Installation aktualisieren

- Launcher: App schließen und EXE ersetzen; Benutzerprofile erhalten.
- Native Spiel-Runtime: neue unveränderliche Version vollständig bereitstellen und den Katalog zuletzt veröffentlichen.
- Gameserver/Dashboard: eigene Update-Anleitung verwenden, Konfiguration/Welten/Mods/Schlüssel erhalten und die betroffenen Prozesse vollständig neu starten.
- PHP-Websites: passende Domain-Dateien ersetzen, private Konfigurationen und Daten erhalten.
- Dokumentation: Markdown aktualisieren und bei Bedarf die statischen Handbücher neu rendern. Dafür ist kein neuer Spiel- oder Launcher-Build erforderlich.

## English / Русский

For playing, use the release launcher and the connection/settings guides. For development, follow [DEVELOPMENT.md](DEVELOPMENT.md), including the shared build assets. For manual releases, follow [RELEASING.md](RELEASING.md). Server operators use the language-specific handbook; PHP hosting and game-server setup are separate.

Для игры используйте готовый лаунчер и инструкции подключения. Для разработки см. [DEVELOPMENT.md](DEVELOPMENT.md), включая общие ресурсы сборки. Для ручного релиза — [RELEASING.md](RELEASING.md). Владельцам сервера предназначены отдельные руководства; PHP-хостинг и игровой сервер настраиваются раздельно.

Übersicht: [Dokumentation](README.md), [Architektur](ARCHITECTURE.md), [Prüfstand](STATUS.md).
