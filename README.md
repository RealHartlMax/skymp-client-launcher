# SkyMP Worlds Launcher

**Version 0.2.0 · Windows x64 · Tauri / React / Rust**

[Deutsch](#deutsch) · [English](#english) · [Русский](#русский)

[Downloads auf GitHub](https://github.com/RealHartlMax/skymp-client-launcher/releases) · [Dokumentation](docs/README.md) · [Änderungen](CHANGELOG.md) · [Discord](https://discord.gg/NSXtNNbjuR)

## Deutsch

SkyMP Worlds ist ein Launcher für unabhängige Skyrim-Multiplayer-Server. Suche einen Server, sieh dir seine Details an und verbinde dich. Vor dem Start prüft der Launcher die benötigten Dateien und lädt die vom Server bereitgestellten Mod- und Clientpakete herunter.

### Starten

1. Die **EXE oder das portable ZIP** aus einem GitHub-Release herunterladen. Beim ZIP zuerst alle Dateien entpacken.
2. Steam starten. Im Launcher unter **Einstellungen → Spiel** den Skyrim-Special-Edition-Ordner auswählen und prüfen.
3. Unter **Server entdecken** suchen, die Serverdetails öffnen und **Verbinden** wählen.

Benötigt werden Windows x64 mit Microsoft Edge WebView2 Runtime, Steam und eine vom Server unterstützte Skyrim-Version. Ein vollständiges Server-Clientpaket stellt auch das passende SKSE und die Address Library bereit. Ein manueller SKSE-Einbau ist dann nicht nötig. Der Server muss das passende Paket tatsächlich anbieten; die Launcher-EXE enthält keine Spiel-Runtime.

Der Splashscreen zeigt Dateiprüfung, Downloads und Spielstart. Er schließt sich automatisch, sobald der Start des echten Skyrim-Prozesses bestätigt wurde. Das Spiel behält den Fokus. Bei einem Startfehler bleiben Meldung und Rückweg sichtbar.

### Enthalten in 0.2.0

- Serverbrowser mit Suche, Filtern, Sortierung, Favoriten, Verlauf und Detailseiten.
- Länderflaggen, öffentliche Serverbilder, Spielerzahlen sowie Online-/Offline-Anzeige.
- Mod- und Clientpakete mit Größen-/SHA-256-Prüfung, Downloadcache und serverseitiger Mod-Ladereihenfolge.
- Gesicherte Originaldateien, Wiederherstellung und Schutz extern geänderter Dateien beim Serverwechsel.
- Steam-Anmeldung und ein eigener Spielername zusätzlich zur bestätigten Steam-ID.
- Deutsch, Englisch und Russisch; Streamer-Modus, optionaler Hintergrundklang und Discord-Aktivitätsstatus.
- Prozessüberwachung und Absturzberichte mit Vorschau, lokalem Export und optionalem Versand. Speicherabbilder benötigen eine gesonderte Freigabe.

Weitere Spielserver lassen sich über **Direktverbindung** eintragen. Der zentrale Listen-Endpunkt ist fest; das Spielziel wird pro Server gewählt.

### Hilfe und Veröffentlichung

[Verbindung und Dateien](docs/CONNECTING.md) · [Einstellungen](docs/LAUNCHER_SETTINGS.md) · [Steam und Whitelist](docs/STEAM_AUTHENTICATION.md) · [Absturzberichte](docs/CRASH_REPORTS.md)

Für GitHub werden ausschließlich die drei Dateien aus `local-builds/releases/v0.2.0/upload/` verwendet: EXE, portables ZIP und `SHA256SUMS`. Details stehen in der [Anleitung für manuelle Releases](docs/RELEASING.md). Server, Webseiten und native Spiel-Runtime haben eigene Pakete und Veröffentlichungswege.

## English

SkyMP Worlds is a launcher for independent Skyrim multiplayer servers. Find a server, inspect its details and connect. The launcher verifies and downloads the mod and client packages supplied by that server before starting the game.

### Getting started

1. Download the **EXE or portable ZIP** from a GitHub release. Extract the ZIP before use.
2. Start Steam. In **Settings → Game**, select and verify your Skyrim Special Edition folder.
3. Search under **Discover servers**, open the server details and select **Connect**.

Windows x64 with Microsoft Edge WebView2 Runtime, Steam and a server-supported Skyrim version are required. A complete server client package supplies matching SKSE and Address Library files, so no manual SKSE installation is needed in that case. The server must actually provide a suitable package; the launcher executable does not contain the game runtime.

The splash shows verification, downloads and startup. It closes automatically after the real Skyrim process is detected, without bringing the launcher to the foreground. Startup errors remain visible.

### Included in 0.2.0

- Server search, filters, sorting, favorites, history and detail pages.
- Country flags, public server artwork, player counts and online/offline status.
- Verified mod/client downloads, a cache and the server's mod load order.
- Original-file backups, restoration and protection of externally modified files.
- Steam authentication and an optional player name alongside the verified Steam ID.
- German, English and Russian; streamer privacy, optional ambient audio and Discord activity.
- Game-process monitoring and crash reports with preview, local export and optional upload. Memory dumps require separate consent.

Other game servers can be added through **Direct connection**. The registry URL is fixed; the game-server destination is selected per connection.

[Connection guide](docs/CONNECTING.md) · [Settings](docs/LAUNCHER_SETTINGS.md) · [Steam and approval](docs/STEAM_AUTHENTICATION.md) · [Release guide](docs/RELEASING.md) · [Server operator handbook](docs/SERVER_OWNER_GUIDE.en.md)

GitHub release assets are only the EXE, portable ZIP and `SHA256SUMS` from the release's `upload/` directory. Game-server, website and native runtime packages are separate.

## Русский

SkyMP Worlds — лаунчер для независимых многопользовательских серверов Skyrim. Найдите сервер, откройте его описание и подключитесь. Перед запуском лаунчер проверит и загрузит предоставленные сервером моды и клиентские файлы.

### Начало работы

1. Скачайте **EXE или portable ZIP** из релиза GitHub. ZIP необходимо распаковать.
2. Запустите Steam. В **Настройки → Игра** выберите и проверьте папку Skyrim Special Edition.
3. Найдите сервер, откройте его страницу и нажмите **Подключиться**.

Нужны Windows x64 с Microsoft Edge WebView2 Runtime, Steam и поддерживаемая сервером версия Skyrim. Полный пакет клиента включает подходящие SKSE и Address Library; в этом случае устанавливать SKSE вручную не нужно. Сервер должен предоставить такой пакет. В EXE лаунчера игровая среда не встроена.

Экран подключения показывает проверку файлов, загрузку и запуск. Он закрывается автоматически после обнаружения процесса Skyrim и не переводит фокус на лаунчер. При ошибке запуска сообщение остаётся открытым.

### Возможности 0.2.0

- Поиск, фильтры, сортировка, избранное, история и страницы серверов.
- Флаги стран, изображения серверов, число игроков и статус онлайн/офлайн.
- Проверка размера и SHA-256, кеш загрузок и порядок модов, заданный сервером.
- Резервное копирование, восстановление и защита файлов, изменённых вне лаунчера.
- Авторизация Steam и имя игрока в дополнение к подтверждённому Steam ID.
- Немецкий, английский и русский языки; режим стримера, необязательный фоновый звук и активность Discord.
- Наблюдение за процессом игры и отчёты о сбоях с просмотром, локальным экспортом и необязательной отправкой. Дампы памяти требуют отдельного согласия.

Другие серверы можно добавить через **Прямое подключение**. Адрес общего списка фиксирован; игровой сервер выбирается для каждого подключения.

[Настройки](docs/LAUNCHER_SETTINGS.md) · [Steam и допуск](docs/STEAM_AUTHENTICATION.md) · [Публикация релиза](docs/RELEASING.md) · [Руководство владельца сервера](docs/SERVER_OWNER_GUIDE.ru.md)

Для релиза GitHub загружаются только EXE, portable ZIP и `SHA256SUMS` из папки `upload/`. Игровой сервер, сайты и нативный клиент публикуются отдельно.

## Project and documentation

| Area | Entry point |
| --- | --- |
| Current implementation and validation | [Status](docs/STATUS.md), [Roadmap](ROADMAP.md) |
| Build and contribute | [Development](docs/DEVELOPMENT.md), [Contributing](CONTRIBUTING.md) |
| Releases and upload contents | [Manual releases](docs/RELEASING.md), [Changelog](CHANGELOG.md) |
| Server integration | [DE](docs/SERVER_OWNER_GUIDE.de.md), [EN](docs/SERVER_OWNER_GUIDE.en.md), [RU](docs/SERVER_OWNER_GUIDE.ru.md) |
| Mod and runtime contracts | [Mod API](docs/MODPACK_PROTOCOL.md), [Runtime catalogs](docs/RUNTIME_UPDATES.md) |
| Hosting and developer portal | [PHP hosting](docs/PHP_HOSTING.md), [DEV: DE](docs/DEV_PORTAL_SETUP.de.md), [EN](docs/DEV_PORTAL_SETUP.en.md), [RU](docs/DEV_PORTAL_SETUP.ru.md) |
| Component boundaries | [Architecture](docs/ARCHITECTURE.md) |

The desktop application is in `launcher/`. The native game client and game server are maintained in the separate [SkyMP fork](https://github.com/RealHartlMax/skymp). `web/` contains the local PHP/static website sources; it is currently ignored by Git. A fresh source checkout therefore needs the shared build assets described in the [development guide](docs/DEVELOPMENT.md).

Documentation reviewed **26 October 2026**. The Windows release build and 69 active Rust tests passed; three separate integration tests were excluded. A user confirmed successful game startup and walking with the prepared native runtime. This does not certify every server, mod pack or game version. See [validation scope](docs/STATUS.md).

Project license: [GPL-3.0](LICENSE). Community: [Discord](https://discord.gg/NSXtNNbjuR).
