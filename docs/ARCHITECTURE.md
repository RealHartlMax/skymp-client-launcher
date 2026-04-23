# 🏛️ SkyMP Worlds Infrastructure Architecture

This document outlines the target architecture for the `skymp-worlds.net` domain and its subdomains. The goal is to create a clear, scalable, and maintainable infrastructure for the SkyMP community.

## 🌐 Subdomain Strategy

The infrastructure is split across multiple subdomains, each with a specific role and technology stack. This separation of concerns makes the system more robust and easier to develop and maintain.

| Subdomain | Technology | Responsibility |
|---|---|---|
| `skymp-worlds.net` | HTML / CSS / JS | The main, multilingual "Work-In-Progress" landing page. This is a static site that informs users about the project's status. |
| `api.skymp-worlds.net` | PHP / MySQL | The core backend API. This service is not intended for direct user access. It handles server heartbeats, validates API keys, and provides the server list as a JSON output. |
| `servers.skymp-worlds.net` | React or HTML/JS | The web-based server browser. This public-facing website fetches the JSON data from the API and displays the list of active servers in a user-friendly way. It's a lightweight alternative to the desktop launcher. |
| `manage.skymp-worlds.net` | PHP or React | A web dashboard for server administrators. Here, admins can log in (e.g., via Discord OAuth), manage their registered servers, and generate or revoke API keys for the heartbeat service. |
| `update.skymp-worlds.net` | Static (JSON) | An endpoint dedicated to the automatic update mechanism of the Tauri launcher. It provides metadata (like the latest version number) and links to download new executable files. |

## ⚙️ Data Flow Example: Server Registration

1.  A **SkyMP Dedicated Server** sends a POST heartbeat to `api.skymp-worlds.net/heartbeat.php` every few minutes, including runtime metadata such as player count and server info.
2.  The **API Backend** matches the server by `api_key`, `server_uid`, or `ip+port` and updates `last_heartbeat` plus metadata.
3.  If enabled in API config, heartbeat can auto-register unknown servers (no mandatory dashboard pre-create).
4.  A **Server Admin** can still use `manage.skymp-worlds.net` for manual edits, key rotation, moderation state, and operational notes.
5.  A **Player** opens the **Tauri Launcher** or visits `servers.skymp-worlds.net`.
6.  The frontend makes a GET request to `api.skymp-worlds.net/list.php`.
7.  The **API Backend** returns all non-draft servers with recent heartbeats as a structured JSON array.
8.  The **Frontend** parses the JSON and displays the server list to the player.
9.  The player clicks "Connect" in the launcher. The launcher writes the selected server's IP and port to the local `connection.json` file and starts the game.
10. The **C++ Client Plugin** (in-game) reads `connection.json` and injects the IP/port into the game's memory, connecting the player to the server.

## 🔁 SkyMP Compatibility Notes

- The API accepts both snake_case and SkyMP-style camelCase fields in heartbeat payloads.
- Common accepted aliases:
	- `current_players` or `online`
	- `max_players` or `maxPlayers`
	- `ip` or `serverIp`
	- `port` or `serverPort`
	- `api_key` or `masterKey`
	- `country_code` or `countryCode`
- If `ip` is not sent, the API falls back to request source IP (`X-Forwarded-For` / `REMOTE_ADDR`).
- For stable launcher connect data, SkyMP runtime should send explicit `ip` and `port` in heartbeat payloads.
- A compatibility endpoint exists at `/api/servers`:
	- `GET /api/servers` -> public server list
	- `POST /api/servers/<masterKey>` -> heartbeat/update for the matching server key