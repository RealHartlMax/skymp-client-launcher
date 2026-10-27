<?php
// Image locations come only from authenticated heartbeats, never from query URLs.
function ga_server_assets(mixed $input): array
{
    if ($input === null) { return []; }
    if (!is_array($input) || count($input) > 2) { throw new GameAuthError(400, 'Ungültige Serverbilder.'); }
    $result = [];
    foreach ($input as $name => $asset) {
        if (!in_array($name, ['logo', 'banner'], true) || !is_array($asset)
            || ($asset['path'] ?? '') !== '/api/launcher/assets/' . $name . '.png'
            || !is_string($asset['sha256'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $asset['sha256'])
            || !is_int($asset['size'] ?? null) || $asset['size'] < 33 || $asset['size'] > 8 * 1024 * 1024) {
            throw new GameAuthError(400, 'Ungültige Serverbilder.');
        }
        $result[$name] = ['path' => $asset['path'], 'sha256' => $asset['sha256'], 'size' => $asset['size']];
    }
    return $result;
}

function ga_asset_urls(array $state, array $server): array
{
    $assets = ga_server_assets($state['heartbeats'][$server['id']]['assets'] ?? null);
    $base = rtrim((string) MANAGE_PUBLIC_URL, '/') ?: 'https://manage.skymp-worlds.net';
    $urls = ['iconUrl' => '', 'bannerUrl' => ''];
    foreach (['logo' => 'iconUrl', 'banner' => 'bannerUrl'] as $name => $field) {
        if (isset($assets[$name])) {
            $urls[$field] = $base . app_url('server-image.php') . '?' . http_build_query([
                'server' => $server['id'], 'asset' => $name, 'v' => $assets[$name]['sha256'],
            ]);
        }
    }
    return $urls;
}

function ga_remote_bytes(string $base, string $suffix, int $maximum): string
{
    if (!function_exists('curl_init')) { throw new GameAuthError(503, 'PHP-cURL fehlt.'); }
    $url = ga_file_url($base) . $suffix;
    $host = trim((string) parse_url($url, PHP_URL_HOST), '[]');
    $port = (int) (parse_url($url, PHP_URL_PORT) ?: (str_starts_with($url, 'https:') ? 443 : 80));
    $addresses = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : [];
    if (!$addresses) {
        foreach (dns_get_record($host, DNS_A | DNS_AAAA) ?: [] as $record) { $addresses[] = $record['ip'] ?? $record['ipv6'] ?? ''; }
    }
    if (!$addresses) { throw new GameAuthError(502, 'Dateiserver kann nicht aufgelöst werden.'); }
    if (!(defined('MANAGE_GAME_ALLOW_PRIVATE_RESOURCES') && MANAGE_GAME_ALLOW_PRIVATE_RESOURCES)) {
        foreach ($addresses as $address) { if (!ga_public_ip($address)) { throw new GameAuthError(502, 'Dateiserver benötigt eine öffentliche IP-Adresse.'); } }
    }
    $handle = curl_init($url);
    $bytes = '';
    $address = str_contains($addresses[0], ':') ? '[' . $addresses[0] . ']' : $addresses[0];
    curl_setopt_array($handle, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '', CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 10,
        CURLOPT_RESOLVE => [$host . ':' . $port . ':' . $address], CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$bytes, $maximum): int {
            if (strlen($bytes) + strlen($chunk) > $maximum) { return 0; } $bytes .= $chunk; return strlen($chunk);
        }]);
    try { $ok = curl_exec($handle); $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE); }
    finally { curl_close($handle); }
    if ($ok === false || $status !== 200) { throw new GameAuthError(502, 'Serverdatei kann nicht geladen werden.'); }
    return $bytes;
}
