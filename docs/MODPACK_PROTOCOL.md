# Modpakete vor dem Spielstart installieren

Dokumentationsstand: **26.10.2026**, Launcher **0.2.0**.

Der eigenständige Launcher in `skymp-client-launcher` bereitet die benötigten
Dateien vor, bevor er SKSE startet. Die Dateien kommen vom Dateiserver des
Spielserverbetreibers. Spieler benötigen dafür keinen Nexus-/Vortex-Account.
Eine passende eigene Skyrim-Installation bleibt erforderlich.

## Ablauf für Spieler

1. Server im Launcher auswählen und **Verbinden** drücken.
2. Der Launcher liest das Modmanifest und die festgelegte Ladereihenfolge.
3. Eigene Skyrim-/DLC-Dateien werden lokal geprüft und nicht heruntergeladen.
4. Fehlende oder geänderte Moddateien werden heruntergeladen und anhand von
   Dateigröße und SHA-256 geprüft. Bereits vorhandene Cachedateien werden erneut
   geprüft und wiederverwendet.
5. Das vom Server veröffentlichte Clientpaket wird ebenfalls vorbereitet, wenn
   `runtimeSource` gesetzt ist. Eine manuelle Paketwahl im Launcher hat Vorrang.
6. Erst nach erfolgreicher Vorbereitung werden Dateien und Ladereihenfolge
   aktiviert und SKSE gestartet. Bei Fehlern wird das Spiel nicht gestartet.

Die Fortschrittsanzeige zeigt den aktuellen Download und seine Größe. Unterbrochene
Downloads werden nicht aktiviert; beim erneuten Versuch bleiben bereits gültige
Cachedateien nutzbar. Ein Serverwechsel sichert Originale und ersetzt die zuvor
vom Launcher verwalteten Dateien. **Originaldateien wiederherstellen** stellt
auch die vorherige Einzelspieler-Ladereihenfolge wieder her.

## Moddateien auf dem Server bereitstellen

Im aktuellen Gameserver-Adminpanel unter **Ressourcen** die hochgeladenen `.esm`, `.esp` und `.esl` neu einlesen, gewünschte Plugins aktivieren und mit den Pfeilen ordnen. Neue Uploads bleiben zunächst deaktiviert. **Ladereihenfolge speichern** aktualisiert `loadOrder` in der vorhandenen Konfiguration; anschließend den Spielserver neu starten. Die technischen Beispiele unten erklären den Vertrag, ersetzen aber nicht die vorhandenen Welten oder Einstellungen.

`Skyrim.esm` bleibt zuerst; benötigte Master müssen vor abhängigen Plugins stehen. Der Launcher schreibt die freigegebene Reihenfolge auch bei Cache-Nutzung und Serverwechsel in `plugins.txt` und `loadorder.txt`. Manuelle JSON-Bearbeitung ist für den normalen Ressourcenablauf nicht nötig.

Beispiel im entpackten Serververzeichnis:

```text
server-settings.json
data/
  Skyrim.esm                    # eigene Server-Spieldaten, kein Download
  Update.esm
  ...
  Community.esp                 # auch in loadOrder eintragen
  Community.bsa                 # optionales Clientarchiv
client-resources/
  Data/
    Community - Textures.bsa
    Scripts/ClientScript.pex
    meshes/Community/Schwert.nif
    textures/Community/sword.dds
    SKSE/Plugins/Community.ini
```

Eigene Plugins aus `loadOrder` werden automatisch aus `data/` angeboten, ebenso
zugehörige Archive `NAME.bsa` und `NAME - *.bsa`, sofern vorhanden. Die fünf
Bethesda-Masterdateien und Creation-Club-Dateien werden dabei nicht verteilt.

Weitere **für den Spieler benötigte** Dateien legt der Betreiber unter
`client-resources/Data/` mit ihrer fertigen Skyrim-Verzeichnisstruktur ab.
Serverseitige Papyrus-Skripte unter `data/scripts/` werden dadurch nicht
automatisch beim Spieler installiert. Benötigt der Client selbst ein Skript,
gehört es zusätzlich unter `client-resources/Data/Scripts/`.

Das Paket besteht aus bereits ausgewählten/installierten Moddateien. ZIP-/7z-
Archive und FOMOD-Installationsdialoge werden nicht beim Spieler ausgeführt;
der Betreiber bereitet deren gewünschte Optionen einmalig vor. Dabei nur die
für dieses Serverpaket vorgesehenen Moddateien veröffentlichen.

Ein zusätzlich unter `client-resources/Data/` abgelegtes Plugin muss mit der
Serverdatei übereinstimmen. Plugins müssen in `loadOrder` stehen. Nach einer
Änderung der Pluginliste den Server neu starten, damit nativer Server und
Spielmanifest dieselbe Ladereihenfolge verwenden. Assetänderungen werden vom
Dateidienst ohne Neustart erkannt; ein kurzer Metadatencache gilt zwei Sekunden.
Eine laufende Veröffentlichung kann beim Downloader zu einem Abbruch führen;
nach abgeschlossenem Kopieren erneut verbinden.

Optionale Einstellung in der bestehenden `server-settings.json`:

```json
{
  "launcherResources": {
    "enabled": true,
    "directory": "./client-resources"
  }
}
```

Ohne diese Einstellung gelten `enabled: true` und `./client-resources`.
Admin-Konten, Weltdaten und Serverkonfiguration gehören nicht in dieses Verzeichnis.
Symlinks, Windows-Pfadkonflikte und geschützte Clientpfade werden abgewiesen.

## Client-/DLL-Paket vom gleichen HTTP-Server anbieten

Für automatische, zur Skyrim-Version passende Updates kann `runtimeSource` auch
auf eine `catalog.json` zeigen. Paketierung, Versionsprüfung und Veröffentlichung
beschreibt [RUNTIME_UPDATES.md](RUNTIME_UPDATES.md).

SKSE-/SkyMP-DLLs und JavaScript-Runtime-Dateien gehören in das bereits
unterstützte separate Clientpaket. Der Launcher prüft auch dort Dateigröße und
SHA-256 und übernimmt das Paket vor dem Spielstart. Ein Betreiber kann die
Version damit zentral festlegen, ohne dass Spieler ein Modmanager-Konto brauchen.

Ein passendes fertiges Clientverzeichnis mit dem vorhandenen Launcher-Werkzeug
veröffentlichen, zum Beispiel in einem neuen `ui/client-runtime/`-Ordner:

```sh
node launcher/scripts/create-runtime-manifest.mjs \
  --source /PFAD/ZUM/FERTIGEN/CLIENT \
  --output /PFAD/ZUM/SERVER/ui/client-runtime
```

Der Befehl gehört zum **Launcher-Repository**; Quell- und Zielpfade entsprechend
anpassen. Der Zielordner muss neu sein. Der Server stellt Dateien unter `ui/`
bereits über seinen HTTP-Port bereit. Danach beispielsweise konfigurieren:

```json
{
  "launcherResources": {
    "directory": "./client-resources",
    "runtimeSource": "http://87.106.58.116:8080/client-runtime/runtime-manifest.json"
  }
}
```

`runtimeSource` muss eine vollständige HTTP(S)-URL ohne Zugangsdaten,
Query-Parameter oder Fragment sein. Dieselbe URL lässt sich weiterhin über die
Serverliste oder die Verbindungsoptionen vorgeben. Eine explizite manuelle
Auswahl hat Vorrang. Die Ersteinrichtung benötigt nur das Spielverzeichnis mit
`SkyrimSE.exe`. Ein versioniertes Paket kann SKSE und die passende Address Library
mitliefern; der Launcher prüft dann die tatsächlichen EXE-/DLL-Versionen, das
Adressdatenformat und alle Prüfsummen vor der Aktivierung. Ein älteres Paket ohne
Versionsangaben erfordert weiterhin eine vom Betreiber passend vorbereitete
Installation. Ein Client muss zusätzlich für die angebotene Skyrim-Version
kompiliert und geprüft sein; die Dateiprüfung ersetzt keinen Spieltest.

## Schnittstelle für den Launcher

### GET `/api/launcher/manifest`

Öffentlich, ohne Admin-Anmeldung. Beispiel (Prüfsummen hier gekürzt):

```json
{
  "version": "2",
  "revision": "<SHA256 des Manifestinhalts>",
  "generatedAt": "2026-10-21T12:00:00.000Z",
  "totalSize": 12345,
  "loadOrder": ["Skyrim.esm", "Community.esp"],
  "requiredLocalFiles": [
    { "filename": "Skyrim.esm", "size": 249753412, "crc32": 123456 }
  ],
  "resources": [
    {
      "name": "sword.dds",
      "path": "Data/textures/Community/sword.dds",
      "kind": "asset",
      "size": 12345,
      "hash": "sha256:<64 hex characters>",
      "downloadPath": "api/launcher/files/<64-character resource ID>"
    }
  ]
}
```

`path` ist der Zielpfad relativ zum Skyrim-Spielverzeichnis und beginnt mit
`Data/`. `name` dient der Anzeige; gleichnamige Dateien in unterschiedlichen
Ordnern bleiben getrennt. `downloadPath` ist relativ zur ausgewählten
Dateiserver-Basis-URL und funktioniert auch hinter einem Proxy-Unterpfad.
`totalSize` enthält die Summe der Moddateien; das optionale separate Clientpaket
hat sein eigenes Manifest. `requiredLocalFiles` enthält ausschließlich lokale
Spieldateien und ihre Größen/CRC32 aus dem vom Server erzeugten Spielmanifest.

Dateitypen: `mod` (`.esm/.esp/.esl`), `archive` (`.bsa`), `script` (`.pex`),
`asset` (Modelle, Texturen, Audio, Animationen, Interface, Übersetzungen),
`config` (`.ini/.json/.xml/.txt/.toml/.yaml/.yml`). Runtime-DLLs und JS bleiben
im separaten Clientpaket; geschützte Plattform-/Anmeldedateien sind keine Moddateien.

### GET oder HEAD `/api/launcher/files/:id`

Liefert die exakte Datei mit `Content-Length`, `X-Resource-Hash`, `ETag` und
`Accept-Ranges: bytes`. Einzelne Byte-Ranges werden mit HTTP 206 unterstützt.
Die ID enthält keine Serverpfade und hängt von Zielpfad und Inhalt ab.

| Status | Bedeutung |
| --- | --- |
| 400 | Ungültige Ressourcen-ID |
| 404 | API deaktiviert oder Ressourcenrevision nicht mehr vorhanden |
| 409 | Datei seit der Manifestabfrage geändert; Manifest neu abrufen |
| 416 | Ungültiger Byte-Bereich |
| 503 | Veröffentlichung unvollständig, nicht lesbar oder widersprüchlich |

Ein 503 der neuen API führt nicht zum Rückfall auf ein unvollständiges Legacy-
Paket. Nur ein 404 der neuen Manifestroute erlaubt den alten Vertrag über
`/api/resources/manifest` und `/manifest.json`. Bestehende Serverprofile bleiben
kompatibel. Grenzen: 10.000 Dateien, 8 GiB pro Datei und 64 GiB pro Modpaket.

## Validierung

Die Tests verwenden temporäre Spielverzeichnisse und starten Skyrim nicht.
Sie prüfen die echte Node/Koa-Schnittstelle auf Windows und Linux sowie den
Rust-Downloader gegen diese API: vollständige Installation, Cachetreffer,
beschädigte Cachedateien, Updates, fehlerhafte Pakete und Wiederherstellung.
Ein echter Skyrim-/CEF-Test und die zuvor offene Client-Runtime-Kompatibilität
bleiben separate Prüfungen.

## English / Русский

In the game-server Resources panel, rescan uploaded plugins, enable them, arrange their load order, save and restart the game server. The launcher validates the manifest, applies that order and preserves original load-order files. Native DLLs/SKSE remain in the separate runtime package.

В ресурсах игрового сервера повторно просканируйте загруженные плагины, включите их, задайте порядок, сохраните и перезапустите сервер. Лаунчер проверяет манифест и применяет порядок, сохраняя исходные списки. Нативные DLL и SKSE поставляются отдельным пакетом runtime.
