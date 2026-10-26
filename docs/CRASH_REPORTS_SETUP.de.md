# Absturzberichte einrichten

Stand: 25.10.2026. Die Berichte landen jetzt im eigenständigen Entwicklerbereich
**dev.skymp-worlds.net**. Die vollständige Anleitung für die drei Webroots,
Entwicklerfreigabe, privaten Speicher, Hosting-Limits und Wartung steht in
[DEV_PORTAL_SETUP.de.md](DEV_PORTAL_SETUP.de.md).

Der Launcher bleibt bei **0.2.0** und sendet weiter an den festen API-Endpunkt.
Die Umstellung des Webbereichs benötigt keinen neuen Launcher.

- Im Crashdialog den Basisbericht vor dem Senden prüfen und freigeben.
- Speicherabbilder vor dem nächsten Spielstart separat zur Aufzeichnung aktivieren.
  Nach dem Absturz lässt sich kein Speicherabbild nachträglich erzeugen.
- Einen vorhandenen Dump beim Export oder Upload zusätzlich auswählen.
- Ohne eingerichteten Upload lokal exportieren und später auf DEV importieren.
- Bei Netzfehlern bleiben bereits freigegebene Berichte lokal zur Wiederholung erhalten.

Ein Launcher-Build enthält keine neue native Spiel-DLL. Die Threadpool-Korrektur
braucht weiterhin einen eigenen nativen Clientbuild und ein neues Runtime-Paket.
Technische Details: [CRASH_REPORTS.md](CRASH_REPORTS.md).
