# Spielerzugang, Steam und Legacy-Anmeldung

Dokumentationsstand: **26.10.2026**, Launcher **0.2.0**.

Beschrieben ist der Steam-Zugang mit servergebundener Dienstkennung. Server, Desktop-Launcher und
`skymp5-client.js` müssen gemeinsam aktualisiert werden. Die Serverarchive
enthalten keine Launcher-EXE und kein vollständiges natives Clientpaket.

**Deutsch:** Valve hat Code 105 als `Identity parameter did not match`
präzisiert: Die Ticket-Dienstkennung passt nicht zur Prüfung. Der Server erzeugt
jetzt eine stabile, 29 Zeichen lange Kennung aus Buchstaben/Ziffern aus seiner
vollständigen öffentlichen Instanz-ID. Der Launcher liest diese Kennung aus der
Auth-Policy und gibt sie mit dem Ticket zurück. Der Server verwendet weiterhin
ausschließlich seine eigene Kennung für die Valve-Prüfung und weist einen
zwischenzeitlichen Konfigurationswechsel mit `STEAM_POLICY_CHANGED` zurück.
Die Steam-Prüfung bleibt verpflichtend. Beide Serverbackends aus dem aktualisierten
Fork bauen und den gesamten Dienst einschließlich Dashboard neu starten; dazu
den neu gebauten Launcher verwenden. Das externe Spiel-/SKSE-Paket bleibt
unverändert. Echte Valve-Anmeldung und Skyrim-Spielverbindung separat prüfen.

**English:** Valve identified error 105 as `Identity parameter did not match`.
The server now derives a stable 29-character alphanumeric service identity from
its full public instance ID. The launcher discovers it in the auth policy and
echoes it with the ticket. Verification still uses only the server's own identity;
configuration changes during sign-in return `STEAM_POLICY_CHANGED`. Steam
verification remains mandatory. Rebuild both server backends, restart the full
service including the dashboard and use the rebuilt launcher. The external game
and SKSE runtime is unchanged. Real Valve sign-in and Skyrim gameplay need
separate acceptance checks.

**Русский:** Valve уточнила ошибку 105: `Identity parameter did not match`.
Сервер теперь формирует стабильный идентификатор сервиса из 29 букв и цифр на
основе полного публичного ID экземпляра. Лаунчер получает его из политики входа
и возвращает вместе с билетом. Проверка Valve всегда использует идентификатор
самого сервера; изменение настроек во время входа вызывает
`STEAM_POLICY_CHANGED`. Проверка Steam остаётся обязательной. Пересоберите оба
серверных файла, перезапустите службу вместе с панелью и используйте новую
сборку лаунчера. Внешний пакет клиента/SKSE не изменён. Реальный вход Valve и
игровое подключение Skyrim проверяются отдельно.

## Deutsch

**Steam ist für jeden neuen Anmeldeweg Pflicht.** Der Launcher fordert beim
laufenden, angemeldeten Steam-Client ein `GetAuthTicketForWebApi`-Ticket für
Skyrim SE/AE (App-ID `489830`) an. Der Webserver prüft es mit seinem privaten
Steam Web API Key bei Valve. Danach erhält der Launcher eine zeitlich begrenzte
Server-Sitzung. Eine frei übergebene SteamID oder Profilnummer genügt nicht.
Die vorhandene `steam_api64.dll` wird geladen, nicht ersetzt; Skyrim wird während
der Ticketprüfung nicht gestartet.

Unter **Einstellungen → CFG-Editor → Zugriff & Discord** stehen bereit:

| Zugang | Zusätzliche Anmeldung / Freigabe |
| --- | --- |
| Offen ohne Ingame-Login | Verifizierte SteamID reicht; kein Worlds-/skymp.net-Konto |
| Offen ohne Ingame-Login, mit Dashboard-Freigabe | Administrator muss die SteamID freigeben |
| Offen mit Ingame-Login | Steam und Konto beim gewählten Anmeldedienst |
| Discord-Mitgliedschaft | Steam, Ingame-Konto mit verknüpftem Discord und Mitgliedschaft im konfigurierten Server |
| Discord-Rollen | Zusätzlich mindestens eine eingetragene Rollen-ID |
| Freigegebene Lizenz / Nur Administration | Bestehende Listenregeln; `steam:<SteamID64>` kann als Lizenz verwendet werden |

Bei Kontozugang bleibt die Auswahl **SkyMP Worlds**, **Legacy (skymp.net)**
oder eigener kompatibler Master erhalten. Legacy nutzt weiterhin den upstream
Master und dessen Konto-/Discord-Verfahren. Ein Wechsel des Anmeldedienstes
löscht den bisherigen privaten Schlüssel und die öffentliche Server-ID im
Formular; neue Zugangsdaten anschließend eintragen. Gastzugang ändert nicht
automatisch die Registrierung für die globale Serverliste.

### Einrichtung und Updates

1. Einen [Steam Web API Key](https://steamcommunity.com/dev/apikey) erstellen.
2. Im Browser-Erstassistenten oder unter **Zugriff & Discord → Steam Web API Key**
   eintragen und speichern. Der Schlüssel bleibt auf dem Server. Ein leeres
   Schlüsselfeld im Erstassistenten erhält einen vorhandenen Schlüssel; im
   CFG-Editor kann er bewusst gelöscht werden.
3. Zugang auswählen und speichern. Danach den **Game-Server neu starten**, damit
   der Login-Dienst die Konfiguration einliest. Dashboard und Bot bleiben aktiv.
4. Aktualisierte Launcher-EXE und versionsgebundenes Clientpaket bereitstellen.
   Im Launcher muss Steam laufen und angemeldet sein.
5. Bei Freigabemodus unter **Whitelist / Spielerzugang** freigeben.
   Die wartende Spielsitzung fragt den Status zehn Minuten lang ab; danach über
   den Launcher erneut verbinden. Eine Sperre verhindert weitere Anmeldungen.
   Eine laufende Sitzung bei Bedarf zusätzlich über Spieler/Kick beenden.

Ohne gültigen API-Key bleibt die Verwaltung erreichbar; neue Spieleranmeldungen
werden abgewiesen. Öffentlich HTTPS verwenden, damit Ticket und Sitzung beim
Transport geschützt sind. Ein Steam-OpenID-Callback ist nicht erforderlich.

`data/player-access.json` speichert Steam-Freigaben, Gast-Profilnummern,
Kontobindungen und gehashte Sitzungen. Diese private Datei bei Updates sichern
und erhalten. Gastprofile erhalten serverseitig stabile IDs ab `2000000000`.
Bestehende Kontoprofile behalten ihre Profilnummer; ein Wechsel zwischen Gast-
und Kontomodus führt deshalb nicht automatisch dieselbe Spielfigur weiter.

Eine SteamID kann auf einer Serverinstanz nur eine aktive Spielsitzung besitzen.
Ein Masterkonto wird beim erfolgreichen Login an eine SteamID gebunden; ein
anderer Steam-Account kann es danach nicht übernehmen. Diese Bindung ist
serverlokal; ein Dialog zum Lösen einer Bindung ist noch nicht vorhanden.
Die SteamID ist eine Kontoidentität, keine Hardwarekennung und keine Garantie
gegen neue Steam-Konten. Frei wählbare Offline-Profilnummern umgehen die Prüfung
nicht mehr. Andere alte Server ohne Auth-Policy-Endpunkt können im Launcher
weiterhin ihr bisheriges Protokoll verwenden.

### Schnittstellen und Nachweise

- `GET /api/launcher/auth-policy`: Anforderungen, App-ID und Ticket-Audience;
  enthält weder Steam- noch Master-Schlüssel.
- `POST /api/launcher/auth/steam`: JSON `{ "steamId": "…", "ticket": "…" }`;
  akzeptiert nur die von Valve bestätigte SteamID und gibt `steamSession` zurück.
  Diese Sitzung ist privat und acht Stunden gültig. Tickets werden nicht gespeichert.
- `GET/POST /api/admin/player-access`: Administratoren können Steam-Freigaben
  lesen, freigeben oder sperren. Browser-Schreibzugriffe verlangen gleiche Origin und JSON.
- Das Spiel übergibt `loginWithSteam` und erst auf Aufforderung die vorhandene
  Master-Sitzung. Ein zweiter gleichzeitiger Steam-Login wird abgewiesen.

Eine frühere separate Probe hat ein echtes Steam-Ticket über die unveränderte Spiel-DLL angefordert, ohne Skyrim zu starten. Die automatisierten Serverprüfungen verwenden simulierte Valve-Antworten. Danach hat der Nutzer einen erfolgreichen Spielstart und Bewegung mit der bereitgestellten Runtime bestätigt. Eine vollständige Abnahme weiterer Konto-, Discord- und Mehrspielermodi wird daraus nicht abgeleitet.

## English

Steam is required in the current fork’s documented access modes. The updated Windows launcher requests
a Web API ticket through the existing Skyrim Steam DLL and the running Steam
client. The server validates it with Valve using its private Steam Web API key.
The game DLL is not replaced. A client-supplied Steam ID alone is never trusted.

In **Settings → CFG → Access & Discord**, choose open Steam access without an
in-game account, Steam access with dashboard approval, account login, Discord
membership/roles, approved licenses or administrators only. Account mode keeps
SkyMP Worlds, **Legacy (skymp.net)** and compatible custom masters. Guest modes
need no Worlds/skymp.net account. All modes still need signed-in Steam.

Enter the Steam key in browser first-run setup or the dashboard, save, then restart
only the game server after access changes. Without a valid key, administration
continues but player logins fail. Publish the web endpoint over HTTPS.
Update the launcher EXE and versioned client runtime together with the server.
Keep `data/player-access.json`: it holds approvals, stable guest profile IDs,
account bindings and hashed sessions. Existing account profiles and new guest
profiles are separate; characters are not migrated automatically. One active
game session per Steam ID is allowed on a server instance. A master account is
bound to its verified Steam identity. Blocking prevents future login; kick an
already connected player separately. Pending guests poll for ten minutes.

An earlier native ticket probe passed without starting Skyrim or replacing its Steam DLL. Automated server checks use simulated Valve responses. The user subsequently confirmed game startup and movement with the supplied runtime. Additional account, Discord and multiplayer modes still need their own acceptance.

## Русский

Steam обязателен в документированных режимах доступа текущего форка. Обновлённый Windows-лаунчер
получает Web API билет через существующую Steam DLL Skyrim и запущенный Steam.
Сервер проверяет билет у Valve своим закрытым Steam Web API Key. DLL игры не
заменяется. Переданного клиентом SteamID без проверки недостаточно.

В **Настройки → CFG → Доступ и Discord** доступны вход без игрового аккаунта,
вход с одобрением SteamID администратором, вход через аккаунт, Discord/роли,
списки лицензий и доступ только администрации. Для аккаунтов сохранены SkyMP
Worlds, **Legacy (skymp.net)** и совместимый собственный мастер. Гостям аккаунт
Worlds/skymp.net не нужен; вход в Steam нужен во всех режимах.

Введите ключ в браузерном мастере настройки или панели, сохраните изменения и
перезапустите только игровой сервер. Без ключа панель работает, но новые игровые
подключения отклоняются. Для публичного доступа используйте HTTPS. Вместе с
сервером обновите EXE лаунчера и версионный пакет клиента.

Сохраняйте `data/player-access.json`: в нём одобрения, постоянные гостевые профили,
привязки аккаунтов и хеши сессий. Гостевые и прежние аккаунтные персонажи не
объединяются автоматически. На одном сервере разрешена одна активная сессия
для SteamID. Аккаунт мастера привязывается к проверенной SteamID. Блокировка
запрещает последующие входы; уже подключённого игрока отключают отдельно.
Ожидающий одобрения клиент проверяет статус десять минут.

Ранее отдельная проверка получила настоящий билет без запуска Skyrim и замены Steam DLL. Автоматизированные проверки сервера используют имитацию ответов Valve. Затем пользователь подтвердил запуск игры и движение с предоставленной средой. Другие режимы аккаунтов, Discord и многопользовательской игры проверяются отдельно.

## Diagnose einer abgelehnten Steam-Anmeldung / Authentication diagnostics / Диагностика

**Deutsch:** Ein gemeinsam mit RedM verwendeter normaler Steam-Web-API-Key ist nicht automatisch die Fehlerursache. Der öffentliche Valve-Endpunkt unterstützt Benutzer-Keys und ist begrenzt. `steamConfigured: true` bestätigt nur das Format des hinterlegten Keys. Der Launcher prüft zusätzlich die tatsächliche Steam-App-ID. Der Server gibt feste Fehlercodes und gegebenenfalls einen numerischen `steamErrorCode` zurück und protokolliert sie unter `[PlayerAccess]`. Keys, Tickets, Sitzungen und vollständige Valve-Antworten werden dabei nicht ausgegeben. `STEAM_KEY_REJECTED` bezeichnet eine HTTP-Ablehnung des Keys/der Berechtigung durch Valve; `STEAM_TICKET_REJECTED` eine inhaltliche Ticketablehnung; `STEAM_RATE_LIMITED` ein Limit. Der Fehler tritt vor Dateivorbereitung und Spielstart auf. Server-Code aktualisieren und den persistenten Dashboard-Prozess neu starten, da dieser die HTTP-Anmeldung verarbeitet. Ein reiner Game-Server-Neustart ersetzt den laufenden Dashboard-Code nicht.

**English:** Reusing a regular Steam Web API key with RedM does not by itself identify the cause. Valve's public endpoint supports user keys and applies rate limits. `steamConfigured: true` checks the stored key's format only. The launcher also verifies the actual Steam App ID. Server errors and `[PlayerAccess]` log entries contain fixed codes and optional numeric `steamErrorCode`, without raw tickets, keys, sessions or Valve replies. `STEAM_KEY_REJECTED` indicates Valve HTTP key/permission refusal; `STEAM_TICKET_REJECTED` a ticket rejection; `STEAM_RATE_LIMITED` a limit. These checks run before preparation and game launch. Update the server source and restart the persistent dashboard process: restarting the game process alone does not reload its HTTP authentication code.

**Русский:** Само использование обычного Steam Web API Key вместе с RedM не устанавливает причину отказа. Публичный API Valve поддерживает пользовательские ключи и ограничивает частоту запросов. `steamConfigured: true` проверяет только формат ключа. Лаунчер также проверяет фактический App ID Steam. Сервер и журнал `[PlayerAccess]` возвращают фиксированные коды и необязательный числовой `steamErrorCode`, не раскрывая ключи, билеты, сеансы или полный ответ Valve. `STEAM_KEY_REJECTED` означает HTTP-отказ ключа/прав со стороны Valve, `STEAM_TICKET_REJECTED` — отказ билета, `STEAM_RATE_LIMITED` — лимит. Проверки выполняются до подготовки файлов и запуска игры. После обновления серверного кода перезапустите постоянный процесс панели; перезапуск только игрового процесса не обновляет HTTP-аутентификацию.

### Primary references

[Steam Web API authentication](https://partner.steamgames.com/doc/webapi/ISteamUserAuth),
[GetAuthTicketForWebApi](https://partner.steamgames.com/doc/api/ISteamUser#GetAuthTicketForWebApi),
[Cfx Steam identity provider](https://github.com/citizenfx/fivem/blob/master/code/components/citizen-server-impl/src/SteamIdentityProvider.cpp).

## Start, Freigabe und Spielerprofil / Startup / Запуск

**Deutsch:** Der Splashscreen schließt sich, sobald der echte Skyrim-Prozess bestätigt wurde. Das ist keine Bestätigung einer geladenen Spielwelt. Ein wartender Steam-Zugang wird unter **Whitelist / Spielerzugang** im Gameserver-Dashboard freigegeben; er muss davor nicht als verbundene Spielfigur erscheinen. Im Spielerprofil wird die serverbestätigte Steam-ID separat schreibgeschützt angezeigt. Manuell gepflegte Kennungen verändern diese Identität nicht. Die Profilkorrektur benötigt passende Server-Backends und Dashboard-Dateien, kein neues Steam-Konto.

**English:** The splash closes after the real Skyrim process is detected, not after verified world loading. Pending Steam access is approved under Whitelist/player access before a connected actor is required. The player profile shows the verified Steam ID read-only; manually entered identifiers cannot replace it. The profile fix belongs to the game-server/dashboard build.

**Русский:** Экран подключения закрывается после обнаружения процесса Skyrim, а не после подтверждённой загрузки мира. Ожидающий допуск Steam подтверждается в Whitelist/доступе игроков до появления подключённого персонажа. Подтверждённый Steam ID в профиле доступен только для чтения; ручные идентификаторы его не заменяют. Исправление профиля относится к сборке сервера и панели.
