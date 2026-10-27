<?php
// Adapt historical POST /heartbeat.php bodies to the native master contract.
defined('SKYMP_NATIVE_LIBRARY_ONLY') || define('SKYMP_NATIVE_LIBRARY_ONLY', true);
require_once __DIR__ . '/native.php';
try {
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405); header('Allow: POST'); echo '{"error":"POST required."}'; return;
    }
    $raw = file_get_contents('php://input', false, null, 0, 16385);
    if ($raw === false || strlen($raw) > 16384) { http_response_code(413); echo '{"error":"Request too large."}'; return; }
    // Supports an older api/servers/index.php during a staggered upload too.
    $body = $GLOBALS['SKYMP_HEARTBEAT_INPUT'] ?? json_decode($raw, true);
    if (!is_array($body)) { http_response_code(400); echo '{"error":"JSON object required."}'; return; }
    $key = $body['api_key'] ?? $body['masterKey'] ?? $body['master_key'] ?? '';
    if (!is_string($key) || !preg_match('/^[a-zA-Z0-9_-]{12,128}$/D', $key)) { http_response_code(400); echo '{"error":"Valid server key required."}'; return; }
    unset($body['api_key'], $body['masterKey'], $body['master_key'], $body['registration_token'], $body['registrationToken']);
    [$status, $bytes] = native_master_request('POST', '/api/servers/' . $key, [], json_encode($body, JSON_THROW_ON_ERROR));
    http_response_code($status); echo $bytes;
} catch (Throwable $error) {
    http_response_code(502); echo '{"error":"PHP master unavailable. Check API_MANAGE_PUBLIC_URL and PHP cURL."}';
}
