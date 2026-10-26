# Discord für SkyMP Worlds

Dokumentationsstand: **26.10.2026**, Launcher **0.2.0**.

Der Launcher nutzt die öffentliche Application-ID `1496895150322876555` für den optionalen Aktivitätsstatus der Discord-Desktop-App. Dafür wird kein OAuth-Link, Bot-Token oder Client-Secret im Launcher benötigt. Einstellungen → Spiel → Discord-Aktivitätsstatus: Anzeigen, Details verbergen oder Deaktiviert. Standard: deaktiviert. Streamer-Modus verbirgt Serverdetails auch bei eingeschaltetem Status.

## Web-Anmeldung und Kontoverknüpfung

1. Im Discord Developer Portal bei derselben Anwendung unter **OAuth2 → Redirects** exakt `https://manage.skymp-worlds.net/oauth/discord-callback.php` eintragen.
2. Das neue, eigenständige `manage.skymp-worlds.net.zip` in den Dokumentenordner dieser Subdomain entpacken. Bestehende `config.php`, Datenbank, `storage/` und Dienstgeheimnisse beibehalten.
3. In der privaten `config.php` diese drei Einstellungen ergänzen bzw. vorhandene leere Werte ersetzen: `MANAGE_DISCORD_CLIENT_ID` = `1496895150322876555`; `MANAGE_DISCORD_CLIENT_SECRET` = das Secret aus dem Portal; `MANAGE_DISCORD_REDIRECT_URI` = obige Callback-URL. Das Secret weder im Launcher noch in öffentlichen ZIPs hinterlegen und nicht als Nachricht versenden.
4. Zum Anmelden den vorhandenen Button **Mit Discord anmelden** verwenden. Für ein bestehendes Passwortkonto zunächst normal anmelden und **Verknüpfte Konten → Discord verknüpfen** wählen. Der Launcher öffnet diesen Webablauf über Einstellungen → Konto.

Die Webseite erzeugt den Autorisierungslink selbst mit `identify email` und einem einmaligen, zehn Minuten gültigen `state`. Ein fest kopierter Discord-Link ohne `state` wird vom Callback abgewiesen. Der Codeaustausch findet ausschließlich auf dem PHP-Webhosting statt; Zugriffstokens werden nicht gespeichert. Das Spiel und Steam verwenden weiterhin ihre bestehende Identität.

Gleiche E-Mail-Adressen führen **nicht automatisch** zur Verknüpfung. Das verhindert, dass die Anmeldung ein bestehendes Konto übernimmt. Für neue Discord-Konten ist eine bei Discord bestätigte E-Mail erforderlich; bestehende Benutzer verknüpfen nach der Passwortanmeldung. Ein Discord-Konto kann genau einem SkyMP-Konto zugeordnet sein.

JSON-Speicherung verwendet dieselbe geschützte Kontendatei. Bei MySQL wird die zusätzliche Tabelle `manage_oauth_accounts` bei erster Verwendung angelegt. Falls der Datenbankbenutzer keine CREATE-Berechtigung hat, ausschließlich den gleichnamigen `CREATE TABLE IF NOT EXISTS`-Abschnitt aus `storage/mysql-schema.sql` importieren. Keine vorhandenen Tabellen oder Konten ersetzen. PHP benötigt ausgehendes HTTPS mit gültiger CA-Konfiguration, vorzugsweise cURL, alternativ HTTPS-Streams.

Lokal geprüft: Zustandsablauf, Tokenaustausch mit simuliertem Discord, Kontoerstellung/Verknüpfung, E-Mail-Konflikte, CSRF und drei Sprachen. Die echte Discord-Freigabe und eine produktive MySQL-Verbindung sind nach Einrichtung des privaten Secrets zu prüfen.

Die Einrichtung betrifft PHP-Webhosting bzw. die genannten Launcher-Einstellungen. Launcher-, Server- und native Runtime-Pakete bleiben getrennt. [Dokumentationsübersicht](README.md) · [Launcher-Release](RELEASING.md).
