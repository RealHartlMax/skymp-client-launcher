# Launcher-Releases / Releases / Релизы

Stand: **26.10.2026**. Diese Anleitung betrifft ausschließlich den **Windows-x64-Launcher 0.2.0**. Ein GitHub-Release wird manuell eingerichtet; der lokale Build veröffentlicht nichts.

## Deutsch

### Welche Dateien auf GitHub hochladen?

**Nur die drei Dateien aus `upload/` als Release-Assets hochladen.** Den Ordner nicht zusätzlich als ZIP verpacken.

```text
local-builds/releases/v0.2.0/
  upload/                                  # Genau dieser Inhalt ist für GitHub
    SkyMP-Launcher-v0.2.0.exe
    SkyMP-Launcher-v0.2.0-windows-x64.zip
    SHA256SUMS
  RELEASE-NOTES.md                          # Text ins Beschreibungsfeld kopieren
  GITHUB-UPLOAD.md                          # Lokale Anleitung
  portable/                                # Rohinhalt des ZIPs, bleibt lokal
  diagnostics/                             # Protokolle und Symbole, bleibt lokal
  VALIDATION.json                           # Lokaler Prüfnachweis
```

Die EXE ist eigenständig startbar. Das portable ZIP enthält dieselbe EXE, Anleitung, Buildangaben und Lizenzen. Nutzer benötigen nicht beide Downloads; das ZIP ist die Ausgabe mit Begleitdateien. `SHA256SUMS` enthält die Prüfsummen von EXE und ZIP.

### Manuelles Release anlegen

1. Auf GitHub das Repository **RealHartlMax/skymp-client-launcher → Releases → Neues Release** öffnen.
2. Den gewünschten Tag **`v0.2.0`** und den passenden Quellstand auf **`main`** auswählen. Der vorbereitete Build gehört zu Commit `e599a8145958d7850e6b8450d0f28c8ad98fb916`.
3. Titel **SkyMP Launcher v0.2.0** verwenden und den Inhalt von `RELEASE-NOTES.md` in die Beschreibung kopieren.
4. Die drei Dateien aus `upload/` anhängen und die Veröffentlichung selbst durchführen.

Vorhandene Tags prüfen: Ein bestehender Tag kann auf einen älteren Commit zeigen. Die Auswahl von `main` korrigiert einen bereits existierenden Tag nicht automatisch. Bestehende veröffentlichte Tags nicht versehentlich überschreiben; das Releaseziel bewusst festlegen. Diese Dokumentation erstellt oder verschiebt keinen Tag.

### Einen neuen Build vorbereiten

Den vollständigen Quellstand und die gemeinsam genutzten Build-Assets nach [DEVELOPMENT.md](DEVELOPMENT.md) bereitstellen. Anschließend im Ordner `launcher/`:

```powershell
npm ci
npm run build
npm run test:backend
npm run tauri -- build
```

Die Produkt-EXE liegt danach unter `launcher/src-tauri/target/release/SkyMP Launcher.exe`. Für die Veröffentlichung bekommt ihre Kopie den oben angegebenen Assetnamen. Nur die ausgewählten Benutzerdateien als portables ZIP verpacken; niemals das gesamte `target/release/` mit Build-Caches, Abhängigkeiten und PDBs veröffentlichen.

Dateiversion, Architektur, Quellcommit und SHA-256 dokumentieren. Die zugehörige PDB intern zusammen mit der EXE-Prüfsumme archivieren, damit spätere Crashberichte dem richtigen Build zugeordnet werden können. Nach dem Verpacken den ZIP-Inhalt gegen den Rohordner prüfen.

Einzelne heruntergeladene Dateien prüfen:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\SkyMP-Launcher-v0.2.0.exe
Get-FileHash -Algorithm SHA256 -LiteralPath .\SkyMP-Launcher-v0.2.0-windows-x64.zip
```

Die Werte müssen mit `SHA256SUMS` übereinstimmen.

### Weitere Veröffentlichungen

Ein GitHub-Launcher-Release ändert weder Server noch Client-Runtime oder Webseiten. Für den eigenen Download-Webspace müssen EXE und Prüfsummen zu den Angaben in `version.json` bzw. dem gewählten Kanalmanifest passen. Das Veröffentlichen eines GitHub-Tags allein aktualisiert diese Dateien nicht. Einen nicht vorhandenen Release-Kanal nicht als verfügbar markieren.

Die native Client-Runtime folgt [RUNTIME_UPDATES.md](RUNTIME_UPDATES.md), Webpakete folgen [PHP_HOSTING.md](PHP_HOSTING.md). Reine Markdown-Änderungen erfordern keinen neuen Launcher-Build und verändern bereits vorbereitete Release-Assets nicht.

## English

Upload **only these three files from `upload/`** as GitHub release assets:

- `SkyMP-Launcher-v0.2.0.exe`
- `SkyMP-Launcher-v0.2.0-windows-x64.zip`
- `SHA256SUMS`

Paste `RELEASE-NOTES.md` into the release description. `portable/`, `diagnostics/`, scripts and local validation reports remain local. The prepared binary belongs to commit `e599a8145958d7850e6b8450d0f28c8ad98fb916` on `main`. Set up tag `v0.2.0` and the GitHub release yourself, checking an existing tag's target first.

The EXE is portable and embeds its frontend; the ZIP adds instructions, build information and licenses. It is not an installer and contains no game, server or native client runtime. A GitHub release does not update the website's download manifests automatically. Build instructions and the currently required shared source assets are in [DEVELOPMENT.md](DEVELOPMENT.md).

## Русский

В GitHub Release загрузите **только три файла из `upload/`**:

- `SkyMP-Launcher-v0.2.0.exe`
- `SkyMP-Launcher-v0.2.0-windows-x64.zip`
- `SHA256SUMS`

Текст из `RELEASE-NOTES.md` вставьте в описание релиза. Папки `portable/`, `diagnostics/`, скрипты и локальные отчёты загружать не нужно. Подготовленная сборка относится к коммиту `e599a8145958d7850e6b8450d0f28c8ad98fb916` в `main`. Тег `v0.2.0` и релиз создаются вручную; сначала проверьте, на какой коммит указывает существующий тег.

EXE содержит встроенный интерфейс, а ZIP дополнительно включает инструкции, сведения о сборке и лицензии. Это portable-лаунчер, без игры, сервера и нативной среды клиента. Публикация тега GitHub не меняет манифесты обновлений на сайте. Сборка и необходимые общие исходные ресурсы описаны в [DEVELOPMENT.md](DEVELOPMENT.md).
