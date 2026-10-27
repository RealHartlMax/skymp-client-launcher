<?php
// api.skymp-worlds.net/list.php

require_once __DIR__ . '/i18n.php';

/**
 * list.php
 * 
 * This script retrieves the list of active game servers from the database
 * and returns them as a JSON object.
 * 
 * An "active" server is one that has sent a heartbeat within a defined interval
 * (e.g., the last 5 minutes).
 */

header('Content-Type: application/json; charset=utf-8');
header('Content-Language: ' . api_detect_language());
header('Access-Control-Allow-Origin: *'); // For development, allow all origins. For production, restrict this to the domains of the launcher and web-browser.

function list_load_config(): bool
{
    $configPath = __DIR__ . '/config.php';
    if (!is_file($configPath)) {
        return false;
    }

    require_once $configPath;

    return defined('DB_HOST') && defined('DB_NAME') && defined('DB_USER') && defined('DB_PASS');
}

function list_db_connect(): PDO
{
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    return new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

$hasLegacyConfig = list_load_config();
defined('SKYMP_NATIVE_LIBRARY_ONLY') || define('SKYMP_NATIVE_LIBRARY_ONLY', true);
require_once __DIR__ . '/native.php';
$nativeServers = null;
try {
    [$nativeStatus, $nativeBytes] = native_master_request('GET', '/list.php');
    $nativeData = json_decode($nativeBytes, true);
    if ($nativeStatus === 200 && is_array($nativeData) && array_is_list($nativeData)) { $nativeServers = $nativeData; }
} catch (Throwable $error) { /* Existing registry remains available during a partial upload. */ }
$servers = [];

try {
    if (!$hasLegacyConfig) { throw new PDOException('Legacy registry is not configured.'); }
    $pdo = list_db_connect();
    $activeIntervalMinutes = defined('API_ACTIVE_INTERVAL_MINUTES') ? (int) API_ACTIVE_INTERVAL_MINUTES : 5;
    if ($activeIntervalMinutes < 1) {
        $activeIntervalMinutes = 5;
    }

    $sql = 'SELECT name, ip, port, max_players, current_players, country_code, gamemode, status, last_heartbeat
            FROM servers
            WHERE last_heartbeat >= (NOW() - INTERVAL :active_minutes MINUTE)
              AND status <> :draft_status
            ORDER BY current_players DESC, name ASC';

    $stmt = $pdo->prepare($sql);
    $stmt->bindValue(':active_minutes', $activeIntervalMinutes, PDO::PARAM_INT);
    $stmt->bindValue(':draft_status', 'draft', PDO::PARAM_STR);
    $stmt->execute();

    $servers = $stmt->fetchAll();
} catch (PDOException $e) {
    if ($nativeServers === null) { api_json(['error' => api_t($hasLegacyConfig ? 'error_db_read_failed' : 'error_db_config_missing')], $hasLegacyConfig ? 500 : 503); }
}

// Prefer the native heartbeat's connection metadata when both registries contain an address.
$byAddress = [];
foreach (array_merge($servers, $nativeServers ?? []) as $server) {
    $byAddress[strtolower((string) $server['ip']) . ':' . (int) $server['port']] = $server;
}
api_json(array_values($byAddress));

?>
