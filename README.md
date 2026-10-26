# 🛠️ SkyMP Open Launcher Initiative (WIP)

Launcher-Einstellungen mit Spielernamen, Streamer-Modus, Audio, Sprachen und Discord-Aktivitätsstatus:
[DE / EN / RU](docs/LAUNCHER_SETTINGS.md). Discord-Webanmeldung und ausdrückliche Kontoverknüpfung:
[DE](docs/DISCORD_SETUP.de.md) · [EN](docs/DISCORD_SETUP.en.md) · [RU](docs/DISCORD_SETUP.ru.md).

Steam-Pflicht für Server r5, Gastzugang ohne Worlds-Konto und Legacy-Login:
[Steam authentication / Steam-Anmeldung / Вход через Steam](docs/STEAM_AUTHENTICATION.md).

Crashreports mit Datenvorschau, lokalem Export, separater Minidump-Freigabe und geschützter PHP-Verwaltung:
[Konzept und Umsetzung](docs/CRASH_REPORTS.md) · Einrichtung [DE](docs/CRASH_REPORTS_SETUP.de.md),
[EN](docs/CRASH_REPORTS_SETUP.en.md), [RU](docs/CRASH_REPORTS_SETUP.ru.md).
Der eigenständige Entwicklerbereich unter **dev.skymp-worlds.net** empfängt die Berichte
über die bestehende API und verwendet freigegebene Verwaltungskonten:
[Einrichtung DE](docs/DEV_PORTAL_SETUP.de.md) · [EN](docs/DEV_PORTAL_SETUP.en.md) · [RU](docs/DEV_PORTAL_SETUP.ru.md).
Der Launcher fordert native Steam-Tickets an, ohne die Steam-DLL des Spiels zu ersetzen.
Die aktuelle lokale EXE und die unabhängigen Web-ZIPs liegen in `local-builds/current/`.
Das separat gebaute Threadpool-Clientpaket wurde aus `D:/GitHub/skymp/build/client-delivery-2026-10-25-threadpool/` übernommen. Ein vollständiger Spieltest bleibt erforderlich.

Launcher-Verbindung zum aktuellen Server-Fork, automatische Dateipruefung/-downloads,
Serverprofile und lokale Tests: [Verbindungsanleitung](docs/CONNECTING.md).
Modpakete mit Dateigroesse/SHA-256, Unterverzeichnissen und optionalem Clientpaket
werden vor dem Spielstart vorbereitet: [Betreiber- und API-Anleitung](docs/MODPACK_PROTOCOL.md).
Client, SKSE und Address Library lassen sich pro Skyrim-Version über einen externen
[Versionskatalog aktualisieren](docs/RUNTIME_UPDATES.md), ohne die Launcher-EXE neu zu bauen.

Vollständiges Betreiberhandbuch für `docs.skymp-worlds.net`:
[Deutsch](docs/SERVER_OWNER_GUIDE.de.md) · [English](docs/SERVER_OWNER_GUIDE.en.md) ·
[Русский](docs/SERVER_OWNER_GUIDE.ru.md). Eigener statischer Webroot und eigene Domain-ZIP;
bestehende kompatible Server integrieren oder den [Server-Fork](https://github.com/RealHartlMax/skymp)
verwenden, jeweils ohne Kompatibilitätsgarantie. Upload: [PHP-Webhosting](docs/PHP_HOSTING.md).

**Status audit: 22 October 2026.** [Completed work and remaining acceptance](docs/STATUS.md).
The locally built preview is in `local-builds/current/`; game/CEF and live rollout
are still separate acceptance steps.

[🇩🇪 Deutsch](#-deutsch) · [🇬🇧 English](#-english) · [🇷🇺 Русский](#-русский)

---

## 🇩🇪 Deutsch

> **ACHTUNG: WORK IN PROGRESS (WIP)**
> Eine lokale Preview 0.2.0 mit Serverbrowser, Mod-/Clientpaket-Vorbereitung und PHP-Master ist gebaut und automatisiert geprüft. Die vollständige Skyrim-/CEF-Spielprüfung und öffentliche Betriebsfreigabe stehen noch aus. Beiträge und Tests sind willkommen.

### 🌟 Die Vision

SkyMP ist eine beeindruckende technische Leistung. Um jedoch das volle Potenzial auszuschöpfen – ähnlich wie bei **FiveM** oder **RedM** – benötigen wir eine Infrastruktur, die Dezentralisierung erlaubt.

Ziel dieses Projekts ist es, einen **universellen Launcher** und eine **Master-Server-Infrastruktur** zu schaffen. Weg von der fest kodierten Server-IP, hin zu einer lebendigen Community-Serverliste, auf der jeder seinen eigenen Skyrim-Server hosten und bewerben kann.

### 🏗️ System-Architektur

Vier Kernkomponenten arbeiten zusammen:

| Komponente | Technologie | Aufgabe |
|---|---|---|
| Client Plugin | C++ / SKSE | Liest Verbindungsziel dynamisch aus `Data/Platform/Plugins/skymp5-client-settings.txt` |
| Launcher (Frontend) | Tauri + React/TS | Server-Browser, Einstellungen, Spielstart |
| Master Server (Backend) | PHP / MySQL | Registry-API für Heartbeats & Serverliste (läuft auf `api.skymp-worlds.net`) |
| Dedicated Server | C++ (SkyMP) | Sendet Heartbeat, registriert sich automatisch |

**API-Austausch:** Die zentrale Plattform für den Austausch zwischen Launcher, Servern und Master-Server ist [https://skymp-worlds.net/](https://skymp-worlds.net/) (bzw. deren Subdomains).

### 🗺️ Roadmap

Detaillierte Roadmap: [ROADMAP.md](ROADMAP.md)

### 🤝 Mitwirken

Wir suchen Unterstützung in folgenden Bereichen:
- **C++ Entwickler** – Arbeit am SKSE-Plugin und Memory-Injection
- **Frontend-Entwickler** – React/TypeScript und idealerweise Rust (Tauri)
- **Backend-Entwickler** – Aufbau einer hochverfügbaren Master-Server-API

---

## 🇬🇧 English

> **NOTICE: WORK IN PROGRESS (WIP)**
> A local 0.2.0 preview with server browsing, verified mod/client-package preparation and a PHP master has been built and checked. Full Skyrim/CEF gameplay acceptance and public deployment remain open. Contributions and testing are welcome.

### 🌟 The Vision

SkyMP is an impressive technical achievement. However, to unlock its full potential – similar to **FiveM** or **RedM** – we need an infrastructure that allows decentralization.

The goal of this project is to create a **universal launcher** and a **master server infrastructure**. Moving away from hard-coded server IPs, towards a living community server list where anyone can host and advertise their own Skyrim server.

### 🏗️ System Architecture

Four core components working together:

| Component | Technology | Responsibility |
|---|---|---|
| Client Plugin | C++ / SKSE | Reads connection target dynamically from `Data/Platform/Plugins/skymp5-client-settings.txt` |
| Launcher (Frontend) | Tauri + React/TS | Server browser, settings management, game launch |
| Master Server (Backend) | PHP / MySQL | Registry API for heartbeats & server list (runs on `api.skymp-worlds.net`) |
| Dedicated Server | C++ (SkyMP) | Sends heartbeat, registers itself automatically |

**API Exchange:** The central platform for communication between launcher, servers, and master server is [https://skymp-worlds.net/](https://skymp-worlds.net/) (and its subdomains).

### 🗺️ Roadmap

See detailed roadmap: [ROADMAP.md](ROADMAP.md)

### 🤝 Contributing

We are looking for help in the following areas:
- **C++ Developers** – Work on the SKSE plugin and memory injection
- **Frontend Developers** – Experience with React/TypeScript and ideally Rust (Tauri)
- **Backend Developers** – Building a highly available master server API

### 📁 Repository Structure

```
skymp-client-launcher/
├── launcher/           # Tauri + React desktop app (server browser)
│   ├── src/            # React/TypeScript frontend
│   └── src-tauri/      # Rust backend (Tauri)
├── web/
│   ├── landing-page/   # Multi-language landing page (HTML/CSS/JS)
│   └── api.skymp-worlds.net/ # PHP/MySQL registry API
│       ├── heartbeat.php   # Heartbeat ingest / upsert
│       ├── list.php        # Public server list
│       ├── servers.sql     # Registry schema
│       └── api/servers/    # Compatibility endpoint (/api/servers)
├── docs/               # Architecture diagrams & additional docs
└── ROADMAP.md          # Detailed phased roadmap
```

---

## 🇷🇺 Русский

> **ВНИМАНИЕ: В РАЗРАБОТКЕ (WIP)**
> Локальная preview-версия 0.2.0 с браузером серверов, проверенной подготовкой модов/клиента и PHP-мастером собрана и проверена. Полная проверка Skyrim/CEF в игре и публичное развёртывание ещё не завершены. Приглашаем участников и тестировщиков.

### 🌟 Видение

SkyMP – это впечатляющее техническое достижение. Однако, чтобы раскрыть его полный потенциал – подобно **FiveM** или **RedM** – нам необходима инфраструктура, допускающая децентрализацию.

Цель этого проекта – создать **универсальный лаунчер** и **инфраструктуру мастер-сервера**. Отказаться от жёстко заданного IP-адреса сервера в пользу живого списка серверов сообщества, где каждый сможет размещать и продвигать собственный сервер Skyrim.

### 🏗️ Архитектура системы

Четыре ключевых компонента работают вместе:

| Компонент | Технология | Задача |
|---|---|---|
| Клиентский плагин | C++ / SKSE | Читает цель подключения динамически из `Data/Platform/Plugins/skymp5-client-settings.txt` |
| Лаунчер (фронтенд) | Tauri + React/TS | Браузер серверов, настройки, запуск игры |
| Мастер-сервер (бэкенд) | PHP / MySQL | Registry API для хартбитов и списка серверов (работает на `api.skymp-worlds.net`) |
| Игровой сервер | C++ (SkyMP) | Отправляет хартбит, автоматически регистрируется |

**API-обмен:** Центральная платформа для обмена между лаунчером, серверами и мастер-сервером — это [https://skymp-worlds.net/](https://skymp-worlds.net/) (и её поддомены).

### 🗺️ Дорожная карта

Подробная дорожная карта: [ROADMAP.md](ROADMAP.md)

### 🤝 Как помочь проекту

Мы ищем помощь в следующих направлениях:
- **C++ разработчики** – работа над SKSE-плагином и внедрением в память
- **Frontend-разработчики** – опыт с React/TypeScript и желательно Rust (Tauri)
- **Backend-разработчики** – построение высокодоступного API мастер-сервера

---

## 🔗 Resources / Ressourcen / Ресурсы

- [SkyMP Server Source](https://github.com/RealHartlMax/skymp)
- [SKSE64 Source](https://github.com/ianpatt/skse64)
- [FiveM Source (Inspiration)](https://github.com/citizenfx/fivem)
## PHP hosting and online accounts

See [PHP hosting with independent subdomains](docs/PHP_HOSTING.md) for the five
separate upload archives, shared CSS, existing dashboard accounts and native server
authentication. No Node service is required on the PHP webspace. Run
`node tests/php-master-smoke.mjs` for isolated local HTTP tests. The optional Node
reference preview is described in [local setup](docs/LOCAL_AND_LIVE.md).
No demo accounts are created. These commands do not deploy or publish anything.
