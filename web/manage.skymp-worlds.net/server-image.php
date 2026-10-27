<?php
require_once __DIR__ . '/includes/bootstrap.php';
require_once __DIR__ . '/includes/game-auth.php';
session_write_close();
header('Access-Control-Allow-Origin: *');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
try {
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'HEAD'], true)) { throw new GameAuthError(405, 'Methode nicht erlaubt.'); }
    $id = $_GET['server'] ?? '';
    $name = $_GET['asset'] ?? '';
    $revision = $_GET['v'] ?? '';
    if (!is_string($id) || !preg_match('/^[a-zA-Z0-9_-]{3,128}$/D', $id) || !is_string($name) || !in_array($name, ['logo', 'banner'], true)
        || !is_string($revision) || !preg_match('/^[a-f0-9]{64}$/D', $revision)) { throw new GameAuthError(404, 'Bild nicht gefunden.'); }
    $server = ga_server($id);
    if ($server === null) { throw new GameAuthError(404, 'Bild nicht gefunden.'); }
    $entry = ga_transaction(static function (array &$state) use ($server, $name, $revision): array {
        if (!ga_known_server($state, $server)) { throw new GameAuthError(404, 'Bild nicht gefunden.'); }
        $assets = ga_server_assets($state['heartbeats'][$server['id']]['assets'] ?? null);
        $asset = $assets[$name] ?? null;
        if (!$asset || !hash_equals($asset['sha256'], $revision)) { throw new GameAuthError(404, 'Bild nicht gefunden.'); }
        return ['asset' => $asset, 'resourceUrl' => ga_connection($state, $server)['resourceUrl']];
    });
    $etag = '"' . $revision . '"';
    header('ETag: ' . $etag);
    header('Cache-Control: public, max-age=300, must-revalidate');
    if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }
    $bytes = ga_remote_bytes($entry['resourceUrl'], $entry['asset']['path'] . '?v=' . $revision, $entry['asset']['size']);
    if (strlen($bytes) !== $entry['asset']['size'] || !hash_equals($revision, hash('sha256', $bytes))
        || substr($bytes, 0, 8) !== hex2bin('89504e470d0a1a0a') || substr($bytes, 12, 4) !== 'IHDR') { throw new GameAuthError(502, 'Serverbild ist ungültig.'); }
    $dimensions = unpack('Nwidth/Nheight', substr($bytes, 16, 8));
    if (!$dimensions['width'] || !$dimensions['height'] || $dimensions['width'] > 8192 || $dimensions['height'] > 8192 || $dimensions['width'] * $dimensions['height'] > 16777216) { throw new GameAuthError(502, 'Serverbild ist zu groß.'); }
    header('Content-Type: image/png');
    header('Content-Length: ' . strlen($bytes));
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'HEAD') { echo $bytes; }
} catch (GameAuthError $error) {
    http_response_code($error->status);
    header('Cache-Control: no-store');
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Serverbild nicht verfügbar.';
} catch (Throwable $error) {
    http_response_code(503);
    header('Cache-Control: no-store');
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Serverbild nicht verfügbar.';
}
