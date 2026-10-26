# SkyMP Worlds - Live Rollout Checkliste

Status: local preview **0.2.0**, checked **22 October 2026**.
This is a live acceptance checklist, not a record that the actions below were deployed.
Local build/test evidence is in [STATUS.md](STATUS.md) and `local-builds/current/VALIDATION.json`.
Ziel: Erste funktionierende Test-Server sicher in die Live-Umgebung bringen.

## Bereits lokal abgeschlossen

- [x] Windows-Launcher/Frontend bauen und Backend prüfen (aktuell 25 Rust-Tests).
- [x] Mod-/Runtime-Paketierung, Versionskatalog, Download/Cache/Wiederherstellung lokal prüfen.
- [x] PHP-Konto-, Consent- und native Master-Routen in getrennten Test-Webroots prüfen.
- [x] Betreiberhandbuch DE/EN/RU und sechs getrennte Website-Pakete bereitstellen.
- [ ] Die neuesten Pakete tatsächlich hochladen und auf den Zielhosts abnehmen.
- [ ] Vollständigen Skyrim-/CEF-/Mehrspieler-Test durchführen.

Die folgenden Infrastrukturpunkte bleiben ohne neuen Live-Nachweis offen.
Für das aktuelle PHP-Hosting hat [PHP_HOSTING.md](PHP_HOSTING.md) Vorrang;
alte Registry-Schemaanweisungen dürfen die bestehende Dashboard-Identität nicht ersetzen.

## 1) Infrastruktur und DNS

- DNS zeigt korrekt auf eure Webserver fuer:
  - api.skymp-worlds.net
  - manage.skymp-worlds.net
  - servers.skymp-worlds.net
  - update.skymp-worlds.net
- HTTPS/TLS ist aktiv und gueltig auf allen Subdomains.
- PHP >= 8.1, MySQL/MariaDB, Webserver (Apache oder Nginx) sind produktiv konfiguriert.

## 2) API live schalten (api.skymp-worlds.net)

Dateien:
- web/api.skymp-worlds.net/config.php.example
- web/api.skymp-worlds.net/servers.sql
- web/api.skymp-worlds.net/migrations/2026-04-23_servers_table_upgrade.sql

Schritte:
1. Kopie erstellen: web/api.skymp-worlds.net/config.php
2. In config.php setzen:
   - DB_HOST
   - DB_NAME
   - DB_USER
   - DB_PASS
   - API_ACTIVE_INTERVAL_MINUTES (z. B. 5)
   - API_ALLOW_HEARTBEAT_REGISTRATION:
     - false fuer streng kontrollierte Registrierung nur via Dashboard
     - true wenn neue Server per Heartbeat auto-registriert werden sollen
   - API_HEARTBEAT_REGISTRATION_TOKEN:
     - leer lassen, wenn Auto-Registrierung aus ist
     - starkes Secret setzen, wenn Auto-Registrierung an ist
3. Datenbank vorbereiten:
   - Neu: servers.sql importieren
   - Bestehend: Upgrade-Migration ausfuehren
4. Endpoint-Tests:
   - GET /list.php liefert JSON
   - POST /heartbeat.php verarbeitet Heartbeat ohne 5xx

## 3) Manage-Dashboard live schalten (manage.skymp-worlds.net)

Dateien:
- web/manage.skymp-worlds.net/config.php.example
- web/manage.skymp-worlds.net/storage/mysql-schema.sql

Wichtig: Repo-Defaults sind bereits live-first gesetzt
- MANAGE_DEMO_LOGIN_ENABLED=false
- MANAGE_EMAIL_REGISTRATION_ENABLED=true
- MANAGE_EMAIL_VERIFICATION_REQUIRED=false

Schritte:
1. Kopie erstellen: web/manage.skymp-worlds.net/config.php
2. In config.php setzen:
   - MANAGE_PUBLIC_URL=https://manage.skymp-worlds.net
   - MANAGE_PUBLIC_SERVER_BROWSER_URL=https://servers.skymp-worlds.net/
   - MANAGE_API_HEARTBEAT_URL=https://api.skymp-worlds.net/heartbeat.php
   - MANAGE_API_SERVER_LIST_URL=https://api.skymp-worlds.net/list.php
   - MANAGE_HEARTBEAT_REGISTRATION_TOKEN:
     - muss mit API_HEARTBEAT_REGISTRATION_TOKEN uebereinstimmen, falls genutzt
3. Produktive Auth aktivieren:
   - Email: SMTP-Werte setzen
   - Optional Discord OAuth: Client ID, Secret, Redirect URI setzen
4. DB-Modus aktivieren (empfohlen):
   - MANAGE_DB_ENABLED=true
   - DB-Parameter setzen
   - mysql-schema.sql importieren
5. Login und CRUD testen:
   - Registrierung/Login funktionieren
   - Server erstellen/bearbeiten/loeschen funktioniert
   - API-Key Rotation/Widerruf funktioniert

## 4) Server Browser live pruefen (servers.skymp-worlds.net)

- Frontend kann API-Liste von https://api.skymp-worlds.net/list.php laden.
- CORS fuer list.php ist fuer eure Domains passend konfiguriert.
- Mindestens ein Test-Server erscheint sichtbar in der Liste.

## 5) Launcher live pruefen (Tauri)

Datei:
- launcher/src/App.tsx

Aktueller Live-Default ist vorhanden:
- Zentrale Registry ist fest `https://api.skymp-worlds.net/list.php`; eine alte gespeicherte Listen-URL wird nicht als Registry-Override verwendet.
- VITE_VERSION_JSON_URL -> https://update.skymp-worlds.net/version.json

Schritte:
1. Build lokal pruefen (launcher):
   - npm install
   - npm run build
2. Tauri-App lokal testen:
   - Serverliste laden
   - Join-Flow pruefen
3. Optionale Update-Metadaten fuer den Build konfigurieren; andere Spielserver ueber Direktverbindung erreichen. Die zentrale Registry ist kein frei einstellbares Benutzerfeld.

## 6) Update-Service live machen (update.skymp-worlds.net)

Dateien:
- web/update.skymp-worlds.net/version.json
- web/update.skymp-worlds.net/latest.json

Wichtig:
- `version.json` beschreibt die lokale Preview 0.2.0 und den Runtime-Katalog.
- `latest.json` hat ein leeres `platforms`-Objekt; ein signierter EXE-Selbstupdateablauf ist damit noch nicht freigegeben. Runtime-Katalogupdates sind davon getrennt.

Schritte:
1. version.json je Release aktualisieren:
   - version
   - releaseDate
   - windowsAssetName
   - downloadUrl
   - changelogUrl
2. latest.json produktiv befuellen:
   - echte version
   - echte Signaturen
   - echte Asset-URLs pro Plattform

## 7) Erste Test-Server integrieren

Empfohlenes Minimal-Heartbeat-Payload:
- masterKey
- name
- ip
- port
- maxPlayers
- online

Ablauf:
1. Server im Manage-Dashboard anlegen und API-Key erzeugen.
2. API-Key in den Game-Server integrieren.
3. Heartbeat in fixem Intervall senden.
4. In list.php und im Launcher Sichtbarkeit pruefen.
5. Join-Flow mit echter IP/Port testen.

## 8) Hardening vor public launch

- Secrets nicht im Repo, nur in produktiven config.php-Dateien.
- Rate-Limit/Firewall fuer heartbeat.php und login-Endpunkte.
- Logging/Monitoring aktiv:
  - HTTP 4xx/5xx
  - fehlgeschlagene Logins
  - Heartbeat-Fehler
- Regelmaessige DB-Backups.
- Optional CORS in list.php auf bekannte Origins einschranken.

## 9) Go/No-Go Kriterien

Go, wenn alle Punkte erfuellt sind:
- API, Manage, Browser, Update per HTTPS erreichbar
- Mindestens 1 echter Server sendet erfolgreich Heartbeats
- Server ist in API-Liste und Launcher sichtbar
- Login/Admin-Flows funktionieren ohne Demo-Account
- Keine Placeholder in produktiven Update-Metadaten

No-Go, wenn einer dieser Punkte offen ist:
- API DB-Konfiguration fehlt oder instabil
- Manage auth arbeitet nur mit Demo-Flow
- latest.json ist noch Placeholder und Auto-Update soll aktiv sein
- Test-Server erscheinen nicht stabil in list.php
