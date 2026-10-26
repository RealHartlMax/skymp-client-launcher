# Absturzberichte für Launcher und Spiel

Stand: 25.10.2026. **Lokal implementiert; nicht veröffentlicht.**
Die Prozessüberwachung in `launcher/src-tauri/src/game_session.rs` liefert
Spiel-PID, Laufzeit, Operation-ID und Windows-Exitcode. `crash_reports.rs` sammelt
und verwaltet die Berichte, `crash_capture.rs` enthält den optionalen separaten
Windows-Helfer. `CrashReports.tsx` stellt Dialog und Berichtsübersicht bereit.

Einrichtung: [Deutsch](CRASH_REPORTS_SETUP.de.md),
[English](CRASH_REPORTS_SETUP.en.md), [Русский](CRASH_REPORTS_SETUP.ru.md).
Der Upload bleibt bis zur privaten Konfiguration auf dem Webspace deaktiviert.
Die folgenden Abschnitte beschreiben den Aufbau einschließlich der Grenzen:
Basisbericht bis **1 MiB als JSON**, Dump separat bis zum kleinsten bekannten
Hosting-Limit und höchstens 128 MiB. Die Dump-Aufzeichnung ist standardmäßig
ausgeschaltet; ihre Aktivierung und die Upload-Freigabe sind getrennt.
Passende Symbole und ein echter Skyrim-Test bleiben für die Spielanalyse nötig.

## Ablauf für Nutzer

1. Bei einem erkannten Skyrim-Absturz öffnet der Launcher einen Dialog in
   DE/EN/RU. Ein normaler Spielausstieg ist kein Absturz. Ein früher Ausstieg
   ohne Fehlercode bleibt ein unklarer Spielabbruch; ein Downloadfehler oder
   eine fehlgeschlagene Prozessabfrage wird separat bezeichnet.
2. Der Dialog zeigt Fehler, enthaltene Daten und Gesamtgröße. Aktionen:
   **Bericht senden**, **Lokal speichern**, **Schließen**. Ein optionaler Text
   beschreibt, was unmittelbar vor dem Absturz passiert ist.
3. Ein bereinigter Basisbericht kann gesendet werden. Ein vorhandenes
   Speicherabbild benötigt eine eigene, standardmäßig deaktivierte Auswahl.
   Speicherabbilder lassen sich nicht zuverlässig wie Textprotokolle bereinigen.
4. Der Upload läuft im Hintergrund und liefert eine Bericht-ID zum Kopieren.
   Bei einem Netzfehler bleibt der bereits freigegebene Bericht lokal und kann
   erneut gesendet werden. Derselbe Bericht darf dabei nicht doppelt entstehen.
5. Stürzt der Launcher selbst ab, erscheint sein Dialog erst beim nächsten
   Start. Dafür müssen die Sitzungsdaten vorher auf die Platte geschrieben
   werden. Ein liegen gebliebener Sitzungsmarker allein beweist keinen Absturz:
   auch Stromausfall, Neustart und manuelles Beenden sind möglich.

Die lokale Sammlung und die Übertragung sind getrennte Schritte. Es gibt
keinen Upload vor der Freigabe. Ein später gewünschtes dauerhaftes Einverständnis
für Basisberichte muss gesondert erklärt und widerrufbar sein.

## Inhalt des Basisberichts

| Bereich | Benötigte Informationen |
| --- | --- |
| Zuordnung | Schema-Version, zufällige Bericht-/Sitzungs-ID, UTC-Zeit des Vorfalls und separat die serverseitige Empfangszeit, Sprache, Ereignistyp: Spielabsturz, Launcher-Absturz, unklarer Spielabbruch oder Verbindungsfehler. |
| Versionsstand | Launcher-Version und eindeutige Build-ID; Skyrim- und SKSE-Version; Runtime-Paket-ID und Manifest-Prüfsumme. Nur `0.2.0` reicht bei mehreren lokalen Builds nicht zur Zuordnung. |
| Absturz | Windows-Exitcode; sofern ein Dump/Crash-Handler vorliegt: Exceptioncode, Zugriffstyp, fehlerhaftes Modul, Adresse relativ zum Modul (RVA), Thread und ausgewerteter Aufrufstapel. Fehlende Werte bleiben ausdrücklich unbekannt. |
| Native Dateien | Namen, Dateiversionen und SHA-256 der relevanten geladenen DLLs, bei eigenen DLLs PDB-GUID und Alter. Tatsächlich geladene Dateien von lediglich installierten Dateien unterscheiden. Absolute Benutzerpfade entfernen. |
| Ablauf | Zeitpunkt des Starts, Laufzeit und letzte bestätigte Phase, etwa Dateiprüfung, Start oder Anmeldung. Menü/Weltbeitritt nur melden, wenn dafür ein echtes Signal vorliegt; nicht aus der Laufzeit ableiten. |
| Server | Öffentliche Server-ID, sofern vorhanden, und öffentliche Server-/Protokollversion. Keine privaten Schlüssel oder Anmeldedaten. Ein Crashbericht verleiht keine Server-Adminrechte. |
| Installation | Ergebnis der letzten Größen-/Hashprüfung, fehlende oder abweichende relative Dateinamen, aktive Plugin-/Ladereihenfolge innerhalb festgelegter Größenlimits. Keine vollständige Spielinstallation hochladen. |
| Umgebung | Windows-Version und Architektur, CPU-Modell, RAM gesamt/frei, GPU-Modell, Grafiktreiberversion. Keine Hardware-Seriennummern, MAC-Adressen oder vollständige Prozessliste. |
| Protokolle | Begrenzte Ausschnitte aus Launcher-, SKSE- und SkyrimPlatform-Protokollen aus derselben Sitzung. Vorhandensein, Kürzung und fehlgeschlagene Bereinigung kennzeichnen. |
| Nutzerangaben | Freiwillige Beschreibung und optionaler Kontakt für Rückfragen; Kontakt getrennt von technischen Such-/Gruppierungsdaten speichern. |

Die Sammlung verwendet eine feste Dateiliste und begrenzte Zeit-/Größenausschnitte.
Passwörter, Steam-Tickets, Sitzungstokens, Cookies, private Master-/API-Schlüssel
und Zugangsdaten aus URL-Parametern dürfen nicht in den Basisbericht gelangen.
Benutzerverzeichnisse werden etwa zu `%USERPROFILE%` normalisiert.
Konfigurationsdateien werden nicht ungefiltert angehängt. Für die Diagnose ist
eine Steam-ID normalerweise nicht erforderlich; auch Screenshots, Spielstände
und Chat-Inhalte gehören nicht zur automatischen Sammlung.

## Minidump und passende Symbole

Für native Speicherfehler ist ein Minidump häufig entscheidend. Die bisherigen
Textprotokolle lieferten nur `0xC0000005`; erst der aktuelle Dump erlaubte die
Zuordnung zu `SkyrimPlatformImpl.dll + 0x180D37` und dem Threadpool-Fehler.

Ein Dump muss erfasst werden, bevor der abgestürzte Prozess endgültig beendet
ist. Ein Dialog, der erst nach dem Prozessende erscheint, kann diesen Zustand
nicht nachträglich auslesen. Die Erfassung braucht einen passenden Crash-Handler
und möglichst einen separaten Helferprozess; Microsoft empfiehlt diesen für
`MiniDumpWriteDump`, insbesondere bei instabilen Prozessen. Einen Debugger nicht
ungeprüft bei allen Nutzern anhängen: Er kann das Startverhalten beeinflussen.

Minidumps können Speicherinhalte mit persönlichen Daten und Tokens enthalten.
Deshalb: eigene Upload-Freigabe, Hinweis auf diese Inhalte, Zugriff ausschließlich
für berechtigte Entwickler und keine öffentliche Downloadadresse. Kein
vollständiger Prozessdump als Standardeinstellung. Bei zu großer Datei bleibt
der Basisbericht trotzdem sendbar.

Zu **jedem ausgelieferten nativen Build** werden dessen originale DLLs und PDBs
intern unveränderlich archiviert, zugeordnet über Hash und PDB-GUID/Alter.
Die Nutzer müssen keine PDBs hochladen. Ein später erzeugtes PDB eines anderen
Builds ist kein Ersatz für die passenden Symbole. Die Auswertung der Dumps
erfolgt lokal oder auf einem getrennten Analyse-Rechner, nicht im PHP-Upload.

## PHP-Webhosting und Ordner

Der feste Endpunkt ist
`https://api.skymp-worlds.net/crash-reports.php`. Die API leitet intern an den
eigenständigen Entwicklerbereich **dev.skymp-worlds.net** weiter. Dessen
Datenspeicher liegt standardmäßig im **geschützten DEV-Ordner reports**. In DEV/config.php:

```php
define('DEV_CRASH_DIRECTORY', __DIR__ . '/reports');
```

PHP-Schutzhüllen beenden direkte Webaufrufe mit HTTP 404; Apache sperrt zusätzlich
über .htaccess. Angemeldete Downloads liefern die ursprünglichen Dateien.
Ein bestehender privater Speicher **außerhalb aller öffentlichen Webroots** bleibt
alternativ mit dem bisherigen Rohformat kompatibel. Standardablage:

```text
reports/
  2026/
    10/
      24/
        <zufällige-Bericht-ID>/
          report.json.php
          logs/
            launcher.log.php
            skse64.log.php
            skyrim-platform.log.php
            SkyrimPlatformImpl.log.php
          attachments/
            crash.dmp.php       # nur bei gesonderter Freigabe
```

Jahr/Monat/Tag werden anhand der **serverseitigen Empfangszeit in UTC** gebildet.
Die vom Client gemeldete Crashzeit wird separat gespeichert. Pfade und Bericht-ID
bestimmt ausschließlich der Server; der Client kann keine Ordnernamen vorgeben.
Damit verändern falsche PC-Uhren oder manipulierte Uploads nicht den Speicherpfad.

Der Basisbericht ist auf 1 MiB JSON begrenzt; optionale Dumps haben ein
separates, konfigurierbares Limit. Die tatsächlichen Hosting-Limits prüfen:
Der bereits vorhandene lokale Spieldump ist
bereits etwa 74 MiB groß. `upload_max_filesize`, `post_max_size`, Webserver-Limit
und Zeitlimits müssen zusammenpassen. Zu große Dumps dürfen den Basisbericht
nicht blockieren.

Der Empfänger prüft Schema, erlaubte Dateitypen, tatsächliche Größen und
Prüfsummen; begrenzt Uploadrate, Anzahl und gesamten Speicherverbrauch; verwendet
atomare Speicherung und eine Bericht-ID zur Wiederholung ohne Duplikate.
Hochgeladene Inhalte niemals als Code ausführen oder ungeprüfte Archive entpacken.
Die feste PHP-Schutzhülle beendet sich vor dem Inhalt mit __halt_compiler(). Ein im
Launcher eingebauter geheimer API-Schlüssel ist kein wirksamer Uploadschutz.
Auch ohne erfolgreiche Spielanmeldung muss ein Bericht möglich bleiben.

## Anzeige für Entwickler

Der geschützte Bereich unter **dev.skymp-worlds.net** ist von der Verwaltung
normaler Serverbesitzer getrennt. Bestehende Verwaltungskonten erhalten nur bei
ausdrücklicher Entwicklerfreigabe Zugang. Ein signiertes Einmalticket wird per
POST an DEV übertragen; die Entwicklersitzung gilt 15 Minuten. API, Verwaltung
und DEV sind drei unabhängige Webroots mit eigenen ZIPs. DEV enthält eine
Berichtsübersicht, Statusverwaltung, geschützte Downloads und einen Import
lokaler Exporte. Einrichtung: [DE](DEV_PORTAL_SETUP.de.md),
[EN](DEV_PORTAL_SETUP.en.md), [RU](DEV_PORTAL_SETUP.ru.md).

Die Tagesordner genügen zur Ablage. Zum Wiederfinden gibt es zusätzlich
eine private, gesperrt und atomar geschriebene `index.json`: Bericht-ID,
Empfangszeit, Ereignistyp, Build-/Runtime-Version, öffentliche Server-ID,
Fehlersignatur, Status, erste/letzte Sichtung und Anzahl ähnlicher Fehler.

Gleiche Fehler werden anhand von Modul-Build-ID, Exceptioncode, relativer
Fehleradresse und optional normalisierten Stackframes gruppiert. Absolute
Speicheradressen sind durch wechselnde Ladeadressen ungeeignet. Den aktuellen
Threadpool-Fehler könnte man so über mehrere Nutzer und Tage zusammenführen.
Unbekannte Signaturen bleiben sichtbar und werden nicht als identisch behauptet.

Berichte und optionale Dumps haben getrennte, konfigurierbare Aufbewahrungsfristen
von standardmäßig 90 bzw. 30 Tagen. Diese Werte vor dem Betrieb an den verfügbaren
Speicher und vorgesehenen Support anpassen.
Die Rückmeldung im Launcher besteht aus Bericht-ID und Uploadstatus; sie gibt
keinen öffentlichen Zugriff auf Bericht oder Dump frei.

## Umgesetzter Ablauf

1. Basisbericht, Dialog, lokaler Export und begrenzter HTTPS-Upload mit PHP.
2. Geschützte Webansicht mit Suche, Fehlersignaturen und Löschung.
3. Separat freigegebene Minidumps mit eigenem Helfer und Symbolarchiv.
4. Launcher-Selbstabstürze beim nächsten Start und erneuter Upload bereits
   freigegebener Berichte nach einem Netzwerkfehler.

Die vorhandene Spiel-Runtime bleibt bis zu einem eigenen nativen Build unverändert.
Der neue Launcher enthält den Diagnosehelfer; er behebt den bereits gefundenen
Threadpool-Fehler der externen Spiel-DLL nicht. Launcher-Panics werden beim
nächsten Start angeboten; sonstige verlorene Launcher-Sitzungen werden als
unklarer Abbruch gekennzeichnet. Ein Aufrufstapel wird noch nicht automatisch
symbolisiert: Die Rohdaten im optionalen Minidump werden mit den passenden
PDBs lokal ausgewertet. Es wird kein Dump nachträglich aus einem bereits
beendeten Prozess konstruiert.

Quellen: [Microsoft: MiniDumpWriteDump](https://learn.microsoft.com/en-us/windows/win32/api/minidumpapiset/nf-minidumpapiset-minidumpwritedump),
[Microsoft: Minidump-Dateien und Symbole](https://learn.microsoft.com/en-us/windows/win32/debug/minidump-files),
[PHP: Upload-Limits](https://www.php.net/manual/en/ini.core.php#ini.upload-max-filesize).
