# 🗺️ Roadmap – SkyMP Open Launcher Initiative

Status audit: **22 October 2026**. Evidence and remaining acceptance: [STATUS.md](docs/STATUS.md).

[🇩🇪 Deutsch](#-deutsch) · [🇬🇧 English](#-english) · [🇷🇺 Русский](#-русский)

## 🇩🇪 Deutsch

„Implementiert“ beschreibt den genannten lokalen Umfang. Einzeltests und Paketprüfung ersetzen keine echte Spielsitzung oder erfolgreiche Veröffentlichung.

### Phase 1 – Grundlagen

| Aufgabe | Komponente | Status |
| --- | --- | --- |
| Zielserver aus der Einstellungsdatei lesen | SkyMP-Client / SkyrimPlatform | ✅ Implementiert; echter Spieltest offen |
| REST-API für Serverliste und Heartbeat | PHP-Master; optionale Node-Referenz | ✅ Implementiert und lokal geprüft |
| Beim Join Einstellungen schreiben und SKSE nach Vorbereitung starten | Rust-Launcher | ✅ Implementiert; echter Start offen |

### Phase 2 – Launcher & UI

| Aufgabe | Komponente | Status |
| --- | --- | --- |
| Tauri/React-Projekt | Desktop-App | ✅ Gebaut |
| Serverbrowser, Namenssuche, Favoriten und Verlauf | Frontend | ✅ Implementiert und lokal geprüft |
| Skyrim-Pfad erkennen/auswählen und prüfen | Launcher | ✅ Implementiert |
| Download, Prüfsummen, Cache und Wiederherstellung | Rust-Backend | ✅ Implementiert; 25 Backend-Tests |
| Serverdetails mit Beschreibung und Verbindungsdaten | Frontend | ✅ Implementiert; detaillierte Modübersicht offen |

### Phase 3 – Server-Ökosystem

| Aufgabe | Komponente | Status |
| --- | --- | --- |
| Heartbeat-Integration in den dedizierten Server | SkyMP-TypeScript-System | ✅ Implementiert; isolierter Test besteht |
| Persistente Server-/Kontodaten | PHP-Dateispeicher/optionales SQL; Node-SQLite-Referenz | ✅ Implementiert; Produktions-DB-Abnahme offen |
| Online-Anmeldung und Browserfreigabe | PHP-Master / Spielclient | ✅ Lokal getestet; echte Spielsitzung offen |
| Gemeinsames Betreiberhandbuch und Doku-Webroot DE/EN/RU | Dokumentation | ✅ Vorhanden und lokal geprüft; Upload gesondert |

### Phase 4 – Tooling und Abnahme

| Aufgabe | Komponente | Status |
| --- | --- | --- |
| Automatische Moddateien vor Spielstart | Launcher + Server-API v2 | ✅ Implementiert und geprüft |
| Versionskatalog für Client/SKSE/Address Library | Launcher + Paketwerkzeuge | ✅ Implementiert; 6 Paketprüfungen |
| Nativer 1.7.104-Client | Separater Server-Fork | 🔄 Releasebuild/Adressdaten-Probes vorhanden; Spiel/CEF offen |
| Signierter Launcher-EXE-Selbstupdateablauf | Launcher / Update-Host | ⬜ Offen; Paketupdates sind separat implementiert |
| Entwickler-SDK | Tooling | 🔄 Anleitungen/Verträge vorhanden; versioniertes SDK offen |
| Echtes Multiplayer-Spiel und öffentlicher Rollout | Gesamtsystem | ⬜ Offen |

## 🇬🇧 English

Implemented means the stated local scope. Unit/download/package checks do not establish an actual game session or successful deployment.

### Phase 1 – Foundations

| Task | Component | Status |
| --- | --- | --- |
| Read target server from settings | SkyMP client / SkyrimPlatform | ✅ Implemented; real game acceptance open |
| REST server list and heartbeat API | PHP master; optional Node reference | ✅ Implemented and locally checked |
| Write connection settings and start SKSE after preparation | Rust launcher | ✅ Implemented; actual launch acceptance open |

### Phase 2 – Launcher & UI

| Task | Component | Status |
| --- | --- | --- |
| Tauri/React project | Desktop app | ✅ Built |
| Server browser, name search, favorites and history | Frontend | ✅ Implemented and locally checked |
| Detect/select and validate Skyrim path | Launcher | ✅ Implemented |
| Download, checksums, cache and restoration | Rust backend | ✅ Implemented; 25 backend tests |
| Server descriptions and connection details | Frontend | ✅ Implemented; detailed mod preview remains open |

### Phase 3 – Server ecosystem

| Task | Component | Status |
| --- | --- | --- |
| Dedicated-server heartbeat integration | SkyMP TypeScript system | ✅ Implemented; isolated test passes |
| Persistent server/account data | PHP file store/optional SQL; Node SQLite reference | ✅ Implemented; production DB acceptance open |
| Online sign-in and browser consent | PHP master / game client | ✅ Locally tested; real game session open |
| DE/EN/RU operator handbook and static docs root | Documentation | ✅ Available and locally checked; upload separate |

### Phase 4 – Tooling and acceptance

| Task | Component | Status |
| --- | --- | --- |
| Automatic pre-game mod preparation | Launcher + server API v2 | ✅ Implemented and checked |
| Version catalog for client/SKSE/Address Library | Launcher + publishing tools | ✅ Implemented; 6 publishing checks |
| Native 1.7.104 client | Separate server fork | 🔄 Release build/address probes available; game/CEF open |
| Signed launcher EXE self-update | Launcher / update host | ⬜ Open; runtime-package updates are separate |
| Developer SDK | Tooling | 🔄 Guides/contracts available; versioned SDK open |
| Actual multiplayer gameplay and public rollout | Whole system | ⬜ Open |

## 🇷🇺 Русский

Реализовано означает указанный локальный объём. Тесты и проверка пакетов не подтверждают реальную игровую сессию или публикацию.

### Фаза 1 – Основы

| Задача | Компонент | Статус |
| --- | --- | --- |
| Чтение сервера назначения из настроек | Клиент SkyMP / SkyrimPlatform | ✅ Реализовано; проверка в игре открыта |
| REST API списка серверов и heartbeat | PHP-мастер; опциональный Node-пример | ✅ Реализовано и локально проверено |
| Запись настроек и запуск SKSE после подготовки | Rust-лаунчер | ✅ Реализовано; реальный запуск не проверен |

### Фаза 2 – Лаунчер и UI

| Задача | Компонент | Статус |
| --- | --- | --- |
| Проект Tauri/React | Десктопное приложение | ✅ Собрано |
| Браузер серверов, поиск, избранное и история | Фронтенд | ✅ Реализовано и локально проверено |
| Поиск/выбор и проверка пути Skyrim | Лаунчер | ✅ Реализовано |
| Загрузка, контрольные суммы, кэш и восстановление | Rust-бэкенд | ✅ Реализовано; 25 тестов |
| Описание сервера и параметры подключения | Фронтенд | ✅ Реализовано; подробный список модов ещё открыт |

### Фаза 3 – Экосистема серверов

| Задача | Компонент | Статус |
| --- | --- | --- |
| Heartbeat выделенного сервера | TypeScript-система SkyMP | ✅ Реализовано; изолированный тест пройден |
| Постоянное хранение серверов/аккаунтов | PHP-файлы/опциональный SQL; Node-SQLite | ✅ Реализовано; приёмка рабочей БД открыта |
| Вход и разрешение игры в браузере | PHP-мастер / игровой клиент | ✅ Локально проверено; реальная сессия открыта |
| Руководства DE/EN/RU и статический сайт документации | Документация | ✅ Готовы и локально проверены; загрузка отдельно |

### Фаза 4 – Инструменты и приёмка

| Задача | Компонент | Статус |
| --- | --- | --- |
| Автоматическая подготовка модов до запуска | Лаунчер + API сервера v2 | ✅ Реализовано и проверено |
| Каталог версий клиента/SKSE/Address Library | Лаунчер + инструменты публикации | ✅ Реализовано; 6 проверок пакетов |
| Нативный клиент 1.7.104 | Отдельный форк сервера | 🔄 DLL и проверки базы адресов готовы; игра/CEF не проверены |
| Подписанное самообновление EXE лаунчера | Лаунчер / сервер обновлений | ⬜ Открыто; обновление runtime-пакетов реализовано отдельно |
| SDK разработчика | Инструменты | 🔄 Руководства/контракты готовы; версионированный SDK открыт |
| Реальная многопользовательская игра и публичный запуск | Вся система | ⬜ Открыто |

Evidence: `local-builds/current/VALIDATION.json`; current Rust tests and runtime publishing tests were rerun on 22 October. Live acceptance remains in [LIVE_ROLLOUT_CHECKLIST.md](docs/LIVE_ROLLOUT_CHECKLIST.md).
