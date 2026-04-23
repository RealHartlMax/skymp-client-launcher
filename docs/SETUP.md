# SkyMP Launcher - Developer Setup

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | >= 18 | Launcher frontend |
| Rust | stable | Tauri backend |
| PHP | >= 8.1 | Web API + Manage dashboard |
| MySQL or MariaDB | current | Central server registry |
| Apache or Nginx | current | Host subdomains and PHP endpoints |

## Quick Start

### 1) API (PHP + MySQL)

1. Copy API config:
```bash
cp web/api.skymp-worlds.net/config.php.example web/api.skymp-worlds.net/config.php
```
2. Fill DB credentials in `web/api.skymp-worlds.net/config.php`.
3. Import schema:
```bash
mysql -u root -p skymp_masterlist < web/api.skymp-worlds.net/servers.sql
```
If your table already exists in production, apply the migration script instead:
```bash
mysql -u root -p skymp_masterlist < web/api.skymp-worlds.net/migrations/2026-04-23_servers_table_upgrade.sql
```
4. Verify API:
- `GET /list.php` returns active servers from DB.
- `POST /heartbeat.php` updates server heartbeat data.

SkyMP-compatible heartbeat payload (recommended for v0.1.0):

```json
{
	"masterKey": "your-server-key",
	"name": "My SkyMP Server",
	"ip": "203.0.113.10",
	"port": 7777,
	"maxPlayers": 100,
	"online": 12
}
```

Notes:
- `POST /api/servers/<masterKey>` is supported as compatibility route.
- The API accepts aliases such as `max_players`/`maxPlayers` and `current_players`/`online`.
- If `ip` is omitted, source IP fallback is used, but explicit `ip`+`port` is preferred.

### 2) Manage Dashboard (PHP)

1. Copy dashboard config:
```bash
cp web/manage.skymp-worlds.net/config.php.example web/manage.skymp-worlds.net/config.php
```
2. Ensure URLs in dashboard config point to your API deployment.
3. Open `manage.skymp-worlds.net` and test server creation / API key flow.

### 3) Launcher (Tauri + React)

```bash
cd launcher
npm install
npm run tauri dev
```

The launcher now reads server list data from `VITE_SERVER_LIST_URL`.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_SERVER_LIST_URL` | `https://api.skymp-worlds.net/list.php` | Server list endpoint consumed by launcher |
| `VITE_VERSION_JSON_URL` | `https://update.skymp-worlds.net/version.json` | Release metadata endpoint consumed by launcher and websites |

## Launcher-First Integration Model

This project targets a central launcher flow similar to RedM/FiveM:

- Server owners register and maintain their server entries through `manage.skymp-worlds.net`.
- Game servers send heartbeat updates to `api.skymp-worlds.net`.
- The launcher and `servers.skymp-worlds.net` consume the central server list.
- Players select a server in the launcher and connect through local SkyMP client configuration.

For external projects and server developers, this means `skymp-worlds` should be treated primarily as a central server registry and connect directory, not as a full clone of the legacy `gateway.skymp.net` auth stack.

### What Is In Scope

- Central server registration and moderation state
- Heartbeat-based live updates for online players, max players, IP, and port
- Public server list for launcher and web browser clients
- Optional per-server metadata such as country, tags, description, and branding
- Launcher-driven connect flow using locally written SkyMP settings

### What Is Not Required For v0.1.0

- Reimplementing the server admin dashboard routes from unrelated projects
- Reproducing the legacy browser login flow for players
- Full replacement of every `gateway.skymp.net` endpoint
- Cross-server player accounts, economy, purchases, or cloud identity

The admin login is only relevant for server operators managing their entries. It is not required for normal player browsing and joining in the launcher-first model.

## Minimal API Contract For External Integrations

The following API surface is sufficient for a launcher-driven server browser and join flow.

### Required Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/list.php` or `/api/servers` | Return active public servers for launcher and web clients |
| `POST` | `/heartbeat.php` or `/api/servers/<masterKey>` | Receive live server updates from the game server |

### Recommended Endpoint

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/servers/<masterKey>/serverinfo` | Resolve the final connect target if launcher or client should connect by `masterKey` instead of raw IP/port |

### Required Server List Fields

Each public server list entry should provide at least:

```json
{
	"id": "my-server",
	"masterKey": "my-server",
	"name": "My SkyMP Server",
	"ip": "203.0.113.10",
	"port": 7777,
	"online": 12,
	"maxPlayers": 100,
	"countryCode": "DE",
	"description": "Roleplay server with custom progression",
	"tags": ["roleplay", "eu"],
	"version": "0.1.0"
}
```

Only `id` or `masterKey`, `name`, `ip`, `port`, `online`, and `maxPlayers` should be considered mandatory for the first working launcher flow.

### Required Heartbeat Fields

Heartbeat payloads should provide at least:

```json
{
	"masterKey": "my-server",
	"name": "My SkyMP Server",
	"ip": "203.0.113.10",
	"port": 7777,
	"maxPlayers": 100,
	"online": 12
}
```

Additional metadata such as `countryCode`, `description`, `tags`, or `version` can be attached when available.

## Developer Notes For The Other Project

If another SkyMP-related project wants to integrate with this launcher ecosystem, the recommended approach is:

1. Keep the game server responsible for sending heartbeat updates.
2. Use `skymp-worlds` as the authoritative public directory of active servers.
3. Let the launcher own player-side server selection and local connection setup.
4. Avoid depending on legacy player browser login unless global account features are explicitly required.

In short: build for server discovery first, connect reliability second, and player identity last.

## Developer Notes For The SkyMP Project

For the SkyMP game server and client project itself, the important architectural point is that the launcher becomes the primary entry point for players.

This changes the integration priorities:

1. The SkyMP dedicated server should reliably publish its live state to `skymp-worlds`.
2. The launcher should be treated as the main server browser and server selection UI.
3. The in-game client should connect using launcher-provided target data instead of depending on a hard-coded default server.
4. Legacy master-auth flows should only be kept when a concrete gameplay or account feature requires them.

### What SkyMP Should Provide

- A stable heartbeat payload containing at least `masterKey`, `name`, `ip`, `port`, `maxPlayers`, and `online`
- Explicit public connect data in heartbeat messages so the launcher can offer reliable joins
- A local client config path that the launcher can write before startup
- A clean separation between server discovery and optional account or community features

### What SkyMP Should Not Assume

- That player login must happen through the old browser-based master flow
- That `gateway.skymp.net` remains the permanent source of truth for public server discovery
- That server selection only happens inside the game client
- That admin dashboard features are part of the player connect path

### Recommended SkyMP Responsibilities

| Area | Recommendation |
|---|---|
| Dedicated server | Send heartbeat updates on a fixed interval and always include explicit `ip` and `port` |
| Client plugin | Read launcher-provided connect settings from local configuration before connecting |
| Launcher integration | Prefer selected server metadata from `skymp-worlds` over hard-coded defaults |
| Authentication | Keep optional and decoupled from the first launcher-based connect flow |

### Minimal Compatibility Goal

For the first practical integration, the SkyMP project does not need to fully replace the old master server stack. It only needs to cooperate with this launcher model:

- server advertises itself through heartbeat
- launcher loads and filters the public server list
- launcher writes connect target locally
- game starts and connects to the selected server

This is the minimum path that delivers a FiveM/RedM-style experience without blocking on a full account, session, or commerce backend.

### Suggested GitHub Issue Text For SkyMP

Use the following text as a starting point for an issue or discussion in the SkyMP repository:

```md
## Launcher-first server discovery integration

### Goal

Align SkyMP with a launcher-first flow similar to FiveM/RedM, where:

- community servers register themselves in a central directory
- the launcher shows the public server list
- the launcher writes the selected connect target locally
- the game starts and connects to the selected server

### Why this matters

The launcher and `skymp-worlds` infrastructure are intended to become the main entry point for players. This reduces the need for hard-coded default servers and avoids blocking the first usable server browser experience on a full legacy master/auth reimplementation.

### What SkyMP should support

- dedicated server sends stable heartbeat updates with `masterKey`, `name`, `ip`, `port`, `maxPlayers`, and `online`
- heartbeat always includes explicit public connect data
- client/plugin reads launcher-provided connect settings before startup or on startup
- server discovery is decoupled from optional player account and browser-login flows

### What is not required for the first step

- full replacement of every `gateway.skymp.net` endpoint
- mandatory browser-based player login
- admin dashboard features in the player connect path
- commerce, purchases, or cross-server identity features

### Initial compatibility target

1. server advertises itself via heartbeat
2. launcher loads and filters public server list
3. launcher writes selected target locally
4. SkyMP client starts and connects to the selected server

### Implementation notes

- prefer explicit `ip` and `port` over implicit source-IP fallback
- treat the launcher as the primary server-selection UI
- keep legacy master-auth only where a concrete gameplay feature still depends on it
```

#### Deutsche Version

```md
## Launcher-first Integration fuer Serverliste und Verbindungsaufbau

### Ziel

SkyMP soll auf einen launcher-zentrierten Ablauf ausgerichtet werden, aehnlich wie bei FiveM oder RedM:

- Community-Server registrieren sich in einem zentralen Verzeichnis
- der Launcher zeigt die oeffentliche Serverliste an
- der Launcher schreibt das ausgewaehlte Verbindungsziel lokal
- das Spiel startet und verbindet sich mit dem ausgewaehlten Server

### Warum das wichtig ist

Der Launcher und die `skymp-worlds`-Infrastruktur sollen zum zentralen Einstiegspunkt fuer Spieler werden. Damit wird die Abhaengigkeit von fest kodierten Default-Servern reduziert, und die erste nutzbare Serverbrowser-Erfahrung wird nicht durch eine komplette Nachbildung des alten Master-/Auth-Stacks blockiert.

### Was SkyMP dafuer unterstuetzen sollte

- der Dedicated Server sendet stabile Heartbeats mit `masterKey`, `name`, `ip`, `port`, `maxPlayers` und `online`
- Heartbeats enthalten immer explizite oeffentliche Verbindungsdaten
- Client oder Plugin lesen launcher-geschriebene Verbindungsdaten vor dem Start oder beim Start
- Server-Discovery wird von optionalen Spieler-Account- und Browser-Login-Flows getrennt

### Was fuer den ersten Schritt nicht noetig ist

- vollstaendiger Ersatz aller `gateway.skymp.net`-Endpoints
- verpflichtender browserbasierter Spieler-Login
- Admin-Dashboard-Funktionen im Spieler-Join-Pfad
- Commerce-, Purchase- oder Cross-Server-Identity-Features

### Erstes Kompatibilitaetsziel

1. Server meldet sich per Heartbeat an
2. Launcher laedt und filtert die oeffentliche Serverliste
3. Launcher schreibt das ausgewaehlte Ziel lokal
4. SkyMP-Client startet und verbindet sich mit dem ausgewaehlten Server

### Implementierungshinweise

- explizites `ip` und `port` gegenueber implizitem Source-IP-Fallback bevorzugen
- den Launcher als primaere UI fuer die Serverauswahl behandeln
- Legacy-Master-Auth nur dort behalten, wo konkrete Gameplay-Funktionen weiter davon abhaengen
```

#### Русская версия

```md
## Интеграция launcher-first для списка серверов и подключения

### Цель

SkyMP должен поддерживать launcher-first сценарий, похожий на FiveM или RedM:

- серверы сообщества регистрируются в центральном каталоге
- лаунчер показывает публичный список серверов
- лаунчер локально записывает выбранную цель подключения
- игра запускается и подключается к выбранному серверу

### Почему это важно

Лаунчер и инфраструктура `skymp-worlds` должны стать основной точкой входа для игроков. Это уменьшает зависимость от жёстко заданных серверов по умолчанию и позволяет запустить первый рабочий браузер серверов без полной реализации старого master/auth стека.

### Что SkyMP должен поддерживать

- dedicated server отправляет стабильные heartbeat-запросы с `masterKey`, `name`, `ip`, `port`, `maxPlayers` и `online`
- heartbeat всегда содержит явные публичные данные для подключения
- клиент или плагин читают данные подключения, записанные лаунчером, до запуска или при запуске
- логика discovery серверов отделена от опциональных account- и browser-login-сценариев

### Что не требуется на первом этапе

- полная замена всех endpoint'ов `gateway.skymp.net`
- обязательный browser-based login для игроков
- функции admin dashboard в игровом пути подключения
- commerce, purchase или cross-server identity функциональность

### Первая цель совместимости

1. сервер публикует себя через heartbeat
2. лаунчер загружает и фильтрует публичный список серверов
3. лаунчер локально записывает выбранную цель подключения
4. клиент SkyMP запускается и подключается к выбранному серверу

### Заметки по реализации

- явные `ip` и `port` предпочтительнее, чем неявный source-IP fallback
- лаунчер должен считаться основной UI для выбора сервера
- legacy master-auth следует сохранять только там, где от него всё ещё зависят конкретные игровые функции
```

### Technical Checklist For SkyMP

#### Dedicated Server

- send heartbeat on a fixed interval to `skymp-worlds`
- include `masterKey`, `name`, `ip`, `port`, `maxPlayers`, and `online`
- include optional metadata when available: `version`, `description`, `countryCode`, `tags`
- avoid relying on source-IP inference when public IP is known
- keep `masterKey` stable across restarts and deployments

#### Client / Plugin

- read launcher-written connection target before connecting
- support a local config source for selected server `ip` and `port`
- avoid hard-failing when legacy master-auth is unavailable in launcher-first mode
- keep the connection path independent from admin or dashboard-specific features

#### Launcher Compatibility

- accept server list entries keyed by `id` and/or `masterKey`
- prefer directory-provided metadata over hard-coded defaults
- allow direct join using explicit `ip` and `port`
- optionally support `serverinfo` lookup when connecting by `masterKey`

#### Architecture / Cleanup

- separate server discovery logic from optional player identity logic
- document which remaining features still require legacy master endpoints
- define launcher-first mode as a supported deployment path
- keep account, commerce, and social features optional for `v0.1.0`

## Project Structure

```text
skymp-client-launcher/
├── launcher/
│   ├── src/               # React/TypeScript frontend
│   └── src-tauri/         # Tauri (Rust) backend
├── web/
│   ├── api.skymp-worlds.net/      # PHP/MySQL registry API
│   ├── manage.skymp-worlds.net/   # PHP management dashboard
│   ├── servers.skymp-worlds.net/  # Public server browser
│   ├── landing-page/              # Landing and legal pages
│   └── update.skymp-worlds.net/   # Static update metadata
├── docs/
│   ├── ARCHITECTURE.md
│   └── SETUP.md
└── README.md
```
