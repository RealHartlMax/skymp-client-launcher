# Serververbindung und automatische Dateien

Dokumentationsstand: **26.10.2026**, Launcher **0.2.0**.

Der Launcher verwendet den Ressourcen-Vertrag des Forks in `D:\GitHub\skymp`.
Serverliste, Spielserver, Dateiserver und Anmeldeserver sind getrennte Adressen.
Es gibt keine fest eingebaute Spielserver-IP. Ein Profil speichert diese Angaben
je Server; weitere Server können über die Liste oder direkt eingetragen werden.

## Server suchen und verbinden

Unter **Einstellungen** wird ausschließlich der Skyrim-Spielpfad hinterlegt und geprüft.
Die zentrale Serverliste verwendet fest `https://api.skymp-worlds.net/list.php`;
früher gespeicherte eigene Listen-Endpunkte werden entfernt. Andere Spielserver lassen
sich weiterhin aus der Liste oder über **Direktverbindung** auswählen. Der Import alter
SkyMP-Einstellungen liegt ebenfalls unter **Direktverbindung**.

1. Unter **Server entdecken** den Namen eingeben. Die Liste filtert unmittelbar;
   Groß-/Kleinschreibung, Umlaute und `ß` werden bei der Suche berücksichtigt.
2. Auf einen Treffer klicken, um Beschreibung, Spielerzahl, Tags, Zugang und
   Community-Links zu sehen. Das Öffnen der Details startet keine Verbindung.
3. **Verbinden** prüft die Installation, lädt die benötigten Dateien und startet
   anschließend Skyrim. Der Splashscreen zeigt den Fortschritt und schließt sich nach bestätigtem Start des echten Skyrim-Prozesses automatisch. Bei Startfehlern bleibt er sichtbar; die normale Detailseite enthält weiterhin Status und Diagnose.
4. Favoriten bleiben gespeichert; der Verlauf enthält erfolgreich gestartete Verbindungen.
   Beim Zurückgehen bleiben Suchtext, Filter und Listenposition erhalten.

**Verbindungsoptionen** auf der Detailseite und **Direktverbindung** in der Suche
öffnen die technischen Einstellungen. Dort bleiben manuelle Profile, Build-Import,
Vorbereitung ohne Spielstart und Wiederherstellung verfügbar. Bereits gespeicherte
Profile lassen sich auch bei einem Ausfall der Serverliste auswählen.
Öffentliche Beschreibungen, Tags und Links hinterlegt der Betreiber im Dashboard
unter **Launcher & Online-Anmeldung → Öffentliches Serverprofil**.

## Den aktuellen lokalen Fork verwenden

1. Launcher mit `cd launcher` und `npm run tauri dev` starten.
2. Den Skyrim-Special-Edition-Ordner auswählen und Skyrim schließen. Ein
   vollständiges versioniertes Clientpaket kann SKSE64 bereitstellen; bei einem
   lokalen Teilpaket muss SKSE64 bereits passend zur Spielversion installiert sein.
3. Im Entwicklungsmodus unter **Direktverbindung → Server-Build importieren** `D:\GitHub\skymp\build`
   eintragen und **Build einlesen** wählen. Bei einer lokalen Entwicklungsinstallation
   kann `VITE_LOCAL_SERVER_BUILD_DIR=D:/GitHub/skymp/build` in `launcher/.env.local`
   stehen; dann wird beim ersten Start ohne gespeicherte Profile automatisch importiert.
   Diese Importwerkzeuge sind an `import.meta.env.DEV` gebunden und gehören
   nicht zum Produktionsablauf der Release-EXE. Dort Serverliste oder Direktverbindung verwenden.
4. Der Import liest ausschließlich Verbindungsdaten aus `dist/server/server-settings.json`
   und erkennt `dist/client` als Clientpaket. Er verändert den Server nicht.
   Adminpasswörter und Bot-Tokens werden nicht an die Oberfläche zurückgegeben.
5. Server separat starten. **Dateien vorbereiten** prüft/installiert alles ohne Spielstart.
   **Vorbereiten und verbinden** führt denselben Ablauf aus und startet anschließend SKSE64.

Im geprüften Build ist der Spielport `7777/UDP`, der HTTP-Port `8080/TCP`.
Der Import verwendet **127.0.0.1** für einen Server auf demselben Rechner.
Für einen anderen Rechner zuerst dessen erreichbare IP/Domain eintragen und dann importieren.
Bei einem Reverse Proxy die externe Dateiserver-Basis-URL angeben, z.B. `https://play.example.org/`.

**Anmeldung nach Server-Policy:** Beim aktuellen Steam-Zugang läuft Steam im Hintergrund. Der Launcher holt die Policy unter `/api/launcher/auth-policy`, fordert ein Ticket für genau deren Dienstkennung an und übergibt es an `/api/launcher/auth/steam`. Der Server prüft die Identität und entscheidet über Freigabe/Whitelist. Ein zusätzliches SkyMP-Webkonto ist nur nötig, wenn die Serverantwort `accountLoginRequired` verlangt.

Ausstehende Freigaben werden im Gameserver-Dashboard unter **Whitelist / Spielerzugang** bearbeitet. Der Spieler muss noch nicht in der Liste verbundener Spielfiguren stehen. Steam-ID, Anzeigename und RP-Charakter sind getrennt; eine Namensänderung vergibt keine neue Identität.

Für eine erforderliche Legacy-Kontoanmeldung bleibt der PHP-Master mit den bestehenden Dashboard-Konten verfügbar. Die öffentliche `serverUid` gehört ins Launcher-Profil; der private Heartbeat-`masterKey` bleibt auf dem Gameserver. Ein Wechsel zu „offline“ nur im Launcher umgeht die Server-Policy nicht. Details: [Steam und Legacy](STEAM_AUTHENTICATION.md), [PHP-Hosting](PHP_HOSTING.md).

## Was vor dem Start passiert

1. `GET <Dateiserver>/api/launcher/manifest` liefert Version `"2"`, vollständige
   Zielpfade, Typ, Größe, `sha256:<hex>`, Downloadpfade, Gesamtgröße,
   `requiredLocalFiles` und `loadOrder`. Gleichnamige Dateien in verschiedenen
   Ordnern bleiben getrennt. Die Betreiberanleitung und der Vertrag stehen in
   [MODPACK_PROTOCOL.md](MODPACK_PROTOCOL.md).
2. Nur wenn diese Route mit 404 antwortet, wird der ältere Vertrag über
   `/api/resources/manifest` (Version `"1"`) und `/manifest.json` verwendet.
   Ältere Server ohne Ressourcen-API können verbunden werden, wenn ihr Legacy-Manifest
   vorhanden ist und alle benötigten Mods bereits lokal mit passenden CRC32 vorliegen.
   Ohne veröffentlichte Ladereihenfolge wird nicht geraten; ein 503 der neuen API
   führt nicht zum Rückfall auf eine unvollständige ältere Modliste.
3. Eigene Bethesda-Dateien werden lokal mit dem Manifest verglichen. Fehlende oder
   abweichende Spieldateien müssen aus der eigenen passenden Skyrim-Installation stammen.
4. Benötigte Plugins, Archive, Papyrus-Skripte, Texturen, Modelle und andere
   veröffentlichte Assets werden mit ihren Unterverzeichnissen in einen getrennten
   Servercache geladen und anhand von Größe und SHA-256 geprüft. Unterbrochene
   oder beschädigte Downloads werden nicht aktiviert. Gültige Cachedateien werden
   beim nächsten Verbinden erneut geprüft und wiederverwendet.
5. Das ausgewählte Clientpaket wird vorbereitet. Ohne manuelle Auswahl wird
   `runtimeSource` aus dem Servermanifest verwendet, sofern vorhanden.
   Erst wenn alle Prüfungen erfolgreich
   waren, werden Runtime, Serverdateien, Clientverbindung und Skyrim-Ladereihenfolge aktiviert.
6. `gameData.profileId` wird nur für Offline-Server geschrieben. Online-Server verwenden
   ihren ausgewählten Master und den Login im Spiel. Alte Offline-Daten und fremde
   Server-Schlüssel werden nicht übernommen; der Login wird pro Verbindung neu angefordert.

Der Download erfolgt im Rust-Backend, deshalb funktionieren auch HTTP-Dateiserver
unabhängig von Browser-CORS/Mixed-Content-Regeln. Weiterleitungen werden nicht verfolgt;
die endgültige Dateiserver-/Paket-URL eintragen. Die Fortschrittsanzeige zeigt die aktuelle Datei.

## Serverwechsel und Wiederherstellung

- Downloadcache: Tauri-App-Cacheverzeichnis, getrennt nach Host, Spielport und Dateiserver-URL.
- Originale und Wiederherstellungsjournal: `<Skyrim>/.skymp-launcher/`.
- Moddateien: die veröffentlichten Zielpfade unter `Data/`, einschließlich
  `Scripts/`, `textures/`, `meshes/` und weiterer Assetverzeichnisse.
- Ladereihenfolge: `%LOCALAPPDATA%/Skyrim Special Edition/plugins.txt` und `loadorder.txt`.
- Eine vorhandene `Skyrim.ccc` wird für die gewählte Serverliste angepasst, damit
  Anniversary Edition keine zusätzlichen Creation-Club-Plugins erzwingt.

Ein Serverwechsel stellt vorherige Originale wieder her und entfernt ausschließlich
vom Launcher angelegte Dateien. Ein Journal erlaubt die Wiederherstellung nach einem
Abbruch. Änderungen an verwalteten Mods ausserhalb des Launchers werden erkannt und
nicht still überschrieben. Vom Spiel geänderte Anmeldedateien sind dabei ausgenommen.
`plugins.txt`, `loadorder.txt` und `Skyrim.ccc` können vom Spiel oder einem Modmanager
neu geschrieben werden. Der Launcher sichert abweichende Inhalte vor dem nächsten
Vorbereiten, Serverwechsel oder Wiederherstellen automatisch unter
`<Skyrim>/.skymp-launcher/external-changes/` und zeigt den Sicherungspfad an.
Anschließend wird die geprüfte Serverliste eingesetzt beziehungsweise das Original
wiederhergestellt. Die ursprünglichen Sicherungen bleiben erhalten; mehrere
unterschiedliche externe Versionen werden getrennt aufbewahrt. Das funktioniert
auch mit Journalen älterer Launcher-Ausgaben. Mods, DLLs und andere verwaltete
Dateien behalten ihren bisherigen Änderungsschutz.
**Originaldateien wiederherstellen** stellt auch die ursprüngliche Einzelspieler-Liste
wieder her. `.skymp-launcher` deshalb behalten, solange ein Serverprofil aktiviert ist.

## Andere Server und Clientpakete

Nach **Verbinden** startet SKSE. Anschließend erscheint die SkyMP-Anmeldung im
Spiel; nach Anmeldung und **Spielen** baut der Client die Serververbindung auf
und lädt die Serverwelt. Im normalen Skyrim-Menü **nicht „Neu“** wählen, da das
den Einzelspielerpfad öffnet. „Skyrim gestartet“ bestätigt nur den Prozessstart.
Zur vollständigen Runtime gehören auch `Data/Platform/UI/index.html`, `build.js`
und deren Assets. Fehlende UI-Einstiegsdateien blockieren jetzt die Vorbereitung.

Ein externer `catalog.json` wählt anhand der installierten Skyrim-Version ein
freigegebenes vollständiges Client-/SKSE-/Address-Library-Paket. So können Betreiber
Updates bereitstellen, ohne den Launcher neu zu bauen. Siehe
[Versionskatalog und Veröffentlichung](RUNTIME_UPDATES.md).

Jeder Betreiber kann eine eigene Ressourcen-Basis-URL und bei Bedarf eine eigene
Clientversion angeben. **SkyMP-Clientpaket** akzeptiert einen lokalen Ordner mit `Data/`
oder die URL einer `runtime-manifest.json` beziehungsweise `catalog.json`. Leer bedeutet: das vom Server per
`runtimeSource` veröffentlichte Paket oder den installierten Client verwenden.
SKSE64 wird ebenfalls installiert, wenn das gewählte Paket dessen Loader/DLLs enthält;
die Ersteinrichtung verlangt nur `SkyrimSE.exe`. Ohne vollständiges Clientpaket
muss SKSE bereits in einer zur Skyrim-Version passenden Kombination installiert sein.

Ein verteilbares Paket aus dem aktuellen Fork mit separat gebautem Clientskript
und vollständiger Ingame-Oberfläche erzeugen (im Launcher-Repository):

```powershell
node launcher/scripts/build-client-runtime.mjs `
  --source D:/GitHub/skymp/skymp5-client `
  --output ./publish/client-code

node launcher/scripts/create-runtime-manifest.mjs `
  --source D:/GitHub/skymp/build/dist/client `
  --client-script ./publish/client-code/skymp5-client.js `
  --ui-source D:/GitHub/skymp/skymp5-front/dist `
  --output ./publish/runtime-package
```

Die Ausgabeordner müssen neu sein. Für eine vollständige, an die Skyrim-Version
gebundene Freigabe zusätzlich SKSE und Address Library nach
[RUNTIME_UPDATES.md](RUNTIME_UPDATES.md) auswählen. Den Inhalt des Paketordners auf
dem eigenen HTTP(S)-Host bereitstellen und die URL zu `runtime-manifest.json` im
Serverprofil eintragen. Das Manifest hat das Format:

```json
{
  "version": 1,
  "files": [
    { "path": "Data/Platform/Plugins/skymp5-client.js", "size": 1234, "sha256": "64-stelliger Hexwert" }
  ]
}
```

Datei-URLs ergeben sich relativ zum Manifest. Pakete enthalten keine Bethesda-Master,
Client-Verbindungseinstellungen oder gespeicherten Logins. Pfadwechsel, Windows-Gerätenamen,
alternative Datenstroeme sowie Symlinks/Junctions werden abgewiesen. Nur bewusst ausgewählte
Clientpakete duerfen native Runtime-Dateien installieren; die Mod-API erlaubt
Plugins (`esm/esp/esl`), Archive (`bsa`), kompilierte Skripte (`pex`), Assets und
passive Konfigurationen. Runtime-DLLs/JS bleiben im separaten Clientpaket.

Der aktuelle Server veröffentlicht eigene Plugins aus seiner Ladereihenfolge und
zugehörige BSA-Dateien automatisch; weitere Clientdateien liegen explizit unter
`client-resources/Data/`. Spieler laden dieses vorbereitete Paket direkt vom
Betreiber und benötigen keinen Nexus-/Vortex-Account. ZIP-/7z-/FOMOD-Pakete werden
vom Betreiber einmalig vorbereitet, nicht beim Spieler installiert. Die neue API
verwendet undurchsichtige IDs statt Dateinamen und umgeht damit die alte
`*.esm`-Sperrroute. Bestehende v1-Profile behalten ihre bisherigen Downloadpfade.

## Prüfung

```powershell
cd launcher
npm run build
npm run test:backend
cargo build --manifest-path src-tauri/Cargo.toml --release --no-default-features --example prepare-server
npm run test:fork -- --build D:/GitHub/skymp/build --workspace ../local-builds/fork-smoke-NEW --online
```

Der letzte Test startet eine getrennte Kopie des echten nativen Servers mit eigenen
Ports und einer getrennten Testanmeldung. Er prüft Heartbeat, Online-Sitzung,
Master-Manifest, Downloadroute, die fünf echten
Masterdateien, Runtime-Installation, Cache und Wiederherstellung. Alle Änderungen bleiben
im neuen Testverzeichnis; Skyrim wird nicht gestartet. Das Ergebnis steht in `report.json`.

## English / Русский

Select the game folder, start Steam, choose a server and connect. Complete server packages provide matching SKSE/client files automatically. The splash closes after confirmed process startup; that does not mean world loading is finished. Steam approval is managed under Whitelist/player access. Browser account login is only required by the server policy.

Выберите папку игры, запустите Steam и подключитесь к серверу. Полный пакет сервера автоматически предоставляет подходящие SKSE и клиентские файлы. Экран подключения закрывается после подтверждения запуска процесса; мир может ещё загружаться. Допуск Steam управляется в Whitelist/доступе игроков. Вход в веб-аккаунт требуется только по правилам сервера.
