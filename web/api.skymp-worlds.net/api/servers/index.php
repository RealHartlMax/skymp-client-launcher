<?php

// Old per-directory rewrites may reach this file after a partial upload.
// All native routes use the same dashboard-backed master as game sessions.
$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/api/servers', PHP_URL_PATH);
$suffix = '';
if (preg_match('~^/api/servers(?:/index\.php)?(/.*)?$~D', $path, $match)) {
    $suffix = $match[1] ?? '';
}
if ($suffix === '' || $suffix === '/') {
    $suffix = trim((string) ($_GET['masterKey'] ?? $_SERVER['PATH_INFO'] ?? ''), '/');
    $suffix = $suffix !== '' ? '/' . $suffix : '';
}
unset($_GET['masterKey']);
$_SERVER['REQUEST_URI'] = '/api/servers' . $suffix;
require __DIR__ . '/../../native.php';
