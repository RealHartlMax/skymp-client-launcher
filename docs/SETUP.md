# SkyMP Launcher – Developer Setup

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 18 | Launcher frontend + Master Server |
| Rust | stable | Tauri backend |
| Cargo | (bundled with Rust) | Rust package manager |
| Tauri CLI | via npm | Build & dev commands |

## Quick Start

### Master Server (Node.js)
```bash
cd master-server
npm install
npm run dev        # starts on http://localhost:3000
```

Test it:
```bash
# Announce a server
curl -X POST http://localhost:3000/servers/announce \
  -H "Content-Type: application/json" \
  -d '{"id":"srv1","name":"My Server","ip":"127.0.0.1","port":7777,"players":2,"maxPlayers":32}'

# Get server list
curl http://localhost:3000/servers/list
```

### Launcher (Tauri + React)
```bash
cd launcher
npm install
npm run tauri dev  # opens desktop window + hot-reload
```

> **Note:** Tauri requires the [Rust toolchain](https://rustup.rs/) and the
> [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)
> for your OS to be installed first.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Master server port |
| `VITE_MASTER_SERVER_URL` | `http://localhost:3000` | URL the launcher connects to |

## Project Structure
```
skymp-client-launcher/
├── launcher/
│   ├── src/               # React/TypeScript frontend
│   │   ├── main.tsx       # React entry point
│   │   ├── App.tsx        # Server browser UI
│   │   └── App.css        # Styles
│   ├── src-tauri/
│   │   ├── src/main.rs    # Tauri commands (join_server, launch SKSE)
│   │   ├── Cargo.toml
│   │   ├── build.rs
│   │   └── tauri.conf.json
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── master-server/
│   └── src/
│       ├── index.js          # Express app entry
│       └── routes/servers.js # /list and /announce endpoints
├── docs/
│   └── SETUP.md             # This file
├── README.md
└── ROADMAP.md
```
