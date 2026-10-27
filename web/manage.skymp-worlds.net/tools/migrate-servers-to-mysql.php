<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This script must be run from CLI.\n");
    exit(1);
}

require_once dirname(__DIR__) . '/includes/bootstrap.php';

if (!manage_db_available()) {
    fwrite(STDERR, "Database is not available. Check MANAGE_DB_* config values and schema import.\n");
    exit(1);
}

$state = load_state();
$servers = array_values(is_array($state['servers'] ?? null) ? $state['servers'] : []);

if ($servers === []) {
    fwrite(STDOUT, "No servers found in JSON storage. Nothing to migrate.\n");
    exit(0);
}

$toMysqlDateTime = static function (?string $value): string {
    $raw = trim((string) $value);
    if ($raw === '') {
        return (new DateTimeImmutable())->format('Y-m-d H:i:s');
    }

    try {
        return (new DateTimeImmutable($raw))->format('Y-m-d H:i:s');
    } catch (Throwable $throwable) {
        return (new DateTimeImmutable())->format('Y-m-d H:i:s');
    }
};

$upsertSql = 'INSERT INTO manage_servers (
        id, owner_id, name, ip, port, max_players, current_players, country_code,
        gamemode, status, notes, api_key, api_key_rotated_at, last_heartbeat,
        created_at, updated_at
    ) VALUES (
        :id, :owner_id, :name, :ip, :port, :max_players, :current_players, :country_code,
        :gamemode, :status, :notes, :api_key, :api_key_rotated_at, :last_heartbeat,
        :created_at, :updated_at
    )
    ON DUPLICATE KEY UPDATE
        owner_id = VALUES(owner_id),
        name = VALUES(name),
        ip = VALUES(ip),
        port = VALUES(port),
        max_players = VALUES(max_players),
        current_players = VALUES(current_players),
        country_code = VALUES(country_code),
        gamemode = VALUES(gamemode),
        status = VALUES(status),
        notes = VALUES(notes),
        api_key = VALUES(api_key),
        api_key_rotated_at = VALUES(api_key_rotated_at),
        last_heartbeat = VALUES(last_heartbeat),
        updated_at = VALUES(updated_at)';

if (!manage_db_begin_transaction()) {
    fwrite(STDERR, "Failed to start DB transaction.\n");
    exit(1);
}

$migrated = 0;

foreach ($servers as $server) {
    $id = trim((string) ($server['id'] ?? ''));
    $ownerId = trim((string) ($server['owner_id'] ?? ''));

    if ($id === '' || $ownerId === '') {
        continue;
    }

    $status = trim((string) ($server['status'] ?? 'draft'));
    if (!in_array($status, ['active', 'maintenance', 'draft'], true)) {
        $status = 'draft';
    }

    $ok = manage_db_execute($upsertSql, [
        ':id' => $id,
        ':owner_id' => $ownerId,
        ':name' => trim((string) ($server['name'] ?? 'Unnamed server')),
        ':ip' => trim((string) ($server['ip'] ?? '127.0.0.1')),
        ':port' => (int) ($server['port'] ?? 1),
        ':max_players' => (int) ($server['max_players'] ?? 1),
        ':current_players' => (int) ($server['current_players'] ?? 0),
        ':country_code' => strtoupper(substr(trim((string) ($server['country_code'] ?? 'XX')), 0, 2)),
        ':gamemode' => trim((string) ($server['gamemode'] ?? '')),
        ':status' => $status,
        ':notes' => trim((string) ($server['notes'] ?? '')),
        ':api_key' => trim((string) ($server['api_key'] ?? '')) !== '' ? (string) $server['api_key'] : null,
        ':api_key_rotated_at' => trim((string) ($server['api_key_rotated_at'] ?? '')) !== '' ? $toMysqlDateTime((string) $server['api_key_rotated_at']) : null,
        ':last_heartbeat' => trim((string) ($server['last_heartbeat'] ?? '')) !== '' ? $toMysqlDateTime((string) $server['last_heartbeat']) : null,
        ':created_at' => $toMysqlDateTime((string) ($server['created_at'] ?? '')),
        ':updated_at' => $toMysqlDateTime((string) ($server['updated_at'] ?? '')),
    ]);

    if (!$ok) {
        manage_db_rollback();
        fwrite(STDERR, "Failed to upsert server: {$id}\n");
        exit(1);
    }

    $migrated++;
}

if (!manage_db_commit()) {
    manage_db_rollback();
    fwrite(STDERR, "Failed to commit DB transaction.\n");
    exit(1);
}

fwrite(STDOUT, "Server migration completed. Servers: {$migrated}.\n");
exit(0);
