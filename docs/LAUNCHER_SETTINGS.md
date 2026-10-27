# Launcher-Einstellungen / Settings / Настройки

Dokumentationsstand: **26.10.2026**, Launcher **0.2.1**.

## Deutsch

**Spielstart:** Im Splashscreen werden Vorbereitung und Download angezeigt. Nach bestätigtem Skyrim-Prozessstart kehrt die Launcher-Oberfläche automatisch zurück, ohne das Spiel in den Hintergrund zu holen. Bei Startfehlern bleiben Fehler und manueller Rückweg sichtbar. Der feste Registry-Endpunkt wird nicht als Benutzereinstellung angeboten; andere Spielserver bleiben auswählbar.

**Konto:** Steam-Konto mit „Konto prüfen“ aus dem gewählten Skyrim-Ordner lesen. Steam muss laufen. Ein eigener Spielername mit maximal 32 Unicode-Zeichen wird gespeichert und beim nächsten Verbinden zusätzlich zur bestätigten Steam-ID an den Server übertragen. Leer verwendet den bereinigten Steam-Anzeigenamen. Im Server erscheinen Name und Steam-ID in Freigabe/Whitelist und Spieleransicht. Eine Namensänderung ändert keine Steam-ID, Freigabe, Profil-ID oder RP-Figur. Ältere Server können das zusätzliche Feld ignorieren; für die Anzeige das neue Server-Backend und Dashboard-Frontend bauen.

**Interface:** Streamer-Modus verbirgt Adressen, Konto-IDs und lokale Pfade in der Oberfläche; Verbindungsdaten bleiben funktionsfähig. Der zuletzt gespielte Server ist zunächst verdeckt. Deutsch, Englisch und Russisch sind direkt wählbar. Optionaler, lokal erzeugter Umgebungsklang beginnt nach 25 Sekunden Inaktivität und pausiert bei Verbindung/Spielbetrieb. Lautstärke und Stummschaltung bei Fokusverlust gelten für den Launcher. „Serververlauf löschen“ erhält Favoriten und Serverprofile.

**Spiel:** Spielpfad prüfen und speichern. Der Aktualisierungskanal bestimmt nur die angebotene Launcher-Version: Beta ist die aktuelle Vorschau, Latest der aktuelle experimentelle Stand; Offizielle Releases werden zusätzlich unabhängig vom gewählten Kanal über GitHub und den Release-Katalog geprüft. Es erfolgt keine automatische Installation. Die Runtime bestimmt weiterhin der Server-Katalog passend zu Skyrim/SKSE; ein manuell gewähltes Clientpaket hat Vorrang. Der lokale Netzwerkport wird automatisch gewählt. Die RedM-Optionen für RAGE-Audio, NUI und integrierten Sprachchat haben im vorhandenen SkyMP-Client keine entsprechende Schnittstelle.

Discord-Status ist zunächst deaktiviert. „Anzeigen“ zeigt Launcher/Skyrim und den ausgewählten Server; „Details verbergen“ zeigt einen allgemeinen Status ohne Servername/Zeit. Streamer-Modus erzwingt diese Verdeckung. „Deaktiviert“ entfernt die Aktivität. Die Discord-Desktop-App muss laufen. Für das Web-Konto: [Discord einrichten](DISCORD_SETUP.de.md). Die Webseite benötigt ihr eigenes privates Secret; der Launcher enthält nur die öffentliche App-ID.

## English

**Startup:** The splash shows preparation/download progress and closes automatically after the real Skyrim process is detected, without activating the launcher window. Startup errors remain visible. The central registry URL is fixed; other game servers can still be selected or added directly.

**Account:** Read the Steam account from the chosen Skyrim folder with Check account; Steam must be running. A custom name of up to 32 Unicode characters is saved and sent alongside the verified Steam ID on the next connection. Empty uses the sanitized Steam display name. The server approval/whitelist and player view show the name and Steam ID. Renaming does not change Steam identity, approval, profile ID or RP character. Older servers may ignore the field; build the new backend and dashboard frontend to display it.

**Interface:** Streamer mode hides addresses, account IDs and local paths without changing connection data. The last played server is initially hidden. German, English and Russian are available. Optional locally generated ambient sound starts after 25 seconds of inactivity and pauses during connection/game operation. Volume and focus-loss mute affect the launcher. Clear server history preserves favorites and profiles.

**Game:** Verify/save the game folder. Update channels affect only the offered launcher download: Beta is the current preview, Latest the current experimental build; Official releases are additionally checked through GitHub and the release catalog independently of the selected channel. Nothing installs automatically. Server runtime catalogs still select matching Skyrim/SKSE files, and manual runtime overrides take priority. The local connection port is automatic. RedM RAGE audio, NUI and built-in voice options have no matching API in this SkyMP client.

Discord activity is disabled by default. Show publishes launcher/Skyrim and selected server; Hide details publishes a generic status without server name/timer. Streamer mode forces hidden details. Disabled removes activity. Requires desktop Discord. [Web OAuth setup](DISCORD_SETUP.en.md) is separate: its private secret stays on the webhosting; the launcher contains only the public App ID.

## Русский

**Запуск:** Экран подключения показывает подготовку и загрузку, затем закрывается автоматически после обнаружения Skyrim, не переводя фокус на лаунчер. Ошибки запуска остаются видимыми. Адрес общего списка фиксирован; другие игровые серверы можно выбирать и добавлять напрямую.

**Аккаунт:** «Проверить аккаунт» читает Steam через выбранную папку Skyrim; Steam должен работать. Имя до 32 символов Unicode сохраняется и передаётся вместе с подтверждённым Steam ID при следующем подключении. Пустое поле использует очищенное имя Steam. В допуске/Whitelist и списке игроков сервера показываются имя и Steam ID. Переименование не меняет личность Steam, допуск, профиль и RP-персонажа. Старый сервер может игнорировать поле; для отображения соберите новые backend и dashboard frontend.

**Интерфейс:** Режим стримера скрывает адреса, ID аккаунтов и локальные пути, сохраняя реальные данные подключения. Последний сервер сначала скрыт. Доступны немецкий, английский и русский. Необязательный локальный звук окружения включается после 25 секунд бездействия и приостанавливается при подключении и работе игры. Громкость и отключение при потере фокуса относятся к лаунчеру. Очистка истории сохраняет избранное и профили.

**Игра:** Проверка и сохранение папки игры. Каналы обновлений меняют только предлагаемый лаунчер: Бета — текущая предварительная версия, Latest — экспериментальная; Официальные релизы дополнительно проверяются через GitHub и каталог независимо от выбранного канала. Автоматической установки нет. Совместимый Skyrim/SKSE-пакет по-прежнему выбирает сервер, ручной выбор имеет приоритет. Локальный порт выбирается автоматически. Настройки RAGE-аудио, NUI и голосового чата RedM не имеют API в этом клиенте SkyMP.

Активность Discord по умолчанию отключена. «Показывать» публикует лаунчер/Skyrim и выбранный сервер; «Скрывать детали» — общий статус без сервера и таймера. Режим стримера принудительно скрывает детали. «Отключён» удаляет активность. Нужен настольный Discord. [Настройка веб-входа](DISCORD_SETUP.ru.md) выполняется отдельно: секрет хранится только на хостинге, в лаунчере есть лишь публичный App ID.

[Dokumentation / Documentation / Документация](README.md) · [Verbindung](CONNECTING.md) · [Manuelle Releases](RELEASING.md)

## Ergänzungen in 0.2.1 / Changes / Изменения

DE: Unter Konto meldest du dich mit deinem bestehenden SkyMP-Worlds-Webkonto an. Die Bestätigung erfolgt im Browser; Name, Konto-ID, E-Mail und Discord-Verknüpfung werden danach angezeigt. Die Sitzung liegt in der Windows-Anmeldeinformationsverwaltung, läuft nach acht Stunden ab und lässt sich abmelden. Das Webkonto ersetzt keine Steam-Identität oder Spielanmeldung. Steam wird beim ersten Öffnen automatisch gelesen und während der Launcher-Sitzung zwischengespeichert; beim Wechsel des Spielpfads wird neu geprüft. Offizielle Updates erscheinen auf allen Seiten und lassen sich unter Spiel manuell prüfen. Prüfungen erfolgen beim Start, alle 30 Minuten und nach Rückkehr zum Launcher mit mindestens einer Minute Abstand.

EN: Account settings connects your existing SkyMP Worlds website account through browser confirmation and displays name, account ID, email and Discord link status. Windows Credential Manager retains the session, which expires after eight hours and supports sign-out. Website sign-in does not replace Steam/game authentication. Steam is read automatically on first opening and cached for the launcher session; a changed game folder is checked again. Official updates appear across pages, with a manual check under Game. Checks run at startup, every 30 minutes and on returning after at least a minute.

RU: В разделе Аккаунт подключается существующий аккаунт сайта SkyMP Worlds через подтверждение в браузере; показываются имя, ID, email и привязка Discord. Сеанс хранится в Диспетчере учётных данных Windows, истекает через восемь часов и поддерживает выход. Вход на сайт не заменяет Steam/игровую авторизацию. Steam проверяется при первом открытии и сохраняется в течение сеанса; смена папки игры вызывает новую проверку. Официальные обновления показываются на всех страницах, ручная проверка находится в Игра. Проверка выполняется при запуске, каждые 30 минут и при возвращении после перерыва не менее минуты.
