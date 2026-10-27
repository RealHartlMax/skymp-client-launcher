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
$users = array_values(is_array($state['users'] ?? null) ? $state['users'] : []);

if ($users === []) {
    fwrite(STDOUT, "No users found in JSON storage. Nothing to migrate.\n");
    exit(0);
}

$toMysqlDateTime = static function (?string $value): ?string {
    $raw = trim((string) $value);
    if ($raw === '') {
        return null;
    }

    try {
        return (new DateTimeImmutable($raw))->format('Y-m-d H:i:s');
    } catch (Throwable $throwable) {
        return null;
    }
};

$upsertUserSql = 'INSERT INTO manage_users (
        id, login_name, display_name, email, password_hash, password_sha256, provider, email_verified_at, created_at, updated_at
    ) VALUES (
        :id, :login_name, :display_name, :email, :password_hash, :password_sha256, :provider, :email_verified_at, :created_at, :updated_at
    )
    ON DUPLICATE KEY UPDATE
        login_name = VALUES(login_name),
        display_name = VALUES(display_name),
        email = VALUES(email),
        password_hash = VALUES(password_hash),
        password_sha256 = VALUES(password_sha256),
        provider = VALUES(provider),
        email_verified_at = VALUES(email_verified_at),
        updated_at = VALUES(updated_at)';

$insertTokenSql = 'INSERT IGNORE INTO manage_email_verification_tokens (user_id, token_hash, expires_at, consumed_at, created_at)
    VALUES (:user_id, :token_hash, :expires_at, :consumed_at, :created_at)';

if (!manage_db_begin_transaction()) {
    fwrite(STDERR, "Failed to start DB transaction.\n");
    exit(1);
}

$migratedUsers = 0;
$migratedTokens = 0;

foreach ($users as $user) {
    $userId = trim((string) ($user['id'] ?? ''));
    $loginName = normalize_login_name((string) ($user['login_name'] ?? ''));

    if ($userId === '' || $loginName === '') {
        continue;
    }

    $displayName = trim((string) ($user['display_name'] ?? ''));
    if ($displayName === '') {
        $displayName = $loginName;
    }

    $email = normalize_email((string) ($user['email'] ?? ''));
    if ($email === '') {
        $email = $userId . '@invalid.local';
    }

    $passwordHash = (string) ($user['password_hash'] ?? '');
    $passwordSha256 = trim((string) ($user['password_sha256'] ?? ''));

    if ($passwordHash === '' && $passwordSha256 === '') {
        continue;
    }

    $provider = trim((string) ($user['provider'] ?? 'local'));
    if ($provider === '') {
        $provider = 'local';
    }

    $createdAt = $toMysqlDateTime((string) ($user['created_at'] ?? '')) ?? (new DateTimeImmutable())->format('Y-m-d H:i:s');
    $updatedAt = $toMysqlDateTime((string) ($user['updated_at'] ?? '')) ?? $createdAt;
    $emailVerifiedAt = $toMysqlDateTime((string) ($user['email_verified_at'] ?? ''));

    $ok = manage_db_execute($upsertUserSql, [
        ':id' => $userId,
        ':login_name' => $loginName,
        ':display_name' => $displayName,
        ':email' => $email,
        ':password_hash' => $passwordHash,
        ':password_sha256' => $passwordSha256 !== '' ? $passwordSha256 : null,
        ':provider' => $provider,
        ':email_verified_at' => $emailVerifiedAt,
        ':created_at' => $createdAt,
        ':updated_at' => $updatedAt,
    ]);

    if (!$ok) {
        manage_db_rollback();
        fwrite(STDERR, "Failed to upsert user: {$userId}\n");
        exit(1);
    }

    $migratedUsers++;

    $tokenHash = trim((string) ($user['email_verify_token_hash'] ?? ''));
    $tokenExpiresAt = $toMysqlDateTime((string) ($user['email_verify_expires_at'] ?? ''));

    if ($tokenHash !== '' && $tokenExpiresAt !== null) {
        $consumedAt = $emailVerifiedAt;
        $createdTokenAt = $createdAt;

        $tokenOk = manage_db_execute($insertTokenSql, [
            ':user_id' => $userId,
            ':token_hash' => $tokenHash,
            ':expires_at' => $tokenExpiresAt,
            ':consumed_at' => $consumedAt,
            ':created_at' => $createdTokenAt,
        ]);

        if (!$tokenOk) {
            manage_db_rollback();
            fwrite(STDERR, "Failed to insert verification token for user: {$userId}\n");
            exit(1);
        }

        $migratedTokens++;
    }
}

if (!manage_db_commit()) {
    manage_db_rollback();
    fwrite(STDERR, "Failed to commit DB transaction.\n");
    exit(1);
}

fwrite(STDOUT, "Migration completed. Users: {$migratedUsers}, tokens: {$migratedTokens}.\n");
exit(0);
