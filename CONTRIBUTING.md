# Contributing to SkyMP Worlds Launcher

Documentation reviewed **26 October 2026**, launcher **0.2.0**. Start with the [documentation index](docs/README.md), [development guide](docs/DEVELOPMENT.md) and [current validation scope](docs/STATUS.md).

## Components

- `launcher/`: Tauri 1, React/TypeScript and the Rust preparation/authentication/diagnostic backend.
- `web/`: independent local PHP/static webroots and shared launcher assets. This tree is currently ignored by Git; a fresh checkout requires the shared inputs listed in the development guide.
- `master-api/`: optional Node.js 24+ reference with isolated local accounts.
- Native game client and game server: separate [SkyMP fork](https://github.com/RealHartlMax/skymp).

## Build and validate

After supplying the required shared build assets:

```powershell
cd launcher
npm ci
npm run build
npm run test:backend
npm run tauri -- build
```

Use `npm run tauri -- dev` for desktop development. The browser-only Vite page cannot invoke native commands. Release assets and manual publication are described in [RELEASING.md](docs/RELEASING.md); do not package the entire Cargo target directory.

Run the checks relevant to the change. Record passed, failed and excluded tests separately. A package, loopback or browser-simulation result is not a multiplayer qualification. The release currently has 69 passing Rust tests and three excluded integration tests; see its dated evidence rather than treating these numbers as permanent.

## Changes and documentation

- Keep DE/EN/RU UI strings and language-specific operator instructions aligned.
- Update behavior in the source guide; avoid stacking contradictory dated addenda.
- Preserve stable explicit handbook anchors so existing links keep working.
- Keep original game files, external edits, private configuration, account data and server/world state recoverable.
- Do not log keys, Steam tickets, access tokens or unrestricted configuration.
- Distinguish the launcher, native runtime, VPS service and PHP deployment when describing a fix.

The development branch is `main`; version tags use names such as `v0.2.0`. Avoid assigning a branch and a tag the same name. Do not move an existing release tag or publish artifacts as a side effect of a documentation change.

Bug reports should identify the component/build, reproduction steps and sanitized diagnostics. The launcher's report export can supply a bounded report; full dumps require separate consent.

## Documentation checks

Check relative links and anchors, example JSON and language alignment. Render the operator handbooks with `node scripts/build-docs.mjs` when their source changes; this needs the complete local web/shared source tree. A documentation update does not rebuild the launcher or publish the generated website.

Community: [Discord](https://discord.gg/NSXtNNbjuR). Project license: [GPL-3.0](LICENSE).
