<?php
// HTTP bridge to the dashboard's native master. The two document roots are independent.
$configPath = __DIR__ . '/config.php';
if (is_file($configPath)) { require_once $configPath; }
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

function native_manage_url(): string
{
    $base = rtrim(defined('API_MANAGE_PUBLIC_URL') ? (string) API_MANAGE_PUBLIC_URL : 'https://manage.skymp-worlds.net', '/');
    $parts = parse_url($base);
    if (!$parts || isset($parts['user']) || isset($parts['query']) || isset($parts['fragment']) || !in_array($parts['scheme'] ?? '', ['http', 'https'], true)
        || (($parts['scheme'] ?? '') !== 'https' && !in_array($parts['host'] ?? '', ['127.0.0.1', 'localhost', '[::1]'], true))) { throw new RuntimeException('Invalid management URL.'); }
    return $base;
}

function native_master_request(string $method, string $path, array $query = [], string $body = '', string $authorization = ''): array
{
    if (!function_exists('curl_init')) { throw new RuntimeException('PHP cURL is required.'); }
    unset($query['route']);
    $url = native_manage_url() . '/native-master.php?' . http_build_query(['route' => $path] + $query);
    $handle = curl_init($url);
    $bytes = '';
    $headers = ['Content-Type: application/json'];
    if ($authorization !== '') { $headers[] = 'Authorization: ' . $authorization; }
    curl_setopt_array($handle, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '', CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => $headers, CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$bytes): int { if (strlen($bytes) + strlen($chunk) > 8 * 1024 * 1024) { return 0; } $bytes .= $chunk; return strlen($chunk); }]);
    if ($method === 'POST') { curl_setopt($handle, CURLOPT_POSTFIELDS, $body === '' ? '{}' : $body); }
    try { $ok = curl_exec($handle); $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE); }
    finally { curl_close($handle); }
    if ($ok === false || $status < 200 || $status >= 600 || json_decode($bytes) === null) { throw new RuntimeException('Management auth service unavailable.'); }
    return [$status, $bytes];
}

if (!defined('SKYMP_NATIVE_LIBRARY_ONLY')) {
    try {
        $path = rtrim((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/');
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        if ($method === 'OPTIONS') { http_response_code(204); exit; }
        if ($method === 'GET' && $path === '/account') { header('Location: ' . native_manage_url() . '/index.php', true, 302); exit; }
        if ($method === 'GET' && $path === '/api/users/login-discord') {
            $state = (string) ($_GET['state'] ?? '');
            if (!preg_match('/^[a-f0-9]{64}$/D', $state)) { http_response_code(400); echo json_encode(['error' => 'Ungültiger Anmeldestatus.']); exit; }
            header('Location: ' . native_manage_url() . '/game-login.php?state=' . $state, true, 302); exit;
        }
        if (!preg_match('~^/(health|api/users/launcher/(?:status|me|logout)|api/users/login-discord/status|api/users/me/play/[a-zA-Z0-9_-]{3,128}|api/servers(?:/[a-zA-Z0-9_-]{3,128}(?:/(?:manifest\.json|serverinfo|sessions/[a-f0-9]{64}))?)?)$~D', $path)) { http_response_code(404); echo '{"error":"Route nicht gefunden."}'; exit; }
        $body = file_get_contents('php://input', false, null, 0, 16385);
        $authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if ($body === false || strlen($body) > 16384 || strlen($authorization) > 256 || preg_match('/[\r\n]/', $authorization)) { http_response_code(413); echo '{"error":"Anfrage zu gross."}'; exit; }
        [$status, $bytes] = native_master_request($method, $path === '/api/servers' ? '/list.php' : $path, $_GET, $body, $authorization);
        http_response_code($status); echo $bytes;
    } catch (Throwable $error) { http_response_code(502); echo json_encode(['error' => 'PHP-Anmeldedienst nicht erreichbar. API_MANAGE_PUBLIC_URL und PHP-cURL prüfen.'], JSON_UNESCAPED_UNICODE); }
}
