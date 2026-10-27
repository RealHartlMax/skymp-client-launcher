# Defender-Erkennung und Codesignierung / Defender detections / Обнаружения Defender

Stand: **27.10.2026**, Launcher **0.2.1**. Eine lokale Antivirus-Ausnahme löst die Verteilung an andere Spieler nicht. Die genaue Datei und ihr SHA-256 sind entscheidend; dieselbe Versionsnummer kann unterschiedliche lokale Builds bezeichnen.

## Konkreter Befund

Der lokale Defender-Schutzverlauf nennt **`Trojan:Win32/Bearfoos.A!ml`** für `SkyMP-Launcher-v0.2.0.exe`. Der noch vorhandene Download stimmt bytegenau mit dem älteren lokalen Build überein. Die separat vorbereitete und auf GitHub angebotene EXE hat einen anderen Hash.

Am 26.10.2026 wurden beide Dateien mit Defender-Signaturen **`1.461.211.0`** gezielt geprüft, mit `-Scan -ScanType 3 -File ... -DisableRemediation`. Laut [Microsofts Dokumentation](https://learn.microsoft.com/en-us/defender-endpoint/command-line-arguments-microsoft-defender-antivirus) ignoriert dieser Modus Dateiausnahmen für den Scan und führt keine Bereinigung aus.

| Datei | SHA-256 | Lokaler Dateiscan |
| --- | --- | --- |
| Älterer v0.2.0-Build, auch im lokalen Downloads-Ordner | `3a8a4b6843c3b006ce61863160ca315a4b2fe70f86b4b0b2e98776f3b4fbe8c8` | `Trojan:Win32/Bearfoos.A!ml`, Exitcode 2 |
| [GitHub-Asset v0.2.0](https://github.com/RealHartlMax/skymp-client-launcher/releases/tag/v0.2.0), mit GitHub-Asset-Digest abgeglichen | `395fc35bfa5783cf2b55bc83beaed3bf902f820467812f6ad1f332d34a7a9f7f` | Keine Bedrohung, Exitcode 0 |
| Erster lokaler v0.2.1-Kandidat ohne Kontoverknüpfung | `e460e19d2c2a20106f76770133247a4cc840e75e21652bcdc3bcca788ffe8720` | Keine Bedrohung, Exitcode 0 |
| Finaler v0.2.1-Build mit Webkonto, Updates und Steam-Anzeige | `8c18cd09c61b4454060a8bcb2f5afb10db63d14408a0165405b15c05ca7059d1` | Keine Bedrohung, Exitcode 0 |

Alle aufgeführten EXEs sind **unsigniert**. Das Ergebnis beschreibt diese Dateien und diesen Signaturstand. Es beweist weder eine bestimmte Ursache im Quellcode noch einen erfolgreichen Cloud-/Verhaltens-/SmartScreen-Test auf anderen Rechnern. Die Erkennung des älteren Builds ist zur Herstellerprüfung vorzulegen; eine verbindliche Einstufung als Fehlalarm steht noch aus.

Lokale Nachweise: `local-builds/antivirus-2026-10-26/`. Das Verzeichnis bleibt außerhalb des öffentlichen Release-Pakets. Für die neue v0.2.1 gelten deren eigener SHA-256 und `VALIDATION.json`, nicht die Resultate der v0.2.0-Dateien.

## Änderungen in 0.2.1

- Die Crashdiagnose fragt den umgeleiteten Dokumente-Ordner direkt mit `SHGetKnownFolderPath` ab, einschließlich OneDrive-/Ordnerumleitung.
- Windows-Version, CPU, physischer RAM und bis zu vier Anzeigenamen/Grafiktreiberversionen werden direkt über Windows-APIs und fest ausgewählte Registry-Felder gelesen. Keine PowerShell-/WMI-Unterprozesse für diese Aufgaben; keine Seriennummern, Geräte-IDs oder Benutzernamen im Systembericht.
- `inspect-windows-release.ps1` prüft Hash, Produktversion, Authenticode und Zeitstempel. Mit `-RequireSignature` wird eine unsignierte Ausgabe abgewiesen.
- `sign-windows-release.ps1` signiert eine ausgewählte EXE/DLL/MSI mit einem bereits eingerichteten Codesignaturzertifikat und SHA-256/RFC-3161-Zeitstempel. Es werden keine Zertifikate importiert und keine Truststores geändert.
- Der automatische GitHub-Release-Ablauf fordert die Signatur vor dem Verpacken. Ohne eingerichteten Signieranbieter wird er absichtlich nicht veröffentlichen. Der ZIP-Inhalt ist auf die Launcher-EXE begrenzt; die Prüfsummen werden danach erzeugt.

Diese Änderungen vereinfachen den Diagnosepfad und verbessern die Release-Prüfung. Dass PowerShell die konkrete Erkennung verursacht hat, ist **nicht nachgewiesen**. Die normale Spielbeobachtung bleibt lesend; der separat aktivierbare Minidump-Helfer verwendet weiterhin Debug-/Dump-APIs und ist standardmäßig aus.

## Wenn Defender eine Datei entfernt

1. Defender-Produkt, Erkennungsname, Zeitpunkt und Dateiname aus dem Schutzverlauf festhalten. Wenn die Datei noch vorhanden ist, mit `Get-FileHash -Algorithm SHA256 -LiteralPath ...` identifizieren. Private Daten und Kontotokens gehören nicht in den Bericht.
2. Den Hash mit `SHA256SUMS` des **genauen** Release-Downloads vergleichen. Ein Neu-Build oder eine Signatur verändert den Hash; nicht verschiedene EXEs als denselben Fall behandeln.
3. Die tatsächlich betroffene EXE im [Microsoft Security Intelligence Submission Portal](https://www.microsoft.com/en-us/wdsi/filesubmission) als **Software developer**, passendes **Microsoft Defender Antivirus** und **Incorrectly detected as malware/malicious** zur Überprüfung einreichen. Erkennung, SHA-256, öffentliche Herkunft, reproduzierte Scan-Ausgabe und kurze Funktionsbeschreibung beilegen. Submission-ID und Herstellerentscheidung aufbewahren.
4. Nach einer Herstellerkorrektur die unveränderte Datei mit aktuellem Defender erneut auf einem Rechner ohne Launcher-Ausnahmen prüfen. Download, normaler Launcherstart und Spielstart sind getrennte Prüfungen.

Der Fall wird vor einer tatsächlichen Übermittlung lokal vorbereitet. Eine Übermittlung an Microsoft ist ein eigener Schritt; sie wurde durch diese Quelländerungen nicht ausgeführt. Keine automatische Antivirus-Ausnahme, Quarantänewiederherstellung oder Abschaltung in den Launcher einbauen.

## Dauerhafter Signierweg

Für verteilte Windows-Ausgaben ein öffentlich vertrauenswürdiges **Codesignaturzertifikat** oder einen passenden verwalteten Signierdienst einrichten. Ein selbstsigniertes Zertifikat oder TLS-Webzertifikat ersetzt das nicht. Der lokale Signierhelfer unterstützt den Windows-Zertifikatspeicher bzw. dort eingebundene Hardwaretoken; ein Cloudanbieter benötigt dessen dokumentierten Signieraufruf vor derselben Release-Prüfung.

Nach [Microsofts aktueller SmartScreen-Dokumentation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation) sind Signatur/Reputation und Malware-Erkennung unterschiedliche Prüfungen. Auch ein OV-/EV-signierter neuer Build kann zunächst SmartScreen-Meldungen zeigen; EV bietet keinen garantierten sofortigen Bypass. Codesignierung ist daher kein Ersatz für die Untersuchung einer konkreten Trojaner-Erkennung. Einen Anbieter erst nach Prüfung seiner Identitäts-/Regionsanforderungen auswählen.

Immer die fertige EXE signieren und prüfen, **danach** das ZIP und `SHA256SUMS` erzeugen. Dieselben Bytes über die Downloadwege verteilen. Nach dem Signieren weder EXE-Ressourcen noch eingebettete Dateien ändern. Umsetzung und Freigabe: [RELEASING.md](RELEASING.md).

## English

Defender locally reproduced `Trojan:Win32/Bearfoos.A!ml` on an older unsigned 0.2.0 executable (`3a8a4b...`). The differently hashed unsigned GitHub 0.2.0 executable (`395fc3...`) passed the same file scan. File exclusions were ignored and remediation was disabled. This is local evidence, not a vendor false-positive determination or a guarantee for another build, endpoint or SmartScreen.

Version 0.2.1 replaces PowerShell/WMI crash-diagnostic helpers with direct Windows APIs and adds timestamped Authenticode signing/inspection tools. Automated publication now requires signing. A certificate/provider is still needed. Submit the exact affected EXE for Microsoft review and keep the submission ID; no submission or Defender policy change is performed automatically. Sign before packaging, then regenerate checksums and validate the exact final bytes.

## Русский

Defender локально обнаружил `Trojan:Win32/Bearfoos.A!ml` в старой неподписанной сборке 0.2.0 (`3a8a4b...`). Другая неподписанная EXE из GitHub (`395fc3...`) прошла ту же файловую проверку. Исключения игнорировались, исправление/карантин не выполнялись. Это локальный результат, а не решение производителя о ложном срабатывании или гарантия для другой сборки, компьютера либо SmartScreen.

В версии 0.2.1 диагностические вызовы PowerShell/WMI заменены прямыми Windows API; добавлены средства подписи Authenticode с меткой времени и проверки. Автоматическая публикация требует подписи; сертификат/провайдер ещё необходимо настроить. Передайте именно обнаруженную EXE Microsoft для анализа и сохраните номер обращения. Автоматической отправки или изменения Defender нет. Сначала подпишите EXE, затем создайте ZIP/контрольные суммы и проверьте итоговые байты.
