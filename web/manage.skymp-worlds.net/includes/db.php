<?php

function manage_db_is_enabled(): bool
{
    return (bool) MANAGE_DB_ENABLED;
}

function manage_db_is_configured(): bool
{
    return trim((string) MANAGE_DB_HOST) !== ''
        && trim((string) MANAGE_DB_NAME) !== ''
        && trim((string) MANAGE_DB_USER) !== '';
}

function manage_db_connection(): ?PDO
{
    static $pdo = null;
    static $initialized = false;

    if ($initialized) {
        return $pdo;
    }

    $initialized = true;

    if (!manage_db_is_enabled() || !manage_db_is_configured()) {
        return null;
    }

    if (!class_exists(PDO::class)) {
        return null;
    }

    $charset = trim((string) MANAGE_DB_CHARSET) !== '' ? (string) MANAGE_DB_CHARSET : 'utf8mb4';
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        (string) MANAGE_DB_HOST,
        (int) MANAGE_DB_PORT,
        (string) MANAGE_DB_NAME,
        $charset
    );

    try {
        $pdo = new PDO(
            $dsn,
            (string) MANAGE_DB_USER,
            (string) MANAGE_DB_PASSWORD,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
    } catch (Throwable $throwable) {
        $pdo = null;
    }

    return $pdo;
}

function manage_db_available(): bool
{
    return manage_db_connection() instanceof PDO;
}

function manage_db_fetch_one(string $sql, array $params = []): ?array
{
    $pdo = manage_db_connection();
    if (!$pdo) {
        return null;
    }

    try {
        $statement = $pdo->prepare($sql);
        $statement->execute($params);
        $row = $statement->fetch();
    } catch (Throwable $throwable) {
        return null;
    }

    return is_array($row) ? $row : null;
}

function manage_db_execute(string $sql, array $params = []): bool
{
    $pdo = manage_db_connection();
    if (!$pdo) {
        return false;
    }

    try {
        $statement = $pdo->prepare($sql);
        return $statement->execute($params);
    } catch (Throwable $throwable) {
        return false;
    }
}

function manage_db_fetch_all(string $sql, array $params = []): array
{
    $pdo = manage_db_connection();
    if (!$pdo) {
        return [];
    }

    try {
        $statement = $pdo->prepare($sql);
        $statement->execute($params);
        $rows = $statement->fetchAll();
    } catch (Throwable $throwable) {
        return [];
    }

    return is_array($rows) ? $rows : [];
}

function manage_db_begin_transaction(): bool
{
    $pdo = manage_db_connection();
    if (!$pdo) {
        return false;
    }

    try {
        if ($pdo->inTransaction()) {
            return true;
        }

        return $pdo->beginTransaction();
    } catch (Throwable $throwable) {
        return false;
    }
}

function manage_db_commit(): bool
{
    $pdo = manage_db_connection();
    if (!$pdo) {
        return false;
    }

    try {
        if (!$pdo->inTransaction()) {
            return true;
        }

        return $pdo->commit();
    } catch (Throwable $throwable) {
        return false;
    }
}

function manage_db_rollback(): bool
{
    $pdo = manage_db_connection();
    if (!$pdo) {
        return false;
    }

    try {
        if (!$pdo->inTransaction()) {
            return true;
        }

        return $pdo->rollBack();
    } catch (Throwable $throwable) {
        return false;
    }
}
