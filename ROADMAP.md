# 🗺️ Roadmap – SkyMP Open Launcher Initiative

[🇩🇪 Deutsch](#-deutsch) · [🇬🇧 English](#-english) · [🇷🇺 Русский](#-русский)

---

## 🇩🇪 Deutsch

### Phase 1 – Proof of Concept (Grundlagen)

> Ziel: Zeigen, dass das Konzept technisch funktioniert.

| Aufgabe | Komponente | Status |
|---|---|---|
| SKSE-Plugin liest IP/Port aus `connection.json` | Client Plugin (C++) | ⬜ Offen |
| Minimale REST-API mit `GET /list` und `POST /announce` | Master Server | ✅ Skeleton vorhanden |
| CLI-Skript: schreibt `connection.json` und startet SKSE | Launcher | ⬜ Offen |

### Phase 2 – Launcher & UI (Alpha)

> Ziel: Eine nutzbare Desktop-Applikation.

| Aufgabe | Komponente | Status |
|---|---|---|
| Tauri-Projekt aufsetzen | Launcher | ✅ Skeleton vorhanden |
| Server-Browser UI (Liste, Suche, Spielerzahl) | Launcher Frontend | ✅ Skeleton vorhanden |
| Skyrim-Installationspfad automatisch erkennen | Launcher | ⬜ Offen |
| SKSE korrekt aus dem Launcher heraus starten | Launcher (Tauri/Rust) | ⬜ Offen |
| `connection.json` automatisch schreiben beim Join | Launcher | ⬜ Offen |

### Phase 3 – Server-Ökosystem (Beta)

> Ziel: Serverbesitzer können sich einfach registrieren.

| Aufgabe | Komponente | Status |
|---|---|---|
| Heartbeat-Integration in SkyMP-Servercode | Dedicated Server (C++) | ⬜ Offen |
| Server-Detailansicht im Launcher (Mods, Beschreibung) | Launcher Frontend | ⬜ Offen |
| Persistenz der Serverliste (z.B. Redis/SQLite) | Master Server | ⬜ Offen |
| Spieler-Authentifizierung (optional) | Master Server + Launcher | ⬜ Offen |

### Phase 4 – Erweitertes Tooling (Release)

> Ziel: Vollständige Community-Plattform.

| Aufgabe | Komponente | Status |
|---|---|---|
| Asset-Sync: automatischer Download server-spezifischer Inhalte | Launcher | ⬜ Offen |
| Developer SDK für Serverbesitzer | Tooling | ⬜ Offen |
| Offizielle Dokumentation & Wiki | Docs | ⬜ Offen |

---

## 🇬🇧 English

### Phase 1 – Proof of Concept (Foundations)

> Goal: Prove the concept works technically.

| Task | Component | Status |
|---|---|---|
| SKSE plugin reads IP/Port from `connection.json` | Client Plugin (C++) | ⬜ Open |
| Minimal REST API with `GET /list` and `POST /announce` | Master Server | ✅ Skeleton ready |
| CLI script: writes `connection.json` and launches SKSE | Launcher | ⬜ Open |

### Phase 2 – Launcher & UI (Alpha)

> Goal: A usable desktop application.

| Task | Component | Status |
|---|---|---|
| Set up Tauri project | Launcher | ✅ Skeleton ready |
| Server browser UI (list, search, player count) | Launcher Frontend | ✅ Skeleton ready |
| Auto-detect Skyrim installation path | Launcher | ⬜ Open |
| Launch SKSE correctly from the launcher | Launcher (Tauri/Rust) | ⬜ Open |
| Auto-write `connection.json` on join | Launcher | ⬜ Open |

### Phase 3 – Server Ecosystem (Beta)

> Goal: Server owners can register easily.

| Task | Component | Status |
|---|---|---|
| Heartbeat integration into SkyMP server code | Dedicated Server (C++) | ⬜ Open |
| Server detail view in launcher (mods, description) | Launcher Frontend | ⬜ Open |
| Server list persistence (e.g. Redis/SQLite) | Master Server | ⬜ Open |
| Player authentication (optional) | Master Server + Launcher | ⬜ Open |

### Phase 4 – Extended Tooling (Release)

> Goal: Full community platform.

| Task | Component | Status |
|---|---|---|
| Asset sync: auto-download of server-specific content | Launcher | ⬜ Open |
| Developer SDK for server owners | Tooling | ⬜ Open |
| Official documentation & wiki | Docs | ⬜ Open |

---

## 🇷🇺 Русский

### Фаза 1 – Доказательство концепции (Основы)

> Цель: доказать, что концепция работает технически.

| Задача | Компонент | Статус |
|---|---|---|
| SKSE-плагин читает IP/Port из `connection.json` | Клиентский плагин (C++) | ⬜ Открыта |
| Минимальный REST API: `GET /list` и `POST /announce` | Мастер-сервер | ✅ Скелет готов |
| CLI-скрипт: записывает `connection.json` и запускает SKSE | Лаунчер | ⬜ Открыта |

### Фаза 2 – Лаунчер и UI (Альфа)

> Цель: рабочее десктопное приложение.

| Задача | Компонент | Статус |
|---|---|---|
| Настройка Tauri-проекта | Лаунчер | ✅ Скелет готов |
| UI браузера серверов (список, поиск, количество игроков) | Фронтенд лаунчера | ✅ Скелет готов |
| Автоопределение пути установки Skyrim | Лаунчер | ⬜ Открыта |
| Корректный запуск SKSE из лаунчера | Лаунчер (Tauri/Rust) | ⬜ Открыта |
| Автозапись `connection.json` при входе на сервер | Лаунчер | ⬜ Открыта |

### Фаза 3 – Экосистема серверов (Бета)

> Цель: владельцы серверов могут легко зарегистрироваться.

| Задача | Компонент | Статус |
|---|---|---|
| Интеграция хартбита в код SkyMP-сервера | Игровой сервер (C++) | ⬜ Открыта |
| Детальный вид сервера в лаунчере (моды, описание) | Фронтенд лаунчера | ⬜ Открыта |
| Хранение списка серверов (Redis/SQLite) | Мастер-сервер | ⬜ Открыта |
| Аутентификация игроков (опционально) | Мастер-сервер + Лаунчер | ⬜ Открыта |

### Фаза 4 – Расширенный инструментарий (Релиз)

> Цель: полноценная платформа сообщества.

| Задача | Компонент | Статус |
|---|---|---|
| Синхронизация ресурсов: автозагрузка контента сервера | Лаунчер | ⬜ Открыта |
| Developer SDK для владельцев серверов | Инструменты | ⬜ Открыта |
| Официальная документация и вики | Документация | ⬜ Открыта |
