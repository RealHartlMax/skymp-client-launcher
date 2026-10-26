# Contributing to SkyMP Open Launcher

Checked against the local project on **22 October 2026**. Start with
[current status](docs/STATUS.md), [developer setup](docs/SETUP.md),
[server connection](docs/CONNECTING.md) and [PHP hosting](docs/PHP_HOSTING.md).

## Components

- `launcher/`: Tauri 1 / React / TypeScript frontend and Rust preparation backend.
- `web/`: independent PHP/static webroots. The PHP master uses the existing
  Manage dashboard's accounts. See the config examples and schemas in those roots.
- `master-api/`: optional Node.js 24+ / SQLite reference with separate local accounts.
- The native/in-game SkyMP client and game server are in the separate
  `skymp` repository. There is no standalone `client-plugin/*.vcxproj` project here.

## Desktop development

Use Node/npm, a Rust toolchain and the platform's configured Tauri/C++ build
prerequisites. The local checked toolchain uses Node.js 24 on Windows.

```powershell
cd launcher
npm ci
npm run build
npm run test:backend
npm run tauri dev
```

For a headless Rust-only test, `npm run test:backend` uses
`--no-default-features --lib`. See [runtime updates](docs/RUNTIME_UPDATES.md)
for package/catalog tools and `node tests/runtime-packaging.mjs` from the repo root.
Tests use separate temporary fixtures and must not start Skyrim implicitly.

## PHP and hosting

Use the actual `web/api.skymp-worlds.net/` and
`web/manage.skymp-worlds.net/` paths; the old `api-backend-php/` paths do not exist.
PHP config files contain deployment-specific values and remain private.
The upload order, schemas and local isolated PHP checks are documented in
[PHP_HOSTING.md](docs/PHP_HOSTING.md) and [LOCAL_AND_LIVE.md](docs/LOCAL_AND_LIVE.md).

## Validation and changes

Report the exact test/package scope. A build or loopback download is not a
Skyrim/CEF gameplay result. Keep credentials, server/world data and valid
original-file backups intact. Do not treat a roadmap checkbox as proof of a
live deployment; record that acceptance separately.

Use existing TypeScript/Rust style and submit focused changes with the relevant
checks. Bug reports should include component/version, reproduction and redacted logs.
