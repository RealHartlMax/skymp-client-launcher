# Entwicklerbereich im PHP-Webhosting einrichten

Dokumentationsstand: **26.10.2026**, Launcher **0.2.0**.

Anleitung für die Konfiguration nach dem Upload der drei Domain-ZIPs.

## Was läuft wo?

| Bereich | Hosting und Aufgabe |
| --- | --- |
| dev.skymp-worlds.net | PHP-Webhosting: Entwickleransicht und privater Report-Speicher |
| api.skymp-worlds.net | PHP-Webhosting: Launcher-Anfragen und Weiterleitung der Reports an DEV |
| manage.skymp-worlds.net | PHP-Webhosting: bestehende Konten und Entwicklerfreigabe |
| Gameserver | VPS: SkyMP, Spielport und Bereitstellung der Spiel-/Moddateien |

Die folgenden Schritte erfolgen im **Hosting-Panel und Dateimanager bzw. per FTP/SFTP des Webhostings**.
Für DEV, API und Verwaltung werden weder SSH auf dem VPS noch ein Node-Dienst benötigt.
Der VPS-Gameserver und seine server-settings.json werden für die Report-Einrichtung nicht verändert.

## 1. Die ZIPs sind bereits hochgeladen

Für die geschützte reports-Ablage das aktualisierte DEV-ZIP hochladen. Bereits eingerichtete API- und MANAGE-Dateien können bleiben. Jeder Domain-Ordner ist ein eigener Webroot.
config.php und assets/ liegen jeweils direkt darin. Es werden keine zusätzlichen Unterordner
namens dev/, api/ oder manage/ unter der Hauptseite angelegt. CSS und Schriften sind bereits enthalten.

| Datei im Hosting-Dateimanager | Verwendung |
| --- | --- |
| Webroot von DEV / config.php | Neue Entwickler-Konfiguration |
| Webroot von MANAGE / config.php | Bestehende Verwaltungs-Konfiguration ergänzen |
| Webroot von API / config.php | Bestehende API-Konfiguration ergänzen |

Die Bezeichnungen DEV, MANAGE und API sind hier nur Orientierungshilfen, keine tatsächlichen Ordnernamen.
Vorhandene Konten, Datenbanken und config.php-Dateien erhalten. Neue Einstellungen innerhalb des
vorhandenen PHP-Blocks ergänzen, also vor einem eventuell vorhandenen schließenden PHP-Tag.
Eine bereits vorhandene define-Zeile bearbeiten, keine gleichnamige Konstante doppelt anlegen.
Alle drei Domains benötigen HTTPS und PHP 8.1+. Die API benötigt die PHP-Erweiterung cURL.

## 2. Report-Ordner im DEV-Webroot verwenden

Die Ablage liegt jetzt im Ordner **reports direkt im Webroot von dev.skymp-worlds.net**.
In config.php wird dafür __DIR__ . '/reports' verwendet. __DIR__ ermittelt den richtigen
absoluten Hosting-Pfad automatisch; /dev.skymp-worlds.net/reports ist häufig nur die Anzeige
im FTP-Dateimanager und muss kein gültiger absoluter PHP-Pfad sein. Keine Domain-URL eintragen.
PHP legt Jahr/Monat/Tag/Bericht-ID automatisch an und benötigt Schreibrechte für reports.
Die mitgelieferten Dateien reports/.htaccess und reports/index.php ebenfalls hochladen.

Jede Datendatei erhält eine PHP-Schutzhülle und die Endung .php. Ein direkter Webaufruf
beendet sich ohne Berichtsdaten mit HTTP 404; Apache sperrt den Ordner zusätzlich über .htaccess.
Downloads erfolgen nach der Entwickleranmeldung und liefern die ursprüngliche JSON-, Log- oder
Dump-Datei. PHP muss auch in Unterordnern ausgeführt werden. Der Aufruf von
https://dev.skymp-worlds.net/reports/ muss 403 oder 404 liefern, keine Dateiliste.

Ein bestehender absoluter privater Pfad außerhalb aller Webroots kann alternativ unverändert
weiterverwendet werden. Alte Rohberichte mit index.json und report.key dort belassen und sichern;
nicht direkt in den öffentlichen reports-Ordner kopieren. Andere öffentliche Speicherordner
werden weiterhin abgelehnt. Webhosting und VPS teilen keinen lokalen Ordner.

## 3. Zwei getrennte Geheimnisse zuordnen

Zwei verschiedene zufällige Werte mit jeweils mindestens 32 Zeichen verwenden, beispielsweise
je 64 zufällige Hexzeichen aus einem Passwortmanager. Bereits eingerichtete passende Werte beibehalten.

| Wert | Muss in diesen beiden Dateien identisch sein |
| --- | --- |
| Anmeldegeheimnis | DEV: DEV_SSO_SECRET und MANAGE: MANAGE_DEV_SSO_SECRET |
| Upload-Geheimnis | DEV: DEV_CRASH_PROXY_TOKEN und API: API_CRASH_PROXY_TOKEN |

ANMELDE_GEHEIMNIS und UPLOAD_GEHEIMNIS unten sind erklärende Platzhalter, keine fertigen Schlüssel.
Die beiden echten Geheimnisse müssen verschieden sein. Es sind weder Steam-API-Keys noch private Gameserver-Schlüssel.

## 4. DEV / config.php erstellen oder ergänzen

Falls noch nicht vorhanden: im Webroot von dev.skymp-worlds.net die Datei config.php.example
nach config.php kopieren. Vorhandene Werte ändern:

```php
define('DEV_PUBLIC_URL', 'https://dev.skymp-worlds.net');
define('DEV_MANAGE_PUBLIC_URL', 'https://manage.skymp-worlds.net');
define('DEV_SSO_SECRET', 'ANMELDE_GEHEIMNIS');
define('DEV_CRASH_DIRECTORY', __DIR__ . '/reports');
define('DEV_CRASH_PROXY_TOKEN', 'UPLOAD_GEHEIMNIS');
```

## 5. MANAGE / bestehende config.php ergänzen

Im eigenständigen Webroot von manage.skymp-worlds.net folgende Konstanten setzen bzw. vorhandene Zeilen bearbeiten:

```php
define('MANAGE_DEV_PUBLIC_URL', 'https://dev.skymp-worlds.net');
define('MANAGE_DEV_SSO_SECRET', 'ANMELDE_GEHEIMNIS');
define('MANAGE_CRASH_REPORT_ADMINS', ['DEINE_KONTO_ID']);
```

Die interne Verwaltungs-Konto-ID verwenden, keine E-Mail oder Steam-ID. Falls unbekannt:
im vorhandenen Verwaltungskonto anmelden und https://manage.skymp-worlds.net/crash-reports.php
öffnen. Bei fehlender Entwicklerfreigabe zeigt die Zugriffsverweigerung die eigene Konto-ID.
Diese ID in MANAGE_CRASH_REPORT_ADMINS aufnehmen. Nur aufgeführte Konten erhalten Entwicklerzugang.

Alte MANAGE_CRASH_DIRECTORY-/MANAGE_CRASH_PROXY_TOKEN-Einstellungen gehören zum früheren
Report-Empfänger innerhalb der Verwaltung. Für den neuen DEV-Bereich sind DEV_CRASH_DIRECTORY
und DEV_CRASH_PROXY_TOKEN maßgeblich. MANAGE_CRASH_REPORT_ADMINS bleibt die aktuelle Freigabeliste.
Bestehende Verwaltungs-/Datenbank-/Mail-Einstellungen und API_MANAGE_PUBLIC_URL nicht ersetzen.

## 6. API / bestehende config.php ergänzen

Im eigenständigen Webroot von api.skymp-worlds.net setzen:

```php
define('API_CRASH_PUBLIC_URL', 'https://dev.skymp-worlds.net');
define('API_CRASH_PROXY_TOKEN', 'UPLOAD_GEHEIMNIS');
```

API_MANAGE_PUBLIC_URL bleibt https://manage.skymp-worlds.net. Diese bestehende Verbindung
ist für Konten und Serververwaltung zuständig. Der Launcher sendet weiter an
https://api.skymp-worlds.net/crash-reports.php; die API übergibt die Daten intern per HTTPS an
https://dev.skymp-worlds.net/crash-ingest.php. Ein Launcher- oder Gameserver-Neubuild ist dafür nicht nötig.

## 7. Anmeldung und lokalen Export prüfen

1. https://dev.skymp-worlds.net/ öffnen und **Mit SkyMP-Konto anmelden** wählen.
2. Mit dem vorhandenen Verwaltungskonto anmelden. Ein signiertes Einmalticket wird per POST an DEV übertragen.
3. Die Berichtsübersicht muss erscheinen. Die Sitzung gilt 15 Minuten; danach erneut anmelden.
   Entfernte Freigaben sperren neue Anmeldungen sofort und bestehende Sitzungen spätestens nach 15 Minuten.
4. **Lokalen Bericht importieren** wählen und report.json aus dem Launcher-Export auswählen.
   Ein vorhandenes crash.dmp benötigt eine separate Auswahl und Freigabe. Wiederholungen erzeugen keinen doppelten Bericht.
5. Status ändern, Bericht herunterladen und abmelden. Nicht freigegebene Verwaltungskonten haben keinen Zugriff.

Bei „noch nicht eingerichtet“ zeigt DEV die fehlenden Einstellungen einzeln an: config.php, SSO-Geheimnis, Webadressen oder Report-Speicher. Unter login.php?setup=1 lassen sich die Prüfungen auch bei fertiger Einrichtung anzeigen. Die Prüfung erkennt keine abweichenden Geheimnisse auf anderen Domains; diese Werte müssen paarweise identisch sein.
Bei Zugriffsverweigerung in MANAGE die Konto-ID prüfen. Bei abgelaufener/ungültiger Anmeldung die
beiden SSO-Geheimnisse, HTTPS-Adressen, Browser-Cookies und den verfügbaren privaten Speicher prüfen.
Bei Uploadfehlern zusätzlich die beiden Upload-Geheimnisse, API_CRASH_PUBLIC_URL und cURL prüfen.
Keine Geheimnisse in Logauszüge übernehmen.

## 8. Report-Ablage und Größenlimits

DEV speichert anhand der UTC-Empfangszeit unter reports/Jahr/Monat/Tag/Bericht-ID. Im Standardordner heißen die geschützten Dateien index.json.php, report.key.php, report.json.php, contact.json.php, logs/*.log.php und attachments/crash.dmp.php. Die PHP-Schutzhülle wird beim Download entfernt. Bei einem alternativen privaten Speicher außerhalb des Webroots bleibt das bisherige Rohformat erhalten.
Eine Datei auf dem eigenen PC wird nur durch Auswahl/Upload übertragen, nicht durch Angabe ihres lokalen Pfads.
Im Launcher müssen Basisbericht und optionaler Dump freigegeben werden. Die Dump-Aufzeichnung muss
bereits **vor** dem nächsten Spielstart aktiviert sein; sie erzeugt keinen Dump eines beendeten Prozesses.

Basisbericht maximal 1 MiB, Dump maximal 128 MiB und höchstens das kleinste Hosting-Limit.
PHP-Einstellungen für API und DEV bei Bedarf im Hosting-Panel anpassen. Eine optionale .user.ini
nur verwenden, wenn der Hoster sie unterstützt:

```ini
upload_max_filesize = 128M
post_max_size = 130M
max_execution_time = 180
max_input_time = 180
```

Eine PHP-Erweiterung oder ein vom Tarif begrenztes Upload-Limit kann nur der Hoster freigeben.
Ein kleineres Dump-Limit verhindert nicht den Basisbericht. Apache nutzt die mitgelieferten .htaccess-Regeln.
Bei Nginx muss der Anbieter gleichwertige Sperren für config.php, includes/ und setup/ aktivieren.

## 9. Wartung ohne VPS oder SSH

In der Berichtsübersicht **Abgelaufene Berichte bereinigen** wählen. Zusätzlich werden die
Aufbewahrungsfristen beim Empfang neuer Basisberichte angewendet. Ein Cronjob ist für die Einrichtung
nicht erforderlich. Standard: 2 GiB insgesamt, 10.000 Berichte, 20 neue Berichte je Quelle/Stunde,
90 Tage für Berichte und 30 Tage für Dumps. Werte stehen in DEV / config.php.example.

Optional, falls der Webhosting-Tarif PHP-Aufgaben anbietet: im Hosting-Panel eine tägliche
PHP-Aufgabe für tools/cleanup-crash-reports.php im DEV-Webroot einrichten. Den vom Panel
verlangten Skriptpfad und die passende PHP-Version wählen. Dies ist kein Auftrag für den VPS.
Die Datei nicht als URL aufrufen; sie erlaubt ausschließlich einen PHP-CLI-Aufruf durch die Hosting-Aufgabe.

Vorhandene private Berichte vollständig einschließlich index.json und report.key sichern und übernehmen.
Die Webseiten-ZIPs enthalten diese Daten nicht. Auf demselben Webhosting kann DEV das bisherige geeignete
private Report-Verzeichnis weiterverwenden. Analyse mit passenden PDB-Symbolen erfolgt lokal.
Die hier beschriebenen Konfigurationsschritte wurden lokal geprüft; deine tatsächlichen Hosting-Pfade,
Zugriffsrechte und HTTPS-/PHP-Einstellungen müssen im Hosting-Panel passend gesetzt werden.

Die Einrichtung betrifft PHP-Webhosting bzw. die genannten Launcher-Einstellungen. Launcher-, Server- und native Runtime-Pakete bleiben getrennt. [Dokumentationsübersicht](README.md) · [Launcher-Release](RELEASING.md).
