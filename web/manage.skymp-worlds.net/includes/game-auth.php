<?php
// The native protocol uses the existing dashboard identities and server ownership.
// No include paths, session cookies or private files are shared with another domain.

final class GameAuthError extends RuntimeException
{
    public function __construct(public int $status, string $message) { parent::__construct($message); }
}

require_once __DIR__ . '/server-assets.php';

function ga_directory(): string
{
    return defined('MANAGE_GAME_AUTH_DIRECTORY') ? (string) MANAGE_GAME_AUTH_DIRECTORY : dirname(__DIR__) . '/storage/game-auth';
}

function ga_master_url(): string
{
    return rtrim(defined('MANAGE_GAME_MASTER_URL') ? (string) MANAGE_GAME_MASTER_URL : 'https://api.skymp-worlds.net', '/');
}

function ga_transaction(callable $operation): mixed
{
    $directory = ga_directory();
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) { throw new RuntimeException('Auth storage unavailable.'); }
    $lock = fopen($directory . '/state.lock', 'c+b');
    if ($lock === false || !flock($lock, LOCK_EX)) { throw new RuntimeException('Auth lock unavailable.'); }
    $temporary = null;
    try {
        $file = $directory . '/state.json';
        $state = is_file($file) ? json_decode((string) file_get_contents($file), true, 64, JSON_THROW_ON_ERROR) : [];
        if (!is_array($state)) { throw new RuntimeException('Invalid auth storage.'); }
        foreach (['identities', 'tokens', 'handoffs', 'connections', 'heartbeats', 'limits', 'password_resets'] as $table) { $state[$table] ??= []; }
        $now = time();
        foreach (['tokens', 'handoffs', 'limits', 'password_resets'] as $table) {
            foreach ($state[$table] as $id => $entry) { if (($entry['expires'] ?? 0) <= $now) { unset($state[$table][$id]); } }
        }
        $result = $operation($state);
        $bytes = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $temporary = tempnam($directory, '.auth-');
        if ($temporary === false || file_put_contents($temporary, $bytes) !== strlen($bytes)) { throw new RuntimeException('Auth write failed.'); }
        @chmod($temporary, 0600);
        if (!rename($temporary, $file)) { throw new RuntimeException('Auth replace failed.'); }
        $temporary = null;
        return $result;
    } finally {
        if ($temporary !== null && is_file($temporary)) { unlink($temporary); }
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function ga_key(): string
{
    // Called under the state lock; the key and encrypted handoffs must be backed up together.
    $path = ga_directory() . '/master.key';
    if (!is_file($path)) {
        $handle = fopen($path, 'xb');
        if ($handle === false) { throw new RuntimeException('Auth key unavailable.'); }
        try { if (fwrite($handle, random_bytes(32)) !== 32) { throw new RuntimeException('Auth key write failed.'); } }
        finally { fclose($handle); }
        @chmod($path, 0600);
    }
    $key = file_get_contents($path);
    if ($key === false || strlen($key) !== 32) { throw new RuntimeException('Invalid auth key.'); }
    return $key;
}

function ga_seal(string $token): string
{
    $nonce = random_bytes(12);
    $encrypted = openssl_encrypt($token, 'aes-256-gcm', ga_key(), OPENSSL_RAW_DATA, $nonce, $tag, 'skymp-game-login', 16);
    if ($encrypted === false) { throw new RuntimeException('Auth encryption failed.'); }
    return base64_encode($nonce . $tag . $encrypted);
}

function ga_unseal(string $sealed): string
{
    $bytes = base64_decode($sealed, true);
    if ($bytes === false || strlen($bytes) < 29) { throw new RuntimeException('Invalid handoff.'); }
    $token = openssl_decrypt(substr($bytes, 28), 'aes-256-gcm', ga_key(), OPENSSL_RAW_DATA, substr($bytes, 0, 12), substr($bytes, 12, 16), 'skymp-game-login');
    if ($token === false) { throw new RuntimeException('Invalid handoff.'); }
    return $token;
}

function ga_state(string $state): string
{
    if (!preg_match('/^[a-f0-9]{64}$/D', $state)) { throw new GameAuthError(400, 'Ungültiger Anmeldestatus. Bitte die Anmeldung im Spiel erneut öffnen.'); }
    return hash('sha256', $state);
}

function ga_limit(string $action, int $maximum, int $seconds = 900): void
{
    $allowed = ga_transaction(static function (array &$state) use ($action, $maximum, $seconds): bool {
        $id = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . $action);
        $entry = $state['limits'][$id] ?? ['count' => 0, 'expires' => time() + $seconds];
        $entry['count']++;
        $state['limits'][$id] = $entry;
        return $entry['count'] <= $maximum;
    });
    if (!$allowed) { throw new GameAuthError(429, 'Zu viele Versuche. Bitte später erneut versuchen.'); }
}

function ga_user(string $id): ?array
{
    if (manage_db_is_enabled() && !manage_db_available()) { throw new GameAuthError(503, 'Kontodatenbank nicht erreichbar.'); }
    $user = manage_db_available() ? find_db_user_by_id($id) : find_user_by_id(load_state(), $id);
    if ($user === null || ($user['provider'] ?? '') === 'demo') { return null; }
    if (MANAGE_EMAIL_VERIFICATION_REQUIRED && ($user['provider'] ?? '') === 'email' && empty($user['email_verified_at'])) { return null; }
    return $user;
}

function ga_server(string $id, bool $byKey = false): ?array
{
    if (manage_db_is_enabled() && !manage_db_available()) { throw new GameAuthError(503, 'Serverdatenbank nicht erreichbar.'); }
    if (manage_db_available()) {
        $row = manage_db_fetch_one('SELECT * FROM manage_servers WHERE ' . ($byKey ? 'api_key' : 'id') . ' = :value LIMIT 1', [':value' => $id]);
        $server = $row ? db_server_row_to_state_row($row) : null;
    } else {
        $server = null;
        foreach (load_state()['servers'] as $candidate) {
            if (hash_equals((string) ($candidate[$byKey ? 'api_key' : 'id'] ?? ''), $id)) { $server = $candidate; break; }
        }
    }
    if ($server === null || empty($server['api_key'])) { return null; }
    return $server;
}

function ga_begin(string $rawState): void
{
    $id = ga_state($rawState);
    ga_limit('begin', 120);
    ga_transaction(static function (array &$state) use ($id): void { $state['handoffs'][$id] ??= ['expires' => time() + 600]; });
}

function ga_approve(string $rawState, array $user): void
{
    $id = ga_state($rawState);
    if (ga_user((string) $user['id']) === null) { throw new GameAuthError(403, 'Dieses Konto darf sich nicht am Spiel anmelden.'); }
    ga_transaction(static function (array &$state) use ($id, $user): void {
        $handoff = $state['handoffs'][$id] ?? null;
        if ($handoff === null) { throw new GameAuthError(410, 'Die Spielanmeldung ist abgelaufen. Bitte im Spiel erneut öffnen.'); }
        if (isset($handoff['user'])) {
            if ($handoff['user'] !== $user['id']) { throw new GameAuthError(409, 'Diese Spielanmeldung wurde bereits bestätigt.'); }
            return;
        }
        $token = bin2hex(random_bytes(32));
        $state['identities'][$user['id']] ??= count($state['identities']) + 1;
        $state['tokens'][hash('sha256', $token)] = ['kind' => 'login', 'user' => $user['id'], 'credential' => auth_credential_version($user), 'expires' => time() + 8 * 3600];
        $state['handoffs'][$id] = ['user' => $user['id'], 'token' => ga_seal($token), 'expires' => time() + 300];
    });
}

function ga_revoke_user(string $userId): void
{
    if (!is_dir(ga_directory())) { return; }
    ga_transaction(static function (array &$state) use ($userId): void {
        foreach (['tokens', 'handoffs'] as $table) {
            foreach ($state[$table] as $id => $entry) { if (($entry['user'] ?? '') === $userId) { unset($state[$table][$id]); } }
        }
    });
}

function ga_file_url(string $url, bool $runtime = false): string
{
    $url = rtrim(trim($url), '/');
    $parts = parse_url($url);
    if (!$parts || !in_array($parts['scheme'] ?? '', ['http', 'https'], true) || empty($parts['host']) || isset($parts['user'], $parts['pass']) || isset($parts['user']) || isset($parts['query']) || isset($parts['fragment']) || preg_match('/[\x00-\x20\x7f]/', $url)) { throw new GameAuthError(400, 'Bitte eine vollständige HTTP(S)-Dateiserver-URL ohne Zugangsdaten eingeben.'); }
    if ($runtime && !str_ends_with($parts['path'] ?? '', '/runtime-manifest.json') && !str_ends_with($parts['path'] ?? '', '/catalog.json')) { throw new GameAuthError(400, 'Bitte die URL einer runtime-manifest.json oder catalog.json eingeben.'); }
    return $url;
}

function ga_profile_text(string $text, int $maximum, string $label): string
{
    $text = trim($text);
    if (!preg_match('/^.{0,' . $maximum . '}$/suD', $text) || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $text)) {
        throw new GameAuthError(400, $label . ' darf höchstens ' . $maximum . ' Zeichen enthalten.');
    }
    return $text;
}

function ga_profile_url(string $value, bool $image = false): string
{
    $url = trim($value);
    if ($url === '') { return ''; }
    $parts = parse_url($url);
    if (strlen($url) > 2048 || !filter_var($url, FILTER_VALIDATE_URL) || !$parts
        || !in_array(strtolower($parts['scheme'] ?? ''), $image ? ['https'] : ['http', 'https'], true)
        || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || preg_match('/[\x00-\x20\x7f]/', $url)) {
        throw new GameAuthError(400, $image ? 'Bilder benötigen eine vollständige HTTPS-Adresse ohne Zugangsdaten.' : 'Community-Links benötigen eine vollständige HTTP(S)-Adresse ohne Zugangsdaten.');
    }
    return $url;
}

function ga_profile(array $input): array
{
    $tags = array_values(array_unique(array_filter(array_map('trim', explode(',', (string) ($input['tags'] ?? ''))), static fn(string $tag): bool => $tag !== '')));
    if (count($tags) > 8) { throw new GameAuthError(400, 'Bitte höchstens acht Tags eingeben.'); }
    foreach ($tags as $tag) { ga_profile_text($tag, 32, 'Ein Tag'); }
    return ['description' => ga_profile_text((string) ($input['description'] ?? ''), 2000, 'Die Beschreibung'), 'tags' => $tags,
        'website' => ga_profile_url((string) ($input['website'] ?? '')), 'discordUrl' => ga_profile_url((string) ($input['discord_url'] ?? ''))];
}

function ga_connection(array $state, array $server): array
{
    $host = (string) $server['ip'];
    if (str_contains($host, ':') && $host[0] !== '[') { $host = '[' . $host . ']'; }
    $defaults = ['resourceUrl' => 'http://' . $host . ':8080', 'runtimeSource' => '', 'description' => '', 'tags' => [], 'website' => '', 'discordUrl' => ''];
    return array_replace($defaults, array_intersect_key($state['connections'][$server['id']] ?? [], $defaults));
}

function ga_reported_metadata(array $state, array $server): array
{
    $heartbeat = $state['heartbeats'][$server['id']] ?? [];
    $authenticated = !empty($server['api_key']) && hash_equals(hash('sha256', (string) $server['api_key']), (string) ($heartbeat['key'] ?? ''));
    return [
        'name' => $authenticated && isset($heartbeat['name']) ? (string) $heartbeat['name'] : t('server_metadata_pending'),
        'max_players' => $authenticated ? (int) ($heartbeat['capacity'] ?? 0) : 0,
    ];
}

function ga_public(array $state, array $server): array
{
    $heartbeat = $state['heartbeats'][$server['id']] ?? [];
    $reported = ga_reported_metadata($state, $server);
    $online = ga_active($state, $server);
    return ['id' => $server['id'], 'name' => $reported['name'], 'ip' => $server['ip'], 'port' => (int) $server['port'],
        'current_players' => $online ? ($heartbeat['players'] ?? 0) : 0, 'max_players' => $reported['max_players'],
        'server_status' => $online ? 'online' : 'offline', 'last_heartbeat' => gmdate(DATE_ATOM, (int) ($heartbeat['time'] ?? 0)),
        'country_code' => $server['country_code'] ?? '', 'gamemode' => $server['gamemode'] ?? '',
        'masterUrl' => ga_master_url(), 'masterKey' => $server['id'], 'offlineMode' => false, ...ga_connection($state, $server), ...ga_asset_urls($state, $server)];
}

function ga_known_server(array $state, array $server): bool
{
    $heartbeat = $state['heartbeats'][$server['id']] ?? [];
    return ($server['status'] ?? '') === 'active' && isset($heartbeat['name'], $heartbeat['capacity']) && ($heartbeat['time'] ?? 0) > 0
        && hash_equals(hash('sha256', (string) $server['api_key']), (string) ($heartbeat['key'] ?? ''));
}

function ga_active(array $state, array $server): bool
{
    $heartbeat = $state['heartbeats'][$server['id']] ?? [];
    return ga_known_server($state, $server) && ($heartbeat['time'] ?? 0) > time() - 300
        && ($heartbeat['server_status'] ?? 'online') !== 'offline';
}

function ga_heartbeat_status(array $state, array $server): array
{
    $heartbeat = $state['heartbeats'][$server['id']] ?? [];
    $received = (int) ($heartbeat['time'] ?? 0);
    $sameKey = !empty($server['api_key']) && hash_equals(hash('sha256', (string) $server['api_key']), (string) ($heartbeat['key'] ?? ''));
    $status = empty($server['api_key']) ? 'key_missing'
        : (($server['status'] ?? '') !== 'active' ? 'inactive'
        : ($received === 0 ? 'missing' : (!$sameKey ? 'key_changed'
        : ($received <= time() - 300 ? 'expired' : (($heartbeat['server_status'] ?? 'online') === 'offline' ? 'offline' : 'ready')))));
    $reported = ga_reported_metadata($state, $server);
    return [
        ...$reported,
        'heartbeat_status' => $status,
        'last_heartbeat' => $received > 0 ? gmdate(DATE_ATOM, $received) : null,
        'current_players' => $status === 'ready' ? (int) ($heartbeat['players'] ?? 0) : 0,
        'heartbeat_capacity' => $reported['max_players'],
    ];
}

function ga_owner_heartbeat_statuses(array $servers): array
{
    if (!$servers) { return []; }
    try {
        return ga_transaction(static fn(array &$state): array => array_map(
            static fn(array $server): array => array_replace($server, ga_heartbeat_status($state, $server)), $servers
        ));
    } catch (Throwable $error) {
        // Keep the account UI available while auth storage needs attention.
        return array_map(static fn(array $server): array => array_replace($server, [
            'name' => t('server_metadata_pending'), 'max_players' => 0, 'heartbeat_capacity' => 0,
            'heartbeat_status' => 'unavailable', 'last_heartbeat' => null, 'current_players' => 0
        ]), $servers);
    }
}

function ga_public_ip(string $address): bool
{
    if (!filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) { return false; }
    $packed = inet_pton($address);
    if ($packed === false) { return false; }
    if (strlen($packed) === 16) {
        // Only global unicast. Reject mapped IPv4, multicast, transition and documentation ranges.
        return (ord($packed[0]) & 0xe0) === 0x20 && substr($packed, 0, 4) !== hex2bin('20010db8')
            && substr($packed, 0, 2) !== hex2bin('2002') && substr($packed, 0, 4) !== hex2bin('20010000');
    }
    $octets = array_map('ord', str_split($packed));
    if ($octets[0] === 0 || $octets[0] >= 224 || ($octets[0] === 100 && $octets[1] >= 64 && $octets[1] <= 127)) { return false; }
    foreach ([[192,0,0],[192,0,2],[192,88,99],[198,51,100],[203,0,113]] as $range) { if (array_slice($octets, 0, 3) === $range) { return false; } }
    return !($octets[0] === 198 && in_array($octets[1], [18,19], true));
}

function ga_manifest(string $base): array
{
    $bytes = ga_remote_bytes($base, '/manifest.json', 8 * 1024 * 1024);
    $manifest = json_decode($bytes, true);
    if (!is_array($manifest) || ($manifest['versionMajor'] ?? null) !== 1 || !is_array($manifest['loadOrder'] ?? null) || !is_array($manifest['mods'] ?? null)) { throw new GameAuthError(502, 'Ungültiges Servermanifest.'); }
    return $manifest;
}

function ga_dispatch(string $method, string $path, array $query, array $body, string $authorization): mixed
{
    if ($method === 'GET' && $path === '/health') {
        if (!function_exists('openssl_encrypt') || !function_exists('curl_init')) { throw new GameAuthError(503, 'PHP-cURL und OpenSSL müssen aktiviert sein.'); }
        ga_transaction(static fn(array &$state): bool => strlen(ga_key()) === 32);
        return ['ok' => true, 'auth' => true, 'demo' => false, 'runtime' => 'php'];
    }
    if ($method === 'GET' && $path === '/list.php') {
        return ga_transaction(static function (array &$state): array {
            $list = [];
            foreach ($state['heartbeats'] as $id => $_) {
                $server = ga_server((string) $id);
                if ($server !== null && ga_known_server($state, $server)) { $list[] = ga_public($state, $server); }
            }
            usort($list, static fn($a, $b) => (($a['server_status'] === 'offline') <=> ($b['server_status'] === 'offline')) ?: ($b['current_players'] <=> $a['current_players']) ?: strcmp($a['name'], $b['name']));
            return $list;
        });
    }
    if ($method === 'GET' && $path === '/api/users/login-discord/status') {
        $id = ga_state((string) ($query['state'] ?? ''));
        ga_limit('status|' . $id, 300, 60);
        return ga_transaction(static function (array &$state) use ($id): array {
            $handoff = $state['handoffs'][$id] ?? [];
            if (empty($handoff['token'])) { throw new GameAuthError(401, 'Wartet auf Anmeldung.'); }
            $token = ga_unseal($handoff['token']);
            $login = $state['tokens'][hash('sha256', $token)] ?? [];
            $user = ga_user((string) ($login['user'] ?? ''));
            if (($login['kind'] ?? '') !== 'login' || $user === null || !hash_equals((string) ($login['credential'] ?? ''), auth_credential_version($user))) { throw new GameAuthError(401, 'Anmeldung ist abgelaufen.'); }
            return ['token' => $token, 'masterApiId' => $state['identities'][$user['id']], 'discordUsername' => $user['display_name'] ?? $user['login_name'], 'discordDiscriminator' => null, 'discordAvatar' => null];
        });
    }
    if ($method === 'POST' && preg_match('~^/api/users/me/play/([a-zA-Z0-9_-]{3,128})$~D', $path, $match)) {
        ga_limit('play', 240, 60);
        $token = preg_replace('/^Bearer\s+/i', '', trim($authorization));
        return ga_transaction(static function (array &$state) use ($match, $token): array {
            $login = $state['tokens'][hash('sha256', $token)] ?? [];
            $user = ga_user((string) ($login['user'] ?? ''));
            if (($login['kind'] ?? '') !== 'login' || $user === null || !hash_equals((string) ($login['credential'] ?? ''), auth_credential_version($user))) { throw new GameAuthError(401, 'Spielanmeldung ist abgelaufen.'); }
            $server = ga_server($match[1]);
            if ($server === null || !ga_active($state, $server)) { throw new GameAuthError(404, 'Server ist nicht aktiv.'); }
            $session = bin2hex(random_bytes(32));
            $state['tokens'][hash('sha256', $session)] = ['kind' => 'play', 'user' => $login['user'], 'credential' => $login['credential'], 'server' => $server['id'], 'key' => hash('sha256', $server['api_key']), 'expires' => $login['expires']];
            return ['session' => $session];
        });
    }
    if ($method === 'GET' && preg_match('~^/api/servers/([a-zA-Z0-9_-]{12,128})/sessions/([a-f0-9]{64})$~D', $path, $match)) {
        $server = ga_server($match[1], true);
        return ga_transaction(static function (array &$state) use ($match, $server): array {
            $session = $state['tokens'][hash('sha256', $match[2])] ?? [];
            $user = ga_user((string) ($session['user'] ?? ''));
            if ($server === null || !ga_active($state, $server) || ($session['kind'] ?? '') !== 'play' || ($session['server'] ?? '') !== $server['id'] || !hash_equals((string) ($session['key'] ?? ''), hash('sha256', $server['api_key'])) || $user === null || !hash_equals((string) ($session['credential'] ?? ''), auth_credential_version($user))) { throw new GameAuthError(401, 'Ungültige Spielsitzung.'); }
            return ['user' => ['id' => $state['identities'][$user['id']], 'name' => $user['display_name'] ?? $user['login_name'], 'username' => $user['display_name'] ?? $user['login_name'], 'discordId' => $user['discord_id'] ?? null]];
        });
    }
    if ($method === 'GET' && preg_match('~^/api/servers/([a-zA-Z0-9_-]{3,128})/(manifest\.json|serverinfo)$~D', $path, $match)) {
        $server = ga_server($match[1]);
        if ($server === null) { throw new GameAuthError(404, 'Server nicht gefunden.'); }
        $entry = ga_transaction(static fn(array &$state): array => ga_public($state, $server));
        return $match[2] === 'serverinfo' ? $entry : ga_manifest($entry['resourceUrl']);
    }
    if ($method === 'POST' && preg_match('~^/api/servers/([a-zA-Z0-9_-]{12,128})$~D', $path, $match)) {
        ga_limit('heartbeat|' . hash('sha256', $match[1]), 240, 60);
        $server = ga_server($match[1], true);
        if ($server === null) { throw new GameAuthError(401, 'Server-Schlüssel ist ungültig.'); }
        $uid = $body['server_uid'] ?? $body['serverUid'] ?? $server['id'];
        if ($uid !== $server['id']) { throw new GameAuthError(400, 'serverUid stimmt nicht mit der öffentlichen Server-ID überein.'); }
        $name = $body['name'] ?? null;
        if (!is_string($name) || !preg_match('/\A[^\x00-\x1f\x7f]{1,255}\z/uD', trim($name))) { throw new GameAuthError(400, 'Der Server muss einen gültigen Namen melden.'); }
        $name = trim($name);
        $serverStatus = $body['serverStatus'] ?? 'online';
        if (!is_string($serverStatus) || !in_array($serverStatus, ['online', 'offline'], true)) { throw new GameAuthError(400, 'Ungültiger Serverstatus.'); }
        $capacity = filter_var($body['maxPlayers'] ?? $body['max_players'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 4096]]);
        $players = filter_var($body['online'] ?? $body['current_players'] ?? 0, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => $capacity ?: 4096]]);
        if ($capacity === false || $players === false) { throw new GameAuthError(400, 'Ungültige Spielerzahl.'); }
        $assets = ga_server_assets($body['assets'] ?? null);
        ga_transaction(static function (array &$state) use ($server, $name, $serverStatus, $capacity, $players, $assets): void { $state['heartbeats'][$server['id']] = ['time' => time(), 'key' => hash('sha256', $server['api_key']), 'name' => $name, 'server_status' => $serverStatus, 'players' => $serverStatus === 'offline' ? 0 : $players, 'capacity' => $capacity, 'assets' => $assets]; });
        return ['ok' => true];
    }
    throw new GameAuthError(404, 'Route nicht gefunden.');
}
