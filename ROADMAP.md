# Roadmap

Stand: **26. Oktober 2026**. Die implementierte Launcher-Version ist **0.2.0**. Prüfnachweise und offene Abnahmen stehen in [STATUS.md](docs/STATUS.md); die [Release-Anleitung](docs/RELEASING.md) beschreibt die manuelle Veröffentlichung.

## In 0.2.0 umgesetzt

- [x] Serverbrowser mit Suche, Filtern, Sortierung, Favoriten, Verlauf und Details.
- [x] Direktverbindung und mehrere gespeicherte Serverprofile.
- [x] Länderflaggen, vom Server gelieferte Bilder und Online-/Offline-Anzeige.
- [x] Prüfung des Spielordners und Erkennen der installierten Skyrim-Version.
- [x] Modmanifest v2, geprüfte Downloads, Cache und serverseitige Mod-Ladereihenfolge.
- [x] Externe Client-/SKSE-/Address-Library-Pakete und Versionskataloge.
- [x] Reversibler Serverwechsel, Sicherung und Wiederherstellung von Originaldateien.
- [x] Steam-Tickets, servergebundene Anmeldung und zusätzlicher Spielername.
- [x] DE/EN/RU, Streamer-Modus, optionale Hintergrundklänge und Discord-Aktivität.
- [x] Verbindungs-Splashscreen mit Fortschritt und automatischem Schließen nach erfolgreichem Spielstart.
- [x] Spielprozessüberwachung, präzisere Fehlermeldungen und zustimmungsbasierte Crashreports.
- [x] Portable Windows-x64-Ausgabe mit EXE, ZIP, Lizenzen und SHA-256-Prüfsummen.
- [x] Mehrsprachige Betreiberhandbücher und getrennte Dokumentation der sieben Webroots.

Die zugehörigen Server-Schnittstellen und die native Spiel-Runtime werden separat entwickelt und veröffentlicht. Eine Launcher-Version ersetzt keinen Server- oder Runtime-Build.

## Noch abzunehmen

- [ ] Wiederholte und längere Spielsitzungen mit mehreren Spielern sowie unterschiedlichen Modpaketen dokumentieren.
- [ ] Reconnect, Serverwechsel und Wiederherstellung mit den tatsächlich veröffentlichten Client-/Serverversionen abnehmen.
- [ ] Veröffentlichung und Download des manuell bereitgestellten GitHub-Releases bestätigen.
- [ ] Die produktiven PHP-/Datenbank-/Mail-/Discord- und Reportabläufe nach Updates auf den jeweiligen Hosts prüfen.

Der Nutzer hat einen erfolgreichen Spielstart und Bewegung in der Spielwelt bestätigt. Weitere Abnahmen bleiben konkrete Aufgaben; sie werden nicht allein aus bestandenen Build- oder API-Tests abgeleitet.

## Geplante Verbesserungen

- [ ] Benötigte Mods und Gesamtdownloadgröße vor der Verbindung ausführlicher darstellen.
- [ ] Fortsetzen von Teildownloads und begrenzte Retry-Regeln ergänzen.
- [ ] Cache-Größe und sichere Bereinigung für Nutzer konfigurierbar machen.
- [ ] Ressourcen-Abhängigkeiten und Versionskonflikte besser erklären.
- [ ] Signierte Launcher-Veröffentlichungen und einen vollständigen Selbstupdateablauf vorbereiten.
- [ ] Öffentliche Build-Assets und saubere Quell-Checkouts einfacher reproduzierbar bereitstellen.
- [ ] Ein versioniertes Integrations-SDK für weitere Server-Forks ausarbeiten.

## English

Version 0.2.0 implements discovery, verified preparation, runtime catalogs, load order, Steam authentication, settings, diagnostics and portable releases. Remaining work focuses on broader multiplayer acceptance, deployment checks, download recovery, cache management, reproducible source inputs and signed updates. No future version or delivery date is promised here.

## Русский

В 0.2.0 реализованы поиск серверов, проверенная подготовка файлов, каталоги клиента, порядок модов, Steam, настройки, диагностика и portable-релиз. Следующие задачи — расширенные игровые проверки, проверка публикаций, восстановление загрузок, управление кешем, воспроизводимые исходные данные сборки и подписанные обновления. Номера и сроки будущих версий здесь не назначаются.
