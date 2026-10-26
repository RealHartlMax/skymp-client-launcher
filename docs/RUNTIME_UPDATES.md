# Client, SKSE und Address Library unabhängig vom Launcher aktualisieren

Die Launcher-EXE enthält keine SKSE-/SkyMP-DLLs. Sie startet den SKSE-Loader aus
dem ausgewählten Spieleordner, nachdem Client- und Serverdateien vorbereitet wurden.
Ein installiertes Skyrim genügt für die Ersteinrichtung. Ein vollständiges externes
Clientpaket kann SKSE, dessen Papyrus-Skripte und die Address Library bereitstellen.

## Versionskatalog statt festem lokalen Buildpfad

Im Serverprofil und in `launcherResources.runtimeSource` wird eine stabile URL
zu `catalog.json` eingetragen, beispielsweise:

```json
{
  "launcherResources": {
    "runtimeSource": "https://dein-dateihost/client-runtime/catalog.json"
  }
}
```

Der Launcher liest die echte Dateiversion aus `SkyrimSE.exe`, ohne sie auszuführen,
und wählt genau den dazu passenden Katalogeintrag. Ein neueres Paket für eine andere
Skyrim-Version wird nicht als Ersatz verwendet. Gibt es keine passende Freigabe,
bleiben die aktiven Spieldateien erhalten und das Spiel wird nicht gestartet.

Der Katalog wird vor jeder Vorbereitung erneut abgefragt. HTTP-Anfragen verlangen
eine Cache-Neuvalidierung. Der Katalog enthält den SHA-256 des ausgewählten Manifests;
dieses wiederum enthält Größe und SHA-256 jeder Datei. Bereits passende Dateien
werden aus dem lokalen Cache verwendet. Neue Prüfsummen führen zu neuen Downloads.
Die bisherige Sicherung und Wiederherstellung wird weiterverwendet.

Eine bewusst eingetragene manuelle Clientquelle hat weiter Vorrang. Für automatische
Serverupdates muss das Feld **SkyMP-Clientpaket** im erweiterten Launcher-Profil leer
bleiben. Ein lokaler `build/dist/client`-Pfad aktualisiert sich nicht über das Internet.

## Ein vollständiges Paket erzeugen

Die folgenden Befehle werden im Launcher-Repository ausgeführt. Voraussetzung sind
ein für die Zielversion gebauter SkyMP-Client, ein entpacktes passendes SKSE-Archiv
und die passende Address-Library-Datei. Für jede freigegebene Skyrim-Version wird
ein eigenes unveränderliches Verzeichnis angelegt:

```powershell
node launcher/scripts/build-client-runtime.mjs `
  --source D:/GitHub/skymp/skymp5-client `
  --output ./publish/client-code

node launcher/scripts/create-runtime-manifest.mjs `
  --source D:/GitHub/skymp/build/dist/client `
  --output ./publish/client-runtime/1.7.104.0/client-2026-10-21 `
  --game-version 1.7.104.0 `
  --skse-version 2.3.1 `
  --skse-source C:/Pakete/skse64_2_03_01 `
  --client-script ./publish/client-code/skymp5-client.js `
  --ui-source D:/GitHub/skymp/skymp5-front/dist `
  --address-library C:/Pakete/AddressLibrary/SKSE/Plugins/versionlib-1-7-104-0.bin

node launcher/scripts/create-runtime-catalog.mjs `
  --root ./publish/client-runtime `
  --manifest 1.7.104.0/client-2026-10-21/runtime-manifest.json
```

Für mehrere Skyrim-Versionen `--manifest` pro freigegebenem Paket wiederholen.
Ein Katalog darf pro Skyrim-Version genau einen aktuellen Eintrag enthalten.
Beim gezielten Aktualisieren eines bestehenden Katalogs wird `--replace` ergänzt.
Bestehende Paketverzeichnisse werden nicht überschrieben.

### Optionale Offset-Referenz für Skyrim 1.7

Bei einer Textliste wie `offsets-1-7-104-0.txt` kann dem Paketbefehl zusätzlich
`--offsets-file C:/Pakete/AddressLibrary/offsets-1-7-104-0.txt` übergeben werden.
Das Werkzeug vergleicht alle IDs und Adressen mit der binären Address Library
im Format 5. Version, Modul, Dateilänge und vollständige Abdeckung müssen passen;
bei einer Abweichung wird kein Paketverzeichnis angelegt. Die Prüfung erscheint
mit Anzahl und SHA-256 der beiden Eingaben in der JSON-Ausgabe des Befehls.

Die Liste lässt sich auch ohne Paketbau prüfen:

```powershell
node launcher/scripts/verify-address-offsets.mjs `
  --address-library C:/Pakete/AddressLibrary/SKSE/Plugins/versionlib-1-7-104-0.bin `
  --offsets-file C:/Pakete/AddressLibrary/offsets-1-7-104-0.txt `
  --game-version 1.7.104.0 `
  --report ./offset-verification.json
```

Die Liste verwendet Adressen zur bevorzugten Skyrim-Imagebasis `0x140000000`.
Sie wird als lokale Prüfgrundlage verwendet; das Spiel lädt weiterhin die
versionsgebundene `.bin`. Die Prüfung verändert weder Eingabedateien noch DLLs.
Offsets von C++-Objektmitgliedern, etwa den Farbdaten des Spielercharakters,
sind darin nicht beschrieben und müssen im nativen Client korrigiert werden.
Eine erfolgreiche Adressprüfung ersetzt keinen Spieltest.

Das Paketwerkzeug übernimmt die passenden SKSE-Loader-/Runtime-Dateien und die
Skripte aus dem angegebenen SKSE-Archiv. Andere SKSE-Runtime-DLLs und unpassende
Adressdatenbanken werden aus einem versionsgebundenen Paket ausgelassen.
Bethesda-Masterdateien, Kontodaten und persönliche Verbindungseinstellungen
werden nicht veröffentlicht.

Die Ingame-Oberfläche wird aus `--ui-source` einschließlich ihrer statischen
Assets nach `Data/Platform/UI` übernommen. Ohne `index.html` und `build.js`
verweigern Paketwerkzeug und Launcher den Start. Der getrennte Client-Build
korrigiert den absoluten CEF-Dateipfad und wartet bei der Welt-Synchronisation,
bis Spieler und Welt/Zelle verfügbar sind. Er liest den Quell-Fork, ohne ihn
oder den Servercode zu verändern. Unbekannte Quellversionen müssen vor einer
Kompatibilitätskorrektur geprüft werden.

Vor der Aktivierung prüft der Launcher zusätzlich die deklarierte Skyrim-Version,
die eingebetteten Versionen beider SKSE-Binärdateien und das Adressdatenbankformat.
Alte Clientmanifeste ohne Versionsangaben bleiben für vorhandene Server nutzbar;
für sie kann keine automatische Kompatibilitätszusage abgeleitet werden.

## Eine neue Ausgabe veröffentlichen

1. SkyMP-Client, SKSE und Address Library als zusammenpassende Kombination bauen,
   bereitstellen und prüfen. Ein neues Skyrim-Update kann auch Änderungen an den
   nativen SkyMP-DLLs erfordern; eine neue Adressdatei allein ersetzt diese nicht.
2. Ein neues Paketverzeichnis erzeugen und vollständig auf den Dateihost hochladen.
3. Den Katalog auf dieses Paket umstellen und **zuletzt** die neue `catalog.json`
   hochladen. Frühere Pakete zunächst für laufende Downloads verfügbar lassen.
4. Spieler erhalten bei der nächsten Vorbereitung die neue kompatible Freigabe.
   Für reine Paketupdates ist kein neuer Launcher-Build nötig.

Bei einem bestätigten Fehler im nativen Client umfasst der lokale Abschluss
auch den passenden DLL-Build, die private Sicherung der zugehörigen PDB und ein
neu geprüftes Runtime-Paket samt eigenem UPDATE-ZIP. Ein reiner Quellpatch wird
nur auf ausdrücklichen Wunsch als Endstand bereitgestellt. Commit, Push und
Upload erfolgen weiterhin nur mit gesondertem Auftrag.

Für `SkyrimPlatformImpl.dll` lautet der CMake-Target im Fork `skyrim_platform`.
Bei knappem RAM lassen sich die Build-Prozesse so begrenzen:

```powershell
$env:VCPKG_MAX_CONCURRENCY = '2'
$env:CMAKE_BUILD_PARALLEL_LEVEL = '1'
$env:_CL_ = '/MP1'
cmake --build D:/GitHub/skymp/build --config Release --target skyrim_platform --parallel 1 -- /p:CL_MPCount=1
```

Das ist ein Client-Target; für eine reine native Clientkorrektur ist kein
Gameserver- oder Launcher-EXE-Neubuild erforderlich. Die neue DLL wird über das
externe Runtime-Paket ausgeliefert. Build- und Paketprüfungen ersetzen nicht den
anschließenden Test der betroffenen Spielsituation.

Das Paketwerkzeug legt für Textdateien zusätzlich byteidentische Kopien unter
`payloads/<SHA-256>.bin` an. Das optionale Manifestfeld `downloadPath` verweist auf
diese Kopie; `path` bleibt der Zielpfad im Spiel. Der aktuelle Launcher verwendet
die binäre Downloadkopie sowohl bei HTTP(S)-Paketen als auch bei lokalen Paketen.
Das schützt auch Textdateien mit gemischten Zeilenumbrüchen vor FTP-Textübertragungen.
Bestehende Manifeste ohne `downloadPath` bleiben unterstützt. Die zusätzlichen
`payloads/`-Dateien deshalb vollständig mit hochladen.

Das gesamte Paket im **Binärmodus** hochladen, auch `.txt`, `.js` und JSON-Dateien.
Ein FTP-Textmodus kann CRLF-Zeilenumbrüche in LF umwandeln und damit Größen und
Prüfsummen verändern. Der Launcher kann bei kleinen Textdateien des heruntergeladenen
Clientpakets ausschließlich LF/CRLF-Umwandlungen rückgängig machen, wenn die
wiederhergestellten Originalbytes exakt zur deklarierten Größe und SHA-256 passen.
Andere Inhaltsänderungen, beschädigte Downloads und Binärdateien werden weiterhin
abgewiesen. Manifest und Versionskatalog müssen unverändert bereitgestellt werden.

Für den Katalog kurze Cache-Zeiten oder `Cache-Control: no-cache` konfigurieren.
Unveränderliche Paketpfade dürfen langfristig gecacht werden. Ein Release-Job kann
die beiden Werkzeuge nach bestandenem Client-Build automatisch ausführen und
anschließend diese Upload-Reihenfolge einhalten.

## Warum die vorhandene neue Address Library trotzdem nicht geöffnet wurde

Bei der Diagnose vom 21. Oktober 2026 waren Skyrim **1.7.104.0**, SKSE **2.3.1** und
`versionlib-1-7-104-0.bin` vorhanden. Die alte CommonLib in
`skymp_mod_research.dll` erkannte aber nur den Versionszweig 1.6 als AE. Version 1.7
fiel in den alten SE-Zweig: Die DLL suchte dadurch nach `version-1-7-104-0.bin`.
Zusätzlich fehlte ihrem Reader die Unterstützung für Datenformat 5.

Diese Dateisuche geschieht innerhalb des nativen Plugins, nachdem SKSE es lädt.
Der Launcher hat dabei keine andere Adressdatei ausgewählt. Die Datei umzubenennen
würde die fehlende Format- und Laufzeitunterstützung nicht ergänzen.
Das zusätzliche Research-Plugin gehört nicht zum SkyMP-Clientpaket und muss für
Skyrim 1.7 ebenfalls aktualisiert oder gezielt deaktiviert werden.

Die Launcher-Downloadtests und der eigenständige native Adressdatenbank-Test ersetzen
keinen vollständigen Skyrim-/SKSE-Spieltest. Dessen Ergebnis muss je Clientfreigabe
separat ausgewiesen werden.
