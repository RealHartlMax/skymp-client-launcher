# SkyMP Worlds: Komponenten und Datenflüsse

Stand: **26.10.2026**, Launcher **0.2.0**. Die Komponenten sind implementiert, haben aber getrennte Build-, Konfigurations- und Veröffentlichungswege. Prüfumfang: [STATUS.md](STATUS.md).

## Zuständigkeiten

| Komponente | Aufgabe | Betrieb |
| --- | --- | --- |
| Launcher | Serverauswahl, Steam-Ticket, geprüfte Dateivorbereitung, Ladereihenfolge, SKSE-Start, Einstellungen und Diagnose | Spieler-PC, Windows x64 |
| Nativer Spielclient | Skyrim-/SKSE-/CEF-Integration, Clientskript und Spielverbindung | Eigenes, zur Spielversion passendes Runtime-Paket |
| Gameserver mit eigenem Adminpanel | Spielwelt, Steam-/Whitelist-Prüfung, Ressourcen, öffentliche Serverdaten und Heartbeat | VPS; separates Server-Repository |
| PHP-Plattform | Konten, Serverzuordnung, Schlüssel, Registry, optionale Legacy-Sitzungen, OAuth und Reportdienste | PHP-Webhosting mit unabhängigen Webroots |
| Optionale Node-Referenz | Isolierte lokale Implementierung des Master-Vertrags | Entwicklung; nicht Voraussetzung des PHP-Hostings |

Die Launcher-EXE enthält die Desktop-Oberfläche und den Rust-Backendcode. Sie enthält weder Skyrim noch die nativen Spiel-DLLs. Runtime-Kataloge erlauben deren Aktualisierung ohne neue Launcher-EXE.

## Domains

| Domain | Inhalt |
| --- | --- |
| `skymp-worlds.net` | Hauptseite und Einstieg |
| `servers.skymp-worlds.net` | Öffentlicher Serverbrowser |
| `manage.skymp-worlds.net` | Konten, Serverzuordnung, Schlüssel und optionale Konto-/Discord-Anmeldung |
| `api.skymp-worlds.net` | Öffentliche Registry, Master-/Bridge-Routen und Report-Upload |
| `update.skymp-worlds.net` | Launcher-Downloadmetadaten und getrennte Client-Runtime-Kataloge |
| `docs.skymp-worlds.net` | Statische Betreiberhandbücher in DE/EN/RU |
| `dev.skymp-worlds.net` | Geschützter Entwicklerbereich für Crashreports |

Jede Domain hat ihren eigenen Ordner. Gemeinsame Styles, Schriftarten und Flaggen werden beim Paketieren in die jeweiligen Webroots kopiert. Die API spricht die Verwaltung über HTTPS an; PHP-Includes über Nachbar-Webroots sind nicht nötig. Report- und Kontospeicher bleiben geschützt. Details: [PHP_HOSTING.md](PHP_HOSTING.md).

## Server → Registry → Launcher

1. Der Betreiber registriert den Server und erhält öffentliche `serverUid` und privaten Heartbeat-Schlüssel.
2. Er trägt diese Werte in den definierten Feldern der Ersteinrichtung bzw. des Adminpanels auf dem Gameserver ein.
3. Der Gameserver sendet authentifizierte Heartbeats und seine tatsächlichen öffentlichen Metadaten an den Master.
4. `GET https://api.skymp-worlds.net/list.php` liefert die öffentlichen Einträge. Bekannte veröffentlichte Server bleiben nach Offline-Meldung oder Ablauf der Heartbeatfrist als offline erkennbar.
5. Launcher und Webbrowser stellen Länderflaggen, Status, Namen, Spielerzahlen und verfügbare Serverbilder dar. Servername und Spielerlimit stammen vom Gameserver.

Der native Heartbeat-Vertrag lautet `POST /api/servers/<masterKey>`. `heartbeat.php` und alternative Feldnamen bleiben Kompatibilitätspfade. Der private Schlüssel gehört ausschließlich auf den Server; im öffentlichen Legacy-Feld `masterKey` steht beim PHP-Master die öffentliche Server-ID.

`logo.png` und `banner.png` liegen neben `server-settings.json`. Der Server veröffentlicht die geprüften Bilder über seine Asset-Endpunkte; die Plattform stellt sie für Webseiten über HTTPS bereit. Im zentralen Webformular werden keine Bild-URLs gepflegt.

## Verbindung und Dateien

1. Der Launcher liest die veröffentlichte Server-Policy und holt bei Steam-Zugang ein Ticket mit genau der vorgegebenen Dienstkennung.
2. Nach erfolgreicher Serverprüfung bereitet er das Ressourcenmanifest und gegebenenfalls den externen Clientkatalog vor.
3. Größen, SHA-256, Zielpfade und Runtime-/Spielversion werden geprüft. Bethesda-Originaldateien werden lokal vorausgesetzt und nicht verteilt.
4. Dateien werden reversibel aktiviert, `plugins.txt` und `loadorder.txt` gemäß Servervorgabe geschrieben und die Verbindungsdaten unter `Data/Platform/Plugins/skymp5-client-settings.txt` hinterlegt.
5. Erst dann startet SKSE. Der Prozessmonitor beobachtet den echten Skyrim-Prozess statt nur den kurzlebigen Loader. Die Startbestätigung schließt den Splashscreen; sie behauptet keine bereits abgeschlossene Welt-/Mehrspielerverbindung.

Native Ziele sind der Spielordner, `Data/SKSE/Plugins/` und `Data/Platform/Plugins/`, abhängig vom Manifest. Ein danebenliegender Ordner `Platform/Plugins/` ohne `Data/` ist kein allgemeines Installationsziel.

Verträge: [Modmanifest](MODPACK_PROTOCOL.md), [Runtime-Katalog](RUNTIME_UPDATES.md), [Verbindung](CONNECTING.md).

## Identität und Anmeldung

Steam-ID, gewählter Anzeigename und serverseitige Freigabe haben unterschiedliche Rollen. Eine Namensänderung verändert keine Spielidentität. Der Server verifiziert das Ticket und entscheidet über Whitelist/Freigabe. Der normale Steam-Zugang kann ohne SkyMP-Webkonto auskommen; eine zusätzliche Legacy-Kontoanmeldung wird nur bei entsprechender Server-Policy verwendet.

Discord Rich Presence benötigt die öffentliche Application-ID und Desktop-Discord. Die optionale Webanmeldung verwendet dagegen einen privaten OAuth-Client-Secret auf PHP-Hosting. Diese beiden Funktionen sind getrennt. Details: [Steam](STEAM_AUTHENTICATION.md), [Einstellungen](LAUNCHER_SETTINGS.md), [Discord-Webeinrichtung](DISCORD_SETUP.de.md).

## Berichte, Update und Veröffentlichung

Crashreports werden lokal gesammelt und vor dem Versand angezeigt. Minidumps benötigen eine gesonderte Freigabe. Der API-Upload leitet Berichte an den geschützten DEV-Speicher weiter. Der Gameserver-VPS wird für diesen Dienst nicht als PHP-Webhost verwendet.

Ein GitHub-Release enthält nur Launcher-EXE, portables ZIP und `SHA256SUMS`. Es ändert keine Serverinstallation, keine Runtime-Kataloge und keine Website-Manifeste. Selbstupdate und signierte Veröffentlichung bleiben eigenständige Aufgaben. Siehe [Release-Anleitung](RELEASING.md) und [Crashreports](CRASH_REPORTS.md).

## English / Русский

The Windows launcher, native game runtime, VPS server and PHP platform are separate components. Steam identity is verified by the game server; public registry IDs are not private heartbeat keys. Startup confirmation closes the splash without claiming that multiplayer world loading has finished. Website, runtime and GitHub releases are separate operations.

Windows-лаунчер, нативный клиент, сервер на VPS и PHP-платформа — отдельные компоненты. Steam проверяет игровой сервер; публичный ID записи не является закрытым heartbeat-ключом. Подтверждение запуска закрывает экран подключения, но не означает завершённую загрузку мира. Сайты, runtime и GitHub-релиз публикуются отдельно.
