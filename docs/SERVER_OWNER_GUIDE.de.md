# Handbuch für Serverbetreiber

<a id="compatibility"></a>

## Geltungsbereich & Kompatibilität {#compatibility}

Dokumentationsstand: **26.10.2026**, Launcher **0.2.0**. Server- und Runtime-Versionen werden separat geprüft.

Diese Anleitung beschreibt den gemeinsamen SkyMP-Worlds-Launcher **0.2.0** und die am **26.10.2026** geprüften Schnittstellen. Du kannst einen bestehenden kompatiblen SkyMP-Server erweitern oder den [RealHartlMax/SkyMP-Fork](https://github.com/RealHartlMax/skymp) als Grundlage verwenden. Die Spielerdaten und die Spielwelt werden durch eine Registrierung im Launcher nicht automatisch migriert.

**Es gibt keine Kompatibilitätsgarantie.** Ein Servereintrag, ein erfolgreich geladenes Manifest oder ein erfolgreicher Build beweist noch keine funktionierende Spielsitzung. Spielprotokoll, Server, nativer Client, Skyrim-Version, SKSE, Address Library, Mods und Ladereihenfolge müssen zusammenpassen. Ein anderer Multiplayer-Mod wird durch zusätzliche HTTP-Routen nicht automatisch SkyMP-kompatibel.

Prüfe Änderungen zunächst auf einer getrennten Testinstallation. Sichere Serverkonfiguration, Weltdaten, Konten und Schlüssel vor einer Umstellung. Die Beispiele enthalten absichtlich erkennbare Platzhalter; Dateigrößen, CRC32 und SHA-256 müssen aus deinen tatsächlichen Dateien erzeugt werden.

<a id="architecture"></a>

## Welche Dienste zusammenarbeiten {#architecture}

| Baustein | Adresse / Protokoll | Aufgabe |
| --- | --- | --- |
| Zentrale Liste | `https://api.skymp-worlds.net/list.php` | Server entdecken; im Launcher fest vorgegeben |
| Betreiberkonto | `https://manage.skymp-worlds.net/` | Server registrieren, Metadaten und private Schlüssel verwalten |
| Online-Master | `https://api.skymp-worlds.net` | Anmeldung, Heartbeats und Spielsitzungen |
| Dein Spielserver | Öffentlicher Host und UDP-Port, beispielsweise `7777` | Eigentliche Spielverbindung |
| Dein Dateiserver | Öffentliche HTTP(S)-Basis, beispielsweise `https://files.example.org/` | Modmanifest und Downloads |
| Clientkatalog | Vollständige URL zu `catalog.json` | Passende native Client-/SKSE-Kombination auswählen |

Spieladresse, Dateiserver und Master sind unterschiedliche Ziele. `resourceUrl` ist die Basis des Dateiservers, nicht die URL seiner Manifestroute. `runtimeSource` ist dagegen eine vollständige Katalog- oder Clientmanifest-URL. Der Launcher bereitet Dateien vor und startet anschließend den SKSE-Loader aus dem ausgewählten Spielverzeichnis.

<a id="fork"></a>

## Weg A: Den verlinkten Fork verwenden {#fork}

1. Verwende den [RealHartlMax-Fork](https://github.com/RealHartlMax/skymp). Prüfe den gewählten Commit oder das konkrete Release; ein beliebiges Upstream-Paket enthält nicht zwangsläufig dieselben Launcher-Erweiterungen.
2. Für einen eigenen Build folge dem [CMake-Ablauf des Forks](https://github.com/RealHartlMax/skymp/blob/main/docs/docs_cmake_workflow.md) und [CONTRIBUTING.md](https://github.com/RealHartlMax/skymp/blob/main/CONTRIBUTING.md). Ersetze eine laufende Installation erst nach Sicherung und Test.
3. Der gebaute Server liegt üblicherweise unter `build/dist/server`, der Windows-Client unter `build/dist/client`. Fertige Serverpakete werden mit `launch_server.bat` beziehungsweise `launch_server.sh` gestartet. Die benötigte Laufzeit und Erstkonfiguration beschreibt die [Serveranleitung im Fork](https://github.com/RealHartlMax/skymp/blob/main/docs/docs_running_a_server.md).
4. Stelle die eigenen Skyrim-/DLC-Masterdateien im konfigurierten `dataDir` bereit. Serverpakete ersetzen keine eigene Skyrim-Installation. Übernimm deine bestehende, passende Ladereihenfolge.
5. Registriere den Server, ergänze die [Verbindungskonfiguration](#configuration), veröffentliche Mods und ein passendes Clientpaket und führe die [Prüfschritte](#validation) aus.

Ein neuer Checkout lässt sich getrennt anlegen:

```sh
git clone https://github.com/RealHartlMax/skymp.git skymp-server-source
cd skymp-server-source
```

Das Klonen ist noch kein Build und kein Serverstart. Für die Launcher-Erweiterung sind insbesondere `skymp5-server/ts/launcherResources.ts`, deren Registrierung in `ui.ts` sowie die Master-/Login-Systeme relevant. Die veröffentlichten Modrouten wurden mit dem lokalen Stand verglichen; das ersetzt keine Prüfung deiner eigenen Binärdateien. Lokale, noch nicht veröffentlichte Clientanpassungen sind durch einen Repository-Link nicht automatisch verfügbar.

<a id="existing"></a>

## Weg B: Einen bestehenden Server integrieren {#existing}

Erweitere deinen bisherigen Server gezielt. Der gemeinsame Launcher verändert weder deine Gamemode-Logik noch dein Datenbankformat. Eine abweichende Implementierung kann zusätzliche Anpassungen benötigen.

| Anforderung | Was du bereitstellen oder prüfen musst |
| --- | --- |
| Spielprotokoll | Ein zum verwendeten nativen SkyMP-Client kompatibler UDP-Server |
| Verbindungsdaten | Öffentlicher Spielhost, Spielport, Datei-Basis-URL, Anmeldemodus und Clientquelle |
| Modbereitstellung | Bevorzugt [Manifest v2](#manifest) und verifizierbare Downloads; alternativ der begrenzte [Legacy-Vertrag](#legacy) |
| Online-Anmeldung | Master-Heartbeat und serverseitige Sitzungsvalidierung gemäß [Anmeldevertrag](#authentication) |
| Clientlaufzeit | Vollständige, zu Spiel und Server passende Clientdateien; für automatische Versionswahl ein [Katalog](#runtime) |
| Nachweis | API-, Download-, Wiederherstellungs- und anschließend echte Spieltests |

Die neue Modbereitstellung ist im Fork ein eigener Ressourcenbaustein mit expliziter Konfiguration. Nur die Datei zu kopieren genügt nicht: Der HTTP-Router muss sie registrieren, die tatsächlichen Quellverzeichnisse und die Ladereihenfolge übergeben und Fehler korrekt beantworten. Bei einem anderen Server-Stack kannst du denselben Vertrag implementieren. Die JSON-Feldnamen und Downloadregeln bleiben dabei verbindlich.

Ein bereits laufender Server kann für erste Tests weiterhin per **Direktverbindung** geöffnet werden. Für die öffentliche Namenssuche ist zusätzlich die Registrierung mit einem gültigen Heartbeat erforderlich. Eine öffentliche Registrierung bestätigt keine technische Kompatibilität.

<a id="registration"></a>

## Konto, Servereintrag & öffentliche Identität {#registration}

Servername und maximale Spielerzahl werden ausschließlich im Gameserver-Adminpanel gepflegt und per authentifiziertem Heartbeat übernommen. Das zentrale Web zeigt diese Werte an. Empfohlene Bilder: Logo **512 × 512** oder **1024 × 1024**, Banner **3072 × 512** (6:1); beide als PNG neben `server-settings.json`.

1. Erstelle ein reguläres Konto im [Betreiber-Dashboard](https://manage.skymp-worlds.net/) und bestätige gegebenenfalls die E-Mail-Adresse. Demo-Zugänge werden nicht für Spielanmeldungen verwendet.
2. Lege deinen Server mit öffentlichem Host und UDP-Spielport an. Name und Spielerlimit stellst du nur auf dem Spielserver ein; das Web übernimmt sie per Heartbeat. Wähle den Status `active`, wenn der Eintrag öffentlich verfügbar sein soll.
3. Öffne beim Eintrag **Launcher & Online-Anmeldung**. Trage die öffentliche Dateiserver-Basis und die vollständige Clientkatalog-URL ein. Beschreibung, Tags, Land, Spielmodus und eigene Community-Links sind öffentliche Profildaten. **Logo und Banner werden auf dem Spielserver bereitgestellt:** Lege `logo.png` (quadratisch) und `banner.png` (empfohlen 6:1) neben `server-settings.json`. Es gibt dafür keine URL-Eingabefelder im Web mehr. Der aktualisierte Fork erkennt neue, geänderte und gelöschte Bilder beim nächsten Heartbeat automatisch. Je PNG sind höchstens 8 MiB, 8192 Pixel je Kante und insgesamt 16 Megapixel zulässig; fehlende oder ungültige Bilder verwenden die Standardansicht. Unter `/api/launcher/assets` stehen die öffentlichen Bildbeschreibungen, unter `/api/launcher/assets/logo.png` und `/api/launcher/assets/banner.png` die Dateien. Das Web-Gateway prüft Größen und SHA-256 und stellt die Bilder über HTTPS bereit; auch ein HTTP-Dateiserver erzeugt dadurch keine gemischten Bildinhalte. Alte manuelle Bildadressen werden ignoriert.
4. Trage die angezeigten Werte in der Ersteinrichtung deines Spielservers oder unter **Einstellungen → Launcher-Anbindung** ein, speichere und starte den Spielserver geordnet neu.
5. Nach dem ersten vollständigen Heartbeat erscheint er in der zentralen Liste. Ein leerer Abruf `[]` ist ohne bekannte Einträge normal. Bekannte Server bleiben nach einer Offline-Abmeldung oder fünf Minuten ohne neuen Heartbeat als offline sichtbar; Verbinden ist dann gesperrt.

| Wert | Sichtbarkeit | Verwendung |
| --- | --- | --- |
| `serverUid` | Öffentlich | Stabile ID für Auswahl und Spielsession |
| `masterKey` in `server-settings.json` | Privat | Authentifiziert deinen Server beim Master |
| `masterKey` im öffentlichen Listeneintrag | Öffentlich | Historischer Feldname; beim aktuellen PHP-Master steht hier die öffentliche Server-ID |
| Login-Token / Spielsession | Privat | Zeitlich begrenzte Benutzer- bzw. Serveranmeldung |

Veröffentliche niemals den privaten Heartbeat-Schlüssel als Beschreibung, Tag oder Download. Er gehört nicht in das Launcher-Profil des Spielers. Eine Schlüsselrotation erfolgt über das Dashboard; aktualisiere danach die private Serverkonfiguration und starte den Server neu.

### Servername, Spielerlimit und Erreichbarkeit

Servername und maximale Spielerzahl werden ausschließlich im Adminpanel des Spielservers eingestellt. Die Webseite zeigt diese Werte schreibgeschützt aus dem authentifizierten Heartbeat. Das Speichern der Web-Registrierung erzeugt keinen eigenen Heartbeat. Noch nie gemeldete Server erscheinen erst nach ihrem ersten vollständigen Heartbeat in der öffentlichen Liste.

Jeder Heartbeat enthält mindestens `name`, `maxPlayers` und die aktuelle Spielerzahl `online`. Der optionale Wert `serverStatus` lautet `online` oder `offline`. Beim geordneten Stoppen meldet der aktuelle Fork `offline`. Ohne neuen Heartbeat gilt ein bekannter Server nach **5 Minuten** als offline. Die öffentliche Liste liefert `server_status` und `last_heartbeat`. Bekannte Offline-Server bleiben sichtbar und sind nicht verbindbar. Nach dem nächsten Online-Heartbeat sind sie wieder verfügbar. Launcher und Webliste aktualisieren sich bei sichtbarer Seite alle 30 Sekunden.

Der Offline-Indikator ist unabhängig von `offlineMode`, das die Art der Spielanmeldung festlegt. Beim Umbenennen oder Ändern des Limits die Serverkonfiguration speichern und den Spielserver bei Bedarf neu starten.

<a id="configuration"></a>

## Vorhandene Serverkonfiguration ergänzen {#configuration}

Die Launcher-Anbindung wird im aktuellen Fork über **Einstellungen → Launcher-Anbindung** im Server-Admin-Dashboard gespeichert. Bei einem neuen Server stehen dieselben Felder in der Browser-Ersteinrichtung bereit. Trage Master-URL, öffentliche Server-ID, privaten Serverschlüssel, öffentliche Spieladresse und UDP-Port ein. Wähle **Online**, aktiviere die Mod-Synchronisation und gib das relative Mod-Verzeichnis sowie die vollständige Katalog-URL an. **Anbindung speichern** aktualisiert die vorhandene Konfiguration; weitere Einstellungen und Weltdaten bleiben erhalten. Ein leeres Schlüsselfeld behält einen gespeicherten Schlüssel bei. Anschließend den Spielserver geordnet neu starten.

Das zentrale Dashboard zeigt die zugehörigen Werte in einzelnen Feldern. Es bearbeitet keine Dateien auf deinem entfernten Spielserver. Änderungen an einem anderen Fork müssen dort entsprechend implementiert sein; die JSON-Beispiele dokumentieren weiterhin den technischen Vertrag.

Für dein Dashboard-Konto gibt es auf der Anmeldeseite **Passwort vergessen?**. Der E-Mail-Link ist 30 Minuten gültig und einmal verwendbar. Nach dem Zurücksetzen erneut an Webseite und Spiel anmelden. Ohne eingerichteten Mailversand muss der Plattformbetreiber seine SMTP-Konfiguration vervollständigen.

Das folgende JSON ist ein **Zusammenführungsbeispiel**, keine vollständige Ersatzkonfiguration. Behalte Gamemode, Datenpfade, Weltdaten, weitere Einstellungen und die vollständige korrekte Ladereihenfolge deines Servers bei. Ersetze öffentliche ID und privaten Schlüssel durch die Werte deines eigenen Eintrags.

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

`launcherResources.directory` wird im Fork relativ zum Arbeitsverzeichnis des Serverprozesses aufgelöst. Starte ihn deshalb aus seinem vorgesehenen Paketverzeichnis oder verwende einen bewusst gewählten absoluten Pfad. Ohne explizite Angabe sind die Modbereitstellung aktiviert und `./client-resources` vorgesehen. Mit `enabled: false` wird die neue Mod-API deaktiviert.

Der Katalog unter der Update-Domain muss tatsächlich hochgeladen und für deine Client-/Serverkombination geeignet sein. Die URL ist keine allgemeine Zusage für jede Skyrim-Version. Du kannst stattdessen eine eigene vollständige `catalog.json` anbieten. Halte die Angaben im Servermanifest und im Dashboard konsistent; nach einer Änderung der Downloadangaben wird ein neuer Heartbeat benötigt.

<a id="network"></a>

## Erreichbarkeit, TLS & Reverse Proxy {#network}

Beim aktuellen Steam-Zugang werden `/api/launcher/auth-policy` und `/api/launcher/auth/steam` gegen die Hostwurzel der Ressourcenadresse aufgelöst. Liegt die Dateifreigabe hinter einem Pfadpräfix wie `/realm/`, müssen diese beiden Auth-Routen zusätzlich am Hostwurzelpfad weitergeleitet werden. Eine eigene Dateiserver-Subdomain ohne Pfadpräfix vermeidet diese besondere Proxy-Zuordnung.

| Verbindung | Typische Freigabe | Prüfen |
| --- | --- | --- |
| Spielclient → Spielserver | `7777/UDP` oder dein Spielport | Firewall, NAT und öffentliche Spieladresse |
| Launcher → Dateiserver | `443/TCP` mit HTTPS oder direkter HTTP-Port | Manifest und Dateien anonym erreichbar |
| Spielserver → Master | Ausgehend `443/TCP` | DNS, TLS-Zertifikat und Heartbeats |
| Spieler → Dashboard/Master | HTTPS | Anmeldung, Zustimmung und Session-Erstellung |

PHP-Webspace kann Dashboard, Master-Gateway, Dokumentation und statische Downloads ausliefern. Er ersetzt keinen dauerhaft laufenden nativen Spielserver. Ein gewöhnlicher HTTP-Reverse-Proxy transportiert den UDP-Spielport nicht automatisch.

Nutze bei einem Proxy die endgültige öffentliche Basis-URL, beispielsweise `https://files.example.org/realm/`. Unter diesem Präfix müssen `api/launcher/manifest` und die relativen Downloadpfade erreichbar sein. Der Launcher folgt bei Manifesten und Dateien keinen HTTP-Weiterleitungen. Trage daher die finale HTTPS-Adresse mit passendem Hostnamen ein; vorgeschaltete Login-Seiten, Basic Auth und Weiterleitungen sind keine öffentlichen Downloads.

Die Download-/Katalog-URLs dürfen keine Zugangsdaten, Query-Parameter oder Fragmente enthalten. Der öffentliche PHP-Master lehnt private, Loopback- und Link-Local-Ziele ab, auch bei DNS-Auflösung. `127.0.0.1` bedeutet aus Sicht eines Spielers dessen eigenen Rechner. Für lokale Entwicklung verwende eine direkte lokale Verbindung; veröffentliche keine internen Adressen im Produktivprofil. Die Launcher-Dateizugriffe laufen im Rust-Backend und benötigen keine Browser-CORS-Freigabe.

<a id="resources"></a>

## Mods, Assets & Ladereihenfolge bereitstellen {#resources}

Im Adminpanel unter **Ressourcen** hochgeladene Plugins neu einlesen, aktivieren und mit den Pfeilen ordnen. Neue Uploads sind zunächst deaktiviert. **Ladereihenfolge speichern** verändert nur `loadOrder` in der bestehenden Serverkonfiguration. Danach den Spielserver neu starten. Die Dateistruktur und der technische Vertrag darunter bleiben maßgeblich; ein manuelles Kopieren von JSON ist für diesen Ablauf nicht nötig.

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

Im Fork werden eigene Plugins aus `loadOrder` und zugehörige Archive `NAME.bsa` bzw. `NAME - *.bsa` aus `dataDir` automatisch berücksichtigt. Weitere Dateien für den Spielclient legst du mit ihrer endgültigen Verzeichnisstruktur unter `client-resources/Data/` ab. Serverseitige Skripte unter `data/scripts/` werden dadurch nicht automatisch als Clientskripte verteilt.

Alle zusätzlichen `.esm`, `.esp` und `.esl` müssen in der tatsächlichen Server-Ladereihenfolge stehen. Liegt ein Plugin sowohl im Daten- als auch im Ressourcenverzeichnis, müssen beide Kopien übereinstimmen. Plugins und BSA-Archive liegen direkt unter `Data/`; Texturen, Modelle und Skripte behalten ihre Unterordner. Nach Änderungen an der Ladereihenfolge den Server neu starten. Der Ressourcenindex verwendet einen kurzen Metadatencache von ungefähr zwei Sekunden.

| `kind` | Zulässige Inhalte im Modpaket |
| --- | --- |
| `mod` | `.esm`, `.esp`, `.esl` |
| `archive` | `.bsa` |
| `script` | Kompilierte `.pex` unter `Data/Scripts/` |
| `asset` | Unterstützte Modelle, Texturen, Animationen, Audio, Interface, Sprach- und Bilddateien |
| `config` | Passive `.ini`, `.json`, `.xml`, `.txt`, `.toml`, `.yaml`, `.yml` |

Native DLLs und JavaScript gehören in das getrennte Clientpaket. Geschützte Plattform-/Anmeldedateien, Bethesda-Master und Creation-Club-Dateien werden nicht als Moddownload angeboten. Pfadwechsel, Symlinks/Junctions, Windows-Gerätenamen, Doppelpunkte, nachgestellte Punkte/Leerzeichen und nur in der Großschreibung unterschiedliche Zielpfade werden abgewiesen. Für die neue Mod-API gilt eine Zielpfadlänge von höchstens 240 UTF-8-Bytes.

ZIP-/7z-/FOMOD-Pakete werden nicht beim Spieler entpackt oder interaktiv installiert. Bereite die gewünschte Modauswahl selbst vor und veröffentliche nur die benötigten, zur Weitergabe vorgesehenen Dateien. Eigene Skyrim-/DLC-Dateien müssen aus der passenden Installation des Spielers stammen.

<a id="manifest"></a>

## Manifest v2: Vertrag für eigene Implementierungen {#manifest}

`GET <resourceUrl>/api/launcher/manifest` liefert ohne Betreiber-Login JSON mit `version` als **Zeichenkette `"2"`**. Zahlen und Prüfsummen im folgenden Strukturbeispiel sind Beispielwerte, keine Werte einer tatsächlich spielbaren Modfreigabe. Dein Server muss sie aus den echten Dateien berechnen.

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

| Feld | Bedeutung |
| --- | --- |
| `loadOrder` | Nicht leere, geordnete Pluginliste; keine Namen aus Verzeichnissen ableiten |
| `requiredLocalFiles` | Lokale Bethesda-/Creation-Club-Anforderungen mit Dateiname, Bytezahl und CRC32; keine Download-URLs |
| `resources[].path` | Eindeutiger Zielpfad relativ zum Spielverzeichnis, beginnend mit `Data/` |
| `name` | Dateiname zur Anzeige; darf in verschiedenen Assetordnern gleich sein |
| `size` | Exakte Bytezahl als JSON-Zahl |
| `hash` | `sha256:` gefolgt von 64 Hex-Zeichen des tatsächlichen Inhalts |
| `downloadPath` | Relativer Pfad `api/launcher/files/` mit einer 64-stelligen hexadezimalen, undurchsichtigen ID |
| `totalSize` | Summe der Modressourcen; das getrennte Clientpaket zählt nicht dazu |
| `revision`, `generatedAt` | Veröffentlichung identifizieren bzw. zeitlich einordnen |
| `runtimeSource` | Optionaler vollständiger Clientkatalog-/Manifest-Link |

Ein Generator muss die freigegebenen Quellwurzeln prüfen, Links ausschließen, Zielpfade nach Windows-Regeln normalisieren, Duplikate erkennen und Größe/SHA-256 aus den gelesenen Inhalten ermitteln. CRC32 gilt für lokale Spielanforderungen; es ersetzt nicht SHA-256 bei Downloads. Liefere keine widersprüchlichen Metadaten, wenn während einer Veröffentlichung Dateien fehlen oder wechseln. Für ungeeignete Veröffentlichungen ist ein Fehler besser als eine unvollständige erfolgreiche Liste.

Grenzen des aktuellen Vertrags: höchstens **10.000 Moddateien**, **8 GiB je Datei**, **64 GiB je Modpaket**; JSON-Manifeste werden im Launcher auf **8 MiB** begrenzt. Gleiche Grenzwerte und geschützte Zielpfade gehören in eine eigene Implementierung.

<a id="downloads"></a>

## Download-Endpunkte & HTTP-Antworten {#downloads}

`GET` bzw. `HEAD <resourceUrl>/api/launcher/files/<id>` muss die im Manifest angekündigte Datei liefern. Eine Ressourcen-ID bezeichnet eine freigegebene Datei; sie darf nicht als beliebiger Dateisystempfad ausgewertet werden. Ein separater Dateihost ist möglich, wenn das Manifest und alle relativen Routen unter seiner Basis erreichbar bleiben.

| Antwort | Verhalten des Forks / Bedeutung |
| --- | --- |
| `200` | Vollständige Datei, korrekte `Content-Length`; `HEAD` ohne Antwortkörper |
| `206` | Unterstützter einzelner Byte-Bereich mit `Content-Range` |
| `304` | `If-None-Match` passt zum `ETag` |
| `400` | Ungültige Ressourcen-ID |
| `404` | API deaktiviert oder ID der alten Revision nicht mehr vorhanden |
| `409` | Datei seit dem Indexieren verändert; Manifest neu abrufen |
| `416` | Ungültiger Byte-Bereich |
| `503` | Veröffentlichung unvollständig, nicht lesbar oder widersprüchlich |

Der Fork sendet außerdem `X-Resource-Hash`, `ETag` und `Accept-Ranges: bytes`. Unveränderliche Datei-IDs dürfen langfristig gecacht werden; das Manifest muss aktuell bleiben. Der Launcher prüft heruntergeladene Daten unabhängig von den HTTP-Headern gegen Größe und SHA-256. Er benötigt vollständige Downloads; HTTP-Range-Unterstützung ist keine Zusage, dass ein abgebrochener Download in dieser Launcher-Version fortgesetzt wird.

<a id="legacy"></a>

## Ältere Server: Legacy-Vertrag {#legacy}

Nur ein **HTTP 404** auf `/api/launcher/manifest` erlaubt dem Launcher den Rückfall auf `/api/resources/manifest` und `/manifest.json`. Ein `503`, eine ungültige v2-Antwort oder eine Prüfsummenabweichung wird nicht durch stillen Legacy-Betrieb übergangen.

Der ältere Ressourcenvertrag verwendet `version: "1"`, flache Dateinamen und Downloads über `/api/resources/download/<name>`. Unterverzeichnisse moderner Assetpakete werden damit nicht vollständig beschrieben. Das zusätzliche Spielmanifest liefert beispielsweise diese Struktur; auch hier sind Zahlen Platzhalterwerte:

```json
{
  "versionMajor": 1,
  "mods": [
    { "filename": "Skyrim.esm", "size": 249753412, "crc32": 123456789 }
  ],
  "loadOrder": ["Skyrim.esm"]
}
```

Ohne Ressourcen-API funktioniert dieser Weg nur, wenn alle erforderlichen Dateien bereits lokal vorhanden sind und zu den veröffentlichten Größen/CRC32 passen. Eine alte pauschale `.esm`-Sperre oder ein fehlender Download für eigene Plugins wird dadurch nicht repariert. Für neue Integrationen und strukturierte Modpakete verwende v2.

<a id="runtime"></a>

## Client, SKSE & Address Library veröffentlichen {#runtime}

Die Launcher-EXE enthält keine SkyMP-/SKSE-DLLs. Du veröffentlichst eine passende Clientkombination außerhalb des Launchers. `runtimeSource` kann ein einzelnes `runtime-manifest.json` oder ein `catalog.json` mit mehreren freigegebenen Skyrim-Versionen sein. Der Katalog wählt anhand der echten Dateiversion von `SkyrimSE.exe` genau den passenden Eintrag; eine andere, vermeintlich neuere Spielversion wird nicht ersatzweise installiert.

Katalogbeispiel mit einer relativen Manifestadresse; der SHA-256 ist ein Beispielwert und muss durch den Hash der exakten Manifestdatei ersetzt werden:

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

Das ausgewählte Clientmanifest verwendet die Zahl `version: 1`, `gameVersion`, `skseVersion` und `files`. Jede Datei hat `path`, `size` und einen SHA-256 **ohne** `sha256:`-Präfix. Für ein vollständiges versioniertes Paket werden mindestens diese Kernpfade verlangt; alle weiteren Laufzeit-, CEF- und Skriptdateien des fertigen Clients gehören ebenfalls hinein:

```text
Data/SKSE/Plugins/SkyrimPlatform.dll
Data/SKSE/Plugins/MpClientPlugin.dll
Data/Platform/Plugins/skymp5-client.js
Data/Platform/Distribution/RuntimeDependencies/SkyrimPlatformImpl.dll
skse64_loader.exe
skse64_1_7_104.dll
Data/SKSE/Plugins/versionlib-1-7-104-0.bin
```

Diese sieben Namen zeigen die Kombination für Skyrim `1.7.104.0` mit SKSE `2.3.1`; sie sind keine vollständige Dateiliste und keine allgemeine Garantie. Andere Spielversionen brauchen die entsprechend passenden Dateien und native Unterstützung. Das Adressdatenformat ist im geprüften 1.5-Zweig Format 1, im 1.6-Zweig Format 2 und im 1.7-Zweig Format 5. Eine neue Address Library macht eine alte, inkompatible Plugin-DLL nicht automatisch kompatibel.

Erzeuge die Dateien mit den Werkzeugen aus dem **Launcher-Repository**, nicht aus dem Serververzeichnis. Die folgenden PowerShell-Befehle setzen einen fertig gebauten Client, das entpackte passende SKSE-Archiv und die passende Adressdatei voraus:

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

Der Ausgabeordner eines Pakets muss neu sein. Wiederhole `--manifest` für weitere Spielversionen; pro Version darf es genau einen aktuellen Katalogeintrag geben, insgesamt höchstens 512. Zum bewussten Ersetzen eines bestehenden Katalogs dient `--replace`. Erst neue Paketordner vollständig hochladen, danach den Katalog zuletzt umstellen. Der Katalog wird neu validiert; passende Dateihashes werden aus dem Cache wiederverwendet.

Das Werkzeug lässt persönliche Verbindungseinstellungen, gespeicherte Anmeldungen und Bethesda-Dateien aus und übernimmt passende SKSE-Skripte und vorhandene SKSE-Dokumente. Veröffentliche notwendige Lizenzen mit. Eine ausdrücklich manuell ausgewählte Clientquelle im erweiterten Launcher-Profil hat Vorrang; für automatische Serverangebote muss diese manuelle Auswahl entfernt werden. Eine lokale Buildquelle aktualisiert sich nicht über das Internet.

Die üblichen Zielordner liegen unter dem Spielverzeichnis: `Data/Platform/Plugins` für Clientskripte, `Data/SKSE/Plugins` für native Plugins und die Address Library sowie der Spielhauptordner für SKSE. Der Fork liest die Pluginordner aus `Data/SKSE/Plugins/SkyrimPlatform.ini`; der Standard lautet `Data/Platform/Plugins;Data/Platform/PluginsDev`. Alte Dateien unter `Platform/Plugins` ohne `Data/` werden dadurch nicht automatisch verwendet oder vom Launcher verwaltet.

Fehlt `runtimeSource` sowohl im Servermanifest als auch im ausgewählten Profil, kann der Launcher nur vorhandene Clientdateien verwenden; es gibt dann kein angebotenes automatisches Clientupdate. Eine Änderung der angebotenen Clientdateien wird bei der nächsten Vorbereitung über Manifest und Dateihashes erkannt. Neu herunterladen muss er nur fehlende oder abweichende Dateien. Der private Anmeldestatus und die erzeugten Verbindungseinstellungen sind von Clientpaketen ausgeschlossen.

<a id="authentication"></a>

## Online-Anmeldung & Sitzungsvertrag {#authentication}

Der normale Spielerzugang verwendet **Steam**. Der Launcher liest die Policy vom Gameserver, holt ein Ticket für genau die gelieferte Dienstkennung und übergibt es zur Prüfung. Der Server entscheidet über Whitelist/Freigabe. Ein zusätzliches SkyMP-Webkonto ist nur nötig, wenn die Antwort `accountLoginRequired` verlangt. Der Modus `guest` bezeichnet diesen Zugang ohne zusätzliches Webkonto und schaltet die Steam-Prüfung nicht aus.

| Auf dem Gameserver | Bedeutung |
| --- | --- |
| `GET /api/launcher/auth-policy` | Steam-/Zugangs-Policy und Ticket-Dienstkennung |
| `POST /api/launcher/auth/steam` | Steam-Ticket und optionalen Anzeigenamen prüfen |

Ausstehende Anfragen werden im Gameserver-Adminpanel unter **Whitelist / Spielerzugang** freigegeben. Vor der Freigabe muss noch keine verbundene Spielfigur vorhanden sein. Steam-ID, Anzeigename und Charakterzuordnung bleiben getrennt. Der Splashscreen schließt nach bestätigtem Prozessstart; das ist keine Bestätigung, dass die Spielwelt schon geladen ist.

### Master- und optionale Legacy-Anmeldung

Die zentrale Plattform verwendet reguläre Dashboard-Konten, eine ausdrückliche Spielzustimmung und servergebundene Sessions. `offlineMode` muss auf dem Server und im Verbindungsprofil zusammenpassen. Nur im Launcher auf offline umzuschalten ändert die Serverauthentifizierung nicht.

| Methode und Route am Master | Zweck |
| --- | --- |
| `GET /api/users/login-discord?state=<64-hex>` | Browser zur Konto-/Spielanmeldung führen |
| `GET /api/users/login-discord/status?state=<64-hex>` | Nach Zustimmung Login-Token und numerische Identität erhalten; vorher `401` |
| `POST /api/users/me/play/<serverUid>` | Mit Login-Token eine Session für die öffentliche Server-ID anfordern |
| `POST /api/servers/<privateMasterKey>` | Serverseitiger Heartbeat mit `name`, `online`, `maxPlayers`, optional `serverUid` und `serverStatus` (`online`/`offline`) |
| `GET /api/servers/<privateMasterKey>/sessions/<session>` | Session auf dem Spielserver prüfen; gültige Antwort enthält `user.id` und `user.name` |
| `GET /api/servers/<serverUid>/manifest.json` | Öffentliches Spielmanifest über den Master-Proxy abrufen |
| `GET /api/servers/<serverUid>/serverinfo` | Öffentliche Verbindungseigenschaften abrufen |

`POST /api/users/me/play/...` übergibt den Login-Token im Header `Authorization`; der PHP-Master akzeptiert auch das Präfix `Bearer`. Die Antwort enthält `session`. Beim Heartbeat und beim Nachprüfen dieser Session verwendet ausschließlich der Spielserver seinen privaten Schlüssel. Behandle entsprechende Server-Logzeilen und URL-Protokolle als vertraulich und entferne Schlüssel vor Supportanfragen.

Eine Session gilt nur für den vorgesehenen Server und dessen aktuellen privaten Schlüssel. Ablauf, Dashboard-Abmeldung und Schlüsselrotation können Sitzungen ungültig machen. Der Server muss ungültige Sessions ablehnen. Ein neuer Master darf bestehende numerische Spielidentitäten nicht ohne eine geplante Datenmigration neu vergeben.

Der historische Routenname `login-discord` bedeutet bei diesem PHP-Master **keine automatisch eingerichtete Discord-OAuth- oder Gildenprüfung**. Zusätzliche Discord-Rollen-/Gildenregeln benötigen eine passende echte Providerintegration. Der öffentliche Community-Einladungslink ist kein Anmeldeanbieter. Ein eigener kompatibler Master lässt sich für direkte Verbindungen konfigurieren; ein zentral registrierter Server nutzt die im zentralen Listeneintrag veröffentlichten Masterangaben.

<a id="validation"></a>

## Installation prüfen, bevor Spieler beitreten {#validation}

### Stufe 1: Öffentliche HTTP-Schnittstellen

Die folgenden PowerShell-Beispiele verwenden `curl.exe`, damit nicht der ältere PowerShell-Alias gemeint ist. Unter Linux lautet der Befehl `curl` mit denselben Optionen. Ersetze `files.example.org` durch deine endgültige öffentliche Adresse.

```powershell
curl.exe --fail-with-body https://api.skymp-worlds.net/health
curl.exe --fail-with-body https://api.skymp-worlds.net/list.php
curl.exe --fail-with-body https://files.example.org/api/launcher/manifest
curl.exe --fail-with-body https://update.skymp-worlds.net/client-runtime/catalog.json
```

Erwartet werden JSON-Antworten ohne Login-Seite oder Weiterleitung. Prüfe öffentliche ID, Datei-Basis, Anmeldemodus, Ladereihenfolge und Clientquelle. Der private Server-Schlüssel darf in der öffentlichen Liste nicht vorkommen. Lade mindestens eine tatsächliche Ressource über ihre veröffentlichte ID und vergleiche die lokale Prüfsumme mit `hash`:

```powershell
Get-FileHash -Algorithm SHA256 ./downloaded-file.bin
```

Unter Linux eignet sich `sha256sum ./downloaded-file.bin`. Stelle zusätzlich sicher, dass unbekannte IDs, geänderte Dateien und ungültige Pfade verständliche Fehler liefern und niemals beliebige Serverdateien ausgeben.

### Stufe 2: Vorbereitung ohne Spielstart

Wähle in einer getrennten geeigneten Testinstallation den Spielordner mit `SkyrimSE.exe`. Schließe Skyrim. Öffne den Server im Launcher, dann **Verbindungsoptionen** und **Dateien vorbereiten**. Dieser Vorgang startet kein Spiel, verändert aber die vorbereitete Testinstallation. Prüfe Unterordner, vollständige Clientdateien, Ladereihenfolge und die erzeugten Verbindungseinstellungen. Wiederhole die Vorbereitung: gültige Dateien sollen aus dem Cache kommen. Teste anschließend **Originaldateien wiederherstellen** und den Wechsel zwischen zwei Testprofilen.

Der Launcher führt Hash- und Versionsprüfungen vor der Aktivierung aus. Ein falscher Hash, eine fehlende Paketversion oder ein abgebrochener Download darf keine unvollständige Freigabe aktivieren. Der [Launcher-Quellcode](https://github.com/RealHartlMax/skymp-client-launcher) enthält zusätzlich temporäre HTTP-/Wiederherstellungstests und einen Test gegen eine getrennte Kopie des nativen Servers.

### Stufe 3: Eigener vollständiger Spieltest

Erst jetzt einen echten Skyrim-/SKSE-Test mit der vorgesehenen Version durchführen: Start, Browseranmeldung und Zustimmung, Session-Prüfung, UDP-Verbindung, gemeinsame Spielwelt und erneutes Verbinden. Prüfe zusätzliche native Plugins getrennt. Ein bestandener Datei- oder API-Test ist kein Ersatz für diesen Test. Dokumentiere den tatsächlich getesteten Server-/Clientstand und das Modpaket, bevor du es für Spieler anbietest.

<a id="operations"></a>

## Updates, Rücknahme & Wiederherstellung {#operations}

Veröffentliche neue Mod- und Clientdateien als zusammenhängende Freigabe. Halte Ladereihenfolge, Serverdaten und Clientressourcen synchron. Für Clientupdates neue unveränderliche Paketpfade erzeugen, alle Dateien hochladen und den Katalog zuletzt umstellen. Eine Katalogänderung ersetzt keinen nötigen Serverneustart bei geänderten Plugins.

Die Launcher-Caches sind nach Serverziel getrennt. Originale und Aktivierungsjournal liegen unter `<Skyrim>/.skymp-launcher/`. Pluginlisten unter dem Skyrim-Profil und gegebenenfalls `Skyrim.ccc` werden für die gewählte Ladereihenfolge angepasst. Bewahre das Journal auf, solange Dateien aktiviert sind; lösche es nicht als vermeintliche Fehlerbehebung. Bei eigenen Änderungen an verwalteten Dateien kann eine Wiederherstellung zum Schutz dieser Änderungen abbrechen.

Sichere Weltdaten und Serverkonfiguration vor Updates unabhängig vom Launcher. Der Betreiber der zentralen PHP-Plattform muss Kontenspeicher und den privaten Auth-Speicher samt Identitätszuordnung und Schlüssel gemeinsam erhalten. Eine Rücknahme des Clientkatalogs stellt nur die angebotenen Clientdateien um; sie ist keine automatische Rücknahme einer Server-/Weltdatenmigration.

Bei einer gesperrten oder kompromittierten Serveridentität Schlüssel rotieren, private Konfiguration aktualisieren und den Heartbeat neu starten. Für Support reichen öffentliche ID, Zeit, Launcher-/Client-/Skyrim-Version und bereinigte Fehlermeldungen. Passwörter, private Master-Schlüssel und Sessions gehören nicht in einen Discord-Beitrag.

<a id="troubleshooting"></a>

## Häufige Fehler gezielt eingrenzen {#troubleshooting}

| Symptom | Nächster Prüfschritt |
| --- | --- |
| Heartbeat meldet `404` mit `Server is not registered yet` | Alter Registry-Pfad: API-Webroot einschließlich `api/servers/index.php` und `native-heartbeat.php` zusammen mit dem Dashboard aktualisieren; private Konfiguration und Daten erhalten |
| Server fehlt in der Namenssuche | Eintrag `active`, öffentliche Adresse, gültiger privater Schlüssel und aktueller Heartbeat prüfen |
| Neue Manifestroute liefert `404` | Fork-/Routerstand oder `enabled` prüfen; nur dann ist der begrenzte Legacy-Rückfall vorgesehen |
| Manifest liefert `503` | Serverlog, Quellordner, Links, doppelte Zielpfade und laufende Veröffentlichung prüfen |
| Download liefert `409` oder falschen Hash | Veröffentlichung beenden, neues Manifest abrufen, echte Inhalte und Größen neu indexieren |
| Master-Proxy liefert `502` | Öffentliche Datei-URL, DNS/TLS, Erreichbarkeit und ausgeschlossene private Ziele prüfen; Weiterleitungen entfernen |
| Online-Session ist ungültig | Öffentliche `serverUid` nicht mit privatem `masterKey` verwechseln; Anmeldemodus, Schlüsselrotation, Ablauf und Zustimmung prüfen |
| `/account` oder Loginroute liefert `404` | API-Webroot, Apache-Rewrite/Authorization-Weitergabe und Master-Konfiguration prüfen |
| Dateien sind bereit, Spiel verbindet nicht | UDP-Port, Firewall/NAT, Spielprotokoll und tatsächliche Server-/Clientkompatibilität prüfen |
| `REL/ID.h` / Address-Library-Fehler | Welche Plugin-DLL bricht ab? Skyrim-Version, SKSE, benötigten Dateinamen und natives Datenformat gemeinsam prüfen |
| Neueste Adressdatei ist vorhanden, Fehler bleibt | Eine alte DLL kann die falsche Datei suchen oder das neue Format nicht lesen; die DLL aktualisieren statt die BIN-Datei umzubenennen |
| Clientdateien bleiben alt | Manuelle Clientquelle im erweiterten Profil, tatsächlich verwendete `runtimeSource` und Hash des Katalogeintrags prüfen |
| Wiederherstellung verweigert Änderungen | Spiel schließen, fremde Änderungen an verwalteten Dateien sichern und Journal erhalten; nicht blind löschen |

Benötigst du Hilfe, nutze den [SkyMP-Worlds-Discord](https://discord.gg/NSXtNNbjuR). Ein einzelner behobener Ladefehler ist noch kein Nachweis, dass alle weiteren nativen Plugins zur Spielversion passen.

### Fehlende gamemode.js wiederherstellen

`ENOENT ... gamemode.js` betrifft die Gamemode-Datei auf dem VPS. Eine eigene Gamemode aus der Sicherung wiederherstellen oder im Server-Adminpanel unter **CFG-Editor → Allgemein → Gamemode-Datei auf dem Server** den vorhandenen Dateipfad eintragen, speichern und den Spielserver neu starten. Der Pfad ist relativ zum Server-Arbeitsverzeichnis oder absolut. Eine im Serverpaket enthaltene Standard-Gamemode ist nur für einen unveränderten Standardserver gedacht; eine eigene Gamemode muss aus der eigenen Sicherung wiederhergestellt werden. Der Dateiwächter behält eine bereits geladene Gamemode bei einer vorübergehenden Dateilücke und lädt sie nach der Wiederherstellung erneut.

<a id="sources"></a>

## Quellen, Versionsstand & Verantwortung {#sources}

Dieses Handbuch wurde am **26.10.2026** mit dem Launcher-Stand **0.2.0** und den dokumentierten Schnittstellen abgeglichen. Der Windows-Launcher wurde gebaut; 69 aktive Rust-Tests bestehen, drei Integrationsprüfungen sind ausgenommen. Der Nutzer hat Start und Bewegung mit der separat bereitgestellten nativen Runtime bestätigt. Das ersetzt keine eigene Abnahme weiterer Server-, Spiel- oder Modversionen. Der verlinkte Server-Fork entwickelt sich unabhängig; eine frühere feste Commitangabe ist keine Zusage für spätere Builds.

- [Server-Fork und Quellcode](https://github.com/RealHartlMax/skymp)
- [Modmanifest und Dateirouten im Fork](https://github.com/RealHartlMax/skymp/blob/main/skymp5-server/ts/launcherResources.ts)
- [Server-Master/Heartbeat](https://github.com/RealHartlMax/skymp/blob/main/skymp5-server/ts/systems/masterClient.ts)
- [Serverseitige Anmeldung](https://github.com/RealHartlMax/skymp/blob/main/skymp5-server/ts/systems/login.ts)
- [Launcher, Downloader und Paketwerkzeuge](https://github.com/RealHartlMax/skymp-client-launcher)
- [Offizielle SKSE-Versionen](https://skse.silverlock.org/)

Dieser Webbereich ist statisch und benötigt auf dem Webspace keinen Node-Prozess und keine Datenbank. Hauptseite, Dashboard, Master, Dateihost und Spielserver werden dadurch nicht automatisch bereitgestellt. Für den Betrieb bleiben die jeweiligen Betreiber und ihre geprüfte Server-/Clientkombination verantwortlich. **Eine Garantie für die Integration in bestehende Server oder beliebige Modpakete wird nicht gegeben.**

<a id="resources-player-name"></a>

## Ressourcen und Spielername im Dashboard {#resources-player-name}

Der Bereich Ressourcen erkennt ESM-, ESP- und ESL-Dateien direkt im konfigurierten Server-Datenordner und in Data des Launcher-Downloadordners. Nach einem Upload Dateien neu einlesen, gewünschte Plugins aktivieren und mit den Pfeilen sortieren. Neue Dateien bleiben zunächst deaktiviert. Skyrim.esm steht zuerst; benötigte Master müssen vor ihren abhängigen Plugins geladen werden. Nur im Downloadordner vorhandene Plugins müssen zusätzlich im Server-Datenordner liegen. Beide Kopien müssen übereinstimmen.

Ladereihenfolge speichern ändert ausschließlich loadOrder der bestehenden Konfiguration. Anschließend den Spielserver neu starten, damit das aktive Manifest aktualisiert wird. Der Launcher übernimmt die Reihenfolge in plugins.txt und loadorder.txt und erhält Originale, auch bei Cache-Aktualisierung und Serverwechsel. Für diese neue Oberfläche beide Backends und das Dashboard-Frontend aus dem Server-Repository bauen; private Konfiguration, Welt, Mods und Schlüssel erhalten.

Der Launcher überträgt einen Spieler-Anzeigenamen zusätzlich zur bestätigten Steam-ID. Er erscheint in der Freigabe/Whitelist und in der Spieleransicht. Name und RP-Figurenname bleiben getrennt; Identität, Freigabe und Profil ändern sich durch Umbenennen nicht. Der neue Server-Quellstand ist für diese Anzeige erforderlich.

Die optionale Discord-Webanmeldung wird auf dem PHP-Webhosting mit privatem Client-Secret eingerichtet. Bestehende Passwortkonten werden nach der Anmeldung ausdrücklich unter https://manage.skymp-worlds.net/account.php verknüpft. Der Discord-Aktivitätsstatus im Launcher benötigt nur die öffentliche App-ID und die Desktop-App, keine Web-OAuth-Anmeldung. Eine Discord-Gilden- oder Rollenprüfung wird hierdurch nicht hinzugefügt.

### Spielerprofil und bestätigte Kennungen

Das Spielerprofil zeigt die vom Gameserver bestätigte Steam-ID separat schreibgeschützt an. Manuelle Kennungen und interne Notizen bleiben bearbeitbar und ersetzen diese Identität nicht. Ein gerade verbundener Spieler muss auch dann sofort ein Profil erhalten, wenn die Spielerliste bisher nur über WebSocket aktualisiert wurde.

Bei dem früheren Profil-404 mit „API-Fehler — Serververbindung prüfen“ gehören die Korrektur und das Update auf den Gameserver: beide JavaScript-Backends und das Dashboard-Frontend aktualisieren, den gesamten Dienst einschließlich Dashboard neu starten und den Browser mit Strg+F5 laden. Spieler-/Konfigurationsdaten bleiben erhalten. Ein Launcher-Build ersetzt diese Dateien nicht.
