# Launcher-Releases / Releases / Релизы

Stand: **27.10.2026**, **Windows x64 / v0.2.1**. Launcher, PHP-Webpakete und native Spiel-Runtime sind getrennte Veröffentlichungen.

## Deutsch

### Full und Update

Die finalen Benutzerdateien liegen unter `local-builds/releases/v0.2.1/upload/`:

- `SkyMP-Launcher-v0.2.1.exe`
- `SkyMP-Launcher-v0.2.1-Full-windows-x64.zip`
- `SkyMP-Launcher-v0.2.1-Update-windows-x64.zip`
- `SHA256SUMS`

**Full** ist das vollständige portable Launcher-Paket mit Startanleitung, Buildangaben, Lizenzen und Release-Texten. **Update** enthält die identische EXE mit Update-Anleitung und Lizenzen. Die Oberfläche ist in der EXE eingebettet. Beim Update den Launcher schließen und die bestehende EXE ersetzen; gegebenenfalls den bisherigen Dateinamen beibehalten oder die Verknüpfung anpassen. Einstellungen, Profile und Berichte liegen im Windows-Benutzerprofil und bleiben erhalten.

Nur diese vier Dateien als GitHub-Assets verwenden. `portable/`, `update/` und `diagnostics/` bleiben lokal. Weder Cargo-Ausgaben noch PDBs, Testhelfer oder Build-Caches vollständig hochladen. Der aktuelle Build ist **unsigniert**. Defender-Dateiscan, Signatur, SmartScreen, echter Download/Start auf anderen Rechnern und Herstellerentscheidung sind getrennte Nachweise; siehe [ANTIVIRUS.md](ANTIVIRUS.md).

### Bauen und verpacken

Im Ordner `launcher/`:

```powershell
npm ci
npm run test:backend
npm run tauri -- build
```

Die Produkt-EXE liegt danach unter `launcher/src-tauri/target/release/SkyMP Launcher.exe`. Der Tauri-Build führt den Frontendbuild aus. Die öffentlichen Build-Eingaben sind im Quellstand enthalten; PHP-/Serverbetrieb ist zum Kompilieren nicht erforderlich.

Aus dem Repository-Verzeichnis erzeugt der Paketierer Full, Update, EXE und Prüfsummen aus einer sauberen, committeten Arbeitskopie:

```powershell
./scripts/package-launcher-release.ps1 -OutputDirectory 'local-builds/releases/v0.2.1'
```

Standardmäßig verlangt er eine gültige zeitgestempelte Codesignatur und verweigert vorhandene Ausgabeordner. Ein ausdrücklich gewähltes `-AllowUnsigned` erstellt einen entsprechend gekennzeichneten unsignierten lokalen Build. `-AllowDirty` ist ausschließlich für gekennzeichnete Paketierungstests vorgesehen. `BUILD-INFO.json` nennt den Quellcommit und EXE-Hash; `PACKAGE-VALIDATION.json` prüft jeden ZIP-Eintrag und die identische EXE in beiden Paketen. Weitere Ergebnisse stehen in `VALIDATION.json`. Passende EXE/PDB über GUID und Age intern archivieren.

### Codesignierung

Einen öffentlich vertrauenswürdigen Codesignaturanbieter einrichten. Für ein bereits im Windows-Zertifikatspeicher verfügbares Zertifikat bzw. eingebundenes Hardwaretoken:

```powershell
./scripts/sign-windows-release.ps1 `
  -FilePath 'launcher/src-tauri/target/release/SkyMP Launcher.exe' `
  -CertificateThumbprint '<40 hex characters>' `
  -TimestampUrl 'https://timestamp.example.org'
./scripts/inspect-windows-release.ps1 -FilePath 'launcher/src-tauri/target/release/SkyMP Launcher.exe' -RequireSignature
```

Der Helfer verwendet SHA-256 und einen RFC-3161-Zeitstempel. Cloudanbieter verwenden ihren dokumentierten Signieraufruf vor derselben Signaturprüfung. **Nach jeder Signierung** alle Pakete, Build-/Prüfmetadaten und Prüfsummen neu erzeugen und die fertigen Bytes erneut prüfen. Der automatische Release-Workflow stoppt weiterhin ohne gültige Signatur; es ist noch kein Anbieter konfiguriert.

### Tag, Release-Texte und Versionskatalog

Der Quellstand wird mit `v0.2.1` bezeichnet. Den zugehörigen Commit aus Tag bzw. `BUILD-INFO.json` verwenden und keinen vorhandenen veröffentlichten Tag verschieben. Die drei Texte liegen im Paket als `RELEASE-NOTES.de.md`, `RELEASE-NOTES.en.md` und `RELEASE-NOTES.ru.md`; Quellen sind [DE](releases/v0.2.1.de.md), [EN](releases/v0.2.1.en.md), [RU](releases/v0.2.1.ru.md). Ein Commit/Tag/Push allein ist noch keine erfolgreiche GitHub-Release-Veröffentlichung oder ein Webdeployment.

**Erst nach dem offiziellen GitHub-Release** dessen Katalogdaten lokal abgleichen:

```powershell
node scripts/sync-launcher-release.mjs v0.2.1
```

Das Skript akzeptiert ausschließlich ein bereits veröffentlichtes stabiles Release mit EXE und GitHub-SHA-256. Es aktualisiert lokal `web/update.skymp-worlds.net/version.json` für ältere Launcher und `channels/release.json`. Danach die Update-Webdateien auf den Host übertragen. Solange v0.2.1 noch nicht offiziell veröffentlicht ist, bleibt der Katalog auf dem tatsächlich veröffentlichten v0.2.0-Stand. Der neue Launcher prüft zusätzlich offizielle GitHub-Releases.

### Webkonto und Hosting

Die neue Kontoverbindung benötigt die passenden **API- und Manage-Webpakete**. Diese separaten ZIPs werden mit `scripts/package-web.ps1` erstellt. Vorhandene Hosting-Konfigurationen und Daten erhalten. Das Update-Webpaket transportiert den Versionskatalog; ein GitHub-Tag aktualisiert das Hosting nicht. Der Launcher stellt Steam-/Spielanmeldungen durch das Webkonto nicht automatisch um. Details: [Einstellungen](LAUNCHER_SETTINGS.md), [PHP-Hosting](PHP_HOSTING.md).

## English

Upload exactly four assets from `upload/`: EXE, Full ZIP, Update ZIP and `SHA256SUMS`. Full contains the complete portable launcher and release texts; Update contains the identical EXE with update instructions/licenses. Close the launcher, replace its EXE and retain user-profile settings. Symbols and diagnostics remain local. The build is unsigned until a trusted signing provider is configured; the automated release gate rejects unsigned output.

Build with `npm ci`, `npm run test:backend`, `npm run tauri -- build` inside `launcher/`. From the repository root, `scripts/package-launcher-release.ps1 -OutputDirectory ...` requires a clean committed source tree and a valid signature. `-AllowUnsigned` explicitly labels a local unsigned build. Package metadata records the source commit and hashes; Full/Update entries are verified.

Use tag `v0.2.1`, the matching commit, and the three `RELEASE-NOTES.de/en/ru.md` texts. Publishing the tag is distinct from publishing a GitHub release. After the official stable release exists, run `node scripts/sync-launcher-release.mjs v0.2.1` and deploy the resulting update catalogs. Older executables need an actual launcher update to gain the new notice UI. Account linking also requires the separate API/Manage web packages; game runtime/server packages are independent.

## Русский

В `upload/` находятся ровно четыре файла: EXE, Full ZIP, Update ZIP и `SHA256SUMS`. Full — полный портативный пакет с текстами релиза; Update содержит ту же EXE с инструкцией обновления и лицензиями. Закройте лаунчер и замените EXE; настройки профиля Windows сохраняются. Символы и диагностика остаются локальными. Сборка не подписана, пока не настроен доверенный провайдер; автоматическая публикация блокирует неподписанные файлы.

Сборка в `launcher/`: `npm ci`, `npm run test:backend`, `npm run tauri -- build`. Из корня репозитория `scripts/package-launcher-release.ps1 -OutputDirectory ...` требует чистые закоммиченные исходники и действительную подпись. `-AllowUnsigned` явно помечает локальную неподписанную сборку. Метаданные содержат коммит и хеши; файлы обоих ZIP проверяются.

Используйте тег `v0.2.1`, соответствующий коммит и три текста `RELEASE-NOTES.de/en/ru.md`. Тег не равнозначен опубликованному GitHub Release. После официального стабильного релиза выполните `node scripts/sync-launcher-release.mjs v0.2.1` и загрузите каталоги на хостинг. Старым EXE нужно обновление, чтобы получить новый интерфейс уведомлений. Для входа также нужны отдельные пакеты сайтов API/Manage; игровой runtime и сервер поставляются независимо.
