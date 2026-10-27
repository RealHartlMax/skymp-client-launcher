<?php

function api_available_languages(): array
{
    return ['de', 'en', 'ru'];
}

function api_detect_language(): string
{
    $supported = api_available_languages();

    $requested = strtolower(trim((string) ($_GET['lang'] ?? '')));
    if (in_array($requested, $supported, true)) {
        return $requested;
    }

    $cookieLanguage = strtolower(trim((string) ($_COOKIE['skymp_lang'] ?? '')));
    if (in_array($cookieLanguage, $supported, true)) {
        return $cookieLanguage;
    }

    $acceptLanguage = strtolower((string) ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''));
    foreach (explode(',', $acceptLanguage) as $entry) {
        $candidate = substr(trim($entry), 0, 2);
        if (in_array($candidate, $supported, true)) {
            return $candidate;
        }
    }

    return 'en';
}

function api_t(string $key): string
{
    static $messages = [
        'de' => [
            'error_post_only' => 'Dieser Endpunkt akzeptiert nur POST-Anfragen.',
            'error_invalid_payload' => 'Die JSON-Nutzlast ist ungültig oder unvollstaendig.',
            'error_api_key_empty' => 'Der API-Schlüssel darf nicht leer sein.',
            'error_missing_identity' => 'Es wird mindestens eines der Felder api_key, server_uid oder ip+port benötigt.',
            'error_country_code_invalid' => 'country_code muss ein gültiger ISO-3166-1-Alpha-2-Code sein (z. B. DE, US).',
            'error_server_not_registered' => 'Der Server ist noch nicht registriert. Lege ihn im Dashboard an oder aktiviere Heartbeat-Autoregistrierung.',
            'error_auto_register_missing_fields' => 'Für die automatische Registrierung werden name, ip, port und max_players benötigt.',
            'error_registration_token_invalid' => 'registration_token fehlt oder ist ungültig.',
            'error_server_identity_conflict' => 'Konflikt zwischen übermittelten Server-Identifikatoren (api_key/server_uid).',
            'error_db_write_failed' => 'Datenbankfehler beim Speichern des Heartbeats.',
            'error_db_read_failed' => 'Datenbankfehler beim Abrufen der Serverliste.',
            'error_db_config_missing' => 'config.php fehlt oder ist unvollstaendig. Der Listen-Endpunkt kann ohne Datenbankkonfiguration nicht arbeiten.',
            'error_internal' => 'Interner Serverfehler.',
            'warning_no_db_config' => 'config.php nicht gefunden. Heartbeat wurde empfangen, aber nicht persistent gespeichert.',
            'success_heartbeat_received' => 'Heartbeat erfolgreich verarbeitet.',
        ],
        'en' => [
            'error_post_only' => 'This endpoint only accepts POST requests.',
            'error_invalid_payload' => 'Invalid or missing JSON payload.',
            'error_api_key_empty' => 'API key cannot be empty.',
            'error_missing_identity' => 'At least one of api_key, server_uid, or ip+port is required.',
            'error_country_code_invalid' => 'country_code must be a valid ISO 3166-1 alpha-2 code (e.g. DE, US).',
            'error_server_not_registered' => 'Server is not registered yet. Create it in dashboard or enable heartbeat auto-registration.',
            'error_auto_register_missing_fields' => 'Automatic registration requires name, ip, port, and max_players.',
            'error_registration_token_invalid' => 'registration_token is missing or invalid.',
            'error_server_identity_conflict' => 'Conflict between provided server identifiers (api_key/server_uid).',
            'error_db_write_failed' => 'Database error while saving heartbeat.',
            'error_db_read_failed' => 'Database error while fetching server list.',
            'error_db_config_missing' => 'config.php is missing or incomplete. The list endpoint cannot operate without database configuration.',
            'error_internal' => 'Internal server error.',
            'warning_no_db_config' => 'config.php was not found. Heartbeat was accepted but not persisted.',
            'success_heartbeat_received' => 'Heartbeat processed successfully.',
        ],
        'ru' => [
            'error_post_only' => 'Этот эндпоинт принимает только POST-запросы.',
            'error_invalid_payload' => 'JSON-полезная нагрузка некорректна или отсутствует.',
            'error_api_key_empty' => 'API-ключ не может быть пустым.',
            'error_missing_identity' => 'Требуется хотя бы один идентификатор: api_key, server_uid или ip+port.',
            'error_country_code_invalid' => 'country_code должен быть корректным кодом ISO 3166-1 alpha-2 (например DE, US).',
            'error_server_not_registered' => 'Сервер еще не зарегистрирован. Создайте его в панели или включите авто-регистрацию heartbeat.',
            'error_auto_register_missing_fields' => 'Для авто-регистрации требуются name, ip, port и max_players.',
            'error_registration_token_invalid' => 'registration_token отсутствует или недействителен.',
            'error_server_identity_conflict' => 'Конфликт переданных идентификаторов сервера (api_key/server_uid).',
            'error_db_write_failed' => 'Ошибка базы данных при сохранении heartbeat.',
            'error_db_read_failed' => 'Ошибка базы данных при получении списка серверов.',
            'error_db_config_missing' => 'config.php отсутствует или заполнен не полностью. Эндпоинт списка не может работать без конфигурации БД.',
            'error_internal' => 'Внутренняя ошибка сервера.',
            'warning_no_db_config' => 'Файл config.php не найден. Heartbeat принят, но не сохранен в базе.',
            'success_heartbeat_received' => 'Heartbeat успешно обработан.',
        ],
    ];

    $language = api_detect_language();
    return $messages[$language][$key] ?? $messages['en'][$key] ?? $key;
}

function api_json($payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Language: ' . api_detect_language());
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit();
}

