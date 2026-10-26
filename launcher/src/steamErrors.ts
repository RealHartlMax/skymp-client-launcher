const messages = {
  de: {
    PLAYER_NAME_INVALID: 'Der Spielername ist ungültig. In den Einstellungen höchstens 32 Zeichen ohne Steuerzeichen oder < > eintragen.',
    STEAM_KEY_MISSING: 'Auf dem Server fehlt der Steam-Web-API-Key. Der Betreiber muss ihn dort eintragen.',
    STEAM_KEY_REJECTED: 'Steam weist den API-Key oder dessen Berechtigung zurück. Der Betreiber muss den Server-Key prüfen.',
    STEAM_RATE_LIMITED: 'Das Limit für Steam-Prüfungen ist erreicht. Bitte kurz warten und erneut verbinden.',
    STEAM_UNAVAILABLE: 'Die Steam-Prüfung ist auf dem Server vorübergehend nicht erreichbar. Bitte erneut versuchen.',
    STEAM_RESPONSE_INVALID: 'Der Server hat keine gültige Antwort auf die Steam-Anmeldung geliefert.',
    STEAM_TICKET_INVALID: 'Das Steam-Ticket ist ungültig. Bitte Steam online anmelden und erneut verbinden.',
    STEAM_TICKET_REPLAY: 'Dieses Steam-Ticket wurde bereits verwendet. Erneut verbinden fordert ein neues Ticket an.',
    STEAM_TICKET_REJECTED: 'Der Server hat das Steam-Ticket abgelehnt. Das Serverprotokoll enthält den genaueren Prüfgrund.',
    STEAM_IDENTITY_MISMATCH: 'Die bestätigte Steam-Identität stimmt nicht mit der angeforderten Sitzung überein.',
    STEAM_SESSIONS_FULL: 'Der Server kann gerade keine weitere Steam-Sitzung anlegen. Bitte den Betreiber kontaktieren.',
    STEAM_STORAGE_UNAVAILABLE: 'Der Server kann die Steam-Sitzung nicht speichern. Bitte den Betreiber kontaktieren.',
    STEAM_APP_MISMATCH: 'Steam verwendet eine andere Spiel-App-ID als der Server. Steam neu starten und erneut verbinden.',
    STEAM_TICKET_AUDIENCE_MISMATCH: 'Die Steam-Dienstkennung im Ticket passt nicht zum Server. Der Betreiber muss die Server-Anbindung aktualisieren; danach erneut verbinden.',
    STEAM_POLICY_CHANGED: 'Die Steam-Anbindung des Servers hat sich während der Anmeldung geändert. Erneut verbinden lädt die aktuellen Einstellungen.',
  },
  en: {
    PLAYER_NAME_INVALID: 'The player name is invalid. In Settings, use up to 32 characters without control characters or < >.',
    STEAM_KEY_MISSING: 'The server is missing its Steam Web API key. The owner must configure it on the server.',
    STEAM_KEY_REJECTED: 'Steam rejected the API key or its permissions. The owner must check the server key.',
    STEAM_RATE_LIMITED: 'The Steam verification limit has been reached. Wait briefly and reconnect.',
    STEAM_UNAVAILABLE: 'Steam verification is temporarily unavailable at the server. Please retry.',
    STEAM_RESPONSE_INVALID: 'The server returned an invalid Steam authentication response.',
    STEAM_TICKET_INVALID: 'The Steam ticket is invalid. Sign in to Steam online and reconnect.',
    STEAM_TICKET_REPLAY: 'This Steam ticket has already been used. Reconnect to request a fresh ticket.',
    STEAM_TICKET_REJECTED: 'The server rejected the Steam ticket. Check the server log for the precise verification reason.',
    STEAM_IDENTITY_MISMATCH: 'The verified Steam identity does not match the requested session.',
    STEAM_SESSIONS_FULL: 'The server cannot create another Steam session right now. Contact the owner.',
    STEAM_STORAGE_UNAVAILABLE: 'The server could not save the Steam session. Contact the owner.',
    STEAM_APP_MISMATCH: 'Steam is using a different game App ID from the server. Restart Steam and reconnect.',
    STEAM_TICKET_AUDIENCE_MISMATCH: 'The Steam service identity in the ticket does not match the server. The owner must update the server integration, then reconnect.',
    STEAM_POLICY_CHANGED: 'The server Steam configuration changed during sign-in. Reconnect to load its current settings.',
  },
  ru: {
    PLAYER_NAME_INVALID: 'Недопустимое имя игрока. В настройках укажите до 32 символов без управляющих символов и < >.',
    STEAM_KEY_MISSING: 'На сервере не указан Steam Web API Key. Владелец должен настроить его на сервере.',
    STEAM_KEY_REJECTED: 'Steam отклонил API-ключ или его права. Владелец должен проверить ключ сервера.',
    STEAM_RATE_LIMITED: 'Достигнут лимит проверок Steam. Немного подождите и подключитесь снова.',
    STEAM_UNAVAILABLE: 'Проверка Steam на сервере временно недоступна. Повторите попытку.',
    STEAM_RESPONSE_INVALID: 'Сервер вернул некорректный ответ на запрос входа через Steam.',
    STEAM_TICKET_INVALID: 'Билет Steam недействителен. Войдите в Steam в сети и подключитесь снова.',
    STEAM_TICKET_REPLAY: 'Этот билет Steam уже использован. При новом подключении будет запрошен новый билет.',
    STEAM_TICKET_REJECTED: 'Сервер отклонил билет Steam. Точная причина проверки указана в журнале сервера.',
    STEAM_IDENTITY_MISMATCH: 'Подтверждённая учётная запись Steam не соответствует запрошенному сеансу.',
    STEAM_SESSIONS_FULL: 'Сервер сейчас не может создать новый сеанс Steam. Обратитесь к владельцу.',
    STEAM_STORAGE_UNAVAILABLE: 'Сервер не смог сохранить сеанс Steam. Обратитесь к владельцу.',
    STEAM_APP_MISMATCH: 'Steam использует другой App ID игры. Перезапустите Steam и подключитесь снова.',
    STEAM_TICKET_AUDIENCE_MISMATCH: 'Идентификатор сервиса Steam в билете не совпадает с сервером. Владелец должен обновить интеграцию сервера; затем подключитесь снова.',
    STEAM_POLICY_CHANGED: 'Настройки Steam на сервере изменились во время входа. Подключитесь снова, чтобы загрузить актуальные настройки.',
  },
};

export function connectionErrorMessage(error: unknown, language: 'de' | 'en' | 'ru'): string {
  const raw = error instanceof Error ? error.message : String(error);
  const match = /^\[((?:STEAM_|PLAYER_NAME_)[A-Z_]+)\](?: HTTP (\d{3})(?:; Steam (\d{1,10}))?)?$/.exec(raw);
  if (!match) return raw;
  const text = messages[language][match[1] as keyof typeof messages.en];
  return text ? `${text} ${raw}` : raw;
}
