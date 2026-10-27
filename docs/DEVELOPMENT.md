# Launcher entwickeln und bauen

Stand: **26.10.2026**, Version **0.2.1**. Dieses Dokument beschreibt den Desktop-Launcher. Native Spiel-DLLs und der Gameserver werden im separaten Server-Fork gebaut.

## Voraussetzungen und Quellumfang

Die zuletzt geprüfte Windows-Umgebung verwendet Node.js **24.19.0**, npm **11.17.0** und Rust/Cargo **1.95.0**. Benötigt werden außerdem die Windows-C++-Buildwerkzeuge und Microsoft Edge WebView2 Runtime für Tauri. Die Abhängigkeiten werden durch `launcher/package-lock.json` und `launcher/src-tauri/Cargo.lock` festgelegt.

Der Quellstand enthält jetzt die öffentlichen gemeinsamen Build-Assets sowie die für Konto-/Reporttests benötigten öffentlichen PHP-Quellen. Der Launcher verwendet:

```text
web/shared/platform.json
web/shared/design-system.css
web/shared/fonts/             # Schriftdateien und Lizenz
web/shared/flags/countries.json
```

Diese öffentlichen Dateien gehören zum getaggten Buildstand. Private Hosting-Konfigurationen und Laufzeitdaten sind keine Build-Eingaben. Weil neue Webdateien weiterhin grundsätzlich ignoriert werden, neue öffentliche Quelldateien nach Prüfung explizit aufnehmen. Leere Ersatzdateien oder Dummy-Endpunkte ersetzen keine echten Build-Assets.

Ein laufender PHP-/Node-Master ist zum Kompilieren nicht nötig. Die PHP-Tests verwenden isolierte temporäre Kopien der öffentlichen API-/Manage-/DEV-Quellen und eigene Testkonten.

## Lokal starten

Aus dem Repository-Verzeichnis:

```powershell
cd launcher
npm ci
npm run tauri -- dev
```

Der Entwicklungsserver verwendet Port `1420`. `npm run dev` allein startet die Browseroberfläche; native Tauri-Befehle für Dateizugriffe, Steam und Spielstart stehen nur in der Desktop-App zur Verfügung.

`launcher/.env.local` kann ausschließlich für lokale Entwicklung eine vorhandene Kopie des Server-Builds über `VITE_LOCAL_SERVER_BUILD_DIR` angeben. Dieser Import ist an `import.meta.env.DEV` gebunden. Release-Nutzer wählen ihre Server über die Liste oder Direktverbindung.

## Prüfen und Release bauen

```powershell
cd launcher
npm ci
npm run build
npm run test:backend
npm run tauri -- build
```

- `build`: TypeScript und Vite, Ausgabe unter `launcher/dist/`.
- `test:backend`: vorhandene Rust-Bibliothekstests ohne Desktop-Features. Spezielle Integrationsproben sind separat markiert und werden nicht automatisch als bestanden gezählt.
- `tauri -- build`: optimierter Windows-Desktopbuild mit eingebetteter Oberfläche. Der aktuelle Produktname erzeugt `launcher/src-tauri/target/release/SkyMP Launcher.exe`.

Die Tauri-Konfiguration verwendet derzeit `bundle.active: false`. Die Ausgabe ist portable; ein MSI-/Setup-Installer wird nicht erzeugt. Das komplette Cargo-Zielverzeichnis ist kein Benutzerpaket. EXE, ausgewählte öffentliche Begleitdateien und Prüfsummen werden nach [RELEASING.md](RELEASING.md) bereitgestellt.

## Weitere gezielte Prüfungen

Aus dem Repository-Verzeichnis:

```powershell
node tests/address-offsets.mjs
node tests/runtime-packaging.mjs
node tests/steam-auth-errors.mjs
```

Die Tests für PHP-Master, Reportdienst und DEV-Portal benötigen eine passende lokale PHP-Laufzeit und die vollständigen Webquellen. Die optionale Referenz unter `master-api/` verwendet Node.js 24+ und eigene Testdaten. Diese Prüfungen sind keine Voraussetzung dafür, den Windows-Launcher als alleinigen Release zu verpacken.

## Änderungen und Fehlerberichte

DE/EN/RU-Texte und passende Anleitungen gemeinsam aktualisieren. Serververbindung, Dateiaktivierung und Spielstart sind getrennte Phasen. Fehler müssen mit Komponente, Build-ID und bereinigtem Protokoll nachvollziehbar bleiben. Wiederherstellung darf keine extern geänderten Dateien verlieren.

Vor einem Commit `git diff --check` und die zur Änderung passenden Prüfungen ausführen. Standard-Entwicklungsbranch ist `main`; Release-Tags heißen beispielsweise `v0.2.0`. Gleiche Namen für Branch und Tag vermeiden, da unqualifizierte Push-Referenzen mehrdeutig werden können.

## English / Русский

Build only the launcher with `npm ci`, `npm run build`, `npm run test:backend` and `npm run tauri -- build` inside `launcher/`. The release executable is `SkyMP Launcher.exe`; it embeds the frontend. The tagged sources include public shared build inputs and the isolated PHP test sources. This is separate from running a PHP backend or building the native game runtime.

Для сборки лаунчера выполните в `launcher/`: `npm ci`, `npm run build`, `npm run test:backend`, `npm run tauri -- build`. Результат — `SkyMP Launcher.exe` со встроенным интерфейсом. Исходники тега включают публичные ресурсы web/shared и PHP для изолированных тестов. PHP-сервис и сборка нативного игрового клиента для компиляции лаунчера не требуются.
