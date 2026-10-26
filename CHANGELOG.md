# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-10-26

### Added

- Verified mod/client-package preparation with manifest v2, sizes, SHA-256, subdirectories, cache repair and server load order.
- External game-version catalogs for matching SkyMP, SKSE and Address Library packages.
- Steam tickets, server-bound authentication, player display names and precise Steam error diagnostics.
- Reversible activation, original-file restoration and preservation of externally changed load-order files.
- Country flags, server artwork, online/offline state, detailed server pages and persistent history.
- Account/interface/game settings, streamer privacy, optional ambient audio and Discord desktop activity.
- Process lifecycle/exit-code monitoring and consent-based crash reports with local export and separate dump approval.
- Manual portable Windows-x64 release assets: EXE, ZIP with instructions/licenses, and SHA256SUMS.

### Changed

- Connection splash now closes after confirmed Skyrim process startup; pending preparation and startup errors keep it visible.
- German, English and Russian UI and operator documentation cover the current connection and hosting contracts.
- Documentation separates launcher releases, external native runtimes, the VPS game server and independent PHP webroots.

### Validation and scope

- Windows release/frontend build and 69 active Rust tests passed; three separate integration tests were excluded.
- A user confirmed startup and movement with the separate native runtime. This is not acceptance of every game/server/mod combination.
- The launcher release contains no game server, PHP websites or native game runtime. Publication and tagging are manual steps.

## [0.1.0] - 2026-04-23

### Added

- Launcher-first server browser flow with live server filtering and favorites
- Skyrim path onboarding with SKSE checks and import of existing SkyMP settings
- Dynamic launcher layout for ultra-compact, compact, balanced, and wide windows
- Shared release metadata pipeline via version.json for launcher and websites
- Developer integration guidance for SkyMP ecosystem projects

### Changed

- Landing and update pages now consume centralized version metadata
- Update flow is simplified around GitHub release assets plus version.json

### Notes

- This release focuses on stable server discovery and connect flow for v0.1.0
- Legacy master auth replacement is intentionally scoped out of the first iteration
