# PHP-Webhosting mit eigenständigen Subdomains

Dokumentationsstand: **26.10.2026**, Launcher **0.2.0**.

Für den optionalen Crashreport-Dienst siehe [Einrichtung auf Deutsch](CRASH_REPORTS_SETUP.de.md),
[English](CRASH_REPORTS_SETUP.en.md) oder [Русский](CRASH_REPORTS_SETUP.ru.md).
Berichte liegen im geschützten DEV-Ordner reports oder alternativ außerhalb der öffentlichen Webroots; der bestehende API- und
Verwaltungs- und Entwickler-Webroot benötigen jeweils ihre eigene aktualisierte ZIP-Datei.

Die Hauptseite und die sechs Subdomains behalten jeweils ihren eigenen Webroot.
Es ist kein gemeinsamer öffentlicher Projektordner und kein Node-Dienst erforderlich.
Die PHP-API spricht das Dashboard über HTTPS an und benötigt keinen Dateipfad zu dessen Ordner.

| Domain | Inhalt dieses Projektordners hochladen |
| --- | --- |
| `skymp-worlds.net` | `web/landing-page/` |
| `servers.skymp-worlds.net` | `web/servers.skymp-worlds.net/` |
| `manage.skymp-worlds.net` | `web/manage.skymp-worlds.net/` |
| `api.skymp-worlds.net` | `web/api.skymp-worlds.net/` |
| `update.skymp-worlds.net` | `web/update.skymp-worlds.net/` |
| `docs.skymp-worlds.net` | `web/docs.skymp-worlds.net/` |
| `dev.skymp-worlds.net` | `web/dev.skymp-worlds.net/` |

Jeweils den **Inhalt** hochladen: `index.html` bzw. `index.php` liegt direkt im
Webroot der Domain; `assets/` liegt daneben. Auf dem Webspace muss kein Ordner namens
`web` entstehen. Die tatsächlichen Webroot-Namen im Hostingpanel dürfen anders heißen.

`web/shared/worlds.css` ist die gemeinsame Quelldatei im Projekt. In **jeden** der sieben
Webroots gehört eine Kopie nach `assets/worlds.css`. Die Seiten verweisen bereits darauf.
Das Upload-Werkzeug kopiert sie automatisch. Ein öffentlicher `shared/`-Ordner ist unnötig.

## PHP-Webhosting und Gameserver-VPS

DEV, API, Verwaltung und die übrigen Webseiten laufen im PHP-Webhosting. Nur der
Gameserver läuft auf dem VPS. Die Webeinrichtung erfolgt im Hosting-Panel bzw.
per Dateimanager/FTP; VPS-SSH, Node und Änderungen an server-settings.json sind
für den Report-Dienst nicht nötig. Nach dem bereits erledigten Upload mit der
[DEV-Einrichtung ab Schritt 2](DEV_PORTAL_SETUP.de.md#2-report-ordner-im-dev-webroot-verwenden)
fortfahren. Der private Report-Pfad ist ein absoluter Dateisystempfad dieses
Webhosting-Kontos, kein VPS-Pfad und keine URL.

## Vorhandene Installation aktualisieren

Voraussetzungen: PHP **8.1+**, cURL, OpenSSL, PHP-Sitzungen und ein beschreibbarer
privater Datenordner. Das bisherige Dashboard kann weiterhin seine konfigurierte
MySQL-Datenbank oder seinen vorhandenen JSON-Speicher verwenden. Es gibt keine neue
Kontodatenbank und keine neue SQL-Migration für die Spielanmeldung.

1. Bestehende `config.php`, Konten-/Serverdaten und Datenbanken sichern.
2. Die passenden Dateien bzw. das jeweilige Domain-ZIP in dessen Webroot hochladen.
   `.htaccess` mit übertragen. Vorhandene **echte `config.php` und `storage/`-Daten behalten**.
   Die Pakete enthalten nur Beispielkonfigurationen und keine Benutzerzustände.
3. In `api.skymp-worlds.net/config.php` kann diese Einstellung ergänzt werden:

   ```php
   define('API_MANAGE_PUBLIC_URL', 'https://manage.skymp-worlds.net');
   ```

   Das ist bereits der Standard. Keine Nachbarordner oder Dateisystempfade eintragen.
4. In `manage.skymp-worlds.net/config.php` sind diese Werte vorgesehen:

   ```php
   define('MANAGE_GAME_MASTER_URL', 'https://api.skymp-worlds.net');
   define('MANAGE_GAME_AUTH_DIRECTORY', '/ABSOLUTER/PRIVATER/PFAD/skymp-game-auth');
   define('MANAGE_GAME_ALLOW_PRIVATE_RESOURCES', false);
   ```

   Den privaten Pfad durch einen beschreibbaren Ordner **außerhalb aller Webroots**
   ersetzen. Falls die Konstante fehlt, verwendet Apache als geschützten Standard
   `storage/game-auth/` im Dashboard. Der Zugriffsschutz von `storage/.htaccess` muss
   dann wirksam sein. Bei Nginx den privaten Pfad außerhalb des Webroots verwenden.
   Einen vorhandenen Datenordner beim Update beibehalten: Die numerischen Spiel-IDs
   in `state.json` und die Datei `master.key` müssen erhalten und zusammen gesichert werden.
5. Diese Adressen im Browser prüfen:
   - `https://manage.skymp-worlds.net/index.php`: bestehender Admin-Login.
   - `https://api.skymp-worlds.net/account`: Weiterleitung zu diesem Dashboard.
   - `https://api.skymp-worlds.net/health`: `ok: true`, `auth: true`, `demo: false`, `runtime: "php"`.
   - `https://api.skymp-worlds.net/list.php`: JSON-Liste; ohne aktive Server ist `[]` normal.
   - Private `config.php` und `storage/`-Dateien dürfen im Browser nicht abrufbar sein.

Auf Apache 2.4 leitet die API-`.htaccess` die nativen Routen an `native.php` weiter und
erhält den Authorization-Header für PHP-FastCGI. Bei deaktiviertem `mod_rewrite` den
Hoster diese Regeln freischalten lassen. `account.php` ist auch direkt erreichbar;
die Spielanmeldung benötigt die vollständigen Routen. Für einen vom Hoster verwalteten
Nginx müssen `/account` an `account.php`, `/health` und die nativen `/api/users/...`
sowie `/api/servers/...` an `native.php` geroutet werden; das bisherige
`/api/servers` bleibt bei `api/servers/index.php`.

## Eigenen Online-Server registrieren

1. Mit einem normalen Konto im Dashboard anmelden bzw. registrieren. Die bestehende
   E-Mail-/SMTP-Konfiguration gilt weiter. Demo-Anmeldungen und alte Demo-Sitzungen
   sind gesperrt. Es werden keine Standardpasswörter oder Demo-Server erzeugt.
2. Server mit seiner **öffentlichen** Spieladresse und UDP-Spielport anlegen;
   für den aktuellen Fork ist der lokale Standard `7777`. Status **active** wählen.
3. Beim Server **Launcher & Online-Anmeldung** öffnen. Die erreichbare HTTP(S)-Basis
   des Dateiservers und optional die URL zum `runtime-manifest.json` des Clientpakets
   speichern. Der aktuelle Fork verwendet lokal HTTP-Port `8080`. Im selben Formular
   können Beschreibung, bis zu acht Tags und Community-/Discord-Links hinterlegt werden.
   Logo und Banner liest der aktuelle Server automatisch aus `logo.png` und `banner.png`
   neben seiner `server-settings.json`; Bildadressen werden im Web nicht mehr eingetragen.
   Diese optionalen Angaben erscheinen öffentlich
   in der Launcher-Suche und den Serverdetails. Keine Schlüssel oder privaten Links eintragen.
4. Auf dem Spielserver die Browser-Ersteinrichtung oder **Einstellungen → Launcher-Anbindung**
   im Server-Adminpanel öffnen. Master-URL, öffentliche Server-ID, privaten Schlüssel,
   öffentliche Spieladresse und UDP-Port in die definierten Felder eintragen; **Online**
   wählen und die Modbereitstellung samt Clientkatalog konfigurieren. Speichern und
   den Spielserver neu starten. Die bestehende Konfiguration wird zusammengeführt;
   manuelles Einfügen eines JSON-Blocks entfällt. Das zentrale PHP-Dashboard selbst
   hat keinen Dateizugriff auf den entfernten Spielserver.

5. Server geordnet neu starten. Sein nativer Heartbeat wird anhand des Dashboard-
   Schlüssels geprüft. Er erscheint danach mit den Download-/Master-Adressen in der Liste.
6. Im Launcher Steam starten, den Servernamen suchen und **Verbinden** wählen. Der Spielserver prüft das Steam-Ticket und gegebenenfalls die Freigabe unter Whitelist. Nur wenn seine Antwort `accountLoginRequired` verlangt, zusätzlich die Legacy-Spielanmeldung mit einem Dashboard-Konto im Browser bestätigen. Benötigte Dateien werden vor dem Start vorbereitet; ein bloßes Webkonto ersetzt keine Steam-Freigabe.

Das Gateway behält den Fork-Routennamen `login-discord` aus Kompatibilitätsgründen;
die Anmeldung verwendet vorhandene Dashboard-Konten. Discord-OAuth wird dadurch nicht
eingerichtet. Ein Server mit zusätzlicher Discord-Gildenprüfung benötigt weiterhin
einen echten Discord-Anbieter. Spielsitzungen sind an genau einen Server und dessen
aktuellen privaten Schlüssel gebunden. Abmelden im Dashboard widerruft die Spiel-Token;
Schlüsselrotation/Sperre verhindern die Validierung alter Sitzungen.

Der Dateimanifest-Proxy folgt keinen Weiterleitungen und lässt im öffentlichen Betrieb
keine privaten/Loopback-Ziele zu. Nach dem Ändern der Download-Adressen ist ein neuer
Heartbeat erforderlich. Konten und Server werden direkt aus dem Dashboard gelesen;
API und Dashboard brauchen daher keine gemeinsame Ordnerhierarchie.

## Paket und lokale Prüfung

```powershell
./scripts/package-web.ps1 -OutputDirectory D:/GitHub/skymp-client-launcher/local-builds/web-php-NEW
node tests/php-master-smoke.mjs
```

Im Ausgabeordner liegen sieben unabhängige ZIP-Dateien, ohne Sammel-ZIP. Das zur Domain passende
ZIP entpacken und seinen Inhalt in deren Webroot kopieren. Die gesamte Projektstruktur
ist zusätzlich unter `web/` enthalten. Konfigurationen, Konten, Schlüssel und Datenbanken
sind ausgeschlossen. Der optionale Node-Referenzdienst ist nicht Teil des PHP-Uploads.

Der lokale PHP-Test startet zwei eigenständige Webroots auf Loopback mit ausschließlich
temporären Testkonten. Er prüft Anmeldung, CSRF, Serverbesitz, native API-Routen,
Sitzungen, Download-Metadaten, Manifest-Proxy und Abmeldung. `PHP_BINARY` kann auf eine
eigene PHP-Installation zeigen; lokal ist die geprüfte PHP-Version unter
`local-builds/tools/php-8.4.26/php.exe` verfügbar. Die Tests verändern keine Live-Daten.

Vor dem Verpacken synchronisiert `scripts/sync-web-assets.mjs` die gemeinsame Gestaltung
aus `web/shared/` in alle sieben Webroots. `design-system.css` enthält die Farben,
Schriftgrößen und Bedienelemente für Web und Launcher. Noto Sans und Noto Serif werden
mit deutschen und kyrillischen Zeichen lokal unter `assets/fonts/` mitgeliefert;
Google Fonts wird beim Seitenaufruf nicht mehr angefragt. Die Schriften und ihre Lizenz
gehören vollständig in jede Domain. Der gemeinsame Community-Link steht in
`web/shared/platform.json` und führt auf den SkyMP-Discord. Individuelle Serverprofile
behalten ihre eigenen Community-Adressen.

`docs.skymp-worlds.net.zip` ist ein eigenständiger statischer Webroot. Im Hostingpanel
die Subdomain mit eigenem DocumentRoot und HTTPS-Zertifikat anlegen und genau diesen
ZIP-Inhalt dort hochladen. Deutsch liegt unter `/`, Englisch unter `/en/index.html`
und Russisch unter `/ru/index.html`. Alle drei Fassungen sind vollständig lesbar,
auch ohne JavaScript. Der Sprachwechsel erhält das gewählte Kapitel. Suche und
Kopierknöpfe arbeiten lokal; weder Node noch PHP sind für diese Domain erforderlich.

Das Handbuch beschreibt Registrierung, Konfiguration, Netzwerk, Manifest v2,
Downloads, Legacy-Grenzen, externe Client-/SKSE-Kataloge, Online-Anmeldung,
Prüfabläufe, Updates und Fehlerdiagnose. Bestehende kompatible Server können den
Vertrag implementieren oder den verlinkten RealHartlMax-Fork verwenden.
Eine Kompatibilitätsgarantie oder automatische Migration wird nicht gegeben.
Die Quellen liegen unter `docs/SERVER_OWNER_GUIDE.{de,en,ru}.md` und werden beim
Verpacken durch `scripts/build-docs.mjs` statisch erzeugt und auf gültige
JSON-Beispiele sowie übereinstimmende Kapitelanker geprüft.

CSS-Verweise erhalten einen Inhalts-Hash, auch für importierte Stylesheets. Beim Update
des Designs deshalb die HTML-/PHP-Seiten **und** ihre `assets/`-Dateien hochladen, damit
Browser die neue Version laden. Nach einem älteren Upload gegebenenfalls einmal mit
`Strg+F5` neu laden. Die mitgelieferte `.htaccess` lässt statische HTML-Seiten bei
aktivem `mod_headers` erneut validieren; die privaten PHP-Anmeldeseiten behalten
ihre eigenen Cache-Regeln.

Der Integrationstest gegen die isolierte Kopie des echten Forks lautet:

```powershell
cd launcher
npm run test:fork -- --build D:/GitHub/skymp/build --workspace ../local-builds/fork-php-NEW --online --php-master
```

Das Runtime-Paket wird separat gemäß [CONNECTING.md](CONNECTING.md) erzeugt.
Für einen vollständigen Upload können die geprüfte EXE und der Versionskatalog
direkt in die ZIP der Update-Domain aufgenommen werden:

```powershell
./scripts/package-web.ps1 -OutputDirectory ./local-builds/web-NEW `
  -LauncherExecutable ./local-builds/current/SkyMP-Launcher-v0.2.0.exe `
  -RuntimeDirectory ./local-builds/current/client-runtime
```

Die EXE muss zur SHA-256 in `web/update.skymp-worlds.net/version.json` passen.
`update.skymp-worlds.net.zip` enthält dann zusätzlich `downloads/` und
`client-runtime/`; die übrigen vier ZIPs bleiben eigenständig. Für automatische
Clientupdates im Serverprofil einmalig
`https://update.skymp-worlds.net/client-runtime/catalog.json` hinterlegen.
Individuelle Server können weiterhin ihren eigenen Dateihost verwenden.

Ein vollständiger Test im laufenden Skyrim erfolgt anschließend mit der eigenen,
passenden Skyrim-/SKSE-Installation und dem registrierten Server.


## Bestehenden Heartbeat-Pfad aktualisieren

Die aktuelle native Serverintegration sendet POST /api/servers/<privaterSchlüssel>.
Das neue api/servers/index.php delegiert diesen Aufruf auch bei alten verschachtelten
Rewrite-Regeln an den Dashboard-Master. /heartbeat.php nutzt standardmäßig denselben
Master. Die separate alte Registry ist nur noch über API_LEGACY_HEARTBEATS=true
explizit für eine geplante Migration erreichbar. Für den einheitlichen Launcher
diese Option nicht aktivieren.

Bei einem 404 mit der Meldung Server is not registered yet API- und Manage-ZIP
zusammen aktualisieren, einschließlich .htaccess und native-heartbeat.php. Echte
config.php und private Daten behalten. Das Dashboard liest den letzten Heartbeat
jetzt aus demselben Speicher wie die Online-Anmeldung und zeigt den Grund einer
fehlenden Listung. Ein Serverpatch allein ersetzt dieses Webupdate nicht.
## Passwort vergessen und Mailversand

Die Anmeldeseite verlinkt auf **forgot-password.php**. Zurücksetzen erfolgt mit einem
einmaligen, 30 Minuten gültigen E-Mail-Link. Gespeichert wird nur dessen SHA-256-Hash
im bestehenden privaten Auth-Speicher. Nach dem Reset sind bisherige Web- und
Spielanmeldungen ungültig; Konten, Serverzuordnungen und numerische Spiel-IDs bleiben erhalten.
Für bestehende MySQL- oder JSON-Konten ist keine zusätzliche SQL-Migration erforderlich.

Nach dem Upload einmal an Webseite und Spiel neu anmelden: Ältere Sitzungen ohne
den neuen Passwortstand werden beim Update ungültig. Die Konten und Spiel-IDs bleiben erhalten.

Das Manage-ZIP enthält die unveränderten SMTP-Klassen von PHPMailer 6.12.0 einschließlich
Lizenz unter **PHPMailer/**. Eine vorhandene Composer-Installation hat Vorrang.
In der echten, nicht im ZIP enthaltenen **config.php** müssen die vorhandenen Werte
**MANAGE_PUBLIC_URL** (vollständige HTTPS-Adresse des Manage-Webroots),
**MANAGE_SMTP_HOST**, Port, Verschlüsselung (**tls** auf 587 oder **ssl** auf 465),
Benutzername, Passwort und **MANAGE_MAIL_FROM_ADDRESS** zum Hostingkonto passen.
Die vollständigen Konstanten stehen in **config.php.example**. Echte Zugangsdaten
beibehalten und nicht in öffentliche Dateien kopieren.

Danach mit einem eigenen Testkonto den Link aus der E-Mail öffnen, ein neues Passwort
speichern und dessen einmalige Verwendung prüfen. Der lokale Prüflauf verwendet
ausschließlich einen temporären SMTP-Empfänger auf Loopback und verschickt keine
Produktionsmails. Die unverschlüsselte Option **none** ist nur für Loopback-Testhosts erlaubt.

## Serverdaten und Erreichbarkeit

Servername und maximale Spielerzahl werden nur im Spielserver eingestellt und per authentifiziertem Heartbeat übernommen. Die Web-Registrierung bearbeitet diese Werte nicht und erzeugt keinen Heartbeat. Bekannte Server bleiben bei einem gemeldeten Stopp oder nach fünf Minuten ohne Heartbeat als offline sichtbar; die Listen aktualisieren sich alle 30 Sekunden. Niemals gemeldete Server bleiben bis zum ersten vollständigen Heartbeat unsichtbar.

## Entwicklerbereich und Crashreports

`dev.skymp-worlds.net` hat einen eigenen Webroot und ein eigenes ZIP. Reports
werden über die bestehende API an DEV weitergeleitet und im geschützten Ordner
reports nach UTC-Jahr/Monat/Tag gespeichert. Alternativ bleibt ein privater Pfad
außerhalb aller Webroots möglich. Die Anmeldung
verwendet ausdrücklich freigegebene Verwaltungskonten. Dafür werden die ZIPs
für DEV, API und Verwaltung benötigt; bestehende private Konfigurationen bleiben erhalten.

Einrichtung: [DE](DEV_PORTAL_SETUP.de.md), [EN](DEV_PORTAL_SETUP.en.md),
[RU](DEV_PORTAL_SETUP.ru.md). Es ist keine Launcher- oder Server-Neukompilierung erforderlich.


## Discord-Anmeldung und Launcher-Einstellungen

Die optionale Discord-Webanmeldung ist mit einem privaten Client-Secret auf dem PHP-Webhosting nutzbar. Bestehende Konten werden ausdrücklich nach der Passwortanmeldung verknüpft. Einrichtung: [Deutsch](DISCORD_SETUP.de.md), [English](DISCORD_SETUP.en.md), [Русский](DISCORD_SETUP.ru.md). Die öffentliche App-ID für den separaten Launcher-Aktivitätsstatus ist bereits hinterlegt. Keine Secrets in den Launcher aufnehmen.

Neue Konto-, Interface- und Spieleinstellungen: [DE / EN / RU](LAUNCHER_SETTINGS.md). Der neue Server-Ressourcenbereich erfordert beide Backends und das Dashboard-Frontend aus dem Server-Fork; hier wird nur der Launcher gebaut.

## Launcher-Release und Webpakete getrennt halten

Ein GitHub-Release des Launchers besteht nur aus EXE, portablem ZIP und `SHA256SUMS`; siehe [RELEASING.md](RELEASING.md). Die sieben Domain-ZIPs gehören ausschließlich in ihre jeweiligen Webroots. Eine GitHub-Veröffentlichung aktualisiert weder `version.json` noch Runtime-Kataloge im Hosting automatisch. Name und Spielerlimit werden nur auf dem Gameserver gesetzt; das Web übernimmt sie aus authentifizierten Heartbeats.

## Launcher 0.2.1: Webkonto und offizielle Versionen

Die Kontoverbindung in den Launcher-Einstellungen benötigt die passenden API- und Manage-Pakete. Manage liefert launcher-login.php, includes/launcher-auth.php und den erweiterten native-master.php; API leitet /api/users/launcher/status, /me und /logout an denselben privaten Kontenspeicher weiter. Bestehende config.php und Kontendaten erhalten. Die Browserbestätigung erzeugt eine separate acht Stunden gültige Profilsitzung; sie gewährt keine Spiel- oder Verwaltungsrechte. Nach Passwortänderung oder Ablauf ist eine neue Anmeldung erforderlich.

Der neue Launcher prüft zusätzlich veröffentlichte stabile GitHub-Releases. Ältere EXEs lesen weiterhin version.json bzw. ihre Kanalkataloge und bekommen die neue Hinweisoberfläche erst nach Aktualisierung. Nach einem offiziell veröffentlichten Release node scripts/sync-launcher-release.mjs v0.2.1 ausführen und die erzeugten Update-Webdateien übertragen. Ein Tag allein oder eine nur lokal gebaute EXE löst keine offizielle Versionsmeldung aus. Die vorbereiteten Kataloge zeigen bis dahin auf das tatsächlich veröffentlichte v0.2.0-GitHub-Asset.
