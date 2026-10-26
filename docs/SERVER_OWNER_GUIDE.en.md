# Server operator handbook

## Scope & compatibility {#compatibility}

This handbook describes the shared SkyMP Worlds launcher **0.2.0** and the interfaces checked on **2026-10-22**. You can extend an existing compatible SkyMP server or use the [RealHartlMax/SkyMP fork](https://github.com/RealHartlMax/skymp) as a starting point. Registering with the launcher does not automatically migrate player data or the game world.

**There is no compatibility guarantee.** A server listing, a successfully loaded manifest or a successful build does not prove that a game session works. The game protocol, server, native client, Skyrim version, SKSE, Address Library, mods and load order must match. Adding HTTP routes does not make another multiplayer mod compatible with SkyMP.

Test changes on a separate installation first. Back up server settings, world data, accounts and keys before switching. Examples contain recognizable placeholders; file sizes, CRC32 and SHA-256 must be generated from your actual files.

## How the services work together {#architecture}

| Component | Address / protocol | Purpose |
| --- | --- | --- |
| Central list | `https://api.skymp-worlds.net/list.php` | Discover servers; fixed in the launcher |
| Operator account | `https://manage.skymp-worlds.net/` | Register servers and manage metadata and private keys |
| Online master | `https://api.skymp-worlds.net` | Authentication, heartbeats and game sessions |
| Your game server | Public host and UDP port, for example `7777` | Actual game connection |
| Your file server | Public HTTP(S) base, for example `https://files.example.org/` | Mod manifest and downloads |
| Client catalog | Full URL to `catalog.json` | Select a matching native client / SKSE combination |

The game address, file server and master are separate destinations. `resourceUrl` is the file server base, not the URL of its manifest route. In contrast, `runtimeSource` is a full catalog or client manifest URL. The launcher prepares files and then starts the SKSE loader from the selected game directory.

## Route A: Use the linked fork {#fork}

1. Use the [RealHartlMax fork](https://github.com/RealHartlMax/skymp). Check the chosen commit or specific release; an arbitrary upstream package does not necessarily include the same launcher extensions.
2. For your own build, follow the fork's [CMake workflow](https://github.com/RealHartlMax/skymp/blob/main/docs/docs_cmake_workflow.md) and [CONTRIBUTING.md](https://github.com/RealHartlMax/skymp/blob/main/CONTRIBUTING.md). Replace a running installation only after backup and testing.
3. Build output normally places the server in `build/dist/server` and the Windows client in `build/dist/client`. Prepared server packages start through `launch_server.bat` or `launch_server.sh`. The fork's [server guide](https://github.com/RealHartlMax/skymp/blob/main/docs/docs_running_a_server.md) describes the required runtime and initial setup.
4. Supply your own Skyrim / DLC master files in the configured `dataDir`. Server packages do not replace your own Skyrim installation. Preserve an existing compatible load order.
5. Register the server, add the [connection settings](#configuration), publish mods and a matching client package, and complete the [validation steps](#validation).

Create a separate source checkout:

```sh
git clone https://github.com/RealHartlMax/skymp.git skymp-server-source
cd skymp-server-source
```

Cloning does not build or start the server. The launcher extension mainly involves `skymp5-server/ts/launcherResources.ts`, its registration in `ui.ts`, and the master / login systems. The published mod routes were compared with the local source; this does not validate your own binaries. Local unpublished client changes do not become available simply by linking the repository.

## Route B: Integrate an existing server {#existing}

Extend your current server deliberately. The shared launcher changes neither your gamemode logic nor your database format. A different implementation may need additional adjustments.

| Requirement | What you must supply or check |
| --- | --- |
| Game protocol | A UDP server compatible with the native SkyMP client in use |
| Connection settings | Public game host, game port, file base URL, authentication mode and client source |
| Mod delivery | Prefer [manifest v2](#manifest) and verifiable downloads; alternatively the limited [legacy contract](#legacy) |
| Online authentication | Master heartbeats and server-side session validation according to the [authentication contract](#authentication) |
| Client runtime | Complete client files matching the game and server; a [catalog](#runtime) for automatic version selection |
| Evidence | API, download and restoration checks, followed by actual gameplay tests |

The fork implements modern mod delivery as a separate resource component with explicit settings. Copying its file alone is insufficient: the HTTP router must register it, pass the real source directories and load order, and return appropriate errors. Another server stack can implement the same contract. JSON field names and download rules remain binding.

An existing server can still be opened through **Direct connection** for initial tests. Public name search additionally requires registration and a valid heartbeat. A public listing does not confirm technical compatibility.

## Account, listing & public identity {#registration}

1. Create a regular account in the [operator dashboard](https://manage.skymp-worlds.net/) and confirm your email address if required. Demo accounts are not used for game logins.
2. Add your server with a public host and UDP game port. Set its name and player limit only on the game server; the website receives them by heartbeat. Select status `active` when the entry should be publicly available.
3. Open **Launcher & online authentication** for the entry. Enter the public file server base and full client catalog URL. Description, tags, country, gamemode and your own community links are public profile data. **Host logo and banner on the game server:** place `logo.png` (square) and `banner.png` (recommended 6:1) next to `server-settings.json`. The web image URL fields have been removed. The updated fork detects added, changed and deleted images with the next heartbeat. Each PNG is limited to 8 MiB, 8192 pixels per side and 16 megapixels in total; missing or invalid images use the default view. `/api/launcher/assets` provides public image descriptors; `/api/launcher/assets/logo.png` and `/api/launcher/assets/banner.png` serve the files. The web gateway verifies size and SHA-256 and serves images over HTTPS, avoiding mixed image content even for an HTTP file server. Old manual image URLs are ignored.
4. Enter the displayed values in your game server’s first-time setup or **Settings → Launcher connection**, save and restart the game server cleanly.
5. It appears in the central list after its first complete heartbeat. An empty response `[]` is normal when there are no known entries. Known servers remain visible offline after an offline report or five minutes without a new heartbeat; joining is then disabled.

| Value | Visibility | Use |
| --- | --- | --- |
| `serverUid` | Public | Stable ID for selection and game sessions |
| `masterKey` in `server-settings.json` | Private | Authenticates your server to the master |
| `masterKey` in the public listing | Public | Historical field name; the current PHP master puts the public server ID here |
| Login token / game session | Private | Time-limited user or server authentication |

Never publish the private heartbeat key as a description, tag or download. It does not belong in the player's launcher profile. Rotate keys through the dashboard, then update the private server settings and restart the server.

## Extend your existing server settings {#configuration}

The current fork saves launcher settings through **Settings → Launcher connection** in the server admin dashboard. A new server offers the same fields in browser-based first-time setup. Enter the master URL, public server ID, private server key, public game address and UDP port. Select **Online**, enable mod synchronization and enter a relative resource directory and full catalog URL. **Save connection** updates the existing configuration while preserving other settings and world data. An empty key field keeps a stored key. Then restart the game server cleanly.

The central dashboard displays the matching values in individual fields. It cannot edit files on your remote game server. Other forks need to implement this form themselves; the JSON examples still document the technical contract.

For your dashboard account, choose **Forgot password?** on the login page. The email link is valid for 30 minutes and can be used once. Sign in to the website and game again after resetting. If mail delivery has not been configured, the platform operator must complete the SMTP settings.

This JSON is a **merge example**, not a complete replacement configuration. Keep your server's gamemode, data paths, world data, other settings and complete correct load order. Replace the public ID and private key with those of your own entry.

```json
{
  "port": 7777,
  "uiPort": 8080,
  "listenHost": "0.0.0.0",
  "uiListenHost": "0.0.0.0",
  "master": "https://api.skymp-worlds.net",
  "serverUid": "srv_REPLACE_WITH_PUBLIC_ID",
  "masterKey": "REPLACE_WITH_PRIVATE_SERVER_KEY",
  "offlineMode": false,
  "launcherResources": {
    "enabled": true,
    "directory": "./client-resources",
    "runtimeSource": "https://update.skymp-worlds.net/client-runtime/catalog.json"
  }
}
```

The fork resolves `launcherResources.directory` relative to the server process working directory. Start it from the intended package directory or deliberately choose an absolute path. Without explicit settings, mod delivery is enabled and uses `./client-resources`. Set `enabled: false` to disable the new mod API.

The catalog on the update domain must actually be uploaded and suitable for your client / server combination. Its URL is not a promise of support for every Skyrim version. You can provide your own complete `catalog.json` instead. Keep the server manifest and dashboard consistent; changes to download settings require a new heartbeat.

## Connectivity, TLS & reverse proxies {#network}

| Connection | Typical access | Check |
| --- | --- | --- |
| Game client → game server | `7777/UDP` or your game port | Firewall, NAT and public game address |
| Launcher → file server | `443/TCP` with HTTPS or a direct HTTP port | Anonymous access to manifest and files |
| Game server → master | Outbound `443/TCP` | DNS, TLS certificate and heartbeats |
| Player → dashboard / master | HTTPS | Login, consent and session creation |

PHP hosting can serve the dashboard, master gateway, documentation and static downloads. It cannot replace a continuously running native game server. An ordinary HTTP reverse proxy does not automatically forward the UDP game port.

For a proxy, use the final public base URL, for example `https://files.example.org/realm/`. Both `api/launcher/manifest` and the relative download routes must be accessible under that prefix. The launcher follows no HTTP redirects for manifests or files. Enter the final HTTPS address with a matching hostname; login pages, Basic Auth and redirects are not public downloads.

Download / catalog URLs must contain no credentials, query parameters or fragments. The public PHP master rejects private, loopback and link-local destinations, including DNS resolutions to them. `127.0.0.1` refers to the player's own computer from their perspective. Use a direct local connection during development; do not publish internal addresses in the production profile. Launcher file requests run in the Rust backend and need no browser CORS permission.

## Publish mods, assets & load order {#resources}

```text
server-settings.json
data/
  Skyrim.esm
  World.esp
  World.bsa
client-resources/
  Data/
    World - Textures.bsa
    Scripts/WorldClient.pex
    meshes/World/sword.nif
    textures/World/sword.dds
    SKSE/Plugins/World.ini
```

The fork automatically includes custom plugins from `loadOrder` and matching `NAME.bsa` or `NAME - *.bsa` archives from `dataDir`. Place additional client files under `client-resources/Data/` with their final directory structure. This does not automatically distribute server-side scripts from `data/scripts/` as client scripts.

All additional `.esm`, `.esp` and `.esl` plugins must appear in the actual server load order. If a plugin exists in both the data and resource directories, both copies must match. Plugins and BSA archives belong directly under `Data/`; textures, models and scripts keep their subdirectories. Restart the server after load order changes. The resource index uses a short metadata cache of about two seconds.

| `kind` | Allowed mod package content |
| --- | --- |
| `mod` | `.esm`, `.esp`, `.esl` |
| `archive` | `.bsa` |
| `script` | Compiled `.pex` under `Data/Scripts/` |
| `asset` | Supported models, textures, animations, audio, interface, language and image files |
| `config` | Passive `.ini`, `.json`, `.xml`, `.txt`, `.toml`, `.yaml`, `.yml` |

Native DLLs and JavaScript belong in the separate client package. Protected platform / authentication files, Bethesda masters and Creation Club files are not offered as mod downloads. Path traversal, symlinks / junctions, Windows device names, colons, trailing dots / spaces and destination paths differing only by letter case are rejected. The new mod API limits destination paths to 240 UTF-8 bytes.

ZIP / 7z / FOMOD packages are not unpacked or interactively installed on the player's computer. Prepare the required mod selection yourself and publish only the required files intended for redistribution. Skyrim / DLC files must come from the player's matching installation.

## Manifest v2: Contract for custom implementations {#manifest}

`GET <resourceUrl>/api/launcher/manifest` returns JSON without an operator login, with `version` as the **string `"2"`**. Numbers and checksums in the following structural example are illustrative, not an actual playable release. Your server must compute them from real files.

```json
{
  "version": "2",
  "revision": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "generatedAt": "2026-10-21T12:00:00.000Z",
  "totalSize": 12345,
  "loadOrder": ["Skyrim.esm", "World.esp"],
  "requiredLocalFiles": [
    { "filename": "Skyrim.esm", "size": 249753412, "crc32": 123456789 }
  ],
  "runtimeSource": "https://update.skymp-worlds.net/client-runtime/catalog.json",
  "resources": [
    {
      "name": "World.esp",
      "path": "Data/World.esp",
      "kind": "mod",
      "size": 12345,
      "hash": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "downloadPath": "api/launcher/files/1111111111111111111111111111111111111111111111111111111111111111"
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `loadOrder` | Non-empty ordered plugin list; do not infer names from directories |
| `requiredLocalFiles` | Local Bethesda / Creation Club requirements with filename, byte size and CRC32; no download URLs |
| `resources[].path` | Unique destination relative to the game directory, starting with `Data/` |
| `name` | Display filename; may repeat in different asset directories |
| `size` | Exact byte count as a JSON number |
| `hash` | `sha256:` followed by 64 hexadecimal characters of the actual content |
| `downloadPath` | Relative `api/launcher/files/` route with an opaque 64-character hexadecimal ID |
| `totalSize` | Total mod resource size; excludes the separate client package |
| `revision`, `generatedAt` | Release identity and creation time |
| `runtimeSource` | Optional full client catalog / manifest link |

A generator must validate approved source roots, reject links, normalize destination paths according to Windows rules, detect duplicates, and derive size / SHA-256 from the content read. CRC32 applies to local game requirements; it does not replace SHA-256 for downloads. Do not return conflicting metadata when files disappear or change during publication. An error is preferable to an incomplete successful listing.

Current limits: at most **10,000 mod files**, **8 GiB per file**, **64 GiB per mod package**; the launcher limits JSON manifests to **8 MiB**. A custom implementation must enforce matching limits and protected destination paths.

## Download endpoints & HTTP responses {#downloads}

`GET` or `HEAD <resourceUrl>/api/launcher/files/<id>` must serve the file announced in the manifest. A resource ID identifies an approved file; never interpret it as an arbitrary filesystem path. A separate file host is possible if the manifest and all relative routes remain accessible under its base.

| Response | Fork behavior / meaning |
| --- | --- |
| `200` | Complete file, correct `Content-Length`; `HEAD` has no response body |
| `206` | Supported single byte range with `Content-Range` |
| `304` | `If-None-Match` matches the `ETag` |
| `400` | Invalid resource ID |
| `404` | API disabled or ID from an older revision no longer present |
| `409` | File changed since indexing; fetch the manifest again |
| `416` | Invalid byte range |
| `503` | Incomplete, unreadable or inconsistent publication |

The fork also sends `X-Resource-Hash`, `ETag` and `Accept-Ranges: bytes`. Immutable file IDs may be cached long term; the manifest must stay current. The launcher checks downloaded data against size and SHA-256 independently of HTTP headers. It requires complete downloads; HTTP range support does not promise that this launcher version resumes interrupted downloads.

## Older servers: Legacy contract {#legacy}

Only **HTTP 404** from `/api/launcher/manifest` permits fallback to `/api/resources/manifest` and `/manifest.json`. A `503`, an invalid v2 response or a checksum mismatch is not silently bypassed using legacy mode.

The older resource contract uses `version: "1"`, flat filenames and downloads through `/api/resources/download/<name>`. It cannot fully describe subdirectories in modern asset packages. The additional game manifest has the following structure, for example; these numbers are also placeholders:

```json
{
  "versionMajor": 1,
  "mods": [
    { "filename": "Skyrim.esm", "size": 249753412, "crc32": 123456789 }
  ],
  "loadOrder": ["Skyrim.esm"]
}
```

Without a resource API, this only works when every required file is already present locally and matches the published size / CRC32. It does not repair an old blanket `.esm` restriction or a missing download for custom plugins. Use v2 for new integrations and structured mod packages.

## Publish the client, SKSE & Address Library {#runtime}

The launcher EXE contains no SkyMP / SKSE DLLs. Publish a matching client combination separately. `runtimeSource` may point to one `runtime-manifest.json` or to a `catalog.json` containing multiple approved Skyrim versions. The catalog chooses the exact matching entry from the actual file version of `SkyrimSE.exe`; it does not install another supposedly newer game version as a substitute.

Catalog example with a relative manifest address; replace the illustrative SHA-256 with the hash of the exact manifest file:

```json
{
  "version": 2,
  "packages": [
    {
      "gameVersion": "1.7.104.0",
      "manifest": "1.7.104.0/client-release/runtime-manifest.json",
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  ]
}
```

The selected client manifest uses numeric `version: 1`, `gameVersion`, `skseVersion` and `files`. Every file has `path`, `size` and a SHA-256 **without** the `sha256:` prefix. A complete versioned package requires at least these core paths; include all additional runtime, CEF and script files from the finished client as well:

```text
Data/SKSE/Plugins/SkyrimPlatform.dll
Data/SKSE/Plugins/MpClientPlugin.dll
Data/Platform/Plugins/skymp5-client.js
Data/Platform/Distribution/RuntimeDependencies/SkyrimPlatformImpl.dll
skse64_loader.exe
skse64_1_7_104.dll
Data/SKSE/Plugins/versionlib-1-7-104-0.bin
```

These seven names illustrate Skyrim `1.7.104.0` with SKSE `2.3.1`; they are not a complete file list or a general guarantee. Other game versions need their corresponding files and native support. In the checked versions, Address Library uses format 1 for the 1.5 branch, format 2 for 1.6, and format 5 for 1.7. A new Address Library does not automatically make an old incompatible plugin DLL compatible.

Generate packages using tools from the **launcher repository**, not from the server directory. The following PowerShell commands assume a finished client build, the extracted matching SKSE archive and the correct address file:

```powershell
node launcher/scripts/create-runtime-manifest.mjs `
  --source C:/Build/skymp/build/dist/client `
  --output C:/Publish/client-runtime/1.7.104.0/client-release `
  --game-version 1.7.104.0 `
  --skse-version 2.3.1 `
  --skse-source C:/Packages/skse64_2_03_01 `
  --address-library C:/Packages/AddressLibrary/SKSE/Plugins/versionlib-1-7-104-0.bin

node launcher/scripts/create-runtime-catalog.mjs `
  --root C:/Publish/client-runtime `
  --manifest 1.7.104.0/client-release/runtime-manifest.json
```

The package output directory must be new. Repeat `--manifest` for additional game versions; each version may have exactly one current catalog entry, with at most 512 entries in total. Use `--replace` to deliberately replace an existing catalog. Upload complete new package directories first, and switch the catalog last. The catalog is revalidated; matching file hashes are reused from cache.

The tool excludes personal connection settings, saved authentication and Bethesda files, and copies matching SKSE scripts and available SKSE documentation. Publish necessary licenses too. A client source explicitly chosen in the advanced launcher profile takes precedence; remove that manual choice to use automatic server offers. A local build source does not receive internet updates.

The usual destinations are relative to the game directory: `Data/Platform/Plugins` for client scripts, `Data/SKSE/Plugins` for native plugins and Address Library, and the game root for SKSE. The fork reads plugin directories from `Data/SKSE/Plugins/SkyrimPlatform.ini`; the default is `Data/Platform/Plugins;Data/Platform/PluginsDev`. Old files under `Platform/Plugins` without `Data/` are not automatically used or managed by the launcher.

If both the server manifest and selected profile omit `runtimeSource`, the launcher can only use already installed client files; no automatic client update is being offered. Changes to offered client files are detected from the manifest and file hashes during the next preparation. Only missing or different files need downloading. Private authentication state and generated connection settings are excluded from client packages.

## Online authentication & session contract {#authentication}

The central platform uses regular dashboard accounts, explicit game consent and server-bound sessions. `offlineMode` must match between the server and connection profile. Changing only the launcher to offline does not change server authentication.

| Method and route on the master | Purpose |
| --- | --- |
| `GET /api/users/login-discord?state=<64-hex>` | Take the browser to account / game login |
| `GET /api/users/login-discord/status?state=<64-hex>` | Obtain a login token and numeric identity after consent; `401` beforehand |
| `POST /api/users/me/play/<serverUid>` | Request a session for the public server ID using a login token |
| `POST /api/servers/<privateMasterKey>` | Server heartbeat with `name`, `online`, `maxPlayers`, optional `serverUid` and `serverStatus` (`online`/`offline`) |
| `GET /api/servers/<privateMasterKey>/sessions/<session>` | Validate a session on the game server; a valid response includes `user.id` and `user.name` |
| `GET /api/servers/<serverUid>/manifest.json` | Obtain the public game manifest through the master proxy |
| `GET /api/servers/<serverUid>/serverinfo` | Obtain public connection properties |

`POST /api/users/me/play/...` passes the login token in the `Authorization` header; the PHP master also accepts the `Bearer` prefix. The response contains `session`. Only the game server uses its private key for heartbeats and session validation. Treat relevant server log lines and URL logs as confidential and remove keys before requesting support.

A session applies only to its intended server and current private key. Expiry, dashboard logout and key rotation can invalidate sessions. The server must reject invalid sessions. A new master must not reassign existing numeric game identities without a planned data migration.

The historical route name `login-discord` means **no automatically configured Discord OAuth or guild checks** on this PHP master. Additional Discord role / guild rules need a suitable real provider integration. The public community invitation is not an authentication provider. A separate compatible master can be configured for direct connections; a centrally registered server uses the master settings published in its central listing.

## Validate before players join {#validation}

### Stage 1: Public HTTP interfaces

The PowerShell examples below use `curl.exe` to avoid the older PowerShell alias. On Linux, use `curl` with the same options. Replace `files.example.org` with your final public address.

```powershell
curl.exe --fail-with-body https://api.skymp-worlds.net/health
curl.exe --fail-with-body https://api.skymp-worlds.net/list.php
curl.exe --fail-with-body https://files.example.org/api/launcher/manifest
curl.exe --fail-with-body https://update.skymp-worlds.net/client-runtime/catalog.json
```

Expect JSON responses without a login page or redirect. Check the public ID, file base, authentication mode, load order and client source. The private server key must not appear in the public list. Download at least one actual resource using its published ID and compare its local checksum with `hash`:

```powershell
Get-FileHash -Algorithm SHA256 ./downloaded-file.bin
```

On Linux, use `sha256sum ./downloaded-file.bin`. Also verify that unknown IDs, changed files and invalid paths return meaningful errors and never expose arbitrary server files.

### Stage 2: Preparation without starting the game

Choose a separate suitable test game directory containing `SkyrimSE.exe`. Close Skyrim. Open the server in the launcher, then **Connection options** and **Prepare files**. This does not start the game, but it does change the prepared test installation. Check subdirectories, complete client files, load order and generated connection settings. Prepare again: valid files should come from cache. Then test **Restore original files** and switching between two test profiles.

The launcher validates hashes and versions before activation. A wrong hash, unavailable package version or interrupted download must not activate an incomplete release. The [launcher source](https://github.com/RealHartlMax/skymp-client-launcher) also contains temporary HTTP / restoration tests and a test against a separate copy of the native server.

### Stage 3: Your full gameplay test

Only now perform a real Skyrim / SKSE test with the intended version: startup, browser login and consent, session validation, UDP connection, shared world and reconnection. Check additional native plugins separately. Passing file or API checks does not replace this test. Record the actual server / client revision and mod package tested before offering it to players.

## Updates, rollback & restoration {#operations}

Publish new mod and client files as a coherent release. Keep load order, server data and client resources synchronized. For client updates, create new immutable package paths, upload all files and switch the catalog last. A catalog change does not replace a necessary server restart after plugin changes.

Launcher caches are separated by server target. Originals and the activation journal live under `<Skyrim>/.skymp-launcher/`. Plugin lists in the Skyrim profile and, where applicable, `Skyrim.ccc` are adjusted for the selected load order. Keep the journal while files are active; do not delete it as a supposed fix. Restoration may stop to protect your own changes to managed files.

Back up world data and server settings independently of the launcher before updates. The central PHP platform operator must preserve account storage and private authentication storage together with identity mappings and keys. Rolling back the client catalog changes only the offered client files; it does not automatically roll back a server / world data migration.

For a blocked or compromised server identity, rotate keys, update private settings and restart heartbeats. Support requests need only the public ID, timestamp, launcher / client / Skyrim versions and sanitized errors. Passwords, private master keys and sessions do not belong in Discord posts.

## Troubleshoot specific failures {#troubleshooting}

| Symptom | Next check |
| --- | --- |
| Heartbeat returns `404` with `Server is not registered yet` | Old registry route: update the API webroot including `api/servers/index.php` and `native-heartbeat.php` together with the dashboard; preserve private settings and data |
| Server missing from name search | Check `active` status, public address, valid private key and current heartbeat |
| New manifest route returns `404` | Check fork / router revision or `enabled`; only then is limited legacy fallback intended |
| Manifest returns `503` | Check server logs, source directories, links, duplicate destinations and an ongoing publication |
| Download returns `409` or a wrong hash | Finish publication, obtain a new manifest and reindex actual contents and sizes |
| Master proxy returns `502` | Check public file URL, DNS / TLS, connectivity and excluded private destinations; remove redirects |
| Online session invalid | Do not confuse public `serverUid` with private `masterKey`; check auth mode, key rotation, expiry and consent |
| `/account` or login route returns `404` | Check the API webroot, Apache rewrite / Authorization forwarding and master settings |
| Files ready but game cannot connect | Check UDP port, firewall / NAT, game protocol and actual server / client compatibility |
| `REL/ID.h` / Address Library error | Identify the failing plugin DLL; check Skyrim version, SKSE, expected filename and native data format together |
| Latest address file exists but error remains | An old DLL may request the wrong file or fail to parse the new format; update the DLL rather than rename the BIN file |
| Client files stay old | Check manual client source in the advanced profile, the actual `runtimeSource` and catalog entry hash |
| Restoration refuses changes | Close the game, back up external changes to managed files and preserve the journal; do not delete blindly |

For help, use the [SkyMP Worlds Discord](https://discord.gg/NSXtNNbjuR). Resolving one loading failure does not prove that every other native plugin supports the game version.

## Sources, revision & responsibility {#sources}

This handbook was checked against launcher **0.2.0**, the local server source based on commit `a037003d57890b26ed21936ac2432c987aced878`, and the published resource implementation in the linked fork. Updated **2026-10-22**. Later commits, local extensions and other forks may differ. The combination present in the prepared client catalog is not a promise of support for other game versions; each release still requires a full gameplay test.

- [Server fork and source](https://github.com/RealHartlMax/skymp)
- [Mod manifest and file routes in the fork](https://github.com/RealHartlMax/skymp/blob/main/skymp5-server/ts/launcherResources.ts)
- [Server master / heartbeat](https://github.com/RealHartlMax/skymp/blob/main/skymp5-server/ts/systems/masterClient.ts)
- [Server-side login](https://github.com/RealHartlMax/skymp/blob/main/skymp5-server/ts/systems/login.ts)
- [Launcher, downloader and publishing tools](https://github.com/RealHartlMax/skymp-client-launcher)
- [Official SKSE releases](https://skse.silverlock.org/)

This web area is static and needs no Node process or database on the host. It does not automatically deploy the main site, dashboard, master, file host or game server. Each operator remains responsible for their tested server / client combination. **No guarantee is given for integration with existing servers or arbitrary mod packages.**

### Server name, player limit and offline status (2026-10-24)

Set the server name and maximum player count only in the game server admin panel. The website displays authenticated heartbeat values read-only and no longer sends a synthetic heartbeat when saving a registration. A server appears in the public list after its first complete authenticated heartbeat.

Each heartbeat includes `name`, `maxPlayers` and the current player count in `online`. The optional `serverStatus` field is `online` or `offline`; the current fork reports offline during a graceful shutdown. After **5 minutes** without a heartbeat, a known server is also offline. The public list exposes `server_status` and `last_heartbeat`. Known offline servers remain visible, with joining disabled, and become available after their next online heartbeat. Visible launcher and web server lists refresh every 30 seconds.

Availability is independent of `offlineMode`, which controls game authentication. Save server name/limit changes and restart the game server when required.

### Restore a missing gamemode.js

`ENOENT ... gamemode.js` refers to a file missing on the VPS. Restore your own gamemode from backup, or set its existing path in **CFG editor → General → Server gamemode file**, save and restart the game server. Paths are absolute or relative to the server working directory. The r4 server archive includes a standard `gamemode.js`, suitable only for an unmodified default server; it must not replace a custom gamemode. The new watcher retains the last loaded mode during a temporary file gap and resumes loading when the file returns.

## Dashboard resources and player names {#resources-player-name}

Resources discovers ESM, ESP and ESL files directly in the configured game-server data directory and in Data within the launcher download directory. Rescan after uploading, enable the desired plugins and reorder them with the arrows. New uploads remain disabled. Skyrim.esm must be first; required masters must precede their dependent plugins. Plugins present only in the download directory must also exist in the server data directory. Both copies must match.

Save load order changes only loadOrder in the existing configuration. Restart the game server to update the active manifest. The launcher writes plugins.txt and loadorder.txt and preserves originals across cached updates and server switches. Build both backends and the dashboard frontend from the server repository for the new interface; preserve private configuration, worlds, mods and keys.

The launcher sends a player display name alongside the verified Steam ID. Approval/Whitelist and the player view show it. Display and RP character names remain separate; renaming does not change identity, approval or profile. The matching new server source is required.

Optional Discord web sign-in is configured on PHP hosting with a private client secret. Existing password users explicitly link Discord after signing in at https://manage.skymp-worlds.net/account.php . Launcher activity status only needs the public App ID and desktop Discord, without web OAuth. This does not add Discord guild or role checks.
