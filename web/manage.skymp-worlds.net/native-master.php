<?php
require_once __DIR__ . '/includes/bootstrap.php';
require_once __DIR__ . '/includes/game-auth.php';
require_once __DIR__ . '/includes/launcher-auth.php';
session_write_close();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($method === 'OPTIONS') { http_response_code(204); exit; }
    $path = (string) ($_GET['route'] ?? '');
    $raw = file_get_contents('php://input', false, null, 0, 16385);
    if ($raw === false || strlen($raw) > 16384) { throw new GameAuthError(413, 'Anfrage zu groß.'); }
    $body = $raw === '' ? [] : json_decode($raw, true);
    if (!is_array($body)) { throw new GameAuthError(400, 'Ungültiges JSON.'); }
    $authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (strlen($authorization) > 256) { throw new GameAuthError(400, 'Ungültige Anmeldung.'); }
    $result = str_starts_with($path, '/api/users/launcher/') ? la_dispatch($method, $path, $_GET, $authorization) : ga_dispatch($method, $path, $_GET, $body, $authorization);
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
} catch (GameAuthError $error) {
    http_response_code($error->status);
    echo json_encode(['error' => $error->getMessage()], JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    http_response_code(500);
    // Never expose a credential-bearing URL, key, database error or filesystem path.
    echo json_encode(['error' => 'Anmeldedienst nicht verfügbar. Bitte die PHP-Konfiguration und den privaten Speicher prüfen.'], JSON_UNESCAPED_UNICODE);
}
