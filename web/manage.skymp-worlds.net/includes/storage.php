<?php
function default_state(): array
{
    return [
        'users' => [],
        'servers' => [],
    ];
}

function ensure_storage_file_exists(): void
{
    $storageFile = MANAGE_STORAGE_FILE;
    $storageDirectory = dirname($storageFile);

    if (!is_dir($storageDirectory)) {
        mkdir($storageDirectory, 0775, true);
    }

    if (!is_file($storageFile)) {
        file_put_contents(
            $storageFile,
            json_encode(default_state(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            LOCK_EX
        );
    }
}

function load_state(): array
{
    ensure_storage_file_exists();

    $raw = file_get_contents(MANAGE_STORAGE_FILE);

    if ($raw === false || trim($raw) === '') {
        return default_state();
    }

    $state = json_decode($raw, true);

    if (!is_array($state)) {
        return default_state();
    }

    $state['users'] = array_values(is_array($state['users'] ?? null) ? $state['users'] : []);
    $state['servers'] = array_values(is_array($state['servers'] ?? null) ? $state['servers'] : []);

    return $state;
}

function save_state(array $state): void
{
    if (manage_db_available()) {
        return;
    }

    storage_transaction(static function (array &$current) use ($state): void { $current = $state; });
}

// Read and replace under one lock so a reset cannot consume the same credential twice.
function storage_transaction(callable $operation): mixed
{
    if (manage_db_is_enabled()) { throw new RuntimeException('JSON account storage is disabled.'); }
    ensure_storage_file_exists();
    $lock = fopen(MANAGE_STORAGE_FILE . '.lock', 'c+b');
    if ($lock === false || !flock($lock, LOCK_EX)) { throw new RuntimeException('Account storage lock unavailable.'); }
    $temporary = null;
    try {
        $state = json_decode((string) file_get_contents(MANAGE_STORAGE_FILE), true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($state) || !is_array($state['users'] ?? null) || !is_array($state['servers'] ?? null)) { throw new RuntimeException('Invalid account storage.'); }
        $result = $operation($state);
        $payload = json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $temporary = tempnam(dirname(MANAGE_STORAGE_FILE), '.accounts-');
        if ($temporary === false || file_put_contents($temporary, $payload) !== strlen($payload)) { throw new RuntimeException('Account write failed.'); }
        @chmod($temporary, 0600);
        if (!rename($temporary, MANAGE_STORAGE_FILE)) { throw new RuntimeException('Account replace failed.'); }
        $temporary = null;
        return $result;
    } finally {
        if ($temporary !== null && is_file($temporary)) { unlink($temporary); }
        flock($lock, LOCK_UN); fclose($lock);
    }
}

function find_user_by_login(array $state, string $loginName): ?array
{
    foreach ($state['users'] as $user) {
        if (($user['login_name'] ?? '') === $loginName) {
            return $user;
        }
    }

    return null;
}

function find_user_by_email(array $state, string $email): ?array
{
    foreach ($state['users'] as $user) {
        if (strtolower((string) ($user['email'] ?? '')) === strtolower($email)) {
            return $user;
        }
    }

    return null;
}

function find_user_by_id(array $state, string $userId): ?array
{
    foreach ($state['users'] as $user) {
        if (($user['id'] ?? '') === $userId) {
            return $user;
        }
    }

    return null;
}

function servers_for_owner(array $state, string $ownerId): array
{
    if (manage_db_available()) {
        $rows = manage_db_fetch_all(
            'SELECT * FROM manage_servers WHERE owner_id = :owner_id ORDER BY name ASC',
            [':owner_id' => $ownerId]
        );

        return array_values(array_map('db_server_row_to_state_row', $rows));
    }

    $servers = array_values(array_filter(
        $state['servers'],
        static fn(array $server): bool => ($server['owner_id'] ?? '') === $ownerId
    ));

    usort(
        $servers,
        static fn(array $left, array $right): int => strcmp((string) ($left['name'] ?? ''), (string) ($right['name'] ?? ''))
    );

    return $servers;
}

function server_count_for_owner(array $state, string $ownerId): int
{
    if (manage_db_available()) {
        $row = manage_db_fetch_one(
            'SELECT COUNT(*) AS total FROM manage_servers WHERE owner_id = :owner_id',
            [':owner_id' => $ownerId]
        );

        return (int) ($row['total'] ?? 0);
    }

    return count(array_filter(
        $state['servers'],
        static fn(array $server): bool => ($server['owner_id'] ?? '') === $ownerId
    ));
}

function find_server_index(array $state, string $serverId): ?int
{
    foreach ($state['servers'] as $index => $server) {
        if (($server['id'] ?? '') === $serverId) {
            return $index;
        }
    }

    return null;
}

function find_server_by_id(array $state, string $serverId): ?array
{
    if (manage_db_available()) {
        $row = manage_db_fetch_one(
            'SELECT * FROM manage_servers WHERE id = :id LIMIT 1',
            [':id' => $serverId]
        );

        return $row ? db_server_row_to_state_row($row) : null;
    }

    $index = find_server_index($state, $serverId);

    return $index === null ? null : $state['servers'][$index];
}

function generate_server_id(): string
{
    return 'srv_' . bin2hex(random_bytes(8));
}

function generate_api_key(): string
{
    return 'skymp_live_' . bin2hex(random_bytes(32));
}

function validate_server_payload(array $payload): array
{
    $ip = trim((string) ($payload['ip'] ?? ''));
    $port = filter_var($payload['port'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);
    $countryCode = strtoupper(trim((string) ($payload['country_code'] ?? '')));
    $gamemode = trim((string) ($payload['gamemode'] ?? ''));
    $notes = trim((string) ($payload['notes'] ?? ''));
    $status = trim((string) ($payload['status'] ?? 'active'));
    $allowedStatuses = ['active', 'maintenance', 'draft'];

    if ($ip === '' || (!filter_var($ip, FILTER_VALIDATE_IP) && !preg_match('/^[a-zA-Z0-9.-]+$/', $ip))) {
        throw new InvalidArgumentException(t('validation_invalid_host'));
    }

    if ($port === false) {
        throw new InvalidArgumentException(t('validation_invalid_port'));
    }

    if (!preg_match('/^[A-Z]{2}$/', $countryCode)) {
        throw new InvalidArgumentException(t('validation_invalid_country_code'));
    }

    if (!in_array($status, $allowedStatuses, true)) {
        throw new InvalidArgumentException(t('validation_invalid_status'));
    }

    return [
        'ip' => $ip,
        'port' => $port,
        'country_code' => $countryCode,
        'gamemode' => $gamemode,
        'notes' => $notes,
        'status' => $status,
    ];
}

function upsert_server(array &$state, string $ownerId, array $payload): array
{
    $now = (new DateTimeImmutable())->format(DateTimeInterface::ATOM);
    $nowSql = atom_to_mysql_datetime($now);
    $serverId = trim((string) ($payload['server_id'] ?? ''));
    $validated = validate_server_payload($payload);

    if (manage_db_available()) {
        if ($serverId !== '') {
            $existingRow = manage_db_fetch_one(
                'SELECT * FROM manage_servers WHERE id = :id LIMIT 1',
                [':id' => $serverId]
            );

            if ($existingRow !== null) {
                if ((string) ($existingRow['owner_id'] ?? '') !== $ownerId) {
                    throw new InvalidArgumentException(t('validation_permission_edit'));
                }

                $updated = manage_db_execute(
                    'UPDATE manage_servers
                     SET ip = :ip,
                         port = :port,
                         country_code = :country_code,
                         gamemode = :gamemode,
                         notes = :notes,
                         status = :status,
                         updated_at = :updated_at
                     WHERE id = :id',
                    [
                        ':ip' => $validated['ip'],
                        ':port' => $validated['port'],
                        ':country_code' => $validated['country_code'],
                        ':gamemode' => $validated['gamemode'],
                        ':notes' => $validated['notes'],
                        ':status' => $validated['status'],
                        ':updated_at' => $nowSql,
                        ':id' => $serverId,
                    ]
                );

                if (!$updated) {
                    throw new RuntimeException('Failed to update server in DB.');
                }

                $row = manage_db_fetch_one('SELECT * FROM manage_servers WHERE id = :id LIMIT 1', [':id' => $serverId]);
                if ($row === null) {
                    throw new RuntimeException('Updated server not found in DB.');
                }

                return db_server_row_to_state_row($row);
            }
        }

        if (server_count_for_owner($state, $ownerId) >= max_servers_per_user()) {
            throw new InvalidArgumentException(t('validation_max_servers', ['count' => max_servers_per_user()]));
        }

        $newServerId = $serverId !== '' ? $serverId : generate_server_id();
        $apiKey = generate_api_key();

        $inserted = manage_db_execute(
            'INSERT INTO manage_servers (
                id, owner_id, name, ip, port, max_players, current_players,
                country_code, gamemode, status, notes, api_key, api_key_rotated_at,
                last_heartbeat, created_at, updated_at
            ) VALUES (
                :id, :owner_id, :name, :ip, :port, :max_players, :current_players,
                :country_code, :gamemode, :status, :notes, :api_key, :api_key_rotated_at,
                :last_heartbeat, :created_at, :updated_at
            )',
            [
                ':id' => $newServerId,
                ':owner_id' => $ownerId,
                ':name' => $validated['ip'] . ':' . $validated['port'],
                ':ip' => $validated['ip'],
                ':port' => $validated['port'],
                ':max_players' => 0,
                ':current_players' => 0,
                ':country_code' => $validated['country_code'],
                ':gamemode' => $validated['gamemode'],
                ':status' => $validated['status'],
                ':notes' => $validated['notes'],
                ':api_key' => $apiKey,
                ':api_key_rotated_at' => $nowSql,
                ':last_heartbeat' => null,
                ':created_at' => $nowSql,
                ':updated_at' => $nowSql,
            ]
        );

        if (!$inserted) {
            throw new RuntimeException('Failed to create server in DB.');
        }

        $row = manage_db_fetch_one('SELECT * FROM manage_servers WHERE id = :id LIMIT 1', [':id' => $newServerId]);
        if ($row === null) {
            throw new RuntimeException('Created server not found in DB.');
        }

        return db_server_row_to_state_row($row);
    }

    $existingIndex = $serverId === '' ? null : find_server_index($state, $serverId);

    if ($existingIndex !== null) {
        $existingServer = $state['servers'][$existingIndex];

        if (($existingServer['owner_id'] ?? '') !== $ownerId) {
            throw new InvalidArgumentException(t('validation_permission_edit'));
        }

        $state['servers'][$existingIndex] = array_merge($existingServer, $validated, [
            'updated_at' => $now,
        ]);

        return $state['servers'][$existingIndex];
    }

    if (server_count_for_owner($state, $ownerId) >= max_servers_per_user()) {
        throw new InvalidArgumentException(t('validation_max_servers', ['count' => max_servers_per_user()]));
    }

    $server = array_merge($validated, [
        // Public name and capacity are supplied only by authenticated server heartbeats.
        'name' => $validated['ip'] . ':' . $validated['port'],
        'max_players' => 0,
        'id' => generate_server_id(),
        'owner_id' => $ownerId,
        'current_players' => 0,
        'api_key' => generate_api_key(),
        'api_key_rotated_at' => $now,
        'last_heartbeat' => null,
        'created_at' => $now,
        'updated_at' => $now,
    ]);

    $state['servers'][] = $server;

    return $server;
}

function delete_server_record(array &$state, string $ownerId, string $serverId): bool
{
    if (manage_db_available()) {
        $row = manage_db_fetch_one(
            'SELECT id, owner_id FROM manage_servers WHERE id = :id LIMIT 1',
            [':id' => $serverId]
        );

        if ($row === null || (string) ($row['owner_id'] ?? '') !== $ownerId) {
            return false;
        }

        return manage_db_execute('DELETE FROM manage_servers WHERE id = :id', [':id' => $serverId]);
    }

    $index = find_server_index($state, $serverId);

    if ($index === null) {
        return false;
    }

    if (($state['servers'][$index]['owner_id'] ?? '') !== $ownerId) {
        return false;
    }

    array_splice($state['servers'], $index, 1);

    return true;
}

function rotate_server_api_key(array &$state, string $ownerId, string $serverId): ?array
{
    if (manage_db_available()) {
        $row = manage_db_fetch_one('SELECT * FROM manage_servers WHERE id = :id LIMIT 1', [':id' => $serverId]);

        if ($row === null || (string) ($row['owner_id'] ?? '') !== $ownerId) {
            return null;
        }

        $now = (new DateTimeImmutable())->format(DateTimeInterface::ATOM);
        $updated = manage_db_execute(
            'UPDATE manage_servers
             SET api_key = :api_key,
                 api_key_rotated_at = :api_key_rotated_at,
                 updated_at = :updated_at
             WHERE id = :id',
            [
                ':api_key' => generate_api_key(),
                ':api_key_rotated_at' => atom_to_mysql_datetime($now),
                ':updated_at' => atom_to_mysql_datetime($now),
                ':id' => $serverId,
            ]
        );

        if (!$updated) {
            return null;
        }

        $fresh = manage_db_fetch_one('SELECT * FROM manage_servers WHERE id = :id LIMIT 1', [':id' => $serverId]);
        return $fresh ? db_server_row_to_state_row($fresh) : null;
    }

    $index = find_server_index($state, $serverId);

    if ($index === null || ($state['servers'][$index]['owner_id'] ?? '') !== $ownerId) {
        return null;
    }

    $now = (new DateTimeImmutable())->format(DateTimeInterface::ATOM);
    $state['servers'][$index]['api_key'] = generate_api_key();
    $state['servers'][$index]['api_key_rotated_at'] = $now;
    $state['servers'][$index]['updated_at'] = $now;

    return $state['servers'][$index];
}

function revoke_server_api_key(array &$state, string $ownerId, string $serverId): ?array
{
    if (manage_db_available()) {
        $row = manage_db_fetch_one('SELECT * FROM manage_servers WHERE id = :id LIMIT 1', [':id' => $serverId]);

        if ($row === null || (string) ($row['owner_id'] ?? '') !== $ownerId) {
            return null;
        }

        $now = (new DateTimeImmutable())->format(DateTimeInterface::ATOM);
        $updated = manage_db_execute(
            'UPDATE manage_servers
             SET api_key = :api_key,
                 api_key_rotated_at = :api_key_rotated_at,
                 updated_at = :updated_at
             WHERE id = :id',
            [
                ':api_key' => null,
                ':api_key_rotated_at' => atom_to_mysql_datetime($now),
                ':updated_at' => atom_to_mysql_datetime($now),
                ':id' => $serverId,
            ]
        );

        if (!$updated) {
            return null;
        }

        $fresh = manage_db_fetch_one('SELECT * FROM manage_servers WHERE id = :id LIMIT 1', [':id' => $serverId]);
        return $fresh ? db_server_row_to_state_row($fresh) : null;
    }

    $index = find_server_index($state, $serverId);

    if ($index === null || ($state['servers'][$index]['owner_id'] ?? '') !== $ownerId) {
        return null;
    }

    $now = (new DateTimeImmutable())->format(DateTimeInterface::ATOM);
    $state['servers'][$index]['api_key'] = null;
    $state['servers'][$index]['api_key_rotated_at'] = $now;
    $state['servers'][$index]['updated_at'] = $now;

    return $state['servers'][$index];
}

function mysql_datetime_to_atom(?string $value): ?string
{
    $raw = trim((string) $value);
    if ($raw === '') {
        return null;
    }

    try {
        return (new DateTimeImmutable($raw))->format(DateTimeInterface::ATOM);
    } catch (Throwable $throwable) {
        return null;
    }
}

function atom_to_mysql_datetime(?string $value): string
{
    $raw = trim((string) $value);
    if ($raw === '') {
        return (new DateTimeImmutable())->format('Y-m-d H:i:s');
    }

    try {
        return (new DateTimeImmutable($raw))->format('Y-m-d H:i:s');
    } catch (Throwable $throwable) {
        return (new DateTimeImmutable())->format('Y-m-d H:i:s');
    }
}

function db_server_row_to_state_row(array $row): array
{
    return [
        'id' => (string) ($row['id'] ?? ''),
        'owner_id' => (string) ($row['owner_id'] ?? ''),
        'name' => (string) ($row['name'] ?? ''),
        'ip' => (string) ($row['ip'] ?? ''),
        'port' => (int) ($row['port'] ?? 0),
        'max_players' => (int) ($row['max_players'] ?? 0),
        'current_players' => (int) ($row['current_players'] ?? 0),
        'country_code' => (string) ($row['country_code'] ?? ''),
        'gamemode' => (string) ($row['gamemode'] ?? ''),
        'status' => (string) ($row['status'] ?? 'draft'),
        'notes' => (string) ($row['notes'] ?? ''),
        'api_key' => $row['api_key'] ?? null,
        'api_key_rotated_at' => mysql_datetime_to_atom(isset($row['api_key_rotated_at']) ? (string) $row['api_key_rotated_at'] : null),
        'last_heartbeat' => mysql_datetime_to_atom(isset($row['last_heartbeat']) ? (string) $row['last_heartbeat'] : null),
        'created_at' => mysql_datetime_to_atom(isset($row['created_at']) ? (string) $row['created_at'] : null),
        'updated_at' => mysql_datetime_to_atom(isset($row['updated_at']) ? (string) $row['updated_at'] : null),
    ];
}
