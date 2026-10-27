<?php
// api.skymp-worlds.net/heartbeat.php

require_once __DIR__ . '/i18n.php';
$configPath = __DIR__ . '/config.php';
if (is_file($configPath)) { require_once $configPath; }
// New installations and existing clients use one account/server authority.
// The previous standalone registry remains an explicit migration-only option.
if (!defined('API_LEGACY_HEARTBEATS') || !API_LEGACY_HEARTBEATS) {
    require __DIR__ . '/native-heartbeat.php';
    exit;
}

/**
 * heartbeat.php
 * 
 * This script receives a POST request from a game server to signal that it's online.
 * It validates the server's API key and updates its details and `last_heartbeat` timestamp in the database.
 */

header('Content-Type: application/json; charset=utf-8');
header('Content-Language: ' . api_detect_language());

// --- 0. Check Request Method ---
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    api_json(['error' => api_t('error_post_only')], 405); // Method Not Allowed
}

function hb_get_first_present(array $input, array $keys)
{
    foreach ($keys as $key) {
        if (array_key_exists($key, $input)) {
            return $input[$key];
        }
    }

    return null;
}

function hb_get_request_ip(): string
{
    $forwarded = (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
    if ($forwarded !== '') {
        $parts = explode(',', $forwarded);
        foreach ($parts as $part) {
            $candidate = trim($part);
            if ($candidate !== '' && filter_var($candidate, FILTER_VALIDATE_IP)) {
                return $candidate;
            }
        }
    }

    $remoteAddr = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    if ($remoteAddr !== '' && filter_var($remoteAddr, FILTER_VALIDATE_IP)) {
        return $remoteAddr;
    }

    return '';
}

function hb_load_config(): bool
{
    $configPath = __DIR__ . '/config.php';
    if (!is_file($configPath)) {
        return false;
    }

    require_once $configPath;

    return defined('DB_HOST') && defined('DB_NAME') && defined('DB_USER') && defined('DB_PASS');
}

function hb_db_connect(): PDO
{
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    return $pdo;
}

// --- 1. Parse & Validate Input Data ---
$inputFromWrapper = array_key_exists('SKYMP_HEARTBEAT_INPUT', $GLOBALS);
$input = $inputFromWrapper
    ? $GLOBALS['SKYMP_HEARTBEAT_INPUT']
    : json_decode(file_get_contents('php://input'), true);

if ((!$inputFromWrapper && json_last_error() !== JSON_ERROR_NONE) || !is_array($input)) {
    api_json(['error' => api_t('error_invalid_payload')], 400);
}

$apiKeyRaw = hb_get_first_present($input, ['api_key', 'masterKey', 'master_key']);
$serverUidRaw = hb_get_first_present($input, ['server_uid', 'serverUid']);
$registrationTokenRaw = hb_get_first_present($input, ['registration_token', 'registrationToken']);

$apiKey = trim((string) ($apiKeyRaw ?? ''));
$serverUid = trim((string) ($serverUidRaw ?? ''));
$registrationToken = trim((string) ($registrationTokenRaw ?? ''));

$apiKey = substr($apiKey, 0, 255);
$serverUid = substr($serverUid, 0, 128);
$registrationToken = substr($registrationToken, 0, 255);

$nameRaw = hb_get_first_present($input, ['name']);
$ipRaw = hb_get_first_present($input, ['ip', 'host', 'hostname', 'server_ip', 'serverIp', 'public_ip', 'publicIp', 'address']);
$portRaw = hb_get_first_present($input, ['port', 'server_port', 'serverPort', 'game_port', 'gamePort', 'query_port', 'queryPort']);

$name = trim((string) ($nameRaw ?? ''));
$ip = trim((string) ($ipRaw ?? ''));
$port = is_numeric($portRaw) ? max(0, min(65535, (int) $portRaw)) : 0;

if ($ip === '') {
    $ip = hb_get_request_ip();
}

$name = substr($name, 0, 255);
$ip = substr($ip, 0, 45);

$maxPlayersRaw = hb_get_first_present($input, ['max_players', 'maxPlayers', 'player_limit', 'playerLimit', 'slots']);
$currentPlayersRaw = hb_get_first_present($input, ['current_players', 'online', 'players', 'onlinePlayers', 'players_online', 'player_count', 'playerCount']);

$maxPlayers = is_numeric($maxPlayersRaw) ? max(0, min(100000, (int) $maxPlayersRaw)) : 0;
$currentPlayers = is_numeric($currentPlayersRaw) ? max(0, min(100000, (int) $currentPlayersRaw)) : 0;

$gamemodeRaw = hb_get_first_present($input, ['gamemode', 'gameMode']);
$statusRaw = hb_get_first_present($input, ['status']);
$countryCodeRaw = hb_get_first_present($input, ['country_code', 'countryCode']);

$gamemode = trim((string) ($gamemodeRaw ?? ''));
$status = trim((string) ($statusRaw ?? ''));
$countryCode = strtoupper(trim((string) ($countryCodeRaw ?? '')));

$gamemode = substr($gamemode, 0, 100);
$status = substr($status, 0, 20);
$countryCode = substr($countryCode, 0, 2);

$hasIdentity = ($apiKey !== '') || ($serverUid !== '') || ($ip !== '' && $port > 0);
if (!$hasIdentity) {
    api_json(['error' => api_t('error_missing_identity')], 400);
}

if ($countryCode !== '' && !preg_match('/^[A-Z]{2}$/', $countryCode)) {
    api_json(['error' => api_t('error_country_code_invalid')], 400);
}

if ($status !== '' && !in_array($status, ['active', 'maintenance', 'draft'], true)) {
    $status = 'active';
}

if (!hb_load_config()) {
    api_json([
        'success' => true,
        'message' => api_t('success_heartbeat_received'),
        'warning' => api_t('warning_no_db_config'),
        'received_players' => $currentPlayers,
    ], 200);
}

// --- 2. Resolve Registration Mode ---
$allowAutoRegistration = defined('API_ALLOW_HEARTBEAT_REGISTRATION') ? (bool) API_ALLOW_HEARTBEAT_REGISTRATION : false;
$requiredToken = defined('API_HEARTBEAT_REGISTRATION_TOKEN') ? (string) API_HEARTBEAT_REGISTRATION_TOKEN : '';

if ($apiKey === '' && !$allowAutoRegistration) {
    api_json(['error' => api_t('error_api_key_empty')], 400);
}

if ($allowAutoRegistration && $requiredToken !== '' && !hash_equals($requiredToken, $registrationToken)) {
    api_json(['error' => api_t('error_registration_token_invalid')], 403);
}

// --- 3. Upsert into DB ---
try {
    $pdo = hb_db_connect();
    $pdo->beginTransaction();

    $findSql = 'SELECT id, api_key, server_uid, name, ip, port, max_players, current_players, gamemode, country_code, status
                FROM servers';
    $findParams = [];
    $matchedBy = 'none';

    if ($apiKey !== '') {
        $findSql .= ' WHERE api_key = :api_key';
        $findParams[':api_key'] = $apiKey;
        $matchedBy = 'api_key';
    } elseif ($serverUid !== '') {
        $findSql .= ' WHERE server_uid = :server_uid';
        $findParams[':server_uid'] = $serverUid;
        $matchedBy = 'server_uid';
    } elseif ($ip !== '' && $port > 0) {
        $findSql .= ' WHERE ip = :ip AND port = :port';
        $findParams[':ip'] = $ip;
        $findParams[':port'] = $port;
        $matchedBy = 'ip_port';
    }

    $findStmt = $pdo->prepare($findSql . ' LIMIT 1');
    $findStmt->execute($findParams);
    $existing = $findStmt->fetch();

    $now = date('Y-m-d H:i:s');
    $action = 'updated';

    if ($existing) {
        if ($matchedBy === 'api_key' && $serverUid !== '' && ($existing['server_uid'] ?? '') !== '' && $existing['server_uid'] !== $serverUid) {
            $pdo->rollBack();
            api_json(['error' => api_t('error_server_identity_conflict')], 409);
        }

        if ($matchedBy === 'server_uid' && $apiKey !== '' && ($existing['api_key'] ?? '') !== '' && $existing['api_key'] !== $apiKey) {
            $pdo->rollBack();
            api_json(['error' => api_t('error_server_identity_conflict')], 409);
        }

        $updateSql = 'UPDATE servers SET
            name = :name,
            ip = :ip,
            port = :port,
            max_players = :max_players,
            current_players = :current_players,
            gamemode = :gamemode,
            country_code = :country_code,
            status = :status,
            server_uid = :server_uid,
            last_heartbeat = :last_heartbeat,
            updated_at = :updated_at
            WHERE id = :id';

        $updateStmt = $pdo->prepare($updateSql);
        $updateStmt->execute([
            ':name' => ($name !== '') ? $name : $existing['name'],
            ':ip' => ($ip !== '') ? $ip : $existing['ip'],
            ':port' => ($port > 0) ? $port : (int) $existing['port'],
            ':max_players' => ($maxPlayers > 0) ? $maxPlayers : (int) $existing['max_players'],
            ':current_players' => $currentPlayers,
            ':gamemode' => ($gamemode !== '') ? $gamemode : ($existing['gamemode'] ?? null),
            ':country_code' => ($countryCode !== '') ? $countryCode : ($existing['country_code'] ?: 'ZZ'),
            ':status' => ($status !== '') ? $status : ($existing['status'] ?: 'active'),
            ':server_uid' => ($serverUid !== '') ? $serverUid : ($existing['server_uid'] ?? null),
            ':last_heartbeat' => $now,
            ':updated_at' => $now,
            ':id' => $existing['id'],
        ]);
    } else {
        if (!$allowAutoRegistration) {
            $pdo->rollBack();
            api_json(['error' => api_t('error_server_not_registered')], 404);
        }

        if ($name === '' || $ip === '' || $port <= 0 || $maxPlayers <= 0) {
            $pdo->rollBack();
            api_json(['error' => api_t('error_auto_register_missing_fields')], 400);
        }

        if ($apiKey === '') {
            $apiKey = bin2hex(random_bytes(16));
        }

        $insertSql = 'INSERT INTO servers
            (name, ip, port, country_code, max_players, current_players, gamemode, api_key, server_uid, source, status, last_heartbeat, created_at, updated_at)
            VALUES
            (:name, :ip, :port, :country_code, :max_players, :current_players, :gamemode, :api_key, :server_uid, :source, :status, :last_heartbeat, :created_at, :updated_at)';

        $insertStmt = $pdo->prepare($insertSql);
        $insertStmt->execute([
            ':name' => $name,
            ':ip' => $ip,
            ':port' => $port,
            ':country_code' => ($countryCode !== '') ? $countryCode : 'ZZ',
            ':max_players' => $maxPlayers,
            ':current_players' => $currentPlayers,
            ':gamemode' => ($gamemode !== '') ? $gamemode : null,
            ':api_key' => $apiKey,
            ':server_uid' => ($serverUid !== '') ? $serverUid : null,
            ':source' => 'heartbeat',
            ':status' => ($status !== '') ? $status : 'active',
            ':last_heartbeat' => $now,
            ':created_at' => $now,
            ':updated_at' => $now,
        ]);

        $action = 'created';
    }

    $pdo->commit();

    api_json([
        'success' => true,
        'message' => api_t('success_heartbeat_received'),
        'action' => $action,
        'api_key' => $apiKey,
        'server_uid' => $serverUid,
        'received_players' => $currentPlayers,
    ], 200);
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    api_json(['error' => api_t('error_db_write_failed')], 500);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    api_json(['error' => api_t('error_internal')], 500);
}

?>
