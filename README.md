# 🛠️ SkyMP Open Launcher Initiative (WIP)

[🇩🇪 Deutsch](#-deutsch) · [🇬🇧 English](#-english) · [🇷🇺 Русский](#-русский)

---

## 🇩🇪 Deutsch

> **ACHTUNG: WORK IN PROGRESS (WIP)**
> Dieses Projekt befindet sich in der frühen Konzeptions- und Planungsphase. Derzeit gibt es noch keine lauffähige Version für Endnutzer. Wir suchen aktiv nach C++, Web- und Backend-Entwicklern!

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
> This project is in its early concept and planning phase. There is no working version for end users yet. We are actively looking for C++, web, and backend developers!

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
> Этот проект находится на ранней стадии концептуального планирования. Работающей версии для конечных пользователей пока нет. Мы активно ищем разработчиков на C++, веб и бэкенд!

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