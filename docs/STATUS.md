# Projektstand des Launchers

Stand: **22. Oktober 2026**. Diese Übersicht beschreibt den lokalen Quellstand
und vorhandene Testnachweise, keine öffentliche Freigabe.

| Bereich | Erledigt | Weiter offen |
| --- | --- | --- |
| Desktop-App | Tauri/React, Skyrim-Pfadauswahl, Suche, Serverdetails, Favoriten/Verlauf, Direktverbindung, Einstellungen | Vollständiger Test mit echtem Skyrim/CEF; detaillierte Modübersicht vor dem Download |
| Modpakete | Servermanifest v2, Größen/SHA-256, Unterordner, Cache/Reparatur, Aktivierung vor SKSE, Sicherung/Wiederherstellung | Teil-Download fortsetzen, automatische Retry-Regeln, Cache-Platzlimits |
| Client-/SKSE-Updates | Versionskatalog, echte PE-Dateiversion, Manifest-/Dateiprüfsummen, SKSE/Address-Library-Paketierung | Jede native Clientfreigabe im Spiel prüfen; kompletter signierter EXE-Selbstupdateablauf |
| Online-Ökosystem | PHP-Dashboard-Master, Konto-/Browserfreigabe, Heartbeat, öffentliche ID, getrennte Webroots; optionale Node-Referenz | Tatsächliches Web/VPS-Rollout, Produktions-DB/TLS/Betrieb und echte Spielsitzung abnehmen |
| Dokumentation | Betreiberhandbuch DE/EN/RU, statischer Doku-Webroot, Mod-/Runtime-/Hosting-Anleitungen | Neue Funktionen fortlaufend nachziehen; Veröffentlichung der neuen Ausgabe |
| Nativer SkyMP-Client (separates Server-Repo) | CommonLib-Port, neue Release-DLLs und eigenständige Adressdatenbank-Probes für Formate 1/2/5 | Vollständige SKSE/CEF-Initialisierung, Hooks und Multiplayer auf der gewählten Runtime |

## Aktuelle Nachweise

- Am 22. Oktober erneut bestanden: **25 Rust-Tests** und **6 Runtime-Paketprüfungen**.
- `local-builds/current/VALIDATION.json` dokumentiert den vorhandenen
  Windows-Releasebuild, 12 PHP-Prüfgruppen, UI-/Dokumentationsprüfungen und echten
  Paketdownload in einer getrennten Testinstallation. Der heutige Abgleich hat
  diese zusätzlichen Nachweise gelesen und nicht alle erneut ausgeführt.
- Die EXE und ihre in `launcher-build.json` aufgeführten Quelldateien stimmten
  beim Abgleich mit den dokumentierten Prüfsummen überein.
- Die Nachweise nennen ausdrücklich `realGameStarted: false`,
  `gameplayValidated: false` und `liveDeployed: false`. Ein erfolgreicher
  Dateidownload ist keine bestätigte Spielsitzung.

Die ältere `2026-10-21-modsync`-Launcher-Ausgabe aus dem Server-Repository
enthält die späteren Katalog-/Bootstrap-Änderungen nicht. Maßgeblicher lokaler
Launcher-Ausgabeordner ist inzwischen `local-builds/current/`. Buildausgaben
sind Momentaufnahmen; Dokumentationsänderungen erzeugen keine neue EXE.

## Nächste Aufgaben

- [ ] Vollständigen Skyrim-/SKSE-/CEF- und Mehrspieler-Test durchführen.
- [ ] Neueste Web-/Serverpakete auf den vorgesehenen Hosts bereitstellen und dort abnehmen.
- [ ] Detaillierte benötigte Modliste in der Serveransicht ergänzen.
- [ ] Teil-Downloads/Retry-Strategie und sichere Cachebereinigung ergänzen.
- [ ] Abhängigkeits-/Versionsgraphen für Mods und Ressourcen implementieren.
- [ ] Signierten automatischen Updateablauf für die Launcher-EXE abschließen.
- [ ] Ein eigenständiges versioniertes Entwickler-SDK fertigstellen.

Details: [Roadmap](../ROADMAP.md), [Verbindung](CONNECTING.md),
[Modpakete](MODPACK_PROTOCOL.md), [Runtime-Updates](RUNTIME_UPDATES.md),
[PHP-Hosting](PHP_HOSTING.md) und [Live-Abnahme](LIVE_ROLLOUT_CHECKLIST.md).


## Steam authentication update (2026-10-24)

Native Steam ticket acquisition through the existing game DLL, server policy/validation, private Steam session injection into the reversible connection journal, and progress in DE/EN/RU are implemented. Incoming frontend JSON cannot inject a Steam proof. The existing game Steam DLL is not replaced. 53 Rust library tests and the separately invoked native ticket probe passed; the release EXE and frontend built. The probe starts no game. Real server verification with an operator Steam API key and Skyrim/CEF multiplayer remain open. See [Steam integration](STEAM_AUTHENTICATION.md).
